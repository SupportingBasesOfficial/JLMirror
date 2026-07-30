import { Hono } from "hono";
import { tenantQuery, getTenantSchema } from "@repo/db";
import "../types.js";

export const devicesRoute = new Hono();

// GET /api/v1/devices
devicesRoute.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const schemaResult = await getTenantSchema(tenantId);
  if (schemaResult.error) {
    return c.json(
      { error: { code: "TENANT_NOT_FOUND", message: "Tenant não encontrado" } },
      404,
    );
  }

  const schemaName = schemaResult.data;
  const result = await tenantQuery<{
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
    tenantId,
    `SELECT id, tenant_id, hostname, ip, type, status, zabbix_host_id, created_at, updated_at FROM ${schemaName}.devices ORDER BY hostname`,
  );

  if (result.error) {
    return c.json(
      { error: { code: "DB_ERROR", message: result.error.message } },
      500,
    );
  }

  return c.json({ devices: result.data?.rows ?? [] });
});

// GET /api/v1/devices/:id
devicesRoute.get("/:id", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const deviceId = c.req.param("id");

  const schemaResult = await getTenantSchema(tenantId);
  if (schemaResult.error) {
    return c.json(
      { error: { code: "TENANT_NOT_FOUND", message: "Tenant não encontrado" } },
      404,
    );
  }

  const schemaName = schemaResult.data;
  const result = await tenantQuery<{
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
    tenantId,
    `SELECT id, tenant_id, hostname, ip, type, status, zabbix_host_id, created_at, updated_at FROM ${schemaName}.devices WHERE id = $1`,
    [deviceId],
  );

  if (result.error) {
    return c.json(
      { error: { code: "DB_ERROR", message: result.error.message } },
      500,
    );
  }

  if (!result.data?.rows[0]) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Dispositivo não encontrado" } },
      404,
    );
  }

  return c.json(result.data.rows[0]);
});
