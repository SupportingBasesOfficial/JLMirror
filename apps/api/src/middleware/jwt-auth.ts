// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { createMiddleware } from "hono/factory";
import { verifyToken } from "@repo/auth";
import "../types.js";

// Middleware de autenticação JWT para Hono.
// Sempre exige token Bearer válido, em qualquer ambiente.
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
      { error: { code: "INVALID_TOKEN", message: "Token inválido ou expirado" } },
      401,
    );
  }
});
