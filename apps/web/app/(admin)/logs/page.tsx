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
  gray: "var(--text-disabled)",
};

const LEVEL_COLORS: Record<string, string> = {
  trace: COLORS.gray,
  debug: COLORS.blue,
  info: COLORS.green,
  warn: COLORS.amber,
  error: COLORS.red,
  fatal: COLORS.red,
};

const LEVEL_BG: Record<string, string> = {
  trace: `color-mix(in srgb, var(--text-disabled) 8%, transparent)`,
  debug: `var(--status-info-bg)`,
  info: `var(--status-ok-bg)`,
  warn: `var(--status-warning-bg)`,
  error: `var(--status-error-bg)`,
  fatal: `color-mix(in srgb, var(--status-error-text) 15%, transparent)`,
};

interface SystemLog {
  id: string;
  tenant_id: string | null;
  source: string;
  level: string;
  message: string;
  metadata: unknown;
  tags: string[];
  trace_id: string | null;
  span_id: string | null;
  host: string | null;
  service: string | null;
  created_at: string;
}

interface LogStats {
  by_level: { level: string; count: string; last_occurrence: string }[];
  top_sources: { source: string; count: string; last_occurrence: string }[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTimeMs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export default function LogsPage() {
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

  // Filtros
  const [levelFilter, setLevelFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [regexPattern, setRegexPattern] = useState("");
  const [tagsFilter, setTagsFilter] = useState("");
  const [traceIdFilter, setTraceIdFilter] = useState("");
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [useRegex, setUseRegex] = useState(false);

  const logParams = new URLSearchParams();
  if (levelFilter) logParams.set("level", levelFilter);
  if (sourceFilter) logParams.set("source", sourceFilter);
  if (serviceFilter) logParams.set("service", serviceFilter);
  if (regexPattern) logParams.set("message_pattern", regexPattern);
  if (tagsFilter) logParams.set("tags", tagsFilter);
  if (traceIdFilter) logParams.set("trace_id", traceIdFilter);
  logParams.set("limit", String(limit));
  logParams.set("offset", String(offset));

  const { data: logData, error, isLoading, mutate } = useApi<{ logs: SystemLog[]; total: number }>(`/api/logs/search?${logParams.toString()}`);
  const { data: stats } = useApi<LogStats>("/api/logs/stats");

  const logs = logData?.logs ?? [];
  const total = logData?.total ?? 0;

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

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
            Logs Centralizados
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Busca avançada com regex · {total} registro(s)
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

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Por nível */}
          <div
            className="rounded-xl p-4"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
          >
            <div className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>
              POR NÍVEL
            </div>
            <div className="flex flex-wrap gap-3">
              {stats.by_level.map((s) => (
                <div
                  key={s.level}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md"
                  style={{ background: LEVEL_BG[s.level] ?? COLORS.bg, border: `1px solid ${LEVEL_COLORS[s.level] ?? COLORS.border}33` }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: LEVEL_COLORS[s.level] ?? COLORS.muted }} />
                  <span className="text-[12px] uppercase font-bold" style={{ color: LEVEL_COLORS[s.level] ?? COLORS.muted }}>
                    {s.level}
                  </span>
                  <span className="text-[12px] font-bold" style={{ color: COLORS.text }}>
                    {s.count}
                  </span>
                </div>
              ))}
              {stats.by_level.length === 0 && (
                <span className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum log</span>
              )}
            </div>
          </div>

          {/* Top sources */}
          <div
            className="rounded-xl p-4"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
          >
            <div className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>
              TOP SOURCES
            </div>
            <div className="flex flex-wrap gap-3">
              {stats.top_sources.map((s) => (
                <div
                  key={s.source}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md"
                  style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}
                >
                  <span className="text-[12px]" style={{ color: COLORS.text }}>{s.source}</span>
                  <span className="text-[11px] font-bold" style={{ color: COLORS.teal }}>{s.count}</span>
                </div>
              ))}
              {stats.top_sources.length === 0 && (
                <span className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum log</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label htmlFor="log-level-filter" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
              Nível
            </label>
            <select
              id="log-level-filter"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="rounded-md px-3 py-1.5 text-[13px]"
              style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            >
              <option value="">Todos</option>
              <option value="trace">Trace</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="fatal">Fatal</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="log-source-filter" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
              Source
            </label>
            <input
              id="log-source-filter"
              type="text"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              placeholder="api, worker, etc"
              className="rounded-md px-3 py-1.5 text-[13px]"
              style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, width: 140 }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="log-service-filter" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
              Service
            </label>
            <input
              id="log-service-filter"
              type="text"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              placeholder="auth, zabbix, etc"
              className="rounded-md px-3 py-1.5 text-[13px]"
              style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, width: 140 }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="log-tags-filter" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
              Tags (comma)
            </label>
            <input
              id="log-tags-filter"
              type="text"
              value={tagsFilter}
              onChange={(e) => setTagsFilter(e.target.value)}
              placeholder="critical,auth"
              className="rounded-md px-3 py-1.5 text-[13px]"
              style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, width: 140 }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="log-trace-filter" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
              Trace ID
            </label>
            <input
              id="log-trace-filter"
              type="text"
              value={traceIdFilter}
              onChange={(e) => setTraceIdFilter(e.target.value)}
              placeholder="trace-uuid"
              className="rounded-md px-3 py-1.5 text-[13px]"
              style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, width: 160 }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="log-limit" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
              Por página
            </label>
            <select
              id="log-limit"
              value={limit}
              onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setOffset(0); }}
              className="rounded-md px-3 py-1.5 text-[13px]"
              style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>

        {/* Regex search */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[300px] space-y-1">
            <div className="flex items-center gap-2">
              <label htmlFor="log-regex" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
                Busca {useRegex ? "(regex)" : "(texto)"}
              </label>
              <button
                onClick={() => setUseRegex(!useRegex)}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{ background: useRegex ? `color-mix(in srgb, var(--status-info-text) 12%, transparent)` : COLORS.bg, border: `1px solid ${useRegex ? COLORS.purple : COLORS.border}`, color: useRegex ? COLORS.purple : COLORS.muted, cursor: "pointer" }}
              >
                {useRegex ? "REGEX ON" : "REGEX OFF"}
              </button>
            </div>
            <input
              id="log-regex"
              type="text"
              value={regexPattern}
              onChange={(e) => setRegexPattern(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder={useRegex ? "ex: ^ERROR.*timeout" : "ex: connection refused"}
              className="rounded-md px-3 py-1.5 text-[13px] w-full"
              style={{
                background: COLORS.bg,
                border: `1px solid ${useRegex ? COLORS.purple : COLORS.border}`,
                color: COLORS.text,
                fontFamily: useRegex ? "monospace" : undefined,
              }}
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-1.5 rounded-md text-[13px] font-bold"
            style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}
          >
            Buscar
          </button>
        </div>
      </div>

      {/* Tabela de logs */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
      >
        {isLoading ? (
          <LoadingState label="Carregando logs..." />
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>
            Nenhum log encontrado
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead style={{ position: "sticky", top: 0, background: COLORS.card, zIndex: 1 }}>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Time</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Level</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Source</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Message</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tags</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    onKeyDown={(e) => { if (e.key === "Enter") setSelectedLog(log); }}
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`,
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    role="button"
                    tabIndex={0}
                    onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.cardHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: COLORS.muted }}>
                      {formatTimeMs(log.created_at)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: LEVEL_BG[log.level] ?? COLORS.bg,
                          color: LEVEL_COLORS[log.level] ?? COLORS.muted,
                          border: `1px solid ${LEVEL_COLORS[log.level] ?? COLORS.muted}33`,
                        }}
                      >
                        {log.level}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: COLORS.teal }}>
                      {log.source}
                    </td>
                    <td className="px-3 py-1.5 max-w-[400px] truncate" style={{ color: COLORS.text }}>
                      {log.message}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1 flex-wrap">
                        {log.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-[10px]"
                            style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <span className="text-[12px] px-3" style={{ color: COLORS.muted }}>
            {currentPage} / {totalPages}
          </span>
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

      {/* Modal de detalhes */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setSelectedLog(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setSelectedLog(null); }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
                Detalhes do Log
              </h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>ID</div>
                  <code style={{ color: COLORS.text }}>{selectedLog.id}</code>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Quando</div>
                  <span style={{ color: COLORS.text }}>{formatTime(selectedLog.created_at)}</span>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Nível</div>
                  <span
                    className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: LEVEL_BG[selectedLog.level] ?? COLORS.bg,
                      color: LEVEL_COLORS[selectedLog.level] ?? COLORS.muted,
                    }}
                  >
                    {selectedLog.level}
                  </span>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Source</div>
                  <span style={{ color: COLORS.teal }}>{selectedLog.source}</span>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Service</div>
                  <span style={{ color: COLORS.text }}>{selectedLog.service ?? "—"}</span>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Host</div>
                  <span style={{ color: COLORS.text }}>{selectedLog.host ?? "—"}</span>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Trace ID</div>
                  <code style={{ color: COLORS.text }}>{selectedLog.trace_id ?? "—"}</code>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Span ID</div>
                  <code style={{ color: COLORS.text }}>{selectedLog.span_id ?? "—"}</code>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Message</div>
                <pre
                  className="p-3 rounded text-[12px] whitespace-pre-wrap break-words"
                  style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                >
                  {selectedLog.message}
                </pre>
              </div>

              {selectedLog.tags && selectedLog.tags.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Tags</div>
                  <div className="flex gap-1 flex-wrap">
                    {selectedLog.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded text-[10px]"
                        style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedLog.metadata != null && Object.keys(selectedLog.metadata as object).length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Metadata</div>
                  <pre
                    className="p-3 rounded text-[11px] overflow-x-auto"
                    style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.teal }}
                  >
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
