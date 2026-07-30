import { query } from "@repo/db";
import { pushNotificationToTenant } from "../routes/ws.js";
import { registerRepeatableJob, startWorker } from "./queue.js";

// Worker que executa scheduled_tasks automaticamente baseado em next_run_at
// Usa BullMQ com fila durável Redis — sobrevive a restarts e múltiplas réplicas

interface DueTask {
  id: string;
  tenant_id: string;
  name: string;
  task_type: string;
  cron_expression: string;
  config: Record<string, unknown>;
  timezone: string;
  max_execution_seconds: number;
  retry_on_failure: boolean;
  max_retries: number;
  retry_delay_seconds: number;
}

const QUEUE_NAME = "task-scheduler";
const POLL_INTERVAL_MS = 30_000;
const MAX_CONCURRENT_TASKS = 5;
let activeTasks = 0;

export async function startTaskScheduler(): Promise<void> {
  // Registra repeatable job via Redlock — apenas uma instância registra
  await registerRepeatableJob(
    QUEUE_NAME,
    "poll-due-tasks",
    { every: POLL_INTERVAL_MS },
  );

  // Inicia worker que processa jobs da fila
  startWorker(QUEUE_NAME, async () => {
    if (activeTasks >= MAX_CONCURRENT_TASKS) return;
    try {
      await pollAndExecuteDueTasks();
    } catch (err) {
      console.error("[scheduler] Erro no poll:", err instanceof Error ? err.message : String(err));
    }
  });
}

export function stopTaskScheduler(): void {
  // Workers e filas são fechados centralmente por stopAllQueues no lifecycle
  console.warn("[scheduler] Task scheduler parado");
}

async function pollAndExecuteDueTasks(): Promise<void> {
  // Busca tasks ativas com next_run_at <= NOW() e sem execucao em andamento
  const result = await query<DueTask>(
    `UPDATE public.scheduled_tasks
     SET next_run_at = NULL
     WHERE id IN (
       SELECT id FROM public.scheduled_tasks
       WHERE is_active = true
         AND next_run_at IS NOT NULL
         AND next_run_at <= timezone('utc'::text, now())
       ORDER BY next_run_at ASC
       LIMIT $1
     )
     RETURNING id, tenant_id, name, task_type, cron_expression, config, timezone,
       max_execution_seconds, retry_on_failure, max_retries, retry_delay_seconds`,
    [MAX_CONCURRENT_TASKS - activeTasks],
  );

  if (result.error || !result.data?.rows.length) {
    return;
  }

  const dueTasks = result.data.rows;

  for (const task of dueTasks) {
    activeTasks++;
    executeTaskAsync(task).finally(() => {
      activeTasks--;
    });
  }
}

async function executeTaskAsync(task: DueTask): Promise<void> {
  const startTime = Date.now();
  let status: "success" | "failed" | "timeout" = "success";
  let output = "";
  let errorMsg: string | null = null;
  const timeoutMs = task.max_execution_seconds * 1000;

  // Cria registro de execucao
  const runResult = await query<{ id: string }>(
    `INSERT INTO public.scheduled_task_runs
      (task_id, tenant_id, status, attempt_number, triggered_by, started_at)
     VALUES ($1, $2, 'running', 1, 'cron', timezone('utc'::text, now()))
     RETURNING id`,
    [task.id, task.tenant_id],
  );
  const runId = runResult.data?.rows[0]?.id;
  if (!runId) return;

  try {
    const config = task.config;

    if (task.task_type === "http_request") {
      const url = config.url as string;
      const method = (config.method as string) ?? "GET";
      if (url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, { method, signal: controller.signal });
          output = `HTTP ${res.status}: ${(await res.text()).substring(0, 5000)}`;
          if (!res.ok) {
            status = "failed";
            errorMsg = `HTTP ${res.status}`;
          }
        } catch (err) {
          status = err instanceof Error && err.name === "AbortError" ? "timeout" : "failed";
          errorMsg = err instanceof Error ? err.message : "Fetch error";
        } finally {
          clearTimeout(timer);
        }
      }
    } else if (task.task_type === "database_query") {
      const sql = config.query as string;
      if (sql) {
        const dbResult = await query(sql, []);
        output = JSON.stringify(dbResult.data?.rows ?? []).substring(0, 5000);
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
        errorMsg = "script_id nao informado na config da tarefa";
      } else {
        const scriptResult = await query<{ content: string; language: string; timeout_seconds: number }>(
          "SELECT content, language, timeout_seconds FROM public.scripts WHERE id = $1 AND is_active = true",
          [scriptId],
        );
        const script = scriptResult.data?.rows[0];
        if (!script) {
          status = "failed";
          errorMsg = "Script nao encontrado ou inativo";
        } else {
          const { exec } = await import("node:child_process");
          const lang = script.language;
          const cmd = lang === "python" ? "python3" : lang === "powershell" ? "powershell" : lang === "bash" ? "bash" : lang === "node" ? "node" : null;
          if (!cmd) {
            status = "failed";
            errorMsg = `Linguagem nao suportada: ${lang}`;
          } else {
            output = await new Promise<string>((resolve) => {
              const proc = exec(cmd, { timeout: timeoutMs }, (err, stdout, stderr) => {
                if (err) {
                  if (err.killed) status = "timeout";
                  else status = "failed";
                  errorMsg = err.message;
                  resolve(stderr || err.message);
                } else {
                  resolve(stdout || stderr || "Script executado sem output");
                }
              });
              proc.stdin?.end(script.content);
            });
          }
        }
      }
    } else if (task.task_type === "shell_command" || task.task_type === "custom") {
      const command = config.command as string;
      if (!command) {
        status = "failed";
        errorMsg = "command nao informado na config da tarefa";
      } else {
        const { exec } = await import("node:child_process");
        output = await new Promise<string>((resolve) => {
          exec(command, { timeout: timeoutMs }, (err, stdout, stderr) => {
            if (err) {
              if (err.killed) status = "timeout";
              else status = "failed";
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
        errorMsg = "template_id nao informado na config da tarefa";
      } else {
        const { generateCSV, collectReportData } = await import("./report-generator.js");
        const templateResult = await query<{ name: string; data_sources: string[]; columns: string[]; format: string }>(
          "SELECT name, data_sources, columns, format FROM public.report_templates WHERE id = $1",
          [templateId],
        );
        const template = templateResult.data?.rows[0];
        if (!template) {
          status = "failed";
          errorMsg = "Template de relatorio nao encontrado";
        } else {
          const reportData = await collectReportData(
            task.tenant_id,
            template.data_sources ?? [],
            template.columns ?? [],
            template.name,
            query,
          );
          const csv = generateCSV(reportData);
          output = `Relatorio gerado: ${reportData.rows.length} linhas, ${csv.length} bytes`;
        }
      }
    } else {
      output = `Task type ${task.task_type} executada sem acao especifica`;
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
       output = $3, error_message = $4
     WHERE id = $5`,
    [status, durationMs, output.substring(0, 10000), errorMsg, runId],
  );

  // Atualiza stats da tarefa e calcula proxima execucao
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
     nextRunResult.data?.rows[0]?.next_run ?? null, task.id],
  );

  console.warn(`[scheduler] Task ${task.name} (${task.id}): ${status} em ${durationMs}ms`);

  // Notifica via WebSocket se a task falhou
  if (status !== "success") {
    void pushNotificationToTenant(task.tenant_id, {
      event: "task.failed",
      task_id: task.id,
      task_name: task.name,
      status,
      error: errorMsg,
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
    });
  }
}
