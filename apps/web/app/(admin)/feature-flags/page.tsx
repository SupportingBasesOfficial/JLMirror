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

const FLAG_TYPES = ["boolean", "percentage", "variant", "kill_switch"];
const TYPE_COLORS: Record<string, string> = {
  boolean: COLORS.blue, percentage: COLORS.amber, variant: COLORS.purple, kill_switch: COLORS.red,
};

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  flag_type: string;
  is_active: boolean;
  default_value: unknown;
  rollout_percentage: number;
  variants: Array<{ key: string; value: unknown; weight: number }>;
  target_segments: string[];
  starts_at: string | null;
  ends_at: string | null;
  total_evaluations: number;
  true_evaluations: number;
  false_evaluations: number;
  created_at: string;
}

interface FlagEvent {
  id: string;
  flag_key: string;
  evaluated_value: unknown;
  created_at: string;
  user_id: string | null;
  flag_name: string | null;
}

interface Override {
  id: string;
  flag_id: string;
  target_type: string;
  target_id: string;
  value: unknown;
  reason: string | null;
  created_at: string;
}

interface FlagStats {
  overview: { total_flags: string; active_flags: string; boolean_flags: string; percentage_flags: string; variant_flags: string; kill_switches: string; total_evaluations: string; true_evaluations: string; false_evaluations: string };
  top_flags: { id: string; key: string; name: string; flag_type: string; is_active: boolean; rollout_percentage: number; total_evaluations: number; true_evaluations: number; false_evaluations: number }[];
  recent_events: FlagEvent[];
  overrides_count: string;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatValue(val: unknown): string {
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  return JSON.stringify(val);
}

export default function FeatureFlagsPage() {
  const { data: fData, mutate: mutateFlags } = useApi<{ flags: FeatureFlag[] }>("/api/feature-flags");
  const { data: stats, mutate: mutateStats } = useApi<FlagStats>("/api/feature-flags/stats");
  const flags = fData?.flags ?? [];
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [events, setEvents] = useState<FlagEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"flags" | "events" | "overrides">("flags");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);

  // Form
  const [fKey, setFKey] = useState("");
  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fType, setFType] = useState("boolean");
  const [fRollout, setFRollout] = useState(100);
  const [fDefault, setFDefault] = useState("false");

  // Override form
  const [oTargetType, setOTargetType] = useState("user");
  const [oTargetId, setOTargetId] = useState("");
  const [oValue, setOValue] = useState("true");
  const [oReason, setOReason] = useState("");

  async function fetchOverrides(flagId: string) {
    try {
      const res = await fetch(`/api/feature-flags/${flagId}/overrides`, { credentials: "include" });
      if (res.ok) { const data = await res.json(); setOverrides(data.overrides ?? []); }
    } catch { /* Ignora */ }
  }

  async function fetchEvents(flagId: string) {
    try {
      const res = await fetch(`/api/feature-flags/${flagId}/events?limit=20`, { credentials: "include" });
      if (res.ok) { const data = await res.json(); setEvents(data.events ?? []); }
    } catch { /* Ignora */ }
  }

  async function handleCreate() {
    setError(null);
    try {
      const defaultValue = fDefault === "true" ? true : fDefault === "false" ? false : fDefault;
      const res = await fetch("/api/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          key: fKey, name: fName, description: fDesc || undefined,
          flag_type: fType, default_value: defaultValue, rollout_percentage: fRollout,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Erro ao criar flag"); return; }
      setSuccess("Feature flag criada!");
      setShowCreate(false);
      setFKey(""); setFName(""); setFDesc(""); setFDefault("false"); setFRollout(100);
      mutateFlags(); mutateStats();
    } catch { setError("Erro de conexão"); }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      const res = await fetch(`/api/feature-flags/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: !active }),
      });
      if (res.ok) { mutateFlags(); mutateStats(); }
    } catch { /* Ignora */ }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/feature-flags/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { mutateFlags(); mutateStats(); }
    } catch { /* Ignora */ }
  }

  async function handleEvaluate(key: string) {
    try {
      const res = await fetch("/api/feature-flags/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Avaliação: ${data.key} = ${formatValue(data.value)} (${data.reason})`);
        mutateFlags(); mutateStats();
      }
    } catch { /* Ignora */ }
  }

  async function handleCreateOverride() {
    if (!selectedFlag) return;
    setError(null);
    try {
      const value = oValue === "true" ? true : oValue === "false" ? false : oValue;
      const res = await fetch(`/api/feature-flags/${selectedFlag}/overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          flag_id: selectedFlag, target_type: oTargetType,
          target_id: oTargetId, value, reason: oReason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Erro ao criar override"); return; }
      setSuccess("Override criado!");
      setOTargetId(""); setOReason("");
      fetchOverrides(selectedFlag); mutateStats();
    } catch { setError("Erro de conexão"); }
  }

  async function handleDeleteOverride(id: string) {
    try {
      const res = await fetch(`/api/feature-flags/overrides/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok && selectedFlag) { fetchOverrides(selectedFlag); mutateStats(); }
    } catch { /* Ignora */ }
  }

  function handleSelectFlag(flagId: string, flagTab: "events" | "overrides") {
    setSelectedFlag(flagId);
    setTab(flagTab);
    if (flagTab === "events") { fetchEvents(flagId); } else { fetchOverrides(flagId); }
  }

  if (!fData && !stats) return <LoadingState label="Carregando feature flags..." />;

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            Feature Flags — A/B Testing & Rollouts
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Flags Persistentes · Rollouts Progressivos · Segmentação · Métricas de Adoção
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="text-[12px] px-3 py-1.5 rounded font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}><Plus size={12} className="inline" /> Flag</button>
          <button onClick={() => { mutateFlags(); mutateStats(); }} className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}>
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
          <a href="/dashboard" className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}>
            <ArrowLeft size={12} className="inline" /> Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-error-bg)`, border: `1px solid var(--status-error-border)`, color: COLORS.red }}>{error}</div>
      )}
      {success && (
        <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-ok-bg)`, border: `1px solid var(--status-ok-border)`, color: COLORS.green }}>{success}</div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Flags</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>{stats.overview.total_flags}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.overview.active_flags} ativas</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-ok-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Avaliações</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.green }}>{stats.overview.total_evaluations}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.overview.true_evaluations} true / {stats.overview.false_evaluations} false</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid color-mix(in srgb, var(--status-info-text) 27%, transparent)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Variantes</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.purple }}>{stats.overview.variant_flags}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.overview.percentage_flags} percentage</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-warning-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Overrides</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>{stats.overrides_count}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.overview.kill_switches} kill switches</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {([
          { key: "flags", label: `Flags (${flags.length})` },
          { key: "events", label: selectedFlag ? "Eventos" : "Eventos Recentes" },
          { key: "overrides", label: "Overrides" },
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

      {/* Tab: Flags */}
      {tab === "flags" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {flags.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhuma feature flag criada</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Key</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Nome</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tipo</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Default</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Rollout</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Status</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Avaliações</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>True/False</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => (
                  <tr key={f.id} style={{ borderBottom: `1px solid ${COLORS.border}`, opacity: f.is_active ? 1 : 0.4 }}>
                    <td className="px-3 py-2" style={{ color: COLORS.blue }}>{f.key}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{f.name}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${TYPE_COLORS[f.flag_type] ?? COLORS.muted}15`, color: TYPE_COLORS[f.flag_type] ?? COLORS.muted }}>
                        {f.flag_type}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatValue(f.default_value)}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.amber }}>{f.rollout_percentage}%</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: f.is_active ? `var(--status-ok-bg)` : `color-mix(in srgb, var(--text-muted) 8%, transparent)`, color: f.is_active ? COLORS.green : COLORS.muted }}>
                        {f.is_active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{f.total_evaluations}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      <span style={{ color: COLORS.green }}>{f.true_evaluations}</span> / <span style={{ color: COLORS.red }}>{f.false_evaluations}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleEvaluate(f.key)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`, border: `1px solid var(--status-info-border)`, color: COLORS.blue, cursor: "pointer" }}>Eval</button>
                        <button onClick={() => handleSelectFlag(f.id, "events")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`, border: `1px solid color-mix(in srgb, var(--status-info-text) 27%, transparent)`, color: COLORS.purple, cursor: "pointer" }}>Events</button>
                        <button onClick={() => handleSelectFlag(f.id, "overrides")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-warning-text) 12%, transparent)`, border: `1px solid var(--status-warning-border)`, color: COLORS.amber, cursor: "pointer" }}>Override</button>
                        <button onClick={() => handleToggle(f.id, f.is_active)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-warning-text) 12%, transparent)`, border: `1px solid var(--status-warning-border)`, color: COLORS.amber, cursor: "pointer" }}>
                          {f.is_active ? "Disable" : "Enable"}
                        </button>
                        <button onClick={() => handleDelete(f.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Events */}
      {tab === "events" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {events.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>
              {selectedFlag ? "Nenhum evento para esta flag" : "Selecione uma flag e clique em 'Events'"}
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Flag</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Key</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Valor</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>User</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Data</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{e.flag_name ?? "—"}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.blue }}>{e.flag_key}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: e.evaluated_value === true ? `var(--status-ok-bg)` : `var(--status-error-bg)`, color: e.evaluated_value === true ? COLORS.green : COLORS.red }}>
                        {formatValue(e.evaluated_value)}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{e.user_id ? e.user_id.substring(0, 8) : "—"}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Overrides */}
      {tab === "overrides" && (
        <div className="space-y-4">
          {selectedFlag && (
            <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <div className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>NOVO OVERRIDE</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label htmlFor="ov-tt" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Target Type</label>
                  <select id="ov-tt" value={oTargetType} onChange={(e) => setOTargetType(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="user">User</option>
                    <option value="tenant">Tenant</option>
                    <option value="segment">Segment</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="ov-ti" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Target ID</label>
                  <input id="ov-ti" type="text" value={oTargetId} onChange={(e) => setOTargetId(e.target.value)} placeholder="UUID ou nome" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="ov-v" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Valor</label>
                  <select id="ov-v" value={oValue} onChange={(e) => setOValue(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="ov-r" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Razão</label>
                  <input id="ov-r" type="text" value={oReason} onChange={(e) => setOReason(e.target.value)} placeholder="QA testing" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <button onClick={handleCreateOverride} disabled={!oTargetId} className="mt-3 px-4 py-2 rounded-md text-[12px] font-bold disabled:opacity-50" style={{ background: COLORS.teal, color: COLORS.bg, cursor: !oTargetId ? "not-allowed" : "pointer" }}>
                Criar Override
              </button>
            </div>
          )}

          <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            {overrides.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>
                {selectedFlag ? "Nenhum override para esta flag" : "Selecione uma flag e clique em 'Override'"}
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Target Type</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Target ID</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Valor</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Razão</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Criado</th>
                    <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((o) => (
                    <tr key={o.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `color-mix(in srgb, var(--status-info-text) 8%, transparent)`, color: COLORS.purple }}>{o.target_type}</span>
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{o.target_id}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: o.value === true ? `var(--status-ok-bg)` : `var(--status-error-bg)`, color: o.value === true ? COLORS.green : COLORS.red }}>
                          {formatValue(o.value)}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{o.reason ?? "—"}</td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(o.created_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => handleDeleteOverride(o.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowCreate(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowCreate(false); }}
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
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Nova Feature Flag</h2>
              <button onClick={() => setShowCreate(false)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="ff-k" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Key (a-z0-9_)</label>
                <input id="ff-k" type="text" value={fKey} onChange={(e) => setFKey(e.target.value)} placeholder="new_dashboard" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="ff-n" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome</label>
                <input id="ff-n" type="text" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="New Dashboard" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="ff-d" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Descrição (opcional)</label>
                <input id="ff-d" type="text" value={fDesc} onChange={(e) => setFDesc(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="ff-t" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Tipo</label>
                  <select id="ff-t" value={fType} onChange={(e) => setFType(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    {FLAG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="ff-dv" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Default Value</label>
                  <select id="ff-dv" value={fDefault} onChange={(e) => setFDefault(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="ff-r" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Rollout Percentage: {fRollout}%</label>
                <input id="ff-r" type="range" min="0" max="100" value={fRollout} onChange={(e) => setFRollout(parseInt(e.target.value, 10))} className="w-full" style={{ accentColor: COLORS.teal }} />
              </div>
              <button onClick={handleCreate} disabled={!fKey || !fName} className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: COLORS.teal, color: COLORS.bg, cursor: !fKey || !fName ? "not-allowed" : "pointer" }}>
                Criar Flag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
