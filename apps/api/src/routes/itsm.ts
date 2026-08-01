// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import { createTicket, type ITSMConnectorConfig } from "../lib/itsm-connector.js";
import "../types.js";

export const itsmRoute = new Hono();

itsmRoute.use("/*", jwtAuth);
itsmRoute.use("/*", tenantContext);

// ========== Connectors CRUD ==========

// GET /api/v1/itsm/connectors — lista connectors
itsmRoute.get("/connectors", requirePermission("itsm:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const result = await query(
    `SELECT id, name, connector_type, base_url, auth_type, username,
       field_mapping, sync_direction, auto_create_on_incident, auto_update_on_resolve,
       is_active, last_sync_at, last_sync_status, last_sync_error, created_at, updated_at
     FROM public.itsm_connectors WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );

  return c.json({ connectors: result.data?.rows ?? [] });
});

// POST /api/v1/itsm/connectors — cria connector
itsmRoute.post("/connectors", requirePermission("itsm:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const body = await c.req.json();

  const {
    name, connector_type, base_url, auth_type,
    api_key, username, password, bearer_token,
    oauth_client_id, oauth_client_secret, oauth_token_url,
    field_mapping, sync_direction, auto_create_on_incident, auto_update_on_resolve, is_active,
  } = body;

  if (!name || !connector_type || !base_url || !auth_type) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "name, connector_type, base_url e auth_type são obrigatórios" } }, 400);
  }

  if (!["jira", "freshservice", "servicenow", "zendesk", "custom"].includes(connector_type)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "connector_type inválido" } }, 400);
  }

  const result = await query<{ id: string }>(
    `INSERT INTO public.itsm_connectors
       (tenant_id, name, connector_type, base_url, auth_type,
        api_key_encrypted, username, password_encrypted, bearer_token_encrypted,
        oauth_client_id, oauth_client_secret_encrypted, oauth_token_url,
        field_mapping, sync_direction, auto_create_on_incident, auto_update_on_resolve, is_active, configured_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     ON CONFLICT (tenant_id, name) DO UPDATE SET
       connector_type = EXCLUDED.connector_type,
       base_url = EXCLUDED.base_url,
       auth_type = EXCLUDED.auth_type,
       api_key_encrypted = EXCLUDED.api_key_encrypted,
       username = EXCLUDED.username,
       password_encrypted = EXCLUDED.password_encrypted,
       bearer_token_encrypted = EXCLUDED.bearer_token_encrypted,
       oauth_client_id = EXCLUDED.oauth_client_id,
       oauth_client_secret_encrypted = EXCLUDED.oauth_client_secret_encrypted,
       oauth_token_url = EXCLUDED.oauth_token_url,
       field_mapping = EXCLUDED.field_mapping,
       sync_direction = EXCLUDED.sync_direction,
       auto_create_on_incident = EXCLUDED.auto_create_on_incident,
       auto_update_on_resolve = EXCLUDED.auto_update_on_resolve,
       is_active = EXCLUDED.is_active
     RETURNING id`,
    [
      tenantId, name, connector_type, base_url, auth_type,
      api_key ?? null, username ?? null, password ?? null, bearer_token ?? null,
      oauth_client_id ?? null, oauth_client_secret ?? null, oauth_token_url ?? null,
      JSON.stringify(field_mapping ?? {}),
      sync_direction ?? "outbound",
      auto_create_on_incident ?? false, auto_update_on_resolve ?? false,
      is_active ?? true, user.sub,
    ],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'itsm.connector.create', 'itsm_connectors', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ id: result.data?.rows[0]?.id, name, connector_type })],
  );

  return c.json({ id: result.data?.rows[0]?.id, created: true });
});

// DELETE /api/v1/itsm/connectors/:id — remove connector
itsmRoute.delete("/connectors/:id", requirePermission("itsm:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const connectorId = c.req.param("id");

  await query("DELETE FROM public.itsm_connectors WHERE id = $1 AND tenant_id = $2", [connectorId, tenantId]);

  await query(
    "SELECT public.write_audit_log($1, NULL, 'itsm.connector.delete', 'itsm_connectors', $2, NULL, NULL, NULL)",
    [user.sub, connectorId],
  );

  return c.json({ deleted: true });
});

// ========== Operations ==========

// POST /api/v1/itsm/connectors/:id/test — testa a conexao do connector
itsmRoute.post("/connectors/:id/test", requirePermission("itsm:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const connectorId = c.req.param("id");

  const configResult = await query<ITSMConnectorConfig>(
    "SELECT * FROM public.itsm_connectors WHERE id = $1 AND tenant_id = $2 LIMIT 1",
    [connectorId, tenantId],
  );

  const config = configResult.data?.rows[0];
  if (!config) {
    return c.json({ error: { code: "NOT_FOUND", message: "Connector não encontrado" } }, 404);
  }

  // Tenta criar um ticket de teste
  const result = await createTicket(config, {
    title: "[TESTE] JLMIRROR — Teste de Conexão",
    description: "Ticket de teste criado pelo JLMIRROR para validar a integração. Pode ser descartado.",
    severity: "info",
    source_id: "test",
    source_type: "manual",
  });

  // Atualiza status de sync
  await query(
    "UPDATE public.itsm_connectors SET last_sync_at = timezone('utc'::text, now()), last_sync_status = $1, last_sync_error = $2 WHERE id = $3",
    [result.success ? "success" : "failed", result.error ?? null, connectorId],
  );

  return c.json({ test_result: result });
});

// POST /api/v1/itsm/connectors/:id/create-ticket — cria ticket no ITSM
itsmRoute.post("/connectors/:id/create-ticket", requirePermission("itsm:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const connectorId = c.req.param("id");
  const body = await c.req.json();

  const configResult = await query<ITSMConnectorConfig>(
    "SELECT * FROM public.itsm_connectors WHERE id = $1 AND tenant_id = $2 LIMIT 1",
    [connectorId, tenantId],
  );

  const config = configResult.data?.rows[0];
  if (!config) {
    return c.json({ error: { code: "NOT_FOUND", message: "Connector não encontrado" } }, 404);
  }

  const startTime = Date.now();
  const result = await createTicket(config, {
    title: body.title,
    description: body.description,
    severity: body.severity ?? "warning",
    source_id: body.source_id ?? "",
    source_type: body.source_type ?? "manual",
    ...body.extra_fields,
  });
  const durationMs = Date.now() - startTime;

  // Registra no log
  await query(
    `INSERT INTO public.itsm_sync_log (tenant_id, connector_id, source_type, source_id, operation, external_ticket_id, external_ticket_url, request_payload, response_payload, status, error_message, duration_ms)
     VALUES ($1, $2, $3, $4, 'create', $5, $6, $7, $8, $9, $10, $11)`,
    [
      tenantId, connectorId,
      body.source_type ?? "manual", body.source_id ?? null,
      result.external_ticket_id ?? null, result.external_ticket_url ?? null,
      JSON.stringify(body), result.response ? JSON.stringify(result.response) : null,
      result.success ? "success" : "failed",
      result.error ?? null, durationMs,
    ],
  );

  // Atualiza status do connector
  await query(
    "UPDATE public.itsm_connectors SET last_sync_at = timezone('utc'::text, now()), last_sync_status = $1, last_sync_error = $2 WHERE id = $3",
    [result.success ? "success" : "failed", result.error ?? null, connectorId],
  );

  return c.json(result);
});

// ========== Sync Log ==========

// GET /api/v1/itsm/sync-log — historico de sincronizacao
itsmRoute.get("/sync-log", requirePermission("itsm:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const connectorId = c.req.query("connector_id");

  let sql = `SELECT l.*, cn.name as connector_name
     FROM public.itsm_sync_log l
     JOIN public.itsm_connectors cn ON l.connector_id = cn.id
     WHERE l.tenant_id = $1`;
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (connectorId) {
    sql += ` AND l.connector_id = $${paramIdx++}`;
    params.push(connectorId);
  }

  sql += ` ORDER BY l.created_at DESC LIMIT $${paramIdx++}`;
  params.push(limit);

  const result = await query(sql, params);

  return c.json({ logs: result.data?.rows ?? [] });
});

// GET /api/v1/itsm/stats — estatisticas
itsmRoute.get("/stats", requirePermission("itsm:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const connectorsResult = await query("SELECT COUNT(*) as count FROM public.itsm_connectors WHERE tenant_id = $1 AND is_active = true", [tenantId]);
  const syncsResult = await query("SELECT COUNT(*) as count FROM public.itsm_sync_log WHERE tenant_id = $1", [tenantId]);
  const successResult = await query("SELECT COUNT(*) as count FROM public.itsm_sync_log WHERE tenant_id = $1 AND status = 'success'", [tenantId]);
  const failedResult = await query("SELECT COUNT(*) as count FROM public.itsm_sync_log WHERE tenant_id = $1 AND status = 'failed'", [tenantId]);
  const byTypeResult = await query(
    `SELECT connector_type, COUNT(*) as count FROM public.itsm_connectors WHERE tenant_id = $1 GROUP BY connector_type`,
    [tenantId],
  );

  const getCount = (r: { data?: { rows?: Array<Record<string, unknown>> } | null }): number => {
    const row = r.data?.rows?.[0];
    return row ? parseInt((row.count as string) ?? "0", 10) : 0;
  };

  return c.json({
    active_connectors: getCount(connectorsResult),
    total_syncs: getCount(syncsResult),
    successful_syncs: getCount(successResult),
    failed_syncs: getCount(failedResult),
    by_type: byTypeResult.data?.rows ?? [],
  });
});
