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

export const zabbixRoute = new Hono();

// Middlewares globais do módulo Zabbix
zabbixRoute.use("/*", rateLimitTenant);
zabbixRoute.use("/*", requirePermission("zabbix:read"));
zabbixRoute.use("/*", (c, next) => {
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
