// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { createMiddleware } from "hono/factory";
import { runWithTenant } from "@repo/db";
import "../types.js";

// Middleware que isola o contexto do tenant no PostgreSQL.
// Extrai tenant_id do JWT e envolve toda a request em runWithTenant()
// para que RLS (SET LOCAL app.current_tenant_id) funcione em todas as queries
// via AsyncLocalStorage — sem precisar passar tenant_id manualmente.
export const tenantContext = createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  // Se for staff global, permite personificar um tenant específico via cabeçalho X-Tenant-ID
  const targetTenantId = c.req.header("x-tenant-id") || user.tenant_id;

  // Usuarios global (JL staff) podem acessar rotas sem tenant_id — operam em public.*
  if (user.scope === "global" && !targetTenantId) {
    await next();
    return;
  }

  if (!targetTenantId) {
    return c.json(
      {
        error: {
          code: "TENANT_REQUIRED",
          message: "Tenant não identificado no token",
        },
      },
      403,
    );
  }

  // Validação estrita do formato UUID para o cabeçalho injetado antes de entrar no fluxo assíncrono
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(targetTenantId)) {
    return c.json(
      {
        error: {
          code: "INVALID_TENANT_ID",
          message: "O ID do tenant configurado no cabeçalho é inválido",
        },
      },
      400,
    );
  }

  // runWithTenant propaga tenant_id via AsyncLocalStorage para todas as
  // queries async dentro da request, incluindo handlers e imports dinamicos
  await runWithTenant(targetTenantId, async () => {
    await next();
  });
});
