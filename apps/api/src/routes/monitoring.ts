import { Hono } from "hono";
import {
  BlindedZabbixClient,
  type ZabbixHistoryEntry,
  type ZabbixItem,
  type ZabbixGraph,
  type ZabbixTrigger,
} from "@repo/zabbix";
import {
  monitoringHistoryQuerySchema,
  monitoringProblemsQuerySchema,
  monitoringEventsQuerySchema,
  monitoringGraphQuerySchema,
  monitoringMetricsQuerySchema,
} from "@repo/shared-validation";
import "../types.js";
import { createZabbixClient } from "./zabbix.js";

export const monitoringRoute = new Hono();

// Busca host IDs do tenant no Zabbix
async function getZabbixHostIds(client: BlindedZabbixClient, hostGroupId?: string): Promise<string[]> {
  const hosts = await client.getDevices(hostGroupId);
  return hosts.map((h) => h.hostid);
}

// GET /api/v1/monitoring/problems — lista problemas ativos do Zabbix
monitoringRoute.get("/problems", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const queryParams = c.req.query();
  const parsed = monitoringProblemsQuerySchema.safeParse({
    acknowledged: queryParams.acknowledged ?? "all",
    severity_from: queryParams.severity_from ? Number(queryParams.severity_from) : undefined,
    recent: queryParams.recent === "true",
    limit: queryParams.limit ? Number(queryParams.limit) : 100,
  });

  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Parâmetros inválidos", details: parsed.error.flatten() } },
      400,
    );
  }

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Zabbix não configurado para este tenant" } },
      404,
    );
  }

  try {
    const hostIds = await getZabbixHostIds(client);
    const options: { acknowledged?: boolean; severityFrom?: number; recent?: boolean } = {};
    if (parsed.data.acknowledged === "true") options.acknowledged = true;
    if (parsed.data.acknowledged === "false") options.acknowledged = false;
    if (parsed.data.severity_from !== undefined) options.severityFrom = parsed.data.severity_from;
    if (parsed.data.recent !== undefined) options.recent = parsed.data.recent;

    const problems = await client.getProblems(hostIds.length > 0 ? hostIds : undefined, options);
    const limited = problems.slice(0, parsed.data.limit);

    return c.json({ data: limited, total: problems.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ error: { code: "ZABBIX_API_ERROR", message } }, 502);
  }
});

// GET /api/v1/monitoring/events — lista eventos (incluindo resolvidos) do Zabbix
monitoringRoute.get("/events", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const queryParams = c.req.query();
  const parsed = monitoringEventsQuerySchema.safeParse({
    value: queryParams.value,
    acknowledged: queryParams.acknowledged ?? "all",
    from: queryParams.from,
    to: queryParams.to,
    limit: queryParams.limit ? Number(queryParams.limit) : 100,
  });

  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Parâmetros inválidos", details: parsed.error.flatten() } },
      400,
    );
  }

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Zabbix não configurado para este tenant" } },
      404,
    );
  }

  try {
    const hostIds = await getZabbixHostIds(client);
    const options: { value?: string; acknowledged?: boolean; limit?: number; from?: number; to?: number } = {
      limit: parsed.data.limit,
    };
    if (parsed.data.value) options.value = parsed.data.value;
    if (parsed.data.acknowledged === "true") options.acknowledged = true;
    if (parsed.data.acknowledged === "false") options.acknowledged = false;
    if (parsed.data.from) options.from = Math.floor(new Date(parsed.data.from).getTime() / 1000);
    if (parsed.data.to) options.to = Math.floor(new Date(parsed.data.to).getTime() / 1000);

    const events = await client.getEvents(hostIds.length > 0 ? hostIds : undefined, options);

    return c.json({ data: events, total: events.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ error: { code: "ZABBIX_API_ERROR", message } }, 502);
  }
});

// GET /api/v1/monitoring/triggers — lista triggers ativos do Zabbix
monitoringRoute.get("/triggers", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Zabbix não configurado para este tenant" } },
      404,
    );
  }

  try {
    const hostIds = await getZabbixHostIds(client);
    const triggers: ZabbixTrigger[] = await client.getTriggers(hostIds.length > 0 ? hostIds : undefined);

    return c.json({ data: triggers, total: triggers.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ error: { code: "ZABBIX_API_ERROR", message } }, 502);
  }
});

// GET /api/v1/monitoring/metrics?device_id=...&key_search=... — lista métricas (items) de um host
monitoringRoute.get("/metrics", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const queryParams = c.req.query();
  const parsed = monitoringMetricsQuerySchema.safeParse({
    device_id: queryParams.device_id,
    key_search: queryParams.key_search,
  });

  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Parâmetros inválidos", details: parsed.error.flatten() } },
      400,
    );
  }

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Zabbix não configurado para este tenant" } },
      404,
    );
  }

  try {
    let items: ZabbixItem[];
    if (parsed.data.key_search) {
      items = await client.getKeyItems([parsed.data.device_id], parsed.data.key_search);
    } else {
      items = await client.getItems(parsed.data.device_id);
    }

    return c.json({ data: items, total: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ error: { code: "ZABBIX_API_ERROR", message } }, 502);
  }
});

// GET /api/v1/monitoring/history?device_id=...&metric=...&from=...&to=...&limit=...
// Busca histórico de métricas via Zabbix API
monitoringRoute.get("/history", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const queryParams = c.req.query();
  const parsed = monitoringHistoryQuerySchema.safeParse({
    device_id: queryParams.device_id,
    metric: queryParams.metric,
    from: queryParams.from,
    to: queryParams.to,
    limit: queryParams.limit ? Number(queryParams.limit) : 100,
    interval: queryParams.interval,
  });

  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Parâmetros inválidos", details: parsed.error.flatten() } },
      400,
    );
  }

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Zabbix não configurado para este tenant" } },
      404,
    );
  }

  try {
    // Busca o item pelo key_ no host especificado
    const items = await client.getKeyItems([parsed.data.device_id], parsed.data.metric);
    if (items.length === 0) {
      return c.json({ data: [], total: 0 });
    }

    const item = items[0];
    const fromTs = parsed.data.from ? Math.floor(new Date(parsed.data.from).getTime() / 1000) : Math.floor(Date.now() / 1000) - 3600;
    const toTs = parsed.data.to ? Math.floor(new Date(parsed.data.to).getTime() / 1000) : Math.floor(Date.now() / 1000);

    const history: ZabbixHistoryEntry[] = await client.getHistory(
      item.itemid,
      fromTs,
      toTs,
      typeof item.value_type === "string" ? Number(item.value_type) : item.value_type,
    );

    const limited = history.slice(0, parsed.data.limit);

    // Formata resposta no mesmo formato que o frontend espera
    const data = limited.map((h) => ({
      id: `${h.itemid}-${h.clock}-${h.ns}`,
      tenant_id: tenantId,
      device_id: parsed.data.device_id,
      metric: parsed.data.metric,
      value: parseFloat(h.value),
      timestamp: new Date(h.clock * 1000).toISOString(),
      created_at: new Date(h.clock * 1000).toISOString(),
    }));

    return c.json({ data, total: data.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ error: { code: "ZABBIX_API_ERROR", message } }, 502);
  }
});

// GET /api/v1/monitoring/graphs?device_id=... — lista gráficos disponíveis de um host
monitoringRoute.get("/graphs", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const queryParams = c.req.query();
  const parsed = monitoringGraphQuerySchema.safeParse({
    device_id: queryParams.device_id,
    from: queryParams.from,
    to: queryParams.to,
  });

  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Parâmetros inválidos", details: parsed.error.flatten() } },
      400,
    );
  }

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Zabbix não configurado para este tenant" } },
      404,
    );
  }

  try {
    const graphs: ZabbixGraph[] = await client.getGraphs(parsed.data.device_id);

    // Se há período especificado, busca dados históricos para cada gráfico
    if (parsed.data.from && parsed.data.to && graphs.length > 0) {
      const fromTs = Math.floor(new Date(parsed.data.from).getTime() / 1000);
      const toTs = Math.floor(new Date(parsed.data.to).getTime() / 1000);

      const graphsWithData = await Promise.all(
        graphs.slice(0, 20).map(async (g) => {
          const itemIds = (g.gitems ?? []).map((gi) => gi.itemid).filter(Boolean);
          if (itemIds.length === 0) return { ...g, history: [] };

          const history = await client.getHistoryBatch(itemIds, fromTs, toTs);
          return { ...g, history };
        }),
      );

      return c.json({ data: graphsWithData, total: graphs.length });
    }

    return c.json({ data: graphs, total: graphs.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ error: { code: "ZABBIX_API_ERROR", message } }, 502);
  }
});

// GET /api/v1/monitoring/overview — resumo consolidado para dashboard de monitoramento
monitoringRoute.get("/overview", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Zabbix não configurado para este tenant" } },
      404,
    );
  }

  try {
    const hostIds = await getZabbixHostIds(client);
    const [problems, triggers] = await Promise.all([
      client.getProblems(hostIds.length > 0 ? hostIds : undefined, { recent: true }),
      client.getTriggers(hostIds.length > 0 ? hostIds : undefined),
    ]);

    const severityCount = (arr: { severity: string }[], minSeverity: number): number =>
      arr.filter((p) => Number(p.severity) >= minSeverity).length;

    return c.json({
      hosts_total: hostIds.length,
      problems_total: problems.length,
      problems_critical: severityCount(problems, 4),
      problems_warning: severityCount(problems, 2) - severityCount(problems, 4),
      problems_info: severityCount(problems, 0) - severityCount(problems, 2),
      triggers_active: triggers.length,
      triggers_disaster: triggers.filter((t) => t.priority === "5").length,
      triggers_high: triggers.filter((t) => t.priority === "4").length,
      triggers_average: triggers.filter((t) => t.priority === "3").length,
      triggers_warning: triggers.filter((t) => t.priority === "2").length,
      triggers_information: triggers.filter((t) => t.priority === "1").length,
      recent_problems: problems.slice(0, 10),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ error: { code: "ZABBIX_API_ERROR", message } }, 502);
  }
});

// POST /api/v1/monitoring/acknowledge — registra acknowledge de eventos no Zabbix
monitoringRoute.post("/acknowledge", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const body = await c.req.json<{ event_ids: string[]; message: string; action?: number }>();
  if (!body.event_ids || !Array.isArray(body.event_ids) || body.event_ids.length === 0) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "event_ids é obrigatório" } }, 400);
  }
  if (!body.message || body.message.trim().length === 0) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "message é obrigatório" } }, 400);
  }

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Zabbix não configurado para este tenant" } },
      404,
    );
  }

  try {
    const result = await client.acknowledgeEvents(body.event_ids, body.message, body.action ?? 1);
    return c.json({ acknowledged: result.eventids, count: result.eventids.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ error: { code: "ZABBIX_API_ERROR", message } }, 502);
  }
});
