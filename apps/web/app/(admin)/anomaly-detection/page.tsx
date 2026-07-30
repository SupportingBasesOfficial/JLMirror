"use client";

import { useState, useCallback } from "react";
import {
  Brain,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Check,
  RefreshCw,
  Server,
  TrendingUp,
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

interface AnomalyDetection {
  id: string;
  device_id: string;
  device_hostname: string;
  metric_name: string;
  algorithm: string;
  observed_value: number;
  expected_value: number;
  deviation_score: number;
  threshold_low: number | null;
  threshold_high: number | null;
  severity: string;
  status: string;
  window_size: number;
  detected_at: string;
}

interface AnomalyStats {
  total: number;
  open: number;
  critical: number;
  false_positives: number;
  recent_24h: number;
  by_algorithm: Array<Record<string, unknown>>;
}

const SEVERITY_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  critical: { color: COLORS.red, icon: <XCircle size={12} /> },
  warning: { color: COLORS.amber, icon: <AlertTriangle size={12} /> },
  info: { color: COLORS.blue, icon: <Activity size={12} /> },
};

export default function AnomalyDetectionPage() {
  const { data: statsData, mutate: mutateStats } = useApi<AnomalyStats>("/api/v1/anomaly/stats");
  const { data: detectionsData, mutate: mutateDetections } = useApi<{ detections: AnomalyDetection[] }>("/api/v1/anomaly/detections?status=open&limit=30");

  const [error] = useState<string | null>(null);
  const [success] = useState<string | null>(null);

  const stats = statsData;
  const detections = detectionsData?.detections ?? [];

  const handleAcknowledge = useCallback(async (id: string) => {
    await fetch(`/api/v1/anomaly/detections/${id}/acknowledge`, { method: "PUT", credentials: "include" });
    mutateDetections();
    mutateStats();
  }, [mutateDetections, mutateStats]);

  const handleResolve = useCallback(async (id: string) => {
    await fetch(`/api/v1/anomaly/detections/${id}/resolve`, { method: "PUT", credentials: "include" });
    mutateDetections();
    mutateStats();
  }, [mutateDetections, mutateStats]);

  const handleFalsePositive = useCallback(async (id: string) => {
    await fetch(`/api/v1/anomaly/detections/${id}/false-positive`, { method: "PUT", credentials: "include" });
    mutateDetections();
    mutateStats();
  }, [mutateDetections, mutateStats]);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            <Brain size={18} className="inline mr-1" /> AI Anomaly Detection
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Detecção estatística · Z-score · IQR · EWMA
          </p>
        </div>
        <button onClick={() => { mutateStats(); mutateDetections(); }} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: COLORS.red }}>{error}</div>}
      {success && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-ok-bg)", border: "1px solid var(--status-ok-border)", color: COLORS.green }}>{success}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} color={COLORS.text} icon={<Activity size={14} />} />
          <StatCard label="Abertas" value={stats.open} color={COLORS.amber} icon={<AlertTriangle size={14} />} />
          <StatCard label="Críticas" value={stats.critical} color={COLORS.red} icon={<XCircle size={14} />} />
          <StatCard label="Falsos Positivos" value={stats.false_positives} color={COLORS.muted} icon={<CheckCircle2 size={14} />} />
          <StatCard label="Últimas 24h" value={stats.recent_24h} color={COLORS.blue} icon={<TrendingUp size={14} />} />
        </div>
      )}

      {/* Algorithm Distribution */}
      {stats && stats.by_algorithm.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <h3 className="text-[10px] font-bold uppercase mb-3" style={{ color: COLORS.muted }}>Distribuição por Algoritmo</h3>
          <div className="flex items-center gap-4 flex-wrap">
            {stats.by_algorithm.map((alg: Record<string, unknown>) => (
              <div key={alg.algorithm as string} className="flex items-center gap-2">
                <span className="px-3 py-1 rounded text-[11px] font-bold" style={{ background: `${COLORS.teal}15`, color: COLORS.teal }}>
                  {alg.algorithm as string}: {alg.count as string}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detections */}
      <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
          <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Anomalias em Aberto ({detections.length})</h3>
        </div>
        <div className="divide-y" style={{ borderColor: COLORS.border }}>
          {detections.map((det) => {
            const sevConfig = SEVERITY_CONFIG[det.severity] ?? SEVERITY_CONFIG.info;
            return (
              <div key={det.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {sevConfig.icon}
                    <div>
                      <p className="text-[12px] font-bold" style={{ color: COLORS.text }}>
                        {det.metric_name}
                      </p>
                      <p className="text-[10px]" style={{ color: COLORS.muted }}>
                        <Server size={10} className="inline mr-1" />{det.device_hostname} · {det.algorithm} · score: {det.deviation_score.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{ background: `${sevConfig.color}15`, color: sevConfig.color }}>
                      {det.severity}
                    </span>
                    <button onClick={() => handleAcknowledge(det.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.blue}15`, border: `1px solid ${COLORS.blue}`, color: COLORS.blue, cursor: "pointer" }}>
                      <Eye size={10} /> ACK
                    </button>
                    <button onClick={() => handleResolve(det.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.green}15`, border: `1px solid ${COLORS.green}`, color: COLORS.green, cursor: "pointer" }}>
                      <Check size={10} /> Resolver
                    </button>
                    <button onClick={() => handleFalsePositive(det.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
                      Falso +
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-[10px]" style={{ color: COLORS.muted }}>
                  <div>
                    <span style={{ color: COLORS.red }}>Observado:</span> {det.observed_value.toFixed(2)}
                  </div>
                  <div>
                    <span style={{ color: COLORS.green }}>Esperado:</span> {det.expected_value.toFixed(2)}
                  </div>
                  <div>
                    <span>Limite inf:</span> {det.threshold_low?.toFixed(2) ?? "—"}
                  </div>
                  <div>
                    <span>Limite sup:</span> {det.threshold_high?.toFixed(2) ?? "—"}
                  </div>
                </div>
                <p className="text-[10px] mt-1" style={{ color: COLORS.muted }}>
                  Detectado: {new Date(det.detected_at).toLocaleString("pt-BR")} · Janela: {det.window_size} amostras
                </p>
              </div>
            );
          })}
          {detections.length === 0 && (
            <div className="p-6 text-center">
              <CheckCircle2 size={24} className="mx-auto mb-2" style={{ color: COLORS.green }} />
              <p className="text-[12px]" style={{ color: COLORS.muted }}>Nenhuma anomalia em aberto</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
      <div className="text-[10px] font-bold uppercase mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        {icon} {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
