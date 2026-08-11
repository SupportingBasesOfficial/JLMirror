// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import { RefreshCw, ArrowLeft, Plus } from "lucide-react";
import { LoadingState } from "@/components/ui/state-display";
import { useApi } from "@/lib/use-api";

const COLORS = {
  bg: "var(--surface-0)",
  card: "var(--surface-2)",
  border: "var(--border-default)",
  text: "var(--text-primary)",
  muted: "var(--text-muted)",
  teal: "var(--brand-primary)",
  green: "var(--status-ok-text)",
  red: "var(--status-error-text)",
  amber: "var(--status-warning-text)",
  blue: "var(--status-info-text)",
  purple: "var(--status-info-text)",
};

const TASK_TYPES = [
  "http_request",
  "database_query",
  "script",
  "shell_command",
  "cleanup",
  "report",
  "custom",
];
const CRON_PRESETS = [
  { label: "A cada 5 min", value: "*/5 * * * *" },
  { label: "A cada 15 min", value: "*/15 * * * *" },
  { label: "A cada hora", value: "0 * * * *" },
  { label: "Diário (00:00)", value: "0 0 * * *" },
  { label: "Semanal (dom 00:00)", value: "0 0 * * 0" },
  { label: "Mensal (dia 1)", value: "0 0 1 * *" },
];

const STATUS_COLORS: Record<string, string> = {
  success: COLORS.green,
  failed: COLORS.red,
  running: COLORS.blue,
  timeout: COLORS.amber,
  skipped: COLORS.muted,
};

interface Task {
  id: string;
  name: string;
  description: string | null;
  task_type: string;
  cron_expression: string;
  config: Record<string, unknown>;
  is_active: boolean;
  timezone: string;
  max_execution_seconds: number;
  retry_on_failure: boolean;
  max_retries: number;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_duration_ms: number | null;
  next_run_at: string | null;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  last_error: string | null;
}

interface Run {
  id: string;
  status: string;
  attempt_number: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  output: string | null;
  error_message: string | null;
  triggered_by: string;
}

interface TaskStats {
  overview: {
    total_tasks: string;
    active_tasks: string;
    total_runs: string;
    successful_runs: string;
    failed_runs: string;
    currently_running: string;
    due_soon: string;
  };
  by_type: {
    task_type: string;
    count: string;
    total_runs: string;
    successful: string;
    failed: string;
  }[];
  recent_runs: {
    id: string;
    status: string;
    duration_ms: number | null;
    started_at: string;
    error_message: string | null;
    triggered_by: string;
    task_name: string;
    task_type: string;
  }[];
  upcoming: {
    id: string;
    name: string;
    task_type: string;
    cron_expression: string;
    next_run_at: string;
    last_run_status: string | null;
  }[];
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function ScheduledTasksPage() {
  const { data: tData, mutate: mutateTasks } = useApi<{ data: Task[] }>(
    "/api/v1/tasks",
  );
  const { data: stats, mutate: mutateStats } = useApi<TaskStats>(
    "/api/v1/tasks/stats",
  );
  const tasks = tData?.data ?? [];
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "tasks" | "runs">("tasks");
  const [showCreate, setShowCreate] = useState(false);
  const [showRuns, setShowRuns] = useState<string | null>(null);

  // Form
  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fType, setFType] = useState("http_request");
  const [fCron, setFCron] = useState("*/5 * * * *");
  const [fUrl, setFUrl] = useState("");
  const [fMethod, setFMethod] = useState("GET");
  const [fMaxExec, setFMaxExec] = useState(300);
  const [fMaxRetries, setFMaxRetries] = useState(3);

  async function handleCreate() {
    setError(null);
    try {
      const config: Record<string, unknown> = {};
      if (fType === "http_request") {
        config.url = fUrl;
        config.method = fMethod;
      }

      const res = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: fName,
          description: fDesc || undefined,
          task_type: fType,
          cron_expression: fCron,
          config,
          max_execution_seconds: fMaxExec,
          max_retries: fMaxRetries,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar tarefa");
        return;
      }
      setSuccess("Tarefa criada!");
      setShowCreate(false);
      setFName("");
      setFDesc("");
      setFUrl("");
      mutateTasks();
      mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleRun(id: string) {
    try {
      const res = await fetch(`/api/v1/tasks/${id}/run`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(
          `Execução: ${data.status} (${formatDuration(data.duration_ms)})${data.error ? ` — ${data.error}` : ""}`,
        );
        mutateTasks();
        mutateStats();
        if (showRuns === id) {
          fetchRuns(id);
        }
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
      setError(
        "Operação falhou: " +
          (err instanceof Error ? err.message : "erro desconhecido"),
      );
    }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      const res = await fetch(`/api/v1/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: !active }),
      });
      if (res.ok) {
        mutateTasks();
        mutateStats();
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
      setError(
        "Operação falhou: " +
          (err instanceof Error ? err.message : "erro desconhecido"),
      );
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/v1/tasks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateTasks();
        mutateStats();
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
      setError(
        "Operação falhou: " +
          (err instanceof Error ? err.message : "erro desconhecido"),
      );
    }
  }

  async function fetchRuns(taskId: string) {
    try {
      const res = await fetch(`/api/v1/tasks/${taskId}/runs?limit=20`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs ?? []);
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
      setError(
        "Operação falhou: " +
          (err instanceof Error ? err.message : "erro desconhecido"),
      );
    }
  }

  function handleShowRuns(taskId: string) {
    setShowRuns(taskId);
    setTab("runs");
    fetchRuns(taskId);
  }

  if (!tData && !stats) return <LoadingState label="Carregando tarefas..." />;

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{
        background: COLORS.bg,
        fontFamily: "'JetBrains Mono','Consolas',monospace",
        color: COLORS.text,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            Scheduled Tasks — Cron Jobs & Automação
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Cron Expressions · Execução Manual · Retries · Logs de Execução
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="text-[12px] px-3 py-1.5 rounded font-bold"
            style={{
              background: COLORS.teal,
              color: COLORS.bg,
              cursor: "pointer",
            }}
          >
            <Plus size={12} className="inline" /> Tarefa
          </button>
          <button
            onClick={() => {
              mutateTasks();
              mutateStats();
            }}
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.muted,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
          <a
            href="/dashboard"
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.muted,
            }}
          >
            <ArrowLeft size={12} className="inline" /> Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: `var(--status-error-bg)`,
            border: `1px solid var(--status-error-border)`,
            color: COLORS.red,
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: `var(--status-ok-bg)`,
            border: `1px solid var(--status-ok-border)`,
            color: COLORS.green,
          }}
        >
          {success}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Tarefas
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>
              {stats.overview.total_tasks}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.overview.active_tasks} ativas
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-ok-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Execuções
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.green }}>
              {stats.overview.total_runs}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.overview.successful_runs} sucesso
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-error-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Falhas
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.red }}>
              {stats.overview.failed_runs}
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-warning-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Próximas (1h)
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>
              {stats.overview.due_soon}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.overview.currently_running} rodando
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {(
          [
            { key: "tasks", label: `Tarefas (${tasks.length})` },
            { key: "overview", label: "Overview" },
            {
              key: "runs",
              label: showRuns ? "Execuções" : "Execuções Recentes",
            },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-t-md text-[12px] font-bold transition-colors"
            style={{
              background: tab === t.key ? COLORS.card : "transparent",
              border: `1px solid ${COLORS.border}`,
              borderBottom:
                tab === t.key ? "none" : `1px solid ${COLORS.border}`,
              color: tab === t.key ? COLORS.teal : COLORS.muted,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Tasks */}
      {tab === "tasks" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {tasks.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhuma tarefa agendada
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Nome
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Tipo
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Cron
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Status
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Última
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Duração
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Próxima
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Runs
                  </th>
                  <th
                    className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  ></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`,
                      opacity: t.is_active ? 1 : 0.4,
                    }}
                  >
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>
                      {t.name}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {t.task_type}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.blue }}>
                      {t.cron_expression}
                    </td>
                    <td className="px-3 py-2">
                      {t.last_run_status && (
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{
                            background: `${STATUS_COLORS[t.last_run_status] ?? COLORS.muted}15`,
                            color:
                              STATUS_COLORS[t.last_run_status] ?? COLORS.muted,
                          }}
                        >
                          {t.last_run_status}
                        </span>
                      )}
                      {!t.last_run_status && (
                        <span style={{ color: COLORS.muted }}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatTime(t.last_run_at)}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatDuration(t.last_run_duration_ms)}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.amber }}>
                      {formatTime(t.next_run_at)}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      <span style={{ color: COLORS.blue }}>{t.total_runs}</span>
                      <span className="text-[10px]">
                        {" "}
                        ({t.successful_runs}✓ / {t.failed_runs}✕)
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => handleRun(t.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{
                            background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`,
                            border: `1px solid var(--status-info-border)`,
                            color: COLORS.blue,
                            cursor: "pointer",
                          }}
                        >
                          Run
                        </button>
                        <button
                          onClick={() => handleShowRuns(t.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{
                            background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`,
                            border: `1px solid color-mix(in srgb, var(--status-info-text) 27%, transparent)`,
                            color: COLORS.purple,
                            cursor: "pointer",
                          }}
                        >
                          Logs
                        </button>
                        <button
                          onClick={() => handleToggle(t.id, t.is_active)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{
                            background: `color-mix(in srgb, var(--status-warning-text) 12%, transparent)`,
                            border: `1px solid var(--status-warning-border)`,
                            color: COLORS.amber,
                            cursor: "pointer",
                          }}
                        >
                          {t.is_active ? "Pause" : "Enable"}
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{
                            background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`,
                            border: `1px solid var(--status-error-border)`,
                            color: COLORS.red,
                            cursor: "pointer",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Overview */}
      {tab === "overview" && stats && (
        <div
          className="space-y-4 rounded-xl p-6"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          <div>
            <h3
              className="text-[12px] font-bold mb-3"
              style={{ color: COLORS.muted }}
            >
              TAREFAS POR TIPO
            </h3>
            <div className="space-y-2">
              {stats.by_type.map((row) => (
                <div
                  key={row.task_type}
                  className="flex items-center justify-between text-[12px] py-1"
                  style={{ borderBottom: `1px solid ${COLORS.border}` }}
                >
                  <span style={{ color: COLORS.teal }}>{row.task_type}</span>
                  <span style={{ color: COLORS.muted }}>
                    {row.count} tarefas
                  </span>
                  <span style={{ color: COLORS.blue }}>
                    {row.total_runs} runs
                  </span>
                  <span style={{ color: COLORS.green }}>{row.successful}✓</span>
                  <span style={{ color: COLORS.red }}>{row.failed}✕</span>
                </div>
              ))}
              {stats.by_type.length === 0 && (
                <div className="text-[12px]" style={{ color: COLORS.muted }}>
                  Sem dados
                </div>
              )}
            </div>
          </div>

          <div>
            <h3
              className="text-[12px] font-bold mb-3"
              style={{ color: COLORS.muted }}
            >
              PRÓXIMAS EXECUÇÕES
            </h3>
            <div className="space-y-1">
              {stats.upcoming.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between text-[12px] py-1"
                  style={{ borderBottom: `1px solid ${COLORS.border}` }}
                >
                  <span style={{ color: COLORS.teal }}>{u.name}</span>
                  <span style={{ color: COLORS.muted }}>{u.task_type}</span>
                  <span style={{ color: COLORS.blue }}>
                    {u.cron_expression}
                  </span>
                  <span style={{ color: COLORS.amber }}>
                    {formatTime(u.next_run_at)}
                  </span>
                </div>
              ))}
              {stats.upcoming.length === 0 && (
                <div className="text-[12px]" style={{ color: COLORS.muted }}>
                  Nenhuma execução agendada
                </div>
              )}
            </div>
          </div>

          <div>
            <h3
              className="text-[12px] font-bold mb-3"
              style={{ color: COLORS.muted }}
            >
              EXECUÇÕES RECENTES
            </h3>
            <div className="space-y-1">
              {stats.recent_runs.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between text-[12px] py-1"
                  style={{ borderBottom: `1px solid ${COLORS.border}` }}
                >
                  <span style={{ color: COLORS.teal }}>{r.task_name}</span>
                  <span style={{ color: COLORS.muted }}>{r.task_type}</span>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: `${STATUS_COLORS[r.status] ?? COLORS.muted}15`,
                      color: STATUS_COLORS[r.status] ?? COLORS.muted,
                    }}
                  >
                    {r.status}
                  </span>
                  <span style={{ color: COLORS.muted }}>
                    {formatDuration(r.duration_ms)}
                  </span>
                  <span style={{ color: COLORS.muted }}>{r.triggered_by}</span>
                  <span style={{ color: COLORS.muted }}>
                    {formatTime(r.started_at)}
                  </span>
                </div>
              ))}
              {stats.recent_runs.length === 0 && (
                <div className="text-[12px]" style={{ color: COLORS.muted }}>
                  Nenhuma execução
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Runs */}
      {tab === "runs" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {runs.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              {showRuns
                ? "Nenhuma execução para esta tarefa"
                : "Selecione uma tarefa e clique em 'Logs' para ver execuções"}
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Status
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Tentativa
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Início
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Fim
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Duração
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Trigger
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Erro
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <td className="px-3 py-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: `${STATUS_COLORS[r.status] ?? COLORS.muted}15`,
                          color: STATUS_COLORS[r.status] ?? COLORS.muted,
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      #{r.attempt_number}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatTime(r.started_at)}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatTime(r.finished_at)}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {formatDuration(r.duration_ms)}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {r.triggered_by}
                    </td>
                    <td
                      className="px-3 py-2 max-w-[200px] truncate"
                      style={{ color: COLORS.red }}
                    >
                      {r.error_message ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Create */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowCreate(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowCreate(false);
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
                Nova Tarefa Agendada
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="st-n"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome
                </label>
                <input
                  id="st-n"
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="Health Check API"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="st-d"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Descrição (opcional)
                </label>
                <input
                  id="st-d"
                  type="text"
                  value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="st-t"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Tipo
                  </label>
                  <select
                    id="st-t"
                    value={fType}
                    onChange={(e) => setFType(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {TASK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="st-c"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Cron Preset
                  </label>
                  <select
                    id="st-c"
                    onChange={(e) => setFCron(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    <option value="">Custom</option>
                    {CRON_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="st-cr"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Cron Expression
                </label>
                <input
                  id="st-cr"
                  type="text"
                  value={fCron}
                  onChange={(e) => setFCron(e.target.value)}
                  placeholder="*/5 * * * *"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              {fType === "http_request" && (
                <>
                  <div className="space-y-1">
                    <label
                      htmlFor="st-u"
                      className="text-[11px] font-bold uppercase"
                      style={{ color: COLORS.muted }}
                    >
                      URL
                    </label>
                    <input
                      id="st-u"
                      type="text"
                      value={fUrl}
                      onChange={(e) => setFUrl(e.target.value)}
                      placeholder="https://api.example.com/health"
                      className="w-full rounded-md px-3 py-2 text-[13px]"
                      style={{
                        background: COLORS.bg,
                        border: `1px solid ${COLORS.border}`,
                        color: COLORS.text,
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="st-m"
                      className="text-[11px] font-bold uppercase"
                      style={{ color: COLORS.muted }}
                    >
                      Método
                    </label>
                    <select
                      id="st-m"
                      value={fMethod}
                      onChange={(e) => setFMethod(e.target.value)}
                      className="w-full rounded-md px-3 py-2 text-[12px]"
                      style={{
                        background: COLORS.bg,
                        border: `1px solid ${COLORS.border}`,
                        color: COLORS.text,
                      }}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                    </select>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="st-me"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Max Exec (s)
                  </label>
                  <input
                    id="st-me"
                    type="number"
                    value={fMaxExec}
                    onChange={(e) =>
                      setFMaxExec(parseInt(e.target.value, 10) || 300)
                    }
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="st-mr"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Max Retries
                  </label>
                  <input
                    id="st-mr"
                    type="number"
                    value={fMaxRetries}
                    onChange={(e) =>
                      setFMaxRetries(parseInt(e.target.value, 10) || 3)
                    }
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  />
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={!fName || !fCron}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !fName || !fCron ? "not-allowed" : "pointer",
                }}
              >
                Criar Tarefa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
