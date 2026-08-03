// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { requirePermission } from "../middleware/require-permission.js";
import { validate } from "../middleware/validate.js";
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  pushBroadcastSchema,
} from "@repo/shared-validation";
import {
  getVapidPublicKey,
  sendPushToUser,
  sendPushToTenant,
  configureVapid,
} from "../lib/web-push.js";
import "../types.js";

export const pushRoute = new Hono();

// GET /api/v1/push/vapid-public-key — retorna a chave publica VAPID
pushRoute.get("/vapid-public-key", async (c) => {
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
});

// POST /api/v1/push/subscribe — inscreve o usuario para push notifications
pushRoute.post(
  "/subscribe",
  validate({ schema: pushSubscribeSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const body = c.get("validatedData") as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      device_type?: string;
      user_agent?: string;
    };

    const { endpoint, keys, device_type, user_agent } = body;

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
        user.sub,
        endpoint,
        keys.p256dh,
        keys.auth,
        device_type ?? null,
        user_agent ?? null,
      ],
    );

    return c.json({ id: result.data?.rows[0]?.id, subscribed: true });
  },
);

// POST /api/v1/push/unsubscribe — remove a inscricao
pushRoute.post(
  "/unsubscribe",
  validate({ schema: pushUnsubscribeSchema }),
  async (c) => {
    const user = c.get("user");
    const body = c.get("validatedData") as { endpoint: string };
    const { endpoint } = body;

    await query(
      "UPDATE public.push_subscriptions SET is_active = false WHERE endpoint = $1 AND user_id = $2",
      [endpoint, user.sub],
    );

    return c.json({ unsubscribed: true });
  },
);

// GET /api/v1/push/subscriptions — lista inscricoes do usuario
pushRoute.get("/subscriptions", async (c) => {
  const user = c.get("user");

  const result = await query(
    `SELECT id, endpoint, device_type, user_agent, is_active, last_used_at, created_at
     FROM public.push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC`,
    [user.sub],
  );

  return c.json({ subscriptions: result.data?.rows ?? [] });
});

// DELETE /api/v1/push/subscriptions/:id — remove uma inscricao especifica
pushRoute.delete("/subscriptions/:id", async (c) => {
  const user = c.get("user");
  const subId = c.req.param("id");

  await query(
    "DELETE FROM public.push_subscriptions WHERE id = $1 AND user_id = $2",
    [subId, user.sub],
  );

  return c.json({ deleted: true });
});

// POST /api/v1/push/test — envia uma push notification de teste para o usuario
pushRoute.post("/test", async (c) => {
  const user = c.get("user");

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

  const result = await sendPushToUser(user.sub, {
    title: "JLMIRROR — Teste de Push",
    body: "Push notification recebida com sucesso!",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: "test-push",
    data: { type: "test", timestamp: new Date().toISOString() },
  });

  return c.json({ sent: result.sent, failed: result.failed });
});

// POST /api/v1/push/broadcast — admin envia push para todo o tenant
pushRoute.post(
  "/broadcast",
  requirePermission("notifications:write"),
  validate({ schema: pushBroadcastSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
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

    const result = await sendPushToTenant(tenantId, {
      title,
      body: message,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: "broadcast",
      data: { type: "broadcast", sent_by: user.sub },
    });

    await query(
      "SELECT public.write_audit_log($1, NULL, 'push.broadcast', 'push_subscriptions', NULL, $2, NULL, NULL)",
      [
        user.sub,
        JSON.stringify({ title, sent: result.sent, failed: result.failed }),
      ],
    );

    return c.json({ sent: result.sent, failed: result.failed });
  },
);
