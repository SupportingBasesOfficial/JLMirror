// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { z } from "zod";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const workflowRoute = new Hono();

// GET /api/v1/workflows/overview — overview do modulo
workflowRoute.get(
  "/overview",
  requirePermission("workflows:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const workflowsResult = await query(
        "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.workflows WHERE tenant_id = $1",
        [tenantId],
      );

      return c.json({
        overview: {
          workflows: workflowsResult.data?.rows[0] ?? {
            total: "0",
            active: "0",
          },
        },
        endpoints: [
          "",
          "/:id",
          "/:id/execute",
          "/:id/clone",
          "/devices/list",
          "/executions/:id",
          "/executions/:id/cancel",
        ],
      });
    } catch (error) {
      logger.error("Erro no overview workflows", {
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

const stepTypeSchema = z.enum([
  "script",
  "command",
  "ssh_command",
  "http_request",
  "condition",
  "approval",
  "delay",
  "notification",
]);
const languageSchema = z.enum(["bash", "powershell", "python", "javascript"]);
const onFailureSchema = z.enum(["stop", "continue", "retry"]);
const categorySchema = z.enum([
  "general",
  "remediation",
  "diagnostic",
  "maintenance",
  "deployment",
  "security",
  "backup",
  "custom",
]);

const createStepSchema = z.object({
  step_order: z.number().int().min(0).default(0),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  step_type: stepTypeSchema,
  content: z.string().min(1),
  language: languageSchema.default("bash"),
  condition_expression: z.string().max(1000).optional(),
  on_failure: onFailureSchema.default("stop"),
  retry_count: z.number().int().min(0).max(10).default(0),
  retry_delay_seconds: z.number().int().min(0).max(3600).default(5),
  timeout_seconds: z.number().int().min(0).max(86400).default(300),
  output_variables: z.array(z.string()).default([]),
  requires_approval: z.boolean().default(false),
});

const createWorkflowSchema = z.object({
  device_id: z.string().uuid().optional(),
  device_hostname: z.string().min(1).max(255),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  category: categorySchema.default("general"),
  tags: z.array(z.string()).default([]),
  is_template: z.boolean().default(false),
  steps: z.array(createStepSchema).default([]),
});

const cloneWorkflowSchema = z.object({
  device_hostname: z.string().min(1).max(255),
  device_id: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
});

const executeWorkflowSchema = z.object({
  reason: z.string().max(500).optional(),
});

const rejectStepSchema = z.object({
  reason: z.string().max(1000).optional(),
});

// GET /api/v1/workflows — lista workflows (com filtros via query)
workflowRoute.get(
  "/",
  requirePermission("assets:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const hostname = c.req.query("device_hostname");
    const category = c.req.query("category");
    const templateOnly = c.req.query("template") === "true";
    const activeOnly = c.req.query("active") === "true";

    const conditions: string[] = ["w.tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (hostname) {
      conditions.push(`w.device_hostname = $${paramIdx++}`);
      params.push(hostname);
    }
    if (category) {
      conditions.push(`w.category = $${paramIdx++}`);
      params.push(category);
    }
    if (templateOnly) {
      conditions.push("w.is_template = true");
    }
    if (activeOnly) {
      conditions.push("w.is_active = true");
    }

    try {
      const result = await query(
        `SELECT w.*,
         (SELECT COUNT(*) FROM public.workflow_steps ws WHERE ws.workflow_id = w.id) as step_count,
         (SELECT COUNT(*) FROM public.workflow_executions we WHERE we.workflow_id = w.id AND we.status = 'running') as running_executions,
         (SELECT COUNT(*) FROM public.workflow_executions we WHERE we.workflow_id = w.id AND we.status = 'completed') as completed_executions,
         (SELECT COUNT(*) FROM public.workflow_executions we WHERE we.workflow_id = w.id AND we.status = 'failed') as failed_executions
       FROM public.workflows w
       WHERE ${conditions.join(" AND ")}
       ORDER BY w.updated_at DESC`,
        params,
      );

      return c.json({ workflows: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar workflows", {
        tenantId: user?.tenant_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/workflows/:id — detalhe de um workflow com steps
workflowRoute.get("/:id", requirePermission("assets:read"), async (c) => {
  const workflowId = c.req.param("id");
  const user = c.get("user");

  try {
    const wfResult = await query(
      "SELECT * FROM public.workflows WHERE id = $1 AND tenant_id = $2",
      [workflowId, user?.tenant_id ?? null],
    );

    if (!wfResult.data?.rows[0]) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Workflow não encontrado" } },
        404,
      );
    }

    const stepsResult = await query(
      "SELECT * FROM public.workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC",
      [workflowId],
    );

    return c.json({
      workflow: wfResult.data.rows[0],
      steps: stepsResult.data?.rows ?? [],
    });
  } catch (error) {
    logger.error("Erro ao buscar workflow", {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// POST /api/v1/workflows — cria workflow com steps
workflowRoute.post(
  "/",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const user = c.get("user");
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createWorkflowSchema.safeParse(parsedBody.data);
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

    const data = parsed.data;

    try {
      const wfResult = await query<{ id: string }>(
        `INSERT INTO public.workflows (tenant_id, device_id, device_hostname, name, description, category, tags, is_template, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          user?.tenant_id ?? null,
          data.device_id ?? null,
          data.device_hostname,
          data.name,
          data.description ?? null,
          data.category,
          data.tags,
          data.is_template,
          user?.sub ?? null,
        ],
      );

      if (wfResult.error || !wfResult.data?.rows[0]) {
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao criar workflow" },
          },
          500,
        );
      }

      const workflowId = wfResult.data.rows[0].id;

      // Insere steps
      for (const step of data.steps) {
        await query(
          `INSERT INTO public.workflow_steps
           (workflow_id, tenant_id, step_order, name, description, step_type, content, language,
            condition_expression, on_failure, retry_count, retry_delay_seconds, timeout_seconds,
            output_variables, requires_approval)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            workflowId,
            user?.tenant_id ?? null,
            step.step_order,
            step.name,
            step.description ?? null,
            step.step_type,
            step.content,
            step.language,
            step.condition_expression ?? null,
            step.on_failure,
            step.retry_count,
            step.retry_delay_seconds,
            step.timeout_seconds,
            step.output_variables,
            step.requires_approval,
          ],
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId: user?.tenant_id ?? null,
            action: "workflow.create",
            entityType: "workflows",
            newData: {
              id: workflowId,
              name: data.name,
              device: data.device_hostname,
              steps: data.steps.length,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Workflow criado", {
        workflowId,
        name: data.name,
        stepsCount: data.steps.length,
      });

      return c.json({ id: workflowId }, 201);
    } catch (error) {
      logger.error("Erro ao criar workflow", {
        name: data.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar workflow" } },
        500,
      );
    }
  },
);

// PUT /api/v1/workflows/:id — atualiza workflow (substitui steps)
workflowRoute.put(
  "/:id",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const workflowId = c.req.param("id");
    const user = c.get("user");
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createWorkflowSchema.partial().safeParse(parsedBody.data);
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

    const data = parsed.data;

    try {
      // Atualiza workflow
      const updateFields: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      const fieldMap: Record<string, string> = {
        name: "name",
        description: "description",
        category: "category",
        tags: "tags",
        is_template: "is_template",
        is_active: "is_active",
        device_hostname: "device_hostname",
        device_id: "device_id",
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (data[key as keyof typeof data] !== undefined) {
          updateFields.push(`${dbField} = $${paramIdx++}`);
          params.push(data[key as keyof typeof data]);
        }
      }

      if (updateFields.length > 0) {
        // Incrementa versão
        updateFields.push(`version = version + 1`);
        params.push(workflowId, user?.tenant_id ?? null);
        const result = await query(
          `UPDATE public.workflows SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++} RETURNING id`,
          params,
        );
        if (result.error || !result.data?.rows[0]) {
          return c.json(
            {
              error: { code: "NOT_FOUND", message: "Workflow não encontrado" },
            },
            404,
          );
        }
      }

      // Se veio steps, substitui todos
      if (data.steps !== undefined) {
        await query(
          "DELETE FROM public.workflow_steps WHERE workflow_id = $1",
          [workflowId],
        );
        for (const step of data.steps) {
          await query(
            `INSERT INTO public.workflow_steps
             (workflow_id, tenant_id, step_order, name, description, step_type, content, language,
              condition_expression, on_failure, retry_count, retry_delay_seconds, timeout_seconds,
              output_variables, requires_approval)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [
              workflowId,
              user?.tenant_id ?? null,
              step.step_order,
              step.name,
              step.description ?? null,
              step.step_type,
              step.content,
              step.language,
              step.condition_expression ?? null,
              step.on_failure,
              step.retry_count,
              step.retry_delay_seconds,
              step.timeout_seconds,
              step.output_variables,
              step.requires_approval,
            ],
          );
        }
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId: user?.tenant_id ?? null,
            action: "workflow.update",
            entityType: "workflows",
            entityId: workflowId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Workflow atualizado", { workflowId });

      return c.json({ id: workflowId, updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar workflow", {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "UPDATE_ERROR",
            message: "Erro ao atualizar workflow",
          },
        },
        500,
      );
    }
  },
);

// DELETE /api/v1/workflows/:id — remove workflow
workflowRoute.delete(
  "/:id",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const workflowId = c.req.param("id");
    const user = c.get("user");

    try {
      const result = await query(
        "DELETE FROM public.workflows WHERE id = $1 AND tenant_id = $2 RETURNING id",
        [workflowId, user?.tenant_id ?? null],
      );
      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Workflow não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId: user?.tenant_id ?? null,
            action: "workflow.delete",
            entityType: "workflows",
            entityId: workflowId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Workflow deletado", { workflowId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao deletar workflow", {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "DELETE_ERROR", message: "Erro ao excluir workflow" },
        },
        500,
      );
    }
  },
);

// POST /api/v1/workflows/:id/clone — clona um workflow template para outro servidor
workflowRoute.post(
  "/:id/clone",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const workflowId = c.req.param("id");
    const user = c.get("user");
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = cloneWorkflowSchema.safeParse(parsedBody.data);
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

    const body = parsed.data;

    try {
      // Busca workflow original
      const wfResult = await query(
        "SELECT * FROM public.workflows WHERE id = $1 AND tenant_id = $2",
        [workflowId, user?.tenant_id ?? null],
      );

      if (!wfResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Workflow não encontrado" } },
          404,
        );
      }

      const original = wfResult.data.rows[0];

      // Cria cópia
      const cloneResult = await query<{ id: string }>(
        `INSERT INTO public.workflows (tenant_id, device_id, device_hostname, name, description, category, tags, is_template, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8) RETURNING id`,
        [
          user?.tenant_id ?? null,
          body.device_id ?? null,
          body.device_hostname,
          body.name ?? `${original.name} (cópia)`,
          original.description,
          original.category,
          original.tags,
          user?.sub ?? null,
        ],
      );

      const cloneId = cloneResult.data?.rows[0]?.id;
      if (!cloneId) {
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao clonar workflow" },
          },
          500,
        );
      }

      // Copia steps
      const stepsResult = await query(
        "SELECT * FROM public.workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC",
        [workflowId],
      );

      for (const step of stepsResult.data?.rows ?? []) {
        await query(
          `INSERT INTO public.workflow_steps
           (workflow_id, tenant_id, step_order, name, description, step_type, content, language,
            condition_expression, on_failure, retry_count, retry_delay_seconds, timeout_seconds,
            output_variables, requires_approval)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            cloneId,
            user?.tenant_id ?? null,
            step.step_order,
            step.name,
            step.description,
            step.step_type,
            step.content,
            step.language,
            step.condition_expression,
            step.on_failure,
            step.retry_count,
            step.retry_delay_seconds,
            step.timeout_seconds,
            step.output_variables,
            step.requires_approval,
          ],
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId: user?.tenant_id ?? null,
            action: "workflow.clone",
            entityType: "workflows",
            newData: {
              source: workflowId,
              clone: cloneId,
              device: body.device_hostname,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Workflow clonado", {
        sourceId: workflowId,
        cloneId,
        device: body.device_hostname,
      });

      return c.json({ id: cloneId }, 201);
    } catch (error) {
      logger.error("Erro ao clonar workflow", {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CLONE_ERROR", message: "Erro ao clonar workflow" } },
        500,
      );
    }
  },
);

// POST /api/v1/workflows/:id/execute — dispara execução de workflow
workflowRoute.post(
  "/:id/execute",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const workflowId = c.req.param("id");
    const user = c.get("user");
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = executeWorkflowSchema.safeParse(parsedBody.data ?? {});
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
          },
        },
        400,
      );
    }

    const body = parsed.data;

    try {
      // Busca workflow
      const wfResult = await query<{
        name: string;
        is_active: boolean;
      }>(
        "SELECT name, is_active FROM public.workflows WHERE id = $1 AND tenant_id = $2",
        [workflowId, user?.tenant_id ?? null],
      );

      if (!wfResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Workflow não encontrado" } },
          404,
        );
      }

      if (!wfResult.data.rows[0].is_active) {
        return c.json(
          { error: { code: "INACTIVE", message: "Workflow inativo" } },
          400,
        );
      }

      // Conta steps
      const stepsCountResult = await query<{ count: string }>(
        "SELECT COUNT(*) as count FROM public.workflow_steps WHERE workflow_id = $1",
        [workflowId],
      );

      const totalSteps =
        Number.parseInt(stepsCountResult.data?.rows[0]?.count ?? "0", 10) || 0;
      if (totalSteps === 0) {
        return c.json(
          { error: { code: "NO_STEPS", message: "Workflow não possui steps" } },
          400,
        );
      }

      // Cria execução
      const execResult = await query<{ id: string }>(
        `INSERT INTO public.workflow_executions
         (workflow_id, tenant_id, triggered_by, triggered_by_name, status, current_step, total_steps,
          started_at, trigger_reason, triggered_from_ip)
       VALUES ($1, $2, $3, $4, 'running', 0, $5, timezone('utc'::text, now()), $6, $7) RETURNING id`,
        [
          workflowId,
          user?.tenant_id ?? null,
          user?.sub ?? null,
          user?.sub ?? null,
          totalSteps,
          body.reason ?? "Execução manual",
          c.req.header("x-forwarded-for") ?? null,
        ],
      );

      const executionId = execResult.data?.rows[0]?.id;
      if (!executionId) {
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao criar execução" },
          },
          500,
        );
      }

      // Cria step_executions para cada step
      const stepsResult = await query(
        "SELECT * FROM public.workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC",
        [workflowId],
      );

      for (const step of stepsResult.data?.rows ?? []) {
        await query(
          `INSERT INTO public.workflow_step_executions
           (execution_id, step_id, tenant_id, step_order, step_name, step_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
          [
            executionId,
            step.id,
            user?.tenant_id ?? null,
            step.step_order,
            step.name,
            step.step_type,
          ],
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId: user?.tenant_id ?? null,
            action: "workflow.execute",
            entityType: "workflow_executions",
            newData: {
              execution_id: executionId,
              workflow_id: workflowId,
              reason: body.reason,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      // Notifica via WebSocket que execução começou
      void pushExecutionUpdate(user?.tenant_id ?? null, {
        type: "workflow",
        event: "workflow.execution_started",
        title: `Workflow executado: ${wfResult.data.rows[0].name}`,
        message: body.reason ?? "Execução manual",
        severity: "info",
        timestamp: new Date().toISOString(),
      });

      logger.info("Workflow executado", {
        workflowId,
        executionId,
        totalSteps,
      });

      return c.json({ execution_id: executionId, status: "running" }, 201);
    } catch (error) {
      logger.error("Erro ao executar workflow", {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "EXECUTE_ERROR",
            message: "Erro ao executar workflow",
          },
        },
        500,
      );
    }
  },
);

// GET /api/v1/workflows/:id/executions — histórico de execuções
workflowRoute.get(
  "/:id/executions",
  requirePermission("assets:read"),
  httpCache(15),
  async (c) => {
    const workflowId = c.req.param("id");
    const user = c.get("user");
    const limit = Math.min(
      Number.parseInt(c.req.query("limit") ?? "20", 10) || 20,
      100,
    );

    try {
      const result = await query(
        `SELECT * FROM public.workflow_executions
       WHERE workflow_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT $3`,
        [workflowId, user?.tenant_id ?? null, limit],
      );

      return c.json({ executions: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar execuções", {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/workflows/executions/:executionId — detalhe de execução com step results
workflowRoute.get(
  "/executions/:executionId",
  requirePermission("assets:read"),
  async (c) => {
    const executionId = c.req.param("executionId");
    const user = c.get("user");

    try {
      const execResult = await query(
        "SELECT * FROM public.workflow_executions WHERE id = $1 AND tenant_id = $2",
        [executionId, user?.tenant_id ?? null],
      );

      if (!execResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Execução não encontrada" } },
          404,
        );
      }

      const stepExecsResult = await query(
        "SELECT * FROM public.workflow_step_executions WHERE execution_id = $1 ORDER BY step_order ASC",
        [executionId],
      );

      return c.json({
        execution: execResult.data.rows[0],
        step_executions: stepExecsResult.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar execução", {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/workflows/executions/:executionId/cancel — cancela execução em andamento
workflowRoute.post(
  "/executions/:executionId/cancel",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const executionId = c.req.param("executionId");
    const user = c.get("user");

    try {
      const result = await query(
        "UPDATE public.workflow_executions SET status = 'cancelled', completed_at = timezone('utc'::text, now()) WHERE id = $1 AND tenant_id = $2 AND status IN ('running', 'pending', 'awaiting_approval') RETURNING workflow_id",
        [executionId, user?.tenant_id ?? null],
      );

      if (!result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Execução não encontrada ou já finalizada",
            },
          },
          404,
        );
      }

      // Marca steps pendentes como skipped
      await query(
        "UPDATE public.workflow_step_executions SET status = 'skipped' WHERE execution_id = $1 AND status IN ('pending', 'running', 'awaiting_approval')",
        [executionId],
      );

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId: user?.tenant_id ?? null,
            action: "workflow.cancel",
            entityType: "workflow_executions",
            entityId: executionId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Execução cancelada", { executionId });

      return c.json({ cancelled: true });
    } catch (error) {
      logger.error("Erro ao cancelar execução", {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "CANCEL_ERROR", message: "Erro ao cancelar execução" },
        },
        500,
      );
    }
  },
);

// POST /api/v1/workflows/executions/:executionId/steps/:stepId/approve — aprova um step que requer approval
workflowRoute.post(
  "/executions/:executionId/steps/:stepId/approve",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const executionId = c.req.param("executionId");
    const stepId = c.req.param("stepId");
    const user = c.get("user");

    try {
      const result = await query(
        `UPDATE public.workflow_step_executions
       SET status = 'approved', approved_by = $1, approved_at = timezone('utc'::text, now())
       WHERE execution_id = $2 AND step_id = $3 AND tenant_id = $4 AND status = 'awaiting_approval'
       RETURNING step_name`,
        [user?.sub ?? null, executionId, stepId, user?.tenant_id ?? null],
      );

      if (!result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Step não encontrado ou não aguarda aprovação",
            },
          },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId: user?.tenant_id ?? null,
            action: "workflow.step.approve",
            entityType: "workflow_step_executions",
            entityId: stepId,
            newData: {
              execution_id: executionId,
              step_name: result.data.rows[0].step_name,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Step aprovado", { executionId, stepId });

      return c.json({ approved: true });
    } catch (error) {
      logger.error("Erro ao aprovar step", {
        executionId,
        stepId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "APPROVE_ERROR", message: "Erro ao aprovar step" } },
        500,
      );
    }
  },
);

// POST /api/v1/workflows/executions/:executionId/steps/:stepId/reject — rejeita um step
workflowRoute.post(
  "/executions/:executionId/steps/:stepId/reject",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const executionId = c.req.param("executionId");
    const stepId = c.req.param("stepId");
    const user = c.get("user");
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = rejectStepSchema.safeParse(parsedBody.data ?? {});
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
          },
        },
        400,
      );
    }

    const body = parsed.data;

    try {
      const result = await query(
        `UPDATE public.workflow_step_executions
       SET status = 'rejected', approved_by = $1, approved_at = timezone('utc'::text, now()), error_message = $2
       WHERE execution_id = $3 AND step_id = $4 AND tenant_id = $5 AND status = 'awaiting_approval'
       RETURNING step_name`,
        [
          user?.sub ?? null,
          body.reason ?? "Rejeitado",
          executionId,
          stepId,
          user?.tenant_id ?? null,
        ],
      );

      if (!result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Step não encontrado ou não aguarda aprovação",
            },
          },
          404,
        );
      }

      // Marca execução como failed
      await query(
        "UPDATE public.workflow_executions SET status = 'failed', completed_at = timezone('utc'::text, now()), error_message = $1 WHERE id = $2",
        [`Step rejeitado: ${result.data.rows[0].step_name}`, executionId],
      );

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId: user?.tenant_id ?? null,
            action: "workflow.step.reject",
            entityType: "workflow_step_executions",
            entityId: stepId,
            newData: {
              execution_id: executionId,
              step_name: result.data.rows[0].step_name,
              reason: body.reason,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Step rejeitado", {
        executionId,
        stepId,
        reason: body.reason,
      });

      return c.json({ rejected: true });
    } catch (error) {
      logger.error("Erro ao rejeitar step", {
        executionId,
        stepId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "REJECT_ERROR", message: "Erro ao rejeitar step" } },
        500,
      );
    }
  },
);

// GET /api/v1/workflows/devices/list — lista dispositivos disponíveis para criar workflows
workflowRoute.get(
  "/devices/list",
  requirePermission("assets:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");

    try {
      // Busca devices do tenant
      const result = await query(
        `SELECT DISTINCT d.id, d.hostname, d.ip, d.status
       FROM public.devices d
       WHERE d.tenant_id = $1
       ORDER BY d.hostname ASC`,
        [user?.tenant_id ?? null],
      );

      return c.json({ devices: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar devices para workflows", {
        tenantId: user?.tenant_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// Helper para push WebSocket
async function pushExecutionUpdate(
  tenantId: string | null,
  payload: {
    type: string;
    event: string;
    title: string;
    message: string;
    severity: string;
    timestamp: string;
  },
): Promise<void> {
  if (!tenantId) return;
  try {
    const { pushNotificationToTenant } = await import("../routes/ws.js");
    void pushNotificationToTenant(tenantId, payload);
  } catch {
    // Silencioso
  }
}
