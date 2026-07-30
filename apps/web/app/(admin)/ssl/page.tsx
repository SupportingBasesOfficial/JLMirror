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

const STATUS_COLORS: Record<string, string> = {
  valid: COLORS.green,
  expiring_soon: COLORS.amber,
  expired: COLORS.red,
  error: COLORS.red,
  revoked: COLORS.red,
};

const SEVERITY_COLORS: Record<string, string> = {
  info: COLORS.blue,
  warning: COLORS.amber,
  critical: COLORS.red,
};

interface SslCertificate {
  id: string;
  hostname: string;
  port: number;
  protocol: string;
  issuer: string | null;
  subject: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_auto_renewed: boolean;
  ca_provider: string | null;
  alert_days_before: number;
  is_active: boolean;
  last_checked_at: string | null;
  status: string;
  days_until_expiry: number | null;
}

interface SslAlert {
  id: string;
  cert_id: string;
  alert_type: string;
  severity: string;
  message: string;
  days_until_expiry: number | null;
  acknowledged: boolean;
  created_at: string;
  hostname: string;
  port: number;
}

interface SslStats {
  stats: { total: string; valid: string; expiring_soon: string; expired: string };
  unacknowledged_alerts: string;
  upcoming: { hostname: string; port: number; valid_to: string; days_until_expiry: number }[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SslPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"certificates" | "alerts">("certificates");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedCert, setSelectedCert] = useState<SslCertificate | null>(null);

  // Form
  const [formHostname, setFormHostname] = useState("");
  const [formPort, setFormPort] = useState(443);
  const [formProtocol, setFormProtocol] = useState("https");
  const [formAlertDays, setFormAlertDays] = useState(30);
  const [formAutoRenew, setFormAutoRenew] = useState(false);
  const [formCaProvider, setFormCaProvider] = useState("");

  const certParams = new URLSearchParams();
  if (statusFilter) certParams.set("status", statusFilter);

  const { data: certData, mutate: mutateCerts } = useApi<{ certificates: SslCertificate[] }>(`/api/ssl/certificates?${certParams.toString()}`);
  const { data: alertData, mutate: mutateAlerts } = useApi<{ alerts: SslAlert[] }>("/api/ssl/alerts?acknowledged=false");
  const { data: stats, mutate: mutateStats } = useApi<SslStats>("/api/ssl/stats");

  const certificates = certData?.certificates ?? [];
  const alerts = alertData?.alerts ?? [];
  const loading = false;

  async function handleAdd() {
    setError(null);
    try {
      const res = await fetch("/api/ssl/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          hostname: formHostname,
          port: formPort,
          protocol: formProtocol,
          alert_days_before: formAlertDays,
          is_auto_renewed: formAutoRenew,
          ca_provider: formCaProvider || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao registrar certificado");
        return;
      }
      setSuccess("Certificado registrado!");
      setShowAdd(false);
      setFormHostname(""); setFormPort(443); setFormProtocol("https"); setFormAlertDays(30); setFormAutoRenew(false); setFormCaProvider("");
      mutateCerts(); mutateAlerts(); mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleCheck(certId: string) {
    try {
      const res = await fetch(`/api/ssl/check/${certId}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        mutateCerts(); mutateAlerts(); mutateStats();
      }
    } catch {
      // Ignora
    }
  }

  async function handleCheckAll() {
    try {
      const res = await fetch("/api/ssl/check-all", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setSuccess("Verificação de todos os certificados concluída");
        mutateCerts(); mutateAlerts(); mutateStats();
      }
    } catch {
      // Ignora
    }
  }

  async function handleDelete(certId: string) {
    try {
      const res = await fetch(`/api/ssl/certificates/${certId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateCerts(); mutateAlerts(); mutateStats();
      }
    } catch {
      // Ignora
    }
  }

  async function handleAcknowledge(alertId: string) {
    try {
      const res = await fetch(`/api/ssl/alerts/${alertId}/acknowledge`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        mutateAlerts();
        mutateStats();
      }
    } catch {
      // Ignora
    }
  }

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            SSL/TLS — Gerenciamento de Certificados
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Monitoramento de expiração · Alertas · Auto-renovação
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd(true)}
            className="text-[12px] px-3 py-1.5 rounded font-bold"
            style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}
          ><Plus size={12} className="inline" /> Monitorar Host</button>
          <button
            onClick={handleCheckAll}
            className="text-[12px] px-3 py-1.5 rounded font-bold"
            style={{ background: COLORS.blue, color: "#fff", cursor: "pointer" }}
          >
            ↻ Verificar Todos
          </button>
          <button
            onClick={() => { mutateCerts(); mutateAlerts(); mutateStats(); }}
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}
          >
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
          <a
            href="/dashboard"
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}
          >
            <ArrowLeft size={12} className="inline" /> Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-error-bg)`, border: `1px solid var(--status-error-border)`, color: COLORS.red }}>
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-ok-bg)`, border: `1px solid var(--status-ok-border)`, color: COLORS.green }}>
          {success}
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Total</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.text }}>{stats.stats.total}</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-ok-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Válidos</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.green }}>{stats.stats.valid}</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-warning-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Expirando</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>{stats.stats.expiring_soon}</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-error-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Expirados</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.red }}>{stats.stats.expired}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {([
          { key: "certificates", label: `Certificados (${certificates.length})` },
          { key: "alerts", label: `Alertas (${alerts.length})` },
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

      {/* Tab: Certificates */}
      {tab === "certificates" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {/* Filter */}
          <div className="flex items-center gap-3 p-3" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <label htmlFor="ssl-status-filter" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Filtrar:</label>
            <select
              id="ssl-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md px-2 py-1 text-[12px]"
              style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            >
              <option value="">Todos</option>
              <option value="valid">Válidos</option>
              <option value="expiring_soon">Expirando</option>
              <option value="expired">Expirados</option>
            </select>
          </div>

          {loading ? (
            <LoadingState label="Carregando certificados..." />
          ) : certificates.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhum certificado monitorado</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Hostname</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Porta</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Proto</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Issuer</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Validade</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Expira em</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Status</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Auto</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((cert) => (
                  <tr
                    key={cert.id}
                    style={{ borderBottom: `1px solid ${COLORS.border}`, cursor: "pointer" }}
                    onClick={() => setSelectedCert(cert)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") setSelectedCert(cert); }}
                  >
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{cert.hostname}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{cert.port}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{cert.protocol}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: COLORS.muted }}>{cert.issuer ?? "—"}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatDate(cert.valid_to)}</td>
                    <td className="px-3 py-2" style={{ color: cert.days_until_expiry !== null && cert.days_until_expiry < 0 ? COLORS.red : cert.days_until_expiry !== null && cert.days_until_expiry <= 30 ? COLORS.amber : COLORS.text }}>
                      {cert.days_until_expiry !== null ? `${cert.days_until_expiry}d` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLORS[cert.status] ?? COLORS.muted}15`, color: STATUS_COLORS[cert.status] ?? COLORS.muted }}>
                        {cert.status}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: cert.is_auto_renewed ? COLORS.green : COLORS.muted }}>
                      {cert.is_auto_renewed ? "✓" : "—"}
                    </td>
                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => handleCheck(cert.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{ background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`, border: `1px solid var(--status-info-border)`, color: COLORS.blue, cursor: "pointer" }}
                        >
                          ↻
                        </button>
                        <button
                          onClick={() => handleDelete(cert.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Alerts */}
      {tab === "alerts" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {alerts.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhum alerta não reconhecido</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Severidade</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tipo</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Host</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Mensagem</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Dias</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Quando</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${SEVERITY_COLORS[a.severity] ?? COLORS.muted}15`, color: SEVERITY_COLORS[a.severity] ?? COLORS.muted }}>
                        {a.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{a.alert_type}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{a.hostname}:{a.port}</td>
                    <td className="px-3 py-2 max-w-[300px]" style={{ color: COLORS.text }}>{a.message}</td>
                    <td className="px-3 py-2" style={{ color: a.days_until_expiry !== null && a.days_until_expiry < 0 ? COLORS.red : COLORS.amber }}>
                      {a.days_until_expiry !== null ? `${a.days_until_expiry}d` : "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatDateTime(a.created_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleAcknowledge(a.id)}
                        className="px-2 py-1 rounded text-[10px] font-bold"
                        style={{ background: `color-mix(in srgb, var(--status-ok-text) 12%, transparent)`, border: `1px solid var(--status-ok-border)`, color: COLORS.green, cursor: "pointer" }}
                      >
                        ✓ Reconhecer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Detail modal */}
      {selectedCert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setSelectedCert(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setSelectedCert(null); }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-lg w-full"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
                {selectedCert.hostname}:{selectedCert.port}
              </h2>
              <button onClick={() => setSelectedCert(null)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-3 text-[12px]">
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Protocolo:</span>
                <span style={{ color: COLORS.text }}>{selectedCert.protocol}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Status:</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLORS[selectedCert.status] ?? COLORS.muted}15`, color: STATUS_COLORS[selectedCert.status] ?? COLORS.muted }}>
                  {selectedCert.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Issuer:</span>
                <span style={{ color: COLORS.text }}>{selectedCert.issuer ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Subject:</span>
                <span style={{ color: COLORS.text }}>{selectedCert.subject ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Válido de:</span>
                <span style={{ color: COLORS.text }}>{formatDate(selectedCert.valid_from)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Válido até:</span>
                <span style={{ color: selectedCert.days_until_expiry !== null && selectedCert.days_until_expiry < 0 ? COLORS.red : COLORS.text }}>
                  {formatDate(selectedCert.valid_to)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Dias até expirar:</span>
                <span style={{ color: selectedCert.days_until_expiry !== null && selectedCert.days_until_expiry < 0 ? COLORS.red : selectedCert.days_until_expiry !== null && selectedCert.days_until_expiry <= 30 ? COLORS.amber : COLORS.green }}>
                  {selectedCert.days_until_expiry !== null ? `${selectedCert.days_until_expiry}d` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Auto-renovado:</span>
                <span style={{ color: selectedCert.is_auto_renewed ? COLORS.green : COLORS.muted }}>
                  {selectedCert.is_auto_renewed ? "Sim" : "Não"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>CA Provider:</span>
                <span style={{ color: COLORS.text }}>{selectedCert.ca_provider ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Alerta antes de:</span>
                <span style={{ color: COLORS.text }}>{selectedCert.alert_days_before} dias</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Última verificação:</span>
                <span style={{ color: COLORS.text }}>{formatDateTime(selectedCert.last_checked_at)}</span>
              </div>
              <button
                onClick={() => { handleCheck(selectedCert.id); setSelectedCert(null); }}
                className="w-full rounded-md py-2 text-sm font-bold"
                style={{ background: COLORS.blue, color: "#fff", cursor: "pointer" }}
              >
                Verificar Agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add certificate */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowAdd(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowAdd(false); }}
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
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Monitorar Certificado</h2>
              <button onClick={() => setShowAdd(false)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="ssl-host" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Hostname</label>
                <input id="ssl-host" type="text" value={formHostname} onChange={(e) => setFormHostname(e.target.value)} placeholder="exemplo.com" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="ssl-port" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Porta</label>
                  <input id="ssl-port" type="number" value={formPort} onChange={(e) => setFormPort(parseInt(e.target.value, 10) || 443)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="ssl-proto" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Protocolo</label>
                  <select id="ssl-proto" value={formProtocol} onChange={(e) => setFormProtocol(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="https">HTTPS</option>
                    <option value="imaps">IMAPS</option>
                    <option value="smtps">SMTPS</option>
                    <option value="ldaps">LDAPS</option>
                    <option value="ftps">FTPS</option>
                    <option value="pop3s">POP3S</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="ssl-alert-days" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Alertar (dias antes)</label>
                  <input id="ssl-alert-days" type="number" value={formAlertDays} onChange={(e) => setFormAlertDays(parseInt(e.target.value, 10) || 30)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="ssl-ca" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>CA Provider</label>
                  <input id="ssl-ca" type="text" value={formCaProvider} onChange={(e) => setFormCaProvider(e.target.value)} placeholder="Let's Encrypt" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
                <input type="checkbox" checked={formAutoRenew} onChange={(e) => setFormAutoRenew(e.target.checked)} />
                Auto-renovado
              </label>
              <button
                onClick={handleAdd}
                disabled={!formHostname}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: COLORS.teal, color: COLORS.bg, cursor: !formHostname ? "not-allowed" : "pointer" }}
              >
                Monitorar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
