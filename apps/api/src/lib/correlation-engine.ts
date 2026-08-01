// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { query } from "@repo/db";
import { BlindedZabbixClient, decryptTokenParts, type ZabbixProblem } from "@repo/zabbix";
import { pushNotificationToTenant } from "../routes/ws.js";
import { deliverNotification } from "./notification-delivery.js";
import { registerRepeatableJob, startWorker } from "./queue.js";
import { createHash } from "node:crypto";

// Correlation Engine — agrupa alertas Zabbix por janela temporal, host group, tags e severidade
// Reduz alert fatigue: 10 hosts caindo = 1 grupo correlacionado, não 10 alertas separados
// Usa BullMQ com fila durável Redis — sobrevive a restarts e múltiplas réplicas

interface TenantConfig {
  tenant_id: string;
  zabbix_api_url: string;
  zabbix_encrypted_token: string;
  zabbix_token_iv: string;
  zabbix_token_tag: string;
}

interface CorrelationRule {
  id: string;
  tenant_id: string;
  name: string;
  time_window_seconds: number;
  grouping_strategy: "same_device" | "same_host_group" | "same_tag" | "same_severity" | "cross_device";
  tag_key: string | null;
  min_severity: "info" | "warning" | "critical";
  escalation_threshold: number;
  escalated_severity: "info" | "warning" | "critical";
  suppress_individual: boolean;
  auto_create_incident: boolean;
  send_group_notification: boolean;
  group_channel_ids: string[];
}

interface NotificationChannel {
  id: string;
  name: string;
  channel_type: string;
  config: Record<string, unknown>;
}

const QUEUE_NAME = "correlation-engine";
const POLL_INTERVAL_MS = 30_000;

const SEVERITY_ORDER: Record<string, number> = { info: 1, warning: 2, critical: 3 };
const ZABBIX_SEVERITY_MAP: Record<number, "info" | "warning" | "critical"> = {
  0: "info",
  1: "info",
  2: "warning",
  3: "warning",
  4: "critical",
  5: "critical",
};

export async function startCorrelationEngine(): Promise<void> {
  await registerRepeatableJob(
    QUEUE_NAME,
    "poll-and-correlate",
    { every: POLL_INTERVAL_MS },
  );

  startWorker(QUEUE_NAME, async () => {
    try {
      await pollAndCorrelate();
    } catch (err) {
      console.error("[correlation] Erro no poll:", err instanceof Error ? err.message : String(err));
    }
  });

  console.warn("[correlation] Engine iniciada");
}

export function stopCorrelationEngine(): void {
  console.warn("[correlation] Engine parada");
}

async function pollAndCorrelate(): Promise<void> {
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
      await processTenantCorrelation(tenant);
    } catch (err) {
      console.error(`[correlation] Erro tenant ${tenant.tenant_id}:`, err instanceof Error ? err.message : String(err));
    }
  }
}

async function processTenantCorrelation(tenant: TenantConfig): Promise<void> {
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

  // Busca problems ativos não resolvidos
  let problems: ZabbixProblem[];
  try {
    problems = await client.getProblems(undefined, { acknowledged: false });
  } catch {
    return;
  }

  if (!problems.length) return;

  // Busca regras de correlação ativas para este tenant
  const rulesResult = await query<CorrelationRule>(
    `SELECT id, tenant_id, name, time_window_seconds, grouping_strategy, tag_key,
       min_severity, escalation_threshold, escalated_severity,
       suppress_individual, auto_create_incident, send_group_notification, group_channel_ids
     FROM public.event_correlation_rules
     WHERE tenant_id = $1 AND is_active = true`,
    [tenant.tenant_id],
  );

  const rules = rulesResult.data?.rows ?? [];
  if (!rules.length) return;

  // Filtra problems por severidade mínima da regra mais permissiva
  const minSeverityRequired = Math.min(
    ...rules.map((r) => SEVERITY_ORDER[r.min_severity] ?? 2),
  );

  const candidateProblems = problems.filter((p) => {
    const sev = ZABBIX_SEVERITY_MAP[Number(p.severity)] ?? "warning";
    return (SEVERITY_ORDER[sev] ?? 2) >= minSeverityRequired;
  });

  if (!candidateProblems.length) return;

  // Busca eventos já processados (últimas 24h) para evitar reprocessamento
  const processedResult = await query<{ zabbix_event_id: string }>(
    `SELECT DISTINCT zabbix_event_id FROM public.event_group_members
     WHERE tenant_id = $1 AND created_at >= timezone('utc'::text, now()) - INTERVAL '24 hours'`,
    [tenant.tenant_id],
  );
  const processedEventIds = new Set(processedResult.data?.rows.map((r) => r.zabbix_event_id) ?? []);

  // Filtra apenas eventos não processados
  const newProblems = candidateProblems.filter((p) => !processedEventIds.has(p.eventid));

  if (!newProblems.length) return;

  // Processa cada regra
  for (const rule of rules) {
    await processRule(rule, tenant.tenant_id, newProblems, client);
  }
}

async function processRule(
  rule: CorrelationRule,
  tenantId: string,
  problems: ZabbixProblem[],
  _client: BlindedZabbixClient,
): Promise<void> {
  const now = Date.now();
  const windowMs = rule.time_window_seconds * 1000;
  const windowStart = now - windowMs;

  // Filtra problems por severidade mínima da regra
  const ruleProblems = problems.filter((p) => {
    const sev = ZABBIX_SEVERITY_MAP[Number(p.severity)] ?? "warning";
    return (SEVERITY_ORDER[sev] ?? 2) >= (SEVERITY_ORDER[rule.min_severity] ?? 2);
  });

  if (!ruleProblems.length) return;

  // Agrupa problems por chave de correlação
  const groups = groupProblems(ruleProblems, rule, windowStart);

  for (const [groupKey, groupProblems] of groups) {
    if (groupProblems.length < 2) {
      // Evento isolado — não forma grupo, processa normalmente
      await processSingleEvent(rule, tenantId, groupProblems[0]);
      continue;
    }

    // Eventos agrupados — processa como grupo
    await processGroup(rule, tenantId, groupKey, groupProblems);
  }
}

function groupProblems(
  problems: ZabbixProblem[],
  rule: CorrelationRule,
  windowStart: number,
): Map<string, ZabbixProblem[]> {
  const groups = new Map<string, ZabbixProblem[]>();

  for (const problem of problems) {
    const eventTime = Number(problem.clock) * 1000;
    if (eventTime < windowStart) continue;

    const groupKey = computeGroupKey(problem, rule);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(problem);
  }

  return groups;
}

function computeGroupKey(problem: ZabbixProblem, rule: CorrelationRule): string {
  switch (rule.grouping_strategy) {
    case "same_device":
      return `device:${problem.hosts?.[0]?.hostid ?? "unknown"}`;

    case "same_host_group": {
      // Agrupa por prefixo do hostname (assume que hosts do mesmo grupo compartilham prefixo)
      // Ou usa tag 'hostgroup' se disponível
      const hostGroupTag = problem.tags?.find((t) => t.tag === "hostgroup");
      if (hostGroupTag) {
        return `hostgroup:${hostGroupTag.value}`;
      }
      // Fallback: agrupa por primeiro segmento do hostname
      const hostname = problem.hosts?.[0]?.name ?? "unknown";
      const prefix = hostname.split(/[-.]/)[0] ?? hostname;
      return `hostgroup:${prefix}`;
    }

    case "same_tag": {
      if (!rule.tag_key) return `tag:none`;
      const tag = problem.tags?.find((t) => t.tag === rule.tag_key);
      return `tag:${rule.tag_key}:${tag?.value ?? "none"}`;
    }

    case "same_severity": {
      const sev = ZABBIX_SEVERITY_MAP[Number(problem.severity)] ?? "warning";
      return `severity:${sev}`;
    }

    case "cross_device":
      return "cross:all";

    default:
      return `device:${problem.hosts?.[0]?.hostid ?? "unknown"}`;
  }
}

function computeGroupFingerprint(tenantId: string, ruleId: string, groupKey: string): string {
  return createHash("sha256")
    .update(`${tenantId}:${ruleId}:${groupKey}`)
    .digest("hex")
    .substring(0, 32);
}

async function processSingleEvent(
  rule: CorrelationRule,
  tenantId: string,
  problem: ZabbixProblem,
): Promise<void> {
  const severity = ZABBIX_SEVERITY_MAP[Number(problem.severity)] ?? "warning";
  const hostname = problem.hosts?.[0]?.name ?? "Desconhecido";

  // Se suppress_individual está ativo, não envia notificação individual
  // O alerting engine tradicional cuidará disso se suppress_individual = false
  if (rule.suppress_individual) {
    // Registra como membro de grupo singleton para dedup
    const singletonFingerprint = computeGroupFingerprint(tenantId, rule.id, `single:${problem.eventid}`);
    const groupId = await findOrCreateGroup(
      tenantId,
      rule.id,
      singletonFingerprint,
      severity,
      problem.name,
      [hostname],
      [],
      problem.tags ?? [],
      Number(problem.clock) * 1000,
    );

    if (groupId) {
      await addGroupMember(
        groupId,
        tenantId,
        problem.eventid,
        hostname,
        problem.hosts?.[0]?.hostid ?? null,
        problem.name,
        severity,
        problem.tags ?? [],
        Number(problem.clock) * 1000,
        false,
        true, // notification_suppressed
      );
    }
    return;
  }

  // Se não suprime, registra o evento para dedup mas permite notificação individual
  const singletonFingerprint = computeGroupFingerprint(tenantId, rule.id, `single:${problem.eventid}`);
  const groupId = await findOrCreateGroup(
    tenantId,
    rule.id,
    singletonFingerprint,
    severity,
    problem.name,
    [hostname],
    [],
    problem.tags ?? [],
    Number(problem.clock) * 1000,
  );

  if (groupId) {
    await addGroupMember(
      groupId,
      tenantId,
      problem.eventid,
      hostname,
      problem.hosts?.[0]?.hostid ?? null,
      problem.name,
      severity,
      problem.tags ?? [],
      Number(problem.clock) * 1000,
      false,
      false,
    );
  }
}

async function processGroup(
  rule: CorrelationRule,
  tenantId: string,
  groupKey: string,
  groupProblems: ZabbixProblem[],
): Promise<void> {
  const fingerprint = computeGroupFingerprint(tenantId, rule.id, groupKey);

  // Calcula severidade agregada
  const severities = groupProblems.map((p) => ZABBIX_SEVERITY_MAP[Number(p.severity)] ?? "warning");
  const maxSeverity = severities.reduce((max, s) =>
    (SEVERITY_ORDER[s] ?? 2) > (SEVERITY_ORDER[max] ?? 2) ? s : max,
  "info" as "info" | "warning" | "critical");

  // Escala severidade se atingiu threshold
  const finalSeverity = groupProblems.length >= rule.escalation_threshold
    ? rule.escalated_severity
    : maxSeverity;

  // Coleta dispositivos e tags
  const devices = [...new Set(groupProblems.map((p) => p.hosts?.[0]?.name ?? "Desconhecido"))];
  const allTags = groupProblems.flatMap((p) => p.tags ?? []);
  const commonTags = findCommonTags(allTags);

  // Título do grupo
  const title = groupProblems.length === 1
    ? groupProblems[0].name
    : `${groupProblems.length} eventos correlacionados: ${devices.slice(0, 3).join(", ")}${devices.length > 3 ? ` (+${devices.length - 3})` : ""}`;

  const firstEventAt = Math.min(...groupProblems.map((p) => Number(p.clock) * 1000));
  const lastEventAt = Math.max(...groupProblems.map((p) => Number(p.clock) * 1000));

  // Busca ou cria o grupo
  const groupId = await findOrCreateGroup(
    tenantId,
    rule.id,
    fingerprint,
    finalSeverity,
    title,
    devices,
    [],
    commonTags,
    firstEventAt,
    lastEventAt,
  );

  if (!groupId) return;

  // Adiciona cada problema como membro do grupo
  for (const problem of groupProblems) {
    const sev = ZABBIX_SEVERITY_MAP[Number(problem.severity)] ?? "warning";
    const hostname = problem.hosts?.[0]?.name ?? "Desconhecido";

    await addGroupMember(
      groupId,
      tenantId,
      problem.eventid,
      hostname,
      problem.hosts?.[0]?.hostid ?? null,
      problem.name,
      sev,
      problem.tags ?? [],
      Number(problem.clock) * 1000,
      problem.acknowledged === "1",
      rule.suppress_individual,
    );
  }

  // Atualiza contagem e severidade do grupo
  await query(
    `UPDATE public.event_groups
     SET event_count = (SELECT COUNT(*) FROM public.event_group_members WHERE group_id = $1),
         severity = $2,
         last_event_at = timezone('utc'::text, to_timestamp($3 / 1000.0)),
         title = $4,
         affected_devices = $5,
         common_tags = $6
     WHERE id = $1`,
    [groupId, finalSeverity, lastEventAt, title, devices, JSON.stringify(commonTags)],
  );

  // Verifica se precisa escalar e enviar notificação consolidada
  const groupResult = await query<{
    notification_sent: boolean;
    incident_id: string | null;
    event_count: string;
  }>(
    "SELECT notification_sent, incident_id, event_count::text FROM public.event_groups WHERE id = $1",
    [groupId],
  );

  const group = groupResult.data?.rows[0];
  if (!group) return;

  const currentCount = parseInt(group.event_count ?? "0", 10);

  // Envia notificação consolidada se configurado e ainda não enviada
  if (rule.send_group_notification && !group.notification_sent && currentCount >= 2) {
    await sendGroupNotification(rule, tenantId, groupId, title, finalSeverity, devices, currentCount);
    await query("UPDATE public.event_groups SET notification_sent = true WHERE id = $1", [groupId]);
  }

  // Cria incidente automaticamente se configurado e ainda não criado
  if (rule.auto_create_incident && !group.incident_id && currentCount >= rule.escalation_threshold) {
    const incidentId = await createIncidentFromGroup(
      tenantId,
      rule.id,
      groupId,
      title,
      finalSeverity,
      devices,
      currentCount,
    );
    if (incidentId) {
      await query("UPDATE public.event_groups SET incident_id = $1 WHERE id = $2", [incidentId, groupId]);
    }
  }

  // Push via WebSocket para atualizar UI em tempo real
  void pushNotificationToTenant(tenantId, {
    type: "event_group",
    event: "correlation.group_updated",
    title: title,
    message: `${currentCount} eventos correlacionados · Severidade: ${finalSeverity}`,
    severity: finalSeverity,
    timestamp: new Date().toISOString(),
  });
}

async function findOrCreateGroup(
  tenantId: string,
  ruleId: string,
  fingerprint: string,
  severity: "info" | "warning" | "critical",
  title: string,
  devices: string[],
  hostGroups: string[],
  commonTags: { tag: string; value: string }[],
  firstEventAt: number,
  lastEventAt?: number,
): Promise<string | null> {
  // Tenta buscar grupo existente aberto com mesmo fingerprint
  const existingResult = await query<{ id: string }>(
    `SELECT id FROM public.event_groups
     WHERE tenant_id = $1 AND group_fingerprint = $2 AND status = 'open'
     LIMIT 1`,
    [tenantId, fingerprint],
  );

  if (existingResult.data?.rows[0]) {
    return existingResult.data.rows[0].id;
  }

  // Cria novo grupo
  const createResult = await query<{ id: string }>(
    `INSERT INTO public.event_groups
       (tenant_id, rule_id, group_fingerprint, severity, status, title, event_count,
        affected_devices, affected_host_groups, common_tags,
        first_event_at, last_event_at, notification_sent)
     VALUES ($1, $2, $3, $4, 'open', $5, 0, $6, $7, $8,
             timezone('utc'::text, to_timestamp($9 / 1000.0)),
             timezone('utc'::text, to_timestamp($10 / 1000.0)),
             false)
     ON CONFLICT (tenant_id, group_fingerprint) DO UPDATE
       SET status = 'open', updated_at = timezone('utc'::text, now())
     RETURNING id`,
    [
      tenantId, ruleId, fingerprint, severity, title,
      devices, hostGroups, JSON.stringify(commonTags),
      firstEventAt, lastEventAt ?? firstEventAt,
    ],
  );

  return createResult.data?.rows[0]?.id ?? null;
}

async function addGroupMember(
  groupId: string,
  tenantId: string,
  zabbixEventId: string,
  hostname: string | null,
  zabbixHostId: string | null,
  problemName: string,
  severity: "info" | "warning" | "critical",
  tags: { tag: string; value: string }[],
  eventAt: number,
  acknowledged: boolean,
  notificationSuppressed: boolean,
): Promise<void> {
  await query(
    `INSERT INTO public.event_group_members
       (group_id, tenant_id, zabbix_event_id, device_hostname, zabbix_host_id,
        problem_name, severity, tags, event_at, acknowledged, notification_suppressed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             timezone('utc'::text, to_timestamp($9 / 1000.0)), $10, $11)
     ON CONFLICT (group_id, zabbix_event_id) DO NOTHING`,
    [
      groupId, tenantId, zabbixEventId, hostname, zabbixHostId,
      problemName, severity, JSON.stringify(tags),
      eventAt, acknowledged, notificationSuppressed,
    ],
  );
}

function findCommonTags(tags: { tag: string; value: string }[]): { tag: string; value: string }[] {
  if (!tags.length) return [];

  // Conta frequência de cada tag
  const tagCounts = new Map<string, number>();
  const tagValues = new Map<string, { tag: string; value: string }>();

  for (const tag of tags) {
    const key = `${tag.tag}:${tag.value}`;
    tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
    tagValues.set(key, tag);
  }

  // Retorna tags que aparecem em mais de 1 evento
  const result: { tag: string; value: string }[] = [];
  for (const [key, count] of tagCounts) {
    if (count > 1) {
      const tag = tagValues.get(key);
      if (tag) result.push(tag);
    }
  }

  return result;
}

async function sendGroupNotification(
  rule: CorrelationRule,
  tenantId: string,
  groupId: string,
  title: string,
  severity: "info" | "warning" | "critical",
  devices: string[],
  eventCount: number,
): Promise<void> {
  if (!rule.group_channel_ids.length) return;

  // Busca channels
  const channelsResult = await query<NotificationChannel>(
    `SELECT id, name, channel_type, config FROM public.notification_channels
     WHERE id = ANY($1) AND tenant_id = $2 AND is_active = true`,
    [rule.group_channel_ids, tenantId],
  );

  const channels = channelsResult.data?.rows ?? [];
  if (!channels.length) return;

  const subject = `[Correlação] ${severity.toUpperCase()} — ${title}`;
  const body = [
    `Grupo de eventos correlacionados detectado:`,
    ``,
    `Regra: ${rule.name}`,
    `Severidade: ${severity}`,
    `Eventos: ${eventCount}`,
    `Dispositivos afetados: ${devices.join(", ")}`,
    `Grupo ID: ${groupId}`,
    ``,
    `Acesse o painel para visualizar detalhes e ackar o grupo.`,
  ].join("\n");

  for (const channel of channels) {
    const deliveryResult = await deliverNotification(
      channel.channel_type,
      channel.config ?? {},
      subject,
      body,
    );

    // Registra no log de notificações
    await query(
      `INSERT INTO public.notification_log (tenant_id, rule_id, channel_id, event_source, event_category, severity, subject, body, payload, status, sent_at, duration_ms)
       VALUES ($1, NULL, $2, $3, 'correlation', $4, $5, $6, $7, $8, timezone('utc'::text, now()), 0)`,
      [
        tenantId, channel.id,
        "correlation.group", severity,
        subject, body,
        JSON.stringify({ group_id: groupId, event_count: eventCount, devices }),
        deliveryResult.success ? "sent" : "failed",
      ],
    );
  }
}

async function createIncidentFromGroup(
  tenantId: string,
  ruleId: string,
  groupId: string,
  title: string,
  severity: "info" | "warning" | "critical",
  devices: string[],
  eventCount: number,
): Promise<string | null> {
  // Mapeia severity do sistema para severity do incidente
  const incidentSeverity = severity === "critical" ? "critical" : severity === "warning" ? "major" : "info";

  // Gera número do incidente
  const numResult = await query<{ generate_incident_number: string }>(
    "SELECT public.generate_incident_number($1) as generate_incident_number",
    [tenantId],
  );

  const incidentNumber = numResult.data?.rows[0]?.generate_incident_number;
  if (!incidentNumber) return null;

  const description = [
    `Incidente criado automaticamente pela engine de correlação de eventos.`,
    ``,
    `Regra de correlação: ${ruleId}`,
    `Grupo de eventos: ${groupId}`,
    `Total de eventos correlacionados: ${eventCount}`,
    `Dispositivos afetados: ${devices.join(", ")}`,
    `Severidade agregada: ${severity}`,
  ].join("\n");

  const result = await query<{ id: string }>(
    `INSERT INTO public.system_incidents
       (tenant_id, incident_number, title, description, severity, status, affected_services, impact, started_at)
     VALUES ($1, $2, $3, $4, $5, 'investigating', $6, $7, timezone('utc'::text, now()))
     RETURNING id`,
    [
      tenantId, incidentNumber, title, description,
      incidentSeverity,
      JSON.stringify(devices),
      severity === "critical" ? "severe" : "moderate",
    ],
  );

  const incidentId = result.data?.rows[0]?.id ?? null;

  if (incidentId) {
    await query(
      "SELECT public.write_audit_log(NULL, $1, 'incident.auto_create', 'system_incidents', NULL, $2, NULL, NULL)",
      [
        tenantId,
        JSON.stringify({ incident_id: incidentId, group_id: groupId, rule_id: ruleId, event_count: eventCount }),
      ],
    );
  }

  return incidentId;
}
