// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import {RefreshCw, ArrowLeft, Plus, Users, Mail, Phone, Shield, KeyRound, UserPlus, UserCog } from "lucide-react";
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
  active: COLORS.green, inactive: COLORS.muted, suspended: COLORS.red, migrating: COLORS.amber,
};

interface Tenant {
  id: string;
  name: string;
  cnpj: string | null;
  status: string;
  contract_end_date: string | null;
  cluster_id?: string;
  cluster_host?: string;
  schema_name?: string;
  route_status?: string;
  user_count?: number;
  created_at: string;
}

interface TenantUser {
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  assigned_at: string;
}

interface ClientContact {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string | null;
  department: string | null;
  is_primary: boolean;
  is_active: boolean;
  notes: string | null;
}

interface Stats {
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  total_users: number;
  active_users: number;
  total_tenant_users: number;
  total_routes: number;
  by_status: Array<Record<string, unknown>>;
  by_role: Array<Record<string, unknown>>;
  recent: Array<Record<string, unknown>>;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="p-4 rounded-xl" style={{ background: COLORS.card, border: `1px solid ${color}33` }}>
      <div className="text-[10px] uppercase font-bold mb-1" style={{ color: COLORS.muted }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] mt-1" style={{ color: COLORS.muted }}>{sub}</div>}
    </div>
  );
}

export default function AdminPage() {
  const { data: tData, mutate: mutateTenants } = useApi<{ tenants: Tenant[] }>("/api/admin/tenants");
  const { data: stats, mutate: mutateStats } = useApi<Stats>("/api/admin/stats/overview");
  const tenants = tData?.tenants ?? [];
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);

  // Create form
  const [crName, setCrName] = useState("");
  const [crCnpj, setCrCnpj] = useState("");
  const [crClusterId, setCrClusterId] = useState("cluster-0");
  const [crClusterHost, setCrClusterHost] = useState("localhost");
  const [crDbName, setCrDbName] = useState("jlmirror");
  const [crPort, setCrPort] = useState("5432");
  const [crZabbixGroupId, setCrZabbixGroupId] = useState("");
  const [crZabbixUrl, setCrZabbixUrl] = useState("https://zabbix.jlinformatica.com.br/api_jsonrpc.php");
  const [crZabbixToken, setCrZabbixToken] = useState("");

  // Edit form
  const [edName, setEdName] = useState("");
  const [edZabbixGroupId, setEdZabbixGroupId] = useState("");
  const [edZabbixUrl, setEdZabbixUrl] = useState("");
  const [edZabbixToken, setEdZabbixToken] = useState("");
  const [edSaving, setEdSaving] = useState(false);

  // User management
  const [showUsers, setShowUsers] = useState<Tenant | null>(null);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [cuEmail, setCuEmail] = useState("");
  const [cuFullName, setCuFullName] = useState("");
  const [cuPhone, setCuPhone] = useState("");
  const [cuRole, setCuRole] = useState("tenant:admin");
  const [cuPassword, setCuPassword] = useState("");
  const [cuMustChange, setCuMustChange] = useState(true);
  const [cuSaving, setCuSaving] = useState(false);

  // Contacts
  const [showContacts, setShowContacts] = useState<Tenant | null>(null);
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  async function handleCreate() {
    setError(null);
    if (!crName || !crZabbixToken) { setError("Nome e token Zabbix são obrigatórios"); return; }
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: crName, cnpj: crCnpj || undefined,
          cluster_id: crClusterId, cluster_host: crClusterHost,
          cluster_database_name: crDbName, cluster_port: parseInt(crPort, 10),
          zabbix_host_group_id: crZabbixGroupId, zabbix_api_url: crZabbixUrl, zabbix_api_token: crZabbixToken,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuccess(`Tenant criado! Schema: ${data.schema}`);
        setShowCreate(false);
        setCrName(""); setCrCnpj(""); setCrZabbixGroupId(""); setCrZabbixToken("");
        mutateTenants(); mutateStats();
      }
    } catch { setError("Erro de conexão"); }
  }

  function openEdit(t: Tenant) {
    setEditTenant(t);
    setEdName(t.name);
    setEdZabbixGroupId("");
    setEdZabbixUrl("https://zabbix.jlinformatica.com.br/api_jsonrpc.php");
    setEdZabbixToken("");
  }

  async function handleEditSave() {
    if (!editTenant) return;
    setEdSaving(true);
    setError(null);
    try {
      const payload: Record<string, string> = {};
      if (edName && edName !== editTenant.name) payload.name = edName;
      if (edZabbixGroupId) payload.zabbix_host_group_id = edZabbixGroupId;
      if (edZabbixUrl) payload.zabbix_api_url = edZabbixUrl;
      if (edZabbixToken) payload.zabbix_api_token = edZabbixToken;

      if (Object.keys(payload).length === 0) {
        setEditTenant(null);
        return;
      }

      const res = await fetch(`/api/admin/tenants/${editTenant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSuccess("Tenant atualizado com sucesso");
        setEditTenant(null);
        mutateTenants();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? "Erro ao atualizar tenant");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setEdSaving(false);
    }
  }

  async function handleAction(tenantId: string, action: string) {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/${action}`, { method: "POST", credentials: "include" });
      if (res.ok) {
        setSuccess(`Tenant ${action === "suspend" ? "suspenso" : "ativado"}`);
        mutateTenants(); mutateStats();
      }
    } catch { /* Ignora */ }
  }

  async function loadUsers(t: Tenant) {
    setShowUsers(t);
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/admin/tenants/${t.id}/users`, { credentials: "include" });
      const data = await res.json();
      setTenantUsers(data.users ?? []);
    } catch {
      setTenantUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function handleCreateUser() {
    if (!showUsers) return;
    setError(null);
    if (!cuEmail || !cuFullName || !cuPassword) {
      setError("Email, nome e senha são obrigatórios");
      return;
    }
    setCuSaving(true);
    try {
      const res = await fetch(`/api/admin/tenants/${showUsers.id}/users/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: cuEmail,
          full_name: cuFullName,
          phone: cuPhone || undefined,
          role: cuRole,
          provisional_password: cuPassword,
          must_change_password: cuMustChange,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Usuário ${cuEmail} criado e associado a ${showUsers.name}`);
        setShowCreateUser(false);
        setCuEmail(""); setCuFullName(""); setCuPhone(""); setCuPassword(""); setCuMustChange(true);
        loadUsers(showUsers);
        mutateStats();
      } else {
        setError(data?.error?.message ?? "Erro ao criar usuário");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setCuSaving(false);
    }
  }

  async function loadContacts(t: Tenant) {
    setShowContacts(t);
    setLoadingContacts(true);
    try {
      const res = await fetch(`/api/admin/tenants/${t.id}/contacts`, { credentials: "include" });
      const data = await res.json();
      setContacts(data.contacts ?? []);
    } catch {
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }

  if (!tData && !stats) return <LoadingState label="Carregando tenants..." />;

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: COLORS.bg, fontFamily: "'JetBrains Mono','Consolas',monospace", color: COLORS.text }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>Admin Global</h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>Gestão de Tenants · Multi-cluster · Onboarding</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { mutateTenants(); mutateStats(); }} className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}><RefreshCw size={12} className="inline" /> Atualizar</button>
          <button onClick={() => setShowCreate(true)} className="text-[12px] px-3 py-1.5 rounded font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}><Plus size={12} className="inline" /> Novo Tenant</button>
          <a href="/admin/users" className="text-[12px] px-3 py-1.5 rounded font-bold" style={{ background: `color-mix(in srgb, var(--brand-primary) 15%, transparent)`, border: `1px solid ${COLORS.teal}`, color: COLORS.teal, cursor: "pointer", textDecoration: "none" }}><UserCog size={12} className="inline" /> Gestão de Usuários</a>
          <a href="/admin/onboarding" className="text-[12px] px-3 py-1.5 rounded font-bold" style={{ background: `color-mix(in srgb, var(--brand-primary) 15%, transparent)`, border: `1px solid ${COLORS.teal}`, color: COLORS.teal, cursor: "pointer", textDecoration: "none" }}><UserPlus size={12} className="inline" /> Onboarding Wizard</a>
          <a href="/dashboard" className="text-[12px] px-3 py-1.5 rounded border" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}><ArrowLeft size={12} className="inline" /> Dashboard</a>
        </div>
      </div>

      {error && <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-error-bg)`, border: `1px solid var(--status-error-border)`, color: COLORS.red }}>{error}</div>}
      {success && <div className="rounded-md p-3 text-sm" style={{ background: `var(--status-ok-bg)`, border: `1px solid var(--status-ok-border)`, color: COLORS.green }}>{success}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <KpiCard label="Tenants" value={stats.total_tenants} color={COLORS.teal} />
          <KpiCard label="Ativos" value={stats.active_tenants} color={COLORS.green} />
          <KpiCard label="Suspensos" value={stats.suspended_tenants} color={COLORS.red} />
          <KpiCard label="Users" value={stats.total_users} color={COLORS.blue} />
          <KpiCard label="Ativos" value={stats.active_users} color={COLORS.green} />
          <KpiCard label="Tenant Users" value={stats.total_tenant_users} color={COLORS.purple} />
          <KpiCard label="Rotas" value={stats.total_routes} color={COLORS.amber} />
        </div>
      )}

      {/* Tenants Table */}
      <div className="rounded-xl p-6" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <h3 className="text-[10px] font-bold uppercase mb-3" style={{ color: COLORS.muted }}>TENANTS</h3>
        <div className="space-y-2">
          {tenants.length === 0 && <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum tenant cadastrado</div>}
          {tenants.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-[13px] font-bold" style={{ color: COLORS.teal }}>{t.name}</div>
                  <div className="text-[10px]" style={{ color: COLORS.muted }}>
                    {t.cnpj ?? "Sem CNPJ"} · {t.schema_name ?? "—"} · {t.cluster_host ?? "—"}
                  </div>
                  <div className="text-[10px]" style={{ color: COLORS.muted }}>
                    Users: {t.user_count ?? 0} · Criado: {formatTime(t.created_at)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLORS[t.status] ?? COLORS.muted}15`, color: STATUS_COLORS[t.status] ?? COLORS.muted }}>
                  {t.status}
                </span>
                {t.route_status && t.route_status !== "active" && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLORS[t.route_status] ?? COLORS.muted}15`, color: STATUS_COLORS[t.route_status] ?? COLORS.muted }}>
                    {t.route_status}
                  </span>
                )}
                <button onClick={() => openEdit(t)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-info-text) 12%, transparent)`, border: `1px solid var(--status-info-border)`, color: COLORS.blue, cursor: "pointer" }}>Editar</button>
                <button onClick={() => loadUsers(t)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--brand-primary) 12%, transparent)`, border: `1px solid var(--brand-primary)`, color: COLORS.teal, cursor: "pointer" }}><Users size={10} className="inline" /> Usuários</button>
                <button onClick={() => loadContacts(t)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-warning-text) 12%, transparent)`, border: `1px solid var(--status-warning-border)`, color: COLORS.amber, cursor: "pointer" }}><Mail size={10} className="inline" /> Contatos</button>
                {t.status === "active" ? (
                  <button onClick={() => handleAction(t.id, "suspend")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`, border: `1px solid var(--status-error-border)`, color: COLORS.red, cursor: "pointer" }}>Suspender</button>
                ) : (
                  <button onClick={() => handleAction(t.id, "activate")} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: `color-mix(in srgb, var(--status-ok-text) 12%, transparent)`, border: `1px solid var(--status-ok-border)`, color: COLORS.green, cursor: "pointer" }}>Ativar</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Edit Tenant */}
      {editTenant && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "var(--overlay-modal)" }} onClick={() => setEditTenant(null)} onKeyDown={(e) => { if (e.key === "Escape") setEditTenant(null); }} role="button" tabIndex={0}>
          <div className="rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="button" tabIndex={0}>
            <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Editar Tenant — {editTenant.name}</h2>

            <div className="space-y-1">
              <label htmlFor="ed-n" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome</label>
              <input id="ed-n" type="text" value={edName} onChange={(e) => setEdName(e.target.value)} className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="space-y-1">
              <label htmlFor="ed-zg" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Zabbix Host Group ID</label>
              <input id="ed-zg" type="text" value={edZabbixGroupId} onChange={(e) => setEdZabbixGroupId(e.target.value)} placeholder="Manter atual" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="space-y-1">
              <label htmlFor="ed-zu" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Zabbix API URL</label>
              <input id="ed-zu" type="text" value={edZabbixUrl} onChange={(e) => setEdZabbixUrl(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="space-y-1">
              <label htmlFor="ed-zt" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Novo Token Zabbix</label>
              <input id="ed-zt" type="password" value={edZabbixToken} onChange={(e) => setEdZabbixToken(e.target.value)} placeholder="Deixe vazio para manter o atual" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              <p className="text-[10px]" style={{ color: COLORS.muted }}>O token é criptografado (AES-256-GCM) antes de armazenar.</p>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditTenant(null)} className="px-4 py-2 rounded-md text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleEditSave} disabled={edSaving} className="px-4 py-2 rounded-md text-[12px] font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: edSaving ? "not-allowed" : "pointer", opacity: edSaving ? 0.5 : 1 }}>{edSaving ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Tenant */}
      {showCreate && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "var(--overlay-modal)" }} onClick={() => setShowCreate(false)} onKeyDown={(e) => { if (e.key === "Escape") setShowCreate(false); }} role="button" tabIndex={0}>
          <div className="rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="button" tabIndex={0}>
            <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Novo Tenant</h2>

            <div className="space-y-1">
              <label htmlFor="cr-n" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome</label>
              <input id="cr-n" type="text" value={crName} onChange={(e) => setCrName(e.target.value)} placeholder="Empresa XYZ" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="space-y-1">
              <label htmlFor="cr-c" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>CNPJ (opcional)</label>
              <input id="cr-c" type="text" value={crCnpj} onChange={(e) => setCrCnpj(e.target.value)} placeholder="12.345.678/0001-90" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="cr-ci" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Cluster ID</label>
                <input id="cr-ci" type="text" value={crClusterId} onChange={(e) => setCrClusterId(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="cr-ch" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Cluster Host</label>
                <input id="cr-ch" type="text" value={crClusterHost} onChange={(e) => setCrClusterHost(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="cr-db" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Database</label>
                <input id="cr-db" type="text" value={crDbName} onChange={(e) => setCrDbName(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
              <div className="space-y-1">
                <label htmlFor="cr-p" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Porta</label>
                <input id="cr-p" type="text" value={crPort} onChange={(e) => setCrPort(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="cr-zg" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Zabbix Host Group ID</label>
              <input id="cr-zg" type="text" value={crZabbixGroupId} onChange={(e) => setCrZabbixGroupId(e.target.value)} placeholder="15" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="space-y-1">
              <label htmlFor="cr-zu" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Zabbix API URL</label>
              <input id="cr-zu" type="text" value={crZabbixUrl} onChange={(e) => setCrZabbixUrl(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="space-y-1">
              <label htmlFor="cr-zt" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Zabbix API Token</label>
              <input id="cr-zt" type="password" value={crZabbixToken} onChange={(e) => setCrZabbixToken(e.target.value)} placeholder="token..." className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-md text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleCreate} className="px-4 py-2 rounded-md text-[12px] font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}>Criar Tenant</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tenant Users */}
      {showUsers && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "var(--overlay-modal)" }} onClick={() => setShowUsers(null)} onKeyDown={(e) => { if (e.key === "Escape") setShowUsers(null); }} role="button" tabIndex={0}>
          <div className="rounded-xl p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="button" tabIndex={0}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}><Users size={14} className="inline mr-1" /> Usuários — {showUsers.name}</h2>
              <button onClick={() => setShowCreateUser(true)} className="text-[11px] px-3 py-1.5 rounded font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: "pointer" }}><Plus size={10} className="inline" /> Criar Usuário</button>
            </div>

            {loadingUsers ? (
              <div className="text-[12px]" style={{ color: COLORS.muted }}>Carregando usuários...</div>
            ) : tenantUsers.length === 0 ? (
              <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum usuário associado a este tenant</div>
            ) : (
              <div className="space-y-2">
                {tenantUsers.map((u) => (
                  <div key={u.user_id} className="flex items-center justify-between p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center rounded-full" style={{ width: 32, height: 32, background: `${COLORS.teal}15`, border: `1px solid ${COLORS.teal}33` }}>
                        <Shield size={14} style={{ color: COLORS.teal }} />
                      </div>
                      <div>
                        <div className="text-[13px] font-bold" style={{ color: COLORS.text }}>{u.full_name ?? u.email}</div>
                        <div className="text-[10px]" style={{ color: COLORS.muted }}>{u.email} · {u.phone ?? "Sem telefone"}</div>
                        <div className="text-[10px]" style={{ color: COLORS.muted }}>Último login: {formatTime(u.last_login_at)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${COLORS.blue}15`, color: COLORS.blue }}>{u.role}</span>
                      {u.must_change_password && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1" style={{ background: `${COLORS.amber}15`, color: COLORS.amber }}><KeyRound size={9} /> Trocar senha</span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${u.is_active ? "" : "opacity-50"}`} style={{ background: `${u.is_active ? COLORS.green : COLORS.muted}15`, color: u.is_active ? COLORS.green : COLORS.muted }}>
                        {u.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={() => setShowUsers(null)} className="px-4 py-2 rounded-md text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create User */}
      {showCreateUser && showUsers && (
        <div className="fixed inset-0 flex items-center justify-center z-[60]" style={{ background: "var(--overlay-modal)" }} onClick={() => setShowCreateUser(false)} onKeyDown={(e) => { if (e.key === "Escape") setShowCreateUser(false); }} role="button" tabIndex={0}>
          <div className="rounded-xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="button" tabIndex={0}>
            <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>Criar Usuário — {showUsers.name}</h2>

            <div className="space-y-1">
              <label htmlFor="cu-e" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Email</label>
              <input id="cu-e" type="email" value={cuEmail} onChange={(e) => setCuEmail(e.target.value)} placeholder="usuario@cliente.com" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="space-y-1">
              <label htmlFor="cu-n" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Nome Completo</label>
              <input id="cu-n" type="text" value={cuFullName} onChange={(e) => setCuFullName(e.target.value)} placeholder="João Silva" className="w-full rounded-md px-3 py-2 text-[13px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="space-y-1">
              <label htmlFor="cu-p" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Telefone (opcional)</label>
              <input id="cu-p" type="tel" value={cuPhone} onChange={(e) => setCuPhone(e.target.value)} placeholder="(11) 99999-9999" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <div className="space-y-1">
              <label htmlFor="cu-r" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Role</label>
              <select id="cu-r" value={cuRole} onChange={(e) => setCuRole(e.target.value)} className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                <optgroup label="JL Staff (Global)">
                  <option value="jl:superadmin">JL Superadmin</option>
                  <option value="jl:engineer">JL Engineer</option>
                  <option value="jl:technician">JL Technician</option>
                  <option value="jl:manager">JL Manager</option>
                  <option value="jl:finance">JL Finance</option>
                  <option value="jl:viewer">JL Viewer</option>
                </optgroup>
                <optgroup label="Tenant (Cliente)">
                  <option value="tenant:admin">Admin do Tenant</option>
                  <option value="tenant:operator">Operador</option>
                  <option value="tenant:viewer">Visualizador</option>
                </optgroup>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="cu-pw" className="text-[10px] font-bold uppercase" style={{ color: COLORS.muted }}>Senha Provisória</label>
              <input id="cu-pw" type="password" value={cuPassword} onChange={(e) => setCuPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className="w-full rounded-md px-3 py-2 text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cuMustChange} onChange={(e) => setCuMustChange(e.target.checked)} style={{ accentColor: COLORS.teal }} />
              <span className="text-[11px]" style={{ color: COLORS.muted }}>Forçar troca de senha no primeiro acesso</span>
            </label>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreateUser(false)} className="px-4 py-2 rounded-md text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleCreateUser} disabled={cuSaving} className="px-4 py-2 rounded-md text-[12px] font-bold" style={{ background: COLORS.teal, color: COLORS.bg, cursor: cuSaving ? "not-allowed" : "pointer", opacity: cuSaving ? 0.5 : 1 }}>{cuSaving ? "Criando..." : "Criar Usuário"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Contacts */}
      {showContacts && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "var(--overlay-modal)" }} onClick={() => setShowContacts(null)} onKeyDown={(e) => { if (e.key === "Escape") setShowContacts(null); }} role="button" tabIndex={0}>
          <div className="rounded-xl p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="button" tabIndex={0}>
            <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}><Mail size={14} className="inline mr-1" /> Contatos — {showContacts.name}</h2>

            {loadingContacts ? (
              <div className="text-[12px]" style={{ color: COLORS.muted }}>Carregando contatos...</div>
            ) : contacts.length === 0 ? (
              <div className="text-[12px]" style={{ color: COLORS.muted }}>Nenhum contato cadastrado para este cliente</div>
            ) : (
              <div className="space-y-2">
                {contacts.map((ct) => (
                  <div key={ct.id} className="flex items-center justify-between p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center rounded-full" style={{ width: 32, height: 32, background: `${COLORS.amber}15`, border: `1px solid ${COLORS.amber}33` }}>
                        <Mail size={14} style={{ color: COLORS.amber }} />
                      </div>
                      <div>
                        <div className="text-[13px] font-bold" style={{ color: COLORS.text }}>{ct.name}</div>
                        <div className="text-[10px]" style={{ color: COLORS.muted }}>{ct.email} · {ct.phone ?? "Sem telefone"}</div>
                        <div className="text-[10px]" style={{ color: COLORS.muted }}>{ct.role ?? "—"} · {ct.department ?? "—"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {ct.is_primary && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: `${COLORS.teal}15`, color: COLORS.teal }}>Primário</span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${ct.is_active ? "" : "opacity-50"}`} style={{ background: `${ct.is_active ? COLORS.green : COLORS.muted}15`, color: ct.is_active ? COLORS.green : COLORS.muted }}>
                        {ct.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={() => setShowContacts(null)} className="px-4 py-2 rounded-md text-[12px]" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.muted, cursor: "pointer" }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
