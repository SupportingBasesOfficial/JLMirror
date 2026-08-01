// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback } from "react";
import {
  Monitor,
  Smartphone,
  Tablet,
  Trash2,
  LogOut,
  Shield,
  Clock,
  MapPin,
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

interface Session {
  id: string;
  device_fingerprint: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_label: string | null;
  created_at: string;
  expires_at: string;
}

interface TrustedDevice {
  id: string;
  device_fingerprint: string;
  device_label: string | null;
  ip_address: string | null;
  user_agent: string | null;
  trusted_at: string;
  last_seen_at: string;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getDeviceIcon(userAgent: string | null): typeof Monitor {
  if (!userAgent) return Monitor;
  const ua = userAgent.toLowerCase();
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) return Smartphone;
  if (ua.includes("ipad") || ua.includes("tablet")) return Tablet;
  return Monitor;
}

function getDeviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Dispositivo desconhecido";
  const ua = userAgent.toLowerCase();
  if (ua.includes("chrome") && ua.includes("edg")) return "Microsoft Edge";
  if (ua.includes("chrome")) return "Google Chrome";
  if (ua.includes("firefox")) return "Mozilla Firefox";
  if (ua.includes("safari")) return "Safari";
  return "Navegador";
}

function getOS(userAgent: string | null): string {
  if (!userAgent) return "—";
  const ua = userAgent.toLowerCase();
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("mac os") || ua.includes("macos")) return "macOS";
  if (ua.includes("linux")) return "Linux";
  if (ua.includes("android")) return "Android";
  if (ua.includes("ios") || ua.includes("iphone") || ua.includes("ipad")) return "iOS";
  return "—";
}

export default function SessionsPage() {
  const { data: sData, mutate: mutateSessions } = useApi<{ sessions: Session[] }>("/api/v1/auth/sessions");
  const { data: dData, mutate: mutateDevices } = useApi<{ devices: TrustedDevice[] }>("/api/v1/auth/devices");
  const sessions = sData?.sessions ?? [];
  const devices = dData?.devices ?? [];
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const handleRevokeSession = useCallback(async (sessionId: string) => {
    setLoading(sessionId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/auth/sessions/${sessionId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setSuccess("Sessão revogada com sucesso");
        mutateSessions();
      } else {
        setError("Erro ao revogar sessão");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(null);
    }
  }, [mutateSessions]);

  const handleRevokeAll = useCallback(async () => {
    setLoading("all");
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/sessions", { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setSuccess("Todas as sessões foram revogadas. Você será redirecionado para login...");
        setTimeout(() => { window.location.href = "/auth/login"; }, 2000);
      } else {
        setError("Erro ao revogar sessões");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(null);
    }
  }, []);

  const handleRemoveDevice = useCallback(async (deviceId: string) => {
    setLoading(`dev-${deviceId}`);
    setError(null);
    try {
      const res = await fetch(`/api/v1/auth/devices/${deviceId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setSuccess("Dispositivo removido e sessões associadas revogadas");
        mutateDevices();
        mutateSessions();
      } else {
        setError("Erro ao remover dispositivo");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(null);
    }
  }, [mutateDevices, mutateSessions]);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}><Shield size={18} className="inline mr-1" /> Segurança da Sessão</h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>Sessões ativas · Dispositivos confiáveis · Device fingerprinting</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { mutateSessions(); mutateDevices(); }} className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}><RefreshCw size={12} className="inline" /> Atualizar</button>
          <button onClick={handleRevokeAll} disabled={loading === "all"} className="text-[12px] px-3 py-1.5 rounded font-bold" style={{ background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}`, color: COLORS.red, cursor: loading === "all" ? "not-allowed" : "pointer", opacity: loading === "all" ? 0.5 : 1 }}><LogOut size={12} className="inline" /> Revogar Tudo</button>
        </div>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: COLORS.red }}>{error}</div>}
      {success && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-ok-bg)", border: "1px solid var(--status-ok-border)", color: COLORS.green }}>{success}</div>}

      {/* Sessões Ativas */}
      <div className="rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <h3 className="text-[10px] font-bold uppercase mb-4" style={{ color: COLORS.muted }}>SESSÕES ATIVAS ({sessions.length})</h3>
        <div className="space-y-2">
          {sessions.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhuma sessão ativa</div>}
          {sessions.map((s) => {
            const DeviceIcon = getDeviceIcon(s.user_agent);
            return (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center rounded-full" style={{ width: 36, height: 36, background: `${COLORS.teal}15`, border: `1px solid ${COLORS.teal}33` }}>
                    <DeviceIcon size={16} style={{ color: COLORS.teal }} />
                  </div>
                  <div>
                    <div className="text-[13px] font-bold" style={{ color: COLORS.text }}>{getDeviceLabel(s.user_agent)}</div>
                    <div className="text-[10px] flex items-center gap-3" style={{ color: COLORS.muted }}>
                      <span><MapPin size={9} className="inline" /> {s.ip_address ?? "IP desconhecido"}</span>
                      <span>{getOS(s.user_agent)}</span>
                      <span><Clock size={9} className="inline" /> {formatTime(s.created_at)}</span>
                    </div>
                    {s.device_fingerprint && (
                      <div className="text-[9px] mt-0.5" style={{ color: COLORS.muted }}>
                        Fingerprint: <code>{s.device_fingerprint.slice(0, 16)}...</code>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeSession(s.id)}
                  disabled={loading === s.id}
                  className="px-2 py-1 rounded text-[10px] font-bold"
                  style={{ background: `${COLORS.red}12`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: loading === s.id ? "not-allowed" : "pointer", opacity: loading === s.id ? 0.5 : 1 }}
                >
                  {loading === s.id ? "Revogando..." : "Revogar"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dispositivos Confiáveis */}
      <div className="rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <h3 className="text-[10px] font-bold uppercase mb-4" style={{ color: COLORS.muted }}>DISPOSITIVOS CONFIÁVEIS ({devices.length})</h3>
        <p className="text-[11px] mb-4" style={{ color: COLORS.muted }}>
          Dispositivos que já fizeram login com sucesso. Remover um dispositivo revoga todas as sessões associadas.
        </p>
        <div className="space-y-2">
          {devices.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum dispositivo confiável registrado</div>}
          {devices.map((d) => {
            const DeviceIcon = getDeviceIcon(d.user_agent);
            return (
              <div key={d.id} className="flex items-center justify-between p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center rounded-full" style={{ width: 36, height: 36, background: `${COLORS.green}15`, border: `1px solid ${COLORS.green}33` }}>
                    <DeviceIcon size={16} style={{ color: COLORS.green }} />
                  </div>
                  <div>
                    <div className="text-[13px] font-bold" style={{ color: COLORS.text }}>{d.device_label ?? getDeviceLabel(d.user_agent)}</div>
                    <div className="text-[10px] flex items-center gap-3" style={{ color: COLORS.muted }}>
                      <span><MapPin size={9} className="inline" /> {d.ip_address ?? "—"}</span>
                      <span>{getOS(d.user_agent)}</span>
                      <span>Confiável desde: {formatTime(d.trusted_at)}</span>
                      <span>Visto: {formatTime(d.last_seen_at)}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveDevice(d.id)}
                  disabled={loading === `dev-${d.id}`}
                  className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
                  style={{ background: `${COLORS.amber}12`, border: `1px solid var(--status-warning-border)`, color: COLORS.amber, cursor: loading === `dev-${d.id}` ? "not-allowed" : "pointer", opacity: loading === `dev-${d.id}` ? 0.5 : 1 }}
                >
                  <Trash2 size={10} />
                  {loading === `dev-${d.id}` ? "Removendo..." : "Remover"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
