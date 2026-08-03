// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { z } from "zod";
import { requirePermission } from "../middleware/require-permission.js";
import { httpCache } from "../middleware/http-cache.js";
import "../types.js";

export const correlationRoute = new Hono();

const groupingStrategySchema = z.enum([
  "same_device",
  "same_host_group",
  "same_tag",
  "same_severity",
  "cross_device",
]);
const severitySchema = z.enum(["info", "warning", "critical"]);

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  time_window_seconds: z.number().int().min(60).max(86400).default(300),
  grouping_strategy: groupingStrategySchema.default("same_host_group"),
  tag_key: z.string().max(100).optional(),
  min_severity: severitySchema.default("warning"),
  escalation_threshold: z.number().int().min(2).max(100).default(3),
  escalated_severity: severitySchema.default("critical"),
  suppress_individual: z.boolean().default(true),
  auto_create_incident: z.boolean().default(false),
  send_group_notification: z.boolean().default(true),
  group_channel_ids: z.array(z.string().uuid()).default([]),
  is_active: z.boolean().default(true),
});

// GET /api/v1/correlation/rules — lista regras de correlação
correlationRoute.get("/rules", requirePermission("health:read"), async (c) => {
  const user = c.get("user");
  const activeOnly = c.req.query("active") === "true";

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  if (activeOnly) {
    conditions.push("is_active = true");
  }

  const result = await query(
    `SELECT * FROM public.event_correlation_rules WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    params,
  );

  return c.json({ rules: result.data?.rows ?? [] });
});

// POST /api/v1/correlation/rules — cria regra
correlationRoute.post(
  "/rules",
  requirePermission("health:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = createRuleSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
          },
        },
        400,
      );
    }

    const data = parsed.data;
    const result = await query<{ id: string }>(
      `INSERT INTO public.event_correlation_rules
       (tenant_id, name, description, time_window_seconds, grouping_strategy, tag_key,
        min_severity, escalation_threshold, escalated_severity, suppress_individual,
        auto_create_incident, send_group_notification, group_channel_ids, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.name,
        data.description ?? null,
        data.time_window_seconds,
        data.grouping_strategy,
        data.tag_key ?? null,
        data.min_severity,
        data.escalation_threshold,
        data.escalated_severity,
        data.suppress_individual,
        data.auto_create_incident,
        data.send_group_notification,
        data.group_channel_ids,
        data.is_active,
        user.sub,
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "CREATE_ERROR",
            message: "Erro ao criar regra de correlação",
          },
        },
        500,
      );
    }

    await query(
      "SELECT public.write_audit_log($1, NULL, 'correlation.rule.create', 'event_correlation_rules', NULL, $2, NULL, NULL)",
      [
        user.sub,
        JSON.stringify({ id: result.data.rows[0].id, name: data.name }),
      ],
    );

    return c.json({ id: result.data.rows[0].id }, 201);
  },
);

// PUT /api/v1/correlation/rules/:id — atualiza regra
correlationRoute.put(
  "/rules/:id",
  requirePermission("health:write"),
  async (c) => {
    const ruleId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = createRuleSchema.partial().safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      name: "name",
      description: "description",
      time_window_seconds: "time_window_seconds",
      grouping_strategy: "grouping_strategy",
      tag_key: "tag_key",
      min_severity: "min_severity",
      escalation_threshold: "escalation_threshold",
      escalated_severity: "escalated_severity",
      suppress_individual: "suppress_individual",
      auto_create_incident: "auto_create_incident",
      send_group_notification: "send_group_notification",
      is_active: "is_active",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (data.group_channel_ids !== undefined) {
      updateFields.push(`group_channel_ids = $${paramIdx++}`);
      params.push(data.group_channel_ids);
    }

    if (updateFields.length === 0) {
      return c.json({ id: ruleId });
    }

    params.push(ruleId, user?.tenant_id ?? null);
    await query(
      `UPDATE public.event_correlation_rules SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
      params,
    );

    return c.json({ id: ruleId, updated: true });
  },
);

// DELETE /api/v1/correlation/rules/:id — remove regra
correlationRoute.delete(
  "/rules/:id",
  requirePermission("health:write"),
  async (c) => {
    const ruleId = c.req.param("id");
    const user = c.get("user");

    await query(
      "DELETE FROM public.event_correlation_rules WHERE id = $1 AND tenant_id = $2",
      [ruleId, user?.tenant_id ?? null],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'correlation.rule.delete', 'event_correlation_rules', $2, NULL, NULL, NULL)",
      [user.sub, ruleId],
    );

    return c.json({ deleted: true });
  },
);

// GET /api/v1/correlation/groups — lista grupos de eventos correlacionados
correlationRoute.get(
  "/groups",
  requirePermission("health:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    const severity = c.req.query("severity");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

    const conditions: string[] = ["g.tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (status) {
      conditions.push(`g.status = $${paramIdx++}`);
      params.push(status);
    }
    if (severity) {
      conditions.push(`g.severity = $${paramIdx++}`);
      params.push(severity);
    }
    params.push(limit);

    const result = await query(
      `SELECT g.*, r.name as rule_name, r.grouping_strategy,
       (SELECT COUNT(*) FROM public.event_group_members m WHERE m.group_id = g.id) as member_count
     FROM public.event_groups g
     LEFT JOIN public.event_correlation_rules r ON g.rule_id = r.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY
       CASE g.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
       CASE g.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       g.created_at DESC
     LIMIT $${paramIdx++}`,
      params,
    );

    return c.json({ groups: result.data?.rows ?? [] });
  },
);

// GET /api/v1/correlation/groups/:id — detalhe de um grupo com membros
correlationRoute.get(
  "/groups/:id",
  requirePermission("health:read"),
  async (c) => {
    const groupId = c.req.param("id");
    const user = c.get("user");

    const groupResult = await query(
      `SELECT g.*, r.name as rule_name, r.grouping_strategy, r.description as rule_description
     FROM public.event_groups g
     LEFT JOIN public.event_correlation_rules r ON g.rule_id = r.id
     WHERE g.id = $1 AND g.tenant_id = $2`,
      [groupId, user?.tenant_id ?? null],
    );

    if (!groupResult.data?.rows[0]) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Grupo não encontrado" } },
        404,
      );
    }

    const membersResult = await query(
      `SELECT * FROM public.event_group_members WHERE group_id = $1 ORDER BY event_at DESC`,
      [groupId],
    );

    return c.json({
      group: groupResult.data.rows[0],
      members: membersResult.data?.rows ?? [],
    });
  },
);

// POST /api/v1/correlation/groups/:id/acknowledge — acka um grupo
correlationRoute.post(
  "/groups/:id/acknowledge",
  requirePermission("health:write"),
  async (c) => {
    const groupId = c.req.param("id");
    const user = c.get("user");

    const result = await query(
      "UPDATE public.event_groups SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3 AND status = 'open' RETURNING title",
      [user.sub, groupId, user?.tenant_id ?? null],
    );

    if (!result.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Grupo não encontrado ou não está aberto",
          },
        },
        404,
      );
    }

    await query(
      "SELECT public.write_audit_log($1, NULL, 'correlation.group.ack', 'event_groups', $2, $3, NULL, NULL)",
      [user.sub, groupId, JSON.stringify({ title: result.data.rows[0].title })],
    );

    // Push via WebSocket
    void pushNotificationToTenantSafe(user?.tenant_id ?? null, {
      type: "event_group",
      event: "correlation.group_acknowledged",
      title: "Grupo acknowledged",
      message: result.data.rows[0].title,
      severity: "info",
      timestamp: new Date().toISOString(),
    });

    return c.json({ acknowledged: true });
  },
);

// POST /api/v1/correlation/groups/:id/resolve — resolve um grupo
correlationRoute.post(
  "/groups/:id/resolve",
  requirePermission("health:write"),
  async (c) => {
    const groupId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req
      .json<{ notes?: string }>()
      .catch(() => ({ notes: undefined }));

    const result = await query(
      "UPDATE public.event_groups SET status = 'resolved', resolved_by = $1, resolved_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3 AND status NOT IN ('resolved') RETURNING title, incident_id",
      [user.sub, groupId, user?.tenant_id ?? null],
    );

    if (!result.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Grupo não encontrado ou já resolvido",
          },
        },
        404,
      );
    }

    // Se há incidente vinculado, resolve também
    const incidentId = result.data.rows[0].incident_id;
    if (incidentId) {
      await query(
        "UPDATE public.system_incidents SET status = 'resolved', resolved_at = timezone('utc'::text, now()), resolution_notes = $1 WHERE id = $2",
        [body.notes ?? "Resolvido via correlação de eventos", incidentId],
      );
    }

    await query(
      "SELECT public.write_audit_log($1, NULL, 'correlation.group.resolve', 'event_groups', $2, $3, NULL, NULL)",
      [
        user.sub,
        groupId,
        JSON.stringify({ title: result.data.rows[0].title, notes: body.notes }),
      ],
    );

    return c.json({ resolved: true });
  },
);

// POST /api/v1/correlation/groups/:id/suppress — suprime um grupo
correlationRoute.post(
  "/groups/:id/suppress",
  requirePermission("health:write"),
  async (c) => {
    const groupId = c.req.param("id");
    const user = c.get("user");

    await query(
      "UPDATE public.event_groups SET status = 'suppressed' WHERE id = $1 AND tenant_id = $2 AND status = 'open'",
      [groupId, user?.tenant_id ?? null],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'correlation.group.suppress', 'event_groups', $2, NULL, NULL, NULL)",
      [user.sub, groupId],
    );

    return c.json({ suppressed: true });
  },
);

// GET /api/v1/correlation/stats — estatísticas de correlação
correlationRoute.get(
  "/stats",
  requirePermission("health:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");

    const statsResult = await query(
      `SELECT
       COUNT(*) as total_groups,
       COUNT(*) FILTER (WHERE status = 'open') as open_groups,
       COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged,
       COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
       COUNT(*) FILTER (WHERE status = 'suppressed') as suppressed,
       COUNT(*) FILTER (WHERE status = 'open' AND severity = 'critical') as critical_open,
       COUNT(*) FILTER (WHERE status = 'open' AND severity = 'warning') as warning_open,
       COUNT(*) FILTER (WHERE incident_id IS NOT NULL) as incidents_created,
       COALESCE(SUM(event_count), 0) as total_events_correlated,
       COUNT(*) FILTER (WHERE notification_sent = true) as notifications_sent
     FROM public.event_groups WHERE tenant_id = $1`,
      [user?.tenant_id ?? null],
    );

    const rulesResult = await query(
      "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.event_correlation_rules WHERE tenant_id = $1",
      [user?.tenant_id ?? null],
    );

    // Redução estimada de alertas: eventos agrupados vs notificações enviadas
    const reductionResult = await query(
      `SELECT
       COALESCE(SUM(event_count), 0)::text as total_events,
       COUNT(*)::text as total_groups,
       COUNT(*) FILTER (WHERE notification_sent = true)::text as group_notifications
     FROM public.event_groups WHERE tenant_id = $1 AND created_at >= timezone('utc'::text, now()) - INTERVAL '7 days'`,
      [user?.tenant_id ?? null],
    );

    const reduction = reductionResult.data?.rows[0];
    const totalEvents = parseInt(reduction?.total_events ?? "0", 10);
    const groupNotifications = parseInt(
      reduction?.group_notifications ?? "0",
      10,
    );
    const alertReductionPct =
      totalEvents > 0
        ? Math.round(((totalEvents - groupNotifications) / totalEvents) * 100)
        : 0;

    return c.json({
      stats: statsResult.data?.rows[0] ?? {},
      rules: rulesResult.data?.rows[0] ?? { total: "0", active: "0" },
      alert_reduction_pct: alertReductionPct,
      events_last_7d: totalEvents,
      group_notifications_last_7d: groupNotifications,
    });
  },
);

// Helper seguro para push WebSocket (não quebra se tenant_id for null)
async function pushNotificationToTenantSafe(
  tenantId: string | null,
  payload: {
    type: string;
    event: string;
    title: string;
    message: string;
    severity: string;
    timestamp: string;
  },
): Promise<void> {
  if (!tenantId) return;
  try {
    const { pushNotificationToTenant } = await import("../routes/ws.js");
    void pushNotificationToTenant(tenantId, payload);
  } catch {
    // Silencioso — WebSocket pode não estar disponível
  }
}
