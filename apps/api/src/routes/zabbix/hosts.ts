// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Rotas de hosts, devices, items, sync, prefs e ping

import type { Hono } from "hono";
import { query } from "@repo/db";
import { zabbixDashboardPrefsSchema } from "@repo/shared-validation";
import type { ZabbixItem } from "@repo/zabbix";
import { syncTenantDevices } from "../../lib/device-sync.js";
import {
  createZabbixClient,
  zabbixErrorResponse,
  configNotFoundResponse,
  validationErrorResponse,
} from "./shared.js";

export function registerHostRoutes(zabbixRoute: Hono) {
  // GET /api/v1/zabbix/ping
  zabbixRoute.get("/ping", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json({ connected: false });
    }

    try {
      const connected = await client.ping();
      return c.json({ connected });
    } catch {
      return c.json({ connected: false });
    }
  });

  // GET /api/v1/zabbix/devices
  zabbixRoute.get("/devices", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const devices = await client.getDevices();
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

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const host = await client.getDevice(hostId);
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

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const items = await client.getItems(hostId);
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

      if (result.data?.rows[0]) {
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

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const { zabbixCreateHostSchema } =
        await import("@repo/shared-validation");
      const parsed = zabbixCreateHostSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const result = await client.createHost(parsed.data);
      return c.json({ ok: true, hostids: result.hostids });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // PUT /api/v1/zabbix/hosts/:id
  zabbixRoute.put("/hosts/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.param("id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const { zabbixUpdateHostSchema } =
        await import("@repo/shared-validation");
      const parsed = zabbixUpdateHostSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      await client.updateHost(hostId, parsed.data);
      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // DELETE /api/v1/zabbix/hosts/:id
  zabbixRoute.delete("/hosts/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.param("id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      await client.deleteHost([hostId]);
      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // POST /api/v1/zabbix/items
  zabbixRoute.post("/items", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const { zabbixCreateItemSchema } =
        await import("@repo/shared-validation");
      const parsed = zabbixCreateItemSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const result = await client.createItem(parsed.data);
      return c.json({ ok: true, itemids: result.itemids });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // PUT /api/v1/zabbix/items/:id
  zabbixRoute.put("/items/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const itemId = c.req.param("id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const { zabbixUpdateItemSchema } =
        await import("@repo/shared-validation");
      const parsed = zabbixUpdateItemSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      await client.updateItem(itemId, parsed.data);
      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // DELETE /api/v1/zabbix/items/:id
  zabbixRoute.delete("/items/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const itemId = c.req.param("id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      await client.deleteItem([itemId]);
      return c.json({ ok: true });
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

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const devices = await client.getDevices();
      const hostIds = devices.map((d) => d.hostid);
      if (hostIds.length === 0) {
        return c.json({ data: [] as ZabbixItem[] });
      }
      const items = await client.getKeyItems(hostIds, keySearch);
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
