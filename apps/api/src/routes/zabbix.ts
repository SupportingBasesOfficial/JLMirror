import { Hono } from "hono";
import { query } from "@repo/db";
import { cachedQuery, cacheDel } from "@repo/cache";
import {
  BlindedZabbixClient,
  decryptTokenParts,
  type ZabbixItem,
} from "@repo/zabbix";
import {
  zabbixAcknowledgeSchema,
  zabbixCreateHostSchema,
  zabbixUpdateHostSchema,
  zabbixCreateItemSchema,
  zabbixUpdateItemSchema,
  zabbixCreateTriggerSchema,
  zabbixUpdateTriggerSchema,
  zabbixCreateHostGroupSchema,
  zabbixUpdateHostGroupSchema,
  zabbixCreateMaintenanceSchema,
  zabbixDashboardPrefsSchema,
} from "@repo/shared-validation";
import "../types.js";
import { syncTenantDevices } from "../lib/device-sync.js";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";

export const zabbixRoute = new Hono();

zabbixRoute.use("/*", jwtAuth);
zabbixRoute.use("/*", tenantContext);

interface ZabbixTenantConfig {
  zabbix_api_url: string;
  zabbix_encrypted_token: string;
  zabbix_token_iv: string;
  zabbix_token_tag: string;
  zabbix_host_group_id: string;
}

// Busca config do Zabbix do tenant com cache Redis (60s)
// Evita DB query + decrypt AES-256-GCM em toda request
async function getTenantZabbixConfig(tenantId: string): Promise<ZabbixTenantConfig | null> {
  const cacheKey = `zabbix:config:${tenantId}`;
  return cachedQuery<ZabbixTenantConfig | null>(
    cacheKey,
    async () => {
      const configResult = await query<ZabbixTenantConfig>(
        "SELECT * FROM public.get_tenant_zabbix_config($1)",
        [tenantId],
      );

      if (configResult.error || !configResult.data?.rows[0]) {
        return null;
      }

      const config = configResult.data.rows[0];

      if (!config.zabbix_encrypted_token || !config.zabbix_token_iv || !config.zabbix_token_tag) {
        return null;
      }

      return {
        zabbix_api_url: config.zabbix_api_url,
        zabbix_encrypted_token: config.zabbix_encrypted_token,
        zabbix_token_iv: config.zabbix_token_iv,
        zabbix_token_tag: config.zabbix_token_tag,
        zabbix_host_group_id: config.zabbix_host_group_id,
      };
    },
    60,
    [`tenant:${tenantId}`],
  );
}

// Invalida cache de config Zabbix do tenant (chamar apos atualizar config)
export async function invalidateZabbixConfigCache(tenantId: string): Promise<void> {
  await cacheDel(`zabbix:config:${tenantId}`);
}

// Cria instância do BlindedZabbixClient com config do tenant (cacheada em Redis)
export async function createZabbixClient(tenantId: string): Promise<BlindedZabbixClient | null> {
  const config = await getTenantZabbixConfig(tenantId);

  if (!config) {
    return null;
  }

  if (!config.zabbix_encrypted_token || !config.zabbix_token_iv || !config.zabbix_token_tag) {
    return null;
  }

  const apiToken = decryptTokenParts(
    config.zabbix_encrypted_token,
    config.zabbix_token_iv,
    config.zabbix_token_tag,
  );

  if (!apiToken) {
    return null;
  }

  return new BlindedZabbixClient({
    apiUrl: config.zabbix_api_url,
    apiToken,
  });
}

// Helper para classificar erros da API Zabbix
function zabbixErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes("timeout") || lowerMsg.includes("etimedout") || lowerMsg.includes("aborted")) {
    return { error: { code: "ZABBIX_TIMEOUT", message: "Timeout na comunicação com Zabbix" } };
  }
  if (lowerMsg.includes("econnrefused") || lowerMsg.includes("enotfound") || lowerMsg.includes("econnreset")) {
    return { error: { code: "ZABBIX_UNREACHABLE", message: "Servidor Zabbix indisponível" } };
  }
  if (lowerMsg.includes("unauthorized") || lowerMsg.includes("forbidden") || lowerMsg.includes("403")) {
    return { error: { code: "ZABBIX_AUTH_ERROR", message: "Token Zabbix inválido ou sem permissão" } };
  }
  return { error: { code: "ZABBIX_API_ERROR", message } };
}

// GET /api/v1/zabbix/ping — testa conectividade com a API Zabbix
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
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada para o tenant" } },
      503,
    );
  }

  // Busca todos os hosts do Zabbix sem filtrar por group_id
  try {
    const devices = await client.getDevices();
    return c.json({ devices });
  } catch (error) {
    return c.json(
      { error: { code: "ZABBIX_API_ERROR", message: error instanceof Error ? error.message : "Erro na API Zabbix" } },
      502,
    );
  }
});

// GET /api/v1/zabbix/devices/:hostId — busca um unico dispositivo por ID
zabbixRoute.get("/devices/:hostId", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const hostId = c.req.param("hostId");

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada para o tenant" } },
      503,
    );
  }

  try {
    const host = await client.getDevice(hostId);
    if (!host) {
      return c.json(
        { error: { code: "DEVICE_NOT_FOUND", message: "Dispositivo não encontrado no Zabbix" } },
        503,
      );
    }
    return c.json({ host });
  } catch (error) {
    return c.json(
      { error: { code: "ZABBIX_API_ERROR", message: error instanceof Error ? error.message : "Erro na API Zabbix" } },
      502,
    );
  }
});

// POST /api/v1/zabbix/sync — sincroniza devices do Zabbix para o banco (trigger manual)
zabbixRoute.post("/sync", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const configResult = await query<{
    zabbix_api_url: string;
    zabbix_encrypted_token: string;
    zabbix_token_iv: string;
    zabbix_token_tag: string;
  }>("SELECT * FROM public.get_tenant_zabbix_config($1)", [tenantId]);

  if (configResult.error || !configResult.data?.rows[0]) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada para o tenant" } },
      503,
    );
  }

  const config = configResult.data.rows[0];

  if (!config.zabbix_encrypted_token || !config.zabbix_token_iv || !config.zabbix_token_tag) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Token Zabbix não configurado" } },
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
    });

    return c.json({
      message: "Sincronização concluída",
      synced: result.synced,
      total: result.total,
    });
  } catch (error) {
    return c.json(
      { error: { code: "ZABBIX_SYNC_ERROR", message: error instanceof Error ? error.message : "Erro na sincronização" } },
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
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } },
      503,
    );
  }

  try {
    const items = await client.getItems(hostId);
    return c.json({ items });
  } catch (error) {
    return c.json(
      { error: { code: "ZABBIX_API_ERROR", message: error instanceof Error ? error.message : "Erro na API Zabbix" } },
      502,
    );
  }
});

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
      { error: { code: "VALIDATION_ERROR", message: "item_id é obrigatório" } },
      400,
    );
  }

  const from = fromStr ? Number(fromStr) : Math.floor(Date.now() / 1000) - 3600;
  const to = toStr ? Number(toStr) : Math.floor(Date.now() / 1000);
  const valueType = valueTypeStr ? Number(valueTypeStr) : undefined;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } },
      503,
    );
  }

  try {
    const history = await client.getHistory(itemId, from, to, valueType);
    return c.json({ data: history });
  } catch (error) {
    return c.json(
      { error: { code: "ZABBIX_API_ERROR", message: error instanceof Error ? error.message : "Erro na API Zabbix" } },
      502,
    );
  }
});

// GET /api/v1/zabbix/key-items?key=system.cpu.util
zabbixRoute.get("/key-items", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const keySearch = c.req.query("key");

  if (!keySearch) {
    return c.json(
      { error: { code: "MISSING_PARAM", message: "Parâmetro 'key' é obrigatório" } },
      400,
    );
  }

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } },
      503,
    );
  }

  try {
    // Busca todos os host IDs do tenant primeiro
    const devices = await client.getDevices();
    const hostIds = devices.map((d) => d.hostid);
    if (hostIds.length === 0) {
      return c.json({ data: [] as ZabbixItem[] });
    }
    const items = await client.getKeyItems(hostIds, keySearch);
    return c.json({ data: items });
  } catch (error) {
    return c.json(
      { error: { code: "ZABBIX_API_ERROR", message: error instanceof Error ? error.message : "Erro na API Zabbix" } },
      502,
    );
  }
});

// GET /api/v1/zabbix/triggers?host_id=123
zabbixRoute.get("/triggers", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const hostId = c.req.query("host_id");

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } },
      503,
    );
  }

  try {
    const hostIds = hostId ? [hostId] : undefined;
    const triggers = await client.getTriggers(hostIds);
    return c.json({ data: triggers });
  } catch (error) {
    return c.json(
      { error: { code: "ZABBIX_API_ERROR", message: error instanceof Error ? error.message : "Erro na API Zabbix" } },
      502,
    );
  }
});

// GET /api/v1/zabbix/ping
zabbixRoute.get("/ping", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json(
      { error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } },
      503,
    );
  }

  try {
    const connected = await client.ping();
    return c.json({ connected });
  } catch {
    return c.json({ connected: false });
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

    // Sem prefs salvas — retorna defaults
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
      { error: { code: "DB_ERROR", message: error instanceof Error ? error.message : "Erro ao buscar preferências" } },
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
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: parsed.error.flatten() } }, 400);
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
      { error: { code: "VALIDATION_ERROR", message: error instanceof Error ? error.message : "Erro ao salvar preferências" } },
      400,
    );
  }
});

// ==================== PROBLEMS ====================

// GET /api/v1/zabbix/problems?host_id=...&acknowledged=false
zabbixRoute.get("/problems", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const hostId = c.req.query("host_id");
  const acknowledged = c.req.query("acknowledged");

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const hostIds = hostId ? [hostId] : undefined;
    const options: { acknowledged?: boolean } = {};
    if (acknowledged !== undefined) options.acknowledged = acknowledged === "true";
    const problems = await client.getProblems(hostIds, options);
    return c.json({ data: problems });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== EVENTS ====================

// GET /api/v1/zabbix/events?host_id=...&value=1&limit=100
zabbixRoute.get("/events", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const hostId = c.req.query("host_id");
  const value = c.req.query("value");
  const acknowledged = c.req.query("acknowledged");
  const limit = c.req.query("limit");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const hostIds = hostId ? [hostId] : [];
    const options: { value?: number; acknowledged?: boolean; limit?: number; from?: number; to?: number } = {};
    if (value) options.value = Number(value);
    if (acknowledged !== undefined) options.acknowledged = acknowledged === "true";
    if (limit) options.limit = Number(limit);
    if (from) options.from = Number(from);
    if (to) options.to = Number(to);
    const events = await client.getEvents(hostIds, options);
    return c.json({ data: events });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== ACKNOWLEDGE ====================

// POST /api/v1/zabbix/acknowledge
zabbixRoute.post("/acknowledge", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const body = await c.req.json();
    const parsed = zabbixAcknowledgeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: parsed.error.flatten() } }, 400);
    }
    const d = parsed.data;
    const result = await client.acknowledgeEvents(d.eventids, d.message, d.action);
    return c.json({ ok: true, eventids: result.eventids });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== TEMPLATES ====================

// GET /api/v1/zabbix/templates?host_id=...
zabbixRoute.get("/templates", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const hostId = c.req.query("host_id");

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const templates = await client.getTemplates(hostId);
    return c.json({ data: templates });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== MAINTENANCE ====================

// GET /api/v1/zabbix/maintenances?host_id=...
zabbixRoute.get("/maintenances", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const hostId = c.req.query("host_id");

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const hostIds = hostId ? [hostId] : undefined;
    const maintenances = await client.getMaintenances(hostIds);
    return c.json({ data: maintenances });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// POST /api/v1/zabbix/maintenances
zabbixRoute.post("/maintenances", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const body = await c.req.json();
    const parsed = zabbixCreateMaintenanceSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: parsed.error.flatten() } }, 400);
    }
    const result = await client.createMaintenance(parsed.data);
    return c.json({ ok: true, maintenanceids: result.maintenanceids });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// DELETE /api/v1/zabbix/maintenances/:id
zabbixRoute.delete("/maintenances/:id", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const maintenanceId = c.req.param("id");

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    await client.deleteMaintenance([maintenanceId]);
    return c.json({ ok: true });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== SERVICES ====================

// GET /api/v1/zabbix/services?parent_id=...
zabbixRoute.get("/services", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const parentId = c.req.query("parent_id");

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const services = await client.getServices(parentId);
    return c.json({ data: services });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== SLA ====================

// GET /api/v1/zabbix/slas
zabbixRoute.get("/slas", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const slas = await client.getSlas();
    return c.json({ data: slas });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== GRAPHS ====================

// GET /api/v1/zabbix/graphs?host_id=...
zabbixRoute.get("/graphs", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const hostId = c.req.query("host_id");

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const graphs = await client.getGraphs(hostId ?? undefined);
    return c.json({ data: graphs });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== USERS ====================

// GET /api/v1/zabbix/users
zabbixRoute.get("/users", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const users = await client.getUsers();
    return c.json({ data: users });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== ACTIONS ====================

// GET /api/v1/zabbix/actions
zabbixRoute.get("/actions", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const actions = await client.getActions();
    return c.json({ data: actions });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== PROXIES ====================

// GET /api/v1/zabbix/proxies
zabbixRoute.get("/proxies", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const proxies = await client.getProxies();
    return c.json({ data: proxies });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== DISCOVERY ====================

// GET /api/v1/zabbix/discovery-rules
zabbixRoute.get("/discovery-rules", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const rules = await client.getDiscoveryRules();
    return c.json({ data: rules });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== REPORTS ====================

// GET /api/v1/zabbix/reports
zabbixRoute.get("/reports", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const reports = await client.getReports();
    return c.json({ data: reports });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== HOST GROUPS (com hosts) ====================

// GET /api/v1/zabbix/host-groups
zabbixRoute.get("/host-groups", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const groups = await client.getHostGroupsWithHosts();
    return c.json({ data: groups });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// POST /api/v1/zabbix/host-groups
zabbixRoute.post("/host-groups", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const body = await c.req.json();
    const parsed = zabbixCreateHostGroupSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: parsed.error.flatten() } }, 400);
    }
    const result = await client.createHostGroup(parsed.data.name);
    return c.json({ ok: true, groupids: result.groupids });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// PUT /api/v1/zabbix/host-groups/:id
zabbixRoute.put("/host-groups/:id", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const groupId = c.req.param("id");

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const body = await c.req.json();
    const parsed = zabbixUpdateHostGroupSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: parsed.error.flatten() } }, 400);
    }
    await client.updateHostGroup(groupId, parsed.data.name);
    return c.json({ ok: true });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// DELETE /api/v1/zabbix/host-groups/:id
zabbixRoute.delete("/host-groups/:id", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const groupId = c.req.param("id");

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    await client.deleteHostGroup([groupId]);
    return c.json({ ok: true });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== HOST CRUD ====================

// POST /api/v1/zabbix/hosts
zabbixRoute.post("/hosts", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const body = await c.req.json();
    const parsed = zabbixCreateHostSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: parsed.error.flatten() } }, 400);
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
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const body = await c.req.json();
    const parsed = zabbixUpdateHostSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: parsed.error.flatten() } }, 400);
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
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    await client.deleteHost([hostId]);
    return c.json({ ok: true });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== ITEM CRUD ====================

// POST /api/v1/zabbix/items
zabbixRoute.post("/items", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const body = await c.req.json();
    const parsed = zabbixCreateItemSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: parsed.error.flatten() } }, 400);
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
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const body = await c.req.json();
    const parsed = zabbixUpdateItemSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: parsed.error.flatten() } }, 400);
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
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    await client.deleteItem([itemId]);
    return c.json({ ok: true });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== TRIGGER CRUD ====================

// POST /api/v1/zabbix/triggers
zabbixRoute.post("/triggers", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const body = await c.req.json();
    const parsed = zabbixCreateTriggerSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: parsed.error.flatten() } }, 400);
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
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const body = await c.req.json();
    const parsed = zabbixUpdateTriggerSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: parsed.error.flatten() } }, 400);
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
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    await client.deleteTrigger([triggerId]);
    return c.json({ ok: true });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== HISTORY BATCH ====================

// GET /api/v1/zabbix/history-batch?item_ids=1,2,3&from=...&to=...&value_type=0
zabbixRoute.get("/history-batch", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const itemIdsStr = c.req.query("item_ids");
  const fromStr = c.req.query("from");
  const toStr = c.req.query("to");
  const valueTypeStr = c.req.query("value_type");

  if (!itemIdsStr) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "item_ids é obrigatório" } }, 400);
  }

  const itemIds = itemIdsStr.split(",");
  const from = fromStr ? Number(fromStr) : Math.floor(Date.now() / 1000) - 3600;
  const to = toStr ? Number(toStr) : Math.floor(Date.now() / 1000);
  const valueType = valueTypeStr ? Number(valueTypeStr) : undefined;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const history = await client.getHistoryBatch(itemIds, from, to, valueType);
    return c.json({ data: history });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});

// ==================== API VERSION ====================

// GET /api/v1/zabbix/version
zabbixRoute.get("/version", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const client = await createZabbixClient(tenantId);
  if (!client) {
    return c.json({ error: { code: "ZABBIX_CONFIG_NOT_FOUND", message: "Configuração Zabbix não encontrada" } }, 503);
  }

  try {
    const version = await client.getApiVersion();
    return c.json({ version });
  } catch (error) {
    return c.json(zabbixErrorResponse(error), 502);
  }
});
