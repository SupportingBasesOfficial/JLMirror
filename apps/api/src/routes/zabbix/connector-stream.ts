// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Endpoint receptor para Zabbix connector streaming
// O Zabbix 7.4 envia batches de history via HTTP POST para este endpoint
// Os dados sao armazenados no zabbix_history_cache (TimescaleDB hypertable)

import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";

export const connectorStreamRoute = new Hono();

// POST /api/v1/zabbix/connector/stream
// Recebe dados do Zabbix connector — autenticado via Bearer token
// O token e mapeado para tenant_id via tenant_routes.zabbix_connector_token
connectorStreamRoute.post("/stream", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Token não fornecido" }, 401);
  }

  const connectorToken = authHeader.slice(7);

  // Busca tenant pelo connector token
  const tenantResult = await query<{ tenant_id: string }>(
    `SELECT tenant_id FROM public.tenant_routes
     WHERE zabbix_connector_token = $1 AND status = 'active'`,
    [connectorToken],
  );

  if (tenantResult.error || !tenantResult.data?.rows[0]) {
    return c.json({ error: "Token inválido" }, 401);
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

    // Prepara arrays para bulk INSERT com UNNEST
    const itemids = entries.map((e) => e.itemid);
    const hostids = entries.map((e) => e.hostid ?? "0");
    const clocks = entries.map((e) => e.clock);
    const nsValues = entries.map((e) => e.ns ?? 0);
    const values = entries.map((e) => e.value);
    const valueTypes = entries.map((e) => e.value_type ?? 0);

    // Bulk INSERT — seta contexto do tenant para RLS
    await query(`SELECT public.set_tenant_context($1::uuid)`, [tenantId]);

    const insertResult = await query(
      `INSERT INTO public.zabbix_history_cache (tenant_id, itemid, hostid, clock, ns, value, value_type)
       SELECT $1, itemid, hostid, clock, ns, value, value_type
       FROM UNNEST($2::text[], $3::text[], $4::bigint[], $5::integer[], $6::text[], $7::smallint[])
       AS t(itemid, hostid, clock, ns, value, value_type)`,
      [tenantId, itemids, hostids, clocks, nsValues, values, valueTypes],
    );

    if (insertResult.error) {
      logger.error("Erro ao inserir history cache", {
        tenantId,
        error: insertResult.error.message,
      });
      return c.json({ error: "Erro ao armazenar dados" }, 500);
    }

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
    return c.json({ error: "Erro interno" }, 500);
  }
});

// GET /api/v1/zabbix/connector/health — health check do connector
connectorStreamRoute.get("/health", (c) => {
  return c.json({ status: "ok", service: "zabbix-connector-stream" });
});
