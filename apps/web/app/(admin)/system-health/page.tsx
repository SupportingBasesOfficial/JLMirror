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

const SERVICE_TYPES = ["database", "redis", "api", "zabbix", "smtp", "dns", "webhook", "external_api", "filesystem", "queue", "custom"];
const SEVERITIES = ["info", "warning", "major", "critical", "maintenance"];
const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved", "scheduled"];

const STATUS_COLORS: Record<string, string> = {
  healthy: COLORS.green, degraded: COLORS.amber, down: COLORS.red, unknown: COLORS.muted,
};

const SEVERITY_COLORS: Record<string, string> = {
  info: COLORS.blue, warning: COLORS.amber, major: COLORS.red, critical: COLORS.red, maintenance: COLORS.purple,
};

const INCIDENT_STATUS_COLORS: Record<string, string> = {
  investigating: COLORS.red, identified: COLORS.amber, monitoring: COLORS.blue, resolved: COLORS.green, scheduled: COLORS.purple,
};

interface HealthCheck {
  id: string;
  name: string;
  service_type: string;
  endpoint: string | null;
  check_interval_seconds: number;
  timeout_seconds: number;
  is_active: boolean;
  last_check_at: string | null;
  last_status: string | null;
  last_response_time_ms: number | null;
  last_error: string | null;
  consecutive_failures: number;
  consecutive_successes: number;
}

interface Incident {
  id: string;
  incident_number: string;
  health_check_name: string | null;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  affected_services: string[];
  root_cause: string | null;
  resolution_notes: string | null;
  started_at: string;
  resolved_at: string | null;
  duration_mins: number | null;
  impact: string | null;
}

interface Diagnostics {
  database: {
    healthy: boolean;
    server_time: string | null;
    pg_version: string | null;
    table_count: string;
    db_size: string;
    active_connections: string;
  };
  checks: { total_checks: string; healthy: string; degraded: string; down: string; unknown: string; avg_response_ms: string | null };
  active_incidents: { severity: string; count: string }[];
  latest_metrics: { metric_name: string; metric_type: string; value: number; unit: string; status: string; captured_at: string }[];
  runtime: { node_version: string; platform: string; uptime_seconds: number; memory_usage_mb: number; memory_total_mb: number };
}

interface HealthStats {
  overview: { total_checks: string; healthy: string; degraded: string; down: string; avg_response_ms: string | null };
  incidents: { active_incidents: string; resolved_incidents: string; critical_active: string; major_active: string; avg_duration_mins: string | null; total_incidents: string };
  by_service: { service_type: string; total: string; healthy: string; unhealthy: string }[];
  recent_incidents: { id: string; incident_number: string; title: string; severity: string; status: string; started_at: string; resolved_at: string | null; duration_mins: number | null }[];
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatUptime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}

export default function SystemHealthPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "checks" | "incidents" | "diagnostics">("overview");
  const [showCheck, setShowCheck] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");

  // Check form
  const [cName, setCName] = useState("");
  const [cType, setCType] = useState("api");
  const [cEndpoint, setCEndpoint] = useState("");
  const [cInterval, setCInterval] = useState(60);
  const [cTimeout, setCTimeout] = useState(10);

  // Incident form
  const [iTitle, setITitle] = useState("");
  const [iDesc, setIDesc] = useState("");
  const [iSeverity, setISeverity] = useState("warning");
  const [iServices, setIServices] = useState("");

  const incidentsQuery = (() => {
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterSeverity) params.set("severity", filterSeverity);
    const qs = params.toString();
    return qs ? `/api/system-health/incidents?${qs}` : "/api/system-health/incidents";
  })();
  const { data: chkData, isLoading: loading, mutate: mutateChecks } = useApi<{ checks: HealthCheck[] }>("/api/system-health/checks");
  const { data: incData, mutate: mutateIncidents } = useApi<{ incidents: Incident[] }>(incidentsQuery);
  const { data: stats, mutate: mutateStats } = useApi<HealthStats>("/api/system-health/stats");
  const { data: diagnostics, mutate: mutateDiagnostics } = useApi<Diagnostics>("/api/system-health/diagnostics");
  const checks = chkData?.checks ?? [];
  const incidents = incData?.incidents ?? [];

  async function handleCreateCheck() {
    setError(null);
    try {
      const res = await fetch("/api/system-health/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: cName, service_type: cType, endpoint: cEndpoint || undefined, check_interval_seconds: cInterval, timeout_seconds: cTimeout, is_active: true }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Erro ao criar check"); return; }
      setSuccess("Health check criado!");
      setShowCheck(false);
      setCName(""); setCEndpoint("");
      mutateChecks(); mutateStats();
    } catch { setError("Erro de conexão"); }
  }

  async function handleRunCheck(checkId: string) {
    try {
      const res = await fetch(`/api/system-health/checks/${checkId}/run`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Check executado: ${data.status} (${data.response_time_ms}ms)`);
        mutateChecks(); mutateIncidents(); mutateStats();
      }
    } catch { /* Ignora */ }
  }

  async function handleDeleteCheck(id: string) {
    try {
      const res = await fetch(`/api/system-health/checks/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { mutateChecks(); mutateStats(); }
    } catch { /* Ignora */ }
  }

  async function handleCreateIncident() {
    setError(null);
    try {
      const services = iServices.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/system-health/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: iTitle, description: iDesc || undefined, severity: iSeverity, affected_services: services }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Erro ao criar incidente"); return; }
      setSuccess(`Incidente ${data.incident_number} criado!`);
      setShowIncident(false);
      setITitle(""); setIDesc(""); setIServices("");
      mutateIncidents(); mutateStats();
    } catch { setError("Erro de conexão"); }
  }

  async function handleUpdateIncident(incidentId: string, status: string) {
    try {
      const res = await fetch(`/api/system-health/incidents/${incidentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (res.ok) { mutateIncidents(); mutateStats(); }
    } catch { /* Ignora */ }
  }

  if (!chkData && !incData && !stats) return <LoadingState label="Carregando system health..." />;

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            System Health — Diagnóstico & Incidentes
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Health Checks · Incidentes · Métricas · Diagnóstico de Serviços
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "checks" && (
            <button onClick={() => setShowCheck(true)} className="text-[12px] px-3 py-1.5 rounded font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}><Plus size={12} className="inline" /> Check</button>
          )}
          {tab === "incidents" && (
            <button onClick={() => setShowIncident(true)} className="text-[12px] px-3 py-1.5 rounded font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}><Plus size={12} className="inline" /> Incidente</button>
          )}
          <button onClick={() => { mutateChecks(); mutateIncidents(); mutateStats(); mutateDiagnostics(); }} className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}>
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
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Serviços</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>{stats.overview.total_checks}</div>
            <div className="text-[10px]" style={{ color: COLORS.green }}>{stats.overview.healthy} saudáveis</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-warning-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Degradados</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>{stats.overview.degraded}</div>
            <div className="text-[10px]" style={{ color: COLORS.red }}>{stats.overview.down} down</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-error-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Incidentes Ativos</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.red }}>{stats.incidents.active_incidents}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.incidents.critical_active} críticos</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-info-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Resolvidos</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>{stats.incidents.resolved_incidents}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>Duração média: {stats.incidents.avg_duration_mins ? `${parseFloat(stats.incidents.avg_duration_mins).toFixed(0)}m` : "—"}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {([
          { key: "overview", label: "Overview" },
          { key: "checks", label: `Checks (${checks.length})` },
          { key: "incidents", label: `Incidentes (${incidents.length})` },
          { key: "diagnostics", label: "Diagnóstico" },
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
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>SERVIÇOS POR TIPO</h3>
            <div className="space-y-2">
              {stats.by_service.map((row) => {
                const total = parseInt(row.total, 10);
                const healthy = parseInt(row.healthy, 10);
                const healthyPct = total > 0 ? (healthy / total) * 100 : 0;
                return (
                  <div key={row.service_type} className="flex items-center gap-3">
                    <span className="text-[12px] w-28" style={{ color: COLORS.text }}>{row.service_type}</span>
                    <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: COLORS.bg }}>
                      <div className="h-full" style={{ width: `${healthyPct}%`, background: COLORS.green }} />
                    </div>
                    <span className="text-[12px] w-24 text-right" style={{ color: COLORS.muted }}>
                      {healthy}/{total} saudáveis
                    </span>
                  </div>
                );
              })}
              {stats.by_service.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Sem dados</div>}
            </div>
          </div>

          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>INCIDENTES RECENTES</h3>
            <div className="space-y-1">
              {stats.recent_incidents.map((inc) => (
                <div key={inc.id} className="flex items-center justify-between text-[12px] py-1" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <span style={{ color: COLORS.muted }}>{inc.incident_number}</span>
                  <span className="flex-1 ml-3 truncate" style={{ color: COLORS.text }}>{inc.title}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase ml-2" style={{ background: `${SEVERITY_COLORS[inc.severity] ?? COLORS.muted}15`, color: SEVERITY_COLORS[inc.severity] ?? COLORS.muted }}>{inc.severity}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase ml-2" style={{ background: `${INCIDENT_STATUS_COLORS[inc.status] ?? COLORS.muted}15`, color: INCIDENT_STATUS_COLORS[inc.status] ?? COLORS.muted }}>{inc.status}</span>
                  <span className="ml-3" style={{ color: COLORS.muted }}>{formatTime(inc.started_at)}</span>
                </div>
              ))}
              {stats.recent_incidents.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum incidente</div>}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Checks */}
      {tab === "checks" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {checks.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhum health check configurado</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Nome</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tipo</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Status</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Resposta</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Falhas</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Último check</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                </tr>
              </thead>
              <tbody>
                {checks.map((chk) => (
                  <tr key={chk.id} style={{ borderBottom: `1px solid ${COLORS.border}`, opacity: chk.is_active ? 1 : 0.4 }}>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{chk.name}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{chk.service_type}</td>
                    <td className="px-3 py-2">
                      {chk.last_status && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLORS[chk.last_status] ?? COLORS.muted}15`, color: STATUS_COLORS[chk.last_status] ?? COLORS.muted }}>
                          {chk.last_status}
                        </span>
                      )}
                      {!chk.last_status && <span style={{ color: COLORS.muted }}>—</span>}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{chk.last_response_time_ms != null ? `${chk.last_response_time_ms}ms` : "—"}</td>
                    <td className="px-3 py-2" style={{ color: chk.consecutive_failures > 0 ? COLORS.red : COLORS.muted }}>{chk.consecutive_failures}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(chk.last_check_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleRunCheck(chk.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`, border: `1px solid var(--status-info-border)`, color: COLORS.blue, cursor: "pointer" }}>Run</button>
                        <button onClick={() => handleDeleteCheck(chk.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Incidents */}
      {tab === "incidents" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 items-end">
            <div className="space-y-1">
              <label htmlFor="i-fs" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Status</label>
              <select id="i-fs" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md px-3 py-1.5 text-[12px]" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                <option value="">Todos</option>
                {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="i-fsev" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Severidade</label>
              <select id="i-fsev" value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} className="rounded-md px-3 py-1.5 text-[12px]" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                <option value="">Todas</option>
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            {incidents.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhum incidente encontrado</div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Nº</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Título</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Severidade</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Status</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Início</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Duração</th>
                    <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((inc) => (
                    <tr key={inc.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{inc.incident_number}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: COLORS.teal }}>{inc.title}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${SEVERITY_COLORS[inc.severity] ?? COLORS.muted}15`, color: SEVERITY_COLORS[inc.severity] ?? COLORS.muted }}>
                          {inc.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${INCIDENT_STATUS_COLORS[inc.status] ?? COLORS.muted}15`, color: INCIDENT_STATUS_COLORS[inc.status] ?? COLORS.muted }}>
                          {inc.status}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(inc.started_at)}</td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{inc.duration_mins != null ? `${inc.duration_mins.toFixed(0)}m` : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {inc.status !== "resolved" && (
                          <div className="flex gap-1 justify-end">
                            {inc.status === "investigating" && (
                              <button onClick={() => handleUpdateIncident(inc.id, "identified")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-warning-text) 12%, transparent)`, border: `1px solid var(--status-warning-border)`, color: COLORS.amber, cursor: "pointer" }}>Identified</button>
                            )}
                            {inc.status === "identified" && (
                              <button onClick={() => handleUpdateIncident(inc.id, "monitoring")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`, border: `1px solid var(--status-info-border)`, color: COLORS.blue, cursor: "pointer" }}>Monitor</button>
                            )}
                            <button onClick={() => handleUpdateIncident(inc.id, "resolved")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-ok-text) 12%, transparent)`, border: `1px solid var(--status-ok-border)`, color: COLORS.green, cursor: "pointer" }}>Resolve</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab: Diagnostics */}
      {tab === "diagnostics" && diagnostics && (
        <div className="space-y-4 rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {/* Database */}
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>BANCO DE DADOS</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
              <div className="flex justify-between p-2 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.muted }}>Status:</span>
                <span style={{ color: diagnostics.database.healthy ? COLORS.green : COLORS.red }}>{diagnostics.database.healthy ? "✓ Healthy" : "✕ Down"}</span>
              </div>
              <div className="flex justify-between p-2 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.muted }}>Tabelas:</span>
                <span style={{ color: COLORS.text }}>{diagnostics.database.table_count}</span>
              </div>
              <div className="flex justify-between p-2 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.muted }}>Tamanho:</span>
                <span style={{ color: COLORS.text }}>{diagnostics.database.db_size}</span>
              </div>
              <div className="flex justify-between p-2 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.muted }}>Conexões:</span>
                <span style={{ color: COLORS.text }}>{diagnostics.database.active_connections}</span>
              </div>
              <div className="flex justify-between p-2 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.muted }}>Versão PG:</span>
                <span className="truncate ml-2" style={{ color: COLORS.text }}>{diagnostics.database.pg_version?.split(" ").slice(0, 2).join(" ") ?? "—"}</span>
              </div>
              <div className="flex justify-between p-2 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.muted }}>Server time:</span>
                <span style={{ color: COLORS.text }}>{formatTime(diagnostics.database.server_time)}</span>
              </div>
            </div>
          </div>

          {/* Runtime */}
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>RUNTIME (Node.js)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
              <div className="flex justify-between p-2 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.muted }}>Node:</span>
                <span style={{ color: COLORS.text }}>{diagnostics.runtime.node_version}</span>
              </div>
              <div className="flex justify-between p-2 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.muted }}>Platform:</span>
                <span style={{ color: COLORS.text }}>{diagnostics.runtime.platform}</span>
              </div>
              <div className="flex justify-between p-2 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.muted }}>Uptime:</span>
                <span style={{ color: COLORS.text }}>{formatUptime(diagnostics.runtime.uptime_seconds)}</span>
              </div>
              <div className="flex justify-between p-2 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.muted }}>Heap usado:</span>
                <span style={{ color: COLORS.text }}>{diagnostics.runtime.memory_usage_mb}MB</span>
              </div>
              <div className="flex justify-between p-2 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.muted }}>Heap total:</span>
                <span style={{ color: COLORS.text }}>{diagnostics.runtime.memory_total_mb}MB</span>
              </div>
            </div>
          </div>

          {/* Latest metrics */}
          {diagnostics.latest_metrics.length > 0 && (
            <div>
              <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>MÉTRICAS RECENTES</h3>
              <div className="space-y-1">
                {diagnostics.latest_metrics.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-[12px] py-1" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <span style={{ color: COLORS.teal }}>{m.metric_name}</span>
                    <span style={{ color: COLORS.muted }}>{m.metric_type}</span>
                    <span style={{ color: m.status === "healthy" ? COLORS.green : m.status === "warning" ? COLORS.amber : COLORS.red }}>
                      {m.value.toFixed(1)}{m.unit}
                    </span>
                    <span style={{ color: COLORS.muted }}>{formatTime(m.captured_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active incidents summary */}
          {diagnostics.active_incidents.length > 0 && (
            <div>
              <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>INCIDENTES ATIVOS</h3>
              <div className="flex gap-3">
                {diagnostics.active_incidents.map((inc, i) => (
                  <div key={i} className="p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${SEVERITY_COLORS[inc.severity] ?? COLORS.muted}44` }}>
                    <span className="text-[10px] uppercase" style={{ color: COLORS.muted }}>{inc.severity}</span>
                    <div className="text-xl font-bold" style={{ color: SEVERITY_COLORS[inc.severity] ?? COLORS.muted }}>{inc.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Create check */}
      {showCheck && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowCheck(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowCheck(false); }}
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
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Novo Health Check</h2>
              <button onClick={() => setShowCheck(false)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="hc-n" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome</label>
                <input id="hc-n" type="text" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="API Principal" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="hc-t" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Tipo de Serviço</label>
                  <select id="hc-t" value={cType} onChange={(e) => setCType(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="hc-e" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Endpoint (opcional)</label>
                  <input id="hc-e" type="text" value={cEndpoint} onChange={(e) => setCEndpoint(e.target.value)} placeholder="https://..." className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="hc-i" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Intervalo (s)</label>
                  <input id="hc-i" type="number" value={cInterval} onChange={(e) => setCInterval(parseInt(e.target.value, 10) || 60)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="hc-to" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Timeout (s)</label>
                  <input id="hc-to" type="number" value={cTimeout} onChange={(e) => setCTimeout(parseInt(e.target.value, 10) || 10)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <button onClick={handleCreateCheck} disabled={!cName} className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: COLORS.teal, color: COLORS.bg, cursor: !cName ? "not-allowed" : "pointer" }}>
                Criar Check
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create incident */}
      {showIncident && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowIncident(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowIncident(false); }}
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
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Novo Incidente</h2>
              <button onClick={() => setShowIncident(false)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="in-t" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Título</label>
                <input id="in-t" type="text" value={iTitle} onChange={(e) => setITitle(e.target.value)} placeholder="API indisponível" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="in-d" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Descrição (opcional)</label>
                <textarea id="in-d" value={iDesc} onChange={(e) => setIDesc(e.target.value)} rows={3} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="in-s" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Severidade</label>
                  <select id="in-s" value={iSeverity} onChange={(e) => setISeverity(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="in-sv" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Serviços (vírgula)</label>
                  <input id="in-sv" type="text" value={iServices} onChange={(e) => setIServices(e.target.value)} placeholder="api, database" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <button onClick={handleCreateIncident} disabled={!iTitle} className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: COLORS.teal, color: COLORS.bg, cursor: !iTitle ? "not-allowed" : "pointer" }}>
                Criar Incidente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
