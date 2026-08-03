// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import {
  generateTotpSetup,
  verifyTotpCode,
  hashRecoveryCodes,
  verifyRecoveryCode,
  generateAndStoreTokens,
} from "@repo/auth";
import {
  mfaSetupVerifySchema,
  mfaVerifySchema,
  type MfaSetupVerifyInput,
  type MfaVerifyInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const mfaRoute = new Hono();

// POST /api/v1/mfa/setup — inicia configuração TOTP (retorna secret + QR code + recovery codes)
mfaRoute.post(
  "/setup",
  jwtAuth,
  tenantContext,
  requirePermission("self:mfa:write"),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
        401,
      );
    }

    // Busca email do usuário
    const userResult = await query<{ email: string }>(
      "SELECT email FROM public.users WHERE id = $1",
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

    const email = userResult.data.rows[0].email;

    // Verifica se já tem MFA habilitado
    const existingResult = await query<{ is_enabled: boolean }>(
      "SELECT is_enabled FROM public.user_mfa_totp WHERE user_id = $1",
      [user.sub],
    );

    if (existingResult.data?.rows[0]?.is_enabled) {
      return c.json(
        {
          error: {
            code: "MFA_ALREADY_ENABLED",
            message: "MFA já está habilitado. Desative antes de reconfigurar.",
          },
        },
        409,
      );
    }

    // Gera setup TOTP
    const setup = generateTotpSetup(email);

    // Armazena secret temporariamente (não habilitado até verificação)
    const recoveryHashed = hashRecoveryCodes(setup.recovery_codes);

    await query(
      `INSERT INTO public.user_mfa_totp (user_id, secret, recovery_codes, is_enabled)
     VALUES ($1, $2, $3, false)
     ON CONFLICT (user_id) DO UPDATE SET secret = $2, recovery_codes = $3, is_enabled = false, updated_at = timezone('utc'::text, now())`,
      [user.sub, setup.secret, JSON.stringify(recoveryHashed)],
    );

    return c.json({
      secret: setup.secret,
      qr_code_uri: setup.qr_code_uri,
      recovery_codes: setup.recovery_codes,
    });
  },
);

// POST /api/v1/mfa/setup/verify — confirma setup TOTP com primeiro código
mfaRoute.post(
  "/setup/verify",
  jwtAuth,
  tenantContext,
  requirePermission("self:mfa:write"),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
        401,
      );
    }

    const body = await c.req.json<MfaSetupVerifyInput>();
    const parsed = mfaSetupVerifySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    // Busca secret pendente
    const result = await query<{ secret: string; is_enabled: boolean }>(
      "SELECT secret, is_enabled FROM public.user_mfa_totp WHERE user_id = $1",
      [user.sub],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "MFA_NOT_SETUP",
            message: "MFA não foi iniciado. Chame /mfa/setup primeiro.",
          },
        },
        404,
      );
    }

    const record = result.data.rows[0];
    if (record.is_enabled) {
      return c.json(
        {
          error: {
            code: "MFA_ALREADY_ENABLED",
            message: "MFA já está habilitado",
          },
        },
        409,
      );
    }

    // Verifica o código TOTP
    const valid = verifyTotpCode(parsed.data.code, record.secret);
    if (!valid) {
      return c.json(
        { error: { code: "INVALID_CODE", message: "Código TOTP inválido" } },
        401,
      );
    }

    // Habilita MFA
    await query(
      "UPDATE public.user_mfa_totp SET is_enabled = true, updated_at = timezone('utc'::text, now()) WHERE user_id = $1",
      [user.sub],
    );

    // Registra auditoria
    await query(
      "SELECT public.write_audit_log($1, NULL, 'mfa.enable', 'user', $2, NULL, NULL, NULL)",
      [user.sub, user.sub],
    );

    return c.json({ enabled: true });
  },
);

// POST /api/v1/mfa/verify — verifica código TOTP durante login (segundo fator)
mfaRoute.post("/verify", async (c) => {
  const body = await c.req.json<MfaVerifyInput>();
  const parsed = mfaVerifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
      400,
    );
  }

  // Busca challenge
  const challengeResult = await query<{
    user_id: string;
    expires_at: string;
    consumed: boolean;
  }>(
    "SELECT user_id, expires_at, consumed FROM public.mfa_challenges WHERE challenge_token = $1",
    [parsed.data.challenge_token],
  );

  if (challengeResult.error || !challengeResult.data?.rows[0]) {
    return c.json(
      {
        error: {
          code: "INVALID_CHALLENGE",
          message: "Challenge inválido ou expirado",
        },
      },
      401,
    );
  }

  const challenge = challengeResult.data.rows[0];
  if (challenge.consumed) {
    return c.json(
      {
        error: {
          code: "CHALLENGE_CONSUMED",
          message: "Challenge já utilizado",
        },
      },
      401,
    );
  }

  if (new Date(challenge.expires_at) < new Date()) {
    return c.json(
      { error: { code: "CHALLENGE_EXPIRED", message: "Challenge expirado" } },
      401,
    );
  }

  // Busca secret TOTP do usuário
  const totpResult = await query<{ secret: string; recovery_codes: string[] }>(
    "SELECT secret, recovery_codes FROM public.user_mfa_totp WHERE user_id = $1 AND is_enabled = true",
    [challenge.user_id],
  );

  if (totpResult.error || !totpResult.data?.rows[0]) {
    return c.json(
      {
        error: {
          code: "MFA_NOT_ENABLED",
          message: "MFA não habilitado para este usuário",
        },
      },
      404,
    );
  }

  const totp = totpResult.data.rows[0];
  const valid = verifyTotpCode(parsed.data.code, totp.secret);

  if (!valid) {
    // Verifica se é recovery code
    const recoveryCodes = totp.recovery_codes as unknown as string[];
    if (!verifyRecoveryCode(parsed.data.code, recoveryCodes)) {
      return c.json(
        { error: { code: "INVALID_CODE", message: "Código TOTP inválido" } },
        401,
      );
    }
  }

  // Marca challenge como consumido
  await query(
    "UPDATE public.mfa_challenges SET consumed = true WHERE challenge_token = $1",
    [parsed.data.challenge_token],
  );

  // Busca dados do usuário para gerar tokens
  const userResult = await query<{
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
  }>("SELECT id, email, full_name, is_active FROM public.users WHERE id = $1", [
    challenge.user_id,
  ]);

  if (userResult.error || !userResult.data?.rows[0]) {
    return c.json(
      { error: { code: "USER_NOT_FOUND", message: "Usuário não encontrado" } },
      404,
    );
  }

  const userRow = userResult.data.rows[0];

  // Busca tenants e roles
  const tenantsResult = await query<{
    tenant_id: string;
    role: string;
    scope: string;
  }>("SELECT * FROM public.get_tenant_user_auth($1)", [userRow.id]);

  const roles = tenantsResult.data?.rows.map((r) => r.role) ?? [];
  const primaryTenantId = tenantsResult.data?.rows[0]?.tenant_id ?? "";
  const userScope = tenantsResult.data?.rows[0]?.scope as
    "global" | "tenant" | undefined;
  if (!userScope) {
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
  const tenantIds = tenantsResult.data?.rows.map((r) => r.tenant_id) ?? [];

  // Gera tokens JWT
  const { accessToken, refreshToken } = await generateAndStoreTokens({
    sub: userRow.id,
    tenant_id: primaryTenantId,
    roles,
    scope: userScope,
    tenant_ids: tenantIds,
  });

  // Registra auditoria
  await query(
    "SELECT public.write_audit_log($1, NULL, 'auth.login.mfa', 'user', $2, NULL, NULL, NULL)",
    [userRow.id, userRow.id],
  );

  return c.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: userRow.id,
      email: userRow.email,
      full_name: userRow.full_name,
      is_active: userRow.is_active,
    },
    scope: userScope,
    tenants:
      tenantsResult.data?.rows.map((r) => ({
        tenant_id: r.tenant_id,
        role: r.role,
        scope: r.scope,
      })) ?? [],
  });
});

// POST /api/v1/mfa/disable — desabilita MFA (requer auth + código TOTP)
mfaRoute.post(
  "/disable",
  jwtAuth,
  tenantContext,
  requirePermission("self:mfa:write"),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
        401,
      );
    }

    const body = await c.req.json<{ code?: string }>();
    if (!body.code || !/^\d{6}$/.test(body.code)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Código TOTP de 6 dígitos é obrigatório",
          },
        },
        400,
      );
    }

    const result = await query<{ secret: string }>(
      "SELECT secret FROM public.user_mfa_totp WHERE user_id = $1 AND is_enabled = true",
      [user.sub],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "MFA_NOT_ENABLED",
            message: "MFA não está habilitado",
          },
        },
        404,
      );
    }

    const valid = verifyTotpCode(body.code, result.data.rows[0].secret);
    if (!valid) {
      return c.json(
        { error: { code: "INVALID_CODE", message: "Código TOTP inválido" } },
        401,
      );
    }

    await query("DELETE FROM public.user_mfa_totp WHERE user_id = $1", [
      user.sub,
    ]);

    // Registra auditoria
    await query(
      "SELECT public.write_audit_log($1, NULL, 'mfa.disable', 'user', $2, NULL, NULL, NULL)",
      [user.sub, user.sub],
    );

    return c.json({ disabled: true });
  },
);

// GET /api/v1/mfa/status — verifica se MFA está habilitado
mfaRoute.get(
  "/status",
  jwtAuth,
  tenantContext,
  requirePermission("self:mfa:read"),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
        401,
      );
    }

    const result = await query<{ is_enabled: boolean }>(
      "SELECT is_enabled FROM public.user_mfa_totp WHERE user_id = $1",
      [user.sub],
    );

    const webauthnResult = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM public.user_webauthn_credentials WHERE user_id = $1 AND is_enabled = true",
      [user.sub],
    );

    return c.json({
      totp_enabled: result.data?.rows[0]?.is_enabled ?? false,
      webauthn_enabled:
        parseInt(webauthnResult.data?.rows[0]?.count ?? "0", 10) > 0,
      webauthn_credentials: parseInt(
        webauthnResult.data?.rows[0]?.count ?? "0",
        10,
      ),
    });
  },
);
