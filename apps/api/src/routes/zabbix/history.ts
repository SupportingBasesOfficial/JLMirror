// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Rotas de history, graphs, triggers e overview

import type { Hono } from "hono";
import type { ZabbixItem } from "@repo/zabbix";
import { downsamplePoints } from "../../lib/downsample.js";
import {
  createZabbixClient,
  zabbixErrorResponse,
  configNotFoundResponse,
  validationErrorResponse,
} from "./shared.js";

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

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const history = await client.getHistory(itemId, from, to, valueType);
      const points = downsamplePoints(
        history.map((h) => ({ clock: h.clock, value: h.value })),
        500,
      );
      return c.json({ data: points, downsampled: history.length > 500 });
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

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const history = await client.getHistoryBatch(
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

  // GET /api/v1/zabbix/graphs?host_id=...
  zabbixRoute.get("/graphs", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.query("host_id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const graphs = await client.getGraphs(hostId ?? undefined);
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

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const graphs = await client.getGraphs();
      const graph = graphs.find((g) => g.graphid === graphId);
      if (!graph) {
        return c.json(
          {
            error: { code: "GRAPH_NOT_FOUND", message: "Grafo não encontrado" },
          },
          404,
        );
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

      const itemsData = await client.rpc<ZabbixItem[]>("item.get", {
        itemids: itemIds,
        output: ["itemid", "name", "key_", "units", "value_type"],
      });

      const history = await client.getHistoryBatch(itemIds, timeFrom, timeTo);

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

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const hostIds = hostId ? [hostId] : undefined;
      const triggers = await client.getTriggers(hostIds);
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

    const client = await createZabbixClient(tenantId);
    if (!client) {
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
      const result = await client.createTrigger(parsed.data);
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

    const client = await createZabbixClient(tenantId);
    if (!client) {
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
      await client.updateTrigger(triggerId, parsed.data);
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

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      await client.deleteTrigger([triggerId]);
      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/overview
  zabbixRoute.get("/overview", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(
        {
          error: {
            code: "ZABBIX_CONFIG_NOT_FOUND",
            message: "Zabbix não configurado para este tenant",
          },
        },
        404,
      );
    }

    try {
      const hosts = await client.getDevices();
      const hostIds = hosts.map((h) => h.hostid);
      const [problems, triggers] = await Promise.all([
        client.getProblems(hostIds.length > 0 ? hostIds : undefined, {
          recent: true,
        }),
        client.getTriggers(hostIds.length > 0 ? hostIds : undefined),
      ]);

      const severityCount = (
        arr: { severity: number }[],
        minSeverity: number,
      ): number => arr.filter((p) => p.severity >= minSeverity).length;

      return c.json({
        hosts_total: hostIds.length,
        problems_total: problems.length,
        problems_critical: severityCount(problems, 4),
        problems_warning:
          severityCount(problems, 2) - severityCount(problems, 4),
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

  // GET /api/v1/zabbix/version
  zabbixRoute.get("/version", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const version = await client.getApiVersion();
      return c.json({ version });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });
}
