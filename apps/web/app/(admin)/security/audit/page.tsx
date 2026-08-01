// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
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
};

interface AuditLog {
  id: string;
  user_id: string | null;
  tenant_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AuditStats {
  actions: { action: string; count: number; last_occurrence: string }[];
}

const ACTION_COLORS: Record<string, string> = {
  "auth.login": COLORS.green,
  "auth.login.mfa": COLORS.teal,
  "mfa.enable": COLORS.green,
  "mfa.disable": COLORS.amber,
  "rbac.role.create": COLORS.blue,
  "rbac.role.permissions.update": COLORS.blue,
  "ssh.execute": COLORS.amber,
  "scripts.execute": COLORS.amber,
  "firewall.write": COLORS.red,
};

function getActionColor(action: string): string {
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (action.startsWith(key)) return color;
  }
  return COLORS.muted;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s atrás`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min atrás`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  const days = Math.floor(hr / 24);
  return `${days}d atrás`;
}

export default function AuditPage() {
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filtros
  const [actionFilter, setActionFilter] = useState("");
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const auditParams = new URLSearchParams();
  if (actionFilter) auditParams.set("action", actionFilter);
  auditParams.set("limit", String(limit));
  auditParams.set("offset", String(offset));

  const { data: auditData, error, isLoading, progress, mutate } = useApi<{ logs: AuditLog[]; total: number }>(`/api/audit/logs?${auditParams.toString()}`);
  const { data: stats } = useApi<AuditStats>("/api/audit/stats");

  const logs = auditData?.logs ?? [];
  const total = auditData?.total ?? 0;

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            Auditoria — Log Imutável
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Registro append-only de todas as ações do sistema
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

      {/* Stats resumidas */}
      {stats && stats.actions.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
        >
          <div className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>
            AÇÕES MAIS FREQUENTES
          </div>
          <div className="flex flex-wrap gap-3">
            {stats.actions.slice(0, 8).map((a) => (
              <div
                key={a.action}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md"
                style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: getActionColor(a.action) }}
                />
                <span className="text-[12px]" style={{ color: COLORS.text }}>
                  {a.action}
                </span>
                <span className="text-[11px] font-bold" style={{ color: getActionColor(a.action) }}>
                  {a.count}
                </span>
                <span className="text-[10px]" style={{ color: COLORS.muted }}>
                  {formatRelative(a.last_occurrence)}
                </span>
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
          <label htmlFor="audit-action-filter" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
            Filtrar por ação
          </label>
          <input
            id="audit-action-filter"
            type="text"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setOffset(0); }}
            placeholder="ex: auth.login"
            className="rounded-md px-3 py-1.5 text-[13px]"
            style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, width: 200 }}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="audit-limit" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
            Por página
          </label>
          <select
            id="audit-limit"
            value={limit}
            onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setOffset(0); }}
            className="rounded-md px-3 py-1.5 text-[13px]"
            style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
        <button
          onClick={() => mutate()}
          className="px-4 py-1.5 rounded-md text-[13px] font-bold"
          style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}
        >
          Buscar
        </button>
        <div className="ml-auto text-[12px]" style={{ color: COLORS.muted }}>
          {total} registro(s) · página {currentPage} de {totalPages || 1}
        </div>
      </div>

      {/* Tabela de logs */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
      >
        {isLoading ? (
          <LoadingState label="Carregando auditoria..." progress={progress} />
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>
            Nenhum log encontrado
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Quando</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Ação</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Recurso</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>IP</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>ID</th>
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
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: COLORS.muted }}>
                    {formatTime(log.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: getActionColor(log.action) }}
                      />
                      <span style={{ color: COLORS.text }}>{log.action}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                    {log.resource_type ? `${log.resource_type}` : "—"}
                    {log.resource_id ? `:${log.resource_id.slice(0, 8)}` : ""}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: COLORS.muted }}>
                    {log.ip_address ?? "—"}
                  </td>
                  <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                    {log.id.slice(0, 8)}
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
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Ação</div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: getActionColor(selectedLog.action) }} />
                    <span style={{ color: COLORS.text }}>{selectedLog.action}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>User ID</div>
                  <code style={{ color: COLORS.text }}>{selectedLog.user_id ?? "—"}</code>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Tenant ID</div>
                  <code style={{ color: COLORS.text }}>{selectedLog.tenant_id ?? "—"}</code>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Tipo de recurso</div>
                  <span style={{ color: COLORS.text }}>{selectedLog.resource_type ?? "—"}</span>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>ID do recurso</div>
                  <code style={{ color: COLORS.text }}>{selectedLog.resource_id ?? "—"}</code>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>IP</div>
                  <span style={{ color: COLORS.text }}>{selectedLog.ip_address ?? "—"}</span>
                </div>
              </div>

              {selectedLog.user_agent && (
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>User Agent</div>
                  <code
                    className="block p-2 rounded text-[11px] break-all"
                    style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}
                  >
                    {selectedLog.user_agent}
                  </code>
                </div>
              )}

              {selectedLog.details != null && (
                <div>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Detalhes</div>
                  <pre
                    className="p-3 rounded text-[11px] overflow-x-auto"
                    style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.teal }}
                  >
                    {JSON.stringify(selectedLog.details, null, 2)}
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
