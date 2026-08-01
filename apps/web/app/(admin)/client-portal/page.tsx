// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback } from "react";
import {
  Users,
  Plus,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  ShieldCheck,
  Clock,
  Trash2,
  ExternalLink,
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

interface PortalUser {
  id: string;
  email: string;
  contact_name: string;
  company_name: string | null;
  phone: string | null;
  can_view_incidents: boolean;
  can_view_sla: boolean;
  can_view_services: boolean;
  can_create_tickets: boolean;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface PortalOverview {
  services: { total: string; operational: string; degraded: string; down: string };
  incidents: { total_30d: string; open: string; critical_open: string };
  sla: { avg_percentage: string };
  recent_incidents: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    started_at: string;
    resolved_at: string | null;
    duration_minutes: string;
  }>;
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

export default function ClientPortalPage() {
  const { data: usersData, mutate: mutateUsers } = useApi<{ users: PortalUser[] }>("/api/v1/client-portal/users");
  const { data: overviewData, mutate: mutateOverview } = useApi<{ data: PortalOverview }>("/api/v1/client-portal/overview");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: "",
    contact_name: "",
    company_name: "",
    phone: "",
    can_view_incidents: true,
    can_view_sla: true,
    can_view_services: true,
    can_create_tickets: false,
  });

  const users = usersData?.users ?? [];
  const overview = overviewData?.data;

  const handleCreate = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/v1/client-portal/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          company_name: form.company_name || null,
          phone: form.phone || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuccess(`Usuário criado. Token de acesso: ${data.portal_token}`);
        setShowForm(false);
        setForm({ email: "", contact_name: "", company_name: "", phone: "", can_view_incidents: true, can_view_sla: true, can_view_services: true, can_create_tickets: false });
        mutateUsers();
        mutateOverview();
      } else {
        const data = await res.json();
        setError(data?.error?.message ?? "Erro ao criar usuário");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }, [form, mutateUsers, mutateOverview]);

  const handleDeactivate = useCallback(async (id: string) => {
    try {
      await fetch(`/api/v1/client-portal/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      mutateUsers();
    } catch {
      // Silencioso
    }
  }, [mutateUsers]);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            <Users size={18} className="inline mr-1" /> Client Portal
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Portal do cliente · Módulo ativável por tenant
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { mutateUsers(); mutateOverview(); }} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: `${COLORS.muted}15`, border: `1px solid ${COLORS.muted}`, color: COLORS.muted, cursor: "pointer" }}>
            <RefreshCw size={12} /> Atualizar
          </button>
          <button onClick={() => setShowForm(!showForm)} className="text-[12px] px-3 py-1.5 rounded font-bold flex items-center gap-2" style={{ background: COLORS.teal, color: "white", cursor: "pointer" }}>
            <Plus size={12} /> Novo Cliente
          </button>
        </div>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: COLORS.red }}>{error}</div>}
      {success && <div className="rounded-md p-3 text-sm" style={{ background: "var(--status-ok-bg)", border: "1px solid var(--status-ok-border)", color: COLORS.green }}>{success}</div>}

      {/* Overview Cards */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <OverviewCard label="Serviços OK" value={overview.services.operational} total={overview.services.total} icon={<CheckCircle2 size={14} />} color={COLORS.green} />
          <OverviewCard label="Degradados" value={overview.services.degraded} total={overview.services.total} icon={<AlertTriangle size={14} />} color={COLORS.amber} />
          <OverviewCard label="Incidentes Abertos" value={overview.incidents.open} total={overview.incidents.total_30d} icon={<XCircle size={14} />} color={COLORS.red} />
          <OverviewCard label="SLA Médio" value={parseFloat(overview.sla.avg_percentage).toFixed(2) + "%"} icon={<ShieldCheck size={14} />} color={COLORS.teal} />
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl p-6 space-y-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <h3 className="text-sm font-bold" style={{ color: COLORS.teal }}>Novo Usuário do Portal</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Email *</label>
              <input style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="cliente@empresa.com" />
            </div>
            <div>
              <label style={labelStyle}>Nome do Contato *</label>
              <input style={inputStyle} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Empresa</label>
              <input style={inputStyle} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Telefone</label>
              <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={form.can_view_incidents} onChange={(e) => setForm({ ...form, can_view_incidents: e.target.checked })} /> Ver Incidentes
            </label>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={form.can_view_sla} onChange={(e) => setForm({ ...form, can_view_sla: e.target.checked })} /> Ver SLA
            </label>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={form.can_view_services} onChange={(e) => setForm({ ...form, can_view_services: e.target.checked })} /> Ver Serviços
            </label>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.text }}>
              <input type="checkbox" checked={form.can_create_tickets} onChange={(e) => setForm({ ...form, can_create_tickets: e.target.checked })} /> Criar Tickets
            </label>
          </div>
          <button onClick={handleCreate} disabled={saving || !form.email || !form.contact_name} className="px-4 py-1.5 rounded text-[12px] font-bold flex items-center gap-2" style={{ background: COLORS.teal, color: "white", cursor: "pointer", opacity: (saving || !form.email || !form.contact_name) ? 0.5 : 1 }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Criar
          </button>
        </div>
      )}

      {/* Users List */}
      <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
          <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Clientes do Portal ({users.length})</h3>
        </div>
        <div className="divide-y" style={{ borderColor: COLORS.border }}>
          {users.map((u) => (
            <div key={u.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${COLORS.teal}15`, color: COLORS.teal }}>
                  {u.contact_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-[12px] font-bold" style={{ color: COLORS.text }}>
                    {u.contact_name}
                    {!u.is_active && <span className="ml-2 text-[10px] uppercase" style={{ color: COLORS.muted }}>(inativo)</span>}
                  </p>
                  <p className="text-[10px]" style={{ color: COLORS.muted }}>{u.email} · {u.company_name ?? "—"}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {u.can_view_incidents && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${COLORS.blue}15`, color: COLORS.blue }}>Incidentes</span>}
                    {u.can_view_sla && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${COLORS.teal}15`, color: COLORS.teal }}>SLA</span>}
                    {u.can_view_services && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${COLORS.green}15`, color: COLORS.green }}>Serviços</span>}
                    {u.can_create_tickets && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${COLORS.amber}15`, color: COLORS.amber }}>Tickets</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {u.last_login_at && (
                  <span className="text-[10px]" style={{ color: COLORS.muted }}>
                    <Clock size={10} className="inline mr-1" />
                    {new Date(u.last_login_at).toLocaleDateString("pt-BR")}
                  </span>
                )}
                {u.is_active && (
                  <button onClick={() => handleDeactivate(u.id)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}`, color: COLORS.red, cursor: "pointer" }}>
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <div className="p-6 text-center">
              <p className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum cliente cadastrado no portal</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Incidents (Client View) */}
      {overview && overview.recent_incidents.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <div className="p-4 border-b" style={{ borderColor: COLORS.border }}>
            <h3 className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Incidentes Recentes (30 dias)</h3>
          </div>
          <div className="divide-y" style={{ borderColor: COLORS.border }}>
            {overview.recent_incidents.map((inc) => (
              <div key={inc.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity size={14} style={{ color: inc.severity === "critical" ? COLORS.red : inc.severity === "warning" ? COLORS.amber : COLORS.muted }} />
                  <div>
                    <p className="text-[12px] font-bold" style={{ color: COLORS.text }}>{inc.title}</p>
                    <p className="text-[10px]" style={{ color: COLORS.muted }}>
                      {new Date(inc.started_at).toLocaleString("pt-BR")} · {inc.status}
                    </p>
                  </div>
                </div>
                <span className="text-[10px]" style={{ color: COLORS.muted }}>
                  {parseFloat(inc.duration_minutes).toFixed(0)} min
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewCard({ label, value, total, icon, color }: { label: string; value: string; total?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
      <div className="text-[10px] font-bold uppercase mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        {icon} {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
        {total && <span className="text-sm font-normal ml-1" style={{ color: "var(--text-muted)" }}>/ {total}</span>}
      </div>
    </div>
  );
}
