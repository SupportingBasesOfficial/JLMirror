// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { createMiddleware } from "hono/factory";
import { query } from "@repo/db";

// Cache em memoria para evitar query no banco a cada request
// TTL de 30s — suficiente para performance sem bloquear mudancas
const flagCache = new Map<string, { value: boolean; expires: number }>();
const CACHE_TTL_MS = 30_000;

async function isModuleEnabled(
  moduleKey: string,
  tenantId: string | null,
): Promise<boolean> {
  const cacheKey = `${moduleKey}:${tenantId ?? "global"}`;
  const cached = flagCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  // Considera default_value (admin) E client_enabled (cliente) para tenants
  const result = await query<{
    default_value: unknown;
    client_enabled: boolean | null;
  }>(
    `SELECT default_value, client_enabled FROM public.feature_flags
     WHERE key = $1 AND is_active = true AND (tenant_id IS NULL OR tenant_id = $2)
     ORDER BY tenant_id NULLS LAST LIMIT 1`,
    [moduleKey, tenantId],
  );

  const row = result.data?.rows[0];
  const adminEnabled =
    row?.default_value === true || row?.default_value === "true";
  const clientEnabled = row?.client_enabled === true;
  const enabled = adminEnabled || clientEnabled;

  flagCache.set(cacheKey, {
    value: enabled,
    expires: Date.now() + CACHE_TTL_MS,
  });
  return enabled;
}

// Exportado para permitir limpar o cache quando um modulo e ativado/desativado
export function clearModuleFlagCache(): void {
  flagCache.clear();
}

// Middleware que bloqueia acesso se o modulo estiver desativado
export function requireModule(moduleKey: string) {
  return createMiddleware(async (c, next) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const enabled = await isModuleEnabled(moduleKey, tenantId);
    if (!enabled) {
      return c.json(
        {
          error: {
            code: "MODULE_DISABLED",
            message: "Este módulo não está ativado para este tenant",
          },
        },
        403,
      );
    }

    await next();
  });
}
