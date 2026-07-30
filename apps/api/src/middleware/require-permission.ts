import { createMiddleware } from "hono/factory";
import { getPermissionChecker } from "@repo/auth";
import { query } from "@repo/db";
import "../types.js";

// Middleware que verifica se o usuário tem uma permissão específica.
// Deve ser usado após jwtAuth e tenantContext.
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

    // Bypass apenas para testes automatizados ou quando explicitamente habilitado
    // Em desenvolvimento normal, permissões são validadas normalmente
    if (process.env.NODE_ENV === "test" || process.env.BYPASS_PERMISSIONS === "true") {
      await next();
      return;
    }

    // Busca permissões do DB via RPC
    const fetcher = async (userId: string): Promise<string[]> => {
      const result = await query<{ permission_key: string }>(
        "SELECT * FROM public.get_user_permissions($1)",
        [userId],
      );
      if (result.error || !result.data) return [];
      return result.data.rows.map((r) => r.permission_key);
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
