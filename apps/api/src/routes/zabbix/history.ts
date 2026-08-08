// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Rotas de history, trends, graphs, triggers e overview

import type { Hono } from "hono";
import type { ZabbixItem } from "@repo/zabbix";
import { cacheGetJSON, cacheSetJSON } from "@repo/cache";
import { query } from "@repo/db";
import { downsamplePoints } from "../../lib/downsample.js";
import {
  createZabbixClient,
  zabbixErrorResponse,
  configNotFoundResponse,
  validationErrorResponse,
  accessDeniedResponse,
  verifyHostOwnership,
} from "./shared.js";

// Le history do TSDB (zabbix_history_cache) — retorna null se nao houver dados
async function getHistoryFromCache(
  tenantId: string,
  itemId: string,
  from: number,
  to: number,
): Promise<Array<{ clock: number; value: string }> | null> {
  try {
    const result = await query<{ clock: number; value: string }>(
      `SELECT clock, value FROM public.zabbix_history_cache
       WHERE tenant_id = $1 AND itemid = $2 AND clock >= $3 AND clock <= $4
       ORDER BY clock ASC LIMIT 5000`,
      [tenantId, itemId, from, to],
    );
    if (result.error || !result.data?.rows.length) return null;
    return result.data.rows;
  } catch {
    return null;
  }
}

export function registerHistoryRoutes(zabbixRoute: Hono) {
  // GET /api/v1/zabbix/history?item_id=...&from=...&to=...&value_type=...
  zabbixRoute.get("/history", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const itemId = c.req.query("item_id");
    const fromStr = c.req.query("from");
    const toStr = c.req.query("to");
    const valueTypeStr = c.req.query("value_type");

    if (!itemId) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "item_id é obrigatório" },
        },
        400,
      );
    }

    const from = fromStr
      ? Number(fromStr)
      : Math.floor(Date.now() / 1000) - 3600;
    const to = toStr ? Number(toStr) : Math.floor(Date.now() / 1000);
    const valueType = valueTypeStr ? Number(valueTypeStr) : undefined;

    const ctx = await createZabbixClient(tenantId);
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      // Cache de series temporais em Redis (TTL 5s) — reduz 95% das chamadas ao Zabbix
      const cacheKey = `zabbix:history:${tenantId}:${itemId}:${from}:${to}:${valueType ?? "all"}`;
      const cached = await cacheGetJSON<{
        data: unknown[];
        downsampled: boolean;
      }>(cacheKey);
      if (cached) {
        return c.json(cached);
      }

      // 1. Tenta ler do TSDB (zabbix_history_cache) primeiro — connector streaming
      const tsdbData = await getHistoryFromCache(tenantId, itemId, from, to);
      if (tsdbData && tsdbData.length > 0) {
        const points = downsamplePoints(tsdbData, 500);
        const result = {
          data: points,
          downsampled: tsdbData.length > 500,
          source: "tsdb",
        };
        await cacheSetJSON(cacheKey, result, 5);
        return c.json(result);
      }

      // 2. Fallback: busca direto na API do Zabbix se TSDB nao tem dados
      const history = await ctx.client.getHistory(itemId, from, to, valueType);
      const points = downsamplePoints(
        history.map((h) => ({ clock: h.clock, value: h.value })),
        500,
      );
      const result = {
        data: points,
        downsampled: history.length > 500,
        source: "zabbix_api",
      };
      await cacheSetJSON(cacheKey, result, 5);
      return c.json(result);
    } catch (error) {
      return c.json(
        {
          error: {
            code: "ZABBIX_API_ERROR",
            message:
              error instanceof Error ? error.message : "Erro na API Zabbix",
          },
        },
        502,
      );
    }
  });

  // GET /api/v1/zabbix/history-batch?item_ids=1,2,3&from=...&to=...&value_type=0
  zabbixRoute.get("/history-batch", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const itemIdsStr = c.req.query("item_ids");
    const fromStr = c.req.query("from");
    const toStr = c.req.query("to");
    const valueTypeStr = c.req.query("value_type");

    if (!itemIdsStr) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "item_ids é obrigatório",
          },
        },
        400,
      );
    }

    const itemIds = itemIdsStr.split(",");
    const from = fromStr
      ? Number(fromStr)
      : Math.floor(Date.now() / 1000) - 3600;
    const to = toStr ? Number(toStr) : Math.floor(Date.now() / 1000);
    const valueType = valueTypeStr ? Number(valueTypeStr) : undefined;

    const ctx = await createZabbixClient(tenantId);
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const history = await ctx.client.getHistoryBatch(
        itemIds,
        from,
        to,
        valueType,
      );
      const series = itemIds.map((itemId) => {
        const rawPoints = history
          .filter((h) => h.itemid === itemId)
          .map((h) => ({ clock: h.clock, value: h.value }));
        return {
          itemid: itemId,
          points: downsamplePoints(rawPoints, 500),
          downsampled: rawPoints.length > 500,
        };
      });
      return c.json({ data: series });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/trends?item_ids=1,2,3&from=...&to=...&value_type=0
  // Trends — dados consolidados por hora (min/max/avg) para graficos de longo prazo
  zabbixRoute.get("/trends", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const itemIdsStr = c.req.query("item_ids");
    const fromStr = c.req.query("from");
    const toStr = c.req.query("to");
    const valueTypeStr = c.req.query("value_type");

    if (!itemIdsStr) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "item_ids é obrigatório",
          },
        },
        400,
      );
    }

    const itemIds = itemIdsStr.split(",");
    const from = fromStr
      ? Number(fromStr)
      : Math.floor(Date.now() / 1000) - 86400; // default 24h
    const to = toStr ? Number(toStr) : Math.floor(Date.now() / 1000);
    const valueType = valueTypeStr ? Number(valueTypeStr) : undefined;

    const ctx = await createZabbixClient(tenantId);
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const trends = await ctx.client.getTrends(itemIds, from, to, valueType);
      const series = itemIds.map((itemId) => ({
        itemid: itemId,
        points: trends
          .filter((t) => t.itemid === itemId)
          .map((t) => ({
            clock: t.clock,
            value_min: t.value_min,
            value_avg: t.value_avg,
            value_max: t.value_max,
            num: t.num,
          })),
      }));
      return c.json({ data: series });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/graphs?host_id=...
  zabbixRoute.get("/graphs", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.query("host_id");

    const ctx = await createZabbixClient(tenantId);
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      // Se hostId informado, verifica posse (IDOR protection)
      if (hostId) {
        const belongs = await verifyHostOwnership(ctx, hostId);
        if (!belongs) {
          return c.json(accessDeniedResponse(), 403);
        }
      }
      const graphs = await ctx.client.getGraphs(hostId ?? undefined);
      return c.json({ data: graphs });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/graphs/:graphid/data?from=UNIX&to=UNIX
  zabbixRoute.get("/graphs/:graphid/data", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const graphId = c.req.param("graphid");
    const from = c.req.query("from");
    const to = c.req.query("to");

    const ctx = await createZabbixClient(tenantId);
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      // Busca apenas graphs dos hosts do tenant (IDOR protection)
      const devices = await ctx.client.getDevices(ctx.hostGroupId);
      const tenantHostIds = new Set(devices.map((d) => d.hostid));

      const graphs = await ctx.client.getGraphs();
      const graph = graphs.find((g) => g.graphid === graphId);
      if (!graph) {
        return c.json(
          {
            error: { code: "GRAPH_NOT_FOUND", message: "Grafo não encontrado" },
          },
          404,
        );
      }

      // Verifica se o graph pertence a um host do tenant
      const graphHosts = graph.hosts ?? [];
      const belongsToTenant =
        graphHosts.length === 0 ||
        graphHosts.some((h) => tenantHostIds.has(h.hostid));
      if (!belongsToTenant) {
        return c.json(accessDeniedResponse(), 403);
      }

      const itemIds = (graph.gitems ?? graph.items ?? []).map(
        (gi) => gi.itemid,
      );
      if (itemIds.length === 0) {
        return c.json({ data: { graph, series: [] } });
      }

      const now = Math.floor(Date.now() / 1000);
      const timeFrom = from ? parseInt(from, 10) : now - 3600;
      const timeTo = to ? parseInt(to, 10) : now;

      const itemsData = await ctx.client.rpc<ZabbixItem[]>("item.get", {
        itemids: itemIds,
        output: ["itemid", "name", "key_", "units", "value_type"],
      });

      const history = await ctx.client.getHistoryBatch(
        itemIds,
        timeFrom,
        timeTo,
      );

      const series = itemIds.map((itemId) => {
        const item = itemsData.find((i) => i.itemid === itemId);
        const gitem = (graph.gitems ?? graph.items ?? []).find(
          (gi) => gi.itemid === itemId,
        );
        const rawPoints = history
          .filter((h) => h.itemid === itemId)
          .map((h) => ({ clock: h.clock, value: h.value }));
        const points = downsamplePoints(rawPoints, 500);
        return {
          itemid: itemId,
          name: item?.name ?? `Item ${itemId}`,
          key: item?.key_ ?? "",
          units: item?.units ?? "",
          color: gitem?.color ?? "#666666",
          drawtype: gitem?.drawtype ?? 0,
          points,
          downsampled: rawPoints.length > 500,
        };
      });

      return c.json({ data: { graph, series } });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/triggers?host_id=123
  zabbixRoute.get("/triggers", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.query("host_id");

    const ctx = await createZabbixClient(tenantId);
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      // Se hostId informado, verifica posse (IDOR protection)
      if (hostId) {
        const belongs = await verifyHostOwnership(ctx, hostId);
        if (!belongs) {
          return c.json(accessDeniedResponse(), 403);
        }
      }
      const hostIds = hostId ? [hostId] : undefined;
      const triggers = await ctx.client.getTriggers(hostIds);
      return c.json({ data: triggers });
    } catch (error) {
      return c.json(
        {
          error: {
            code: "ZABBIX_API_ERROR",
            message:
              error instanceof Error ? error.message : "Erro na API Zabbix",
          },
        },
        502,
      );
    }
  });

  // POST /api/v1/zabbix/triggers
  zabbixRoute.post("/triggers", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId);
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const { zabbixCreateTriggerSchema } =
        await import("@repo/shared-validation");
      const parsed = zabbixCreateTriggerSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const result = await ctx.client.createTrigger(parsed.data);
      return c.json({ ok: true, triggerids: result.triggerids });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // PUT /api/v1/zabbix/triggers/:id
  zabbixRoute.put("/triggers/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const triggerId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId);
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const { zabbixUpdateTriggerSchema } =
        await import("@repo/shared-validation");
      const parsed = zabbixUpdateTriggerSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      await ctx.client.updateTrigger(triggerId, parsed.data);
      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // DELETE /api/v1/zabbix/triggers/:id
  zabbixRoute.delete("/triggers/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const triggerId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId);
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      await ctx.client.deleteTrigger([triggerId]);
      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });
}
