"use client";

import { useState } from "react";
import {RefreshCw, ArrowLeft, Plus } from "lucide-react";
import { LoadingState } from "@/components/ui/state-display";
import { useApi } from "@/lib/use-api";

const COLORS = {
  bg: "var(--surface-0)",
  card: "var(--surface-2)",
  cardHover: "var(--surface-hover)",
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

const ACTION_COLORS: Record<string, string> = {
  ACCEPT: COLORS.green,
  DROP: COLORS.red,
  REJECT: COLORS.red,
  LOG: COLORS.amber,
  DNAT: COLORS.blue,
  SNAT: COLORS.blue,
  MASQUERADE: COLORS.purple,
};

const BACKEND_COLORS: Record<string, string> = {
  iptables: COLORS.amber,
  nftables: COLORS.blue,
  ufw: COLORS.green,
};

interface FirewallRule {
  id: string;
  host: string;
  backend: string;
  chain: string;
  action: string;
  protocol: string | null;
  source_ip: string | null;
  source_port: string | null;
  destination_ip: string | null;
  destination_port: string | null;
  interface_in: string | null;
  interface_out: string | null;
  state: string | null;
  priority: number;
  is_enabled: boolean;
  description: string | null;
  created_at: string;
}

interface FirewallChange {
  id: string;
  host: string;
  change_type: string;
  status: string;
  rules_applied: number;
  diff_after: unknown;
  stdout: string | null;
  stderr: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface DryRunResult {
  host: string;
  dry_run: boolean;
  rules_count: number;
  commands: { rule_id: string; command: string; description: string | null }[];
}

interface ApplyResult {
  host: string;
  dry_run: boolean;
  rules_count: number;
  commands: { rule_id: string; command: string; description: string | null }[];
  stdout: string;
  stderr: string;
  duration_ms: number;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function FirewallPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"rules" | "changes">("rules");
  const [hostFilter, setHostFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  // Create form
  const [formHost, setFormHost] = useState("");
  const [formBackend, setFormBackend] = useState("iptables");
  const [formChain, setFormChain] = useState("INPUT");
  const [formAction, setFormAction] = useState("ACCEPT");
  const [formProtocol, setFormProtocol] = useState("");
  const [formSourceIp, setFormSourceIp] = useState("");
  const [formDestIp, setFormDestIp] = useState("");
  const [formDestPort, setFormDestPort] = useState("");
  const [formInterface, setFormInterface] = useState("");
  const [formPriority, setFormPriority] = useState(100);
  const [formDescription, setFormDescription] = useState("");

  const fwParams = new URLSearchParams();
  if (hostFilter) fwParams.set("host", hostFilter);
  const chParams = new URLSearchParams();
  if (hostFilter) chParams.set("host", hostFilter);
  chParams.set("limit", "50");

  const { data: rData, mutate: mutateRules } = useApi<{ rules: FirewallRule[] }>(`/api/firewall?${fwParams.toString()}`);
  const { data: cData, mutate: mutateChanges } = useApi<{ changes: FirewallChange[] }>(`/api/firewall/changes?${chParams.toString()}`);

  const rules = rData?.rules ?? [];
  const changes = cData?.changes ?? [];
  const loading = false;

  async function handleCreate() {
    setError(null);
    try {
      const res = await fetch("/api/firewall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          host: formHost,
          backend: formBackend,
          chain: formChain,
          action: formAction,
          protocol: formProtocol || undefined,
          source_ip: formSourceIp || undefined,
          destination_ip: formDestIp || undefined,
          destination_port: formDestPort || undefined,
          interface_in: formInterface || undefined,
          priority: formPriority,
          description: formDescription || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar regra");
        return;
      }
      setSuccess("Regra criada com sucesso!");
      setShowCreate(false);
      setFormHost(""); setFormSourceIp(""); setFormDestIp(""); setFormDestPort(""); setFormInterface(""); setFormDescription("");
      mutateRules();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleDelete(ruleId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/firewall/${ruleId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Erro ao remover regra");
        return;
      }
      setSuccess("Regra removida");
      mutateRules();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleDryRun() {
    if (!hostFilter) {
      setError("Selecione um host para executar o dry-run");
      return;
    }
    setError(null);
    setDryRunResult(null);
    try {
      const res = await fetch("/api/firewall/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ host: hostFilter, dry_run: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro no dry-run");
        return;
      }
      setDryRunResult(data);
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleApply(dryRun: boolean) {
    if (!hostFilter) {
      setError("Selecione um host para aplicar");
      return;
    }
    setError(null);
    setApplyResult(null);
    try {
      const res = await fetch("/api/firewall/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ host: hostFilter, dry_run: dryRun }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao aplicar");
        return;
      }
      setApplyResult(data);
      setSuccess(dryRun ? "Dry-run executado" : "Regras aplicadas com sucesso");
      mutateChanges();
    } catch {
      setError("Erro de conexão");
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
            Firewall — Gerenciamento de Regras
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            iptables / nftables / ufw · dry-run com diff visual
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="text-[12px] px-3 py-1.5 rounded font-bold"
            style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}
          ><Plus size={12} className="inline" /> Nova Regra</button>
          <button
            onClick={() => { mutateRules(); mutateChanges(); }}
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

      {/* Host filter + actions */}
      <div
        className="rounded-xl p-4 flex flex-wrap items-end gap-4"
        style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
      >
        <div className="space-y-1">
          <label htmlFor="fw-host-filter" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>
            Host
          </label>
          <input
            id="fw-host-filter"
            type="text"
            value={hostFilter}
            onChange={(e) => setHostFilter(e.target.value)}
            placeholder="server01.local"
            className="rounded-md px-3 py-1.5 text-[13px]"
            style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, width: 200 }}
          />
        </div>
        <button
          onClick={handleDryRun}
          disabled={!hostFilter}
          className="px-4 py-1.5 rounded-md text-[13px] font-bold disabled:opacity-50"
          style={{ background: COLORS.amber, color: COLORS.bg, cursor: !hostFilter ? "not-allowed" : "pointer" }}
        >
          🔍 Dry-Run
        </button>
        <button
          onClick={() => handleApply(true)}
          disabled={!hostFilter}
          className="px-4 py-1.5 rounded-md text-[13px] font-bold disabled:opacity-50"
          style={{ background: COLORS.blue, color: "#fff", cursor: !hostFilter ? "not-allowed" : "pointer" }}
        >
          📋 Dry-Run
        </button>
        <button
          onClick={() => handleApply(false)}
          disabled={!hostFilter}
          className="px-4 py-1.5 rounded-md text-[13px] font-bold disabled:opacity-50"
          style={{ background: COLORS.red, color: "#fff", cursor: !hostFilter ? "not-allowed" : "pointer" }}
        >
          ⚡ Aplicar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {([
          { key: "rules", label: `Regras (${rules.length})` },
          { key: "changes", label: "Histórico de Mudanças" },
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

      {/* Tab: Rules */}
      {tab === "rules" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {loading ? (
            <LoadingState label="Carregando regras..." />
          ) : rules.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhuma regra encontrada</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Host</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Backend</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Chain</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Action</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Proto</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Src</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Dst</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Port</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Prio</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: `1px solid ${COLORS.border}`, opacity: r.is_enabled ? 1 : 0.4 }}
                  >
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{r.host}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${BACKEND_COLORS[r.backend] ?? COLORS.muted}15`, color: BACKEND_COLORS[r.backend] ?? COLORS.muted }}>
                        {r.backend}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{r.chain}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: `${ACTION_COLORS[r.action] ?? COLORS.muted}15`, color: ACTION_COLORS[r.action] ?? COLORS.muted }}>
                        {r.action}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{r.protocol ?? "—"}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{r.source_ip ?? "any"}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{r.destination_ip ?? "any"}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{r.destination_port ?? "—"}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{r.priority}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="px-2 py-1 rounded text-[10px] font-bold"
                        style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Changes */}
      {tab === "changes" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {changes.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhuma mudança registrada</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Quando</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Host</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tipo</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Status</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Regras</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Duração</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((ch) => (
                  <tr key={ch.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(ch.created_at)}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{ch.host}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: ch.change_type === "apply" ? COLORS.red : ch.change_type === "dry_run" ? COLORS.amber : COLORS.blue }}>
                        {ch.change_type}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: ch.status === "success" ? COLORS.green : COLORS.red }}>{ch.status}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{ch.rules_applied}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{ch.duration_ms ? `${ch.duration_ms}ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Dry-run result */}
      {dryRunResult && (
        <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid var(--status-warning-border)` }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold" style={{ color: COLORS.amber }}>
              🔍 Dry-Run: {dryRunResult.host} ({dryRunResult.rules_count} regras)
            </h3>
            <button onClick={() => setDryRunResult(null)} className="text-[14px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
          </div>
          <div className="space-y-1">
            {dryRunResult.commands.map((cmd, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span className="text-[10px] mt-0.5" style={{ color: COLORS.muted }}>{i + 1}</span>
                <code className="text-[11px] flex-1" style={{ color: COLORS.teal }}>{cmd.command}</code>
                {cmd.description && <span className="text-[10px]" style={{ color: COLORS.muted }}>{cmd.description}</span>}
              </div>
            ))}
            {dryRunResult.commands.length === 0 && (
              <div className="text-[12px] p-2" style={{ color: COLORS.muted }}>Nenhuma regra ativa para este host</div>
            )}
          </div>
        </div>
      )}

      {/* Apply result */}
      {applyResult && (
        <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${applyResult.dry_run ? COLORS.blue + "44" : COLORS.red + "44"}` }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold" style={{ color: applyResult.dry_run ? COLORS.blue : COLORS.red }}>
              {applyResult.dry_run ? "📋 Dry-Run" : "⚡ Aplicação"}: {applyResult.host}
            </h3>
            <button onClick={() => setApplyResult(null)} className="text-[14px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
          </div>
          <div className="space-y-2">
            <div className="text-[12px]" style={{ color: COLORS.muted }}>
              {applyResult.rules_count} regra(s) · {applyResult.duration_ms}ms
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>stdout</div>
              <pre className="p-2 rounded text-[11px] overflow-x-auto" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.green }}>
                {applyResult.stdout}
              </pre>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase mb-1" style={{ color: COLORS.muted }}>stderr</div>
              <pre className="p-2 rounded text-[11px] overflow-x-auto" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.amber }}>
                {applyResult.stderr}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar regra */}
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
            className="rounded-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Nova Regra de Firewall</h2>
              <button onClick={() => setShowCreate(false)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="fw-host" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Host</label>
                <input id="fw-host" type="text" value={formHost} onChange={(e) => setFormHost(e.target.value)} placeholder="server01.local" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label htmlFor="fw-backend" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Backend</label>
                  <select id="fw-backend" value={formBackend} onChange={(e) => setFormBackend(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="iptables">iptables</option>
                    <option value="nftables">nftables</option>
                    <option value="ufw">ufw</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="fw-chain" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Chain</label>
                  <select id="fw-chain" value={formChain} onChange={(e) => setFormChain(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="INPUT">INPUT</option>
                    <option value="OUTPUT">OUTPUT</option>
                    <option value="FORWARD">FORWARD</option>
                    <option value="PREROUTING">PREROUTING</option>
                    <option value="POSTROUTING">POSTROUTING</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="fw-action" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Action</label>
                  <select id="fw-action" value={formAction} onChange={(e) => setFormAction(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="ACCEPT">ACCEPT</option>
                    <option value="DROP">DROP</option>
                    <option value="REJECT">REJECT</option>
                    <option value="LOG">LOG</option>
                    <option value="DNAT">DNAT</option>
                    <option value="SNAT">SNAT</option>
                    <option value="MASQUERADE">MASQUERADE</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="fw-proto" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Protocolo</label>
                  <select id="fw-proto" value={formProtocol} onChange={(e) => setFormProtocol(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="">Qualquer</option>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="icmp">ICMP</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="fw-priority" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Prioridade</label>
                  <input id="fw-priority" type="number" value={formPriority} onChange={(e) => setFormPriority(parseInt(e.target.value, 10) || 100)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="fw-src-ip" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Source IP</label>
                  <input id="fw-src-ip" type="text" value={formSourceIp} onChange={(e) => setFormSourceIp(e.target.value)} placeholder="0.0.0.0/0" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="fw-dst-ip" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Destination IP</label>
                  <input id="fw-dst-ip" type="text" value={formDestIp} onChange={(e) => setFormDestIp(e.target.value)} placeholder="0.0.0.0/0" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="fw-dst-port" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Destination Port</label>
                  <input id="fw-dst-port" type="text" value={formDestPort} onChange={(e) => setFormDestPort(e.target.value)} placeholder="80, 443, 1000:2000" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="fw-iface" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Interface (in)</label>
                  <input id="fw-iface" type="text" value={formInterface} onChange={(e) => setFormInterface(e.target.value)} placeholder="eth0" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="fw-desc" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Descrição</label>
                <input id="fw-desc" type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Permitir HTTP/HTTPS" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <button
                onClick={handleCreate}
                disabled={!formHost}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: COLORS.teal, color: COLORS.bg, cursor: !formHost ? "not-allowed" : "pointer" }}
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
