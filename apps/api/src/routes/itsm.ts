// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { validate } from "../middleware/validate.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import {
  itsmConnectorSchema,
  itsmCreateTicketSchema,
} from "@repo/shared-validation";
import {
  createTicket,
  type ITSMConnectorConfig,
} from "../lib/itsm-connector.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const itsmRoute = new Hono();

// GET /api/v1/itsm — overview do modulo
itsmRoute.get("/", requirePermission("itsm:read"), httpCache(30), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const connectorsResult = await query(
      "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.itsm_connectors WHERE tenant_id = $1",
      [tenantId],
    );

    return c.json({
      overview: {
        connectors: connectorsResult.data?.rows[0] ?? {
          total: "0",
          active: "0",
        },
      },
      endpoints: [
        "/connectors",
        "/connectors/:id",
        "/connectors/:id/test",
        "/connectors/:id/create-ticket",
        "/sync-log",
        "/stats",
      ],
    });
  } catch (error) {
    logger.error("Erro ao buscar ITSM overview", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// ========== Connectors CRUD ==========

// GET /api/v1/itsm/connectors — lista connectors
itsmRoute.get(
  "/connectors",
  requirePermission("itsm:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `SELECT id, name, connector_type, base_url, auth_type, username,
         field_mapping, sync_direction, auto_create_on_incident, auto_update_on_resolve,
         is_active, last_sync_at, last_sync_status, last_sync_error, created_at, updated_at
         FROM public.itsm_connectors WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId],
      );

      return c.json({ connectors: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar ITSM connectors", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/itsm/connectors — cria connector
itsmRoute.post(
  "/connectors",
  requirePermission("itsm:write"),
  rateLimitWrite,
  validate({ schema: itsmConnectorSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as {
      name: string;
      connector_type: string;
      base_url: string;
      auth_type: string;
      api_key?: string;
      username?: string;
      password?: string;
      bearer_token?: string;
      oauth_client_id?: string;
      oauth_client_secret?: string;
      oauth_token_url?: string;
      field_mapping?: Record<string, unknown>;
      sync_direction?: string;
      auto_create_on_incident?: boolean;
      auto_update_on_resolve?: boolean;
      is_active?: boolean;
    };

    const {
      name,
      connector_type,
      base_url,
      auth_type,
      api_key,
      username,
      password,
      bearer_token,
      oauth_client_id,
      oauth_client_secret,
      oauth_token_url,
      field_mapping,
      sync_direction,
      auto_create_on_incident,
      auto_update_on_resolve,
      is_active,
    } = body;

    try {
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
          tenantId,
          name,
          connector_type,
          base_url,
          auth_type,
          api_key ?? null,
          username ?? null,
          password ?? null,
          bearer_token ?? null,
          oauth_client_id ?? null,
          oauth_client_secret ?? null,
          oauth_token_url ?? null,
          JSON.stringify(field_mapping ?? {}),
          sync_direction ?? "outbound",
          auto_create_on_incident ?? false,
          auto_update_on_resolve ?? false,
          is_active ?? true,
          userId,
        ],
      );

      const connectorId = result.data?.rows[0]?.id;

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "itsm.connector.create",
            entityType: "itsm_connectors",
            entityId: connectorId,
            newData: { id: connectorId, name, connector_type },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("ITSM connector criado", {
        connectorId,
        name,
        connector_type,
        tenantId,
      });

      return c.json({ id: connectorId, created: true });
    } catch (error) {
      logger.error("Erro ao criar ITSM connector", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar" } },
        500,
      );
    }
  },
);

// DELETE /api/v1/itsm/connectors/:id — remove connector
itsmRoute.delete(
  "/connectors/:id",
  requirePermission("itsm:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const connectorId = c.req.param("id");

    try {
      const result = await query(
        "DELETE FROM public.itsm_connectors WHERE id = $1 AND tenant_id = $2",
        [connectorId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Connector não encontrado" } },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "itsm.connector.delete",
            entityType: "itsm_connectors",
            entityId: connectorId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("ITSM connector removido", { connectorId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover ITSM connector", {
        connectorId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover" } },
        500,
      );
    }
  },
);

// ========== Operations ==========

// POST /api/v1/itsm/connectors/:id/test — testa a conexao do connector
itsmRoute.post(
  "/connectors/:id/test",
  requirePermission("itsm:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const connectorId = c.req.param("id");

    try {
      const configResult = await query<ITSMConnectorConfig>(
        "SELECT * FROM public.itsm_connectors WHERE id = $1 AND tenant_id = $2 LIMIT 1",
        [connectorId, tenantId],
      );

      const config = configResult.data?.rows[0];
      if (!config) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Connector não encontrado" } },
          404,
        );
      }

      // Tenta criar um ticket de teste
      const result = await createTicket(config, {
        title: "[TESTE] JLMIRROR — Teste de Conexão",
        description:
          "Ticket de teste criado pelo JLMIRROR para validar a integração. Pode ser descartado.",
        severity: "info",
        source_id: "test",
        source_type: "manual",
      });

      // Atualiza status de sync
      await query(
        "UPDATE public.itsm_connectors SET last_sync_at = timezone('utc'::text, now()), last_sync_status = $1, last_sync_error = $2 WHERE id = $3",
        [
          result.success ? "success" : "failed",
          result.error ?? null,
          connectorId,
        ],
      );

      logger.info("ITSM connector testado", {
        connectorId,
        success: result.success,
        tenantId,
      });

      return c.json({ test_result: result });
    } catch (error) {
      logger.error("Erro ao testar ITSM connector", {
        connectorId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "TEST_ERROR", message: "Erro ao testar connector" } },
        500,
      );
    }
  },
);

// POST /api/v1/itsm/connectors/:id/create-ticket — cria ticket no ITSM
itsmRoute.post(
  "/connectors/:id/create-ticket",
  requirePermission("itsm:write"),
  rateLimitWrite,
  validate({ schema: itsmCreateTicketSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const connectorId = c.req.param("id");
    const body = c.get("validatedData") as {
      title: string;
      description?: string;
      severity?: string;
      source_id?: string;
      source_type?: string;
      extra_fields?: Record<string, unknown>;
    };

    try {
      const configResult = await query<ITSMConnectorConfig>(
        "SELECT * FROM public.itsm_connectors WHERE id = $1 AND tenant_id = $2 LIMIT 1",
        [connectorId, tenantId],
      );

      const config = configResult.data?.rows[0];
      if (!config) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Connector não encontrado" } },
          404,
        );
      }

      const startTime = Date.now();
      const result = await createTicket(config, {
        title: body.title,
        description: body.description ?? "",
        severity: body.severity ?? "warning",
        source_id: body.source_id ?? "",
        source_type: body.source_type ?? "manual",
        ...body.extra_fields,
      });
      const durationMs = Date.now() - startTime;

      // Paraleliza: log + update connector status
      await Promise.all([
        query(
          `INSERT INTO public.itsm_sync_log (tenant_id, connector_id, source_type, source_id, operation, external_ticket_id, external_ticket_url, request_payload, response_payload, status, error_message, duration_ms)
           VALUES ($1, $2, $3, $4, 'create', $5, $6, $7, $8, $9, $10, $11)`,
          [
            tenantId,
            connectorId,
            body.source_type ?? "manual",
            body.source_id ?? null,
            result.external_ticket_id ?? null,
            result.external_ticket_url ?? null,
            JSON.stringify(body),
            result.response ? JSON.stringify(result.response) : null,
            result.success ? "success" : "failed",
            result.error ?? null,
            durationMs,
          ],
        ),
        query(
          "UPDATE public.itsm_connectors SET last_sync_at = timezone('utc'::text, now()), last_sync_status = $1, last_sync_error = $2 WHERE id = $3",
          [
            result.success ? "success" : "failed",
            result.error ?? null,
            connectorId,
          ],
        ),
      ]);

      logger.info("ITSM ticket criado", {
        connectorId,
        success: result.success,
        externalId: result.external_ticket_id,
        tenantId,
      });

      return c.json(result);
    } catch (error) {
      logger.error("Erro ao criar ITSM ticket", {
        connectorId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar ticket" } },
        500,
      );
    }
  },
);

// ========== Sync Log ==========

// GET /api/v1/itsm/sync-log — historico de sincronizacao
itsmRoute.get(
  "/sync-log",
  requirePermission("itsm:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
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

    try {
      const result = await query(sql, params);

      return c.json({ logs: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar ITSM sync log", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/itsm/stats — estatisticas
itsmRoute.get(
  "/stats",
  requirePermission("itsm:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 5 queries independentes
      const [
        connectorsResult,
        syncsResult,
        successResult,
        failedResult,
        byTypeResult,
      ] = await Promise.all([
        query(
          "SELECT COUNT(*) as count FROM public.itsm_connectors WHERE tenant_id = $1 AND is_active = true",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.itsm_sync_log WHERE tenant_id = $1",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.itsm_sync_log WHERE tenant_id = $1 AND status = 'success'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.itsm_sync_log WHERE tenant_id = $1 AND status = 'failed'",
          [tenantId],
        ),
        query(
          `SELECT connector_type, COUNT(*) as count FROM public.itsm_connectors WHERE tenant_id = $1 GROUP BY connector_type`,
          [tenantId],
        ),
      ]);

      const getCount = (r: {
        data?: { rows?: Array<Record<string, unknown>> } | null;
      }): number => {
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
    } catch (error) {
      logger.error("Erro ao buscar ITSM stats", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);
