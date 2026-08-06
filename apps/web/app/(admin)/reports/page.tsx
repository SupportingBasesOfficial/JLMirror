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

const FORMATS = ["pdf", "csv", "json", "html", "xlsx"];
const DELIVERY_METHODS = ["email", "webhook", "download", "slack"];
const CRON_PRESETS = [
  { label: "Diário 8h", value: "0 8 * * *" },
  { label: "Semanal Seg 8h", value: "0 8 * * 1" },
  { label: "Mensal 1º 8h", value: "0 8 1 * *" },
  { label: "A cada 6h", value: "0 */6 * * *" },
];

interface Template {
  id: string;
  name: string;
  description: string | null;
  report_type: string;
  data_sources: string[];
  columns: string[];
  format: string;
  chart_type: string | null;
  is_active: boolean;
}

interface Report {
  id: string;
  template_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  schedule_cron: string;
  schedule_description: string | null;
  recipients: string[];
  delivery_method: string;
  format: string;
  last_run_at: string | null;
  next_run_at: string | null;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  template_name?: string;
  report_type?: string;
  chart_type?: string;
}

interface Delivery {
  id: string;
  report_id: string;
  status: string;
  file_path: string | null;
  file_size_bytes: number | null;
  file_format: string | null;
  row_count: number | null;
  duration_ms: number | null;
  recipients_sent: string[];
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface Stats {
  total_reports: number;
  active_reports: number;
  total_templates: number;
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  success_rate: number;
  recent_deliveries: Array<Record<string, unknown>>;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const STATUS_COLORS: Record<string, string> = {
  completed: COLORS.green,
  failed: COLORS.red,
  pending: COLORS.muted,
  generating: COLORS.blue,
  delivering: COLORS.amber,
};

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{ background: COLORS.card, border: `1px solid ${color}33` }}
    >
      <div
        className="text-[10px] uppercase font-bold mb-1"
        style={{ color: COLORS.muted }}
      >
        {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] mt-1" style={{ color: COLORS.muted }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const { data: tplData, mutate: mutateTemplates } = useApi<{
    templates: Template[];
  }>("/api/reports/templates");
  const { data: rData, mutate: mutateReports } = useApi<{ reports: Report[] }>(
    "/api/reports",
  );
  const { data: stats, mutate: mutateStats } =
    useApi<Stats>("/api/reports/stats");
  const templates = tplData?.templates ?? [];
  const reports = rData?.reports ?? [];
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"reports" | "templates" | "deliveries">(
    "reports",
  );
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [crTemplateId, setCrTemplateId] = useState("");
  const [crName, setCrName] = useState("");
  const [crDescription, setCrDescription] = useState("");
  const [crCron, setCrCron] = useState("0 8 * * 1");
  const [crRecipients, setCrRecipients] = useState("");
  const [crDelivery, setCrDelivery] = useState("email");
  const [crFormat, setCrFormat] = useState("pdf");

  async function fetchDeliveries(reportId: string) {
    try {
      const res = await fetch(`/api/reports/${reportId}/deliveries`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries ?? []);
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  async function handleCreate() {
    setError(null);
    const recipients = crRecipients
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!crTemplateId || !crName || recipients.length === 0) {
      setError("Preencha template, nome e recipients");
      return;
    }
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          template_id: crTemplateId,
          name: crName,
          description: crDescription || undefined,
          schedule_cron: crCron,
          recipients,
          delivery_method: crDelivery,
          format: crFormat,
        }),
      });
      if (res.ok) {
        setSuccess("Relatório criado!");
        setShowCreate(false);
        setCrTemplateId("");
        setCrName("");
        setCrDescription("");
        setCrRecipients("");
        mutateReports();
        mutateStats();
      }
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleRun(reportId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/run`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSuccess(
          `Relatório gerado! ${data.rows} linhas, ${data.duration_ms}ms`,
        );
        mutateReports();
        mutateStats();
        if (selectedReportId === reportId) fetchDeliveries(reportId);
      }
    } catch {
      setError("Erro ao executar");
    }
  }

  async function handleToggle(reportId: string, current: boolean) {
    try {
      await fetch(`/api/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: !current }),
      });
      mutateReports();
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  async function handleDelete(reportId: string) {
    try {
      await fetch(`/api/reports/${reportId}`, {
        method: "DELETE",
        credentials: "include",
      });
      mutateReports();
      mutateStats();
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  function handleViewDeliveries(reportId: string) {
    setSelectedReportId(reportId);
    setTab("deliveries");
    fetchDeliveries(reportId);
  }

  const TABS = [
    { key: "reports", label: "Relatórios" },
    { key: "templates", label: "Templates" },
    { key: "deliveries", label: "Entregas" },
  ] as const;

  if (!rData && !stats)
    return <LoadingState label="Carregando relatorios..." />;

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
            Relatórios Agendados
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Templates · Agendamento · Entregas · Histórico
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              mutateTemplates();
              mutateReports();
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
          <button
            onClick={() => setShowCreate(true)}
            className="text-[12px] px-3 py-1.5 rounded font-bold"
            style={{
              background: COLORS.teal,
              color: COLORS.bg,
              cursor: "pointer",
            }}
          >
            + Novo Relatório
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
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <KpiCard
            label="Relatórios"
            value={stats.total_reports}
            color={COLORS.teal}
          />
          <KpiCard
            label="Ativos"
            value={stats.active_reports}
            color={COLORS.green}
          />
          <KpiCard
            label="Templates"
            value={stats.total_templates}
            color={COLORS.blue}
          />
          <KpiCard
            label="Entregas"
            value={stats.total_deliveries}
            color={COLORS.purple}
          />
          <KpiCard
            label="Sucesso"
            value={stats.successful_deliveries}
            color={COLORS.green}
          />
          <KpiCard
            label="Falhas"
            value={stats.failed_deliveries}
            color={COLORS.red}
          />
          <KpiCard
            label="Taxa"
            value={`${stats.success_rate}%`}
            color={stats.success_rate >= 80 ? COLORS.green : COLORS.amber}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map((t) => (
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

      {/* Tab: Reports */}
      {tab === "reports" && (
        <div
          className="rounded-xl p-6"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          <div className="space-y-2">
            {reports.length === 0 && (
              <div className="text-[12px]" style={{ color: COLORS.muted }}>
                Nenhum relatório agendado
              </div>
            )}
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 rounded-md"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div
                      className="text-[13px] font-bold"
                      style={{ color: COLORS.teal }}
                    >
                      {r.name}
                    </div>
                    <div
                      className="text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      {r.template_name ?? "—"} · {r.format} ·{" "}
                      {r.delivery_method} · {r.schedule_cron}
                    </div>
                    <div
                      className="text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Runs: {r.total_runs} (✓{r.successful_runs} ✗
                      {r.failed_runs}) · Last: {formatTime(r.last_run_at)} ·
                      Next: {formatTime(r.next_run_at)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {r.recipients.map((email, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded text-[10px]"
                        style={{
                          background: `var(--status-info-bg)`,
                          color: COLORS.blue,
                        }}
                      >
                        {email}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: r.is_active
                        ? `var(--status-ok-bg)`
                        : `color-mix(in srgb, var(--text-muted) 8%, transparent)`,
                      color: r.is_active ? COLORS.green : COLORS.muted,
                    }}
                  >
                    {r.is_active ? "active" : "inactive"}
                  </span>
                  <button
                    onClick={() => handleRun(r.id)}
                    className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{
                      background: `var(--brand-glow)`,
                      border: `1px solid color-mix(in srgb, var(--brand-primary) 27%, transparent)`,
                      color: COLORS.teal,
                      cursor: "pointer",
                    }}
                  >
                    ▶ Run
                  </button>
                  <button
                    onClick={() => handleViewDeliveries(r.id)}
                    className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{
                      background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`,
                      border: `1px solid var(--status-info-border)`,
                      color: COLORS.blue,
                      cursor: "pointer",
                    }}
                  >
                    Entregas
                  </button>
                  <button
                    onClick={() => handleToggle(r.id, r.is_active)}
                    className="px-2 py-1 rounded text-[10px]"
                    style={{
                      background: COLORS.card,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.muted,
                      cursor: "pointer",
                    }}
                  >
                    {r.is_active ? "⏸" : "▶"}
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="px-2 py-1 rounded text-[10px]"
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Templates */}
      {tab === "templates" && (
        <div
          className="rounded-xl p-6"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {templates.length === 0 && (
              <div className="text-[12px]" style={{ color: COLORS.muted }}>
                Nenhum template
              </div>
            )}
            {templates.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-xl"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[13px] font-bold"
                    style={{ color: COLORS.teal }}
                  >
                    {t.name}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: `color-mix(in srgb, var(--status-info-text) 8%, transparent)`,
                      color: COLORS.purple,
                    }}
                  >
                    {t.report_type}
                  </span>
                </div>
                <div
                  className="text-[11px] mb-2"
                  style={{ color: COLORS.muted }}
                >
                  {t.description ?? "—"}
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {t.data_sources.map((s, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[10px]"
                      style={{
                        background: `var(--status-info-bg)`,
                        color: COLORS.blue,
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <div
                  className="flex items-center gap-2 text-[10px]"
                  style={{ color: COLORS.muted }}
                >
                  <span>Format: {t.format}</span>
                  <span>Chart: {t.chart_type ?? "—"}</span>
                  <span>Columns: {t.columns.length}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Deliveries */}
      {tab === "deliveries" && (
        <div
          className="rounded-xl p-6"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          <div className="text-[12px] mb-3" style={{ color: COLORS.muted }}>
            {selectedReportId
              ? `Entregas do relatório selecionado`
              : "Selecione um relatório e clique em 'Entregas'"}
          </div>
          <div className="space-y-1">
            {deliveries.length === 0 && (
              <div className="text-[12px]" style={{ color: COLORS.muted }}>
                Nenhuma entrega registrada
              </div>
            )}
            {deliveries.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between p-3 rounded-md text-[12px]"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: `${STATUS_COLORS[d.status] ?? COLORS.muted}15`,
                      color: STATUS_COLORS[d.status] ?? COLORS.muted,
                    }}
                  >
                    {d.status}
                  </span>
                  <span className="ml-2" style={{ color: COLORS.muted }}>
                    {d.row_count ?? 0} rows · {formatBytes(d.file_size_bytes)} ·{" "}
                    {d.duration_ms ?? 0}ms
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {d.file_path && (
                    <span
                      className="text-[10px]"
                      style={{ color: COLORS.blue }}
                    >
                      {d.file_format?.toUpperCase()}
                    </span>
                  )}
                  <span style={{ color: COLORS.muted }}>
                    {formatTime(d.completed_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Create */}
      {showCreate && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowCreate(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowCreate(false);
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 w-full max-w-lg space-y-4"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="button"
            tabIndex={0}
          >
            <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
              Novo Relatório Agendado
            </h2>

            <div className="space-y-1">
              <label
                htmlFor="cr-t"
                className="text-[10px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Template
              </label>
              <select
                id="cr-t"
                value={crTemplateId}
                onChange={(e) => setCrTemplateId(e.target.value)}
                className="w-full rounded-md px-3 py-2 text-[12px]"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              >
                <option value="">Selecione...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.report_type})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="cr-n"
                className="text-[10px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Nome
              </label>
              <input
                id="cr-n"
                type="text"
                value={crName}
                onChange={(e) => setCrName(e.target.value)}
                placeholder="Relatório Semanal de Dispositivos"
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
                htmlFor="cr-d"
                className="text-[10px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Descrição
              </label>
              <input
                id="cr-d"
                type="text"
                value={crDescription}
                onChange={(e) => setCrDescription(e.target.value)}
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
                htmlFor="cr-cron"
                className="text-[10px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Agendamento (Cron)
              </label>
              <div className="flex gap-2 flex-wrap mb-1">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setCrCron(p.value)}
                    className="px-2 py-1 rounded text-[10px]"
                    style={{
                      background:
                        crCron === p.value ? `var(--brand-glow)` : COLORS.bg,
                      border: `1px solid ${crCron === p.value ? COLORS.teal : COLORS.border}`,
                      color: crCron === p.value ? COLORS.teal : COLORS.muted,
                      cursor: "pointer",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                id="cr-cron"
                type="text"
                value={crCron}
                onChange={(e) => setCrCron(e.target.value)}
                className="w-full rounded-md px-3 py-2 text-[12px]"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="cr-r"
                className="text-[10px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Recipients (vírgula)
              </label>
              <input
                id="cr-r"
                type="text"
                value={crRecipients}
                onChange={(e) => setCrRecipients(e.target.value)}
                placeholder="admin@empresa.com, manager@empresa.com"
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
                  htmlFor="cr-dm"
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Entrega
                </label>
                <select
                  id="cr-dm"
                  value={crDelivery}
                  onChange={(e) => setCrDelivery(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                >
                  {DELIVERY_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="cr-f"
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Formato
                </label>
                <select
                  id="cr-f"
                  value={crFormat}
                  onChange={(e) => setCrFormat(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                >
                  {FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-md text-[12px]"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.muted,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 rounded-md text-[12px] font-bold"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: "pointer",
                }}
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
