// @ai-context: .zero-error/architecture-map.md#logic-core
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import {
  createScheduledTaskSchema,
  updateScheduledTaskSchema,
  type CreateScheduledTaskInput,
  type UpdateScheduledTaskInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import { parsePaginationParams, buildPaginatedResponse } from "../lib/pagination.js";
import "../types.js";

export const taskRoute = new Hono();

// ========== List ==========

taskRoute.get("/", jwtAuth, tenantContext, requirePermission("tasks:read"), async (c) => {
  const user = c.get("user");
  const activeOnly = c.req.query("active") === "true";
  const taskType = c.req.query("type");
  const pagination = parsePaginationParams({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
    sort: c.req.query("sort"),
    order: c.req.query("order"),
  });

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  let paramIdx = 2;

  if (activeOnly) { conditions.push("is_active = true"); }
  if (taskType) { conditions.push(`task_type = $${paramIdx++}`); params.push(taskType); }

  const whereClause = conditions.join(" AND ");

  const countResult = await query(`SELECT COUNT(*)::int as total FROM public.scheduled_tasks WHERE ${whereClause}`, params);
  const total = countResult.data?.rows[0]?.total ?? 0;

  params.push(pagination.limit, pagination.offset);
  const result = await query(
    `SELECT id, name, description, task_type, cron_expression, config, is_active, timezone,
       max_execution_seconds, retry_on_failure, max_retries, retry_delay_seconds,
       notify_on_failure, notify_emails, last_run_at, last_run_status, last_run_duration_ms,
       next_run_at, total_runs, successful_runs, failed_runs, last_error, created_at, updated_at
     FROM public.scheduled_tasks WHERE ${whereClause}
     ORDER BY ${pagination.sort} ${pagination.order.toUpperCase()}
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    params,
  );

  return c.json(buildPaginatedResponse(result.data?.rows ?? [], total, pagination));
});

// ========== Create ==========

taskRoute.post("/", jwtAuth, tenantContext, requirePermission("tasks:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateScheduledTaskInput>();
  const parsed = createScheduledTaskSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;

  // Calcula proxima execucao
  const nextRunResult = await query<{ next_run: string }>(
    "SELECT public.calculate_next_run($1, $2) as next_run",
    [data.cron_expression, data.timezone],
  );
  const nextRun = nextRunResult.data?.rows[0]?.next_run ?? null;

  const result = await query<{ id: string }>(
    `INSERT INTO public.scheduled_tasks (tenant_id, name, description, task_type, cron_expression, config,
       is_active, timezone, max_execution_seconds, retry_on_failure, max_retries, retry_delay_seconds,
       notify_on_failure, notify_emails, next_run_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
    [
      user?.tenant_id ?? null, data.name, data.description ?? null,
      data.task_type, data.cron_expression, JSON.stringify(data.config),
      data.is_active, data.timezone, data.max_execution_seconds,
      data.retry_on_failure, data.max_retries, data.retry_delay_seconds,
      data.notify_on_failure, JSON.stringify(data.notify_emails), nextRun, user.sub,
    ],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao criar tarefa" } }, 500);
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'task.create', 'scheduled_task', $2, $3, NULL, NULL)",
    [user.sub, result.data.rows[0].id, JSON.stringify({ name: data.name, task_type: data.task_type, cron: data.cron_expression })],
  );

  return c.json({ id: result.data.rows[0].id, next_run_at: nextRun }, 201);
});

// ========== Update ==========

taskRoute.put("/:id", jwtAuth, tenantContext, requirePermission("tasks:write"), async (c) => {
  const taskId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<UpdateScheduledTaskInput>();
  const parsed = updateScheduledTaskSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    name: "name", description: "description", task_type: "task_type",
    cron_expression: "cron_expression", is_active: "is_active", timezone: "timezone",
    max_execution_seconds: "max_execution_seconds", retry_on_failure: "retry_on_failure",
    max_retries: "max_retries", retry_delay_seconds: "retry_delay_seconds",
    notify_on_failure: "notify_on_failure",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key as keyof typeof data] !== undefined) {
      updateFields.push(`${dbField} = $${paramIdx++}`);
      params.push(data[key as keyof typeof data]);
    }
  }

  if (data.config !== undefined) {
    updateFields.push(`config = $${paramIdx++}`);
    params.push(JSON.stringify(data.config));
  }

  if (data.notify_emails !== undefined) {
    updateFields.push(`notify_emails = $${paramIdx++}`);
    params.push(JSON.stringify(data.notify_emails));
  }

  // Recalcula next_run se cron_expression mudou
  if (data.cron_expression !== undefined) {
    const tz = data.timezone ?? "America/Sao_Paulo";
    const nextRunResult = await query<{ next_run: string }>(
      "SELECT public.calculate_next_run($1, $2) as next_run",
      [data.cron_expression, tz],
    );
    const nextRun = nextRunResult.data?.rows[0]?.next_run ?? null;
    updateFields.push(`next_run_at = $${paramIdx++}`);
    params.push(nextRun);
  }

  if (updateFields.length === 0) {
    return c.json({ id: taskId });
  }

  params.push(taskId, user?.tenant_id ?? null);

  await query(
    `UPDATE public.scheduled_tasks SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
    params,
  );

  return c.json({ id: taskId });
});

// ========== Delete ==========

taskRoute.delete("/:id", jwtAuth, tenantContext, requirePermission("tasks:write"), async (c) => {
  const taskId = c.req.param("id");
  const user = c.get("user");

  await query(
    "DELETE FROM public.scheduled_tasks WHERE id = $1 AND tenant_id = $2",
    [taskId, user?.tenant_id ?? null],
  );

  return c.json({ deleted: true });
});

// ========== Run Manually ==========

taskRoute.post("/:id/run", jwtAuth, tenantContext, requirePermission("tasks:write"), async (c) => {
  const taskId = c.req.param("id");
  const user = c.get("user");

  const taskResult = await query(
    "SELECT * FROM public.scheduled_tasks WHERE id = $1 AND tenant_id = $2",
    [taskId, user?.tenant_id ?? null],
  );

  if (taskResult.error || !taskResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Tarefa não encontrada" } }, 404);
  }

  const task = taskResult.data.rows[0] as {
    id: string; name: string; task_type: string; config: Record<string, unknown>;
    max_execution_seconds: number; cron_expression: string; timezone: string;
  };

  // Cria registro de execucao
  const runResult = await query<{ id: string }>(
    `INSERT INTO public.scheduled_task_runs (tenant_id, task_id, status, triggered_by, triggered_by_user)
     VALUES ($1, $2, 'running', 'manual', $3) RETURNING id`,
    [user?.tenant_id ?? null, taskId, user.sub],
  );

  const runId = runResult.data?.rows[0]?.id;
  const startTime = Date.now();
  let status = "success";
  let output = "";
  let errorMsg: string | null = null;
  let statusCode: number | null = null;

  try {
    const config = task.config;
    const timeoutMs = task.max_execution_seconds * 1000;

    if (task.task_type === "http_request") {
      const url = config.url as string;
      const method = (config.method as string) ?? "GET";
      const headers = (config.headers as Record<string, string>) ?? {};
      const body = config.body ? JSON.stringify(config.body) : undefined;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      clearTimeout(timeout);

      statusCode = res.status;
      output = await res.text();

      if (res.status >= 400) {
        status = "failed";
        errorMsg = `HTTP ${res.status}`;
      }
    } else if (task.task_type === "database_query") {
      const sql = config.query as string;
      if (sql) {
        const dbResult = await query(sql, []);
        output = JSON.stringify(dbResult.data?.rows ?? []);
        if (dbResult.error) {
          status = "failed";
          errorMsg = dbResult.error.message;
        }
      }
    } else if (task.task_type === "cleanup") {
      const target = config.target as string;
      if (target === "old_metrics") {
        const cleanupResult = await query("SELECT public.cleanup_old_metric_snapshots()", []);
        output = `Cleanup: ${cleanupResult.data?.rows[0]?.cleanup_old_metric_snapshots ?? 0} registros removidos`;
      } else if (target === "reset_api_key_counters") {
        const resetResult = await query("SELECT public.reset_api_key_counters()", []);
        output = `API key counters reset: ${resetResult.data?.rows[0]?.reset_api_key_counters ?? 0}`;
      } else {
        output = `Cleanup target: ${target ?? "unknown"}`;
      }
    } else if (task.task_type === "script") {
      const scriptId = config.script_id as string;
      if (!scriptId) {
        status = "failed";
        errorMsg = "script_id não informado na config da tarefa";
      } else {
        const scriptResult = await query<{ id: string; content: string; language: string; timeout_seconds: number }>(
          "SELECT id, content, language, timeout_seconds FROM public.scripts WHERE id = $1 AND is_active = true",
          [scriptId],
        );
        const script = scriptResult.data?.rows[0];
        if (!script) {
          status = "failed";
          errorMsg = "Script não encontrado ou inativo";
        } else {
          const { exec } = await import("node:child_process");
          const lang = script.language;
          const cmd = lang === "python" ? "python3" : lang === "powershell" ? "powershell" : lang === "bash" ? "bash" : lang === "node" ? "node" : null;
          if (!cmd) {
            status = "failed";
            errorMsg = `Linguagem não suportada: ${lang}`;
          } else {
            output = await new Promise<string>((resolve) => {
              const proc = exec(cmd, { timeout: timeoutMs }, (err, stdout, stderr) => {
                if (err) {
                  resolve(`ERROR: ${err.message}\n${stderr}`);
                } else {
                  resolve(stdout || stderr || "Script executado sem output");
                }
              });
              proc.stdin?.end(script.content);
            });
          }
        }
      }
    } else if (task.task_type === "shell_command") {
      const command = config.command as string;
      if (!command) {
        status = "failed";
        errorMsg = "command não informado na config da tarefa";
      } else {
        const { exec } = await import("node:child_process");
        output = await new Promise<string>((resolve) => {
          exec(command, { timeout: timeoutMs }, (err, stdout, stderr) => {
            if (err) {
              status = "failed";
              errorMsg = err.message;
              resolve(stderr || err.message);
            } else {
              resolve(stdout || stderr || "Comando executado sem output");
            }
          });
        });
      }
    } else if (task.task_type === "report") {
      const templateId = config.template_id as string;
      if (!templateId) {
        status = "failed";
        errorMsg = "template_id não informado na config da tarefa";
      } else {
        const { generateCSV, collectReportData } = await import("../lib/report-generator.js");
        const templateResult = await query<{ name: string; data_sources: string[]; columns: string[]; format: string }>(
          "SELECT name, data_sources, columns, format FROM public.report_templates WHERE id = $1",
          [templateId],
        );
        const template = templateResult.data?.rows[0];
        if (!template) {
          status = "failed";
          errorMsg = "Template de relatório não encontrado";
        } else {
          const reportData = await collectReportData(
            user?.tenant_id ?? "",
            template.data_sources ?? [],
            template.columns ?? [],
            template.name,
            query,
          );
          const csv = generateCSV(reportData);
          output = `Relatório gerado: ${reportData.rows.length} linhas, ${csv.length} bytes`;
        }
      }
    } else if (task.task_type === "custom") {
      const command = config.command as string;
      if (command) {
        const { exec } = await import("node:child_process");
        output = await new Promise<string>((resolve) => {
          exec(command, { timeout: timeoutMs }, (err, stdout, stderr) => {
            if (err) {
              status = "failed";
              errorMsg = err.message;
              resolve(stderr || err.message);
            } else {
              resolve(stdout || stderr || "Comando custom executado");
            }
          });
        });
      } else {
        output = `Task type '${task.task_type}' executada sem ação específica`;
      }
    } else {
      output = `Task type ${task.task_type} não implementado`;
    }
  } catch (err) {
    status = "failed";
    errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
  }

  const durationMs = Date.now() - startTime;

  // Atualiza registro de execucao
  await query(
    `UPDATE public.scheduled_task_runs SET
       status = $1, finished_at = timezone('utc'::text, now()), duration_ms = $2,
       output = $3, error_message = $4, response_status_code = $5
     WHERE id = $6`,
    [status, durationMs, output.substring(0, 10000), errorMsg, statusCode, runId],
  );

  // Atualiza stats da tarefa
  const nextRunResult = await query<{ next_run: string }>(
    "SELECT public.calculate_next_run($1, $2) as next_run",
    [task.cron_expression, task.timezone],
  );

  await query(
    `UPDATE public.scheduled_tasks SET
       last_run_at = timezone('utc'::text, now()),
       last_run_status = $1,
       last_run_duration_ms = $2,
       last_error = $3,
       total_runs = total_runs + 1,
       successful_runs = successful_runs + $4,
       failed_runs = failed_runs + $5,
       next_run_at = $6
     WHERE id = $7`,
    [status, durationMs, errorMsg, status === "success" ? 1 : 0, status === "success" ? 0 : 1,
     nextRunResult.data?.rows[0]?.next_run ?? null, taskId],
  );

  return c.json({
    run_id: runId,
    status,
    duration_ms: durationMs,
    output: output.substring(0, 2000),
    error: errorMsg,
    response_status_code: statusCode,
  });
});

// ========== Runs (History) ==========

taskRoute.get("/:id/runs", jwtAuth, tenantContext, requirePermission("tasks:read"), async (c) => {
  const taskId = c.req.param("id");
  const user = c.get("user");
  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

  const conditions: string[] = ["task_id = $1", "tenant_id = $2"];
  const params: unknown[] = [taskId, user?.tenant_id ?? null];
  let paramIdx = 3;

  if (status) { conditions.push(`status = $${paramIdx++}`); params.push(status); }
  params.push(limit);

  const result = await query(
    `SELECT * FROM public.scheduled_task_runs WHERE ${conditions.join(" AND ")}
     ORDER BY started_at DESC LIMIT $${paramIdx++}`,
    params,
  );

  return c.json({ runs: result.data?.rows ?? [] });
});

// ========== Stats ==========

taskRoute.get("/stats/overview", jwtAuth, tenantContext, requirePermission("tasks:read"), async (c) => {
  const user = c.get("user");

  const overviewResult = await query(
    `SELECT
       COUNT(*) as total_tasks,
       COUNT(*) FILTER (WHERE is_active = true) as active_tasks,
       SUM(total_runs) as total_runs,
       SUM(successful_runs) as successful_runs,
       SUM(failed_runs) as failed_runs,
       COUNT(*) FILTER (WHERE last_run_status = 'running') as currently_running,
       COUNT(*) FILTER (WHERE is_active = true AND next_run_at IS NOT NULL AND next_run_at <= timezone('utc'::text, now()) + INTERVAL '1 hour') as due_soon
     FROM public.scheduled_tasks WHERE tenant_id = $1`,
    [user?.tenant_id ?? null],
  );

  const byType = await query(
    `SELECT task_type, COUNT(*) as count, SUM(total_runs) as total_runs,
       SUM(successful_runs) as successful, SUM(failed_runs) as failed
     FROM public.scheduled_tasks WHERE tenant_id = $1
     GROUP BY task_type ORDER BY count DESC`,
    [user?.tenant_id ?? null],
  );

  const recentRuns = await query(
    `SELECT r.id, r.status, r.duration_ms, r.started_at, r.finished_at, r.error_message,
       r.triggered_by, t.name as task_name, t.task_type
     FROM public.scheduled_task_runs r
     JOIN public.scheduled_tasks t ON r.task_id = t.id
     WHERE r.tenant_id = $1
     ORDER BY r.started_at DESC LIMIT 10`,
    [user?.tenant_id ?? null],
  );

  const upcomingTasks = await query(
    `SELECT id, name, task_type, cron_expression, next_run_at, last_run_status
     FROM public.scheduled_tasks
     WHERE tenant_id = $1 AND is_active = true AND next_run_at IS NOT NULL
     ORDER BY next_run_at ASC LIMIT 5`,
    [user?.tenant_id ?? null],
  );

  return c.json({
    overview: overviewResult.data?.rows[0] ?? { total_tasks: "0", active_tasks: "0", total_runs: "0", successful_runs: "0", failed_runs: "0", currently_running: "0", due_soon: "0" },
    by_type: byType.data?.rows ?? [],
    recent_runs: recentRuns.data?.rows ?? [],
    upcoming: upcomingTasks.data?.rows ?? [],
  });
});
