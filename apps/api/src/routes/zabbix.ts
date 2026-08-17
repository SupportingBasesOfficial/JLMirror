// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Barrel router — delega rotas para módulos por domínio

import { Hono } from "hono";
import { cacheDelByPrefix, cacheGetJSON, cacheSetJSON } from "@repo/cache";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitTenant } from "../middleware/rate-limit.js";
import "../types.js";

// Re-exporta funções usadas externamente
export {
  createZabbixClient,
  invalidateZabbixConfigCache,
} from "./zabbix/shared.js";

import { registerHostRoutes } from "./zabbix/hosts.js";
import { registerHistoryRoutes } from "./zabbix/history.js";
import { registerProblemsRoutes } from "./zabbix/problems.js";
import { registerAdminRoutes } from "./zabbix/admin.js";
import { connectorStreamRoute } from "./zabbix/connector-stream.js";

export const zabbixRoute = new Hono();

// Rota de connector streaming — registrada ANTES dos middlewares de auth
// pois usa autenticacao propria (connector token via Bearer)
zabbixRoute.route("/connector", connectorStreamRoute);

// Middlewares globais do módulo Zabbix (nao se aplicam a /connector/*)
zabbixRoute.use("/*", (c, next) => {
  // Pula middlewares para rotas de connector
  if (c.req.path.startsWith("/connector")) return next();
  return rateLimitTenant(c, next);
});
zabbixRoute.use("/*", (c, next) => {
  if (c.req.path.startsWith("/connector")) return next();
  return requirePermission("zabbix:read")(c, next);
});
zabbixRoute.use("/*", (c, next) => {
  if (c.req.path.startsWith("/connector")) return next();
  if (c.req.method === "GET") return next();
  return requirePermission("zabbix:write")(c, next);
});

// Invalida cache de responses Zabbix do tenant apos mutacoes
async function invalidateZabbixResponseCache(tenantId: string): Promise<void> {
  await cacheDelByPrefix(`zabbix:resp:${tenantId}:`);
}

// Middleware de cache para GETs do Zabbix
const CACHE_TTL_MAP: Array<{ pattern: RegExp; ttl: number }> = [
  { pattern: /\/history|\/graphs\/.*\/data/, ttl: 5 },
  { pattern: /\/ping/, ttl: 0 },
];
const DEFAULT_CACHE_TTL = 10;

zabbixRoute.use("/*", async (c, next) => {
  // BLINDAGEM DE PERFORMANCE: Ignora completamente rotas de streaming de conector
  // para evitar loops maciços e redundantes de varrimento/invalidação do Redis sob alta carga
  if (c.req.path.startsWith("/connector")) return next();

  const user = c.get("user");
  const tenantId = user?.tenant_id;
  if (!tenantId) return next();

  if (c.req.method !== "GET") {
    await next();
    if (c.res.status >= 200 && c.res.status < 300) {
      await invalidateZabbixResponseCache(tenantId);
    }
    return;
  }

  const path = c.req.path;
  const url = new URL(c.req.url);
  const queryString = url.searchParams.toString();
  const cacheKey = `zabbix:resp:${tenantId}:${path}:${queryString}`;

  const ttlEntry = CACHE_TTL_MAP.find((m) => m.pattern.test(path));
  const ttl = ttlEntry ? ttlEntry.ttl : DEFAULT_CACHE_TTL;
  if (ttl === 0) return next();

  const cached = await cacheGetJSON<unknown>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  await next();

  if (c.res.status >= 200 && c.res.status < 300) {
    try {
      const cloned = c.res.clone();
      const body = await cloned.json();
      await cacheSetJSON(cacheKey, body, ttl);
    } catch {
      // Se nao for JSON, ignora
    }
  }
});

// Registra rotas por dominio
zabbixRoute.get("/", async (c) => {
  return c.json({
    overview: "Zabbix — Monitoração integrada",
    endpoints: [
      "/ping",
      "/devices",
      "/devices/:hostId",
      "/devices/:hostId/items",
      "/triggers",
      "/services",
      "/history",
      "/graphs",
      "/graphs/:graphId/data",
    ],
  });
});

registerHostRoutes(zabbixRoute);
registerHistoryRoutes(zabbixRoute);
registerProblemsRoutes(zabbixRoute);
registerAdminRoutes(zabbixRoute);
