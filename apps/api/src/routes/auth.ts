// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Rotas de autenticacao — refatoradas para Drizzle ORM + error handling padronizado.
//
// PADRAO DE ERROR HANDLING (consistente em todas as rotas):
//   400 — VALIDATION_ERROR (Zod parse falhou) ou INVALID_JSON
//   401 — INVALID_CREDENTIALS, INVALID_TOKEN, TOKEN_REVOKED, SESSION_EXPIRED
//   403 — USER_INACTIVE, NO_TENANT_ACCESS, TENANT_INACTIVE
//   404 — USER_NOT_FOUND, SESSION_NOT_FOUND, DEVICE_NOT_FOUND
//   500 — INTERNAL_ERROR (logado, mensagem generica em producao)
import { Hono } from "hono";
import argon2 from "argon2";
import crypto from "node:crypto";
import { withTenantDb, schema } from "@repo/db/drizzle";
import { eq, and, gt, sql } from "drizzle-orm";
import { logger } from "@repo/logger";
import {
  verifyToken,
  generateAndStoreTokens,
  GoogleOAuthProvider,
  LdapAuthProvider,
} from "@repo/auth";
import { revokeToken, isTokenRevoked } from "@repo/auth";
import {
  loginInputSchema,
  refreshTokenSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  oauthCallbackSchema,
  ldapBindSchema,
  type LoginInput,
  type RefreshTokenInput,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type OauthCallbackInput,
  type LdapBindInput,
} from "@repo/shared-validation";
import {
  requestPasswordReset,
  consumeResetToken,
} from "../lib/password-reset.js";
import {
  createSession,
  revokeAllSessions,
  revokeSession,
} from "../lib/session.js";
import {
  findOrCreateExternalUser,
  getUserTenantAuth,
} from "../lib/external-auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { safeJsonBody } from "../lib/safe-json.js";
import "../types.js";

export const authRoute = new Hono();

// Helper: busca tenant auth (roles + tenants) via RPC — logica complexa
// de join entre tenant_users e tenants permanece na funcao SQL.
async function fetchTenantAuth(userId: string) {
  return getUserTenantAuth(userId);
}

// Helper: busca status MFA TOTP do usuario via Drizzle
async function fetchMfaStatus(userId: string): Promise<boolean> {
  return withTenantDb(async (db) => {
    const [row] = await db
      .select({ isEnabled: schema.userMfaTotp.isEnabled })
      .from(schema.userMfaTotp)
      .where(eq(schema.userMfaTotp.userId, userId))
      .limit(1);
    return row?.isEnabled ?? false;
  });
}

// Helper: cria challenge MFA via Drizzle
async function createMfaChallenge(userId: string): Promise<string> {
  const challengeToken = crypto.randomUUID();
  await withTenantDb(async (db) => {
    await db.insert(schema.mfaChallenges).values({
      userId,
      method: "totp",
      challengeToken,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
  });
  return challengeToken;
}

// Helper: escreve audit log de login falhado (best-effort, nao bloqueia)
async function auditLoginFailed(
  userId: string | null,
  reason: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await writeAuditLog({
      userId,
      action: "auth.login.failed",
      entityType: "users",
      entityId: userId,
      metadata: { reason, ...metadata },
    });
  } catch {
    // Audit log falhou — nao bloqueia login
  }
}

// POST /api/v1/auth/login
authRoute.post("/login", async (c) => {
  try {
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = loginInputSchema.safeParse(parsedBody.data);
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

    const { email, password } = parsed.data as LoginInput;
    const clientIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      null;

    // Busca usuário global em public.users via Drizzle
    const user = await withTenantDb(async (db) => {
      const [row] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          passwordHash: schema.users.passwordHash,
          fullName: schema.users.fullName,
          isActive: schema.users.isActive,
          mustChangePassword: schema.users.mustChangePassword,
        })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);
      return row;
    });

    if (!user) {
      await auditLoginFailed(null, "user_not_found", { email, ip: clientIp });
      logger.warn("Login falhou: usuario nao encontrado", {
        email,
        ip: clientIp,
      });
      return c.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Email ou senha inválidos",
          },
        },
        401,
      );
    }

    if (!user.isActive) {
      await auditLoginFailed(user.id, "user_inactive", { ip: clientIp });
      logger.warn("Login falhou: usuario inativo", {
        userId: user.id,
        ip: clientIp,
      });
      return c.json(
        { error: { code: "USER_INACTIVE", message: "Usuário inativo" } },
        403,
      );
    }

    // Verifica senha com argon2id
    let valid = false;
    try {
      valid = await argon2.verify(user.passwordHash, password);
    } catch (err) {
      logger.error("Erro ao verificar senha (argon2)", {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Email ou senha inválidos",
          },
        },
        401,
      );
    }

    if (!valid) {
      await auditLoginFailed(user.id, "invalid_password", { ip: clientIp });
      logger.warn("Login falhou: senha invalida", {
        userId: user.id,
        ip: clientIp,
      });
      return c.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Email ou senha inválidos",
          },
        },
        401,
      );
    }

    // Busca tenants e roles do usuário via RPC
    const tenantAuth = await fetchTenantAuth(user.id);

    if (!tenantAuth) {
      await auditLoginFailed(user.id, "no_tenant_access", { ip: clientIp });
      logger.warn("Login falhou: sem tenant", {
        userId: user.id,
        ip: clientIp,
      });
      return c.json(
        {
          error: {
            code: "NO_TENANT_ACCESS",
            message: "Usuário não possui acesso a nenhum tenant",
          },
        },
        403,
      );
    }

    // Verifica se usuário tem MFA TOTP habilitado
    const mfaEnabled = await fetchMfaStatus(user.id);

    if (mfaEnabled) {
      const challengeToken = await createMfaChallenge(user.id);
      logger.info("Login: MFA requerido", { userId: user.id });
      return c.json({
        mfa_required: true,
        mfa_method: "totp",
        challenge_token: challengeToken,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.fullName,
        },
      });
    }

    // Gera tokens JWT e armazena jti no Redis (helper centralizado)
    const { accessToken, refreshToken, refreshTokenHash } =
      await generateAndStoreTokens({
        sub: user.id,
        tenant_id: tenantAuth.primaryTenantId,
        roles: tenantAuth.roles,
        scope: tenantAuth.scope,
        tenant_ids: tenantAuth.tenantIds,
      });

    // Cria sessao, dispositivo confiavel e atualiza last_login_at
    const clientFingerprint = parsed.data.device_fingerprint as
      string | undefined;
    const clientUserAgent = c.req.header("user-agent") || null;

    await createSession({
      userId: user.id,
      refreshTokenHash,
      deviceFingerprint: clientFingerprint ?? null,
      deviceLabel: parsed.data.device_label ?? null,
      ipAddress: clientIp,
      userAgent: clientUserAgent,
    });

    // Audit log de login bem-sucedido
    try {
      await writeAuditLog({
        userId: user.id,
        action: "auth.login.success",
        entityType: "users",
        entityId: user.id,
        metadata: { ip: clientIp, userAgent: clientUserAgent },
      });
    } catch {
      // Audit log falhou — nao bloqueia login
    }

    logger.info("Login bem-sucedido", { userId: user.id, ip: clientIp });

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        is_active: user.isActive,
        must_change_password: user.mustChangePassword,
      },
      scope: tenantAuth.scope,
      tenants: tenantAuth.tenants,
    });
  } catch (error) {
    logger.error("Erro interno no login", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// POST /api/v1/auth/refresh
authRoute.post("/refresh", async (c) => {
  try {
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = refreshTokenSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Refresh token inválido",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const payload = verifyToken(parsed.data.refresh_token);
    if (payload.type !== "refresh") {
      return c.json(
        { error: { code: "INVALID_TOKEN", message: "Tipo de token inválido" } },
        401,
      );
    }

    // Verifica se o token foi revogado
    const revoked = await isTokenRevoked(payload.jti);
    if (revoked) {
      return c.json(
        { error: { code: "TOKEN_REVOKED", message: "Token revogado" } },
        401,
      );
    }

    // Revoga o token antigo (rotação)
    const ttlSeconds = 30 * 24 * 60 * 60;
    await revokeToken(payload.jti, ttlSeconds);

    // Gera novos tokens
    const { accessToken, refreshToken: newRefreshToken } =
      await generateAndStoreTokens({
        sub: payload.sub,
        tenant_id: payload.tenant_id,
        roles: payload.roles,
        scope: payload.scope ?? "tenant",
        tenant_ids: payload.tenant_ids,
      });

    return c.json({
      access_token: accessToken,
      refresh_token: newRefreshToken,
    });
  } catch {
    return c.json(
      {
        error: { code: "INVALID_TOKEN", message: "Token inválido ou expirado" },
      },
      401,
    );
  }
});

// POST /api/v1/auth/logout — revoga refresh token e encerra sessao
authRoute.post("/logout", jwtAuth, async (c) => {
  const user = c.get("user");
  const parsedBody = await safeJsonBody<RefreshTokenInput>(c).catch(() => null);
  const body = parsedBody?.success ? parsedBody.data : null;
  if (body?.refresh_token) {
    try {
      const payload = verifyToken(body.refresh_token);
      if (payload.type === "refresh") {
        const ttlSeconds = 30 * 24 * 60 * 60;
        await revokeToken(payload.jti, ttlSeconds);
      }
    } catch {
      // Token invalido — ignora silenciosamente
    }
  }
  if (user?.sub) {
    try {
      await writeAuditLog({
        userId: user.sub,
        action: "auth.logout",
        entityType: "users",
        entityId: user.sub,
      });
    } catch {
      // Audit log falhou — nao bloqueia logout
    }
  }
  return c.json({ logged_out: true });
});

// POST /api/v1/auth/revoke
authRoute.post("/revoke", async (c) => {
  try {
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = refreshTokenSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Refresh token inválido",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const payload = verifyToken(parsed.data.refresh_token);
    if (payload.type !== "refresh") {
      return c.json(
        { error: { code: "INVALID_TOKEN", message: "Tipo de token inválido" } },
        401,
      );
    }

    const ttlSeconds = 30 * 24 * 60 * 60;
    await revokeToken(payload.jti, ttlSeconds);

    return c.json({ revoked: true });
  } catch {
    return c.json(
      {
        error: { code: "INVALID_TOKEN", message: "Token inválido ou expirado" },
      },
      401,
    );
  }
});

// GET /api/v1/auth/me
authRoute.get("/me", jwtAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  try {
    const userRow = await withTenantDb(async (db) => {
      const [row] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          fullName: schema.users.fullName,
          isActive: schema.users.isActive,
          mustChangePassword: schema.users.mustChangePassword,
        })
        .from(schema.users)
        .where(eq(schema.users.id, user.sub))
        .limit(1);
      return row;
    });

    if (!userRow) {
      return c.json(
        {
          error: { code: "USER_NOT_FOUND", message: "Usuário não encontrado" },
        },
        404,
      );
    }

    const tenantAuth = await fetchTenantAuth(user.sub);

    return c.json({
      user: userRow,
      scope: user.scope,
      tenants: tenantAuth?.tenants ?? [],
    });
  } catch (error) {
    logger.error("Erro no /me", {
      userId: user.sub,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// GET /api/v1/auth/ws-token — retorna access token para conexao WebSocket
authRoute.get("/ws-token", jwtAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }
  const { signAccessToken } = await import("@repo/auth");
  const token = signAccessToken({
    sub: user.sub,
    tenant_id: user.tenant_id,
    roles: user.roles,
    scope: user.scope,
    tenant_ids: user.tenantIds,
  });
  return c.json({ token });
});

// GET /api/v1/auth/sessions — lista sessões ativas do usuário
authRoute.get("/sessions", jwtAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  try {
    const sessions = await withTenantDb(async (db) => {
      return db
        .select({
          id: schema.sessions.id,
          deviceFingerprint: schema.sessions.deviceFingerprint,
          ipAddress: schema.sessions.ipAddress,
          userAgent: schema.sessions.userAgent,
          deviceLabel: schema.sessions.deviceLabel,
          createdAt: schema.sessions.createdAt,
          expiresAt: schema.sessions.expiresAt,
        })
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.userId, user.sub),
            gt(schema.sessions.expiresAt, new Date()),
          ),
        )
        .orderBy(sql`${schema.sessions.createdAt} DESC`);
    });

    return c.json({ sessions });
  } catch (error) {
    logger.error("Erro ao listar sessões", {
      userId: user.sub,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// DELETE /api/v1/auth/sessions/:sessionId — revoga sessão específica
authRoute.delete("/sessions/:sessionId", jwtAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  const sessionId = c.req.param("sessionId");

  try {
    await revokeSession(user.sub, sessionId);

    await writeAuditLog({
      userId: user.sub,
      action: "auth.session.revoke",
      entityType: "sessions",
      entityId: sessionId,
    });

    return c.json({ revoked: true });
  } catch (error) {
    logger.error("Erro ao revogar sessão", {
      userId: user.sub,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// DELETE /api/v1/auth/sessions — revoga todas as sessões exceto a atual
authRoute.delete("/sessions", jwtAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  try {
    await revokeAllSessions(user.sub);

    await writeAuditLog({
      userId: user.sub,
      action: "auth.session.revoke_all",
      entityType: "sessions",
    });

    return c.json({ revoked_all: true });
  } catch (error) {
    logger.error("Erro ao revogar todas sessões", {
      userId: user.sub,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// GET /api/v1/auth/devices — lista dispositivos confiáveis do usuário
authRoute.get("/devices", jwtAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  try {
    const devices = await withTenantDb(async (db) => {
      return db
        .select({
          id: schema.trustedDevices.id,
          deviceFingerprint: schema.trustedDevices.deviceFingerprint,
          deviceLabel: schema.trustedDevices.deviceLabel,
          ipAddress: schema.trustedDevices.ipAddress,
          userAgent: schema.trustedDevices.userAgent,
          trustedAt: schema.trustedDevices.trustedAt,
          lastSeenAt: schema.trustedDevices.lastSeenAt,
        })
        .from(schema.trustedDevices)
        .where(eq(schema.trustedDevices.userId, user.sub))
        .orderBy(sql`${schema.trustedDevices.lastSeenAt} DESC`);
    });

    return c.json({ devices });
  } catch (error) {
    logger.error("Erro ao listar dispositivos", {
      userId: user.sub,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// DELETE /api/v1/auth/devices/:deviceId — remove dispositivo confiável
authRoute.delete("/devices/:deviceId", jwtAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  const deviceId = c.req.param("deviceId");

  try {
    await withTenantDb(async (db) => {
      // Busca fingerprint do dispositivo
      const [device] = await db
        .select({ deviceFingerprint: schema.trustedDevices.deviceFingerprint })
        .from(schema.trustedDevices)
        .where(
          and(
            eq(schema.trustedDevices.id, deviceId),
            eq(schema.trustedDevices.userId, user.sub),
          ),
        )
        .limit(1);

      if (device) {
        // Remove sessoes associadas ao fingerprint
        await db
          .delete(schema.sessions)
          .where(
            and(
              eq(schema.sessions.userId, user.sub),
              eq(schema.sessions.deviceFingerprint, device.deviceFingerprint),
            ),
          );
      }

      // Remove dispositivo confiavel
      await db
        .delete(schema.trustedDevices)
        .where(
          and(
            eq(schema.trustedDevices.id, deviceId),
            eq(schema.trustedDevices.userId, user.sub),
          ),
        );
    });

    await writeAuditLog({
      userId: user.sub,
      action: "auth.device.revoke",
      entityType: "trusted_devices",
      entityId: deviceId,
    });

    return c.json({ removed: true });
  } catch (error) {
    logger.error("Erro ao remover dispositivo", {
      userId: user.sub,
      deviceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// POST /api/v1/auth/change-password — troca senha (obrigatório no primeiro acesso se must_change_password = true)
authRoute.post("/change-password", jwtAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  try {
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = changePasswordSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const { current_password, new_password } =
      parsed.data as ChangePasswordInput;

    // Busca senha atual do usuário via Drizzle
    const userRow = await withTenantDb(async (db) => {
      const [row] = await db
        .select({ passwordHash: schema.users.passwordHash })
        .from(schema.users)
        .where(eq(schema.users.id, user.sub))
        .limit(1);
      return row;
    });

    if (!userRow) {
      return c.json(
        {
          error: { code: "USER_NOT_FOUND", message: "Usuário não encontrado" },
        },
        404,
      );
    }

    // Verifica senha atual
    let valid = false;
    try {
      valid = await argon2.verify(userRow.passwordHash, current_password);
    } catch (err) {
      logger.error("Erro ao verificar senha atual (argon2)", {
        userId: user.sub,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Senha atual incorreta",
          },
        },
        401,
      );
    }
    if (!valid) {
      return c.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Senha atual incorreta",
          },
        },
        401,
      );
    }

    // Hash da nova senha
    const newHash = await argon2.hash(new_password);

    // Atualiza senha e remove flag must_change_password via Drizzle
    await withTenantDb(async (db) => {
      await db
        .update(schema.users)
        .set({ passwordHash: newHash, mustChangePassword: false })
        .where(eq(schema.users.id, user.sub));
    });

    // Revoga todas as sessões existentes para forçar re-login com nova senha
    await revokeAllSessions(user.sub);

    // Log de auditoria
    await writeAuditLog({
      userId: user.sub,
      action: "auth.change_password",
      entityType: "users",
      entityId: user.sub,
    });

    logger.info("Senha alterada", { userId: user.sub });

    return c.json({ changed: true });
  } catch (error) {
    logger.error("Erro ao trocar senha", {
      userId: user.sub,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao trocar senha" } },
      500,
    );
  }
});

// POST /api/v1/auth/forgot-password — solicita reset de senha por email
// Resposta sempre generica (anti user-enumeration). Rate limit ja aplicado em /auth/*.
authRoute.post("/forgot-password", async (c) => {
  try {
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = forgotPasswordSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Email inválido",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const requestIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    await requestPasswordReset(
      (parsed.data as ForgotPasswordInput).email,
      requestIp,
    );

    return c.json({
      sent: true,
      message:
        "Se o email estiver cadastrado, você receberá um link de recuperação em instantes",
    });
  } catch (error) {
    // Loga erro mas retorna resposta generica (anti user-enumeration)
    logger.error("Erro no forgot-password", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({
      sent: true,
      message:
        "Se o email estiver cadastrado, você receberá um link de recuperação em instantes",
    });
  }
});

// POST /api/v1/auth/reset-password — redefine senha com token valido
authRoute.post("/reset-password", async (c) => {
  try {
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = resetPasswordSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const { token, new_password } = parsed.data as ResetPasswordInput;

    const newHash = await argon2.hash(new_password);
    const result = await consumeResetToken(token, newHash);

    if (!result.success) {
      return c.json(
        {
          error: {
            code: "INVALID_TOKEN",
            message:
              "Link de recuperação inválido ou expirado — solicite um novo",
          },
        },
        400,
      );
    }

    // Log de auditoria
    await writeAuditLog({
      userId: result.userId!,
      action: "auth.reset_password",
      entityType: "users",
      entityId: result.userId,
    });

    logger.info("Senha resetada", { userId: result.userId });

    return c.json({ reset: true });
  } catch (error) {
    logger.error("Erro ao resetar senha", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao resetar senha" } },
      500,
    );
  }
});

// ========== OAuth Google ==========

const googleProvider = new GoogleOAuthProvider();

// GET /api/v1/auth/oauth/google — redirect para Google
authRoute.get("/oauth/google", (c) => {
  try {
    if (!googleProvider.isConfigured()) {
      return c.json(
        {
          error: {
            code: "OAUTH_NOT_CONFIGURED",
            message: "Google OAuth não configurado",
          },
        },
        501,
      );
    }
    const state = crypto.randomUUID();
    const authUrl = googleProvider.getAuthUrl(state);
    return c.json({ redirect_url: authUrl, state });
  } catch (error) {
    logger.error("Erro no oauth/google redirect", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "OAUTH_ERROR", message: "Erro ao gerar URL OAuth" } },
      500,
    );
  }
});

// POST /api/v1/auth/oauth/callback — troca code por tokens
authRoute.post("/oauth/callback", async (c) => {
  try {
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = oauthCallbackSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const body = parsed.data as OauthCallbackInput;

    let provider: GoogleOAuthProvider | null = null;
    if (body.provider === "google") {
      provider = googleProvider;
    } else {
      return c.json(
        {
          error: {
            code: "UNKNOWN_PROVIDER",
            message: `Provider desconhecido: ${body.provider}`,
          },
        },
        400,
      );
    }

    if (!provider.isConfigured()) {
      return c.json(
        {
          error: {
            code: "OAUTH_NOT_CONFIGURED",
            message: `${body.provider} OAuth não configurado`,
          },
        },
        501,
      );
    }

    const tokenResult = await provider.exchangeCode(body.code);
    const userInfo = await provider.getUserInfo(tokenResult.access_token);

    const resolved = await findOrCreateExternalUser(
      { email: userInfo.email, name: userInfo.name },
      "oauth-no-password",
    );

    if ("error" in resolved) {
      return c.json(
        { error: { code: "USER_INACTIVE", message: "Usuário inativo" } },
        403,
      );
    }

    const tenantAuth = await getUserTenantAuth(resolved.id);
    if (!tenantAuth) {
      return c.json(
        {
          error: {
            code: "NO_TENANT_ACCESS",
            message: "Usuário não possui acesso a nenhum tenant",
          },
        },
        403,
      );
    }

    const { accessToken, refreshToken, refreshTokenHash } =
      await generateAndStoreTokens({
        sub: resolved.id,
        tenant_id: tenantAuth.primaryTenantId,
        roles: tenantAuth.roles,
        scope: tenantAuth.scope,
        tenant_ids: tenantAuth.tenantIds,
      });

    await createSession({
      userId: resolved.id,
      refreshTokenHash,
    });

    // Audit log de login OAuth
    try {
      await writeAuditLog({
        userId: resolved.id,
        action: "auth.login.oauth",
        entityType: "users",
        entityId: resolved.id,
        metadata: { provider: body.provider, email: userInfo.email },
      });
    } catch {
      // Audit log falhou — nao bloqueia login
    }

    logger.info("Login OAuth bem-sucedido", {
      userId: resolved.id,
      provider: body.provider,
    });

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: resolved.id,
        email: userInfo.email,
        full_name: userInfo.name,
        is_active: true,
      },
      scope: tenantAuth.scope,
      tenants: tenantAuth.tenants,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Erro no oauth/callback", {
      error: message,
    });
    return c.json({ error: { code: "OAUTH_FAILED", message } }, 500);
  }
});

// ========== LDAP ==========

const ldapProvider = new LdapAuthProvider();

// POST /api/v1/auth/ldap/bind
authRoute.post("/ldap/bind", async (c) => {
  try {
    if (!ldapProvider.isConfigured()) {
      return c.json(
        {
          error: {
            code: "LDAP_NOT_CONFIGURED",
            message: "LDAP não configurado",
          },
        },
        501,
      );
    }

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = ldapBindSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const body = parsed.data as LdapBindInput;

    const ldapUser = await ldapProvider.authenticate(
      body.username,
      body.password,
    );
    if (!ldapUser) {
      try {
        await writeAuditLog({
          userId: null,
          action: "auth.login.ldap_failed",
          entityType: "users",
          entityId: null,
          metadata: { username: body.username },
        });
      } catch {
        // Audit log falhou — nao bloqueia login
      }
      logger.warn("Login LDAP falhou", { username: body.username });
      return c.json(
        {
          error: {
            code: "LDAP_AUTH_FAILED",
            message: "Credenciais LDAP inválidas",
          },
        },
        401,
      );
    }

    const resolved = await findOrCreateExternalUser(
      { email: ldapUser.email, name: ldapUser.name },
      "ldap-no-password",
    );

    if ("error" in resolved) {
      return c.json(
        { error: { code: "USER_INACTIVE", message: "Usuário inativo" } },
        403,
      );
    }

    const tenantAuth = await getUserTenantAuth(resolved.id);
    if (!tenantAuth) {
      return c.json(
        {
          error: {
            code: "NO_TENANT_ACCESS",
            message: "Usuário não possui acesso a nenhum tenant",
          },
        },
        403,
      );
    }

    const { accessToken, refreshToken, refreshTokenHash } =
      await generateAndStoreTokens({
        sub: resolved.id,
        tenant_id: tenantAuth.primaryTenantId,
        roles: tenantAuth.roles,
        scope: tenantAuth.scope,
        tenant_ids: tenantAuth.tenantIds,
      });

    await createSession({
      userId: resolved.id,
      refreshTokenHash,
    });

    // Audit log de login LDAP
    try {
      await writeAuditLog({
        userId: resolved.id,
        action: "auth.login.ldap",
        entityType: "users",
        entityId: resolved.id,
        metadata: { username: body.username, email: ldapUser.email },
      });
    } catch {
      // Audit log falhou — nao bloqueia login
    }

    logger.info("Login LDAP bem-sucedido", {
      userId: resolved.id,
      username: body.username,
    });

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: resolved.id,
        email: ldapUser.email,
        full_name: ldapUser.name,
        is_active: true,
      },
      scope: tenantAuth.scope,
      tenants: tenantAuth.tenants,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Erro no ldap/bind", {
      error: message,
    });
    return c.json({ error: { code: "LDAP_ERROR", message } }, 500);
  }
});
