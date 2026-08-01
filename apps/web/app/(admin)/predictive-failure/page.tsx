// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useCallback } from "react";
import {
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Shield,
  Activity,
  RefreshCw,
  Server,
  Clock,
  Target,
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

interface FailurePrediction {
  id: string;
  device_id: string;
  device_hostname: string;
  metric_name: string;
  model_type: string;
  predicted_failure: boolean;
  failure_probability: number;
  estimated_failure_hours: number | null;
  estimated_failure_at: string | null;
  current_value: number;
  predicted_value: number;
  threshold_value: number;
  trend_slope: number | null;
  r_squared: number | null;
  severity: string;
  status: string;
  detected_at: string;
}

interface PredictionStats {
  total: number;
  open: number;
  critical: number;
  occurred: number;
  mitigated: number;
  false_positives: number;
  accuracy: number;
  by_model: Array<Record<string, unknown>>;
}

const SEVERITY_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  critical: { color: COLORS.red, icon: <XCircle size={12} /> },
  warning: { color: COLORS.amber, icon: <AlertTriangle size={12} /> },
  info: { color: COLORS.blue, icon: <Activity size={12} /> },
};

export default function PredictiveFailurePage() {
  const { data: statsData, mutate: mutateStats } = useApi<PredictionStats>("/api/v1/predictions/stats");
  const { data: predictionsData, mutate: mutatePredictions } = useApi<{ predictions: FailurePrediction[] }>("/api/v1/predictions?status=open&limit=30");

  const stats = statsData;
  const predictions = predictionsData?.predictions ?? [];

  const handleAcknowledge = useCallback(async (id: string) => {
    await fetch(`/api/v1/predictions/${id}/acknowledge`, { method: "PUT", credentials: "include" });
    mutatePredictions();
    mutateStats();
  }, [mutatePredictions, mutateStats]);

  const handleMitigate = useCallback(async (id: string) => {
    await fetch(`/api/v1/predictions/${id}/mitigate`, { method: "PUT", credentials: "include" });
    mutatePredictions();
    mutateStats();
  }, [mutatePredictions, mutateStats]);

  const handleOccurred = useCallback(async (id: string) => {
    await fetch(`/api/v1/predictions/${id}/occurred`, { method: "PUT", credentials: "include" });
    mutatePredictions();
    mutateStats();
  }, [mutatePredictions, mutateStats]);

  const handleFalsePositive = useCallback(async (id: string) => {
    await fetch(`/api/v1/predictions/${id}/false-positive`, { method: "PUT", credentials: "include" });
    mutatePredictions();
    mutateStats();
  }, [mutatePredictions, mutateStats]);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            <TrendingDown size={18} className="inline mr-1" /> Predictive Failure
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Linear Trend · Exponential · Moving Average · Threshold Proximity
          </p>
        </div>
        <button onClick={() => { mutateStats(); mutatePredictions(); }} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total" value={stats.total} color={COLORS.text} icon={<Activity size={14} />} />
          <StatCard label="Abertas" value={stats.open} color={COLORS.amber} icon={<AlertTriangle size={14} />} />
          <StatCard label="Críticas" value={stats.critical} color={COLORS.red} icon={<XCircle size={14} />} />
          <StatCard label="Acurácia" value={`${stats.accuracy}%`} color={stats.accuracy > 70 ? COLORS.green : COLORS.amber} icon={<Target size={14} />} />
        </div>
      )}

      {/* Accuracy Detail */}
      {stats && (
        <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Ocorridas</p>
              <p className="text-lg font-bold" style={{ color: COLORS.red }}>{stats.occurred}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Mitigadas</p>
              <p className="text-lg font-bold" style={{ color: COLORS.green }}>{stats.mitigated}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Falsos Positivos</p>
              <p className="text-lg font-bold" style={{ color: COLORS.muted }}>{stats.false_positives}</p>
            </div>
          </div>
        </div>
      )}

      {/* Predictions */}
      <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
          <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Predições em Aberto ({predictions.length})</h3>
        </div>
        <div className="divide-y" style={{ borderColor: COLORS.border }}>
          {predictions.map((pred) => {
            const sevConfig = SEVERITY_CONFIG[pred.severity] ?? SEVERITY_CONFIG.info;
            const probPercent = (pred.failure_probability * 100).toFixed(0);
            return (
              <div key={pred.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {sevConfig.icon}
                    <div>
                      <p className="text-[12px] font-bold" style={{ color: COLORS.text }}>
                        {pred.metric_name}
                      </p>
                      <p className="text-[10px]" style={{ color: COLORS.muted }}>
                        <Server size={10} className="inline mr-1" />{pred.device_hostname} · {pred.model_type}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: `${sevConfig.color}15`, color: sevConfig.color }}>
                      {probPercent}% prob.
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{ background: `${sevConfig.color}15`, color: sevConfig.color }}>
                      {pred.severity}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]" style={{ color: COLORS.muted }}>
                  <div>
                    <span style={{ color: COLORS.text }}>Atual:</span> {pred.current_value.toFixed(2)}
                  </div>
                  <div>
                    <span style={{ color: COLORS.text }}>Predito:</span> {pred.predicted_value.toFixed(2)}
                  </div>
                  <div>
                    <span style={{ color: COLORS.text }}>Threshold:</span> {pred.threshold_value.toFixed(2)}
                  </div>
                  <div>
                    <span style={{ color: COLORS.text }}>Slope:</span> {pred.trend_slope?.toFixed(4) ?? "—"}
                  </div>
                </div>
                {pred.estimated_failure_hours !== null && (
                  <div className="flex items-center gap-2 mt-2 text-[10px]" style={{ color: COLORS.amber }}>
                    <Clock size={10} />
                    Estimativa de falha: ~{pred.estimated_failure_hours}h
                    {pred.estimated_failure_at && ` (${new Date(pred.estimated_failure_at).toLocaleString("pt-BR")})`}
                  </div>
                )}
                {pred.r_squared !== null && (
                  <p className="text-[10px] mt-1" style={{ color: COLORS.muted }}>
                    R² = {pred.r_squared.toFixed(4)} · Detectado: {new Date(pred.detected_at).toLocaleString("pt-BR")}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => handleAcknowledge(pred.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.blue}15`, border: `1px solid ${COLORS.blue}`, color: COLORS.blue, cursor: "pointer" }}>
                    <Eye size={10} /> ACK
                  </button>
                  <button onClick={() => handleMitigate(pred.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.green}15`, border: `1px solid ${COLORS.green}`, color: COLORS.green, cursor: "pointer" }}>
                    <Shield size={10} /> Mitigar
                  </button>
                  <button onClick={() => handleOccurred(pred.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}`, color: COLORS.red, cursor: "pointer" }}>
                    <CheckCircle2 size={10} /> Ocorreu
                  </button>
                  <button onClick={() => handleFalsePositive(pred.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
                    Falso +
                  </button>
                </div>
              </div>
            );
          })}
          {predictions.length === 0 && (
            <div className="p-6 text-center">
              <CheckCircle2 size={24} className="mx-auto mb-2" style={{ color: COLORS.green }} />
              <p className="text-[12px]" style={{ color: COLORS.muted }}>Nenhuma predição de falha em aberto</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number | string; color: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
      <div className="text-[10px] font-bold uppercase mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        {icon} {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
