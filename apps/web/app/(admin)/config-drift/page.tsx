"use client";

import { useState, useCallback } from "react";
import {
  GitCompareArrows,
  Plus,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Server,
  Activity,
  Eye,
  Check,
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

interface DriftStats {
  total_baselines: number;
  open_drifts: number;
  critical_drifts: number;
  recent_drifts_24h: number;
  by_device: Array<{ hostname: string; drift_count: string }>;
}

interface DriftEvent {
  id: string;
  device_id: string;
  device_hostname: string;
  baseline_name: string;
  drift_type: string;
  config_path: string;
  old_value: string | null;
  new_value: string | null;
  severity: string;
  status: string;
  detected_at: string;
}

const DRIFT_ICONS: Record<string, React.ReactNode> = {
  added: <Plus size={10} style={{ color: COLORS.blue }} />,
  removed: <XCircle size={10} style={{ color: COLORS.red }} />,
  modified: <AlertTriangle size={10} style={{ color: COLORS.amber }} />,
};

const inputStyle = {
  background: "var(--surface-1)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  borderRadius: "6px",
  padding: "6px 10px",
  fontSize: "12px",
  width: "100%",
} as const;

export default function ConfigDriftPage() {
  const { data: statsData, mutate: mutateStats } = useApi<DriftStats>("/api/v1/drift/stats");
  const { data: eventsData, mutate: mutateEvents } = useApi<{ events: DriftEvent[] }>("/api/v1/drift/events?status=open&limit=30");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ device_id: "", name: "", config_snapshot: "" });

  const stats = statsData;
  const events = eventsData?.events ?? [];

  const handleCreateBaseline = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      let configSnapshot: Record<string, unknown>;
      try {
        configSnapshot = JSON.parse(form.config_snapshot);
      } catch {
        setError("JSON inválido no config_snapshot");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/v1/drift/baselines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          device_id: form.device_id,
          name: form.name,
          config_snapshot: configSnapshot,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ device_id: "", name: "", config_snapshot: "" });
        mutateStats();
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao criar baseline");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }, [form, mutateStats]);

  const handleResolve = useCallback(async (id: string) => {
    await fetch(`/api/v1/drift/events/${id}/resolve`, { method: "PUT", credentials: "include" });
    mutateEvents();
    mutateStats();
  }, [mutateEvents, mutateStats]);

  const handleAcknowledge = useCallback(async (id: string) => {
    await fetch(`/api/v1/drift/events/${id}/acknowledge`, { method: "PUT", credentials: "include" });
    mutateEvents();
    mutateStats();
  }, [mutateEvents, mutateStats]);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            <GitCompareArrows size={18} className="inline mr-1" /> Config Drift Detection
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Detecta mudanças de configuração vs baseline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { mutateStats(); mutateEvents(); }} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
            <RefreshCw size={12} /> Atualizar
          </button>
          <button onClick={() => setShowForm(!showForm)} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: COLORS.teal, color: "white", cursor: "pointer" }}>
            <Plus size={12} /> Novo Baseline
          </button>
        </div>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: COLORS.red }}>{error}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Baselines" value={stats.total_baselines} color={COLORS.text} icon={<Server size={14} />} />
          <StatCard label="Drifts Abertos" value={stats.open_drifts} color={COLORS.amber} icon={<AlertTriangle size={14} />} />
          <StatCard label="Críticos" value={stats.critical_drifts} color={COLORS.red} icon={<XCircle size={14} />} />
          <StatCard label="Últimas 24h" value={stats.recent_drifts_24h} color={COLORS.blue} icon={<Activity size={14} />} />
        </div>
      )}

      {/* Create Baseline Form */}
      {showForm && (
        <div className="rounded-xl p-6 space-y-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <h3 className="text-sm font-bold" style={{ color: COLORS.teal }}>Capturar Baseline</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: COLORS.muted }}>Device ID *</label>
              <input style={inputStyle} value={form.device_id} onChange={(e) => setForm({ ...form, device_id: e.target.value })} placeholder="UUID do dispositivo" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: COLORS.muted }}>Nome do Baseline *</label>
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex: baseline-prod-v1" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: COLORS.muted }}>Config Snapshot (JSON) *</label>
            <textarea style={{ ...inputStyle, minHeight: "120px", fontFamily: "monospace" }} value={form.config_snapshot} onChange={(e) => setForm({ ...form, config_snapshot: e.target.value })} placeholder='{"hostname": "router-01", "ip": "10.0.0.1", ...}' />
          </div>
          <button onClick={handleCreateBaseline} disabled={saving || !form.device_id || !form.name || !form.config_snapshot} className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2" style={{ background: COLORS.teal, color: "white", cursor: "pointer", opacity: (saving || !form.device_id || !form.name || !form.config_snapshot) ? 0.5 : 1 }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Criar Baseline
          </button>
        </div>
      )}

      {/* Drift Events */}
      <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
          <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Drifts em Aberto ({events.length})</h3>
        </div>
        <div className="divide-y" style={{ borderColor: COLORS.border }}>
          {events.map((evt) => (
            <div key={evt.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {DRIFT_ICONS[evt.drift_type]}
                  <span className="text-[12px] font-bold" style={{ color: COLORS.text }}>{evt.config_path}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{
                    background: `${evt.severity === "critical" ? COLORS.red : COLORS.amber}15`,
                    color: evt.severity === "critical" ? COLORS.red : COLORS.amber,
                  }}>
                    {evt.drift_type} · {evt.severity}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleAcknowledge(evt.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.blue}15`, border: `1px solid ${COLORS.blue}`, color: COLORS.blue, cursor: "pointer" }}>
                    <Eye size={10} /> ACK
                  </button>
                  <button onClick={() => handleResolve(evt.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.green}15`, border: `1px solid ${COLORS.green}`, color: COLORS.green, cursor: "pointer" }}>
                    <Check size={10} /> Resolver
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px]" style={{ color: COLORS.muted }}>
                <Server size={10} /> {evt.device_hostname}
                <span>·</span>
                <span>Baseline: {evt.baseline_name}</span>
                <span>·</span>
                <span>{new Date(evt.detected_at).toLocaleString("pt-BR")}</span>
              </div>
              {(evt.old_value || evt.new_value) && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {evt.old_value && (
                    <div className="p-2 rounded" style={{ background: "var(--surface-1)" }}>
                      <p className="text-[9px] font-bold uppercase mb-1" style={{ color: COLORS.red }}>Antes</p>
                      <pre className="text-[10px] overflow-x-auto" style={{ color: COLORS.muted }}>{evt.old_value}</pre>
                    </div>
                  )}
                  {evt.new_value && (
                    <div className="p-2 rounded" style={{ background: "var(--surface-1)" }}>
                      <p className="text-[9px] font-bold uppercase mb-1" style={{ color: COLORS.green }}>Depois</p>
                      <pre className="text-[10px] overflow-x-auto" style={{ color: COLORS.muted }}>{evt.new_value}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {events.length === 0 && (
            <div className="p-6 text-center">
              <CheckCircle2 size={24} className="mx-auto mb-2" style={{ color: COLORS.green }} />
              <p className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum drift em aberto</p>
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
