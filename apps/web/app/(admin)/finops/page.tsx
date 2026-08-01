// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback } from "react";
import {
  DollarSign,
  Plus,
  Save,
  Loader2,
  RefreshCw,
  TrendingDown,
  Target,
  CheckCircle2,
  PiggyBank,
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

interface FinOpsStats {
  total_cost_year: string;
  potential_savings_annual: string;
  implemented_savings_monthly: string;
  pending_optimizations: number;
  total_budget_year: string;
}

interface CostOptimization {
  id: string;
  category: string;
  resource_name: string | null;
  title: string;
  description: string | null;
  estimated_savings_monthly: string;
  estimated_savings_annual: string;
  currency: string;
  effort: string;
  status: string;
  actual_savings_monthly: string | null;
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

const STATUS_COLORS: Record<string, string> = {
  identified: COLORS.blue,
  approved: COLORS.teal,
  in_progress: COLORS.amber,
  implemented: COLORS.green,
  rejected: COLORS.muted,
};

const formatCurrency = (value: string | number | null, currency: string = "BRL"): string => {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(num);
};

export default function FinOpsPage() {
  const { data: statsData, mutate: mutateStats } = useApi<FinOpsStats>("/api/v1/finops/stats");
  const { data: optData, mutate: mutateOpts } = useApi<{ optimizations: CostOptimization[] }>("/api/v1/finops/optimizations");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    category: "compute",
    resource_name: "",
    description: "",
    estimated_savings_monthly: "",
    effort: "medium",
  });

  const stats = statsData;
  const optimizations = optData?.optimizations ?? [];

  const handleCreate = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const monthly = parseFloat(form.estimated_savings_monthly);
      if (isNaN(monthly)) {
        setError("Valor de economia mensal inválido");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/v1/finops/optimizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title,
          category: form.category,
          resource_name: form.resource_name || undefined,
          description: form.description || undefined,
          estimated_savings_monthly: monthly,
          estimated_savings_annual: monthly * 12,
          effort: form.effort,
        }),
      });
      if (res.ok) {
        setSuccess("Otimização criada");
        setShowForm(false);
        setForm({ title: "", category: "compute", resource_name: "", description: "", estimated_savings_monthly: "", effort: "medium" });
        mutateOpts();
        mutateStats();
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao criar");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }, [form, mutateOpts, mutateStats]);

  const handleStatusChange = useCallback(async (id: string, status: string) => {
    await fetch(`/api/v1/finops/optimizations/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    mutateOpts();
    mutateStats();
  }, [mutateOpts, mutateStats]);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            <DollarSign size={18} className="inline mr-1" /> FinOps / Cost Optimization
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Rastreamento de custos · Otimizações · Orçamentos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { mutateStats(); mutateOpts(); }} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
            <RefreshCw size={12} /> Atualizar
          </button>
          <button onClick={() => setShowForm(!showForm)} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: COLORS.teal, color: "white", cursor: "pointer" }}>
            <Plus size={12} /> Nova Otimização
          </button>
        </div>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: COLORS.red }}>{error}</div>}
      {success && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-ok-bg)", border: "1px solid var(--status-ok-border)", color: COLORS.green }}>{success}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Custo Ano" value={formatCurrency(stats.total_cost_year)} color={COLORS.text} icon={<DollarSign size={14} />} />
          <StatCard label="Economia Potencial" value={formatCurrency(stats.potential_savings_annual)} color={COLORS.green} icon={<PiggyBank size={14} />} />
          <StatCard label="Economia Implementada/mês" value={formatCurrency(stats.implemented_savings_monthly)} color={COLORS.teal} icon={<TrendingDown size={14} />} />
          <StatCard label="Otimizações Pendentes" value={stats.pending_optimizations} color={COLORS.amber} icon={<Target size={14} />} />
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl p-6 space-y-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <h3 className="text-sm font-bold" style={{ color: COLORS.teal }}>Nova Otimização de Custo</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Título *</label>
              <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ex: Reduzir instâncias EC2 ociosas" />
            </div>
            <div>
              <label style={labelStyle}>Categoria *</label>
              <select style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="compute">Compute</option>
                <option value="storage">Storage</option>
                <option value="network">Network</option>
                <option value="database">Database</option>
                <option value="licensing">Licensing</option>
                <option value="cloud">Cloud</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Recurso</label>
              <input style={inputStyle} value={form.resource_name} onChange={(e) => setForm({ ...form, resource_name: e.target.value })} placeholder="ex: ec2-prod-web-01" />
            </div>
            <div>
              <label style={labelStyle}>Economia Mensal Estimada (R$) *</label>
              <input type="number" style={inputStyle} value={form.estimated_savings_monthly} onChange={(e) => setForm({ ...form, estimated_savings_monthly: e.target.value })} placeholder="500.00" />
            </div>
            <div>
              <label style={labelStyle}>Esforço</label>
              <select style={inputStyle} value={form.effort} onChange={(e) => setForm({ ...form, effort: e.target.value })}>
                <option value="low">Baixo</option>
                <option value="medium">Médio</option>
                <option value="high">Alto</option>
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Descrição</label>
            <textarea style={{ ...inputStyle, minHeight: "60px" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <button onClick={handleCreate} disabled={saving || !form.title} className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2" style={{ background: COLORS.teal, color: "white", cursor: "pointer", opacity: (saving || !form.title) ? 0.5 : 1 }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Criar Otimização
          </button>
        </div>
      )}

      {/* Optimizations List */}
      <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
          <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Otimizações ({optimizations.length})</h3>
        </div>
        <div className="divide-y" style={{ borderColor: COLORS.border }}>
          {optimizations.map((opt) => {
            const statusColor = STATUS_COLORS[opt.status] ?? COLORS.muted;
            return (
              <div key={opt.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: `${COLORS.green}15` }}>
                      <PiggyBank size={14} style={{ color: COLORS.green }} />
                    </div>
                    <div>
                      <p className="text-[12px] font-bold" style={{ color: COLORS.text }}>{opt.title}</p>
                      <p className="text-[10px]" style={{ color: COLORS.muted }}>
                        {opt.category} · {opt.resource_name ?? "—"} · Esforço: {opt.effort}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold" style={{ color: COLORS.green }}>
                      {formatCurrency(opt.estimated_savings_annual, opt.currency)}/ano
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${statusColor}15`, color: statusColor }}>
                      {opt.status}
                    </span>
                  </div>
                </div>
                {opt.description && (
                  <p className="text-[11px] mb-2" style={{ color: COLORS.muted }}>{opt.description}</p>
                )}
                <div className="flex items-center gap-2">
                  {opt.status === "identified" && (
                    <button onClick={() => handleStatusChange(opt.id, "approved")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.teal}15`, border: `1px solid ${COLORS.teal}`, color: COLORS.teal, cursor: "pointer" }}>
                      Aprovar
                    </button>
                  )}
                  {opt.status === "approved" && (
                    <button onClick={() => handleStatusChange(opt.id, "in_progress")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.amber}15`, border: `1px solid ${COLORS.amber}`, color: COLORS.amber, cursor: "pointer" }}>
                      Iniciar
                    </button>
                  )}
                  {opt.status === "in_progress" && (
                    <button onClick={() => handleStatusChange(opt.id, "implemented")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.green}15`, border: `1px solid ${COLORS.green}`, color: COLORS.green, cursor: "pointer" }}>
                      <CheckCircle2 size={10} /> Implementado
                    </button>
                  )}
                  {opt.status !== "rejected" && opt.status !== "implemented" && (
                    <button onClick={() => handleStatusChange(opt.id, "rejected")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
                      Rejeitar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {optimizations.length === 0 && (
            <div className="p-6 text-center">
              <PiggyBank size={24} className="mx-auto mb-2" style={{ color: COLORS.muted }} />
              <p className="text-[12px]" style={{ color: COLORS.muted }}>Nenhuma otimização identificada</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number | string; color: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
      <div className="text-[10px] font-bold uppercase mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        {icon} {label}
      </div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
