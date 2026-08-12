// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { createMiddleware } from "hono/factory";
import { getPermissionChecker } from "@repo/auth";
import { withTenantDb } from "@repo/db/drizzle";
import { sql } from "drizzle-orm";
import "../types.js";

// Middleware que verifica se o usuário tem uma permissão específica.
// Deve ser usado após jwtAuth e tenantContext.
//
// Usa Drizzle ORM para buscar permissões do usuário via join das tabelas
// RBAC mapeadas em @repo/db/src/schema/rbac.ts:
//   tenant_users → roles → role_permissions → permissions
//   tenant_users → tenant_custom_roles → tenant_custom_role_permissions → permissions
//
// A função RPC `get_user_permissions` no PostgreSQL encapsula esses joins
// complexos (incluindo roles do sistema + custom roles do tenant). Mantemos
// a chamada via Drizzle's sql template tag para nao duplicar a logica de
// join em TypeScript — a funcao SQL é a source of truth para resolucao de
// permissoes.
//
// Uso:
//   app.get("/api/v1/devices", jwtAuth, tenantContext, requirePermission("zabbix:devices:read"), handler)
export function requirePermission(permission: string) {
  return createMiddleware(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
        401,
      );
    }

    // Bypass apenas para testes automatizados — exige NODE_ENV=test E flag explicita
    // Evita bypass acidental se BYPASS_PERMISSIONS vazar para producao
    if (
      process.env.BYPASS_PERMISSIONS === "true" &&
      process.env.NODE_ENV === "test"
    ) {
      await next();
      return;
    }

    // Busca permissões do DB via Drizzle, chamando a funcao RPC
    // get_user_permissions que resolve system roles + tenant custom roles.
    // withTenantDb injeta SET LOCAL app.current_tenant_id para RLS.
    const fetcher = async (userId: string): Promise<string[]> => {
      const result = await withTenantDb(async (db) => {
        return db.execute<{
          permission_key: string;
        }>(sql`SELECT * FROM public.get_user_permissions(${userId})`);
      });
      return result.rows.map((r) => r.permission_key);
    };

    const checker = await getPermissionChecker(user.sub, user.roles, fetcher);
    if (!checker(permission)) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: `Permissão necessária: ${permission}`,
          },
        },
        403,
      );
    }

    await next();
  });
}
