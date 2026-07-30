"use client";

import { useState } from "react";
import {RefreshCw, ArrowLeft, Plus } from "lucide-react";
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

const RESOURCE_TYPES = ["cpu", "memory", "disk", "network", "storage", "database", "cluster", "service"];
const REPORT_TYPES = ["capacity_summary", "trend_analysis", "forecast", "utilization_breakdown", "custom"];

const TYPE_COLORS: Record<string, string> = {
  cpu: COLORS.blue,
  memory: COLORS.purple,
  disk: COLORS.amber,
  network: COLORS.teal,
  storage: COLORS.green,
  database: COLORS.red,
  cluster: COLORS.blue,
  service: COLORS.muted,
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: COLORS.green,
  medium: COLORS.amber,
  low: COLORS.red,
};

interface CapacityMetric {
  id: string;
  resource_name: string;
  resource_type: string;
  metric_name: string;
  metric_value: number;
  metric_unit: string;
  max_capacity: number | null;
  utilization_pct: number | null;
  collected_at: string;
}

interface Threshold {
  id: string;
  resource_type: string;
  resource_name: string;
  warning_pct: number;
  critical_pct: number;
  is_active: boolean;
}

interface Forecast {
  id: string;
  resource_type: string;
  resource_name: string;
  metric_name: string;
  current_value: number;
  predicted_value_7d: number | null;
  predicted_value_30d: number | null;
  predicted_value_90d: number | null;
  slope: number;
  r_squared: number;
  days_until_capacity: number | null;
  confidence: string;
  generated_at: string;
}

interface Report {
  id: string;
  name: string;
  report_type: string;
  status: string;
  file_size_bytes: string | null;
  summary: Record<string, unknown>;
  generated_at: string | null;
  created_at: string;
}

interface CapacityStats {
  overview: { total_resources: string; total_types: string; critical_count: string; warning_count: string };
  by_type: { resource_type: string; resource_count: string; avg_utilization: string; max_utilization: string }[];
  top_utilized: { resource_type: string; resource_name: string; metric_name: string; avg_utilization: string; peak_utilization: string }[];
  forecasts: { total: string; within_30d: string; within_90d: string; high_confidence: string };
}

function formatPct(val: string | number | null): string {
  if (val == null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatBytes(bytes: string | null): string {
  if (!bytes) return "—";
  const n = parseInt(bytes, 10);
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
   
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function CapacityPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "metrics" | "thresholds" | "forecast" | "reports">("overview");
  const [showThreshold, setShowThreshold] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // Threshold form
  const [tType, setTType] = useState("cpu");
  const [tName, setTName] = useState("");
  const [tWarn, setTWarn] = useState(70);
  const [tCrit, setTCrit] = useState(90);

  // Report form
  const [rName, setRName] = useState("");
  const [rType, setRType] = useState("capacity_summary");
  const [rScheduled, setRScheduled] = useState(false);
  const [rCron, setRCron] = useState("");

  // Forecast form
  const [fcType, setFcType] = useState("cpu");
  const [fcName, setFcName] = useState("");
  const [fcMetric, setFcMetric] = useState("utilization_pct");

  const { data: mData, isLoading: loading, mutate: mutateMetrics } = useApi<{ metrics: CapacityMetric[] }>("/api/capacity/metrics?hours=1&limit=100");
  const { data: thData, mutate: mutateThresholds } = useApi<{ thresholds: Threshold[] }>("/api/capacity/thresholds");
  const { data: fcData, mutate: mutateForecasts } = useApi<{ forecasts: Forecast[] }>("/api/capacity/forecast");
  const { data: rpData, mutate: mutateReports } = useApi<{ reports: Report[] }>("/api/capacity/reports");
  const { data: stats, mutate: mutateStats } = useApi<CapacityStats>("/api/capacity/stats");
  const metrics = mData?.metrics ?? [];
  const thresholds = thData?.thresholds ?? [];
  const forecasts = fcData?.forecasts ?? [];
  const reports = rpData?.reports ?? [];

  async function handleCreateThreshold() {
    setError(null);
    try {
      const res = await fetch("/api/capacity/thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ resource_type: tType, resource_name: tName, warning_pct: tWarn, critical_pct: tCrit, is_active: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar threshold");
        return;
      }
      setSuccess("Threshold criado!");
      setShowThreshold(false);
      setTName(""); setTWarn(70); setTCrit(90);
      mutateThresholds();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleDeleteThreshold(id: string) {
    try {
      const res = await fetch(`/api/capacity/thresholds/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) mutateThresholds();
    } catch {
      // Ignora
    }
  }

  async function handleGenerateForecast() {
    if (!fcName) return;
    setError(null);
    try {
      const params = new URLSearchParams({ resource_type: fcType, resource_name: fcName, metric_name: fcMetric });
      const res = await fetch(`/api/capacity/forecast?${params.toString()}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao gerar previsão");
        return;
      }
      setSuccess("Previsão gerada!");
      mutateForecasts();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleCreateReport() {
    setError(null);
    try {
      const res = await fetch("/api/capacity/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: rName, report_type: rType, is_scheduled: rScheduled, cron_expression: rCron || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao gerar relatório");
        return;
      }
      setSuccess("Relatório gerado!");
      setShowReport(false);
      setRName(""); setRCron("");
      mutateReports();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleDeleteReport(id: string) {
    try {
      const res = await fetch(`/api/capacity/reports/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) mutateReports();
    } catch {
      // Ignora
    }
  }

  if (!mData && !thData && !stats) return <LoadingState label="Carregando capacidade..." />;

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            Capacity Planning — Análise & Previsões
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Métricas · Thresholds · Forecast · Relatórios
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "thresholds" && (
            <button onClick={() => setShowThreshold(true)} className="text-[12px] px-3 py-1.5 rounded font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}><Plus size={12} className="inline" /> Threshold</button>
          )}
          {tab === "reports" && (
            <button onClick={() => setShowReport(true)} className="text-[12px] px-3 py-1.5 rounded font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}>
              + Relatório
            </button>
          )}
          <button onClick={() => { mutateMetrics(); mutateThresholds(); mutateForecasts(); mutateReports(); mutateStats(); }} className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}>
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
          <a href="/dashboard" className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}>
            <ArrowLeft size={12} className="inline" /> Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-error-bg)`, border: `1px solid var(--status-error-border)`, color: COLORS.red }}>{error}</div>
      )}
      {success && (
        <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-ok-bg)`, border: `1px solid var(--status-ok-border)`, color: COLORS.green }}>{success}</div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Recursos</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>{stats.overview.total_resources}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.overview.total_types} tipos</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-warning-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Warning</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>{stats.overview.warning_count}</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-error-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Critical</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.red }}>{stats.overview.critical_count}</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Forecasts 30d</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.purple }}>{stats.forecasts.within_30d}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.forecasts.high_confidence} alta confiança</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {([
          { key: "overview", label: "Overview" },
          { key: "metrics", label: `Métricas (${metrics.length})` },
          { key: "thresholds", label: `Thresholds (${thresholds.length})` },
          { key: "forecast", label: "Forecast" },
          { key: "reports", label: `Relatórios (${reports.length})` },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-t-md text-[12px] font-bold transition-colors"
            style={{
              background: tab === t.key ? COLORS.card : "transparent",
              border: `1px solid ${COLORS.border}`,
              borderBottom: tab === t.key ? "none" : `1px solid ${COLORS.border}`,
              color: tab === t.key ? COLORS.teal : COLORS.muted,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === "overview" && stats && (
        <div className="space-y-4 rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>UTILIZAÇÃO POR TIPO</h3>
            <div className="space-y-2">
              {stats.by_type.map((row) => {
                const maxUtil = parseFloat(row.max_utilization ?? "0");
                const color = maxUtil >= 90 ? COLORS.red : maxUtil >= 70 ? COLORS.amber : COLORS.green;
                return (
                  <div key={row.resource_type} className="flex items-center gap-3">
                    <span className="text-[12px] w-20" style={{ color: TYPE_COLORS[row.resource_type] ?? COLORS.muted }}>{row.resource_type}</span>
                    <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: COLORS.bg }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(maxUtil, 100)}%`, background: color, transition: "width 0.3s" }} />
                    </div>
                    <span className="text-[12px] w-20 text-right" style={{ color }}>{formatPct(row.max_utilization)}</span>
                    <span className="text-[10px] w-16" style={{ color: COLORS.muted }}>{row.resource_count} recursos</span>
                  </div>
                );
              })}
              {stats.by_type.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Sem dados</div>}
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: "16px" }}>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>TOP RECURSOS UTILIZADOS</h3>
            <div className="space-y-1">
              {stats.top_utilized.map((row, i) => {
                const peak = parseFloat(row.peak_utilization ?? "0");
                const color = peak >= 90 ? COLORS.red : peak >= 70 ? COLORS.amber : COLORS.green;
                return (
                  <div key={i} className="flex items-center justify-between text-[12px] py-1">
                    <span style={{ color: COLORS.text }}>
                      <span style={{ color: TYPE_COLORS[row.resource_type] ?? COLORS.muted }}>{row.resource_type}</span>
                      {" "}{row.resource_name} <span style={{ color: COLORS.muted }}>({row.metric_name})</span>
                    </span>
                    <span style={{ color }}>{formatPct(row.peak_utilization)} peak</span>
                  </div>
                );
              })}
              {stats.top_utilized.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Sem dados</div>}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Metrics */}
      {tab === "metrics" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {metrics.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhuma métrica recente</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Recurso</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tipo</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Métrica</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Valor</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Max</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Utilização</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Quando</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => {
                  const util = m.utilization_pct;
                  const color = util != null ? (util >= 90 ? COLORS.red : util >= 70 ? COLORS.amber : COLORS.green) : COLORS.muted;
                  return (
                    <tr key={m.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td className="px-3 py-2" style={{ color: COLORS.teal }}>{m.resource_name}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${TYPE_COLORS[m.resource_type] ?? COLORS.muted}15`, color: TYPE_COLORS[m.resource_type] ?? COLORS.muted }}>{m.resource_type}</span>
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{m.metric_name}</td>
                      <td className="px-3 py-2" style={{ color: COLORS.text }}>{m.metric_value} {m.metric_unit}</td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{m.max_capacity ?? "—"}</td>
                      <td className="px-3 py-2" style={{ color }}>{formatPct(m.utilization_pct)}</td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(m.collected_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Thresholds */}
      {tab === "thresholds" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {thresholds.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhum threshold configurado</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Recurso</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tipo</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Warning</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Critical</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Ativo</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map((t) => (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${COLORS.border}`, opacity: t.is_active ? 1 : 0.4 }}>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{t.resource_name}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${TYPE_COLORS[t.resource_type] ?? COLORS.muted}15`, color: TYPE_COLORS[t.resource_type] ?? COLORS.muted }}>{t.resource_type}</span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.amber }}>{t.warning_pct}%</td>
                    <td className="px-3 py-2" style={{ color: COLORS.red }}>{t.critical_pct}%</td>
                    <td className="px-3 py-2" style={{ color: t.is_active ? COLORS.green : COLORS.muted }}>{t.is_active ? "✓" : "✕"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => handleDeleteThreshold(t.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Forecast */}
      {tab === "forecast" && (
        <div className="space-y-4 rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {/* Forecast generator */}
          <div className="flex flex-wrap items-end gap-3 pb-4" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <div className="space-y-1">
              <label htmlFor="fc-type" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Tipo</label>
              <select id="fc-type" value={fcType} onChange={(e) => setFcType(e.target.value)} className="rounded-md px-3 py-1.5 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="fc-name" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Recurso</label>
              <input id="fc-name" type="text" value={fcName} onChange={(e) => setFcName(e.target.value)} placeholder="server-01" className="rounded-md px-3 py-1.5 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>
            <div className="space-y-1">
              <label htmlFor="fc-metric" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Métrica</label>
              <input id="fc-metric" type="text" value={fcMetric} onChange={(e) => setFcMetric(e.target.value)} className="rounded-md px-3 py-1.5 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>
            <button onClick={handleGenerateForecast} disabled={!fcName} className="text-[12px] px-3 py-1.5 rounded font-bold disabled:opacity-50" style={{ background: COLORS.purple, color: "#fff", cursor: !fcName ? "not-allowed" : "pointer" }}>
              Gerar Previsão
            </button>
          </div>

          {/* Forecasts list */}
          {forecasts.length === 0 ? (
            <div className="text-center text-sm py-4" style={{ color: COLORS.muted }}>Nenhuma previsão gerada</div>
          ) : (
            <div className="space-y-3">
              {forecasts.map((f) => (
                <div key={f.id} className="p-4 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-bold" style={{ color: COLORS.teal }}>
                      <span style={{ color: TYPE_COLORS[f.resource_type] ?? COLORS.muted }}>{f.resource_type}</span> {f.resource_name}
                      <span style={{ color: COLORS.muted }}> · {f.metric_name}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${CONFIDENCE_COLORS[f.confidence] ?? COLORS.muted}15`, color: CONFIDENCE_COLORS[f.confidence] ?? COLORS.muted }}>
                      {f.confidence} confiança
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-[12px]">
                    <div>
                      <div className="text-[10px] uppercase" style={{ color: COLORS.muted }}>Atual</div>
                      <div style={{ color: COLORS.text }}>{f.current_value.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase" style={{ color: COLORS.muted }}>7d</div>
                      <div style={{ color: f.predicted_value_7d != null ? COLORS.amber : COLORS.muted }}>{f.predicted_value_7d?.toFixed(2) ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase" style={{ color: COLORS.muted }}>30d</div>
                      <div style={{ color: f.predicted_value_30d != null ? COLORS.amber : COLORS.muted }}>{f.predicted_value_30d?.toFixed(2) ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase" style={{ color: COLORS.muted }}>90d</div>
                      <div style={{ color: f.predicted_value_90d != null ? COLORS.red : COLORS.muted }}>{f.predicted_value_90d?.toFixed(2) ?? "—"}</div>
                    </div>
                  </div>
                  {f.days_until_capacity != null && (
                    <div className="mt-2 text-[11px]" style={{ color: f.days_until_capacity <= 30 ? COLORS.red : f.days_until_capacity <= 90 ? COLORS.amber : COLORS.green }}>
                      ⚠ Capacidade máxima em ~{f.days_until_capacity} dias
                    </div>
                  )}
                  <div className="mt-1 text-[10px]" style={{ color: COLORS.muted }}>
                    R² = {f.r_squared.toFixed(3)} · slope = {f.slope.toFixed(4)} · {formatTime(f.generated_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Reports */}
      {tab === "reports" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {reports.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhum relatório gerado</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Nome</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tipo</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Status</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tamanho</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Gerado</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{r.name}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{r.report_type}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: r.status === "completed" ? `var(--status-ok-bg)` : `var(--status-warning-bg)`, color: r.status === "completed" ? COLORS.green : COLORS.amber }}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatBytes(r.file_size_bytes)}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(r.generated_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => handleDeleteReport(r.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Threshold */}
      {showThreshold && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowThreshold(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowThreshold(false); }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-md w-full"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Novo Threshold</h2>
              <button onClick={() => setShowThreshold(false)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="t-type" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Tipo de Recurso</label>
                <select id="t-type" value={tType} onChange={(e) => setTType(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                  {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="t-name" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome do Recurso</label>
                <input id="t-name" type="text" value={tName} onChange={(e) => setTName(e.target.value)} placeholder="server-01" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="t-warn" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Warning (%)</label>
                  <input id="t-warn" type="number" value={tWarn} onChange={(e) => setTWarn(parseInt(e.target.value, 10) || 70)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="t-crit" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Critical (%)</label>
                  <input id="t-crit" type="number" value={tCrit} onChange={(e) => setTCrit(parseInt(e.target.value, 10) || 90)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <button onClick={handleCreateThreshold} disabled={!tName} className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: COLORS.teal, color: COLORS.bg, cursor: !tName ? "not-allowed" : "pointer" }}>
                Criar Threshold
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Report */}
      {showReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowReport(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowReport(false); }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-md w-full"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Novo Relatório</h2>
              <button onClick={() => setShowReport(false)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="r-name" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome</label>
                <input id="r-name" type="text" value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Relatório Semanal de Capacidade" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="r-type" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Tipo</label>
                <select id="r-type" value={rType} onChange={(e) => setRType(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                  {REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={rScheduled} onChange={(e) => setRScheduled(e.target.checked)} />
                Agendado (cron)
              </label>
              {rScheduled && (
                <div className="space-y-1">
                  <label htmlFor="r-cron" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Cron Expression</label>
                  <input id="r-cron" type="text" value={rCron} onChange={(e) => setRCron(e.target.value)} placeholder="0 8 * * 1" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              )}
              <button onClick={handleCreateReport} disabled={!rName} className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: COLORS.teal, color: COLORS.bg, cursor: !rName ? "not-allowed" : "pointer" }}>
                Gerar Relatório
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
