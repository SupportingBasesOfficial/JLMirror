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
  if (!user || !user.tenant_id) {
    await next();
    return;
  }

  // runWithTenant propaga tenant_id via AsyncLocalStorage para todas as
  // queries async dentro da request, incluindo handlers e imports dinamicos
  await runWithTenant(user.tenant_id, async () => {
    await next();
  });
});
