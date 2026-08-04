// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Monitor,
  AlertTriangle,
  Gauge,
  Maximize2,
  Minimize2,
  Loader2,
  RefreshCw,
} from "lucide-react";

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

interface TvData {
  rotation_interval_seconds: number;
  panels: string[];
  devices?: {
    total: number;
    active: number;
    inactive: number;
    recent: Array<{
      hostname: string;
      ip: string;
      type: string;
      status: string;
      last_seen_at: string;
    }>;
  };
  alerts?: {
    active_count: number;
    alerts: Array<{
      id: string;
      title: string;
      severity: string;
      status: string;
      created_at: string;
    }>;
    by_severity: Array<{ severity: string; count: string }>;
  };
  sla?: {
    metrics: Array<{
      id: string;
      name: string;
      target_percentage: number;
      current_percentage: number;
      status: string;
    }>;
    services: { operational: number; degraded: number; down: number };
  };
}

const PANEL_ICONS: Record<string, typeof Monitor> = {
  devices: Monitor,
  alerts: AlertTriangle,
  sla: Gauge,
};

const PANEL_LABELS: Record<string, string> = {
  devices: "Dispositivos",
  alerts: "Alertas Ativos",
  sla: "SLA & Serviços",
};

export default function TvModePage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<TvData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPanel, setCurrentPanel] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clock, setClock] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rotationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/tv/data", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (res.ok) {
        setData(result);
        setError(null);
      } else {
        setError(result?.error?.message ?? "Erro ao buscar dados");
      }
    } catch {
      setError("Erro de conexão");
    }
    setLoading(false);
  }, [token]);

  // Autenticar com token
  function handleAuth() {
    if (!token.trim()) return;
    setAuthed(true);
  }

  // Buscar dados inicialmente e depois a cada 30s
  useEffect(() => {
    if (!authed) return;
    fetchData();
    intervalRef.current = setInterval(fetchData, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [authed, fetchData]);

  // Rotacionar paineis
  useEffect(() => {
    if (!data?.panels?.length) return;
    setCurrentPanel(0);
    const interval = data.rotation_interval_seconds * 1000;
    rotationRef.current = setInterval(() => {
      setCurrentPanel((prev) => (prev + 1) % data.panels.length);
    }, interval);
    return () => {
      if (rotationRef.current) clearInterval(rotationRef.current);
    };
  }, [data?.panels, data?.rotation_interval_seconds]);

  // Relogio
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fullscreen
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }

  // Esc para sair fullscreen
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Tela de login do TV mode
  if (!authed) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background: COLORS.bg,
          fontFamily: "'JetBrains Mono','Consolas',monospace",
        }}
      >
        <div
          className="rounded-xl p-8 max-w-md w-full space-y-6"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <div
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 56,
                  height: 56,
                  background: `${COLORS.teal}15`,
                  border: `2px solid ${COLORS.teal}`,
                }}
              >
                <Monitor size={28} style={{ color: COLORS.teal }} />
              </div>
            </div>
            <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
              Modo TV
            </h1>
            <p className="text-[12px]" style={{ color: COLORS.muted }}>
              Insira o token do dispositivo para exibir os painéis
            </p>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAuth()}
              placeholder="Token de TV..."
              className="w-full rounded-md px-3 py-2 text-[13px]"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.text,
              }}
              autoFocus
            />
            {error && (
              <div className="text-[11px]" style={{ color: COLORS.red }}>
                {error}
              </div>
            )}
            <button
              onClick={handleAuth}
              disabled={!token.trim()}
              className="w-full px-4 py-2 rounded-md text-[12px] font-bold"
              style={{
                background: COLORS.teal,
                color: COLORS.bg,
                cursor: token.trim() ? "pointer" : "not-allowed",
                opacity: token.trim() ? 1 : 0.5,
              }}
            >
              Conectar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: COLORS.bg,
          fontFamily: "'JetBrains Mono','Consolas',monospace",
        }}
      >
        <Loader2
          size={32}
          className="animate-spin"
          style={{ color: COLORS.teal }}
        />
      </div>
    );
  }

  const panels = data.panels ?? [];
  const activePanel = panels[currentPanel] ?? panels[0];

  return (
    <div
      className="min-h-screen p-6 flex flex-col"
      style={{
        background: COLORS.bg,
        fontFamily: "'JetBrains Mono','Consolas',monospace",
        color: COLORS.text,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Monitor size={20} style={{ color: COLORS.teal }} />
          <span className="text-sm font-bold" style={{ color: COLORS.teal }}>
            JLMIRROR · Modo TV
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold" style={{ color: COLORS.text }}>
            {clock.toLocaleTimeString("pt-BR")}
          </span>
          <button
            onClick={fetchData}
            className="p-1.5 rounded"
            style={{ color: COLORS.muted, cursor: "pointer" }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded"
            style={{ color: COLORS.muted, cursor: "pointer" }}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Panel indicator */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {panels.map((p, i) => (
          <div
            key={p}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full transition-all"
            style={{
              background:
                i === currentPanel ? `${COLORS.teal}15` : "transparent",
              border: `1px solid ${i === currentPanel ? COLORS.teal : COLORS.border}`,
            }}
          >
            {(() => {
              const Icon = PANEL_ICONS[p] ?? Monitor;
              return (
                <Icon
                  size={10}
                  style={{
                    color: i === currentPanel ? COLORS.teal : COLORS.muted,
                  }}
                />
              );
            })()}
            <span
              className="text-[10px] font-bold uppercase"
              style={{ color: i === currentPanel ? COLORS.teal : COLORS.muted }}
            >
              {PANEL_LABELS[p] ?? p}
            </span>
          </div>
        ))}
      </div>

      {/* Panel Content */}
      <div className="flex-1 flex items-center justify-center">
        {/* Devices Panel */}
        {activePanel === "devices" && data.devices && (
          <div className="w-full max-w-4xl space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                label="Total"
                value={data.devices.total}
                color={COLORS.teal}
                icon={Monitor}
              />
              <StatCard
                label="Ativos"
                value={data.devices.active}
                color={COLORS.green}
                icon={Monitor}
              />
              <StatCard
                label="Inativos"
                value={data.devices.inactive}
                color={COLORS.red}
                icon={Monitor}
              />
            </div>
            <div
              className="rounded-xl p-4"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                className="text-[10px] font-bold uppercase mb-3"
                style={{ color: COLORS.muted }}
              >
                Dispositivos Recentes
              </div>
              <div className="space-y-1">
                {data.devices.recent.slice(0, 8).map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 border-b"
                    style={{ borderColor: COLORS.border }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{
                          background:
                            d.status === "active" ? COLORS.green : COLORS.red,
                        }}
                      />
                      <span className="text-[13px] font-bold">
                        {d.hostname}
                      </span>
                      <span
                        className="text-[11px]"
                        style={{ color: COLORS.muted }}
                      >
                        {d.ip}
                      </span>
                    </div>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded"
                      style={{
                        background:
                          d.status === "active"
                            ? `${COLORS.green}15`
                            : `${COLORS.red}15`,
                        color:
                          d.status === "active" ? COLORS.green : COLORS.red,
                      }}
                    >
                      {d.status}
                    </span>
                  </div>
                ))}
                {data.devices.recent.length === 0 && (
                  <div
                    className="text-[12px] text-center py-4"
                    style={{ color: COLORS.muted }}
                  >
                    Nenhum dispositivo encontrado
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Alerts Panel */}
        {activePanel === "alerts" && data.alerts && (
          <div className="w-full max-w-4xl space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                label="Alertas Ativos"
                value={data.alerts.active_count}
                color={COLORS.amber}
                icon={AlertTriangle}
              />
              <StatCard
                label="Críticos"
                value={parseInt(
                  String(
                    data.alerts.by_severity.find(
                      (s) => s.severity === "critical",
                    )?.count ?? "0",
                  ),
                  10,
                )}
                color={COLORS.red}
                icon={AlertTriangle}
              />
              <StatCard
                label="Avisos"
                value={parseInt(
                  String(
                    data.alerts.by_severity.find(
                      (s) => s.severity === "warning",
                    )?.count ?? "0",
                  ),
                  10,
                )}
                color={COLORS.amber}
                icon={AlertTriangle}
              />
            </div>
            <div
              className="rounded-xl p-4"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                className="text-[10px] font-bold uppercase mb-3"
                style={{ color: COLORS.muted }}
              >
                Incidentes Ativos
              </div>
              <div className="space-y-1">
                {data.alerts.alerts.slice(0, 10).map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 border-b"
                    style={{ borderColor: COLORS.border }}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        size={12}
                        style={{
                          color:
                            a.severity === "critical"
                              ? COLORS.red
                              : a.severity === "warning"
                                ? COLORS.amber
                                : COLORS.blue,
                        }}
                      />
                      <span className="text-[13px] font-bold">{a.title}</span>
                    </div>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded"
                      style={{
                        background: `${COLORS.amber}15`,
                        color: COLORS.amber,
                      }}
                    >
                      {a.severity}
                    </span>
                  </div>
                ))}
                {data.alerts.alerts.length === 0 && (
                  <div
                    className="text-[12px] text-center py-4"
                    style={{ color: COLORS.green }}
                  >
                    Nenhum alerta ativo
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SLA Panel */}
        {activePanel === "sla" && data.sla && (
          <div className="w-full max-w-4xl space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                label="Operacional"
                value={data.sla.services.operational}
                color={COLORS.green}
                icon={Gauge}
              />
              <StatCard
                label="Degradado"
                value={data.sla.services.degraded}
                color={COLORS.amber}
                icon={Gauge}
              />
              <StatCard
                label="Indisponível"
                value={data.sla.services.down}
                color={COLORS.red}
                icon={Gauge}
              />
            </div>
            <div
              className="rounded-xl p-4"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                className="text-[10px] font-bold uppercase mb-3"
                style={{ color: COLORS.muted }}
              >
                Métricas de SLA
              </div>
              <div className="space-y-2">
                {data.sla.metrics.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b"
                    style={{ borderColor: COLORS.border }}
                  >
                    <span className="text-[13px] font-bold">{m.name}</span>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-32 h-2 rounded-full overflow-hidden"
                        style={{ background: COLORS.bg }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(parseFloat(String(m.current_percentage ?? 0)), 100)}%`,
                            background:
                              parseFloat(String(m.current_percentage ?? 0)) >=
                              m.target_percentage
                                ? COLORS.green
                                : COLORS.red,
                          }}
                        />
                      </div>
                      <span
                        className="text-[12px] font-bold"
                        style={{
                          color:
                            parseFloat(String(m.current_percentage ?? 0)) >=
                            m.target_percentage
                              ? COLORS.green
                              : COLORS.red,
                        }}
                      >
                        {parseFloat(String(m.current_percentage ?? 0)).toFixed(
                          2,
                        )}
                        %
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: COLORS.muted }}
                      >
                        Meta: {m.target_percentage}%
                      </span>
                    </div>
                  </div>
                ))}
                {data.sla.metrics.length === 0 && (
                  <div
                    className="text-[12px] text-center py-4"
                    style={{ color: COLORS.muted }}
                  >
                    Nenhuma métrica de SLA configurada
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="mt-6 flex items-center justify-between text-[10px]"
        style={{ color: COLORS.muted }}
      >
        <span>
          Painel {currentPanel + 1}/{panels.length} · Rotação a{" "}
          {data.rotation_interval_seconds}s
        </span>
        <span>Última atualização: {clock.toLocaleTimeString("pt-BR")}</span>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: typeof Monitor;
}) {
  return (
    <div
      className="rounded-xl p-4 text-center"
      style={{
        background: "var(--surface-2)",
        border: `1px solid var(--border-default)`,
      }}
    >
      <Icon size={20} style={{ color }} className="mx-auto mb-2" />
      <div className="text-3xl font-bold" style={{ color }}>
        {value}
      </div>
      <div
        className="text-[10px] font-bold uppercase mt-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
    </div>
  );
}
