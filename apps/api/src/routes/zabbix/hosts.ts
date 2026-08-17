// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Rotas de hosts, devices, items, sync, prefs e ping

import type { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { zabbixDashboardPrefsSchema } from "@repo/shared-validation";
import type { ZabbixItem } from "@repo/zabbix";
import { syncTenantDevices } from "../../lib/device-sync.js";
import { groupZabbixItemsByHost } from "../../lib/zabbix-analytics.js";
import {
  createZabbixClient,
  zabbixErrorResponse,
  configNotFoundResponse,
  validationErrorResponse,
  accessDeniedResponse,
  verifyHostOwnership,
  enqueueWriteJob,
} from "./shared.js";

export function registerHostRoutes(zabbixRoute: Hono) {
  // GET /api/v1/zabbix/ping
  zabbixRoute.get("/ping", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json({ connected: false });

    try {
      const connected = await ctx.client.ping();
      return c.json({ connected });
    } catch {
      return c.json({ connected: false });
    }
  });

  // GET /api/v1/zabbix/devices
  zabbixRoute.get("/devices", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json(configNotFoundResponse(), 503);

    try {
      const isGlobalAdmin = user.scope === "global";
      const devices = await ctx.client.getDevices(
        isGlobalAdmin ? undefined : ctx.hostGroupId,
      );
      return c.json({ devices });
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

  // GET /api/v1/zabbix/devices/:hostId
  zabbixRoute.get("/devices/:hostId", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.param("hostId");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json(configNotFoundResponse(), 503);

    try {
      const belongs = await verifyHostOwnership(ctx, hostId);
      if (!belongs) return c.json(accessDeniedResponse(), 403);

      const host = await ctx.client.getDevice(hostId);
      if (!host) {
        return c.json(
          {
            error: {
              code: "DEVICE_NOT_FOUND",
              message: "Dispositivo não encontrado no Zabbix",
            },
          },
          503,
        );
      }
      return c.json({ host });
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
  // POST /api/v1/zabbix/sync
  zabbixRoute.post("/sync", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const configResult = await query<{
      zabbix_api_url: string;
      zabbix_encrypted_token: string;
      zabbix_token_iv: string;
      zabbix_token_tag: string;
      zabbix_host_group_id: string;
    }>("SELECT * FROM public.get_tenant_zabbix_config($1)", [tenantId]);

    if (configResult.error || !configResult.data?.rows[0]) {
      return c.json(configNotFoundResponse(), 503);
    }

    const config = configResult.data.rows[0];

    if (
      !config.zabbix_encrypted_token ||
      !config.zabbix_token_iv ||
      !config.zabbix_token_tag
    ) {
      return c.json(
        {
          error: {
            code: "ZABBIX_CONFIG_NOT_FOUND",
            message: "Token Zabbix não configurado",
          },
        },
        503,
      );
    }

    try {
      const result = await syncTenantDevices({
        tenant_id: tenantId,
        zabbix_api_url: config.zabbix_api_url,
        zabbix_encrypted_token: config.zabbix_encrypted_token,
        zabbix_token_iv: config.zabbix_token_iv,
        zabbix_token_tag: config.zabbix_token_tag,
        zabbix_host_group_id: config.zabbix_host_group_id,
      });

      return c.json({
        message: "Sincronização concluída",
        synced: result.synced,
        total: result.total,
      });
    } catch (error) {
      return c.json(
        {
          error: {
            code: "ZABBIX_SYNC_ERROR",
            message:
              error instanceof Error ? error.message : "Erro na sincronização",
          },
        },
        502,
      );
    }
  });

  // GET /api/v1/zabbix/devices/:hostId/items
  zabbixRoute.get("/devices/:hostId/items", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.param("hostId");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json(configNotFoundResponse(), 503);

    try {
      const belongs = await verifyHostOwnership(ctx, hostId);
      if (!belongs) return c.json(accessDeniedResponse(), 403);

      const items = await ctx.client.getItems(hostId);
      return c.json({ items });
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

  // GET /api/v1/zabbix/devices-items-batch?host_ids=1,2,3
  zabbixRoute.get("/devices-items-batch", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostIdsParam = c.req.query("host_ids");

    if (!hostIdsParam) {
      return c.json(
        {
          error: {
            code: "MISSING_HOST_IDS",
            message: "Parametro host_ids e obrigatorio",
          },
        },
        400,
      );
    }

    const hostIds = hostIdsParam.split(",").filter(Boolean);
    if (hostIds.length === 0) return c.json({ items: [] });

    if (hostIds.length > 500) {
      return c.json(
        {
          error: {
            code: "TOO_MANY_HOSTS",
            message: "Maximo de 500 hosts por request",
          },
        },
        400,
      );
    }

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json(configNotFoundResponse(), 503);

    try {
      const startedAt = Date.now();
      const items = await ctx.client.getItemsForHosts(hostIds);

      logger.info("Batch items fetch concluido", {
        tenantId,
        hostCount: hostIds.length,
        itemCount: items.length,
        durationMs: Date.now() - startedAt,
      });

      // PURIFICADO: Delega o agrupamento denso em memória para a função dedicada do core lógicos
      const itemsByHost = groupZabbixItemsByHost(items);

      return c.json({ items, itemsByHost });
    } catch (error) {
      logger.error("Erro no batch items fetch", {
        tenantId,
        hostCount: hostIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
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
  // GET /api/v1/zabbix/devices/:hostId/prefs
  zabbixRoute.get("/devices/:hostId/prefs", async (c) => {
    const user = c.get("user");
    const userId = user.sub;
    const tenantId = user.tenant_id;
    const hostId = c.req.param("hostId");

    try {
      const result = await query<{
        device_type: string;
        visible_categories: string[];
        collapsed_categories: string[];
        hidden_metrics: string[];
        pinned_metrics: string[];
      }>(
        `SELECT device_type, visible_categories, collapsed_categories, hidden_metrics, pinned_metrics
         FROM tenant_template.dashboard_prefs
         WHERE user_id = $1 AND zabbix_host_id = $2 AND tenant_id = $3`,
        [userId, hostId, tenantId],
      );

      if (result.data?.rows?.[0]) {
        return c.json({ prefs: result.data.rows[0] });
      }

      return c.json({
        prefs: {
          device_type: "auto",
          visible_categories: [],
          collapsed_categories: [],
          hidden_metrics: [],
          pinned_metrics: [],
        },
      });
    } catch (error) {
      return c.json(
        {
          error: {
            code: "DB_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "Erro ao buscar preferências",
          },
        },
        500,
      );
    }
  });

  // PUT /api/v1/zabbix/devices/:hostId/prefs
  zabbixRoute.put("/devices/:hostId/prefs", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;
    const hostId = c.req.param("hostId");

    try {
      const body = await c.req.json();
      const parsed = zabbixDashboardPrefsSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }

      const d = parsed.data;
      const result = await query(
        `INSERT INTO tenant_template.dashboard_prefs
          (tenant_id, user_id, zabbix_host_id, device_type, visible_categories, collapsed_categories, hidden_metrics, pinned_metrics)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, zabbix_host_id)
         DO UPDATE SET
           device_type = EXCLUDED.device_type,
           visible_categories = EXCLUDED.visible_categories,
           collapsed_categories = EXCLUDED.collapsed_categories,
           hidden_metrics = EXCLUDED.hidden_metrics,
           pinned_metrics = EXCLUDED.pinned_metrics,
           updated_at = timezone('utc'::text, now())`,
        [
          tenantId,
          userId,
          hostId,
          d.device_type,
          JSON.stringify(d.visible_categories),
          JSON.stringify(d.collapsed_categories),
          JSON.stringify(d.hidden_metrics),
          JSON.stringify(d.pinned_metrics),
        ],
      );

      if (result.error) {
        return c.json(
          { error: { code: "DB_ERROR", message: result.error.message } },
          500,
        );
      }

      return c.json({ ok: true });
    } catch (error) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "Erro ao salvar preferências",
          },
        },
        400,
      );
    }
  });

  // POST /api/v1/zabbix/hosts
  zabbixRoute.post("/hosts", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json(configNotFoundResponse(), 503);

    try {
      const body = await c.req.json();
      const { zabbixCreateHostSchema } =
        await import("@repo/shared-validation");
      const parsed = zabbixCreateHostSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const hostData = { ...parsed.data, groupids: [ctx.hostGroupId] };
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "host.create",
        method: "host.create",
        params: hostData,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // PUT /api/v1/zabbix/hosts/:id
  zabbixRoute.put("/hosts/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;
    const hostId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json(configNotFoundResponse(), 503);

    try {
      const belongs = await verifyHostOwnership(ctx, hostId);
      if (!belongs) return c.json(accessDeniedResponse(), 403);

      const body = await c.req.json();
      const { zabbixUpdateHostSchema } =
        await import("@repo/shared-validation");
      const parsed = zabbixUpdateHostSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const { groupids, ...updateData } = parsed.data;
      void groupids;
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "host.update",
        method: "host.update",
        params: { hostid: hostId, ...updateData },
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });
  // DELETE /api/v1/zabbix/hosts/:id
  zabbixRoute.delete("/hosts/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;
    const hostId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json(configNotFoundResponse(), 503);

    try {
      const belongs = await verifyHostOwnership(ctx, hostId);
      if (!belongs) return c.json(accessDeniedResponse(), 403);

      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "host.delete",
        method: "host.delete",
        params: [hostId] as unknown as Record<string, unknown>,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // POST /api/v1/zabbix/items
  zabbixRoute.post("/items", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json(configNotFoundResponse(), 503);

    try {
      const body = await c.req.json();
      const { zabbixCreateItemSchema } =
        await import("@repo/shared-validation");
      const parsed = zabbixCreateItemSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const belongs = await verifyHostOwnership(ctx, parsed.data.hostid);
      if (!belongs) return c.json(accessDeniedResponse(), 403);

      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "item.create",
        method: "item.create",
        params: parsed.data as Record<string, unknown>,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // PUT /api/v1/zabbix/items/:id
  zabbixRoute.put("/items/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;
    const itemId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json(configNotFoundResponse(), 503);

    try {
      const body = await c.req.json();
      const { zabbixUpdateItemSchema } =
        await import("@repo/shared-validation");
      const parsed = zabbixUpdateItemSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "item.update",
        method: "item.update",
        params: { itemid: itemId, ...parsed.data } as Record<string, unknown>,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // DELETE /api/v1/zabbix/items/:id
  zabbixRoute.delete("/items/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;
    const itemId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json(configNotFoundResponse(), 503);

    try {
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "item.delete",
        method: "item.delete",
        params: [itemId] as unknown as Record<string, unknown>,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // POST /api/v1/zabbix/items/:id/execute
  zabbixRoute.post("/items/:id/execute", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const itemId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json(configNotFoundResponse(), 503);

    try {
      const result = await ctx.client.executeItem(itemId);
      return c.json({ ok: true, itemids: result.itemids });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/key-items?key=system.cpu.util
  zabbixRoute.get("/key-items", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const keySearch = c.req.query("key");

    if (!keySearch) {
      return c.json(
        {
          error: {
            code: "MISSING_PARAM",
            message: "Parâmetro 'key' é obrigatório",
          },
        },
        400,
      );
    }

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) return c.json(configNotFoundResponse(), 503);

    try {
      const devices = await ctx.client.getDevices(
        ctx.isGlobalAdmin ? undefined : ctx.hostGroupId,
      );
      const hostIds = devices.map((d) => d.hostid);
      if (hostIds.length === 0) {
        return c.json({ data: [] as ZabbixItem[] });
      }
      const items = await ctx.client.getKeyItems(hostIds, keySearch);
      return c.json({ data: items });
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
}
