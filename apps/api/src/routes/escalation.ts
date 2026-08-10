// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { z } from "zod";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import { deliverNotification } from "../lib/notification-delivery.js";
import "../types.js";

export const escalationRoute = new Hono();

// GET /api/v1/escalation — overview do modulo
escalationRoute.get("/", requirePermission("health:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const policiesResult = await query(
      "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.alert_escalation_policies WHERE tenant_id = $1",
      [tenantId],
    );

    return c.json({
      overview: {
        policies: policiesResult.data?.rows[0] ?? { total: "0", active: "0" },
      },
      endpoints: ["/policies", "/policies/:id", "/instances"],
    });
  } catch (error) {
    logger.error("Erro ao buscar overview de escalonamento", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

const createPolicySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  event_source: z.string().min(1).max(100),
  severity_filter: z
    .enum(["all", "info", "warning", "critical"])
    .default("critical"),
  repeat_count: z.number().int().min(1).max(10).default(3),
  repeat_interval_minutes: z.number().int().min(1).max(1440).default(5),
  is_active: z.boolean().default(true),
  steps: z
    .array(
      z.object({
        tier: z.number().int().min(1).max(10),
        delay_minutes: z.number().int().min(0).max(1440).default(0),
        channel_ids: z.array(z.string().uuid()).min(1),
        template_subject: z.string().max(500).optional(),
        template_body: z.string().max(5000).optional(),
      }),
    )
    .min(1),
});

const updatePolicySchema = createPolicySchema.partial();

// GET /api/v1/escalation/policies — lista políticas de escalonamento
escalationRoute.get(
  "/policies",
  requirePermission("notifications:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `SELECT p.*, 
         (SELECT json_agg(row_to_json(s)) FROM public.alert_escalation_steps s WHERE s.policy_id = p.id) as steps
       FROM public.alert_escalation_policies p
       WHERE p.tenant_id = $1
       ORDER BY p.created_at DESC`,
        [tenantId],
      );

      return c.json({ policies: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar politicas de escalonamento", {
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

// POST /api/v1/escalation/policies — cria política com steps
escalationRoute.post(
  "/policies",
  requirePermission("notifications:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const bodyResult = await safeJsonBody(c);
      if (!bodyResult.success) return bodyResult.response;
      const parsed = createPolicySchema.safeParse(bodyResult.data);
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

      const policyResult = await query<{ id: string }>(
        `INSERT INTO public.alert_escalation_policies (tenant_id, name, description, event_source, severity_filter, repeat_count, repeat_interval_minutes, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          tenantId,
          data.name,
          data.description ?? null,
          data.event_source,
          data.severity_filter,
          data.repeat_count,
          data.repeat_interval_minutes,
          data.is_active,
          userId,
        ],
      );

      const policyId = policyResult.data?.rows[0]?.id;
      if (!policyId) {
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao criar política" },
          },
          500,
        );
      }

      for (const step of data.steps) {
        await query(
          `INSERT INTO public.alert_escalation_steps (policy_id, tier, delay_minutes, channel_ids, template_subject, template_body)
         VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            policyId,
            step.tier,
            step.delay_minutes,
            step.channel_ids,
            step.template_subject ?? null,
            step.template_body ?? null,
          ],
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "escalation.policy.create",
            entityType: "alert_escalation_policies",
            entityId: null,
            newData: {
              id: policyId,
              name: data.name,
              steps: data.steps.length,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ id: policyId, created: true }, 201);
    } catch (error) {
      logger.error("Erro ao criar politica de escalonamento", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar política" } },
        500,
      );
    }
  },
);

// PUT /api/v1/escalation/policies/:id — atualiza política
escalationRoute.put(
  "/policies/:id",
  requirePermission("notifications:write"),
  async (c) => {
    const policyId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const bodyResult = await safeJsonBody(c);
      if (!bodyResult.success) return bodyResult.response;
      const parsed = updatePolicySchema.safeParse(bodyResult.data);
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
        event_source: "event_source",
        severity_filter: "severity_filter",
        repeat_count: "repeat_count",
        repeat_interval_minutes: "repeat_interval_minutes",
        is_active: "is_active",
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (data[key as keyof typeof data] !== undefined) {
          updateFields.push(`${dbField} = $${paramIdx++}`);
          params.push(data[key as keyof typeof data]);
        }
      }

      if (updateFields.length > 0) {
        params.push(policyId, tenantId);
        await query(
          `UPDATE public.alert_escalation_policies SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
          params,
        );
      }

      if (data.steps) {
        await query(
          "DELETE FROM public.alert_escalation_steps WHERE policy_id = $1",
          [policyId],
        );
        for (const step of data.steps) {
          await query(
            `INSERT INTO public.alert_escalation_steps (policy_id, tier, delay_minutes, channel_ids, template_subject, template_body)
           VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              policyId,
              step.tier,
              step.delay_minutes,
              step.channel_ids,
              step.template_subject ?? null,
              step.template_body ?? null,
            ],
          );
        }
      }

      return c.json({ id: policyId, updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar politica de escalonamento", {
        policyId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// DELETE /api/v1/escalation/policies/:id — remove política
escalationRoute.delete(
  "/policies/:id",
  requirePermission("notifications:write"),
  async (c) => {
    const policyId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      await query(
        "DELETE FROM public.alert_escalation_policies WHERE id = $1 AND tenant_id = $2",
        [policyId, tenantId],
      );

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "escalation.policy.delete",
            entityType: "alert_escalation_policies",
            entityId: policyId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover politica de escalonamento", {
        policyId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover" } },
        500,
      );
    }
  },
);

// POST /api/v1/escalation/trigger — dispara um alerta com escalonamento
escalationRoute.post(
  "/trigger",
  requirePermission("notifications:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const bodyResult = await safeJsonBody(c);
      if (!bodyResult.success) return bodyResult.response;
      const body = bodyResult.data as {
        subject?: string;
        body?: string;
        severity?: string;
        source?: string;
        payload?: Record<string, unknown>;
      };

      if (!body.subject || !body.body || !body.source) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "subject, body e source são obrigatórios",
            },
          },
          400,
        );
      }

      // Busca política ativa para o event_source
      const policyResult = await query<{
        id: string;
        repeat_count: number;
        repeat_interval_minutes: number;
      }>(
        `SELECT id, repeat_count, repeat_interval_minutes FROM public.alert_escalation_policies
       WHERE tenant_id = $1 AND event_source = $2 AND is_active = true LIMIT 1`,
        [tenantId, body.source],
      );

      if (!policyResult.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NO_POLICY",
              message:
                "Nenhuma política de escalonamento ativa para este evento",
            },
          },
          404,
        );
      }

      const policy = policyResult.data.rows[0];

      // Busca step do tier 1
      const stepResult = await query<{
        tier: number;
        delay_minutes: number;
        channel_ids: string[];
        template_subject: string | null;
        template_body: string | null;
      }>(
        "SELECT * FROM public.alert_escalation_steps WHERE policy_id = $1 ORDER BY tier ASC LIMIT 1",
        [policy.id],
      );

      if (!stepResult.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NO_STEPS",
              message: "Política não tem steps configurados",
            },
          },
          400,
        );
      }

      const step = stepResult.data.rows[0];

      // Cria instância de escalonamento
      const instanceResult = await query<{ id: string }>(
        `INSERT INTO public.alert_escalation_instances (tenant_id, policy_id, alert_subject, alert_body, alert_severity, alert_source, alert_payload, current_tier, status, next_escalation_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'active', timezone('utc'::text, now()) + ($8 || ' minutes')::interval)
       RETURNING id`,
        [
          tenantId,
          policy.id,
          body.subject,
          body.body,
          body.severity ?? "critical",
          body.source,
          JSON.stringify(body.payload ?? {}),
          String(step.delay_minutes),
        ],
      );

      const instanceId = instanceResult.data?.rows[0]?.id;

      // Envia notificação para os canais do tier 1
      const subject = step.template_subject ?? body.subject;
      const messageBody = step.template_body ?? body.body;

      for (const channelId of step.channel_ids) {
        const channelResult = await query<{
          channel_type: string;
          config: Record<string, unknown>;
        }>(
          "SELECT channel_type, config FROM public.notification_channels WHERE id = $1 AND tenant_id = $2 AND is_active = true",
          [channelId, tenantId],
        );

        if (channelResult.data?.rows[0]) {
          const channel = channelResult.data.rows[0];
          await deliverNotification(
            channel.channel_type,
            channel.config ?? {},
            subject,
            messageBody,
          );

          await query(
            `INSERT INTO public.notification_log (tenant_id, channel_id, event_source, event_category, severity, subject, body, status, sent_at)
           VALUES ($1, $2, $3, 'custom', $4, $5, $6, 'sent', timezone('utc'::text, now()))`,
            [
              tenantId,
              channelId,
              body.source,
              body.severity ?? "critical",
              subject,
              messageBody,
            ],
          );
        }
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "escalation.trigger",
            entityType: "alert_escalation_instances",
            entityId: null,
            newData: {
              instance_id: instanceId,
              policy_id: policy.id,
              tier: 1,
              source: body.source,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json(
        { instance_id: instanceId, tier: 1, status: "active" },
        201,
      );
    } catch (error) {
      logger.error("Erro ao disparar escalonamento", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Erro ao disparar escalonamento",
          },
        },
        500,
      );
    }
  },
);

// POST /api/v1/escalation/instances/:id/resolve — resolve um alerta escalonado
escalationRoute.post(
  "/instances/:id/resolve",
  requirePermission("notifications:write"),
  async (c) => {
    const instanceId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      await query(
        "UPDATE public.alert_escalation_instances SET status = 'resolved', resolved_at = timezone('utc'::text, now()), resolved_by = $1 WHERE id = $2 AND tenant_id = $3",
        [userId, instanceId, tenantId],
      );

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "escalation.resolve",
            entityType: "alert_escalation_instances",
            entityId: instanceId,
            newData: { resolved_by: userId },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ resolved: true });
    } catch (error) {
      logger.error("Erro ao resolver instancia de escalonamento", {
        instanceId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro ao resolver" } },
        500,
      );
    }
  },
);

// GET /api/v1/escalation/instances — lista instâncias ativas
escalationRoute.get(
  "/instances",
  requirePermission("notifications:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const status = c.req.query("status") ?? "active";

    try {
      const result = await query(
        `SELECT i.*, p.name as policy_name
       FROM public.alert_escalation_instances i
       JOIN public.alert_escalation_policies p ON i.policy_id = p.id
       WHERE i.tenant_id = $1 AND i.status = $2
       ORDER BY i.created_at DESC`,
        [tenantId, status],
      );

      return c.json({ instances: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar instancias de escalonamento", {
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
