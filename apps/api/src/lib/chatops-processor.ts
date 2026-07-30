// ChatOps command processor — processa comandos recebidos via Slack/Teams
import { query } from "@repo/db";

export interface ChatOpsCommand {
  command: string;
  args: string[];
  rawText: string;
}

export interface ChatOpsResult {
  text: string;
  blocks?: Record<string, unknown>[];
  success: boolean;
  error?: string;
}

export async function processChatOpsCommand(
  tenantId: string,
  cmd: ChatOpsCommand,
): Promise<ChatOpsResult> {
  const { command, args } = cmd;

  switch (command) {
    case "status":
      return processStatus(tenantId);
    case "incidents":
      return processIncidents(tenantId, args);
    case "ack":
      return processAck(tenantId, args);
    case "resolve":
      return processResolve(tenantId, args);
    case "services":
      return processServices(tenantId);
    case "silence":
      return processSilence(tenantId, args);
    default:
      return {
        text: `Comando desconhecido: ${command}\nComandos disponíveis: status, incidents, ack, resolve, services, silence`,
        success: false,
        error: "UNKNOWN_COMMAND",
      };
  }
}

async function processStatus(tenantId: string): Promise<ChatOpsResult> {
  const servicesResult = await query(
    `SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'operational') as operational,
       COUNT(*) FILTER (WHERE status = 'degraded') as degraded,
       COUNT(*) FILTER (WHERE status = 'down') as down
     FROM public.services WHERE tenant_id = $1 AND is_active = true`,
    [tenantId],
  );

  const incidentsResult = await query(
    `SELECT COUNT(*) as open,
       COUNT(*) FILTER (WHERE severity = 'critical') as critical
     FROM public.service_incidents WHERE tenant_id = $1 AND status NOT IN ('resolved')`,
    [tenantId],
  );

  const svc = servicesResult.data?.rows[0] ?? {};
  const inc = incidentsResult.data?.rows[0] ?? {};

  const text = [
    `*Status do Sistema*`,
    ``,
    `Serviços: ${svc.operational ?? "0"} OK / ${svc.degraded ?? "0"} degradados / ${svc.down ?? "0"} down (total: ${svc.total ?? "0"})`,
    `Incidentes abertos: ${inc.open ?? "0"} (${inc.critical ?? "0"} críticos)`,
  ].join("\n");

  return { text, success: true };
}

async function processIncidents(tenantId: string, args: string[]): Promise<ChatOpsResult> {
  const limit = args[0] ? Math.min(parseInt(args[0], 10) || 5, 20) : 5;

  const result = await query(
    `SELECT id, title, severity, status, started_at
     FROM public.service_incidents
     WHERE tenant_id = $1 AND status NOT IN ('resolved')
     ORDER BY started_at DESC LIMIT $2`,
    [tenantId, limit],
  );

  const incidents = result.data?.rows ?? [];
  if (incidents.length === 0) {
    return { text: "Nenhum incidente aberto. Tudo sob controle!", success: true };
  }

  const lines = incidents.map((inc: Record<string, unknown>) =>
    `• [${(inc.severity as string)?.toUpperCase()}] ${inc.title} — ${inc.status} (${new Date(inc.started_at as string).toLocaleString("pt-BR")})`,
  );

  return {
    text: `*Incidentes Abertos (${incidents.length})*\n${lines.join("\n")}`,
    success: true,
  };
}

async function processAck(tenantId: string, args: string[]): Promise<ChatOpsResult> {
  if (!args[0]) {
    return { text: "Uso: ack <incident_id>", success: false, error: "MISSING_ARG" };
  }

  const incidentId = args[0];
  const result = await query(
    "UPDATE public.service_incidents SET status = 'identified' WHERE id = $1 AND tenant_id = $2 RETURNING title",
    [incidentId, tenantId],
  );

  if (!result.data?.rows[0]) {
    return { text: `Incidente ${incidentId} não encontrado`, success: false, error: "NOT_FOUND" };
  }

  return { text: `Incidente reconhecido: ${result.data.rows[0].title}`, success: true };
}

async function processResolve(tenantId: string, args: string[]): Promise<ChatOpsResult> {
  if (!args[0]) {
    return { text: "Uso: resolve <incident_id>", success: false, error: "MISSING_ARG" };
  }

  const incidentId = args[0];
  const result = await query(
    "UPDATE public.service_incidents SET status = 'resolved', resolved_at = timezone('utc'::text, now()) WHERE id = $1 AND tenant_id = $2 RETURNING title",
    [incidentId, tenantId],
  );

  if (!result.data?.rows[0]) {
    return { text: `Incidente ${incidentId} não encontrado`, success: false, error: "NOT_FOUND" };
  }

  return { text: `Incidente resolvido: ${result.data.rows[0].title}`, success: true };
}

async function processServices(tenantId: string): Promise<ChatOpsResult> {
  const result = await query(
    `SELECT name, status, priority FROM public.services WHERE tenant_id = $1 AND is_active = true ORDER BY priority DESC, name ASC LIMIT 10`,
    [tenantId],
  );

  const services = result.data?.rows ?? [];
  if (services.length === 0) {
    return { text: "Nenhum serviço cadastrado", success: true };
  }

  const statusEmoji: Record<string, string> = {
    operational: "OK",
    degraded: "DEG",
    down: "DOWN",
    maintenance: "MAN",
  };

  const lines = services.map((s: Record<string, unknown>) =>
    `• [${statusEmoji[s.status as string] ?? "—"}] ${s.name} (${s.priority})`,
  );

  return {
    text: `*Serviços (${services.length})*\n${lines.join("\n")}`,
    success: true,
  };
}

async function processSilence(tenantId: string, args: string[]): Promise<ChatOpsResult> {
  if (!args[0]) {
    return { text: "Uso: silence <duration_minutes> [reason]", success: false, error: "MISSING_ARG" };
  }

  const duration = parseInt(args[0], 10);
  if (isNaN(duration) || duration <= 0) {
    return { text: "Duracao deve ser um numero positivo de minutos", success: false, error: "INVALID_ARG" };
  }

  const reason = args.slice(1).join(" ") || "Silenciado via ChatOps";

  // Cria uma janela de manutencao de silenciamento
  const endTime = new Date(Date.now() + duration * 60 * 1000).toISOString();

  await query(
    `INSERT INTO public.maintenance_windows (tenant_id, name, description, start_at, end_at, status, maintenance_type)
     VALUES ($1, $2, $3, timezone('utc'::text, now()), $4, 'scheduled', 'maintenance')`,
    [tenantId, `Silenciado via ChatOps — ${reason}`, reason, endTime],
  );

  return {
    text: `Alertas silenciados por ${duration} minutos. Motivo: ${reason}`,
    success: true,
  };
}
