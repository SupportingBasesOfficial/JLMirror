// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { z } from "zod";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { encryptTokenParts, decryptTokenParts } from "@repo/zabbix";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const sqlConsoleRoute = new Hono();

// ========== Schemas ==========

const createConnectionSchema = z.object({
  name: z.string().min(1).max(255),
  tenant_id: z.string().uuid().optional(),
  db_engine: z
    .enum(["postgres", "mysql", "sqlserver", "oracle"])
    .default("postgres"),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(5432),
  database_name: z.string().min(1).max(255),
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(500),
  ssl_mode: z
    .enum(["disable", "prefer", "require", "verify-ca", "verify-full"])
    .default("prefer"),
  is_read_only: z.boolean().default(true),
  max_rows: z.number().int().min(1).max(100000).default(1000),
  timeout_seconds: z.number().int().min(1).max(300).default(30),
});

const updateConnectionSchema = createConnectionSchema.partial().extend({
  is_active: z.boolean().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  sql_text: z.string().min(1).max(10000),
  category: z.string().max(100).optional(),
  db_engine: z.enum(["postgres", "mysql", "sqlserver", "oracle"]).optional(),
  tags: z.array(z.string()).default([]),
});

const updateTemplateSchema = createTemplateSchema.partial();

const executeQuerySchema = z.object({
  connection_id: z.string().uuid(),
  query: z.string().min(1).max(10000),
  template_id: z.string().uuid().optional(),
});

// ========== Connections ==========

// GET /api/v1/sql-console/connections
sqlConsoleRoute.get(
  "/connections",
  requirePermission("admin:tenants:read"),
  async (c) => {
    const result = await query(
      `SELECT id, tenant_id, name, db_engine, host, port, database_name, username,
              ssl_mode, is_read_only, max_rows, timeout_seconds, is_active,
              last_used_at, created_at, updated_at
       FROM public.sql_connections
       WHERE is_active = true
       ORDER BY name`,
    );

    return c.json({ connections: result.data?.rows ?? [] });
  },
);

// POST /api/v1/sql-console/connections
sqlConsoleRoute.post(
  "/connections",
  requirePermission("admin:tenants:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const bodyResult = await safeJsonBody(c);
      if (!bodyResult.success) return bodyResult.response;

      const parsed = createConnectionSchema.safeParse(bodyResult.data);
      if (!parsed.success) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Dados invalidos",
              details: parsed.error.flatten(),
            },
          },
          400,
        );
      }

      const d = parsed.data;
      const tokenParts = encryptTokenParts(d.password);

      const result = await query<{ id: string }>(
        `INSERT INTO public.sql_connections
          (tenant_id, name, db_engine, host, port, database_name, username,
           encrypted_password, password_iv, password_tag, ssl_mode,
           is_read_only, max_rows, timeout_seconds, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)
         RETURNING id`,
        [
          d.tenant_id ?? null,
          d.name,
          d.db_engine,
          d.host,
          d.port,
          d.database_name,
          d.username,
          tokenParts.encrypted,
          tokenParts.iv,
          tokenParts.tag,
          d.ssl_mode,
          d.is_read_only,
          d.max_rows,
          d.timeout_seconds,
        ],
      );

      if (!result.data?.rows[0]) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar conexao" } },
          500,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "sql_connection.create",
            entityType: "sql_connection",
            entityId: result.data.rows[0].id,
            newData: { name: d.name, host: d.host },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ id: result.data.rows[0].id }, 201);
    } catch (error) {
      logger.error("Erro ao criar conexao SQL", {
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

// PUT /api/v1/sql-console/connections/:id
sqlConsoleRoute.put(
  "/connections/:id",
  requirePermission("admin:tenants:write"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const bodyResult = await safeJsonBody(c);
      if (!bodyResult.success) return bodyResult.response;

      const parsed = updateConnectionSchema.safeParse(bodyResult.data);
      if (!parsed.success) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "Dados invalidos" } },
          400,
        );
      }

      const d = parsed.data;
      const fields: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      const fieldMap: Record<string, string> = {
        name: "name",
        db_engine: "db_engine",
        host: "host",
        port: "port",
        database_name: "database_name",
        username: "username",
        ssl_mode: "ssl_mode",
        is_read_only: "is_read_only",
        max_rows: "max_rows",
        timeout_seconds: "timeout_seconds",
        is_active: "is_active",
      };

      for (const [key, col] of Object.entries(fieldMap)) {
        if (key in d) {
          fields.push(`${col} = $${idx++}`);
          params.push(d[key as keyof typeof d]);
        }
      }

      // Se password foi fornecido, re-criptografa
      if (d.password) {
        const tokenParts = encryptTokenParts(d.password);
        fields.push(`encrypted_password = $${idx++}`);
        params.push(tokenParts.encrypted);
        fields.push(`password_iv = $${idx++}`);
        params.push(tokenParts.iv);
        fields.push(`password_tag = $${idx++}`);
        params.push(tokenParts.tag);
      }

      if (fields.length === 0) {
        return c.json(
          {
            error: {
              code: "NO_FIELDS",
              message: "Nenhum campo para atualizar",
            },
          },
          400,
        );
      }

      params.push(id);
      const result = await query(
        `UPDATE public.sql_connections SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id`,
        params,
      );

      if (!result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Conexao nao encontrada" } },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "sql_connection.update",
            entityType: "sql_connection",
            entityId: id,
            newData: { name: d.name },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ id, updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar conexao SQL", {
        id,
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

// DELETE /api/v1/sql-console/connections/:id
sqlConsoleRoute.delete(
  "/connections/:id",
  requirePermission("admin:tenants:write"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const result = await query(
        `UPDATE public.sql_connections SET is_active = false WHERE id = $1 RETURNING id`,
        [id],
      );

      if (!result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Conexao nao encontrada" } },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "sql_connection.deactivate",
            entityType: "sql_connection",
            entityId: id,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ id, deactivated: true });
    } catch (error) {
      logger.error("Erro ao desativar conexao SQL", {
        id,
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

// ========== Templates ==========

// GET /api/v1/sql-console/templates
sqlConsoleRoute.get(
  "/templates",
  requirePermission("admin:tenants:read"),
  async (c) => {
    try {
      const category = c.req.query("category");
      const dbEngine = c.req.query("engine");

      let sql = `SELECT * FROM public.sql_templates WHERE 1=1`;
      const params: unknown[] = [];
      let idx = 1;

      if (category) {
        sql += ` AND category = $${idx++}`;
        params.push(category);
      }
      if (dbEngine) {
        sql += ` AND (db_engine = $${idx++} OR db_engine IS NULL)`;
        params.push(dbEngine);
      }

      sql += ` ORDER BY name`;
      const result = await query(sql, params);

      return c.json({ templates: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar templates SQL", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/sql-console/templates
sqlConsoleRoute.post(
  "/templates",
  requirePermission("admin:tenants:write"),
  async (c) => {
    const user = c.get("user");
    const userId = user?.sub ?? null;

    try {
      const bodyResult = await safeJsonBody(c);
      if (!bodyResult.success) return bodyResult.response;

      const parsed = createTemplateSchema.safeParse(bodyResult.data);
      if (!parsed.success) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "Dados invalidos" } },
          400,
        );
      }

      const d = parsed.data;
      const result = await query<{ id: string }>(
        `INSERT INTO public.sql_templates
          (name, description, sql_text, category, db_engine, created_by, is_global, tags)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7)
         RETURNING id`,
        [
          d.name,
          d.description ?? null,
          d.sql_text,
          d.category ?? null,
          d.db_engine ?? null,
          userId,
          d.tags,
        ],
      );

      if (!result.data?.rows[0]) {
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao criar template" },
          },
          500,
        );
      }

      return c.json({ id: result.data.rows[0].id }, 201);
    } catch (error) {
      logger.error("Erro ao criar template SQL", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// PUT /api/v1/sql-console/templates/:id
sqlConsoleRoute.put(
  "/templates/:id",
  requirePermission("admin:tenants:write"),
  async (c) => {
    const id = c.req.param("id");

    try {
      const bodyResult = await safeJsonBody(c);
      if (!bodyResult.success) return bodyResult.response;

      const parsed = updateTemplateSchema.safeParse(bodyResult.data);
      if (!parsed.success) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "Dados invalidos" } },
          400,
        );
      }

      const d = parsed.data;
      const fields: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      const fieldMap: Record<string, string> = {
        name: "name",
        description: "description",
        sql_text: "sql_text",
        category: "category",
        db_engine: "db_engine",
        tags: "tags",
      };

      for (const [key, col] of Object.entries(fieldMap)) {
        if (key in d) {
          fields.push(`${col} = $${idx++}`);
          params.push(d[key as keyof typeof d]);
        }
      }

      if (fields.length === 0) {
        return c.json(
          {
            error: {
              code: "NO_FIELDS",
              message: "Nenhum campo para atualizar",
            },
          },
          400,
        );
      }

      params.push(id);
      const result = await query(
        `UPDATE public.sql_templates SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id`,
        params,
      );

      if (!result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Template nao encontrado" } },
          404,
        );
      }

      return c.json({ id, updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar template SQL", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// DELETE /api/v1/sql-console/templates/:id
sqlConsoleRoute.delete(
  "/templates/:id",
  requirePermission("admin:tenants:write"),
  async (c) => {
    const id = c.req.param("id");
    await query(`DELETE FROM public.sql_templates WHERE id = $1`, [id]);
    return c.json({ id, deleted: true });
  },
);

// ========== Query Execution ==========

// POST /api/v1/sql-console/execute
sqlConsoleRoute.post(
  "/execute",
  requirePermission("admin:tenants:read"),
  async (c) => {
    const user = c.get("user");
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = executeQuerySchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados invalidos" } },
        400,
      );
    }

    const d = parsed.data;

    // Busca conexao
    const connResult = await query<{
      id: string;
      db_engine: string;
      host: string;
      port: number;
      database_name: string;
      username: string;
      encrypted_password: string;
      password_iv: string;
      password_tag: string;
      ssl_mode: string;
      is_read_only: boolean;
      max_rows: number;
      timeout_seconds: number;
    }>(
      `SELECT id, db_engine, host, port, database_name, username,
              encrypted_password, password_iv, password_tag, ssl_mode,
              is_read_only, max_rows, timeout_seconds
       FROM public.sql_connections WHERE id = $1 AND is_active = true`,
      [d.connection_id],
    );

    const conn = connResult.data?.rows[0];
    if (!conn) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Conexao nao encontrada ou inativa",
          },
        },
        404,
      );
    }

    // Valida query se read-only
    if (conn.is_read_only) {
      const forbiddenPatterns = [
        /\bDROP\b/i,
        /\bTRUNCATE\b/i,
        /\bDELETE\b/i,
        /\bINSERT\b/i,
        /\bUPDATE\b/i,
        /\bALTER\b/i,
        /\bCREATE\b/i,
        /\bGRANT\b/i,
        /\bREVOKE\b/i,
      ];
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(d.query)) {
          return c.json(
            {
              error: {
                code: "READ_ONLY_VIOLATION",
                message: `Conexao read-only. Comando nao permitido: ${pattern.source}`,
              },
            },
            403,
          );
        }
      }
    }

    // Descriptografa senha
    let password: string | null = null;
    try {
      password = decryptTokenParts(
        conn.encrypted_password,
        conn.password_iv,
        conn.password_tag,
      );
    } catch {
      return c.json(
        {
          error: {
            code: "DECRYPT_ERROR",
            message: "Erro ao descriptografar senha",
          },
        },
        500,
      );
    }

    // Atualiza last_used_at
    await query(
      `UPDATE public.sql_connections SET last_used_at = now() WHERE id = $1`,
      [d.connection_id],
    );

    // Por enquanto, apenas suportamos postgres nativamente
    // Outros engines requerem driver adicional — retorna erro informativo
    if (conn.db_engine !== "postgres") {
      // Log da tentativa
      await query(
        `INSERT INTO public.sql_query_log (connection_id, user_id, query_text, template_id, success, error_message)
         VALUES ($1, $2, $3, $4, false, $5)`,
        [
          d.connection_id,
          user?.sub ?? null,
          d.query,
          d.template_id ?? null,
          `Engine ${conn.db_engine} ainda nao suportado`,
        ],
      );

      return c.json(
        {
          error: {
            code: "ENGINE_NOT_SUPPORTED",
            message: `Engine ${conn.db_engine} ainda nao suportado. Use postgres.`,
          },
        },
        400,
      );
    }

    // Executa query diretamente no Postgres alvo
    // Nota: query() usa o pool principal (JLMIRROR), precisamos de uma conexao ad-hoc
    const startMs = Date.now();
    try {
      // Importa pg dinamicamente para conexao ad-hoc
      const { Client } = await import("pg");
      const client = new Client({
        host: conn.host,
        port: conn.port,
        database: conn.database_name,
        user: conn.username,
        password: password ?? undefined,
        ssl:
          conn.ssl_mode === "disable"
            ? false
            : { rejectUnauthorized: conn.ssl_mode === "verify-full" },
        query_timeout: conn.timeout_seconds * 1000,
      });

      await client.connect();
      const res = await client.query(d.query);
      await client.end();

      const executionMs = Date.now() - startMs;
      const rows = res.rows ?? [];
      const truncated = rows.length > conn.max_rows;
      const returnedRows = truncated ? rows.slice(0, conn.max_rows) : rows;

      // Log da query bem-sucedida
      await query(
        `INSERT INTO public.sql_query_log (connection_id, user_id, query_text, template_id, rows_returned, execution_ms, success)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [
          d.connection_id,
          user?.sub ?? null,
          d.query,
          d.template_id ?? null,
          rows.length,
          executionMs,
        ],
      );

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId: user?.tenant_id ?? null,
            action: "sql.execute",
            entityType: "sql_query_log",
            newData: {
              connection: conn.host,
              rows: rows.length,
              ms: executionMs,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({
        rows: returnedRows,
        total_rows: rows.length,
        truncated,
        execution_ms: executionMs,
        fields: res.fields?.map((f: { name: string }) => f.name) ?? [],
      });
    } catch (err) {
      const executionMs = Date.now() - startMs;
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";

      // Log da query com erro
      await query(
        `INSERT INTO public.sql_query_log (connection_id, user_id, query_text, template_id, execution_ms, success, error_message)
         VALUES ($1, $2, $3, $4, $5, false, $6)`,
        [
          d.connection_id,
          user?.sub ?? null,
          d.query,
          d.template_id ?? null,
          executionMs,
          errorMsg,
        ],
      );

      return c.json({ error: { code: "QUERY_ERROR", message: errorMsg } }, 502);
    }
  },
);

// GET /api/v1/sql-console/query-log
sqlConsoleRoute.get(
  "/query-log",
  requirePermission("admin:tenants:read"),
  async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    const offset = Number(c.req.query("offset") ?? 0);
    const connectionId = c.req.query("connection_id");

    let sql = `
      SELECT ql.*, sc.name as connection_name, sc.host, sc.database_name
      FROM public.sql_query_log ql
      LEFT JOIN public.sql_connections sc ON ql.connection_id = sc.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let idx = 1;

    if (connectionId) {
      sql += ` AND ql.connection_id = $${idx++}`;
      params.push(connectionId);
    }

    sql += ` ORDER BY ql.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    return c.json({
      logs: result.data?.rows ?? [],
      limit,
      offset,
    });
  },
);
