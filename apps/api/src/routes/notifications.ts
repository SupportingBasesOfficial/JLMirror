// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createChannelSchema,
  updateChannelSchema,
  createRuleSchema,
  updateRuleSchema,
  sendNotificationSchema,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { deliverNotification } from "../lib/notification-delivery.js";
import "../types.js";

export const notificationRoute = new Hono();

// Re-exporta para compatibilidade com imports existentes
export { deliverNotification };

// GET /api/v1/notifications — overview do modulo
notificationRoute.get(
  "/",
  requirePermission("notifications:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 2 queries
      const [channelsResult, rulesResult] = await Promise.all([
        query(
          "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.notification_channels WHERE tenant_id = $1",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.notification_rules WHERE tenant_id = $1",
          [tenantId],
        ),
      ]);

      if (channelsResult.error || rulesResult.error) {
        logger.error("Erro ao buscar overview notifications", {
          tenantId,
          error: channelsResult.error?.message ?? rulesResult.error?.message,
        });
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar overview" },
          },
          500,
        );
      }

      return c.json({
        overview: {
          channels: channelsResult.data?.rows[0] ?? { total: "0", active: "0" },
          rules: rulesResult.data?.rows[0] ?? { total: "0", active: "0" },
        },
        endpoints: [
          "/channels",
          "/channels/:id",
          "/rules",
          "/rules/:id",
          "/send",
        ],
      });
    } catch (error) {
      logger.error("Erro inesperado no overview notifications", {
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

// ========== Channels ==========

notificationRoute.get(
  "/channels",
  httpCache(30),
  requirePermission("notifications:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "SELECT id, tenant_id, name, channel_type, config, is_active, is_verified, verified_at, last_used_at, failure_count, created_by, created_at, updated_at FROM public.notification_channels WHERE tenant_id = $1 ORDER BY name",
        [tenantId],
      );

      if (result.error) {
        logger.error("Erro ao listar notification channels", {
          tenantId,
          error: result.error.message,
        });
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar canais" } },
          500,
        );
      }

      return c.json({ channels: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar channels", {
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

notificationRoute.post(
  "/channels",
  rateLimitWrite,
  requirePermission("notifications:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = createChannelSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.notification_channels (tenant_id, name, channel_type, config, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
        [
          tenantId,
          data.name,
          data.channel_type,
          JSON.stringify(data.config ?? {}),
          data.is_active,
          user?.sub ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        logger.error("Erro ao criar notification channel", {
          tenantId,
          error: result.error?.message,
        });
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar canal" } },
          500,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'notif.channel.create', 'notification_channel', $2, $3, NULL, NULL)",
          [
            user.sub,
            result.data.rows[0].id,
            JSON.stringify({ name: data.name, type: data.channel_type }),
          ],
        );
      }

      logger.info("Notification channel criado", {
        channelId: result.data.rows[0].id,
        tenantId,
        channelType: data.channel_type,
      });

      return c.json({ id: result.data.rows[0].id }, 201);
    } catch (error) {
      logger.error("Erro inesperado ao criar channel", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar canal" } },
        500,
      );
    }
  },
);

notificationRoute.put(
  "/channels/:id",
  rateLimitWrite,
  requirePermission("notifications:write"),
  async (c) => {
    const channelId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = updateChannelSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      name: "name",
      channel_type: "channel_type",
      config: "config",
      is_active: "is_active",
      is_verified: "is_verified",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        if (key === "config") {
          updateFields.push(`${dbField} = $${paramIdx++}`);
          params.push(JSON.stringify(data[key as keyof typeof data]));
        } else {
          updateFields.push(`${dbField} = $${paramIdx++}`);
          params.push(data[key as keyof typeof data]);
        }
      }
    }

    if (data.is_verified) {
      updateFields.push(`verified_at = timezone('utc'::text, now())`);
    }

    if (updateFields.length === 0) {
      return c.json({ id: channelId });
    }

    params.push(channelId, tenantId);

    try {
      const result = await query(
        `UPDATE public.notification_channels SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++} RETURNING id`,
        params,
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Canal não encontrado" } },
          404,
        );
      }

      return c.json({ id: channelId });
    } catch (error) {
      logger.error("Erro ao atualizar channel", {
        channelId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar canal" } },
        500,
      );
    }
  },
);

notificationRoute.delete(
  "/channels/:id",
  rateLimitWrite,
  requirePermission("notifications:write"),
  async (c) => {
    const channelId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.notification_channels WHERE id = $1 AND tenant_id = $2 RETURNING id",
        [channelId, tenantId],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Canal não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'notif.channel.delete', 'notification_channel', $2, NULL, NULL, NULL)",
          [user.sub, channelId],
        );
      }

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao deletar channel", {
        channelId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao excluir canal" } },
        500,
      );
    }
  },
);

// POST /api/v1/notifications/channels/:id/test — testa canal com envio real
notificationRoute.post(
  "/channels/:id/test",
  rateLimitWrite,
  requirePermission("notifications:write"),
  async (c) => {
    const channelId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const channelResult = await query<{
        id: string;
        name: string;
        channel_type: string;
        config: Record<string, unknown>;
      }>(
        "SELECT id, tenant_id, name, channel_type, config, is_active, is_verified, verified_at, last_used_at, failure_count, created_by, created_at, updated_at FROM public.notification_channels WHERE id = $1 AND tenant_id = $2",
        [channelId, tenantId],
      );

      if (channelResult.error || !channelResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Canal não encontrado" } },
          404,
        );
      }

      const channel = channelResult.data.rows[0];
      const startTime = Date.now();

      // Envio real via deliverNotification
      const deliveryResult = await deliverNotification(
        channel.channel_type,
        channel.config ?? {},
        `[TESTE] Canal ${channel.name}`,
        `Teste de conectividade para canal ${channel.name} (${channel.channel_type}) — ${new Date().toISOString()}`,
      );

      const success = deliveryResult.success;
      const durationMs = Date.now() - startTime;

      // Marca como verificado se sucesso
      if (success) {
        await query(
          "UPDATE public.notification_channels SET is_verified = true, verified_at = timezone('utc'::text, now()), last_used_at = timezone('utc'::text, now()) WHERE id = $1",
          [channelId],
        );
      }

      // Registra no log
      await query(
        `INSERT INTO public.notification_log (tenant_id, channel_id, event_source, event_category, severity, subject, body, status, sent_at, duration_ms)
       VALUES ($1, $2, 'custom', 'custom', 'info', $3, $4, $5, timezone('utc'::text, now()), $6)`,
        [
          tenantId,
          channelId,
          `[TESTE] Canal ${channel.name}`,
          `Teste de conectividade para canal ${channel.name} (${channel.channel_type})`,
          success ? "sent" : "failed",
          durationMs,
        ],
      );

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'notif.channel.test', 'notification_channel', $2, $3, NULL, NULL)",
          [
            user.sub,
            channelId,
            JSON.stringify({
              success,
              duration_ms: durationMs,
              status_code: deliveryResult.statusCode,
              error: deliveryResult.error,
            }),
          ],
        );
      }

      logger.info("Teste de canal executado", {
        channelId,
        tenantId,
        success,
        durationMs,
      });

      return c.json({
        channel_id: channelId,
        success,
        status_code: deliveryResult.statusCode,
        duration_ms: durationMs,
        error: deliveryResult.error,
        message: success
          ? "Canal testado com sucesso"
          : "Falha no teste do canal",
      });
    } catch (error) {
      logger.error("Erro inesperado ao testar channel", {
        channelId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "TEST_ERROR", message: "Erro ao testar canal" } },
        500,
      );
    }
  },
);

// ========== Rules ==========

notificationRoute.get(
  "/rules",
  httpCache(30),
  requirePermission("notifications:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "SELECT * FROM public.notification_rules WHERE tenant_id = $1 ORDER BY name",
        [tenantId],
      );

      if (result.error) {
        logger.error("Erro ao listar notification rules", {
          tenantId,
          error: result.error.message,
        });
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar regras" } },
          500,
        );
      }

      return c.json({ rules: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar rules", {
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

notificationRoute.post(
  "/rules",
  rateLimitWrite,
  requirePermission("notifications:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = createRuleSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.notification_rules (tenant_id, name, description, event_source, event_category, severity_filter,
       channel_ids, template_subject, template_body, cooldown_minutes, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
        [
          tenantId,
          data.name,
          data.description ?? null,
          data.event_source,
          data.event_category,
          data.severity_filter,
          data.channel_ids,
          data.template_subject ?? null,
          data.template_body ?? null,
          data.cooldown_minutes,
          data.is_active,
          user?.sub ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        logger.error("Erro ao criar notification rule", {
          tenantId,
          error: result.error?.message,
        });
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar regra" } },
          500,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'notif.rule.create', 'notification_rule', $2, $3, NULL, NULL)",
          [
            user.sub,
            result.data.rows[0].id,
            JSON.stringify({
              name: data.name,
              source: data.event_source,
              channels: data.channel_ids?.length ?? 0,
            }),
          ],
        );
      }

      logger.info("Notification rule criada", {
        ruleId: result.data.rows[0].id,
        tenantId,
        eventSource: data.event_source,
      });

      return c.json({ id: result.data.rows[0].id }, 201);
    } catch (error) {
      logger.error("Erro inesperado ao criar rule", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar regra" } },
        500,
      );
    }
  },
);

notificationRoute.put(
  "/rules/:id",
  rateLimitWrite,
  requirePermission("notifications:write"),
  async (c) => {
    const ruleId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = updateRuleSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
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
      event_category: "event_category",
      severity_filter: "severity_filter",
      channel_ids: "channel_ids",
      template_subject: "template_subject",
      template_body: "template_body",
      cooldown_minutes: "cooldown_minutes",
      is_active: "is_active",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (updateFields.length === 0) {
      return c.json({ id: ruleId });
    }

    params.push(ruleId, tenantId);

    try {
      const result = await query(
        `UPDATE public.notification_rules SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++} RETURNING id`,
        params,
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Regra não encontrada" } },
          404,
        );
      }

      return c.json({ id: ruleId });
    } catch (error) {
      logger.error("Erro ao atualizar rule", {
        ruleId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar regra" } },
        500,
      );
    }
  },
);

notificationRoute.delete(
  "/rules/:id",
  rateLimitWrite,
  requirePermission("notifications:write"),
  async (c) => {
    const ruleId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.notification_rules WHERE id = $1 AND tenant_id = $2 RETURNING id",
        [ruleId, tenantId],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Regra não encontrada" } },
          404,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'notif.rule.delete', 'notification_rule', $2, NULL, NULL, NULL)",
          [user.sub, ruleId],
        );
      }

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao deletar rule", {
        ruleId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao excluir regra" } },
        500,
      );
    }
  },
);

// ========== Send ==========

notificationRoute.post(
  "/send",
  rateLimitWrite,
  requirePermission("notifications:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = sendNotificationSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;

    try {
      // Busca regras que matchem event_source e severity
      const rulesResult = await query<{
        id: string;
        channel_ids: string[];
        cooldown_minutes: number;
        template_subject: string | null;
        template_body: string | null;
      }>(
        `SELECT * FROM public.notification_rules
       WHERE tenant_id = $1 AND event_source = $2 AND is_active = true
       AND (severity_filter = 'all' OR severity_filter = $3)`,
        [tenantId, data.event_source, data.severity],
      );

      if (rulesResult.error) {
        logger.error("Erro ao buscar rules para send", {
          tenantId,
          error: rulesResult.error.message,
        });
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar regras" } },
          500,
        );
      }

      const rules = rulesResult.data?.rows ?? [];
      const results: {
        rule_id: string;
        channel_id: string;
        status: string;
        error: string | null;
      }[] = [];

      // Busca todos os canais em paralelo (elimina N+1)
      const allChannelIds = Array.from(
        new Set(rules.flatMap((r) => r.channel_ids ?? [])),
      );

      const channelsMap = new Map<
        string,
        {
          id: string;
          name: string;
          channel_type: string;
          is_active: boolean;
          config: Record<string, unknown>;
        }
      >();

      if (allChannelIds.length > 0) {
        const channelsResult = await query<{
          id: string;
          name: string;
          channel_type: string;
          is_active: boolean;
          config: Record<string, unknown>;
        }>(
          `SELECT id, name, channel_type, is_active, config FROM public.notification_channels WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
          [allChannelIds, tenantId],
        );

        for (const ch of channelsResult.data?.rows ?? []) {
          channelsMap.set(ch.id, ch);
        }
      }

      for (const rule of rules) {
        // Verifica cooldown
        const cooldownOk = await query<{ check_rule_cooldown: boolean }>(
          "SELECT public.check_rule_cooldown($1) as check_rule_cooldown",
          [rule.id],
        );
        if (!cooldownOk.data?.rows[0]?.check_rule_cooldown) {
          results.push({
            rule_id: rule.id,
            channel_id: "—",
            status: "rate_limited",
            error: "Cooldown ativo",
          });
          continue;
        }

        const subject = rule.template_subject ?? data.subject;
        const bodyText = rule.template_body ?? data.body;

        // Atualiza trigger count e last_triggered_at
        await query(
          "UPDATE public.notification_rules SET last_triggered_at = timezone('utc'::text, now()), trigger_count = trigger_count + 1 WHERE id = $1",
          [rule.id],
        );

        // Envia para cada canal
        for (const channelId of rule.channel_ids ?? []) {
          const channel = channelsMap.get(channelId);

          if (!channel || !channel.is_active) {
            results.push({
              rule_id: rule.id,
              channel_id: channelId,
              status: "failed",
              error: "Canal não encontrado ou inativo",
            });
            continue;
          }

          const startTime = Date.now();

          // Envio real via deliverNotification
          const deliveryResult = await deliverNotification(
            channel.channel_type,
            channel.config ?? {},
            subject,
            bodyText,
          );
          const success = deliveryResult.success;
          const durationMs = Date.now() - startTime;

          // Registra no log
          await query(
            `INSERT INTO public.notification_log (tenant_id, rule_id, channel_id, event_source, event_category, severity, subject, body, payload, status, sent_at, duration_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, timezone('utc'::text, now()), $11)`,
            [
              tenantId,
              rule.id,
              channelId,
              data.event_source,
              data.event_category,
              data.severity,
              subject,
              bodyText,
              JSON.stringify(data.payload ?? {}),
              success ? "sent" : "failed",
              durationMs,
            ],
          );

          // Atualiza last_used_at do canal
          await query(
            "UPDATE public.notification_channels SET last_used_at = timezone('utc'::text, now()) WHERE id = $1",
            [channelId],
          );

          results.push({
            rule_id: rule.id,
            channel_id: channelId,
            status: success ? "sent" : "failed",
            error: success ? null : deliveryResult.error,
          });
        }
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'notif.send', 'notification_log', NULL, $2, NULL, NULL)",
          [
            user.sub,
            JSON.stringify({
              event_source: data.event_source,
              rules_matched: rules.length,
              results,
            }),
          ],
        );
      }

      logger.info("Notificacoes enviadas", {
        tenantId,
        eventSource: data.event_source,
        rulesMatched: rules.length,
        sent: results.filter((r) => r.status === "sent").length,
      });

      return c.json({
        rules_matched: rules.length,
        notifications_sent: results.filter((r) => r.status === "sent").length,
        results,
      });
    } catch (error) {
      logger.error("Erro inesperado ao enviar notificacoes", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "SEND_ERROR", message: "Erro ao enviar notificação" },
        },
        500,
      );
    }
  },
);

// ========== Log ==========

notificationRoute.get(
  "/log",
  httpCache(30),
  requirePermission("notifications:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const status = c.req.query("status");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

    const conditions: string[] = ["l.tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`l.status = $${paramIdx++}`);
      params.push(status);
    }

    params.push(limit);

    try {
      const result = await query(
        `SELECT l.*, ch.name as channel_name, ch.channel_type,
       r.name as rule_name
       FROM public.notification_log l
       LEFT JOIN public.notification_channels ch ON l.channel_id = ch.id
       LEFT JOIN public.notification_rules r ON l.rule_id = r.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY l.created_at DESC
       LIMIT $${paramIdx++}`,
        params,
      );

      if (result.error) {
        logger.error("Erro ao listar notification log", {
          tenantId,
          error: result.error.message,
        });
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar logs" } },
          500,
        );
      }

      return c.json({
        logs: result.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro inesperado ao listar log", {
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

// ========== Stats ==========

notificationRoute.get(
  "/stats",
  requirePermission("notifications:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 4 queries independentes
      const [channelsResult, rulesResult, logResult, byCategory] =
        await Promise.all([
          query(
            `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE is_active = true) as active,
             COUNT(*) FILTER (WHERE is_verified = true) as verified
           FROM public.notification_channels
           WHERE tenant_id = $1`,
            [tenantId],
          ),
          query(
            `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE is_active = true) as active,
             COALESCE(SUM(trigger_count), 0) as total_triggers
           FROM public.notification_rules
           WHERE tenant_id = $1`,
            [tenantId],
          ),
          query(
            `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE status = 'sent') as sent,
             COUNT(*) FILTER (WHERE status = 'failed') as failed,
             COUNT(*) FILTER (WHERE status = 'rate_limited') as rate_limited
           FROM public.notification_log
           WHERE tenant_id = $1 AND created_at > timezone('utc'::text, now()) - INTERVAL '7 days'`,
            [tenantId],
          ),
          query(
            `SELECT event_category, COUNT(*) as count
           FROM public.notification_log
           WHERE tenant_id = $1 AND created_at > timezone('utc'::text, now()) - INTERVAL '7 days'
           GROUP BY event_category ORDER BY count DESC`,
            [tenantId],
          ),
        ]);

      return c.json({
        channels: channelsResult.data?.rows[0] ?? {
          total: "0",
          active: "0",
          verified: "0",
        },
        rules: rulesResult.data?.rows[0] ?? {
          total: "0",
          active: "0",
          total_triggers: "0",
        },
        log_7d: logResult.data?.rows[0] ?? {
          total: "0",
          sent: "0",
          failed: "0",
          rate_limited: "0",
        },
        by_category: byCategory.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro inesperado no stats notifications", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar stats" } },
        500,
      );
    }
  },
);
