// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { createMiddleware } from "hono/factory";
import { verifyToken, isTokenRevoked } from "@repo/auth";
import { withTenantDb, schema } from "@repo/db/drizzle";
import { eq, and, gt } from "drizzle-orm";
import "../types.js";

// Middleware de autenticação JWT para Hono.
// Sempre exige token Bearer válido, em qualquer ambiente.
//
// CAMADA DE DEFESA EM PROFUNDIDADE:
// 1. Verifica assinatura JWT e tipo (access token)
// 2. Verifica revogação via Redis (jti blacklist) — skip em testes
// 3. Verifica sessão ativa no DB via Drizzle (não expirada)
// 4. Verifica status do tenant (active) via Drizzle
//
// Passos 3 e 4 usam Drizzle ORM queries contra as tabelas mapeadas
// em @repo/db/src/schema (sessions, tenants). A verificacao de tenant
// so acontece se o JWT tiver tenant_id (usuarios global/ JL staff
// podem nao ter tenant_id).
export const jwtAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Token não fornecido" } },
      401,
    );
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    if (payload.type !== "access") {
      return c.json(
        { error: { code: "INVALID_TOKEN", message: "Tipo de token inválido" } },
        401,
      );
    }

    // Verifica revogação (logout/session revoke) — skip em testes para nao exigir Redis
    if (process.env.NODE_ENV !== "test" && payload.jti) {
      const revoked = await isTokenRevoked(payload.jti);
      if (revoked) {
        return c.json(
          { error: { code: "TOKEN_REVOKED", message: "Token revogado" } },
          401,
        );
      }
    }

    // Defesa em profundidade: valida sessao ativa no DB via Drizzle.
    // Skip em testes para nao exigir DB real (NODE_ENV=test usa mocks).
    if (process.env.NODE_ENV !== "test") {
      const sessionValid = await withTenantDb(async (db) => {
        const [row] = await db
          .select({ id: schema.sessions.id })
          .from(schema.sessions)
          .where(
            and(
              eq(schema.sessions.userId, payload.sub),
              gt(schema.sessions.expiresAt, new Date()),
            ),
          )
          .limit(1);
        return !!row;
      });

      if (!sessionValid) {
        return c.json(
          {
            error: {
              code: "SESSION_EXPIRED",
              message: "Sessão expirada ou inválida",
            },
          },
          401,
        );
      }

      // Valida status do tenant se o JWT tiver tenant_id
      // (usuarios global/JL staff podem nao ter tenant_id)
      if (payload.tenant_id) {
        const tenantActive = await withTenantDb(async (db) => {
          const [row] = await db
            .select({ status: schema.tenants.status })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, payload.tenant_id))
            .limit(1);
          return row?.status === "active";
        });

        if (!tenantActive) {
          return c.json(
            {
              error: {
                code: "TENANT_INACTIVE",
                message: "Tenant suspenso ou inativo",
              },
            },
            403,
          );
        }
      }
    }

    c.set("user", {
      sub: payload.sub,
      tenant_id: payload.tenant_id,
      roles: payload.roles,
      scope: payload.scope ?? "tenant",
      tenantIds: payload.tenant_ids,
    });

    await next();
  } catch {
    return c.json(
      {
        error: { code: "INVALID_TOKEN", message: "Token inválido ou expirado" },
      },
      401,
    );
  }
});
