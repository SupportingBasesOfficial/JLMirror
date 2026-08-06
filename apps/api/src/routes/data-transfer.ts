// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import {
  createExportTemplateSchema,
  updateExportTemplateSchema,
  createDataExportSchema,
  createDataImportSchema,
  type CreateExportTemplateInput,
  type UpdateExportTemplateInput,
  type CreateDataExportInput,
  type CreateDataImportInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const dataTransferRoute = new Hono();

// GET /api/v1/data-transfer — overview do modulo
dataTransferRoute.get(
  "/",
  requirePermission("data_transfer:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const exportsResult = await query(
      "SELECT COUNT(*) as total FROM public.data_exports WHERE tenant_id = $1",
      [tenantId],
    );
    const importsResult = await query(
      "SELECT COUNT(*) as total FROM public.data_imports WHERE tenant_id = $1",
      [tenantId],
    );

    return c.json({
      overview: {
        exports: exportsResult.data?.rows[0]?.total ?? "0",
        imports: importsResult.data?.rows[0]?.total ?? "0",
      },
      endpoints: ["/whitelist", "/templates", "/exports", "/imports"],
    });
  },
);

// ========== Whitelist ==========

dataTransferRoute.get(
  "/whitelist",
  requirePermission("data_transfer:read"),
  async (c) => {
    const result = await query(
      "SELECT table_name, allowed_export, allowed_import, max_export_rows FROM public.data_transfer_whitelist ORDER BY table_name",
      [],
    );
    return c.json({ whitelist: result.data?.rows ?? [] });
  },
);

// ========== Export Templates ==========

dataTransferRoute.get(
  "/templates",
  requirePermission("data_transfer:read"),
  async (c) => {
    const user = c.get("user");
    const result = await query(
      `SELECT * FROM public.data_export_templates WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [user?.tenant_id ?? null],
    );
    return c.json({ templates: result.data?.rows ?? [] });
  },
);

dataTransferRoute.post(
  "/templates",
  requirePermission("data_transfer:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<CreateExportTemplateInput>();
    const parsed = createExportTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;

    // Verifica whitelist
    const wlResult = await query(
      "SELECT allowed_export FROM public.data_transfer_whitelist WHERE table_name = $1 AND allowed_export = true",
      [data.source_table],
    );
    if (!wlResult.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN_TABLE",
            message: `Tabela ${data.source_table} não permite exportação`,
          },
        },
        403,
      );
    }

    const result = await query<{ id: string }>(
      `INSERT INTO public.data_export_templates (tenant_id, name, description, source_table, format, columns, filters, include_headers, delimiter, encoding, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.name,
        data.description ?? null,
        data.source_table,
        data.format,
        JSON.stringify(data.columns),
        JSON.stringify(data.filters),
        data.include_headers,
        data.delimiter,
        data.encoding,
        data.is_active,
        user.sub,
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar template" } },
        500,
      );
    }

    return c.json({ id: result.data.rows[0].id }, 201);
  },
);

dataTransferRoute.put(
  "/templates/:id",
  requirePermission("data_transfer:write"),
  async (c) => {
    const templateId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json<UpdateExportTemplateInput>();
    const parsed = updateExportTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      name: "name",
      description: "description",
      source_table: "source_table",
      format: "format",
      include_headers: "include_headers",
      delimiter: "delimiter",
      encoding: "encoding",
      is_active: "is_active",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (data.columns !== undefined) {
      updateFields.push(`columns = $${paramIdx++}`);
      params.push(JSON.stringify(data.columns));
    }

    if (data.filters !== undefined) {
      updateFields.push(`filters = $${paramIdx++}`);
      params.push(JSON.stringify(data.filters));
    }

    if (updateFields.length === 0) {
      return c.json({ id: templateId });
    }

    params.push(templateId, user?.tenant_id ?? null);

    await query(
      `UPDATE public.data_export_templates SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
      params,
    );

    return c.json({ id: templateId });
  },
);

dataTransferRoute.delete(
  "/templates/:id",
  requirePermission("data_transfer:write"),
  async (c) => {
    const templateId = c.req.param("id");
    const user = c.get("user");

    await query(
      "DELETE FROM public.data_export_templates WHERE id = $1 AND tenant_id = $2",
      [templateId, user?.tenant_id ?? null],
    );

    return c.json({ deleted: true });
  },
);

// ========== Data Exports ==========

dataTransferRoute.get(
  "/exports",
  requirePermission("data_transfer:read"),
  async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    const result = await query(
      `SELECT * FROM public.data_exports WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
      params,
    );

    return c.json({ exports: result.data?.rows ?? [] });
  },
);

dataTransferRoute.post(
  "/exports",
  requirePermission("data_transfer:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<CreateDataExportInput>();
    const parsed = createDataExportSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;

    // Verifica whitelist
    const wlResult = await query(
      "SELECT allowed_export, max_export_rows FROM public.data_transfer_whitelist WHERE table_name = $1 AND allowed_export = true",
      [data.source_table],
    );
    if (!wlResult.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN_TABLE",
            message: `Tabela ${data.source_table} não permite exportação`,
          },
        },
        403,
      );
    }

    const maxRows = (wlResult.data.rows[0] as { max_export_rows: number })
      .max_export_rows;

    // Cria registro de export
    const exportResult = await query<{ id: string }>(
      `INSERT INTO public.data_exports (tenant_id, template_id, name, source_table, format, columns, filters, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', $8) RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.template_id ?? null,
        data.name,
        data.source_table,
        data.format,
        JSON.stringify(data.columns),
        JSON.stringify(data.filters),
        user.sub,
      ],
    );

    const exportId = exportResult.data?.rows[0]?.id;
    const startTime = Date.now();

    try {
      // Constrói query — colunas e tabela já validadas pelo Zod regex (apenas [a-zA-Z_][a-zA-Z0-9_]*)
      const columns =
        Array.isArray(data.columns) && data.columns.length > 0
          ? data.columns.join(", ")
          : "*";

      // Query com limite de linhas — source_table validado pelo Zod regex
      const sql = `SELECT ${columns} FROM public.${data.source_table} WHERE tenant_id = $1 LIMIT $2`;
      const dataResult = await query(sql, [user?.tenant_id ?? null, maxRows]);

      const rows = dataResult.data?.rows ?? [];
      let fileContent = "";
      let fileExt = "csv";

      if (data.format === "json") {
        fileContent = JSON.stringify(rows, null, 2);
        fileExt = "json";
      } else if (data.format === "sql") {
        fileContent = `-- Export: ${data.name}\n-- Table: ${data.source_table}\n-- Date: ${new Date().toISOString()}\n\n`;
        for (const row of rows) {
          const values = Object.values(row).map((v) => {
            if (v === null) return "NULL";
            if (typeof v === "number") return String(v);
            if (typeof v === "boolean") return v ? "true" : "false";
            return `'${String(v).replace(/'/g, "''")}'`;
          });
          const cols = Object.keys(row).join(", ");
          fileContent += `INSERT INTO ${data.source_table} (${cols}) VALUES (${values.join(", ")});\n`;
        }
        fileExt = "sql";
      } else {
        // CSV
        if (rows.length > 0) {
          const headers = Object.keys(rows[0] as Record<string, unknown>);
          fileContent = headers.join(",") + "\n";
          for (const row of rows) {
            const values = headers.map((h) => {
              const val = (row as Record<string, unknown>)[
                h as keyof typeof row
              ];
              if (val === null || val === undefined) return "";
              if (
                typeof val === "string" &&
                (val.includes(",") || val.includes('"') || val.includes("\n"))
              ) {
                return `"${val.replace(/"/g, '""')}"`;
              }
              return String(val);
            });
            fileContent += values.join(",") + "\n";
          }
        }
        fileExt = "csv";
      }

      const fileSizeBytes = Buffer.byteLength(fileContent, "utf-8");
      const durationMs = Date.now() - startTime;
      const filePath = `exports/${exportId}.${fileExt}`;

      // Atualiza registro
      await query(
        `UPDATE public.data_exports SET
         status = 'completed', file_path = $1, file_size_bytes = $2,
         row_count = $3, completed_at = timezone('utc'::text, now()),
         duration_ms = $4
       WHERE id = $5`,
        [filePath, fileSizeBytes, rows.length, durationMs, exportId],
      );

      await query(
        "SELECT public.write_audit_log($1, NULL, 'data.export', 'data_export', $2, $3, NULL, NULL)",
        [
          user.sub,
          exportId,
          JSON.stringify({
            table: data.source_table,
            format: data.format,
            rows: rows.length,
          }),
        ],
      );

      return c.json(
        {
          id: exportId,
          status: "completed",
          row_count: rows.length,
          file_size_bytes: fileSizeBytes,
          duration_ms: durationMs,
          file_content: fileContent.substring(0, 50000),
          file_ext: fileExt,
        },
        201,
      );
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";

      await query(
        `UPDATE public.data_exports SET status = 'failed', error_message = $1, duration_ms = $2, completed_at = timezone('utc'::text, now()) WHERE id = $3`,
        [errorMsg, durationMs, exportId],
      );

      return c.json(
        { error: { code: "EXPORT_ERROR", message: errorMsg } },
        500,
      );
    }
  },
);

dataTransferRoute.get(
  "/exports/:id",
  requirePermission("data_transfer:read"),
  async (c) => {
    const exportId = c.req.param("id");
    const user = c.get("user");

    const result = await query(
      "SELECT * FROM public.data_exports WHERE id = $1 AND tenant_id = $2",
      [exportId, user?.tenant_id ?? null],
    );

    if (!result.data?.rows[0]) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Export não encontrado" } },
        404,
      );
    }

    return c.json({ export: result.data.rows[0] });
  },
);

dataTransferRoute.delete(
  "/exports/:id",
  requirePermission("data_transfer:write"),
  async (c) => {
    const exportId = c.req.param("id");
    const user = c.get("user");

    await query(
      "DELETE FROM public.data_exports WHERE id = $1 AND tenant_id = $2",
      [exportId, user?.tenant_id ?? null],
    );

    return c.json({ deleted: true });
  },
);

// ========== Data Imports ==========

dataTransferRoute.get(
  "/imports",
  requirePermission("data_transfer:read"),
  async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    const result = await query(
      `SELECT * FROM public.data_imports WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
      params,
    );

    return c.json({ imports: result.data?.rows ?? [] });
  },
);

dataTransferRoute.post(
  "/imports",
  requirePermission("data_transfer:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<CreateDataImportInput>();
    const parsed = createDataImportSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;

    // Verifica whitelist
    const wlResult = await query(
      "SELECT allowed_import FROM public.data_transfer_whitelist WHERE table_name = $1 AND allowed_import = true",
      [data.target_table],
    );
    if (!wlResult.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN_TABLE",
            message: `Tabela ${data.target_table} não permite importação`,
          },
        },
        403,
      );
    }

    const result = await query<{ id: string }>(
      `INSERT INTO public.data_imports (tenant_id, name, target_table, format, file_path, column_mapping, options, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8) RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.name,
        data.target_table,
        data.format,
        data.file_path ?? null,
        JSON.stringify(data.column_mapping),
        JSON.stringify(data.options),
        user.sub,
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar import" } },
        500,
      );
    }

    return c.json({ id: result.data.rows[0].id }, 201);
  },
);

dataTransferRoute.post(
  "/imports/:id/run",
  requirePermission("data_transfer:write"),
  async (c) => {
    const importId = c.req.param("id");
    const user = c.get("user");

    const importResult = await query(
      "SELECT * FROM public.data_imports WHERE id = $1 AND tenant_id = $2",
      [importId, user?.tenant_id ?? null],
    );

    if (!importResult.data?.rows[0]) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Import não encontrado" } },
        404,
      );
    }

    const imp = importResult.data.rows[0] as {
      id: string;
      name: string;
      target_table: string;
      format: string;
      column_mapping: Record<string, string>;
      options: Record<string, unknown>;
    };

    // Recebe dados do body
    const body = await c.req.json<{ data: unknown[] }>();
    const rows = Array.isArray(body.data) ? body.data : [];

    const startTime = Date.now();
    let successful = 0;
    let failed = 0;
    const skipped = 0;
    const errors: string[] = [];

    await query(
      "UPDATE public.data_imports SET status = 'processing', started_at = timezone('utc'::text, now()) WHERE id = $1",
      [importId],
    );

    const mapping = imp.column_mapping ?? {};
    const batchSize = 100;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      for (const row of batch) {
        try {
          const record = row as Record<string, unknown>;
          const mappedRecord: Record<string, unknown> = {};

          for (const [sourceCol, targetCol] of Object.entries(mapping)) {
            if (sourceCol in record) {
              mappedRecord[targetCol as keyof typeof mappedRecord] =
                record[sourceCol as keyof typeof record];
            }
          }

          // Se não há mapping, usa as chaves do registro diretamente
          const finalRecord =
            Object.keys(mappedRecord).length > 0 ? mappedRecord : record;
          const cols = Object.keys(finalRecord);
          const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(", ");
          const values = Object.values(finalRecord);

          await query(
            `INSERT INTO public.${imp.target_table} (${cols.join(", ")}) VALUES (${placeholders})`,
            values,
          );
          successful++;
        } catch (err) {
          failed++;
          errors.push(
            `Linha ${i + 1}: ${err instanceof Error ? err.message : "erro"}`,
          );
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const status =
      failed === 0 ? "completed" : successful > 0 ? "partial" : "failed";

    await query(
      `UPDATE public.data_imports SET
       status = $1, total_rows = $2, successful_rows = $3, failed_rows = $4,
       skipped_rows = $5, error_log = $6, error_summary = $7,
       completed_at = timezone('utc'::text, now()), duration_ms = $8
     WHERE id = $9`,
      [
        status,
        rows.length,
        successful,
        failed,
        skipped,
        errors.slice(0, 50).join("\n"),
        JSON.stringify({ total_errors: errors.length }),
        durationMs,
        importId,
      ],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'data.import', 'data_import', $2, $3, NULL, NULL)",
      [
        user.sub,
        importId,
        JSON.stringify({
          table: imp.target_table,
          total: rows.length,
          success: successful,
          failed,
        }),
      ],
    );

    return c.json({
      id: importId,
      status,
      total_rows: rows.length,
      successful_rows: successful,
      failed_rows: failed,
      duration_ms: durationMs,
      errors: errors.slice(0, 10),
    });
  },
);

dataTransferRoute.delete(
  "/imports/:id",
  requirePermission("data_transfer:write"),
  async (c) => {
    const importId = c.req.param("id");
    const user = c.get("user");

    await query(
      "DELETE FROM public.data_imports WHERE id = $1 AND tenant_id = $2",
      [importId, user?.tenant_id ?? null],
    );

    return c.json({ deleted: true });
  },
);

// ========== Stats ==========

dataTransferRoute.get(
  "/stats",
  requirePermission("data_transfer:read"),
  async (c) => {
    const user = c.get("user");

    const exportStats = await query(
      `SELECT
       COUNT(*) as total_exports,
       COUNT(*) FILTER (WHERE status = 'completed') as completed,
       COUNT(*) FILTER (WHERE status = 'failed') as failed,
       COUNT(*) FILTER (WHERE status = 'processing') as processing,
       SUM(row_count) as total_rows_exported,
       SUM(file_size_bytes) as total_size_bytes
     FROM public.data_exports WHERE tenant_id = $1`,
      [user?.tenant_id ?? null],
    );

    const importStats = await query(
      `SELECT
       COUNT(*) as total_imports,
       COUNT(*) FILTER (WHERE status = 'completed') as completed,
       COUNT(*) FILTER (WHERE status = 'failed') as failed,
       COUNT(*) FILTER (WHERE status = 'partial') as partial,
       COUNT(*) FILTER (WHERE status = 'processing') as processing,
       SUM(total_rows) as total_rows_imported,
       SUM(successful_rows) as successful_rows,
       SUM(failed_rows) as failed_rows
     FROM public.data_imports WHERE tenant_id = $1`,
      [user?.tenant_id ?? null],
    );

    const recentExports = await query(
      `SELECT id, name, source_table, format, status, row_count, file_size_bytes, duration_ms, created_at
     FROM public.data_exports WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [user?.tenant_id ?? null],
    );

    const recentImports = await query(
      `SELECT id, name, target_table, format, status, total_rows, successful_rows, failed_rows, duration_ms, created_at
     FROM public.data_imports WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [user?.tenant_id ?? null],
    );

    const templateCount = await query(
      "SELECT COUNT(*) as count FROM public.data_export_templates WHERE tenant_id = $1 AND is_active = true",
      [user?.tenant_id ?? null],
    );

    return c.json({
      exports: exportStats.data?.rows[0] ?? {
        total_exports: "0",
        completed: "0",
        failed: "0",
        processing: "0",
        total_rows_exported: "0",
        total_size_bytes: "0",
      },
      imports: importStats.data?.rows[0] ?? {
        total_imports: "0",
        completed: "0",
        failed: "0",
        partial: "0",
        processing: "0",
        total_rows_imported: "0",
        successful_rows: "0",
        failed_rows: "0",
      },
      templates_count: templateCount.data?.rows[0]?.count ?? "0",
      recent_exports: recentExports.data?.rows ?? [],
      recent_imports: recentImports.data?.rows ?? [],
    });
  },
);
