// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Endpoint receptor para Zabbix connector streaming.
// O Zabbix 7.4 envia batches de history via HTTP POST para este endpoint.
// Os dados sao armazenados no zabbix_history_cache (TimescaleDB hypertable).
//
// RLS INTEGRATION: O tenant_id e resolvido via connector token (nao JWT).
// Apos resolver o tenant_id, envolvemos o insert em runWithTenant() para que
// withTenantDb() injete SET LOCAL app.current_tenant_id e a RLS policy
// do zabbix_history_cache seja enforced.
//
// ERROR HANDLING MATRIX:
//   401 — Token nao fornecido / token invalido
//   500 — Erro ao armazenar dados / erro interno

import { Hono } from "hono";
import { runWithTenant, query } from "@repo/db";
import { withTenantDb, schema } from "@repo/db/drizzle";
import { logger } from "@repo/logger";

export const connectorStreamRoute = new Hono();

// POST /api/v1/zabbix/connector/stream
// Recebe dados do Zabbix connector — autenticado via Bearer token.
// O token e mapeado para tenant_id via tenant_routes.zabbix_connector_token.
connectorStreamRoute.post("/stream", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Token não fornecido" } },
      401,
    );
  }

  const connectorToken = authHeader.slice(7);

  // Busca tenant pelo connector token — query raw pois nao temos RLS context
  // ainda (o token resolve o tenant, nao o JWT).
  const tenantResult = await query<{ tenant_id: string }>(
    `SELECT tenant_id FROM public.tenant_routes
     WHERE zabbix_connector_token = $1 AND status = 'active'`,
    [connectorToken],
  );

  if (tenantResult.error || !tenantResult.data?.rows[0]) {
    return c.json(
      { error: { code: "INVALID_TOKEN", message: "Token inválido" } },
      401,
    );
  }

  const tenantId = tenantResult.data.rows[0].tenant_id;

  try {
    const body = await c.req.json();

    // Zabbix connector envia formato: { data: [{ itemid, hostid, clock, ns, value, value_type }, ...] }
    // Ou formato flat: [{ itemid, hostid, clock, ns, value, value_type }, ...]
    const entries: Array<{
      itemid: string;
      hostid?: string;
      clock: number;
      ns?: number;
      value: string;
      value_type?: number;
    }> = Array.isArray(body) ? body : (body.data ?? []);

    if (entries.length === 0) {
      return c.json({ ok: true, received: 0 });
    }

    // Propaga tenant_id para AsyncLocalStorage para que withTenantDb() injete
    // SET LOCAL app.current_tenant_id e a RLS policy do zabbix_history_cache
    // seja enforced no INSERT.
    await runWithTenant(tenantId, async () => {
      await withTenantDb(async (db) => {
        // Bulk INSERT via Drizzle — mapeia entries para colunas do schema.
        // Usa Drizzle's insert().values() com array para bulk insert.
        await db.insert(schema.zabbixHistoryCache).values(
          entries.map((e) => ({
            tenantId,
            itemid: e.itemid,
            hostid: e.hostid ?? "0",
            clock: e.clock,
            ns: e.ns ?? 0,
            value: e.value,
            valueType: e.value_type ?? 0,
          })),
        );
      });
    });

    logger.info("History cache atualizado", {
      tenantId,
      received: entries.length,
    });

    return c.json({ ok: true, received: entries.length });
  } catch (error) {
    logger.error("Erro no connector stream", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao armazenar dados" } },
      500,
    );
  }
});

// GET /api/v1/zabbix/connector/health — health check do connector
connectorStreamRoute.get("/health", (c) => {
  return c.json({ status: "ok", service: "zabbix-connector-stream" });
});
