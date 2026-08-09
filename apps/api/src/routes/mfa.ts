// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
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
  mfaDisableSchema,
  type MfaVerifyInput,
  type MfaDisableInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const mfaRoute = new Hono();

// GET /api/v1/mfa — status MFA do usuario atual
mfaRoute.get(
  "/",
  requirePermission("self:mfa:write"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
        401,
      );
    }

    try {
      const result = await query<{
        mfa_enabled: boolean;
        mfa_method: string | null;
      }>("SELECT mfa_enabled, mfa_method FROM public.users WHERE id = $1", [
        user.sub,
      ]);

      return c.json({
        enabled: result.data?.rows[0]?.mfa_enabled ?? false,
        method: result.data?.rows[0]?.mfa_method ?? null,
        endpoints: [
          "/setup",
          "/verify",
          "/disable",
          "/status",
          "/recovery-codes",
        ],
      });
    } catch (error) {
      logger.error("Erro ao buscar status MFA", {
        userId: user.sub,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/mfa/setup — inicia configuração TOTP (retorna secret + QR code + recovery codes)
mfaRoute.post(
  "/setup",
  requirePermission("self:mfa:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
        401,
      );
    }

    try {
      // Busca email do usuário
      const userResult = await query<{ email: string }>(
        "SELECT email FROM public.users WHERE id = $1",
        [user.sub],
      );

      if (userResult.error || !userResult.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "USER_NOT_FOUND",
              message: "Usuário não encontrado",
            },
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
              message:
                "MFA já está habilitado. Desative antes de reconfigurar.",
            },
          },
          409,
        );
      }

      // Gera setup TOTP
      const setup = generateTotpSetup(email);

      // Armazena secret temporariamente (não habilitado até verificação)
      const recoveryHashed = await hashRecoveryCodes(setup.recovery_codes);

      await query(
        `INSERT INTO public.user_mfa_totp (user_id, secret, recovery_codes, is_enabled)
       VALUES ($1, $2, $3, false)
       ON CONFLICT (user_id) DO UPDATE SET secret = $2, recovery_codes = $3, is_enabled = false, updated_at = timezone('utc'::text, now())`,
        [user.sub, setup.secret, JSON.stringify(recoveryHashed)],
      );

      logger.info("MFA setup iniciado", { userId: user.sub });

      return c.json({
        secret: setup.secret,
        qr_code_uri: setup.qr_code_uri,
        recovery_codes: setup.recovery_codes,
      });
    } catch (error) {
      logger.error("Erro ao iniciar MFA setup", {
        userId: user.sub,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/mfa/setup/verify — confirma setup TOTP com primeiro código
mfaRoute.post(
  "/setup/verify",
  requirePermission("self:mfa:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
        401,
      );
    }

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = mfaSetupVerifySchema.safeParse(parsedBody.data);
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

    try {
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
      const valid = verifyTotpCode(record.secret, parsed.data.code);
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

      // Atualiza flag na tabela users
      await query(
        "UPDATE public.users SET mfa_enabled = true, mfa_method = 'totp' WHERE id = $1",
        [user.sub],
      );

      try {
        await writeAuditLog({
          userId: user.sub,
          tenantId: null,
          action: "mfa.enable",
          entityType: "user",
          entityId: user.sub,
        });
      } catch {
        // Audit log falhou — nao bloqueia
      }

      logger.info("MFA habilitado", { userId: user.sub });

      return c.json({ enabled: true });
    } catch (error) {
      logger.error("Erro ao verificar MFA setup", {
        userId: user.sub,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/mfa/verify — verifica código TOTP durante login (segundo fator)
// Sem auth — endpoint publico usado durante fluxo de login
mfaRoute.post("/verify", rateLimitWrite, async (c) => {
  const parsedBody = await safeJsonBody(c);
  if (!parsedBody.success) return parsedBody.response;
  const parsed = mfaVerifySchema.safeParse(parsedBody.data);
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

  const data = parsed.data as MfaVerifyInput;

  try {
    // Busca challenge
    const challengeResult = await query<{
      user_id: string;
      expires_at: string;
      consumed: boolean;
    }>(
      "SELECT user_id, expires_at, consumed FROM public.mfa_challenges WHERE challenge_token = $1",
      [data.challenge_token],
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
    const totpResult = await query<{
      secret: string;
      recovery_codes: string[];
    }>(
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
    const valid = verifyTotpCode(totp.secret, data.code);

    if (!valid) {
      // Verifica se é recovery code
      const recoveryCodes = totp.recovery_codes as unknown as string[];
      if (!verifyRecoveryCode(data.code, recoveryCodes)) {
        logger.warn("MFA codigo invalido", { userId: challenge.user_id });
        return c.json(
          { error: { code: "INVALID_CODE", message: "Código TOTP inválido" } },
          401,
        );
      }
    }

    // Marca challenge como consumido
    await query(
      "UPDATE public.mfa_challenges SET consumed = true WHERE challenge_token = $1",
      [data.challenge_token],
    );

    // Busca dados do usuário para gerar tokens
    const userResult = await query<{
      id: string;
      email: string;
      full_name: string | null;
      is_active: boolean;
    }>(
      "SELECT id, email, full_name, is_active FROM public.users WHERE id = $1",
      [challenge.user_id],
    );

    if (userResult.error || !userResult.data?.rows[0]) {
      return c.json(
        {
          error: { code: "USER_NOT_FOUND", message: "Usuário não encontrado" },
        },
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

    try {
      await writeAuditLog({
        userId: userRow.id,
        tenantId: primaryTenantId,
        action: "auth.login.mfa",
        entityType: "user",
        entityId: userRow.id,
      });
    } catch {
      // Audit log falhou — nao bloqueia
    }

    logger.info("Login MFA concluído", { userId: userRow.id });

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
  } catch (error) {
    logger.error("Erro ao verificar MFA login", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// POST /api/v1/mfa/disable — desabilita MFA (requer auth + código TOTP)
mfaRoute.post(
  "/disable",
  requirePermission("self:mfa:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
        401,
      );
    }

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = mfaDisableSchema.safeParse(parsedBody.data);
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

    const data = parsed.data as MfaDisableInput;

    try {
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

      const valid = verifyTotpCode(data.code, result.data.rows[0].secret);
      if (!valid) {
        return c.json(
          { error: { code: "INVALID_CODE", message: "Código TOTP inválido" } },
          401,
        );
      }

      await query("DELETE FROM public.user_mfa_totp WHERE user_id = $1", [
        user.sub,
      ]);

      // Atualiza flag na tabela users
      await query(
        "UPDATE public.users SET mfa_enabled = false, mfa_method = NULL WHERE id = $1",
        [user.sub],
      );

      try {
        await writeAuditLog({
          userId: user.sub,
          tenantId: null,
          action: "mfa.disable",
          entityType: "user",
          entityId: user.sub,
        });
      } catch {
        // Audit log falhou — nao bloqueia
      }

      logger.info("MFA desabilitado", { userId: user.sub });

      return c.json({ disabled: true });
    } catch (error) {
      logger.error("Erro ao desabilitar MFA", {
        userId: user.sub,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/mfa/status — verifica se MFA está habilitado
mfaRoute.get(
  "/status",
  requirePermission("self:mfa:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
        401,
      );
    }

    try {
      // Paraleliza 2 queries independentes
      const [result, webauthnResult] = await Promise.all([
        query<{ is_enabled: boolean }>(
          "SELECT is_enabled FROM public.user_mfa_totp WHERE user_id = $1",
          [user.sub],
        ),
        query<{ count: string }>(
          "SELECT COUNT(*) as count FROM public.user_webauthn_credentials WHERE user_id = $1 AND is_enabled = true",
          [user.sub],
        ),
      ]);

      return c.json({
        totp_enabled: result.data?.rows[0]?.is_enabled ?? false,
        webauthn_enabled:
          parseInt(webauthnResult.data?.rows[0]?.count ?? "0", 10) > 0,
        webauthn_credentials: parseInt(
          webauthnResult.data?.rows[0]?.count ?? "0",
          10,
        ),
      });
    } catch (error) {
      logger.error("Erro ao buscar status MFA", {
        userId: user.sub,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);
