// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import {
  CircleAlert,
  RefreshCw,
  AlertTriangle,
  XCircle,
  Clock,
} from "lucide-react";
import { useApi } from "@/lib/use-api";
import { LoadingState } from "@/components/ui/state-display";

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
};

interface ErrorReport {
  id: string;
  tenant_id: string | null;
  ticket_id: string | null;
  user_id: string | null;
  error_message: string;
  error_type: string | null;
  url: string | null;
  route: string | null;
  severity: string;
  status: string;
  root_cause: string | null;
  resolution: string | null;
  trace_id: string | null;
  created_at: string;
  ticket_number: string | null;
  ticket_subject: string | null;
  user_email: string | null;
  user_name: string | null;
  tenant_name: string | null;
}

const SEVERITY_CONFIG: Record<
  string,
  { color: string; icon: React.ReactNode; label: string }
> = {
  warning: {
    color: COLORS.amber,
    icon: <AlertTriangle size={14} />,
    label: "Warning",
  },
  error: { color: COLORS.red, icon: <XCircle size={14} />, label: "Error" },
  fatal: { color: COLORS.red, icon: <XCircle size={16} />, label: "Fatal" },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  open: { color: COLORS.blue, label: "Aberto" },
  investigating: { color: COLORS.amber, label: "Investigando" },
  resolved: { color: COLORS.green, label: "Resolvido" },
  wontfix: { color: COLORS.muted, label: "Não corrigir" },
};

export default function ErrorReportsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const {
    data: reportsData,
    error,
    isLoading,
    mutate,
  } = useApi<{ reports: ErrorReport[]; total: number }>(
    statusFilter
      ? `/api/v1/errors/reports?status=${statusFilter}`
      : "/api/v1/errors/reports",
  );

  const { data: detailData } = useApi<{
    report: ErrorReport & {
      error_stack: string | null;
      component_stack: string | null;
      user_agent: string | null;
      browser_info: Record<string, unknown>;
      last_action: Record<string, unknown>;
      input_data: Record<string, unknown>;
    };
  }>(selectedId ? `/api/v1/errors/reports/${selectedId}` : null);

  const reports = reportsData?.reports ?? [];
  const detail = detailData?.report;

  return (
    <div
      className="p-6 space-y-4"
      style={{ background: COLORS.bg, minHeight: "100vh" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold flex items-center gap-2"
            style={{ color: COLORS.text }}
          >
            <CircleAlert size={28} style={{ color: COLORS.red }} />
            Error Reports
          </h1>
          <p className="text-sm mt-1" style={{ color: COLORS.muted }}>
            Relatórios de erros capturados automaticamente pelo frontend
          </p>
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          className="p-2 rounded-lg border"
          style={{ borderColor: COLORS.border, color: COLORS.muted }}
          title="Atualizar"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {["", "open", "investigating", "resolved", "wontfix"].map((status) => (
          <button
            type="button"
            key={status}
            onClick={() => setStatusFilter(status)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: statusFilter === status ? COLORS.teal : COLORS.card,
              color: statusFilter === status ? "#fff" : COLORS.muted,
              border: `1px solid ${statusFilter === status ? COLORS.teal : COLORS.border}`,
            }}
          >
            {status === "" ? "Todos" : (STATUS_CONFIG[status]?.label ?? status)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState label="Carregando relatórios..." />
      ) : error ? (
        <div className="p-4 rounded-xl" style={{ color: COLORS.red }}>
          Erro ao carregar: {error}
        </div>
      ) : reports.length === 0 ? (
        <div
          className="text-center py-12 rounded-xl border"
          style={{ borderColor: COLORS.border, color: COLORS.muted }}
        >
          Nenhum relatório de erro encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Lista */}
          <div className="lg:col-span-1 space-y-2 max-h-[70vh] overflow-y-auto">
            {reports.map((report) => {
              const sev =
                SEVERITY_CONFIG[report.severity] ?? SEVERITY_CONFIG.error!;
              const st = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.open!;
              return (
                <button
                  type="button"
                  key={report.id}
                  onClick={() => setSelectedId(report.id)}
                  className="w-full text-left p-3 rounded-xl border transition-all"
                  style={{
                    background: COLORS.card,
                    borderColor:
                      selectedId === report.id ? COLORS.teal : COLORS.border,
                    borderWidth: selectedId === report.id ? 2 : 1,
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div
                      className="flex items-center gap-1.5"
                      style={{ color: sev.color }}
                    >
                      {sev.icon}
                      <span className="text-xs font-medium">{sev.label}</span>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: `${st.color}20`, color: st.color }}
                    >
                      {st.label}
                    </span>
                  </div>
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: COLORS.text }}
                  >
                    {report.error_message}
                  </p>
                  <div
                    className="flex items-center gap-2 mt-1 text-xs"
                    style={{ color: COLORS.muted }}
                  >
                    {report.ticket_number && (
                      <span style={{ color: COLORS.blue }}>
                        {report.ticket_number}
                      </span>
                    )}
                    {report.route && <span>· {report.route}</span>}
                  </div>
                  <div
                    className="flex items-center gap-1 mt-1 text-xs"
                    style={{ color: COLORS.muted }}
                  >
                    <Clock size={12} />
                    {new Date(report.created_at).toLocaleString("pt-BR")}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detalhe */}
          <div className="lg:col-span-2">
            {selectedId && detail ? (
              <div
                className="rounded-xl border p-5 space-y-4"
                style={{ background: COLORS.card, borderColor: COLORS.border }}
              >
                <div>
                  <h2
                    className="text-lg font-bold"
                    style={{ color: COLORS.text }}
                  >
                    {detail.error_type ?? "Erro"}
                  </h2>
                  <p className="text-sm mt-1" style={{ color: COLORS.muted }}>
                    {detail.error_message}
                  </p>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <InfoItem
                    label="Ticket"
                    value={detail.ticket_number ?? "N/A"}
                  />
                  <InfoItem
                    label="Tenant"
                    value={detail.tenant_name ?? "N/A"}
                  />
                  <InfoItem
                    label="Usuário"
                    value={detail.user_email ?? "N/A"}
                  />
                  <InfoItem label="Severidade" value={detail.severity} />
                  <InfoItem
                    label="Status"
                    value={STATUS_CONFIG[detail.status]?.label ?? detail.status}
                  />
                  <InfoItem label="URL" value={detail.url ?? "N/A"} />
                  <InfoItem label="Rota" value={detail.route ?? "N/A"} />
                  <InfoItem label="Trace ID" value={detail.trace_id ?? "N/A"} />
                </div>

                {/* Stack trace */}
                {detail.error_stack && (
                  <div>
                    <p
                      className="text-xs font-medium mb-1"
                      style={{ color: COLORS.muted }}
                    >
                      Stack Trace
                    </p>
                    <pre
                      className="text-xs p-3 rounded-lg overflow-auto max-h-48"
                      style={{
                        background: COLORS.bg,
                        color: COLORS.red,
                        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      {detail.error_stack}
                    </pre>
                  </div>
                )}

                {/* Component stack */}
                {detail.component_stack && (
                  <div>
                    <p
                      className="text-xs font-medium mb-1"
                      style={{ color: COLORS.muted }}
                    >
                      Component Stack
                    </p>
                    <pre
                      className="text-xs p-3 rounded-lg overflow-auto max-h-48"
                      style={{
                        background: COLORS.bg,
                        color: COLORS.amber,
                        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      {detail.component_stack}
                    </pre>
                  </div>
                )}

                {/* Root cause / resolution */}
                {detail.root_cause && (
                  <div>
                    <p
                      className="text-xs font-medium mb-1"
                      style={{ color: COLORS.muted }}
                    >
                      Causa Raiz
                    </p>
                    <p
                      className="text-sm p-3 rounded-lg"
                      style={{
                        background: COLORS.bg,
                        border: `1px solid ${COLORS.border}`,
                        color: COLORS.text,
                      }}
                    >
                      {detail.root_cause}
                    </p>
                  </div>
                )}
                {detail.resolution && (
                  <div>
                    <p
                      className="text-xs font-medium mb-1"
                      style={{ color: COLORS.muted }}
                    >
                      Resolução
                    </p>
                    <p
                      className="text-sm p-3 rounded-lg"
                      style={{
                        background: COLORS.bg,
                        border: `1px solid ${COLORS.border}`,
                        color: COLORS.green,
                      }}
                    >
                      {detail.resolution}
                    </p>
                  </div>
                )}

                {/* Browser info */}
                {detail.browser_info &&
                  Object.keys(detail.browser_info).length > 0 && (
                    <div>
                      <p
                        className="text-xs font-medium mb-1"
                        style={{ color: COLORS.muted }}
                      >
                        Browser Info
                      </p>
                      <pre
                        className="text-xs p-3 rounded-lg"
                        style={{
                          background: COLORS.bg,
                          border: `1px solid ${COLORS.border}`,
                          color: COLORS.muted,
                        }}
                      >
                        {JSON.stringify(detail.browser_info, null, 2)}
                      </pre>
                    </div>
                  )}
              </div>
            ) : (
              <div
                className="rounded-xl border flex items-center justify-center h-full min-h-[300px]"
                style={{
                  background: COLORS.card,
                  borderColor: COLORS.border,
                  color: COLORS.muted,
                }}
              >
                Selecione um relatório para ver os detalhes
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: COLORS.muted }}>
        {label}
      </p>
      <p
        className="text-sm font-medium truncate"
        style={{ color: COLORS.text }}
      >
        {value}
      </p>
    </div>
  );
}
