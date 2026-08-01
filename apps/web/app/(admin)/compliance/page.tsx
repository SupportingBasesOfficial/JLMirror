// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import { RefreshCw, ArrowLeft } from "lucide-react";
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

const FRAMEWORKS = ["cis", "nist", "iso27001", "pci_dss", "hipaa", "gdpr", "lgpd", "soc2", "custom"];
const CATEGORIES = ["access_control", "encryption", "logging", "network_security", "data_protection", "vulnerability_management", "incident_response", "change_management", "backup", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];
const RULE_TYPES = ["manual", "automated", "scheduled"];
const VIOLATION_STATUSES = ["open", "acknowledged", "remediated", "false_positive", "wont_fix"];

const FRAMEWORK_COLORS: Record<string, string> = {
  cis: COLORS.blue, nist: COLORS.purple, iso27001: COLORS.teal, pci_dss: COLORS.red,
  hipaa: COLORS.amber, gdpr: COLORS.green, lgpd: COLORS.green, soc2: COLORS.blue, custom: COLORS.muted,
};

const SEVERITY_COLORS: Record<string, string> = {
  low: COLORS.muted, medium: COLORS.blue, high: COLORS.amber, critical: COLORS.red,
};

const STATUS_COLORS: Record<string, string> = {
  open: COLORS.red, acknowledged: COLORS.amber, remediated: COLORS.green,
  false_positive: COLORS.muted, wont_fix: COLORS.muted,
};

interface Policy {
  id: string;
  name: string;
  description: string | null;
  framework: string;
  policy_category: string;
  severity: string;
  rule_type: string;
  check_interval_hours: number;
  is_active: boolean;
  last_scanned_at: string | null;
}

interface Scan {
  id: string;
  policy_id: string;
  policy_name: string;
  framework: string;
  status: string;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  compliance_score: number | null;
  duration_ms: number | null;
  created_at: string;
}

interface Violation {
  id: string;
  policy_id: string;
  policy_name: string;
  framework: string;
  check_name: string;
  check_description: string | null;
  severity: string;
  status: string;
  remediation_steps: string | null;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
}

interface ComplianceStats {
  overview: { active_policies: string; total_policies: string; frameworks_covered: string };
  violations: { open_violations: string; critical_open: string; high_open: string; remediated: string; total_violations: string };
  by_framework: { framework: string; policy_count: string; open_violations: string; remediated: string }[];
  scans: { total_scans: string; avg_score: string | null; best_score: string | null; worst_score: string | null };
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CompliancePage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "policies" | "violations" | "scans">("overview");
  const [showPolicy, setShowPolicy] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");

  // Policy form
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pFramework, setPFramework] = useState("cis");
  const [pCategory, setPCategory] = useState("access_control");
  const [pSeverity, setPSeverity] = useState("medium");
  const [pRuleType, setPRuleType] = useState("automated");
  const [pInterval, setPInterval] = useState(24);

  const violationsQuery = (() => {
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterSeverity) params.set("severity", filterSeverity);
    const qs = params.toString();
    return qs ? `/api/compliance/violations?${qs}` : "/api/compliance/violations";
  })();
  const { data: polData, isLoading: loading, mutate: mutatePolicies } = useApi<{ policies: Policy[] }>("/api/compliance/policies");
  const { data: scanData, mutate: mutateScans } = useApi<{ scans: Scan[] }>("/api/compliance/scans?limit=20");
  const { data: vioData, mutate: mutateViolations } = useApi<{ violations: Violation[] }>(violationsQuery);
  const { data: stats, mutate: mutateStats } = useApi<ComplianceStats>("/api/compliance/stats");
  const policies = polData?.policies ?? [];
  const scans = scanData?.scans ?? [];
  const violations = vioData?.violations ?? [];

  async function handleCreatePolicy() {
    setError(null);
    try {
      const res = await fetch("/api/compliance/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: pName, description: pDesc || undefined, framework: pFramework,
          policy_category: pCategory, severity: pSeverity, rule_type: pRuleType,
          rule_config: {}, check_interval_hours: pInterval, is_active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Erro ao criar política"); return; }
      setSuccess("Política criada!");
      setShowPolicy(false);
      setPName(""); setPDesc("");
      mutatePolicies(); mutateStats();
    } catch { setError("Erro de conexão"); }
  }

  async function handleRunScan(policyId: string) {
    setError(null);
    try {
      const res = await fetch("/api/compliance/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ policy_id: policyId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Erro ao executar scan"); return; }
      setSuccess(`Scan concluído! Score: ${data.compliance_score?.toFixed(1)}%`);
      mutateScans(); mutateViolations(); mutateStats();
    } catch { setError("Erro de conexão"); }
  }

  async function handleDeletePolicy(id: string) {
    try {
      const res = await fetch(`/api/compliance/policies/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { mutatePolicies(); mutateStats(); }
    } catch { /* Ignora */ }
  }

  async function handleUpdateViolation(violationId: string, newStatus: string) {
    try {
      const res = await fetch(`/api/compliance/violations/${violationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) { mutateViolations(); mutateStats(); }
    } catch { /* Ignora */ }
  }

  if (!polData && !scanData && !stats) return <LoadingState label="Carregando compliance..." />;

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            Compliance — Políticas & Auditoria
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            CIS · NIST · ISO 27001 · PCI-DSS · HIPAA · GDPR · LGPD · SOC2
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "policies" && (
            <button onClick={() => setShowPolicy(true)} className="text-[12px] px-3 py-1.5 rounded font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}>
              + Política
            </button>
          )}
          <button onClick={() => { mutatePolicies(); mutateScans(); mutateViolations(); mutateStats(); }} className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}>
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
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Políticas Ativas</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>{stats.overview.active_policies}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.overview.frameworks_covered} frameworks</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-error-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Violações Abertas</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.red }}>{stats.violations.open_violations}</div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.violations.critical_open} críticas · {stats.violations.high_open} altas</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid var(--status-ok-border)` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Remediadas</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.green }}>{stats.violations.remediated}</div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: COLORS.muted }}>Score Médio (30d)</div>
            <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>
              {stats.scans.avg_score ? `${parseFloat(stats.scans.avg_score).toFixed(1)}%` : "—"}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>{stats.scans.total_scans} scans</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {([
          { key: "overview", label: "Overview" },
          { key: "policies", label: `Políticas (${policies.length})` },
          { key: "violations", label: `Violações (${violations.length})` },
          { key: "scans", label: "Scans" },
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

      {/* Tab: Overview */}
      {tab === "overview" && stats && (
        <div className="space-y-4 rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          <div>
            <h3 className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>VIOLAÇÕES POR FRAMEWORK</h3>
            <div className="space-y-2">
              {stats.by_framework.map((row) => {
                const open = parseInt(row.open_violations ?? "0", 10);
                const remediated = parseInt(row.remediated ?? "0", 10);
                const total = open + remediated;
                const remediatedPct = total > 0 ? (remediated / total) * 100 : 0;
                return (
                  <div key={row.framework} className="flex items-center gap-3">
                    <span className="text-[12px] w-24" style={{ color: FRAMEWORK_COLORS[row.framework] ?? COLORS.muted }}>{row.framework.toUpperCase()}</span>
                    <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: COLORS.bg }}>
                      <div className="h-full flex" style={{ width: "100%" }}>
                        <div className="h-full" style={{ width: `${remediatedPct}%`, background: COLORS.green }} />
                        <div className="h-full" style={{ width: `${100 - remediatedPct}%`, background: COLORS.red }} />
                      </div>
                    </div>
                    <span className="text-[12px] w-24 text-right" style={{ color: COLORS.muted }}>
                      {open} abertas · {remediated} remediadas
                    </span>
                  </div>
                );
              })}
              {stats.by_framework.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Sem dados</div>}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Policies */}
      {tab === "policies" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {policies.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhuma política configurada</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Nome</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Framework</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Categoria</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Severidade</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Tipo</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Intervalo</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Último scan</th>
                  <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${COLORS.border}`, opacity: p.is_active ? 1 : 0.4 }}>
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>{p.name}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${FRAMEWORK_COLORS[p.framework] ?? COLORS.muted}15`, color: FRAMEWORK_COLORS[p.framework] ?? COLORS.muted }}>
                        {p.framework}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{p.policy_category}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${SEVERITY_COLORS[p.severity] ?? COLORS.muted}15`, color: SEVERITY_COLORS[p.severity] ?? COLORS.muted }}>
                        {p.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{p.rule_type}</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{p.check_interval_hours}h</td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(p.last_scanned_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleRunScan(p.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`, border: `1px solid var(--status-info-border)`, color: COLORS.blue, cursor: "pointer" }}>Scan</button>
                        <button onClick={() => handleDeletePolicy(p.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Violations */}
      {tab === "violations" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 items-end">
            <div className="space-y-1">
              <label htmlFor="v-status" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Status</label>
              <select id="v-status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md px-3 py-1.5 text-[12px]" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                <option value="">Todos</option>
                {VIOLATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="v-sev" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Severidade</label>
              <select id="v-sev" value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} className="rounded-md px-3 py-1.5 text-[12px]" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                <option value="">Todas</option>
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            {violations.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhuma violação encontrada</div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Check</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Framework</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Severidade</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Status</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Recurso</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Quando</th>
                    <th className="text-right px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}></th>
                  </tr>
                </thead>
                <tbody>
                  {violations.map((v) => (
                    <tr key={v.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: COLORS.teal }}>{v.check_name}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${FRAMEWORK_COLORS[v.framework] ?? COLORS.muted}15`, color: FRAMEWORK_COLORS[v.framework] ?? COLORS.muted }}>
                          {v.framework}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${SEVERITY_COLORS[v.severity] ?? COLORS.muted}15`, color: SEVERITY_COLORS[v.severity] ?? COLORS.muted }}>
                          {v.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLORS[v.status] ?? COLORS.muted}15`, color: STATUS_COLORS[v.status] ?? COLORS.muted }}>
                          {v.status}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{v.resource_type ?? "—"}{v.resource_id ? `:${v.resource_id}` : ""}</td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(v.created_at)}</td>
                      <td className="px-3 py-2 text-right">
                        {v.status === "open" && (
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => handleUpdateViolation(v.id, "acknowledged")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-warning-text) 12%, transparent)`, border: `1px solid var(--status-warning-border)`, color: COLORS.amber, cursor: "pointer" }}>Ack</button>
                            <button onClick={() => handleUpdateViolation(v.id, "remediated")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-ok-text) 12%, transparent)`, border: `1px solid var(--status-ok-border)`, color: COLORS.green, cursor: "pointer" }}>Remediate</button>
                            <button onClick={() => handleUpdateViolation(v.id, "false_positive")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--text-muted) 12%, transparent)`, border: `1px solid color-mix(in srgb, var(--text-muted) 27%, transparent)`, color: COLORS.muted, cursor: "pointer" }}>FP</button>
                          </div>
                        )}
                        {v.status === "acknowledged" && (
                          <button onClick={() => handleUpdateViolation(v.id, "remediated")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-ok-text) 12%, transparent)`, border: `1px solid var(--status-ok-border)`, color: COLORS.green, cursor: "pointer" }}>Remediate</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab: Scans */}
      {tab === "scans" && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "none" }}>
          {scans.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: COLORS.muted }}>Nenhum scan executado</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Política</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Framework</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Status</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Checks</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Score</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Duração</th>
                  <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: COLORS.muted }}>Quando</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => {
                  const score = s.compliance_score;
                  const scoreColor = score != null ? (score >= 80 ? COLORS.green : score >= 60 ? COLORS.amber : COLORS.red) : COLORS.muted;
                  return (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td className="px-3 py-2" style={{ color: COLORS.teal }}>{s.policy_name}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${FRAMEWORK_COLORS[s.framework] ?? COLORS.muted}15`, color: FRAMEWORK_COLORS[s.framework] ?? COLORS.muted }}>
                          {s.framework}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: s.status === "completed" ? `var(--status-ok-bg)` : `var(--status-warning-bg)`, color: s.status === "completed" ? COLORS.green : COLORS.amber }}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        <span style={{ color: COLORS.green }}>{s.passed_checks}</span> / <span style={{ color: COLORS.red }}>{s.failed_checks}</span> / {s.total_checks}
                      </td>
                      <td className="px-3 py-2" style={{ color: scoreColor }}>
                        {score != null ? `${score.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{s.duration_ms != null ? `${s.duration_ms}ms` : "—"}</td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>{formatTime(s.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Create policy */}
      {showPolicy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowPolicy(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowPolicy(false); }}
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
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Nova Política de Compliance</h2>
              <button onClick={() => setShowPolicy(false)} className="text-[16px]" style={{ color: COLORS.muted, cursor: "pointer" }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="p-name" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome</label>
                <input id="p-name" type="text" value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Password Policy (CIS 1.1)" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="p-desc" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Descrição (opcional)</label>
                <textarea id="p-desc" value={pDesc} onChange={(e) => setPDesc(e.target.value)} rows={2} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="p-fw" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Framework</label>
                  <select id="p-fw" value={pFramework} onChange={(e) => setPFramework(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    {FRAMEWORKS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="p-cat" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Categoria</label>
                  <select id="p-cat" value={pCategory} onChange={(e) => setPCategory(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label htmlFor="p-sev" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Severidade</label>
                  <select id="p-sev" value={pSeverity} onChange={(e) => setPSeverity(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="p-rt" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Tipo</label>
                  <select id="p-rt" value={pRuleType} onChange={(e) => setPRuleType(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    {RULE_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="p-int" className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Intervalo (h)</label>
                  <input id="p-int" type="number" value={pInterval} onChange={(e) => setPInterval(parseInt(e.target.value, 10) || 24)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                </div>
              </div>
              <button onClick={handleCreatePolicy} disabled={!pName} className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: COLORS.teal, color: COLORS.bg, cursor: !pName ? "not-allowed" : "pointer" }}>
                Criar Política
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
