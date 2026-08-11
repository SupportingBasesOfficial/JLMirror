// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import argon2 from "argon2";
import crypto from "node:crypto";
import { query } from "@repo/db";
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
            code: "INVALID_CREDENTIALS",
            message: "Email ou senha inválidos",
          },
        },
        401,
      );
    }

    const { email, password } = parsed.data as LoginInput;
    const clientIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      null;

    // Busca usuário global em public.users
    const userResult = await query<{
      id: string;
      email: string;
      password_hash: string;
      full_name: string | null;
      is_active: boolean;
      must_change_password: boolean;
    }>(
      "SELECT id, email, password_hash, full_name, is_active, must_change_password FROM public.users WHERE email = $1",
      [email],
    );

    if (userResult.error || !userResult.data?.rows[0]) {
      // Audit log de login falhado (usuario nao encontrado)
      try {
        await writeAuditLog({
          userId: null,
          action: "auth.login.failed",
          entityType: "users",
          entityId: null,
          metadata: { email, reason: "user_not_found", ip: clientIp },
        });
      } catch {
        // Audit log falhou — nao bloqueia login
      }
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

    const user = userResult.data.rows[0];
    if (!user.is_active) {
      try {
        await writeAuditLog({
          userId: user.id,
          action: "auth.login.failed",
          entityType: "users",
          entityId: user.id,
          metadata: { reason: "user_inactive", ip: clientIp },
        });
      } catch {
        // Audit log falhou — nao bloqueia login
      }
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
      valid = await argon2.verify(user.password_hash, password);
    } catch (err) {
      // Hash malformado ou erro interno do argon2
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
      try {
        await writeAuditLog({
          userId: user.id,
          action: "auth.login.failed",
          entityType: "users",
          entityId: user.id,
          metadata: { reason: "invalid_password", ip: clientIp },
        });
      } catch {
        // Audit log falhou — nao bloqueia login
      }
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
    const tenantsResult = await query<{
      tenant_id: string;
      role: string;
      scope: string;
    }>("SELECT * FROM public.get_tenant_user_auth($1)", [user.id]);

    if (tenantsResult.error || !tenantsResult.data?.rows.length) {
      try {
        await writeAuditLog({
          userId: user.id,
          action: "auth.login.failed",
          entityType: "users",
          entityId: user.id,
          metadata: { reason: "no_tenant_access", ip: clientIp },
        });
      } catch {
        // Audit log falhou — nao bloqueia login
      }
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

    const roles = tenantsResult.data.rows.map((r) => r.role);
    const primaryTenantId = tenantsResult.data.rows[0]!.tenant_id;
    const userScope = tenantsResult.data.rows[0]!.scope as "global" | "tenant";
    const tenantIds = tenantsResult.data.rows.map((r) => r.tenant_id);

    // Verifica se usuário tem MFA TOTP habilitado
    const mfaResult = await query<{ is_enabled: boolean }>(
      "SELECT is_enabled FROM public.user_mfa_totp WHERE user_id = $1",
      [user.id],
    );

    const mfaEnabled = mfaResult.data?.rows[0]?.is_enabled === true;

    if (mfaEnabled) {
      // Cria challenge MFA em vez de retornar tokens
      const challengeToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      await query(
        "INSERT INTO public.mfa_challenges (user_id, method, challenge_token, expires_at) VALUES ($1, 'totp', $2, $3)",
        [user.id, challengeToken, expiresAt],
      );

      logger.info("Login: MFA requerido", { userId: user.id });
      return c.json({
        mfa_required: true,
        mfa_method: "totp",
        challenge_token: challengeToken,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
        },
      });
    }

    // Gera tokens JWT e armazena jti no Redis (helper centralizado)
    const { accessToken, refreshToken, refreshTokenHash } =
      await generateAndStoreTokens({
        sub: user.id,
        tenant_id: primaryTenantId,
        roles,
        scope: userScope,
        tenant_ids: tenantIds,
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
        full_name: user.full_name,
        is_active: user.is_active,
        must_change_password: user.must_change_password,
      },
      scope: userScope,
      tenants: tenantsResult.data.rows.map((r) => ({
        tenant_id: r.tenant_id,
        role: r.role,
        scope: r.scope,
      })),
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
    const userResult = await query<{
      id: string;
      email: string;
      full_name: string | null;
      is_active: boolean;
      must_change_password: boolean;
    }>(
      "SELECT id, email, full_name, is_active, must_change_password FROM public.users WHERE id = $1",
      [user.sub],
    );

    if (userResult.error || !userResult.data?.rows[0]) {
      return c.json(
        {
          error: { code: "USER_NOT_FOUND", message: "Usuário não encontrado" },
        },
        404,
      );
    }

    const tenantsResult = await query<{
      tenant_id: string;
      role: string;
      scope: string;
    }>("SELECT * FROM public.get_tenant_user_auth($1)", [user.sub]);

    return c.json({
      user: userResult.data.rows[0],
      scope: user.scope,
      tenants: tenantsResult.data?.rows ?? [],
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
// Necessario porque o cookie é HttpOnly e o frontend nao consegue ler direto
// O token ja tem TTL curto (15min) e é valido apenas para o usuario autenticado
authRoute.get("/ws-token", jwtAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }
  // Re-emite um access token fresco para o WS com TTL padrao
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
    const result = await query(
      `SELECT id, device_fingerprint, ip_address, user_agent, device_label,
         created_at, expires_at
       FROM public.sessions
       WHERE user_id = $1 AND expires_at > now()
       ORDER BY created_at DESC`,
      [user.sub],
    );

    return c.json({ sessions: result.data?.rows ?? [] });
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
    // Remove todas as sessões do usuário (força re-login em todos os dispositivos)
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
    const result = await query(
      `SELECT id, device_fingerprint, device_label, ip_address, user_agent, trusted_at, last_seen_at
       FROM public.trusted_devices
       WHERE user_id = $1
       ORDER BY last_seen_at DESC`,
      [user.sub],
    );

    return c.json({ devices: result.data?.rows ?? [] });
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
    // Remove dispositivo confiável e todas as sessões associadas ao fingerprint
    const deviceResult = await query<{ device_fingerprint: string }>(
      "SELECT device_fingerprint FROM public.trusted_devices WHERE id = $1 AND user_id = $2",
      [deviceId, user.sub],
    );

    if (deviceResult.data?.rows[0]) {
      const fingerprint = deviceResult.data.rows[0].device_fingerprint;
      await query(
        "DELETE FROM public.sessions WHERE user_id = $1 AND device_fingerprint = $2",
        [user.sub, fingerprint],
      );
    }

    await query(
      "DELETE FROM public.trusted_devices WHERE id = $1 AND user_id = $2",
      [deviceId, user.sub],
    );

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

    // Busca senha atual do usuário
    const userResult = await query<{ password_hash: string }>(
      "SELECT password_hash FROM public.users WHERE id = $1",
      [user.sub],
    );

    if (userResult.error || !userResult.data?.rows[0]) {
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
      valid = await argon2.verify(
        userResult.data.rows[0].password_hash,
        current_password,
      );
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

    // Atualiza senha e remove flag must_change_password
    await query(
      "UPDATE public.users SET password_hash = $1, must_change_password = false WHERE id = $2",
      [newHash, user.sub],
    );

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
          },
        },
        400,
      );
    }

    const requestIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    // Processamento assincrono nao-bloqueante seria ideal, mas await mantem
    // timing constante independente do email existir ou nao
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
