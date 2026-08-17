// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Criacao de sessao e dispositivo confiavel — extrai logica repetida de auth.ts
// Refatorado para usar Drizzle ORM em vez de query() raw SQL.

import { withTenantDb, schema } from "@repo/db/drizzle";
import { eq, and } from "drizzle-orm";
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
  try {
    await withTenantDb(async (db) => {
      // Insere sessao
      await db.insert(schema.sessions).values({
        userId,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        deviceFingerprint: deviceFingerprint ?? null,
        deviceLabel: deviceLabel ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

      // Upsert dispositivo confiavel se fingerprint fornecido
      if (deviceFingerprint) {
        await db
          .insert(schema.trustedDevices)
          .values({
            userId,
            deviceFingerprint,
            deviceLabel: deviceLabel ?? null,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
            lastSeenAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              schema.trustedDevices.userId,
              schema.trustedDevices.deviceFingerprint,
            ],
            set: {
              lastSeenAt: new Date(),
              ipAddress: ipAddress ?? null,
              userAgent: userAgent ?? null,
            },
          });
      }

      // Atualiza last_login_at
      await db
        .update(schema.users)
        .set({ lastLoginAt: new Date() })
        .where(eq(schema.users.id, userId));
    });
  } catch (error) {
    logger.error("Erro ao criar sessao", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await withTenantDb(async (db) => {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  });
}

export async function revokeSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  await withTenantDb(async (db) => {
    await db
      .delete(schema.sessions)
      .where(
        and(
          eq(schema.sessions.id, sessionId),
          eq(schema.sessions.userId, userId),
        ),
      );
  });
}
