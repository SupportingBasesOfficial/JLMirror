// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createScriptSchema,
  updateScriptSchema,
  executeScriptSchema,
  type CreateScriptInput,
  type UpdateScriptInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import {
  parsePaginationParams,
  buildPaginatedResponse,
} from "../lib/pagination.js";
import "../types.js";

export const scriptsRoute = new Hono();

// GET /api/v1/scripts — lista scripts do tenant com paginação
scriptsRoute.get(
  "/",
  requirePermission("scripts:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const activeOnly = c.req.query("active") === "true";
    const pagination = parsePaginationParams({
      page: c.req.query("page"),
      limit: c.req.query("limit"),
      sort: c.req.query("sort"),
      order: c.req.query("order"),
    });

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (activeOnly) {
      conditions.push("is_active = true");
    }

    const whereClause = conditions.join(" AND ");

    try {
      // Paraleliza count + data
      const countParams = [...params];
      const dataParams = [...params, pagination.limit, pagination.offset];

      const [countResult, result] = await Promise.all([
        query<{ total: number }>(
          `SELECT COUNT(*)::int as total FROM public.scripts WHERE ${whereClause}`,
          countParams,
        ),
        query(
          `SELECT id, name, description, language, version, timeout_seconds, requires_approval,
                   max_concurrent_executions, allowed_hosts, tags, is_active, created_by, created_at, updated_at
           FROM public.scripts WHERE ${whereClause}
           ORDER BY ${pagination.sort} ${pagination.order.toUpperCase()}
           LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
          dataParams,
        ),
      ]);

      const total = countResult.data?.rows[0]?.total ?? 0;

      return c.json(
        buildPaginatedResponse(result.data?.rows ?? [], total, pagination),
      );
    } catch (error) {
      logger.error("Erro ao listar scripts", {
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

// GET /api/v1/scripts/:id — detalhe de um script
scriptsRoute.get(
  "/:id",
  requirePermission("scripts:read"),
  httpCache(15),
  async (c) => {
    const scriptId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza script + versions
      const [result, versionsResult] = await Promise.all([
        query(`SELECT * FROM public.scripts WHERE id = $1 AND tenant_id = $2`, [
          scriptId,
          tenantId,
        ]),
        query(
          "SELECT id, version, change_summary, changed_by, created_at FROM public.script_versions WHERE script_id = $1 ORDER BY version DESC",
          [scriptId],
        ),
      ]);

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Script não encontrado" } },
          404,
        );
      }

      return c.json({
        script: result.data.rows[0],
        versions: versionsResult.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar script", {
        scriptId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/scripts — cria novo script
scriptsRoute.post(
  "/",
  rateLimitWrite,
  requirePermission("scripts:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createScriptSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as CreateScriptInput;

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.scripts (tenant_id, name, description, language, content, timeout_seconds, requires_approval, max_concurrent_executions, allowed_hosts, tags, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
         RETURNING id`,
        [
          tenantId,
          data.name,
          data.description ?? null,
          data.language,
          data.content,
          data.timeout_seconds,
          data.requires_approval,
          data.max_concurrent_executions,
          data.allowed_hosts ?? null,
          data.tags ?? null,
          user?.sub ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar script" } },
          500,
        );
      }

      const scriptId = result.data.rows[0].id;

      // Registra versão inicial
      await query(
        "INSERT INTO public.script_versions (script_id, version, content, changed_by, change_summary) VALUES ($1, 1, $2, $3, 'Versão inicial')",
        [scriptId, data.content, user?.sub ?? null],
      );

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "script.create",
            entityType: "script",
            entityId: scriptId,
            newData: { name: data.name, language: data.language },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Script criado", { scriptId, name: data.name, tenantId });

      return c.json({ id: scriptId }, 201);
    } catch (error) {
      logger.error("Erro ao criar script", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar script" } },
        500,
      );
    }
  },
);

// PUT /api/v1/scripts/:id — atualiza script (cria nova versão se content mudou)
scriptsRoute.put(
  "/:id",
  rateLimitWrite,
  requirePermission("scripts:write"),
  async (c) => {
    const scriptId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateScriptSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as UpdateScriptInput;

    try {
      // Busca versão atual
      const currentResult = await query<{ version: number; content: string }>(
        "SELECT version, content FROM public.scripts WHERE id = $1 AND tenant_id = $2",
        [scriptId, tenantId],
      );

      if (currentResult.error || !currentResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Script não encontrado" } },
          404,
        );
      }

      const current = currentResult.data.rows[0];
      const newVersion =
        data.content && data.content !== current.content
          ? current.version + 1
          : current.version;

      // Atualiza script
      const updateFields: string[] = [];
      const updateParams: unknown[] = [];
      let paramIdx = 1;

      const fieldMap: Record<string, string> = {
        name: "name",
        description: "description",
        language: "language",
        content: "content",
        timeout_seconds: "timeout_seconds",
        requires_approval: "requires_approval",
        max_concurrent_executions: "max_concurrent_executions",
        allowed_hosts: "allowed_hosts",
        tags: "tags",
        is_active: "is_active",
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (data[key as keyof typeof data] !== undefined) {
          updateFields.push(`${dbField} = $${paramIdx++}`);
          updateParams.push(data[key as keyof typeof data]);
        }
      }

      updateFields.push(`version = $${paramIdx++}`);
      updateParams.push(newVersion);
      updateFields.push(`updated_by = $${paramIdx++}`);
      updateParams.push(user?.sub ?? null);

      updateParams.push(scriptId, tenantId);

      const updateResult = await query(
        `UPDATE public.scripts SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        updateParams,
      );

      if (updateResult.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Script não encontrado" } },
          404,
        );
      }

      // Se content mudou, registra nova versão
      if (data.content && data.content !== current.content) {
        await query(
          "INSERT INTO public.script_versions (script_id, version, content, changed_by, change_summary) VALUES ($1, $2, $3, $4, $5)",
          [
            scriptId,
            newVersion,
            data.content,
            user?.sub ?? null,
            data.description ?? "Atualização de conteúdo",
          ],
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "script.update",
            entityType: "script",
            entityId: scriptId,
            newData: { version: newVersion },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Script atualizado", {
        scriptId,
        version: newVersion,
        tenantId,
      });

      return c.json({ id: scriptId, version: newVersion });
    } catch (error) {
      logger.error("Erro ao atualizar script", {
        scriptId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "UPDATE_ERROR", message: "Erro ao atualizar script" },
        },
        500,
      );
    }
  },
);

// DELETE /api/v1/scripts/:id — desativa script (soft delete)
scriptsRoute.delete(
  "/:id",
  rateLimitWrite,
  requirePermission("scripts:write"),
  async (c) => {
    const scriptId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "UPDATE public.scripts SET is_active = false, updated_by = $3 WHERE id = $1 AND tenant_id = $2",
        [scriptId, tenantId, user?.sub ?? null],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Script não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "script.deactivate",
            entityType: "script",
            entityId: scriptId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Script desativado", { scriptId, tenantId });

      return c.json({ deactivated: true });
    } catch (error) {
      logger.error("Erro ao desativar script", {
        scriptId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "DELETE_ERROR", message: "Erro ao desativar script" },
        },
        500,
      );
    }
  },
);

// POST /api/v1/scripts/:id/execute — inicia execução (com approval se necessário)
scriptsRoute.post(
  "/:id/execute",
  rateLimitWrite,
  requirePermission("scripts:execute"),
  async (c) => {
    const scriptId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = executeScriptSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    try {
      const result = await query<{
        id: string;
        status: string;
        requires_approval: boolean;
      }>("SELECT * FROM public.create_script_execution($1, $2, $3, $4)", [
        scriptId,
        parsed.data.target_host ?? null,
        user?.sub ?? null,
        tenantId,
      ]);

      if (result.error) {
        return c.json(
          { error: { code: "EXECUTION_ERROR", message: result.error.message } },
          400,
        );
      }

      const execution = result.data?.rows[0];
      if (!execution) {
        return c.json(
          {
            error: {
              code: "EXECUTION_ERROR",
              message: "Erro ao criar execução",
            },
          },
          500,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "script.execute",
            entityType: "script",
            entityId: scriptId,
            newData: {
              execution_id: execution.id,
              target_host: parsed.data.target_host,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Script executado", {
        scriptId,
        executionId: execution.id,
        tenantId,
      });

      return c.json(
        {
          execution_id: execution.id,
          status: execution.status,
          requires_approval: execution.requires_approval,
          message: execution.requires_approval
            ? "Execução criada. Aguardando aprovação."
            : "Execução aprovada automaticamente. Pronta para execução.",
        },
        201,
      );
    } catch (error) {
      logger.error("Erro ao executar script", {
        scriptId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "EXECUTION_ERROR",
            message: "Erro ao executar script",
          },
        },
        500,
      );
    }
  },
);

// GET /api/v1/scripts/:id/executions — histórico de execuções de um script
scriptsRoute.get(
  "/:id/executions",
  requirePermission("scripts:read"),
  httpCache(15),
  async (c) => {
    const scriptId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);

    try {
      const result = await query(
        `SELECT id, script_id, version, status, target_host, initiated_by, approved_by, approved_at,
                started_at, completed_at, exit_code, duration_ms, created_at
         FROM public.script_executions
         WHERE script_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [scriptId, tenantId, limit, offset],
      );

      return c.json({
        executions: result.data?.rows ?? [],
        limit,
        offset,
      });
    } catch (error) {
      logger.error("Erro ao buscar execuções de script", {
        scriptId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);
