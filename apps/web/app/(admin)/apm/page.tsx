"use client";

import { useState } from "react";
import { RefreshCw, ArrowLeft } from "lucide-react";
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

interface ApmOverview {
  window: string;
  traces: {
    total_traces: string;
    total_spans: string;
    error_spans: string;
    avg_duration_ms: string;
    p95_duration_ms: string;
    p99_duration_ms: string;
  } | null;
  top_services: { service: string; span_count: string; error_count: string; avg_duration_ms: string }[];
  slow_operations: { operation_name: string; service: string; avg_duration_ms: string; max_duration_ms: string; count: string }[];
  recent_errors: { trace_id: string; operation_name: string; service: string; status_message: string; start_time: string; duration_ms: number }[];
  throughput: { minute: string; count: string }[];
  tasks: { active_tasks: string; due_soon: string; failed_today: string; running: string } | null;
  timestamp: string;
}

function formatDuration(ms: string | number): string {
  const n = typeof ms === "string" ? parseFloat(ms) : ms;
  if (isNaN(n) || n === 0) return "—";
  if (n < 1) return "<1ms";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

export default function ApmDashboardPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { data, error, isLoading, progress, mutate } = useApi<ApmOverview>("/api/apm/overview", {
    refreshInterval: autoRefresh ? 5000 : 0,
  });

  const maxThroughput = data?.throughput?.length
    ? Math.max(...data.throughput.map((t) => parseInt(t.count, 10)))
    : 0;

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>APM — Observabilidade Runtime</h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Janela: 15min · Auto-refresh: 5s · {data ? new Date(data.timestamp).toLocaleTimeString("pt-BR") : "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{
              background: autoRefresh ? `var(--brand-glow)` : COLORS.card,
              border: `1px solid ${autoRefresh ? COLORS.teal : COLORS.border}`,
              color: autoRefresh ? COLORS.teal : COLORS.muted,
              cursor: "pointer",
            }}
          >
            {autoRefresh ? "● Auto" : "○ Manual"}
          </button>
          <button
            onClick={() => mutate()}
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}
          >
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
          <a href="/dashboard" className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}>
            <ArrowLeft size={12} className="inline" /> Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-error-bg)`, border: `1px solid var(--status-error-border)`, color: COLORS.red }}>
          {error}
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Carregando APM..." progress={progress} />
      ) : data ? (
        <>
          {/* KPIs principais */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Traces (15min)</div>
              <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>{data.traces?.total_traces ?? "0"}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Spans</div>
              <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>{data.traces?.total_spans ?? "0"}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-error-border)` }}>
              <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Erros</div>
              <div className="text-2xl font-bold" style={{ color: COLORS.red }}>{data.traces?.error_spans ?? "0"}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Avg</div>
              <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>{formatDuration(data.traces?.avg_duration_ms ?? "0")}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>P95</div>
              <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>{formatDuration(data.traces?.p95_duration_ms ?? "0")}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>P99</div>
              <div className="text-2xl font-bold" style={{ color: COLORS.red }}>{formatDuration(data.traces?.p99_duration_ms ?? "0")}</div>
            </div>
          </div>

          {/* Task Scheduler Status */}
          {data.tasks && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Tasks Ativas</div>
                <div className="text-xl font-bold" style={{ color: COLORS.teal }}>{data.tasks.active_tasks}</div>
              </div>
              <div className="p-3 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-warning-border)` }}>
                <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Due Soon (1h)</div>
                <div className="text-xl font-bold" style={{ color: COLORS.amber }}>{data.tasks.due_soon}</div>
              </div>
              <div className="p-3 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-info-border)` }}>
                <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Running</div>
                <div className="text-xl font-bold" style={{ color: COLORS.blue }}>{data.tasks.running}</div>
              </div>
              <div className="p-3 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-error-border)` }}>
                <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Failed (24h)</div>
                <div className="text-xl font-bold" style={{ color: COLORS.red }}>{data.tasks.failed_today}</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Throughput Chart */}
            <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>THROUGHPUT (spans/min)</h3>
              {data.throughput.length === 0 ? (
                <div className="text-[12px]" style={{ color: COLORS.muted }}>Sem dados</div>
              ) : (
                <div className="flex items-end gap-1 h-32">
                  {data.throughput.map((t, i) => {
                    const h = maxThroughput > 0 ? (parseInt(t.count, 10) / maxThroughput) * 100 : 0;
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-t transition-all"
                        style={{ height: `${h}%`, background: COLORS.teal, opacity: 0.3 + (h / 100) * 0.7, minWidth: 4 }}
                        title={`${t.minute}: ${t.count} spans`}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top Services */}
            <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>TOP SERVICOS</h3>
              <div className="space-y-2">
                {data.top_services.map((s, i) => (
                  <div key={s.service} className="flex items-center justify-between text-[12px] py-1" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <span style={{ color: [COLORS.teal, COLORS.blue, COLORS.purple, COLORS.green, COLORS.amber][i % 5] }}>{s.service}</span>
                    <span style={{ color: COLORS.muted }}>{s.span_count} spans</span>
                    <span style={{ color: s.error_count !== "0" ? COLORS.red : COLORS.muted }}>{s.error_count} err</span>
                    <span style={{ color: COLORS.teal }}>{formatDuration(s.avg_duration_ms)}</span>
                  </div>
                ))}
                {data.top_services.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Sem dados</div>}
              </div>
            </div>

            {/* Slow Operations */}
            <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>OPERACOES MAIS LENTAS</h3>
              <div className="space-y-2">
                {data.slow_operations.map((op) => (
                  <div key={op.operation_name + op.service} className="flex items-center justify-between text-[12px] py-1" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <span className="truncate max-w-[200px]" style={{ color: COLORS.text }}>{op.operation_name}</span>
                    <span style={{ color: COLORS.muted }}>{op.service}</span>
                    <span style={{ color: COLORS.amber }}>{formatDuration(op.avg_duration_ms)}</span>
                    <span style={{ color: COLORS.red }}>{formatDuration(op.max_duration_ms)}</span>
                    <span style={{ color: COLORS.muted }}>{op.count}x</span>
                  </div>
                ))}
                {data.slow_operations.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Sem dados</div>}
              </div>
            </div>

            {/* Recent Errors */}
            <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>ERROS RECENTES</h3>
              <div className="space-y-2">
                {data.recent_errors.map((e) => (
                  <div key={e.trace_id + e.start_time} className="text-[12px] py-1" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <div className="flex items-center justify-between">
                      <span style={{ color: COLORS.red }}>{e.operation_name}</span>
                      <span style={{ color: COLORS.muted }}>{formatDuration(e.duration_ms)}</span>
                    </div>
                    <div className="text-[10px]" style={{ color: COLORS.muted }}>
                      {e.service} · {new Date(e.start_time).toLocaleTimeString("pt-BR")} · {e.status_message ?? "—"}
                    </div>
                  </div>
                ))}
                {data.recent_errors.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum erro</div>}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
