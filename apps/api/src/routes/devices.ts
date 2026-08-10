// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { requirePermission } from "../middleware/require-permission.js";
import { safeRows, safeFirstRow } from "../lib/query-helpers.js";
import "../types.js";

export const devicesRoute = new Hono();

devicesRoute.use("/*", requirePermission("zabbix:devices:read"));

// GET /api/v1/devices
devicesRoute.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  try {
    const result = await query<{
      id: string;
      tenant_id: string;
      hostname: string;
      ip: string;
      type: string;
      status: string;
      zabbix_host_id: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, tenant_id, hostname, ip, type, status, zabbix_host_id, created_at, updated_at
       FROM public.devices WHERE tenant_id = $1 ORDER BY hostname`,
      [tenantId],
    );

    if (result.error) {
      return c.json(
        { error: { code: "DB_ERROR", message: result.error.message } },
        500,
      );
    }

    return c.json({ devices: safeRows(result) });
  } catch (error) {
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Erro interno",
        },
      },
      500,
    );
  }
});

// GET /api/v1/devices/:id
devicesRoute.get("/:id", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const deviceId = c.req.param("id");

  try {
    const result = await query<{
      id: string;
      tenant_id: string;
      hostname: string;
      ip: string;
      type: string;
      status: string;
      zabbix_host_id: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, tenant_id, hostname, ip, type, status, zabbix_host_id, created_at, updated_at
       FROM public.devices WHERE tenant_id = $1 AND id = $2`,
      [tenantId, deviceId],
    );

    if (result.error) {
      return c.json(
        { error: { code: "DB_ERROR", message: result.error.message } },
        500,
      );
    }

    const device = safeFirstRow(result);
    if (!device) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Dispositivo não encontrado" } },
        404,
      );
    }

    return c.json(device);
  } catch (error) {
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Erro interno",
        },
      },
      500,
    );
  }
});
