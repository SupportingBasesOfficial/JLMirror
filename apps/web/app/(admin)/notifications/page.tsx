// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
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

const CHANNEL_ICONS: Record<string, string> = {
  slack: "💬",
  email: "📧",
  webhook: "🔗",
  teams: "👥",
  telegram: "✈",
  discord: "🎮",
  pagerduty: "📟",
};

const CHANNEL_COLORS: Record<string, string> = {
  slack: COLORS.purple,
  email: COLORS.blue,
  webhook: COLORS.teal,
  teams: COLORS.blue,
  telegram: COLORS.blue,
  discord: COLORS.purple,
  pagerduty: COLORS.red,
};

const STATUS_COLORS: Record<string, string> = {
  sent: COLORS.green,
  failed: COLORS.red,
  pending: COLORS.amber,
  rate_limited: COLORS.muted,
};

const SEVERITY_COLORS: Record<string, string> = {
  info: COLORS.blue,
  warning: COLORS.amber,
  critical: COLORS.red,
};

const EVENT_SOURCES = [
  "ssl.expiring_soon", "ssl.expired", "ssl.revoked",
  "backup.completed", "backup.failed", "backup.corrupted",
  "k8s.pod_crash", "k8s.node_down", "k8s.event_warning",
  "firewall.applied", "firewall.failed",
  "script.executed", "script.failed", "script.approval_needed",
  "monitoring.cpu_high", "monitoring.disk_high", "monitoring.memory_high", "monitoring.service_down",
  "custom",
];

const EVENT_CATEGORIES = ["security", "backup", "k8s", "firewall", "script", "monitoring", "custom"];

interface NotifChannel {
  id: string;
  name: string;
  channel_type: string;
  config: Record<string, unknown>;
  is_active: boolean;
  is_verified: boolean;
  verified_at: string | null;
  last_used_at: string | null;
  failure_count: number;
}

interface NotifRule {
  id: string;
  name: string;
  description: string | null;
  event_source: string;
  event_category: string;
  severity_filter: string;
  channel_ids: string[];
  template_subject: string | null;
  template_body: string | null;
  cooldown_minutes: number;
  is_active: boolean;
  last_triggered_at: string | null;
  trigger_count: number;
}

interface NotifLog {
  id: string;
  rule_id: string | null;
  channel_id: string | null;
  event_source: string;
  event_category: string;
  severity: string;
  subject: string;
  body: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  duration_ms: number | null;
  created_at: string;
  channel_name: string | null;
  channel_type: string | null;
  rule_name: string | null;
}

interface NotifStats {
  channels: { total: string; active: string; verified: string };
  rules: { total: string; active: string; total_triggers: string };
  log_7d: { total: string; sent: string; failed: string; rate_limited: string };
  by_category: { event_category: string; count: string }[];
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function NotificationsPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"channels" | "rules" | "log">("channels");
  const [showChannel, setShowChannel] = useState(false);
  const [showRule, setShowRule] = useState(false);

  // Channel form
  const [chName, setChName] = useState("");
  const [chType, setChType] = useState("slack");
  const [chConfig, setChConfig] = useState("{}");

  // Rule form
  const [rName, setRName] = useState("");
  const [rSource, setRSource] = useState("ssl.expiring_soon");
  const [rCategory, setRCategory] = useState("security");
  const [rSeverity, setRSeverity] = useState("all");
  const [rChannels, setRChannels] = useState<string[]>([]);
  const [rCooldown, setRCooldown] = useState(60);
  const [rSubject, setRSubject] = useState("");
  const [rBody, setRBody] = useState("");

  const { data: chData, mutate: mutateChannels } = useApi<{ channels: NotifChannel[] }>("/api/notifications/channels");
  const { data: rData, mutate: mutateRules } = useApi<{ rules: NotifRule[] }>("/api/notifications/rules");
  const { data: lData, mutate: mutateLogs } = useApi<{ logs: NotifLog[] }>("/api/notifications/log?limit=50");
  const { data: stats, mutate: mutateStats } = useApi<NotifStats>("/api/notifications/stats");

  const channels = chData?.channels ?? [];
  const rules = rData?.rules ?? [];
  const logs = lData?.logs ?? [];
  const loading = false;

  async function handleCreateChannel() {
    setError(null);
    try {
      let parsedConfig: Record<string, unknown> = {};
      try {
        parsedConfig = JSON.parse(chConfig);
      } catch {
        setError("Config JSON inválido");
        return;
      }
      const res = await fetch("/api/notifications/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: chName, channel_type: chType, config: parsedConfig, is_active: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar canal");
        return;
      }
      setSuccess("Canal criado!");
      setShowChannel(false);
      setChName(""); setChType("slack"); setChConfig("{}");
      mutateChannels();
      mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleTestChannel(channelId: string) {
    try {
      const res = await fetch(`/api/notifications/channels/${channelId}/test`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setSuccess("Canal testado!");
        mutateChannels();
        mutateLogs();
      }
    } catch {
      // Ignora
    }
  }

  async function handleDeleteChannel(channelId: string) {
    try {
      const res = await fetch(`/api/notifications/channels/${channelId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateChannels();
        mutateStats();
      }
    } catch {
      // Ignora
    }
  }

  async function handleCreateRule() {
    setError(null);
    if (rChannels.length === 0) {
      setError("Selecione pelo menos 1 canal");
      return;
    }
    try {
      const res = await fetch("/api/notifications/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: rName,
          event_source: rSource,
          event_category: rCategory,
          severity_filter: rSeverity,
          channel_ids: rChannels,
          template_subject: rSubject || undefined,
          template_body: rBody || undefined,
          cooldown_minutes: rCooldown,
          is_active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar regra");
        return;
      }
      setSuccess("Regra criada!");
      setShowRule(false);
      setRName(""); setRSource("ssl.expiring_soon"); setRCategory("security"); setRSeverity("all");
      setRChannels([]); setRCooldown(60); setRSubject(""); setRBody("");
      mutateRules();
      mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleDeleteRule(ruleId: string) {
    try {
      const res = await fetch(`/api/notifications/rules/${ruleId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateRules();
        mutateStats();
      }
    } catch {
      // Ignora
    }
  }

  function toggleChannelSelection(channelId: string) {
    setRChannels((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId],
    );
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
            Notifications — Canais & Alertas
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Slack · Email · Webhook · Teams · Regras de roteamento · Log
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "channels" && (
            <button
              onClick={() => setShowChannel(true)}
              className="text-[12px] px-3 py-1.5 rounded font-bold"
              style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}
            ><Plus size={12} className="inline" /> Canal</button>
          )}
          {tab === "rules" && (
            <button
              onClick={() => setShowRule(true)}
              className="text-[12px] px-3 py-1.5 rounded font-bold"
              style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}
            ><Plus size={12} className="inline" /> Regra</button>
          )}
          <button
            onClick={() => { mutateChannels(); mutateRules(); mutateLogs(); mutateStats(); }}
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

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Canais</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>{stats.channels.active}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.channels.verified} verificados</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Regras</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>{stats.rules.active}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.rules.total_triggers} triggers</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-ok-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Enviadas (7d)</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.green }}>{stats.log_7d.sent}</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${stats.log_7d.failed !== "0" ? COLORS.red : COLORS.border}44` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Falhas (7d)</div>
            <div className="text-2xl font-bold" style={{ color: stats.log_7d.failed !== "0" ? COLORS.red : COLORS.muted }}>{stats.log_7d.failed}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {([
          { key: "channels", label: `Canais (${channels.length})` },
          { key: "rules", label: `Regras (${rules.length})` },
          { key: "log", label: "Log" },
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

      {/* Tab: Channels */}
      {tab === "channels" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {loading ? (
            <LoadingState label="Carregando notificacoes..." />
          ) : channels.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhum canal configurado</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Nome</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tipo</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Verificado</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Falhas</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Último uso</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => (
                  <tr key={ch.id} style={{ borderBottom: `1px solid ${COLORS.border}`, opacity: ch.is_active ? 1 : 0.4 }}>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{ch.name}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${CHANNEL_COLORS[ch.channel_type] ?? COLORS.muted}15`, color: CHANNEL_COLORS[ch.channel_type] ?? COLORS.muted }}>
                        {CHANNEL_ICONS[ch.channel_type] ?? "•"} {ch.channel_type}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: ch.is_verified ? COLORS.green : COLORS.amber }}>
                      {ch.is_verified ? "✓" : "⚠"}
                    </td>
                    <td className="px-3 py-2" style={{ color: ch.failure_count > 0 ? COLORS.red : COLORS.muted }}>{ch.failure_count}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(ch.last_used_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleTestChannel(ch.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`, border: `1px solid var(--status-info-border)`, color: COLORS.blue, cursor: "pointer" }}>Testar</button>
                        <button onClick={() => handleDeleteChannel(ch.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Rules */}
      {tab === "rules" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {rules.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhuma regra configurada</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Nome</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Evento</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Categoria</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Severidade</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Canais</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Cooldown</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Triggers</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Último</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${COLORS.border}`, opacity: r.is_active ? 1 : 0.4 }}>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{r.name}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.text }}>{r.event_source}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{r.event_category}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${SEVERITY_COLORS[r.severity_filter] ?? COLORS.muted}15`, color: SEVERITY_COLORS[r.severity_filter] ?? COLORS.muted }}>
                        {r.severity_filter}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.blue }}>{r.channel_ids.length}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{r.cooldown_minutes}m</td>
                    <td className="px-3 py-2" style={{ color: COLORS.text }}>{r.trigger_count}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(r.last_triggered_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => handleDeleteRule(r.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Log */}
      {tab === "log" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {logs.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhuma notificação enviada</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Status</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Sev</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Canal</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Evento</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Assunto</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Quando</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLORS[l.status] ?? COLORS.muted}15`, color: STATUS_COLORS[l.status] ?? COLORS.muted }}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${SEVERITY_COLORS[l.severity] ?? COLORS.muted}15`, color: SEVERITY_COLORS[l.severity] ?? COLORS.muted }}>
                        {l.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {l.channel_name ? `${CHANNEL_ICONS[l.channel_type ?? ""] ?? "•"} ${l.channel_name}` : "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.text }}>{l.event_source}</td>
                    <td className="px-3 py-2 max-w-[250px] truncate" style={{ color: COLORS.text }}>{l.subject}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(l.sent_at ?? l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Create channel */}
      {showChannel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowChannel(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowChannel(false); }}
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
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Novo Canal</h2>
              <button onClick={() => setShowChannel(false)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="ch-name" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome</label>
                <input id="ch-name" type="text" value={chName} onChange={(e) => setChName(e.target.value)} placeholder="Slack #alertas" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="ch-type" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Tipo</label>
                <select id="ch-type" value={chType} onChange={(e) => setChType(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                  <option value="slack">Slack</option>
                  <option value="email">Email</option>
                  <option value="webhook">Webhook</option>
                  <option value="teams">Teams</option>
                  <option value="telegram">Telegram</option>
                  <option value="discord">Discord</option>
                  <option value="pagerduty">PagerDuty</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="ch-config" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Config (JSON)</label>
                <textarea id="ch-config" value={chConfig} onChange={(e) => setChConfig(e.target.value)} rows={4} placeholder='{"webhook_url":"https://hooks.slack.com/..."}' className="w-full rounded-md px-3 py-2 text-[12px] font-mono" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                <div className="text-[10px]" style={{ color: COLORS.muted }}>
                  Slack: webhook_url · Email: smtp_host, smtp_port, from, to · Webhook: url, method
                </div>
              </div>
              <button
                onClick={handleCreateChannel}
                disabled={!chName}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: COLORS.teal, color: COLORS.bg, cursor: !chName ? "not-allowed" : "pointer" }}
              >
                Criar Canal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create rule */}
      {showRule && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowRule(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowRule(false); }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Nova Regra</h2>
              <button onClick={() => setShowRule(false)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="r-name" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome</label>
                <input id="r-name" type="text" value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Alerta SSL expirando" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="r-source" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Evento</label>
                  <select id="r-source" value={rSource} onChange={(e) => setRSource(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    {EVENT_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="r-cat" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Categoria</label>
                  <select id="r-cat" value={rCategory} onChange={(e) => setRCategory(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    {EVENT_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="r-sev" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Severidade</label>
                  <select id="r-sev" value={rSeverity} onChange={(e) => setRSeverity(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="all">Todas</option>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="r-cooldown" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Cooldown (min)</label>
                  <input id="r-cooldown" type="number" value={rCooldown} onChange={(e) => setRCooldown(parseInt(e.target.value, 10) || 60)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Canais ({rChannels.length} selecionados)</label>
                <div className="space-y-1 max-h-32 overflow-y-auto rounded-md p-2" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  {channels.length === 0 ? (
                    <div className="text-[11px] p-2" style={{ color: COLORS.muted }}>Crie um canal primeiro</div>
                  ) : channels.map((ch) => (
                    <label key={ch.id} className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.text }}>
                      <input type="checkbox" checked={rChannels.includes(ch.id)} onChange={() => toggleChannelSelection(ch.id)} />
                      {CHANNEL_ICONS[ch.channel_type] ?? "•"} {ch.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="r-subject" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Template Assunto (opcional)</label>
                <input id="r-subject" type="text" value={rSubject} onChange={(e) => setRSubject(e.target.value)} placeholder="[{{severity}}] {{event_source}}" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="r-body" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Template Corpo (opcional)</label>
                <textarea id="r-body" value={rBody} onChange={(e) => setRBody(e.target.value)} rows={3} placeholder="Evento: {{event_source}}\nSeveridade: {{severity}}" className="w-full rounded-md px-3 py-2 text-[12px] font-mono" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <button
                onClick={handleCreateRule}
                disabled={!rName || rChannels.length === 0}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: COLORS.teal, color: COLORS.bg, cursor: !rName || rChannels.length === 0 ? "not-allowed" : "pointer" }}
              >
                Criar Regra
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
