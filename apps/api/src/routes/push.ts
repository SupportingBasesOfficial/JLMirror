// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { validate } from "../middleware/validate.js";
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  pushBroadcastSchema,
} from "@repo/shared-validation";
import { writeAuditLog } from "../lib/audit.js";
import {
  getVapidPublicKey,
  sendPushToUser,
  sendPushToTenant,
  configureVapid,
} from "../lib/web-push.js";
import "../types.js";

export const pushRoute = new Hono();

// GET /api/v1/push — overview do modulo
pushRoute.get(
  "/",
  requirePermission("notifications:read"),
  httpCache(60),
  async (c) => {
    return c.json({
      overview: "Push — Notificações Web Push",
      endpoints: [
        "/vapid-public-key",
        "/subscribe",
        "/unsubscribe",
        "/broadcast",
        "/subscriptions",
      ],
    });
  },
);

// GET /api/v1/push/vapid-public-key — retorna a chave publica VAPID
pushRoute.get(
  "/vapid-public-key",
  requirePermission("notifications:read"),
  httpCache(300),
  async (c) => {
    try {
      const publicKey = getVapidPublicKey();
      if (!publicKey) {
        return c.json(
          {
            error: {
              code: "VAPID_NOT_CONFIGURED",
              message: "VAPID keys não configuradas",
            },
          },
          500,
        );
      }
      return c.json({ public_key: publicKey });
    } catch (error) {
      logger.error("Erro ao obter VAPID public key", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/push/subscribe — inscreve o usuario para push notifications
pushRoute.post(
  "/subscribe",
  requirePermission("notifications:write"),
  rateLimitWrite,
  validate({ schema: pushSubscribeSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      device_type?: string;
      user_agent?: string;
    };

    const { endpoint, keys, device_type, user_agent } = body;

    try {
      // Upsert — se ja existe o endpoint+user_id, atualiza as keys
      const result = await query<{ id: string }>(
        `INSERT INTO public.push_subscriptions (tenant_id, user_id, endpoint, p256dh_key, auth_key, device_type, user_agent, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (endpoint, user_id) DO UPDATE SET
         p256dh_key = EXCLUDED.p256dh_key,
         auth_key = EXCLUDED.auth_key,
         device_type = EXCLUDED.device_type,
         user_agent = EXCLUDED.user_agent,
         is_active = true
       RETURNING id`,
        [
          tenantId,
          userId,
          endpoint,
          keys.p256dh,
          keys.auth,
          device_type ?? null,
          user_agent ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao inscrever" },
          },
          500,
        );
      }

      logger.info("Push subscription criada", {
        subId: result.data.rows[0].id,
        userId,
        tenantId,
      });

      return c.json({ id: result.data.rows[0].id, subscribed: true });
    } catch (error) {
      logger.error("Erro ao inscrever push", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao inscrever" } },
        500,
      );
    }
  },
);

// POST /api/v1/push/unsubscribe — remove a inscricao
pushRoute.post(
  "/unsubscribe",
  requirePermission("notifications:write"),
  rateLimitWrite,
  validate({ schema: pushUnsubscribeSchema }),
  async (c) => {
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as { endpoint: string };
    const { endpoint } = body;

    try {
      await query(
        "UPDATE public.push_subscriptions SET is_active = false WHERE endpoint = $1 AND user_id = $2",
        [endpoint, userId],
      );

      return c.json({ unsubscribed: true });
    } catch (error) {
      logger.error("Erro ao desinscrever push", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao desinscrever" } },
        500,
      );
    }
  },
);

// GET /api/v1/push/subscriptions — lista inscricoes do usuario
pushRoute.get(
  "/subscriptions",
  requirePermission("notifications:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const userId = user?.sub ?? null;

    try {
      const result = await query(
        `SELECT id, endpoint, device_type, user_agent, is_active, last_used_at, created_at
         FROM public.push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      );

      return c.json({ subscriptions: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar push subscriptions", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// DELETE /api/v1/push/subscriptions/:id — remove uma inscricao especifica
pushRoute.delete(
  "/subscriptions/:id",
  requirePermission("notifications:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const subId = c.req.param("id");

    try {
      const result = await query(
        "DELETE FROM public.push_subscriptions WHERE id = $1 AND user_id = $2",
        [subId, userId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          {
            error: { code: "NOT_FOUND", message: "Inscrição não encontrada" },
          },
          404,
        );
      }

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover push subscription", {
        subId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover" } },
        500,
      );
    }
  },
);

// POST /api/v1/push/test — envia uma push notification de teste para o usuario
pushRoute.post(
  "/test",
  requirePermission("notifications:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const userId = user?.sub ?? null;

    try {
      configureVapid();
    } catch {
      return c.json(
        {
          error: {
            code: "VAPID_NOT_CONFIGURED",
            message: "VAPID keys não configuradas no servidor",
          },
        },
        500,
      );
    }

    try {
      const result = await sendPushToUser(userId, {
        title: "JLMIRROR — Teste de Push",
        body: "Push notification recebida com sucesso!",
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: "test-push",
        data: { type: "test", timestamp: new Date().toISOString() },
      });

      logger.info("Push test enviado", { userId, sent: result.sent });

      return c.json({ sent: result.sent, failed: result.failed });
    } catch (error) {
      logger.error("Erro ao enviar push test", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "SEND_ERROR", message: "Erro ao enviar push" } },
        500,
      );
    }
  },
);

// POST /api/v1/push/broadcast — admin envia push para todo o tenant
pushRoute.post(
  "/broadcast",
  requirePermission("notifications:write"),
  rateLimitWrite,
  validate({ schema: pushBroadcastSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as { title: string; message: string };
    const { title, message } = body;

    try {
      configureVapid();
    } catch {
      return c.json(
        {
          error: {
            code: "VAPID_NOT_CONFIGURED",
            message: "VAPID keys não configuradas no servidor",
          },
        },
        500,
      );
    }

    try {
      const result = await sendPushToTenant(tenantId, {
        title,
        body: message,
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: "broadcast",
        data: { type: "broadcast", sent_by: userId },
      });

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "push.broadcast",
            entityType: "push_subscriptions",
            entityId: null,
            newData: {
              title,
              sent: result.sent,
              failed: result.failed,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Push broadcast enviado", {
        tenantId,
        title,
        sent: result.sent,
        failed: result.failed,
      });

      return c.json({ sent: result.sent, failed: result.failed });
    } catch (error) {
      logger.error("Erro ao enviar push broadcast", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "SEND_ERROR", message: "Erro ao enviar broadcast" } },
        500,
      );
    }
  },
);
