// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { z } from "zod";
import { requirePermission } from "../middleware/require-permission.js";
import { httpCache } from "../middleware/http-cache.js";
import "../types.js";

export const workflowRoute = new Hono();

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

// GET /api/v1/workflows — lista workflows
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
  },
);

// GET /api/v1/workflows/:id — detalhe de um workflow com steps
workflowRoute.get("/:id", requirePermission("assets:read"), async (c) => {
  const workflowId = c.req.param("id");
  const user = c.get("user");

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
});

// POST /api/v1/workflows — cria workflow com steps
workflowRoute.post("/", requirePermission("assets:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = createWorkflowSchema.safeParse(body);
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

  const data = parsed.data;

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
      user.sub,
    ],
  );

  if (wfResult.error || !wfResult.data?.rows[0]) {
    return c.json(
      { error: { code: "CREATE_ERROR", message: "Erro ao criar workflow" } },
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

  await query(
    "SELECT public.write_audit_log($1, NULL, 'workflow.create', 'workflows', NULL, $2, NULL, NULL)",
    [
      user.sub,
      JSON.stringify({
        id: workflowId,
        name: data.name,
        device: data.device_hostname,
        steps: data.steps.length,
      }),
    ],
  );

  return c.json({ id: workflowId }, 201);
});

// PUT /api/v1/workflows/:id — atualiza workflow (substitui steps)
workflowRoute.put("/:id", requirePermission("assets:write"), async (c) => {
  const workflowId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = createWorkflowSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
      400,
    );
  }

  const data = parsed.data;

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
    await query(
      `UPDATE public.workflows SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
      params,
    );
  }

  // Se veio steps, substitui todos
  if (data.steps !== undefined) {
    await query("DELETE FROM public.workflow_steps WHERE workflow_id = $1", [
      workflowId,
    ]);
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

  await query(
    "SELECT public.write_audit_log($1, NULL, 'workflow.update', 'workflows', $2, NULL, NULL, NULL)",
    [user.sub, workflowId],
  );

  return c.json({ id: workflowId, updated: true });
});

// DELETE /api/v1/workflows/:id — remove workflow
workflowRoute.delete("/:id", requirePermission("assets:write"), async (c) => {
  const workflowId = c.req.param("id");
  const user = c.get("user");

  await query("DELETE FROM public.workflows WHERE id = $1 AND tenant_id = $2", [
    workflowId,
    user?.tenant_id ?? null,
  ]);

  await query(
    "SELECT public.write_audit_log($1, NULL, 'workflow.delete', 'workflows', $2, NULL, NULL, NULL)",
    [user.sub, workflowId],
  );

  return c.json({ deleted: true });
});

// POST /api/v1/workflows/:id/clone — clona um workflow template para outro servidor
workflowRoute.post(
  "/:id/clone",
  requirePermission("assets:write"),
  async (c) => {
    const workflowId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json<{
      device_hostname: string;
      device_id?: string;
      name?: string;
    }>();

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
        user.sub,
      ],
    );

    const cloneId = cloneResult.data?.rows[0]?.id;
    if (!cloneId) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao clonar workflow" } },
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

    await query(
      "SELECT public.write_audit_log($1, NULL, 'workflow.clone', 'workflows', NULL, $2, NULL, NULL)",
      [
        user.sub,
        JSON.stringify({
          source: workflowId,
          clone: cloneId,
          device: body.device_hostname,
        }),
      ],
    );

    return c.json({ id: cloneId }, 201);
  },
);

// POST /api/v1/workflows/:id/execute — dispara execução de workflow
workflowRoute.post(
  "/:id/execute",
  requirePermission("assets:write"),
  async (c) => {
    const workflowId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req
      .json<{ reason?: string }>()
      .catch(() => ({ reason: undefined }));

    // Busca workflow
    const wfResult = await query<{ name: string; is_active: boolean }>(
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

    const totalSteps = parseInt(
      stepsCountResult.data?.rows[0]?.count ?? "0",
      10,
    );
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
        user.sub,
        user.sub,
        totalSteps,
        body.reason ?? "Execução manual",
        c.req.header("x-forwarded-for") ?? null,
      ],
    );

    const executionId = execResult.data?.rows[0]?.id;
    if (!executionId) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar execução" } },
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

    await query(
      "SELECT public.write_audit_log($1, NULL, 'workflow.execute', 'workflow_executions', NULL, $2, NULL, NULL)",
      [
        user.sub,
        JSON.stringify({
          execution_id: executionId,
          workflow_id: workflowId,
          reason: body.reason,
        }),
      ],
    );

    // Notifica via WebSocket que execução começou
    void pushExecutionUpdate(user?.tenant_id ?? null, {
      type: "workflow",
      event: "workflow.execution_started",
      title: `Workflow executado: ${wfResult.data.rows[0].name}`,
      message: body.reason ?? "Execução manual",
      severity: "info",
      timestamp: new Date().toISOString(),
    });

    return c.json({ execution_id: executionId, status: "running" }, 201);
  },
);

// GET /api/v1/workflows/:id/executions — histórico de execuções
workflowRoute.get(
  "/:id/executions",
  requirePermission("assets:read"),
  async (c) => {
    const workflowId = c.req.param("id");
    const user = c.get("user");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);

    const result = await query(
      `SELECT * FROM public.workflow_executions
     WHERE workflow_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC LIMIT $3`,
      [workflowId, user?.tenant_id ?? null, limit],
    );

    return c.json({ executions: result.data?.rows ?? [] });
  },
);

// GET /api/v1/workflows/executions/:executionId — detalhe de execução com step results
workflowRoute.get(
  "/executions/:executionId",
  requirePermission("assets:read"),
  async (c) => {
    const executionId = c.req.param("executionId");
    const user = c.get("user");

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
  },
);

// POST /api/v1/workflows/executions/:executionId/cancel — cancela execução em andamento
workflowRoute.post(
  "/executions/:executionId/cancel",
  requirePermission("assets:write"),
  async (c) => {
    const executionId = c.req.param("executionId");
    const user = c.get("user");

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

    await query(
      "SELECT public.write_audit_log($1, NULL, 'workflow.cancel', 'workflow_executions', $2, NULL, NULL, NULL)",
      [user.sub, executionId],
    );

    return c.json({ cancelled: true });
  },
);

// POST /api/v1/workflows/executions/:executionId/steps/:stepId/approve — aprova um step que requer approval
workflowRoute.post(
  "/executions/:executionId/steps/:stepId/approve",
  requirePermission("assets:write"),
  async (c) => {
    const executionId = c.req.param("executionId");
    const stepId = c.req.param("stepId");
    const user = c.get("user");

    const result = await query(
      `UPDATE public.workflow_step_executions
     SET status = 'approved', approved_by = $1, approved_at = timezone('utc'::text, now())
     WHERE execution_id = $2 AND step_id = $3 AND tenant_id = $4 AND status = 'awaiting_approval'
     RETURNING step_name`,
      [user.sub, executionId, stepId, user?.tenant_id ?? null],
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

    await query(
      "SELECT public.write_audit_log($1, NULL, 'workflow.step.approve', 'workflow_step_executions', $2, $3, NULL, NULL)",
      [
        user.sub,
        stepId,
        JSON.stringify({
          execution_id: executionId,
          step_name: result.data.rows[0].step_name,
        }),
      ],
    );

    return c.json({ approved: true });
  },
);

// POST /api/v1/workflows/executions/:executionId/steps/:stepId/reject — rejeita um step
workflowRoute.post(
  "/executions/:executionId/steps/:stepId/reject",
  requirePermission("assets:write"),
  async (c) => {
    const executionId = c.req.param("executionId");
    const stepId = c.req.param("stepId");
    const user = c.get("user");
    const body = await c.req
      .json<{ reason?: string }>()
      .catch(() => ({ reason: undefined }));

    const result = await query(
      `UPDATE public.workflow_step_executions
     SET status = 'rejected', approved_by = $1, approved_at = timezone('utc'::text, now()), error_message = $2
     WHERE execution_id = $3 AND step_id = $4 AND tenant_id = $5 AND status = 'awaiting_approval'
     RETURNING step_name`,
      [
        user.sub,
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

    return c.json({ rejected: true });
  },
);

// GET /api/v1/workflows/devices/list — lista dispositivos disponíveis para criar workflows
workflowRoute.get(
  "/devices/list",
  requirePermission("assets:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");

    // Busca devices do tenant
    const result = await query(
      `SELECT DISTINCT d.id, d.hostname, d.ip, d.status
     FROM public.devices d
     WHERE d.tenant_id = $1
     ORDER BY d.hostname ASC`,
      [user?.tenant_id ?? null],
    );

    return c.json({ devices: result.data?.rows ?? [] });
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
