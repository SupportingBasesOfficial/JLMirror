// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import argon2 from "argon2";
import crypto from "node:crypto";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  GoogleOAuthProvider,
  LdapAuthProvider,
} from "@repo/auth";
import { revokeToken, isTokenRevoked, storeRefreshJti } from "@repo/auth";
import {
  loginInputSchema,
  refreshTokenSchema,
  changePasswordSchema,
  type LoginInput,
  type RefreshTokenInput,
  type ChangePasswordInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import "../types.js";

export const authRoute = new Hono();

// POST /api/v1/auth/login
authRoute.post("/login", async (c) => {
  const body = await c.req.json<LoginInput>();
  const parsed = loginInputSchema.safeParse(body);
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

  const { email, password } = parsed.data;

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
    return c.json(
      { error: { code: "USER_INACTIVE", message: "Usuário inativo" } },
      403,
    );
  }

  // Verifica senha com argon2id
  const valid = await argon2.verify(user.password_hash, password);
  if (!valid) {
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
  const primaryTenantId = tenantsResult.data.rows[0].tenant_id;
  const userScope =
    (tenantsResult.data.rows[0].scope as "global" | "tenant") ?? "tenant";
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

  // Gera tokens JWT
  const accessToken = signAccessToken({
    sub: user.id,
    tenant_id: primaryTenantId,
    roles,
    scope: userScope,
    tenant_ids: tenantIds,
  });

  const refreshToken = signRefreshToken({
    sub: user.id,
    tenant_id: primaryTenantId,
    roles,
    scope: userScope,
    tenant_ids: tenantIds,
  });

  // Extrai jti do refresh token para armazenar no Redis
  const refreshPayload = verifyToken(refreshToken);
  await storeRefreshJti(refreshPayload.jti);

  // Cria sessão em public.sessions com device fingerprint
  const clientFingerprint = body.device_fingerprint as string | undefined;
  const clientIp =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    null;
  const clientUserAgent = c.req.header("user-agent") || null;

  // Hash do refresh token antes de armazenar — protege contra vazamento do banco
  const refreshTokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  const sessionResult = await query(
    `INSERT INTO public.sessions (user_id, refresh_token_hash, expires_at, device_fingerprint, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5::inet, $6)`,
    [
      user.id,
      refreshTokenHash,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      clientFingerprint ?? null,
      clientIp,
      clientUserAgent,
    ],
  );

  if (sessionResult.error) {
    logger.error("Erro ao criar sessao", {
      error: sessionResult.error.message,
    });
  }

  // Registra ou atualiza dispositivo confiável
  if (clientFingerprint) {
    await query(
      `INSERT INTO public.trusted_devices (user_id, device_fingerprint, device_label, ip_address, user_agent, last_seen_at)
       VALUES ($1, $2, $3, $4::inet, $5, now())
       ON CONFLICT (user_id, device_fingerprint) DO UPDATE SET last_seen_at = now(), ip_address = $4::inet, user_agent = $5`,
      [
        user.id,
        clientFingerprint,
        body.device_label ?? null,
        clientIp,
        clientUserAgent,
      ],
    );
  }

  // Atualiza last_login_at
  await query("UPDATE public.users SET last_login_at = now() WHERE id = $1", [
    user.id,
  ]);

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
});

// POST /api/v1/auth/refresh
authRoute.post("/refresh", async (c) => {
  const body = await c.req.json<RefreshTokenInput>();
  const parsed = refreshTokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: { code: "VALIDATION_ERROR", message: "Refresh token inválido" },
      },
      400,
    );
  }

  try {
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
    const accessToken = signAccessToken({
      sub: payload.sub,
      tenant_id: payload.tenant_id,
      roles: payload.roles,
      scope: payload.scope ?? "tenant",
      tenant_ids: payload.tenant_ids,
    });

    const newRefreshToken = signRefreshToken({
      sub: payload.sub,
      tenant_id: payload.tenant_id,
      roles: payload.roles,
      scope: payload.scope ?? "tenant",
      tenant_ids: payload.tenant_ids,
    });

    const newPayload = verifyToken(newRefreshToken);
    await storeRefreshJti(newPayload.jti);

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
  const body = await c.req.json<RefreshTokenInput>().catch(() => null);
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
  return c.json({ logged_out: true });
});

// POST /api/v1/auth/revoke
authRoute.post("/revoke", async (c) => {
  const body = await c.req.json<RefreshTokenInput>();
  const parsed = refreshTokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: { code: "VALIDATION_ERROR", message: "Refresh token inválido" },
      },
      400,
    );
  }

  try {
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
      { error: { code: "USER_NOT_FOUND", message: "Usuário não encontrado" } },
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

  const result = await query(
    `SELECT id, device_fingerprint, ip_address, user_agent, device_label,
       created_at, expires_at
     FROM public.sessions
     WHERE user_id = $1 AND expires_at > now()
     ORDER BY created_at DESC`,
    [user.sub],
  );

  return c.json({ sessions: result.data?.rows ?? [] });
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

  await query("DELETE FROM public.sessions WHERE id = $1 AND user_id = $2", [
    sessionId,
    user.sub,
  ]);

  await query(
    "SELECT public.write_audit_log($1, NULL, 'auth.session.revoke', 'sessions', $2, NULL, NULL, NULL)",
    [user.sub, sessionId],
  );

  return c.json({ revoked: true });
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

  // Remove todas as sessões do usuário (força re-login em todos os dispositivos)
  await query("DELETE FROM public.sessions WHERE user_id = $1", [user.sub]);

  await query(
    "SELECT public.write_audit_log($1, NULL, 'auth.session.revoke_all', 'sessions', NULL, NULL, NULL, NULL)",
    [user.sub],
  );

  return c.json({ revoked_all: true });
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

  const result = await query(
    `SELECT id, device_fingerprint, device_label, ip_address, user_agent, trusted_at, last_seen_at
     FROM public.trusted_devices
     WHERE user_id = $1
     ORDER BY last_seen_at DESC`,
    [user.sub],
  );

  return c.json({ devices: result.data?.rows ?? [] });
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

  await query(
    "SELECT public.write_audit_log($1, NULL, 'auth.device.revoke', 'trusted_devices', $2, NULL, NULL, NULL)",
    [user.sub, deviceId],
  );

  return c.json({ removed: true });
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

  const body = await c.req.json<ChangePasswordInput>();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
      400,
    );
  }

  const { current_password, new_password } = parsed.data;

  // Busca senha atual do usuário
  const userResult = await query<{ password_hash: string }>(
    "SELECT password_hash FROM public.users WHERE id = $1",
    [user.sub],
  );

  if (userResult.error || !userResult.data?.rows[0]) {
    return c.json(
      { error: { code: "USER_NOT_FOUND", message: "Usuário não encontrado" } },
      404,
    );
  }

  // Verifica senha atual
  const valid = await argon2.verify(
    userResult.data.rows[0].password_hash,
    current_password,
  );
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
  await query("DELETE FROM public.sessions WHERE user_id = $1", [user.sub]);

  // Log de auditoria
  await query(
    "SELECT public.write_audit_log($1, NULL, 'auth.change_password', 'users', $2, NULL, NULL, NULL)",
    [user.sub, user.sub],
  );

  return c.json({ changed: true });
});

// ========== OAuth Google ==========

const googleProvider = new GoogleOAuthProvider();

// GET /api/v1/auth/oauth/google — redirect para Google
authRoute.get("/oauth/google", (c) => {
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
});

// POST /api/v1/auth/oauth/callback — troca code por tokens
authRoute.post("/oauth/callback", async (c) => {
  const body = await c.req.json<{ code: string; provider: string }>();
  if (!body.code || !body.provider) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "code e provider são obrigatórios",
        },
      },
      400,
    );
  }

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

  try {
    const tokenResult = await provider.exchangeCode(body.code);
    const userInfo = await provider.getUserInfo(tokenResult.access_token);

    // Busca ou cria usuário por email
    const existingUser = await query<{
      id: string;
      email: string;
      full_name: string | null;
      is_active: boolean;
    }>(
      "SELECT id, email, full_name, is_active FROM public.users WHERE email = $1",
      [userInfo.email],
    );

    let userId: string;

    if (existingUser.data?.rows[0]) {
      if (!existingUser.data.rows[0].is_active) {
        return c.json(
          { error: { code: "USER_INACTIVE", message: "Usuário inativo" } },
          403,
        );
      }
      userId = existingUser.data.rows[0].id;
    } else {
      // Cria usuário sem senha (auth externo)
      const newUser = await query<{ id: string }>(
        "INSERT INTO public.users (email, password_hash, full_name, is_active) VALUES ($1, $2, $3, true) RETURNING id",
        [userInfo.email, "oauth-no-password", userInfo.name],
      );
      userId = newUser.data?.rows[0]?.id as string;
    }

    // Busca tenants
    const tenantsResult = await query<{
      tenant_id: string;
      role: string;
      scope: string;
    }>("SELECT * FROM public.get_tenant_user_auth($1)", [userId]);

    if (!tenantsResult.data?.rows.length) {
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
    const primaryTenantId = tenantsResult.data.rows[0].tenant_id;
    const userScope =
      (tenantsResult.data.rows[0].scope as "global" | "tenant") ?? "tenant";
    const tenantIds = tenantsResult.data.rows.map((r) => r.tenant_id);

    const accessToken = signAccessToken({
      sub: userId,
      tenant_id: primaryTenantId,
      roles,
      scope: userScope,
      tenant_ids: tenantIds,
    });
    const refreshToken = signRefreshToken({
      sub: userId,
      tenant_id: primaryTenantId,
      roles,
      scope: userScope,
      tenant_ids: tenantIds,
    });
    const refreshPayload = verifyToken(refreshToken);
    await storeRefreshJti(refreshPayload.jti);

    await query(
      "INSERT INTO public.sessions (user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3)",
      [
        userId,
        refreshToken,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      ],
    );

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: userId,
        email: userInfo.email,
        full_name: userInfo.name,
        is_active: true,
      },
      tenants: tenantsResult.data.rows.map((r) => ({
        tenant_id: r.tenant_id,
        role: r.role,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ error: { code: "OAUTH_FAILED", message } }, 500);
  }
});

// ========== LDAP ==========

const ldapProvider = new LdapAuthProvider();

// POST /api/v1/auth/ldap/bind
authRoute.post("/ldap/bind", async (c) => {
  if (!ldapProvider.isConfigured()) {
    return c.json(
      {
        error: { code: "LDAP_NOT_CONFIGURED", message: "LDAP não configurado" },
      },
      501,
    );
  }

  const body = await c.req.json<{ username: string; password: string }>();
  if (!body.username || !body.password) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "username e password são obrigatórios",
        },
      },
      400,
    );
  }

  try {
    const ldapUser = await ldapProvider.authenticate(
      body.username,
      body.password,
    );
    if (!ldapUser) {
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

    // Busca ou cria usuário por email
    const existingUser = await query<{
      id: string;
      email: string;
      full_name: string | null;
      is_active: boolean;
    }>(
      "SELECT id, email, full_name, is_active FROM public.users WHERE email = $1",
      [ldapUser.email],
    );

    let userId: string;

    if (existingUser.data?.rows[0]) {
      if (!existingUser.data.rows[0].is_active) {
        return c.json(
          { error: { code: "USER_INACTIVE", message: "Usuário inativo" } },
          403,
        );
      }
      userId = existingUser.data.rows[0].id;
    } else {
      const newUser = await query<{ id: string }>(
        "INSERT INTO public.users (email, password_hash, full_name, is_active) VALUES ($1, $2, $3, true) RETURNING id",
        [ldapUser.email, "ldap-no-password", ldapUser.name],
      );
      userId = newUser.data?.rows[0]?.id as string;
    }

    const tenantsResult = await query<{
      tenant_id: string;
      role: string;
      scope: string;
    }>("SELECT * FROM public.get_tenant_user_auth($1)", [userId]);

    if (!tenantsResult.data?.rows.length) {
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
    const primaryTenantId = tenantsResult.data.rows[0].tenant_id;
    const userScope =
      (tenantsResult.data.rows[0].scope as "global" | "tenant") ?? "tenant";
    const tenantIds = tenantsResult.data.rows.map((r) => r.tenant_id);

    const accessToken = signAccessToken({
      sub: userId,
      tenant_id: primaryTenantId,
      roles,
      scope: userScope,
      tenant_ids: tenantIds,
    });
    const refreshToken = signRefreshToken({
      sub: userId,
      tenant_id: primaryTenantId,
      roles,
      scope: userScope,
      tenant_ids: tenantIds,
    });
    const refreshPayload = verifyToken(refreshToken);
    await storeRefreshJti(refreshPayload.jti);

    await query(
      "INSERT INTO public.sessions (user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3)",
      [
        userId,
        refreshToken,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      ],
    );

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: userId,
        email: ldapUser.email,
        full_name: ldapUser.name,
        is_active: true,
      },
      tenants: tenantsResult.data.rows.map((r) => ({
        tenant_id: r.tenant_id,
        role: r.role,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ error: { code: "LDAP_ERROR", message } }, 500);
  }
});
