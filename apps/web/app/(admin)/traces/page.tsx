"use client";

import { useState } from "react";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { LoadingState } from "@/components/ui/state-display";
import { useApi } from "@/lib/use-api";

const COLORS = {
  bg: "var(--surface-0)",
  card: "var(--surface-2)",
  cardHover: "var(--surface-hover)",
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

const SERVICE_COLORS = [COLORS.teal, COLORS.blue, COLORS.purple, COLORS.green, COLORS.amber, COLORS.red];

interface TraceSummary {
  trace_id: string;
  start_time: string;
  end_time: string;
  total_duration_ms: number;
  span_count: number;
  error_count: number;
  service_count: number;
  primary_service: string;
  root_operation: string;
  tenant_id: string;
}

interface TraceSpan {
  id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  operation_name: string;
  service: string;
  kind: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: string;
  status_message: string | null;
  attributes: unknown;
  events: unknown;
  resource: unknown;
}

interface TraceDetail {
  trace_id: string;
  total_duration_ms: number;
  span_count: number;
  error_count: number;
  spans: TraceSpan[];
}

interface TraceStats {
  services: {
    service: string;
    span_count: string;
    error_count: string;
    avg_duration_ms: string;
    max_duration_ms: string;
    last_occurrence: string;
  }[];
}

function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function getServiceColor(service: string, services: string[]): string {
  const idx = services.indexOf(service);
  return SERVICE_COLORS[idx % SERVICE_COLORS.length] ?? COLORS.muted;
}

export default function TracesPage() {
  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [serviceFilter, setServiceFilter] = useState("");
  const [operationFilter, setOperationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [minDuration, setMinDuration] = useState("");
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const traceParams = new URLSearchParams();
  if (serviceFilter) traceParams.set("service", serviceFilter);
  if (operationFilter) traceParams.set("operation", operationFilter);
  if (statusFilter) traceParams.set("status", statusFilter);
  if (minDuration) traceParams.set("min_duration_ms", minDuration);
  traceParams.set("limit", String(limit));
  traceParams.set("offset", String(offset));

  const { data: traceData, error, isLoading, progress, mutate } = useApi<{ traces: TraceSummary[]; total: number }>(`/api/traces/search?${traceParams.toString()}`);
  const { data: stats } = useApi<TraceStats>("/api/traces/stats");

  const traces = traceData?.traces ?? [];
  const total = traceData?.total ?? 0;

  const fetchTraceDetail = async (traceId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/traces/${traceId}`, { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setSelectedTrace(data);
      }
    } catch {
      // Ignora
    } finally {
      setLoadingDetail(false);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const allServices = stats?.services?.map((s) => s.service) ?? [];

  function handleSearch() {
    setOffset(0);
    mutate();
  }

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            Tracing Distribuído
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            OpenTelemetry · W3C Trace Context · {total} trace(s)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => mutate()}
            className="text-[12px] px-3 py-1.5 rounded border transition-colors"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}
          >
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
          <a
            href="/dashboard"
            className="text-[12px] px-3 py-1.5 rounded border transition-colors"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}
          >
            <ArrowLeft size={12} className="inline" /> Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div
          className="rounded-md p-3 text-sm"
          style={{ background: `var(--status-error-bg)`, border: `1px solid var(--status-error-border)`, color: COLORS.red }}
        >
          {error}
        </div>
      )}

      {/* Stats por serviço */}
      {stats && stats.services.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
        >
          <div className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>
            SERVIÇOS
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {stats.services.map((s) => (
              <div
                key={s.service}
                className="p-3 rounded-md"
                style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: getServiceColor(s.service, allServices) }}
                  />
                  <span className="text-[12px] font-bold" style={{ color: COLORS.text }}>
                    {s.service}
                  </span>
                </div>
                <div className="text-[10px] space-y-0.5" style={{ color: COLORS.muted }}>
                  <div>spans: <span style={{ color: COLORS.text }}>{s.span_count}</span></div>
                  <div>errors: <span style={{ color: s.error_count !== "0" ? COLORS.red : COLORS.text }}>{s.error_count}</span></div>
                  <div>avg: <span style={{ color: COLORS.teal }}>{formatDuration(parseFloat(s.avg_duration_ms))}</span></div>
                  <div>max: <span style={{ color: COLORS.amber }}>{formatDuration(parseFloat(s.max_duration_ms))}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div
        className="rounded-xl p-4 flex flex-wrap items-end gap-4"
        style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
      >
        <div className="space-y-1">
          <label htmlFor="trace-service-filter" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
            Serviço
          </label>
          <input
            id="trace-service-filter"
            type="text"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            placeholder="api, worker, etc"
            className="rounded-md px-3 py-1.5 text-[13px]"
            style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, width: 140 }}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="trace-op-filter" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
            Operação
          </label>
          <input
            id="trace-op-filter"
            type="text"
            value={operationFilter}
            onChange={(e) => setOperationFilter(e.target.value)}
            placeholder="GET /api/v1/..."
            className="rounded-md px-3 py-1.5 text-[13px]"
            style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, width: 200 }}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="trace-status-filter" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
            Status
          </label>
          <select
            id="trace-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md px-3 py-1.5 text-[13px]"
            style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            <option value="">Todos</option>
            <option value="error">Com erro</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="trace-min-dur" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
            Dur. mín. (ms)
          </label>
          <input
            id="trace-min-dur"
            type="number"
            value={minDuration}
            onChange={(e) => setMinDuration(e.target.value)}
            placeholder="100"
            className="rounded-md px-3 py-1.5 text-[13px]"
            style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, width: 100 }}
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-1.5 rounded-md text-[13px] font-bold"
          style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}
        >
          Buscar
        </button>
        <div className="ml-auto text-[12px]" style={{ color: COLORS.muted }}>
          {total} trace(s) · página {currentPage} de {totalPages || 1}
        </div>
      </div>

      {/* Lista de traces */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
      >
        {isLoading ? (
          <LoadingState label="Carregando traces..." progress={progress} />
        ) : traces.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhum trace encontrado</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Início</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Operação</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Serviço</th>
                <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Duração</th>
                <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Spans</th>
                <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Erros</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((t) => (
                <tr
                  key={t.trace_id}
                  onClick={() => fetchTraceDetail(t.trace_id)}
                  onKeyDown={(e) => { if (e.key === "Enter") fetchTraceDetail(t.trace_id); }}
                  style={{ borderBottom: `1px solid ${COLORS.border}`, cursor: "pointer", transition: "background 0.15s" }}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.cardHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: COLORS.muted }}>
                    {formatTime(t.start_time)}
                  </td>
                  <td className="px-3 py-2" style={{ color: COLORS.text }}>
                    {t.root_operation}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: getServiceColor(t.primary_service, allServices) }} />
                      <span style={{ color: COLORS.text }}>{t.primary_service}</span>
                      {t.service_count > 1 && (
                        <span className="text-[10px]" style={{ color: COLORS.muted }}>+{t.service_count - 1}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-bold" style={{ color: t.total_duration_ms > 1000 ? COLORS.amber : COLORS.teal }}>
                    {formatDuration(t.total_duration_ms)}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: COLORS.text }}>
                    {t.span_count}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {t.error_count > 0 ? (
                      <span className="font-bold" style={{ color: COLORS.red }}>{t.error_count}</span>
                    ) : (
                      <span style={{ color: COLORS.muted }}>0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-3 py-1.5 rounded text-[12px] disabled:opacity-30"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text, cursor: offset === 0 ? "not-allowed" : "pointer" }}
          >
            ← Anterior
          </button>
          <span className="text-[12px] px-3" style={{ color: COLORS.muted }}>{currentPage} / {totalPages}</span>
          <button
            onClick={() => setOffset(Math.min((totalPages - 1) * limit, offset + limit))}
            disabled={offset + limit >= total}
            className="px-3 py-1.5 rounded text-[12px] disabled:opacity-30"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text, cursor: offset + limit >= total ? "not-allowed" : "pointer" }}
          >
            Próxima →
          </button>
        </div>
      )}

      {/* Modal de detalhes do trace — timeline/Gantt */}
      {selectedTrace && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setSelectedTrace(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setSelectedTrace(null); }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-4xl w-full max-h-[85vh] overflow-y-auto"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
                  Trace Details
                </h2>
                <code className="text-[10px]" style={{ color: COLORS.muted }}>
                  {selectedTrace.trace_id}
                </code>
              </div>
              <button
                onClick={() => setSelectedTrace(null)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Resumo */}
            <div className="flex gap-4 mb-4 text-[12px]">
              <div>
                <span style={{ color: COLORS.muted }}>Duração total: </span>
                <span className="font-bold" style={{ color: COLORS.teal }}>
                  {formatDuration(selectedTrace.total_duration_ms)}
                </span>
              </div>
              <div>
                <span style={{ color: COLORS.muted }}>Spans: </span>
                <span style={{ color: COLORS.text }}>{selectedTrace.span_count}</span>
              </div>
              <div>
                <span style={{ color: COLORS.muted }}>Erros: </span>
                <span className="font-bold" style={{ color: selectedTrace.error_count > 0 ? COLORS.red : COLORS.text }}>
                  {selectedTrace.error_count}
                </span>
              </div>
            </div>

            {/* Timeline Gantt */}
            {loadingDetail ? (
              <LoadingState label="Carregando spans..." progress={progress} />
            ) : (
              <div className="space-y-1">
                {(() => {
                  const earliest = Math.min(
                    ...selectedTrace.spans.map((s) => new Date(s.start_time).getTime())
                  );
                  const totalDur = selectedTrace.total_duration_ms || 1;

                  return selectedTrace.spans
                    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                    .map((span) => {
                      const startOffset = new Date(span.start_time).getTime() - earliest;
                      const leftPct = (startOffset / totalDur) * 100;
                      const widthPct = Math.max((span.duration_ms / totalDur) * 100, 0.5);
                      const color = span.status === "error" ? COLORS.red : getServiceColor(span.service, allServices);
                      const depth = span.parent_span_id ? 1 : 0;

                      return (
                        <div
                          key={span.id}
                          className="flex items-center gap-2 group"
                          style={{ paddingLeft: `${depth * 20}px` }}
                        >
                          <div className="flex-shrink-0 w-[200px] truncate text-[11px]" style={{ color: COLORS.text }}>
                            {span.operation_name}
                          </div>
                          <div className="flex-shrink-0 w-[100px] text-[10px]" style={{ color: COLORS.muted }}>
                            {span.service}
                          </div>
                          <div className="flex-1 relative h-6 rounded" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                            <div
                              className="absolute h-full rounded transition-opacity group-hover:opacity-80"
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                background: color,
                                opacity: 0.7,
                              }}
                              title={`${span.operation_name} — ${formatDuration(span.duration_ms)}`}
                            />
                          </div>
                          <div className="flex-shrink-0 w-[60px] text-right text-[10px] font-bold" style={{ color }}>
                            {formatDuration(span.duration_ms)}
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            )}

            {/* Detalhes dos spans */}
            <div className="mt-4 space-y-2">
              <div className="text-[12px] font-bold" style={{ color: COLORS.muted }}>
                SPANS DETALHADOS
              </div>
              {selectedTrace.spans.map((span) => (
                <div
                  key={span.id}
                  className="p-3 rounded-md"
                  style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: span.status === "error" ? COLORS.red : getServiceColor(span.service, allServices) }}
                      />
                      <span className="text-[12px] font-bold" style={{ color: COLORS.text }}>
                        {span.operation_name}
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] uppercase"
                        style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}
                      >
                        {span.kind}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold" style={{ color: COLORS.teal }}>
                      {formatDuration(span.duration_ms)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]" style={{ color: COLORS.muted }}>
                    <div>service: <span style={{ color: COLORS.text }}>{span.service}</span></div>
                    <div>span_id: <code style={{ color: COLORS.text }}>{span.span_id.slice(0, 12)}</code></div>
                    <div>parent: <code style={{ color: COLORS.text }}>{span.parent_span_id?.slice(0, 12) ?? "—"}</code></div>
                  </div>
                  {span.status_message && (
                    <div className="mt-1 text-[10px]" style={{ color: COLORS.red }}>
                      {span.status_message}
                    </div>
                  )}
                  {span.attributes != null && Object.keys(span.attributes as object).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-[10px] cursor-pointer" style={{ color: COLORS.muted }}>
                        attributes
                      </summary>
                      <pre className="mt-1 p-2 rounded text-[10px] overflow-x-auto" style={{ background: COLORS.card, color: COLORS.teal }}>
                        {JSON.stringify(span.attributes, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
