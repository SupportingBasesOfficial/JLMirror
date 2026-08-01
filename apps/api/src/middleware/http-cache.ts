// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { createMiddleware } from "hono/factory";
import { cacheGet, cacheSet } from "@repo/cache";
import "../types.js";

// Middleware de cache HTTP para rotas GET com TTL configurável.
// Gera chave de cache baseada em URL + query string + tenant_id + user_id.
// Pula cache se a requisição tiver headers de no-cache ou se for autenticada com query params dinâmicos.
//
// Uso:
//   import { httpCache } from "../middleware/http-cache.js";
//   dashboardRoute.get("/summary", jwtAuth, tenantContext, httpCache(60), async (c) => { ... });
//
// Parâmetros:
//   ttlSeconds: tempo de vida do cache em segundos (default: 60)
//   keyPrefix: prefixo da chave de cache (default: "http")

export function httpCache(ttlSeconds: number = 60, keyPrefix: string = "http") {
  return createMiddleware(async (c, next) => {
    // Apenas cacheia GET
    if (c.req.method !== "GET") {
      await next();
      return;
    }

    // Respeita header Cache-Control: no-cache
    const cacheControl = c.req.header("cache-control");
    if (cacheControl?.includes("no-cache") || cacheControl?.includes("no-store")) {
      await next();
      return;
    }

    // Constrói chave de cache
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? "global";
    const userId = user?.sub ?? "anonymous";
    const url = c.req.url;
    const cacheKey = `${keyPrefix}:${tenantId}:${userId}:${url}`;

    // Busca do cache
    const cached = await cacheGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as { body: string; status: number; headers: Record<string, string> };
      const response = new Response(parsed.body, { status: parsed.status, headers: parsed.headers });
      response.headers.set("X-Cache", "HIT");
      return response;
    }

    // Continua para a rota
    await next();

    // Após a rota, se a resposta foi bem-sucedida, armazena no cache
    if (c.res.status >= 200 && c.res.status < 300) {
      const responseBody = await c.res.text();
      const headers: Record<string, string> = {};
      c.res.headers.forEach((value, key) => {
        if (key !== "content-encoding" && key !== "content-length") {
          headers[key] = value;
        }
      });

      const cacheData = JSON.stringify({
        body: responseBody,
        status: c.res.status,
        headers,
      });

      await cacheSet(cacheKey, cacheData, ttlSeconds);

      // Reconstrói a resposta pois .text() consumiu o body
      const newResponse = new Response(responseBody, { status: c.res.status, headers });
      newResponse.headers.set("X-Cache", "MISS");
      c.res = newResponse;
    }
  });
}
