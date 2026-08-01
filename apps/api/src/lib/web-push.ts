// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Web Push — envio de push notifications via Web Push API com VAPID
import webpush from "web-push";
import { query } from "@repo/db";

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  user_id: string;
  tenant_id: string | null;
  is_active: boolean;
}

export function configureVapid(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@jlinformatica.com.br";

  if (!publicKey || !privateKey) {
    console.warn("[web-push] VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY não configurados — Web Push desativado");
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

export async function sendPushNotification(
  subscription: PushSubscriptionRow,
  payload: { title: string; body: string; icon?: string; badge?: string; tag?: string; data?: Record<string, unknown> },
): Promise<{ success: boolean; error: string | null }> {
  try {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh_key,
        auth: subscription.auth_key,
      },
    };

    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      {
        TTL: 86400,
        urgency: "high",
      },
    );

    // Atualiza last_used_at
    await query(
      "UPDATE public.push_subscriptions SET last_used_at = timezone('utc'::text, now()) WHERE id = $1",
      [subscription.id],
    );

    return { success: true, error: null };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";

    // Se 410 Gone ou 404 Not Found, desativa a inscricao
    if (errorMsg.includes("410") || errorMsg.includes("404")) {
      await query(
        "UPDATE public.push_subscriptions SET is_active = false WHERE id = $1",
        [subscription.id],
      );
    }

    return { success: false, error: errorMsg };
  }
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; icon?: string; badge?: string; tag?: string; data?: Record<string, unknown> },
): Promise<{ sent: number; failed: number }> {
  const result = await query<PushSubscriptionRow>(
    "SELECT id, endpoint, p256dh_key, auth_key, user_id, tenant_id, is_active FROM public.push_subscriptions WHERE user_id = $1 AND is_active = true",
    [userId],
  );

  const subscriptions = result.data?.rows ?? [];
  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    const pushResult = await sendPushNotification(sub, payload);
    if (pushResult.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}

export async function sendPushToTenant(
  tenantId: string,
  payload: { title: string; body: string; icon?: string; badge?: string; tag?: string; data?: Record<string, unknown> },
): Promise<{ sent: number; failed: number }> {
  const result = await query<PushSubscriptionRow>(
    "SELECT id, endpoint, p256dh_key, auth_key, user_id, tenant_id, is_active FROM public.push_subscriptions WHERE tenant_id = $1 AND is_active = true",
    [tenantId],
  );

  const subscriptions = result.data?.rows ?? [];
  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    const pushResult = await sendPushNotification(sub, payload);
    if (pushResult.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}
