// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { correlationRuleSchema } from "@repo/shared-validation";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const correlationRoute = new Hono();

// GET /api/v1/correlation — overview do modulo
correlationRoute.get(
  "/",
  requirePermission("health:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 2 queries independentes
      const [rulesResult, groupsResult] = await Promise.all([
        query(
          "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.correlation_rules WHERE tenant_id = $1",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'open') as open FROM public.correlation_groups WHERE tenant_id = $1",
          [tenantId],
        ),
      ]);

      return c.json({
        overview: {
          rules: rulesResult.data?.rows[0] ?? { total: "0", active: "0" },
          groups: groupsResult.data?.rows[0] ?? { total: "0", open: "0" },
        },
        endpoints: ["/rules", "/rules/:id", "/groups", "/groups/:id", "/stats"],
      });
    } catch (error) {
      logger.error("Erro ao buscar correlation overview", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/correlation/rules — lista regras de correlacao
correlationRoute.get(
  "/rules",
  requirePermission("health:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const activeOnly = c.req.query("active") === "true";

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    if (activeOnly) {
      conditions.push("is_active = true");
    }

    try {
      const result = await query(
        `SELECT * FROM public.event_correlation_rules WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
        params,
      );

      return c.json({ rules: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar correlation rules", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/correlation/rules — cria regra
correlationRoute.post(
  "/rules",
  requirePermission("health:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const tenantId = user?.tenant_id ?? null;

    try {
      const body = await c.req.json();
      const parsed = correlationRuleSchema.safeParse(body);
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
          tenantId,
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
          userId,
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

      const ruleId = result.data.rows[0].id;

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "correlation.rule.create",
            entityType: "event_correlation_rules",
            entityId: ruleId,
            newData: { id: ruleId, name: data.name },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Correlation rule criada", {
        ruleId,
        name: data.name,
        tenantId,
      });

      return c.json({ id: ruleId }, 201);
    } catch (error) {
      logger.error("Erro ao criar correlation rule", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar" } },
        500,
      );
    }
  },
);

// PUT /api/v1/correlation/rules/:id — atualiza regra
correlationRoute.put(
  "/rules/:id",
  requirePermission("health:write"),
  rateLimitWrite,
  async (c) => {
    const ruleId = c.req.param("id");
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const tenantId = user?.tenant_id ?? null;

    try {
      const body = await c.req.json();
      const parsed = correlationRuleSchema.partial().safeParse(body);
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

      params.push(ruleId, tenantId);
      const result = await query<{ title: string }>(
        `UPDATE public.event_correlation_rules SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++} RETURNING name`,
        params,
      );

      if (!result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Regra não encontrada" } },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "correlation.rule.update",
            entityType: "event_correlation_rules",
            entityId: ruleId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Correlation rule atualizada", { ruleId, tenantId });

      return c.json({ id: ruleId, updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar correlation rule", {
        ruleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// DELETE /api/v1/correlation/rules/:id — remove regra
correlationRoute.delete(
  "/rules/:id",
  requirePermission("health:write"),
  rateLimitWrite,
  async (c) => {
    const ruleId = c.req.param("id");
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.event_correlation_rules WHERE id = $1 AND tenant_id = $2",
        [ruleId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Regra não encontrada" } },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "correlation.rule.delete",
            entityType: "event_correlation_rules",
            entityId: ruleId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Correlation rule removida", { ruleId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover correlation rule", {
        ruleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover" } },
        500,
      );
    }
  },
);

// GET /api/v1/correlation/groups — lista grupos de eventos correlacionados
correlationRoute.get(
  "/groups",
  requirePermission("health:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const status = c.req.query("status");
    const severity = c.req.query("severity");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

    const conditions: string[] = ["g.tenant_id = $1"];
    const params: unknown[] = [tenantId];
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

    try {
      // Corrigido N+1: LEFT JOIN + agregacao em vez de subquery por linha
      const result = await query(
        `SELECT g.*, r.name as rule_name, r.grouping_strategy,
           COALESCE(gm.member_count, 0) as member_count
         FROM public.event_groups g
         LEFT JOIN public.event_correlation_rules r ON g.rule_id = r.id
         LEFT JOIN (
           SELECT group_id, COUNT(*) as member_count
           FROM public.event_group_members
           GROUP BY group_id
         ) gm ON gm.group_id = g.id
         WHERE ${conditions.join(" AND ")}
         ORDER BY
           CASE g.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
           CASE g.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
           g.created_at DESC
         LIMIT $${paramIdx++}`,
        params,
      );

      return c.json({ groups: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar correlation groups", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/correlation/groups/:id — detalhe de um grupo com membros
correlationRoute.get(
  "/groups/:id",
  requirePermission("health:read"),
  httpCache(15),
  async (c) => {
    const groupId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 2 queries independentes (group + members)
      const [groupResult, membersResult] = await Promise.all([
        query(
          `SELECT g.*, r.name as rule_name, r.grouping_strategy, r.description as rule_description
           FROM public.event_groups g
           LEFT JOIN public.event_correlation_rules r ON g.rule_id = r.id
           WHERE g.id = $1 AND g.tenant_id = $2`,
          [groupId, tenantId],
        ),
        query(
          `SELECT * FROM public.event_group_members WHERE group_id = $1 ORDER BY event_at DESC`,
          [groupId],
        ),
      ]);

      if (!groupResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Grupo não encontrado" } },
          404,
        );
      }

      return c.json({
        group: groupResult.data.rows[0],
        members: membersResult.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar correlation group detail", {
        groupId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/correlation/groups/:id/acknowledge — acka um grupo
correlationRoute.post(
  "/groups/:id/acknowledge",
  requirePermission("health:write"),
  rateLimitWrite,
  async (c) => {
    const groupId = c.req.param("id");
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query<{ title: string }>(
        "UPDATE public.event_groups SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3 AND status = 'open' RETURNING title",
        [userId, groupId, tenantId],
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

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "correlation.group.ack",
            entityType: "event_groups",
            entityId: groupId,
            newData: { title: result.data.rows[0].title },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      // Push via WebSocket
      void pushNotificationToTenantSafe(tenantId, {
        type: "event_group",
        event: "correlation.group_acknowledged",
        title: "Grupo acknowledged",
        message: result.data.rows[0].title as string,
        severity: "info",
        timestamp: new Date().toISOString(),
      });

      logger.info("Correlation group acknowledged", { groupId, tenantId });

      return c.json({ acknowledged: true });
    } catch (error) {
      logger.error("Erro ao acknowledge correlation group", {
        groupId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao reconhecer" } },
        500,
      );
    }
  },
);

// POST /api/v1/correlation/groups/:id/resolve — resolve um grupo
correlationRoute.post(
  "/groups/:id/resolve",
  requirePermission("health:write"),
  rateLimitWrite,
  async (c) => {
    const groupId = c.req.param("id");
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const tenantId = user?.tenant_id ?? null;

    try {
      const body = await c.req
        .json<{ notes?: string }>()
        .catch(() => ({ notes: undefined }));

      const result = await query<{ title: string; incident_id: string | null }>(
        "UPDATE public.event_groups SET status = 'resolved', resolved_by = $1, resolved_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3 AND status NOT IN ('resolved') RETURNING title, incident_id",
        [userId, groupId, tenantId],
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

      // Se ha incidente vinculado, resolve tambem
      const incidentId = result.data.rows[0].incident_id;
      if (incidentId) {
        await query(
          "UPDATE public.system_incidents SET status = 'resolved', resolved_at = timezone('utc'::text, now()), resolution_notes = $1 WHERE id = $2",
          [body.notes ?? "Resolvido via correlação de eventos", incidentId],
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "correlation.group.resolve",
            entityType: "event_groups",
            entityId: groupId,
            newData: {
              title: result.data.rows[0].title,
              notes: body.notes,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Correlation group resolvido", { groupId, tenantId });

      return c.json({ resolved: true });
    } catch (error) {
      logger.error("Erro ao resolver correlation group", {
        groupId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao resolver" } },
        500,
      );
    }
  },
);

// POST /api/v1/correlation/groups/:id/suppress — suprime um grupo
correlationRoute.post(
  "/groups/:id/suppress",
  requirePermission("health:write"),
  rateLimitWrite,
  async (c) => {
    const groupId = c.req.param("id");
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "UPDATE public.event_groups SET status = 'suppressed' WHERE id = $1 AND tenant_id = $2 AND status = 'open'",
        [groupId, tenantId],
      );

      if (result.data?.rowCount === 0) {
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

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "correlation.group.suppress",
            entityType: "event_groups",
            entityId: groupId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Correlation group suprimido", { groupId, tenantId });

      return c.json({ suppressed: true });
    } catch (error) {
      logger.error("Erro ao suprimir correlation group", {
        groupId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao suprimir" } },
        500,
      );
    }
  },
);

// GET /api/v1/correlation/stats — estatisticas de correlacao
correlationRoute.get(
  "/stats",
  requirePermission("health:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 3 queries independentes
      const [statsResult, rulesResult, reductionResult] = await Promise.all([
        query(
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
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.event_correlation_rules WHERE tenant_id = $1",
          [tenantId],
        ),
        query(
          `SELECT
           COALESCE(SUM(event_count), 0)::text as total_events,
           COUNT(*)::text as total_groups,
           COUNT(*) FILTER (WHERE notification_sent = true)::text as group_notifications
           FROM public.event_groups WHERE tenant_id = $1 AND created_at >= timezone('utc'::text, now()) - INTERVAL '7 days'`,
          [tenantId],
        ),
      ]);

      const reduction = reductionResult.data?.rows[0] as
        | {
            total_events: string;
            total_groups: string;
            group_notifications: string;
          }
        | undefined;
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
    } catch (error) {
      logger.error("Erro ao buscar correlation stats", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// Helper seguro para push WebSocket (nao quebra se tenant_id for null)
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
    // Silencioso — WebSocket pode nao estar disponivel
  }
}
