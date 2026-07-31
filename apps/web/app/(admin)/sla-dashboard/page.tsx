"use client";

import { useState } from "react";
import {
  Gauge,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Server,
  Loader2,
  RefreshCw,
  Lock,
} from "lucide-react";
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
};

interface SLADashboard {
  period: { start: string; end: string };
  aggregate: {
    weighted_sla_percentage: string;
    total_services: string;
    operational: string;
    degraded: string;
    down: string;
    maintenance: string;
  };
  incidents: {
    total: string;
    resolved: string;
    open: string;
    avg_mttr_minutes: string;
    max_mttr_minutes: string;
  };
  services: Array<{
    id: string;
    name: string;
    service_type: string;
    status: string;
    sla_target_percentage: string;
    priority: string;
    current_uptime: string;
    current_incident_count: string;
  }>;
  trend: Array<{
    date: string;
    avg_uptime: string;
    max_uptime: string;
    min_uptime: string;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  operational: COLORS.green,
  degraded: COLORS.amber,
  down: COLORS.red,
  maintenance: COLORS.blue,
};

const PRIORITY_WEIGHTS: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 1 };

const num = (v: string | undefined): number => parseFloat(v ?? "0");
const numInt = (v: string | undefined): number => parseInt(v ?? "0", 10);

function formatMinutes(mins: number): string {
  if (mins < 1) return "< 1min";
  if (mins < 60) return `${Math.round(mins)}min`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${Math.round(mins % 60)}min`;
}

function slaColorPct(sla: number, target: number): string {
  if (sla >= target) return COLORS.green;
  if (sla >= target - 0.5) return COLORS.amber;
  return COLORS.red;
}

export default function SLADashboardPage() {
  const { data, error, isLoading, progress, mutate } = useApi<{ data: SLADashboard; cached: boolean }>("/api/v1/sla/dashboard");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    mutate().finally(() => setRefreshing(false));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace" }}>
        <Loader2 size={24} className="animate-spin" style={{ color: COLORS.teal }} />
      </div>
    );
  }

  if (error) {
    const isModuleDisabled = typeof error === "string" && (error.includes("MODULE_DISABLED") || error.includes("não está ativado"));
    return (
      <div className="min-h-screen p-6 flex items-center justify-center" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
        <div className="text-center max-w-md">
          <Lock size={32} className="mx-auto mb-3" style={{ color: COLORS.muted }} />
          <h2 className="text-sm font-bold mb-2" style={{ color: COLORS.text }}>Módulo SLA Dashboard Desativado</h2>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            {isModuleDisabled
              ? "Este módulo não está ativado para o seu tenant. Solicite ao administrador a ativação via feature flag \"sla_dashboard_enabled\"."
              : "Erro ao carregar dashboard. Tente novamente."}
          </p>
        </div>
      </div>
    );
  }

  const dashboard = data?.data;
  if (!dashboard) return null;

  const slaPct = num(dashboard.aggregate.weighted_sla_percentage);
  const totalServices = numInt(dashboard.aggregate.total_services);
  const operational = numInt(dashboard.aggregate.operational);
  const degraded = numInt(dashboard.aggregate.degraded);
  const down = numInt(dashboard.aggregate.down);
  const maintenance = numInt(dashboard.aggregate.maintenance);

  const totalIncidents = numInt(dashboard.incidents.total);
  const openIncidents = numInt(dashboard.incidents.open);
  const avgMttr = num(dashboard.incidents.avg_mttr_minutes);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            <Gauge size={18} className="inline mr-1" /> SLA Dashboard
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            SLA em tempo real · {new Date(dashboard.period.start).toLocaleDateString("pt-BR")} até agora
            {data?.cached && <span className="ml-2" style={{ color: COLORS.amber }}>(cached)</span>}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2"
          style={{ background: `${COLORS.teal}15`, border: `1px solid ${COLORS.teal}`, color: COLORS.teal, cursor: "pointer", opacity: refreshing ? 0.5 : 1 }}
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Atualizar
        </button>
      </div>

      {/* SLA Score Principal */}
      <div className="rounded-xl p-6 flex items-center gap-8" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="flex flex-col items-center">
          <div
            className="text-5xl font-bold"
            style={{ color: slaPct >= 99.5 ? COLORS.green : slaPct >= 98 ? COLORS.amber : COLORS.red }}
          >
            {slaPct.toFixed(2)}%
          </div>
          <div className="text-[10px] font-bold uppercase mt-1" style={{ color: COLORS.muted }}>SLA Agregado (Ponderado)</div>
        </div>
        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Serviços" value={totalServices} color={COLORS.text} icon={<Server size={12} />} />
          <MiniStat label="Operacionais" value={operational} color={COLORS.green} icon={<CheckCircle2 size={12} />} />
          <MiniStat label="Degradados" value={degraded} color={COLORS.amber} icon={<AlertTriangle size={12} />} />
          <MiniStat label="Down" value={down} color={COLORS.red} icon={<XCircle size={12} />} />
        </div>
      </div>

      {/* Incident Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Incidentes no Mês" value={totalIncidents} color={COLORS.text} icon={<AlertTriangle size={14} />} />
        <StatCard label="Incidentes Abertos" value={openIncidents} color={openIncidents > 0 ? COLORS.red : COLORS.green} icon={<Activity size={14} />} />
        <StatCard label="MTTR Médio" value={formatMinutes(avgMttr)} color={COLORS.teal} icon={<Clock size={14} />} isString />
        <StatCard label="MTTR Máximo" value={formatMinutes(num(dashboard.incidents.max_mttr_minutes))} color={COLORS.amber} icon={<TrendingUp size={14} />} isString />
      </div>

      {/* Trend Chart */}
      {dashboard.trend.length > 0 && (
        <div className="rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <h3 className="text-[10px] font-bold uppercase mb-4" style={{ color: COLORS.muted }}>Tendência de SLA (Últimos 7 dias)</h3>
          <div className="flex items-end gap-2 h-32">
            {dashboard.trend.map((t, i) => {
              const avg = num(t.avg_uptime);
              const heightPct = Math.max(((avg - 95) / 5) * 100, 5);
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }}>
                  <div className="text-[9px] mb-1" style={{ color: COLORS.muted }}>{avg.toFixed(2)}%</div>
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${heightPct}%`,
                      background: avg >= 99.5 ? COLORS.green : avg >= 98 ? COLORS.amber : COLORS.red,
                      minHeight: "4px",
                    }}
                  />
                  <div className="text-[9px] mt-1" style={{ color: COLORS.muted }}>
                    {new Date(t.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Services Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
          <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>SLA por Serviço</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ background: "var(--surface-1)" }}>
                <th className="text-left p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Serviço</th>
                <th className="text-left p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tipo</th>
                <th className="text-left p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Prioridade</th>
                <th className="text-left p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Status</th>
                <th className="text-right p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>SLA Atual</th>
                <th className="text-right p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Target</th>
                <th className="text-right p-3 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Incidents</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.services.map((s) => {
                const currentUptime = num(s.current_uptime);
                const target = num(s.sla_target_percentage);
                const incidentCount = numInt(s.current_incident_count);
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td className="p-3 font-bold" style={{ color: COLORS.text }}>{s.name}</td>
                    <td className="p-3" style={{ color: COLORS.muted }}>{s.service_type}</td>
                    <td className="p-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${COLORS.muted}15`, color: COLORS.muted }}>
                        {s.priority}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLORS[s.status] ?? COLORS.muted}15`, color: STATUS_COLORS[s.status] ?? COLORS.muted }}>
                        {s.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold" style={{ color: slaPct >= target ? COLORS.green : COLORS.red }}>
                      {currentUptime.toFixed(2)}%
                    </td>
                    <td className="p-3 text-right" style={{ color: COLORS.muted }}>{target.toFixed(2)}%</td>
                    <td className="p-3 text-right" style={{ color: COLORS.muted }}>{incidentCount > 0 ? incidentCount : "—"}</td>
                  </tr>
                );
              })}
              {dashboard.services.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center" style={{ color: COLORS.muted }}>Nenhum serviço cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="text-[10px] font-bold uppercase flex items-center gap-1" style={{ color: COLORS.muted }}>{icon} {label}</div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, color, icon, isString }: { label: string; value: number | string; color: string; icon: React.ReactNode; isString?: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
      <div className="text-[10px] font-bold uppercase mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>{icon} {label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{isString ? value : value}</div>
    </div>
  );
}
