"use client";

import { useState, useMemo } from "react";
import {
  Activity,
  Server,
  HardDrive,
  ShieldCheck,
  Ticket,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
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

interface HealthBreakdown {
  dimension: string;
  label: string;
  score: number;
  weight: number;
  details: Record<string, unknown>;
}

interface HealthScoreData {
  score: number;
  grade: string;
  status: string;
  breakdown: HealthBreakdown[];
  calculated_at: string;
}

const DIMENSION_ICONS: Record<string, React.ReactNode> = {
  device_uptime: <Server size={16} />,
  backups: <HardDrive size={16} />,
  ssl_certs: <ShieldCheck size={16} />,
  health_checks: <Activity size={16} />,
  critical_tickets: <Ticket size={16} />,
  incidents: <AlertTriangle size={16} />,
  compliance: <CheckCircle2 size={16} />,
};

function scoreColor(score: number): string {
  if (score >= 90) return COLORS.green;
  if (score >= 75) return COLORS.teal;
  if (score >= 60) return COLORS.amber;
  if (score >= 40) return COLORS.red;
  return COLORS.red;
}

function gradeColor(grade: string): string {
  if (grade === "A") return COLORS.green;
  if (grade === "B") return COLORS.teal;
  if (grade === "C") return COLORS.amber;
  if (grade === "D") return COLORS.red;
  return COLORS.red;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    excellent: "Excelente",
    good: "Bom",
    fair: "Razoável",
    poor: "Ruim",
    critical: "Crítico",
  };
  return labels[status] ?? status;
}

function CircularProgress({ score, grade }: { score: number; grade: string }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
      <svg width="180" height="180" className="-rotate-90">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="var(--border-default)" strokeWidth="8" />
        <circle
          cx="90" cy="90" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-bold" style={{ color }}>{score}</span>
        <span className="text-lg font-bold" style={{ color: gradeColor(grade) }}>{grade}</span>
      </div>
    </div>
  );
}

function DimensionBar({ item }: { item: HealthBreakdown }) {
  const color = scoreColor(item.score);
  const weightPct = Math.round(item.weight * 100);

  return (
    <div className="rounded-lg p-4" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span style={{ color: COLORS.muted }}>{DIMENSION_ICONS[item.dimension] ?? <Activity size={16} />}</span>
          <span className="text-[13px] font-bold" style={{ color: COLORS.text }}>{item.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px]" style={{ color: COLORS.muted }}>Peso: {weightPct}%</span>
          <span className="text-lg font-bold" style={{ color }}>{item.score}</span>
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border-default)" }}>
        <div className="h-full rounded-full" style={{ width: `${item.score}%`, background: color, transition: "width 0.6s ease" }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(item.details).map(([key, value]) => (
          <span key={key} className="text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--surface-1)", color: COLORS.muted }}>
            {key}: <strong style={{ color: COLORS.text }}>{String(value)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HealthScorePage() {
  const { data, isLoading, progress, mutate } = useApi<HealthScoreData>("/api/v1/system-health/score");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setTimeout(() => setRefreshing(false), 500);
  };

  const sortedBreakdown = useMemo(() => {
    if (!data?.breakdown) return [];
    return [...data.breakdown].sort((a, b) => b.weight - a.weight);
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.bg, color: COLORS.muted }}>
        <RefreshCw size={24} className="animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.bg, color: COLORS.muted }}>
        <div className="text-center">
          <XCircle size={32} className="mx-auto mb-2" />
          <p className="text-sm">Não foi possível carregar o Health Score</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}><Activity size={18} className="inline mr-1" /> Health Score</h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>Score agregado de saúde do sistema · 7 dimensões ponderadas</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: `${COLORS.teal}15`, border: `1px solid ${COLORS.teal}`, color: COLORS.teal, cursor: refreshing ? "not-allowed" : "pointer", opacity: refreshing ? 0.5 : 1 }}>
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Atualizar
        </button>
      </div>

      {/* Score Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Score Circular */}
        <div className="rounded-xl p-6 flex flex-col items-center justify-center" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <CircularProgress score={data.score} grade={data.grade} />
          <div className="mt-4 text-center">
            <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>Status</div>
            <div className="text-sm font-bold" style={{ color: scoreColor(data.score) }}>{statusLabel(data.status)}</div>
          </div>
          <div className="mt-2 text-[10px]" style={{ color: COLORS.muted }}>
            Calculado em {new Date(data.calculated_at).toLocaleString("pt-BR")}
          </div>
        </div>

        {/* Resumo Rápido */}
        <div className="lg:col-span-2 rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <h3 className="text-[10px] font-bold uppercase mb-4" style={{ color: COLORS.muted }}>Resumo das Dimensões</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {sortedBreakdown.map((item) => {
              const color = scoreColor(item.score);
              return (
                <div key={item.dimension} className="rounded-lg p-3" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  <div className="flex items-center gap-1 mb-1">
                    <span style={{ color: COLORS.muted }}>{DIMENSION_ICONS[item.dimension] ?? <Activity size={12} />}</span>
                    <span className="text-[10px] font-bold" style={{ color: COLORS.muted }}>{item.label}</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color }}>{item.score}</div>
                  <div className="text-[9px]" style={{ color: COLORS.muted }}>Peso: {Math.round(item.weight * 100)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Breakdown Detalhado */}
      <div className="rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <h3 className="text-[10px] font-bold uppercase mb-4" style={{ color: COLORS.muted }}>Breakdown por Dimensão</h3>
        <div className="space-y-3">
          {sortedBreakdown.map((item) => (
            <DimensionBar key={item.dimension} item={item} />
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div className="rounded-xl p-4 flex items-center gap-6 flex-wrap" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <span className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Legenda:</span>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ background: COLORS.green }} /><span className="text-[10px]" style={{ color: COLORS.muted }}>≥ 90 Excelente</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ background: COLORS.teal }} /><span className="text-[10px]" style={{ color: COLORS.muted }}>≥ 75 Bom</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ background: COLORS.amber }} /><span className="text-[10px]" style={{ color: COLORS.muted }}>≥ 60 Razoável</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ background: COLORS.red }} /><span className="text-[10px]" style={{ color: COLORS.muted }}>&lt; 60 Ruim/Crítico</span></div>
      </div>
    </div>
  );
}
