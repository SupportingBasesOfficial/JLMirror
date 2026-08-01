// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { query } from "@repo/db";
import { BlindedZabbixClient, decryptTokenParts, type ZabbixProblem } from "@repo/zabbix";
import { pushNotificationToTenant } from "../routes/ws.js";
import { deliverNotification } from "./notification-delivery.js";
import { registerRepeatableJob, startWorker } from "./queue.js";

// Alerting Engine — monitora Zabbix problems e dispara notifications baseado em rules
// Usa BullMQ com fila durável Redis — sobrevive a restarts e múltiplas réplicas

interface TenantConfig {
  tenant_id: string;
  zabbix_api_url: string;
  zabbix_encrypted_token: string;
  zabbix_token_iv: string;
  zabbix_token_tag: string;
}

interface NotificationRule {
  id: string;
  tenant_id: string;
  name: string;
  event_source: string;
  event_category: string;
  severity_filter: string;
  channel_ids: string[];
  template_subject: string | null;
  template_body: string | null;
  cooldown_minutes: number;
}

interface NotificationChannel {
  id: string;
  name: string;
  channel_type: string;
  config: Record<string, unknown>;
}

const QUEUE_NAME = "alerting-engine";
const POLL_INTERVAL_MS = 60_000;

export async function startAlertingEngine(): Promise<void> {
  await registerRepeatableJob(
    QUEUE_NAME,
    "poll-zabbix-alerts",
    { every: POLL_INTERVAL_MS },
  );

  startWorker(QUEUE_NAME, async () => {
    try {
      await pollZabbixAndAlert();
    } catch (err) {
      console.error("[alerting] Erro no poll:", err instanceof Error ? err.message : String(err));
    }
  });
}

export function stopAlertingEngine(): void {
  // Workers e filas são fechados centralmente por stopAllQueues no lifecycle
  console.warn("[alerting] Engine parada");
}

async function pollZabbixAndAlert(): Promise<void> {
  // Busca todos os tenants com Zabbix configurado
  const tenantsResult = await query<TenantConfig>(
    `SELECT t.id as tenant_id, tr.zabbix_api_url, tr.zabbix_encrypted_token, tr.zabbix_token_iv, tr.zabbix_token_tag
     FROM public.tenants t
     JOIN public.tenant_routes tr ON t.id = tr.tenant_id
     WHERE t.status = 'active'
       AND tr.zabbix_encrypted_token IS NOT NULL
       AND tr.zabbix_token_iv IS NOT NULL
       AND tr.zabbix_token_tag IS NOT NULL`,
    [],
  );

  if (tenantsResult.error || !tenantsResult.data?.rows.length) return;

  for (const tenant of tenantsResult.data.rows) {
    try {
      await processTenantAlerts(tenant);
    } catch (err) {
      console.error(`[alerting] Erro tenant ${tenant.tenant_id}:`, err instanceof Error ? err.message : String(err));
    }
  }
}

async function processTenantAlerts(tenant: TenantConfig): Promise<void> {
  const apiToken = decryptTokenParts(
    tenant.zabbix_encrypted_token,
    tenant.zabbix_token_iv,
    tenant.zabbix_token_tag,
  );

  if (!apiToken) return;

  const client = new BlindedZabbixClient({
    apiUrl: tenant.zabbix_api_url,
    apiToken,
  });

  // Busca problems ativos (nao resolvidos)
  let problems: ZabbixProblem[];
  try {
    problems = await client.getProblems(undefined, { acknowledged: false });
  } catch {
    return; // Silencioso — Zabbix pode estar indisponivel
  }

  if (!problems.length) return;

  // Busca problems ja processados (ultimos 24h) para evitar duplicatas
  const processedResult = await query<{ fingerprint: string }>(
    `SELECT DISTINCT payload->>'fingerprint' as fingerprint
     FROM public.notification_log
     WHERE tenant_id = $1
       AND sent_at >= timezone('utc'::text, now()) - INTERVAL '24 hours'
       AND payload->>'fingerprint' IS NOT NULL`,
    [tenant.tenant_id],
  );
  const processed = new Set(processedResult.data?.rows.map((r) => r.fingerprint) ?? []);

  // Busca rules ativas que matchem monitoring events
  const rulesResult = await query<NotificationRule>(
    `SELECT id, tenant_id, name, event_source, event_category, severity_filter,
       channel_ids, template_subject, template_body, cooldown_minutes
     FROM public.notification_rules
     WHERE tenant_id = $1 AND is_active = true
       AND event_source LIKE 'monitoring.%'`,
    [tenant.tenant_id],
  );

  const rules = rulesResult.data?.rows ?? [];
  if (!rules.length) return;

  // Coleta todos os channel_ids unicos de todas as rules para batch fetch
  const allChannelIds = [...new Set(rules.flatMap((r) => r.channel_ids))];
  const channelsMap = new Map<string, NotificationChannel>();

  if (allChannelIds.length > 0) {
    const channelsResult = await query<NotificationChannel>(
      `SELECT id, name, channel_type, config FROM public.notification_channels
       WHERE id = ANY($1) AND tenant_id = $2 AND is_active = true`,
      [allChannelIds, tenant.tenant_id],
    );
    for (const ch of channelsResult.data?.rows ?? []) {
      channelsMap.set(ch.id, ch);
    }
  }

  for (const problem of problems) {
    const fingerprint = `${tenant.tenant_id}:${problem.eventid}`;
    if (processed.has(fingerprint)) continue;

    // Mapeia severidade Zabbix (0-5) para severity do sistema
    const severity = mapZabbixSeverity(problem.severity);
    const eventSource = `monitoring.${severity === "critical" ? "service_down" : "cpu_high"}`;

    // Encontra rules que matchem
    const matchingRules = rules.filter(
      (r) => r.severity_filter === "all" || r.severity_filter === severity,
    );

    if (!matchingRules.length) continue;

    const subject = `[Zabbix] ${problem.name}`;
    const bodyText = `Problema detectado no Zabbix:\n\nHost: ${problem.hosts?.[0]?.name ?? "—"}\nSeveridade: ${severity}\nEvento ID: ${problem.eventid}\nTimestamp: ${new Date(Number(problem.clock) * 1000).toISOString()}\n\n${problem.name}`;

    for (const rule of matchingRules) {
      // Verifica cooldown
      const cooldownOk = await query<{ check_rule_cooldown: boolean }>(
        "SELECT public.check_rule_cooldown($1) as check_rule_cooldown",
        [rule.id],
      );
      if (!cooldownOk.data?.rows[0]?.check_rule_cooldown) continue;

      // Atualiza trigger count
      await query(
        "UPDATE public.notification_rules SET last_triggered_at = timezone('utc'::text, now()), trigger_count = trigger_count + 1 WHERE id = $1",
        [rule.id],
      );

      // Busca channels do mapa pre-carregado
      for (const channelId of rule.channel_ids) {
        const channel = channelsMap.get(channelId);
        if (!channel) continue;

        const finalSubject = rule.template_subject ?? subject;
        const finalBody = rule.template_body ?? bodyText;

        // Envia via deliverNotification (importado diretamente de lib/notification-delivery)
        const deliveryResult = await deliverNotification(
          channel.channel_type,
          channel.config ?? {},
          finalSubject,
          finalBody,
        );

        // Registra no log
        await query(
          `INSERT INTO public.notification_log (tenant_id, rule_id, channel_id, event_source, event_category, severity, subject, body, payload, status, sent_at, duration_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, timezone('utc'::text, now()), 0)`,
          [
            tenant.tenant_id, rule.id, channelId,
            eventSource, "monitoring", severity,
            finalSubject, finalBody,
            JSON.stringify({ fingerprint, zabbix_event_id: problem.eventid, problem_name: problem.name }),
            deliveryResult.success ? "sent" : "failed",
          ],
        );

        // Push via WebSocket
        if (deliveryResult.success) {
          void pushNotificationToTenant(tenant.tenant_id, {
            type: "notification",
            event: eventSource,
            title: finalSubject,
            message: finalBody.substring(0, 200),
            severity,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Marca fingerprint como processado
      processed.add(fingerprint);
    }
  }
}

function mapZabbixSeverity(zabbixSeverity: string): "info" | "warning" | "critical" {
  const sev = Number(zabbixSeverity);
  if (sev >= 4) return "critical";
  if (sev >= 2) return "warning";
  return "info";
}
