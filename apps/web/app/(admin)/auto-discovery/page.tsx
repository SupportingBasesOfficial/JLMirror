// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback } from "react";
import {
  Radar,
  Plus,
  Play,
  Loader2,
  RefreshCw,
  Trash2,
  Download,
  Server,
  Network,
  CheckCircle2,
  XCircle,
  Activity,
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

interface DiscoverySession {
  id: string;
  name: string;
  ip_ranges: string[];
  status: string;
  devices_found: number;
  links_found: number;
  device_count: string;
  link_count: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

const inputStyle = {
  background: "var(--surface-1)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  borderRadius: "6px",
  padding: "6px 10px",
  fontSize: "12px",
  width: "100%",
} as const;

const labelStyle = {
  fontSize: "10px",
  fontWeight: "bold",
  textTransform: "uppercase" as const,
  color: "var(--text-muted)",
  marginBottom: "4px",
  display: "block",
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  pending: { color: COLORS.muted, icon: <Activity size={10} /> },
  running: { color: COLORS.blue, icon: <Loader2 size={10} className="animate-spin" /> },
  completed: { color: COLORS.green, icon: <CheckCircle2 size={10} /> },
  failed: { color: COLORS.red, icon: <XCircle size={10} /> },
  cancelled: { color: COLORS.muted, icon: <XCircle size={10} /> },
};

export default function AutoDiscoveryPage() {
  const { data: sessionsData, mutate } = useApi<{ sessions: DiscoverySession[] }>("/api/v1/discovery/sessions");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    ip_ranges: "192.168.1.0/24",
    snmp_communities: "public",
    use_snmp: true,
    use_lldp: true,
    use_arp: true,
  });

  const sessions = sessionsData?.sessions ?? [];

  const handleCreate = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/discovery/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name,
          ip_ranges: form.ip_ranges.split(",").map((s) => s.trim()).filter(Boolean),
          snmp_communities: form.snmp_communities.split(",").map((s) => s.trim()).filter(Boolean),
          use_snmp: form.use_snmp,
          use_lldp: form.use_lldp,
          use_arp: form.use_arp,
        }),
      });
      if (res.ok) {
        setSuccess("Sessão de discovery criada");
        setShowForm(false);
        setForm({ name: "", ip_ranges: "192.168.1.0/24", snmp_communities: "public", use_snmp: true, use_lldp: true, use_arp: true });
        mutate();
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao criar sessão");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }, [form, mutate]);

  const handleRun = useCallback(async (id: string) => {
    setRunning(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/discovery/sessions/${id}/run`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Discovery concluído: ${data.devices_found} dispositivos, ${data.links_found} links`);
      } else {
        setError(data?.error?.message ?? "Erro ao executar discovery");
      }
      mutate();
    } catch {
      setError("Erro de conexão");
    } finally {
      setRunning(null);
    }
  }, [mutate]);

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/v1/discovery/sessions/${id}`, { method: "DELETE", credentials: "include" });
    mutate();
  }, [mutate]);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            <Radar size={18} className="inline mr-1" /> Auto-Discovery
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Descoberta automática de topologia · SNMP / LLDP / ARP
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => mutate()} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
            <RefreshCw size={12} /> Atualizar
          </button>
          <button onClick={() => setShowForm(!showForm)} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: COLORS.teal, color: "white", cursor: "pointer" }}>
            <Plus size={12} /> Nova Sessão
          </button>
        </div>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: COLORS.red }}>{error}</div>}
      {success && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-ok-bg)", border: "1px solid var(--status-ok-border)", color: COLORS.green }}>{success}</div>}

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl p-6 space-y-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <h3 className="text-sm font-bold" style={{ color: COLORS.teal }}>Nova Sessão de Discovery</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Nome *</label>
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex: Discovery Rede Corporativa" />
            </div>
            <div>
              <label style={labelStyle}>Ranges de IP (CIDR, separados por vírgula) *</label>
              <input style={inputStyle} value={form.ip_ranges} onChange={(e) => setForm({ ...form, ip_ranges: e.target.value })} placeholder="192.168.1.0/24, 10.0.0.0/24" />
            </div>
            <div>
              <label style={labelStyle}>SNMP Communities (separadas por vírgula)</label>
              <input style={inputStyle} value={form.snmp_communities} onChange={(e) => setForm({ ...form, snmp_communities: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={form.use_snmp} onChange={(e) => setForm({ ...form, use_snmp: e.target.checked })} /> SNMP
            </label>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={form.use_lldp} onChange={(e) => setForm({ ...form, use_lldp: e.target.checked })} /> LLDP
            </label>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={form.use_arp} onChange={(e) => setForm({ ...form, use_arp: e.target.checked })} /> ARP Table
            </label>
          </div>
          <button onClick={handleCreate} disabled={saving || !form.name} className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2" style={{ background: COLORS.teal, color: "white", cursor: "pointer", opacity: (saving || !form.name) ? 0.5 : 1 }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Criar Sessão
          </button>
        </div>
      )}

      {/* Sessions List */}
      <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
          <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Sessões de Discovery ({sessions.length})</h3>
        </div>
        <div className="divide-y" style={{ borderColor: COLORS.border }}>
          {sessions.map((session) => {
            const statusConfig = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;
            const deviceCount = parseInt(session.device_count ?? "0", 10);
            const linkCount = parseInt(session.link_count ?? "0", 10);
            return (
              <div key={session.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: `${COLORS.teal}15` }}>
                      <Radar size={14} style={{ color: COLORS.teal }} />
                    </div>
                    <div>
                      <p className="text-[12px] font-bold" style={{ color: COLORS.text }}>{session.name}</p>
                      <p className="text-[10px]" style={{ color: COLORS.muted }}>
                        {(session.ip_ranges as string[]).join(", ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${statusConfig.color}15`, color: statusConfig.color }}>
                      {statusConfig.icon} {session.status}
                    </span>
                    <button
                      onClick={() => handleRun(session.id)}
                      disabled={running === session.id || session.status === "running"}
                      className="px-2 py-1 rounded text-[10px] font-bold"
                      style={{ background: `${COLORS.green}15`, border: `1px solid ${COLORS.green}`, color: COLORS.green, cursor: "pointer", opacity: (running === session.id || session.status === "running") ? 0.5 : 1 }}
                    >
                      {running === session.id ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />} Executar
                    </button>
                    <button onClick={() => handleDelete(session.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}`, color: COLORS.red, cursor: "pointer" }}>
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[10px]" style={{ color: COLORS.muted }}>
                  <span className="flex items-center gap-1"><Server size={10} /> {deviceCount} dispositivos</span>
                  <span className="flex items-center gap-1"><Network size={10} /> {linkCount} links</span>
                  {session.completed_at && <span>Concluído: {new Date(session.completed_at).toLocaleString("pt-BR")}</span>}
                </div>
                {session.error_message && (
                  <p className="text-[10px] mt-1 p-2 rounded" style={{ background: "var(--status-error-bg)", color: COLORS.red }}>
                    {session.error_message}
                  </p>
                )}
                {deviceCount > 0 && (
                  <button
                    onClick={() => setSelectedSession(selectedSession === session.id ? null : session.id)}
                    className="text-[10px] mt-2 flex items-center gap-1"
                    style={{ color: COLORS.teal, cursor: "pointer" }}
                  >
                    <Download size={10} /> {selectedSession === session.id ? "Ocultar" : "Ver"} dispositivos
                  </button>
                )}
              </div>
            );
          })}
          {sessions.length === 0 && (
            <div className="p-6 text-center">
              <Radar size={24} className="mx-auto mb-2" style={{ color: COLORS.muted }} />
              <p className="text-[12px]" style={{ color: COLORS.muted }}>Nenhuma sessão de discovery criada</p>
            </div>
          )}
        </div>
      </div>

      {/* Discovered Devices (inline) */}
      {selectedSession && (
        <DiscoveredDevices sessionId={selectedSession} />
      )}
    </div>
  );
}

function DiscoveredDevices({ sessionId }: { sessionId: string }) {
  const { data, mutate } = useApi<{ devices: Array<Record<string, unknown>> }>(`/api/v1/discovery/sessions/${sessionId}/devices`);

  const devices = data?.devices ?? [];

  const handleImport = async (deviceId: string) => {
    await fetch(`/api/v1/discovery/devices/${deviceId}/import`, { method: "POST", credentials: "include" });
    mutate();
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
      <div className="p-4 border-b" style={{ borderColor: "var(--border-default)" }}>
        <h3 className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Dispositivos Descobertos ({devices.length})</h3>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border-default)" }}>
        {devices.map((dev: Record<string, unknown>) => (
          <div key={dev.id as string} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server size={14} style={{ color: "var(--brand-primary)" }} />
              <div>
                <p className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>
                  {dev.hostname as string ?? dev.ip_address as string}
                </p>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {dev.ip_address as string} · {dev.device_type as string ?? "unknown"} · {dev.vendor as string ?? "—"} · via {dev.discovered_via as string}
                </p>
              </div>
            </div>
            {dev.device_id ? (
              <span className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--status-ok-bg)", color: "var(--status-ok-text)" }}>
                Importado
              </span>
            ) : (
              <button onClick={() => handleImport(dev.id as string)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: "var(--brand-primary)", color: "white", cursor: "pointer" }}>
                <Download size={10} /> Importar
              </button>
            )}
          </div>
        ))}
        {devices.length === 0 && (
          <div className="p-4 text-center">
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Nenhum dispositivo descoberto</p>
          </div>
        )}
      </div>
    </div>
  );
}
