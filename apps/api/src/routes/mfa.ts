// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Rotas MFA — refatoradas para Drizzle ORM + error handling padronizado.
//
// PADRAO DE ERROR HANDLING:
//   400 — VALIDATION_ERROR (Zod), INVALID_TOKEN (reset token)
//   401 — INVALID_CODE, INVALID_CHALLENGE, CHALLENGE_CONSUMED, CHALLENGE_EXPIRED
//   403 — FORBIDDEN (RBAC denial via requirePermission)
//   404 — USER_NOT_FOUND, MFA_NOT_SETUP, MFA_NOT_ENABLED
//   409 — MFA_ALREADY_ENABLED
//   500 — INTERNAL_ERROR
import { Hono } from "hono";
import { withTenantDb, schema } from "@repo/db/drizzle";
import { eq, and } from "drizzle-orm";
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
import { getUserTenantAuth } from "../lib/external-auth.js";
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
      const mfaStatus = await withTenantDb(async (db) => {
        const [row] = await db
          .select({ isEnabled: schema.userMfaTotp.isEnabled })
          .from(schema.userMfaTotp)
          .where(eq(schema.userMfaTotp.userId, user.sub))
          .limit(1);
        return row?.isEnabled ?? false;
      });

      return c.json({
        enabled: mfaStatus,
        method: mfaStatus ? "totp" : null,
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
      // Busca email do usuário via Drizzle
      const email = await withTenantDb(async (db) => {
        const [row] = await db
          .select({ email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, user.sub))
          .limit(1);
        return row?.email;
      });

      if (!email) {
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

      // Verifica se já tem MFA habilitado
      const existingEnabled = await withTenantDb(async (db) => {
        const [row] = await db
          .select({ isEnabled: schema.userMfaTotp.isEnabled })
          .from(schema.userMfaTotp)
          .where(eq(schema.userMfaTotp.userId, user.sub))
          .limit(1);
        return row?.isEnabled ?? false;
      });

      if (existingEnabled) {
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

      await withTenantDb(async (db) => {
        await db
          .insert(schema.userMfaTotp)
          .values({
            userId: user.sub,
            secret: setup.secret,
            recoveryCodes: recoveryHashed,
            isEnabled: false,
          })
          .onConflictDoUpdate({
            target: schema.userMfaTotp.userId,
            set: {
              secret: setup.secret,
              recoveryCodes: recoveryHashed,
              isEnabled: false,
              updatedAt: new Date(),
            },
          });
      });

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
      // Busca secret pendente via Drizzle
      const record = await withTenantDb(async (db) => {
        const [row] = await db
          .select({
            secret: schema.userMfaTotp.secret,
            isEnabled: schema.userMfaTotp.isEnabled,
          })
          .from(schema.userMfaTotp)
          .where(eq(schema.userMfaTotp.userId, user.sub))
          .limit(1);
        return row;
      });

      if (!record) {
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

      if (record.isEnabled) {
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

      // Habilita MFA via Drizzle
      await withTenantDb(async (db) => {
        await db
          .update(schema.userMfaTotp)
          .set({ isEnabled: true, updatedAt: new Date() })
          .where(eq(schema.userMfaTotp.userId, user.sub));
      });

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
    // Busca challenge via Drizzle
    const challenge = await withTenantDb(async (db) => {
      const [row] = await db
        .select({
          userId: schema.mfaChallenges.userId,
          expiresAt: schema.mfaChallenges.expiresAt,
          consumed: schema.mfaChallenges.consumed,
        })
        .from(schema.mfaChallenges)
        .where(eq(schema.mfaChallenges.challengeToken, data.challenge_token))
        .limit(1);
      return row;
    });

    if (!challenge) {
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

    if (challenge.expiresAt < new Date()) {
      return c.json(
        { error: { code: "CHALLENGE_EXPIRED", message: "Challenge expirado" } },
        401,
      );
    }

    // Busca secret TOTP do usuário via Drizzle
    const totp = await withTenantDb(async (db) => {
      const [row] = await db
        .select({
          secret: schema.userMfaTotp.secret,
          recoveryCodes: schema.userMfaTotp.recoveryCodes,
        })
        .from(schema.userMfaTotp)
        .where(
          and(
            eq(schema.userMfaTotp.userId, challenge.userId),
            eq(schema.userMfaTotp.isEnabled, true),
          ),
        )
        .limit(1);
      return row;
    });

    if (!totp) {
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

    const valid = verifyTotpCode(totp.secret, data.code);

    if (!valid) {
      // Verifica se é recovery code
      const recoveryCodes = totp.recoveryCodes as unknown as string[];
      if (!verifyRecoveryCode(data.code, recoveryCodes)) {
        logger.warn("MFA codigo invalido", { userId: challenge.userId });
        return c.json(
          { error: { code: "INVALID_CODE", message: "Código TOTP inválido" } },
          401,
        );
      }
    }

    // Marca challenge como consumido via Drizzle
    await withTenantDb(async (db) => {
      await db
        .update(schema.mfaChallenges)
        .set({ consumed: true })
        .where(eq(schema.mfaChallenges.challengeToken, data.challenge_token));
    });

    // Busca dados do usuário para gerar tokens via Drizzle
    const userRow = await withTenantDb(async (db) => {
      const [row] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          fullName: schema.users.fullName,
          isActive: schema.users.isActive,
        })
        .from(schema.users)
        .where(eq(schema.users.id, challenge.userId))
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

    // Busca tenants e roles via RPC
    const tenantAuth = await getUserTenantAuth(userRow.id);
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

    // CORREÇÃO P1: Captura explícita do tokenHash e persistência na tabela de sessões
    const { accessToken, refreshToken, refreshTokenHash } =
      await generateAndStoreTokens({
        sub: userRow.id,
        tenant_id: tenantAuth.primaryTenantId,
        roles: tenantAuth.roles,
        scope: tenantAuth.scope,
        tenant_ids: tenantAuth.tenantIds,
      });

    // Injeção de conformidade estrita de sessão na base de dados (Hypertable RLS)
    // Injeção de conformidade estrita de sessão na base de dados calibrada
    await withTenantDb(async (db) => {
      await db.insert(schema.sessions).values({
        userId: userRow.id,
        refreshTokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Válido por 30 dias
      });
    });

    try {
      await writeAuditLog({
        userId: userRow.id,
        tenantId: tenantAuth.primaryTenantId,
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
        full_name: userRow.fullName,
        is_active: userRow.isActive,
      },
      scope: tenantAuth.scope,
      tenants: tenantAuth.tenants,
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
      const totp = await withTenantDb(async (db) => {
        const [row] = await db
          .select({ secret: schema.userMfaTotp.secret })
          .from(schema.userMfaTotp)
          .where(
            and(
              eq(schema.userMfaTotp.userId, user.sub),
              eq(schema.userMfaTotp.isEnabled, true),
            ),
          )
          .limit(1);
        return row;
      });

      if (!totp) {
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

      const valid = verifyTotpCode(data.code, totp.secret);
      if (!valid) {
        return c.json(
          { error: { code: "INVALID_CODE", message: "Código TOTP inválido" } },
          401,
        );
      }

      await withTenantDb(async (db) => {
        await db
          .delete(schema.userMfaTotp)
          .where(eq(schema.userMfaTotp.userId, user.sub));
      });

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
      // Paraleliza 2 queries independentes via Drizzle
      const [totpResult, webauthnResult] = await Promise.all([
        withTenantDb(async (db) => {
          const [row] = await db
            .select({ isEnabled: schema.userMfaTotp.isEnabled })
            .from(schema.userMfaTotp)
            .where(eq(schema.userMfaTotp.userId, user.sub))
            .limit(1);
          return row?.isEnabled ?? false;
        }),
        withTenantDb(async (db) => {
          const result = await db
            .select({ id: schema.userWebauthnCredentials.id })
            .from(schema.userWebauthnCredentials)
            .where(
              and(
                eq(schema.userWebauthnCredentials.userId, user.sub),
                eq(schema.userWebauthnCredentials.isEnabled, true),
              ),
            );
          return result.length;
        }),
      ]);

      return c.json({
        totp_enabled: totpResult,
        webauthn_enabled: webauthnResult > 0,
        webauthn_credentials: webauthnResult,
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
