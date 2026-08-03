// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import {
  approveExecutionSchema,
  type ApproveExecutionInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import {
  parsePaginationParams,
  buildPaginatedResponse,
} from "../lib/pagination.js";
import "../types.js";

export const executionsRoute = new Hono();

// GET /api/v1/executions — lista execuções com filtros e paginação
executionsRoute.get("/", requirePermission("scripts:read"), async (c) => {
  const user = c.get("user");
  const status = c.req.query("status");
  const scriptId = c.req.query("script_id");
  const pagination = parsePaginationParams({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
    sort: c.req.query("sort"),
    order: c.req.query("order"),
  });

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  let paramIdx = 2;

  if (status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(status);
  }
  if (scriptId) {
    conditions.push(`script_id = $${paramIdx++}`);
    params.push(scriptId);
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*)::int as total FROM public.script_executions WHERE ${whereClause}`,
    params,
  );
  const total = countResult.data?.rows[0]?.total ?? 0;

  params.push(pagination.limit, pagination.offset);
  const result = await query(
    `SELECT id, script_id, version, status, target_host, initiated_by, approved_by, approved_at,
            started_at, completed_at, exit_code, duration_ms, trace_id, created_at
     FROM public.script_executions
     WHERE ${whereClause}
     ORDER BY ${pagination.sort} ${pagination.order.toUpperCase()}
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    params,
  );

  return c.json(
    buildPaginatedResponse(result.data?.rows ?? [], total, pagination),
  );
});

// GET /api/v1/executions/pending — execuções pendentes de aprovação (deve vir antes de /:id)
executionsRoute.get(
  "/pending",
  requirePermission("scripts:approve"),
  async (c) => {
    const user = c.get("user");

    const result = await query(
      `SELECT e.id, e.script_id, e.version, e.status, e.target_host, e.initiated_by, e.created_at,
            s.name as script_name, s.language as script_language, s.requires_approval
     FROM public.script_executions e
     JOIN public.scripts s ON s.id = e.script_id
     WHERE e.tenant_id = $1 AND e.status = 'pending'
     ORDER BY e.created_at ASC`,
      [user?.tenant_id ?? null],
    );

    return c.json({
      pending: result.data?.rows ?? [],
    });
  },
);

// GET /api/v1/executions/:id — detalhe de uma execução (com stdout/stderr)
executionsRoute.get("/:id", requirePermission("scripts:read"), async (c) => {
  const executionId = c.req.param("id");
  const user = c.get("user");

  const result = await query(
    `SELECT * FROM public.script_executions WHERE id = $1 AND tenant_id = $2`,
    [executionId, user?.tenant_id ?? null],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Execução não encontrada" } },
      404,
    );
  }

  // Busca aprovações
  const approvalsResult = await query(
    "SELECT * FROM public.execution_approvals WHERE execution_id = $1 ORDER BY created_at DESC",
    [executionId],
  );

  return c.json({
    execution: result.data.rows[0],
    approvals: approvalsResult.data?.rows ?? [],
  });
});

// POST /api/v1/executions/:id/approve — aprova ou rejeita execução
executionsRoute.post(
  "/:id/approve",
  requirePermission("scripts:approve"),
  async (c) => {
    const executionId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json<ApproveExecutionInput>();
    const parsed = approveExecutionSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const result = await query<{ id: string; status: string }>(
      "SELECT * FROM public.approve_execution($1, $2, $3, $4)",
      [
        executionId,
        user.sub,
        parsed.data.decision,
        parsed.data.comment ?? null,
      ],
    );

    if (result.error) {
      return c.json(
        { error: { code: "APPROVAL_ERROR", message: result.error.message } },
        400,
      );
    }

    // Auditoria
    await query(
      "SELECT public.write_audit_log($1, NULL, 'script.approve', 'execution', $2, $3, NULL, NULL)",
      [
        user.sub,
        executionId,
        JSON.stringify({
          decision: parsed.data.decision,
          comment: parsed.data.comment,
        }),
      ],
    );

    return c.json({
      execution_id: result.data?.rows[0]?.id,
      status: result.data?.rows[0]?.status,
    });
  },
);

// POST /api/v1/executions/:id/run — executa um script aprovado
executionsRoute.post(
  "/:id/run",
  requirePermission("scripts:execute"),
  async (c) => {
    const executionId = c.req.param("id");
    const user = c.get("user");

    // Busca a execução com dados do script
    const execResult = await query<{
      id: string;
      status: string;
      script_id: string;
      target_host: string;
      tenant_id: string;
    }>(
      `SELECT e.id, e.status, e.script_id, e.target_host, e.tenant_id
     FROM public.script_executions e
     WHERE e.id = $1 AND e.tenant_id = $2`,
      [executionId, user?.tenant_id ?? null],
    );

    if (execResult.error || !execResult.data?.rows[0]) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Execução não encontrada" } },
        404,
      );
    }

    const execution = execResult.data.rows[0];
    if (execution.status !== "approved") {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: `Execução precisa estar aprovada (atual: ${execution.status})`,
          },
        },
        400,
      );
    }

    // Busca o script
    const scriptResult = await query<{
      content: string;
      language: string;
      timeout_seconds: number;
    }>(
      "SELECT content, language, timeout_seconds FROM public.scripts WHERE id = $1",
      [execution.script_id],
    );

    if (!scriptResult.data?.rows[0]) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Script não encontrado" } },
        404,
      );
    }

    const script = scriptResult.data.rows[0];
    const startTime = Date.now();

    // Marca como running
    await query(
      "UPDATE public.script_executions SET status = 'running', started_at = timezone('utc'::text, now()) WHERE id = $1",
      [executionId],
    );

    let exitCode = 0;
    let stdout = "";
    let stderr = "";
    let status = "completed";

    try {
      const { exec } = await import("node:child_process");
      const lang = script.language;
      const cmd =
        lang === "python"
          ? "python3"
          : lang === "powershell"
            ? "powershell"
            : lang === "bash"
              ? "bash"
              : lang === "node"
                ? "node"
                : null;

      if (!cmd) {
        throw new Error(`Linguagem não suportada: ${lang}`);
      }

      const result = await new Promise<{
        code: number;
        stdout: string;
        stderr: string;
      }>((resolve) => {
        const proc = exec(
          cmd,
          { timeout: script.timeout_seconds * 1000 },
          (err, out, errOut) => {
            const code = err
              ? typeof err.code === "number"
                ? err.code
                : 1
              : 0;
            resolve({
              code,
              stdout: out,
              stderr: errOut,
            });
          },
        );
        proc.stdin?.end(script.content);
      });

      exitCode = result.code;
      stdout = result.stdout;
      stderr = result.stderr;
      if (exitCode !== 0) status = "failed";
    } catch (err) {
      status = "failed";
      exitCode = 1;
      stderr = err instanceof Error ? err.message : "Erro desconhecido";
    }

    const durationMs = Date.now() - startTime;

    // Atualiza execução com resultados
    await query(
      `UPDATE public.script_executions SET
       status = $1, completed_at = timezone('utc'::text, now()),
       exit_code = $2, duration_ms = $3,
       stdout = $4, stderr = $5
     WHERE id = $6`,
      [
        status,
        exitCode,
        durationMs,
        stdout.substring(0, 50000),
        stderr.substring(0, 50000),
        executionId,
      ],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'script.run', 'execution', $2, $3, NULL, NULL)",
      [
        user.sub,
        executionId,
        JSON.stringify({
          status,
          exit_code: exitCode,
          duration_ms: durationMs,
        }),
      ],
    );

    return c.json({
      execution_id: executionId,
      status,
      exit_code: exitCode,
      duration_ms: durationMs,
      stdout: stdout.substring(0, 5000),
      stderr: stderr.substring(0, 5000),
    });
  },
);

// POST /api/v1/executions/:id/cancel — cancela execução pendente
executionsRoute.post(
  "/:id/cancel",
  requirePermission("scripts:execute"),
  async (c) => {
    const executionId = c.req.param("id");
    const user = c.get("user");

    const result = await query<{ status: string }>(
      "SELECT status FROM public.script_executions WHERE id = $1 AND tenant_id = $2",
      [executionId, user?.tenant_id ?? null],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Execução não encontrada" } },
        404,
      );
    }

    const status = result.data.rows[0].status;
    if (status !== "pending" && status !== "approved") {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: `Não é possível cancelar execução com status: ${status}`,
          },
        },
        400,
      );
    }

    await query(
      "UPDATE public.script_executions SET status = 'cancelled', completed_at = timezone('utc'::text, now()) WHERE id = $1",
      [executionId],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'script.cancel', 'execution', $2, NULL, NULL, NULL)",
      [user.sub, executionId],
    );

    return c.json({ cancelled: true });
  },
);
