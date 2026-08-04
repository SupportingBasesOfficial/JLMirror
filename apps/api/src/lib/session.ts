// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Criacao de sessao e dispositivo confiavel — extrai logica repetida de auth.ts

import { query } from "@repo/db";
import { logger } from "@repo/logger";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CreateSessionParams {
  userId: string;
  refreshTokenHash: string;
  deviceFingerprint?: string | null;
  deviceLabel?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createSession({
  userId,
  refreshTokenHash,
  deviceFingerprint = null,
  deviceLabel = null,
  ipAddress = null,
  userAgent = null,
}: CreateSessionParams): Promise<void> {
  const result = await query(
    `INSERT INTO public.sessions (user_id, refresh_token_hash, expires_at, device_fingerprint, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5::inet, $6)`,
    [
      userId,
      refreshTokenHash,
      new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      deviceFingerprint,
      ipAddress,
      userAgent,
    ],
  );

  if (result.error) {
    logger.error("Erro ao criar sessao", { error: result.error.message });
  }

  if (deviceFingerprint) {
    await query(
      `INSERT INTO public.trusted_devices (user_id, device_fingerprint, device_label, ip_address, user_agent, last_seen_at)
       VALUES ($1, $2, $3, $4::inet, $5, now())
       ON CONFLICT (user_id, device_fingerprint) DO UPDATE SET last_seen_at = now(), ip_address = $4::inet, user_agent = $5`,
      [userId, deviceFingerprint, deviceLabel, ipAddress, userAgent],
    );
  }

  await query("UPDATE public.users SET last_login_at = now() WHERE id = $1", [
    userId,
  ]);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await query("DELETE FROM public.sessions WHERE user_id = $1", [userId]);
}

export async function revokeSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  await query("DELETE FROM public.sessions WHERE id = $1 AND user_id = $2", [
    sessionId,
    userId,
  ]);
}
