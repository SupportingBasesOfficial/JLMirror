// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import {
  RefreshCw,
  ArrowLeft,
  Plus,
  Trash2,
  Shield,
  UserCog,
  X,
  KeyRound,
} from "lucide-react";
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

const SCOPE_COLORS: Record<string, string> = {
  global: COLORS.purple,
  tenant: COLORS.teal,
};

const ROLE_LABELS: Record<string, string> = {
  "global:admin": "Global Admin",
  "jl:superadmin": "JL Superadmin",
  "jl:engineer": "JL Engineer",
  "jl:technician": "JL Technician",
  "jl:manager": "JL Manager",
  "jl:finance": "JL Finance",
  "jl:viewer": "JL Viewer",
  "tenant:admin": "Tenant Admin",
  "tenant:operator": "Tenant Operator",
  "tenant:viewer": "Tenant Viewer",
  "tenant:user": "Tenant User",
};

const SCOPE_LABELS: Record<string, string> = {
  global: "JL Staff",
  tenant: "Cliente",
};

const TENANT_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  owner: { label: "Proprietário", color: COLORS.teal, icon: "👑" },
  manager: { label: "Gestor", color: COLORS.blue, icon: "🏢" },
  client: { label: "Cliente", color: COLORS.amber, icon: "📦" },
};

interface TenantUser {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  role: string;
  scope: string;
  created_at: string;
  tenant_id: string;
  tenant_name: string;
  tenant_type: string;
  parent_tenant_name: string | null;
  must_change_password: boolean;
  last_login_at: string | null;
}

interface RoleEntry {
  id: string;
  key: string;
  description: string | null;
  is_system?: boolean;
  is_active?: boolean;
}

export default function UsersManagementPage() {
  const { data: usersData, mutate: mutateUsers } = useApi<{
    users: TenantUser[];
  }>("/api/v1/users/all");
  const { data: rolesData } = useApi<{
    system_roles: RoleEntry[];
    custom_roles: RoleEntry[];
  }>("/api/v1/users/roles");
  const users = usersData?.users ?? [];
  const systemRoles = rolesData?.system_roles ?? [];
  const customRoles = rolesData?.custom_roles ?? [];

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<TenantUser | null>(null);

  // Create form
  const [crEmail, setCrEmail] = useState("");
  const [crPassword, setCrPassword] = useState("");
  const [crFullName, setCrFullName] = useState("");
  const [crRole, setCrRole] = useState("tenant:viewer");
  const [crScope, setCrScope] = useState<"global" | "tenant">("tenant");
  const [crSaving, setCrSaving] = useState(false);

  // Edit form
  const [edRole, setEdRole] = useState("");
  const [edScope, setEdScope] = useState<"global" | "tenant">("tenant");
  const [edFullName, setEdFullName] = useState("");
  const [edEmail, setEdEmail] = useState("");
  const [edSaving, setEdSaving] = useState(false);

  // Password reset
  const [resetUser, setResetUser] = useState<TenantUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [forceChange, setForceChange] = useState(true);
  const [pwSaving, setPwSaving] = useState(false);

  async function handleCreate() {
    setError(null);
    if (!crEmail || !crPassword || !crRole) {
      setError("Email, senha e role são obrigatórios");
      return;
    }
    setCrSaving(true);
    try {
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: crEmail,
          password: crPassword,
          full_name: crFullName || undefined,
          role: crRole,
          scope: crScope,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Usuário ${crEmail} criado com sucesso!`);
        setShowCreate(false);
        setCrEmail("");
        setCrPassword("");
        setCrFullName("");
        setCrRole("tenant:viewer");
        setCrScope("tenant");
        mutateUsers();
      } else {
        setError(data.error?.message ?? "Erro ao criar usuário");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setCrSaving(false);
    }
  }

  async function handleUpdateUser() {
    if (!editUser) return;
    setError(null);
    setEdSaving(true);
    try {
      // Atualiza role/scope
      const roleRes = await fetch(`/api/v1/users/${editUser.id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          role: edRole,
          scope: edScope,
          tenant_id: editUser.tenant_id,
        }),
      });
      if (!roleRes.ok) {
        const data = await roleRes.json();
        setError(data.error?.message ?? "Erro ao atualizar role");
        return;
      }

      // Atualiza detalhes (nome, email) se alterados
      if (
        edFullName !== (editUser.full_name ?? "") ||
        edEmail !== editUser.email
      ) {
        const detailsRes = await fetch(`/api/v1/users/${editUser.id}/details`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            full_name: edFullName || undefined,
            email: edEmail !== editUser.email ? edEmail : undefined,
          }),
        });
        if (!detailsRes.ok) {
          const data = await detailsRes.json();
          setError(data.error?.message ?? "Erro ao atualizar detalhes");
          return;
        }
      }

      setSuccess("Usuário atualizado com sucesso!");
      setEditUser(null);
      mutateUsers();
    } catch {
      setError("Erro de conexão");
    } finally {
      setEdSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!resetUser) return;
    setError(null);
    if (newPassword.length < 8) {
      setError("Senha deve ter no mínimo 8 caracteres");
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch(`/api/v1/users/${resetUser.id}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          password: newPassword,
          must_change_password: forceChange,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Senha de ${resetUser.email} redefinida!`);
        setResetUser(null);
        setNewPassword("");
        setForceChange(true);
        mutateUsers();
      } else {
        setError(data.error?.message ?? "Erro ao redefinir senha");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setPwSaving(false);
    }
  }

  async function handleToggleStatus(user: TenantUser) {
    setError(null);
    try {
      const res = await fetch(`/api/v1/users/${user.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          is_active: !user.is_active,
          tenant_id: user.tenant_id,
        }),
      });
      if (res.ok) {
        setSuccess(`Usuário ${user.is_active ? "desativado" : "ativado"}!`);
        mutateUsers();
      }
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleDelete(user: TenantUser) {
    if (!confirm(`Remover ${user.email} deste tenant?`)) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/users/${user.id}?tenant_id=${encodeURIComponent(user.tenant_id)}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Usuário ${user.email} removido!`);
        mutateUsers();
      } else {
        setError(data.error?.message ?? "Erro ao remover usuário");
      }
    } catch {
      setError("Erro de conexão");
    }
  }

  function openEdit(user: TenantUser) {
    setEditUser(user);
    setEdRole(user.role);
    setEdScope(user.scope as "global" | "tenant");
    setEdFullName(user.full_name ?? "");
    setEdEmail(user.email);
  }

  if (!usersData) return <LoadingState label="Carregando usuários..." />;

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{
        background: COLORS.bg,
        fontFamily: "'JetBrains Mono','Consolas',monospace",
        color: COLORS.text,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            Gestão de Usuários
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Usuários · Roles · Permissões · Two-layer hierarchy
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => mutateUsers()}
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.muted,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{
              background: COLORS.teal,
              border: `1px solid ${COLORS.teal}`,
              color: COLORS.bg,
              cursor: "pointer",
            }}
          >
            <Plus size={12} className="inline" /> Novo Usuário
          </button>
          <a
            href="/dashboard"
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.muted,
            }}
          >
            <ArrowLeft size={12} className="inline" /> Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: `var(--status-error-bg)`,
            border: `1px solid var(--status-error-border)`,
            color: COLORS.red,
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: `var(--status-ok-bg)`,
            border: `1px solid var(--status-ok-border)`,
            color: COLORS.green,
          }}
        >
          {success}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div
          className="p-4 rounded-xl"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            className="text-[10px] uppercase font-bold mb-1"
            style={{ color: COLORS.muted }}
          >
            Total
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>
            {users.length}
          </div>
        </div>
        <div
          className="p-4 rounded-xl"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            className="text-[10px] uppercase font-bold mb-1"
            style={{ color: COLORS.muted }}
          >
            Ativos
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.green }}>
            {users.filter((u) => u.is_active).length}
          </div>
        </div>
        <div
          className="p-4 rounded-xl"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            className="text-[10px] uppercase font-bold mb-1"
            style={{ color: COLORS.muted }}
          >
            👑 Proprietário
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>
            {users.filter((u) => u.tenant_type === "owner").length}
          </div>
        </div>
        <div
          className="p-4 rounded-xl"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            className="text-[10px] uppercase font-bold mb-1"
            style={{ color: COLORS.muted }}
          >
            🏢 Gestores
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>
            {users.filter((u) => u.tenant_type === "manager").length}
          </div>
        </div>
        <div
          className="p-4 rounded-xl"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            className="text-[10px] uppercase font-bold mb-1"
            style={{ color: COLORS.muted }}
          >
            📦 Clientes
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>
            {users.filter((u) => u.tenant_type === "client").length}
          </div>
        </div>
        <div
          className="p-4 rounded-xl"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            className="text-[10px] uppercase font-bold mb-1"
            style={{ color: COLORS.muted }}
          >
            JL Staff
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.purple }}>
            {users.filter((u) => u.scope === "global").length}
          </div>
        </div>
      </div>

      {/* Users — Agrupado por tenant */}
      {(() => {
        // Agrupa usuarios por tenant_id
        const tenantGroups = new Map<
          string,
          {
            tenant_name: string;
            tenant_type: string;
            parent_tenant_name: string | null;
            users: TenantUser[];
          }
        >();
        for (const u of users) {
          const key = u.tenant_id;
          if (!tenantGroups.has(key)) {
            tenantGroups.set(key, {
              tenant_name: u.tenant_name,
              tenant_type: u.tenant_type,
              parent_tenant_name: u.parent_tenant_name,
              users: [],
            });
          }
          tenantGroups.get(key)!.users.push(u);
        }

        // Ordena grupos por tipo de tenant
        const sortedGroups = Array.from(tenantGroups.values()).sort((a, b) => {
          const order: Record<string, number> = {
            owner: 0,
            manager: 1,
            client: 2,
          };
          return (
            (order[a.tenant_type] ?? 3) - (order[b.tenant_type] ?? 3) ||
            a.tenant_name.localeCompare(b.tenant_name)
          );
        });

        function renderUserRow(u: TenantUser) {
          return (
            <tr
              key={u.id}
              style={{ borderBottom: `1px solid ${COLORS.border}` }}
            >
              <td className="p-3" style={{ color: COLORS.text }}>
                {u.email}
              </td>
              <td className="p-3" style={{ color: COLORS.muted }}>
                {u.full_name ?? "—"}
              </td>
              <td className="p-3">
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-bold"
                  style={{
                    background: `color-mix(in srgb, ${SCOPE_COLORS[u.scope] ?? COLORS.muted} 15%, transparent)`,
                    color: SCOPE_COLORS[u.scope] ?? COLORS.muted,
                  }}
                >
                  {ROLE_LABELS[u.role] ?? u.role}
                </span>
              </td>
              <td className="p-3">
                <span
                  className="px-2 py-0.5 rounded text-[10px] uppercase font-bold"
                  style={{ color: SCOPE_COLORS[u.scope] ?? COLORS.muted }}
                >
                  {SCOPE_LABELS[u.scope] ?? u.scope}
                </span>
              </td>
              <td className="p-3">
                <div className="flex flex-col gap-1">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] uppercase font-bold inline-flex w-fit"
                    style={{
                      color: u.is_active ? COLORS.green : COLORS.muted,
                    }}
                  >
                    {u.is_active ? "● ATIVO" : "○ INATIVO"}
                  </span>
                  {u.must_change_password && (
                    <span
                      className="px-2 py-0.5 rounded text-[10px] uppercase font-bold inline-flex items-center gap-1 w-fit"
                      style={{ color: COLORS.amber }}
                    >
                      <KeyRound size={9} /> Trocar senha
                    </span>
                  )}
                </div>
              </td>
              <td className="p-3 text-[10px]" style={{ color: COLORS.muted }}>
                {u.last_login_at
                  ? new Date(u.last_login_at).toLocaleDateString("pt-BR")
                  : "—"}
              </td>
              <td className="p-3 text-right">
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={() => openEdit(u)}
                    title="Editar usuário"
                    className="p-1.5 rounded"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.blue,
                      cursor: "pointer",
                    }}
                  >
                    <UserCog size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setResetUser(u);
                      setNewPassword("");
                      setForceChange(true);
                    }}
                    title="Redefinir senha"
                    className="p-1.5 rounded"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.amber,
                      cursor: "pointer",
                    }}
                  >
                    <KeyRound size={14} />
                  </button>
                  <button
                    onClick={() => handleToggleStatus(u)}
                    title={u.is_active ? "Desativar" : "Ativar"}
                    className="p-1.5 rounded"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: u.is_active ? COLORS.amber : COLORS.green,
                      cursor: "pointer",
                    }}
                  >
                    <Shield size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(u)}
                    title="Remover do tenant"
                    className="p-1.5 rounded"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.red,
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          );
        }

        function renderTenantSection(group: {
          tenant_name: string;
          tenant_type: string;
          parent_tenant_name: string | null;
          users: TenantUser[];
        }) {
          const cfg =
            TENANT_TYPE_CONFIG[group.tenant_type] ?? TENANT_TYPE_CONFIG.client;
          return (
            <div
              key={group.tenant_name + group.tenant_type}
              className="rounded-xl overflow-hidden"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                className="flex items-center gap-2 p-3"
                style={{ borderBottom: `1px solid ${COLORS.border}` }}
              >
                <span className="text-[14px]">{cfg.icon}</span>
                <h3
                  className="text-[12px] font-bold"
                  style={{ color: cfg.color }}
                >
                  {group.tenant_name}
                </h3>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                  style={{
                    background: `${cfg.color}15`,
                    color: cfg.color,
                  }}
                >
                  {cfg.label}
                </span>
                {group.parent_tenant_name && (
                  <span className="text-[10px]" style={{ color: COLORS.muted }}>
                    · Gestado por: {group.parent_tenant_name}
                  </span>
                )}
                <span
                  className="text-[10px] ml-auto"
                  style={{ color: COLORS.muted }}
                >
                  {group.users.length} usuário
                  {group.users.length !== 1 ? "s" : ""}
                </span>
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <th
                      className="text-left p-2 font-bold"
                      style={{ color: COLORS.muted }}
                    >
                      EMAIL
                    </th>
                    <th
                      className="text-left p-2 font-bold"
                      style={{ color: COLORS.muted }}
                    >
                      NOME
                    </th>
                    <th
                      className="text-left p-2 font-bold"
                      style={{ color: COLORS.muted }}
                    >
                      ROLE
                    </th>
                    <th
                      className="text-left p-2 font-bold"
                      style={{ color: COLORS.muted }}
                    >
                      SCOPE
                    </th>
                    <th
                      className="text-left p-2 font-bold"
                      style={{ color: COLORS.muted }}
                    >
                      STATUS
                    </th>
                    <th
                      className="text-left p-2 font-bold"
                      style={{ color: COLORS.muted }}
                    >
                      ÚLTIMO LOGIN
                    </th>
                    <th
                      className="text-right p-2 font-bold"
                      style={{ color: COLORS.muted }}
                    >
                      AÇÕES
                    </th>
                  </tr>
                </thead>
                <tbody>{group.users.map(renderUserRow)}</tbody>
              </table>
            </div>
          );
        }

        if (users.length === 0) {
          return (
            <div
              className="rounded-xl p-6 text-center"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.muted,
              }}
            >
              Nenhum usuário encontrado
            </div>
          );
        }

        return (
          <div className="space-y-4">
            {sortedGroups.map(renderTenantSection)}
          </div>
        );
      })()}

      {/* Modal: Create User */}
      {showCreate && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md space-y-4"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h2
                className="text-[14px] font-bold"
                style={{ color: COLORS.teal }}
              >
                Novo Usuário
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={crEmail}
                  onChange={(e) => setCrEmail(e.target.value)}
                  placeholder="user@empresa.com"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Senha
                </label>
                <input
                  type="password"
                  value={crPassword}
                  onChange={(e) => setCrPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={crFullName}
                  onChange={(e) => setCrFullName(e.target.value)}
                  placeholder="João da Silva"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    className="text-[10px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Scope
                  </label>
                  <select
                    value={crScope}
                    onChange={(e) =>
                      setCrScope(e.target.value as "global" | "tenant")
                    }
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    <option value="tenant">Tenant (Cliente)</option>
                    <option value="global">Global (JL Staff)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    className="text-[10px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Role
                  </label>
                  <select
                    value={crRole}
                    onChange={(e) => setCrRole(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {crScope === "global" ? (
                      systemRoles
                        .filter(
                          (r) =>
                            r.key.startsWith("jl:") ||
                            r.key.startsWith("global:"),
                        )
                        .map((r) => (
                          <option key={r.id} value={r.key}>
                            {ROLE_LABELS[r.key] ?? r.key}
                          </option>
                        ))
                    ) : (
                      <>
                        {systemRoles
                          .filter((r) => r.key.startsWith("tenant:"))
                          .map((r) => (
                            <option key={r.id} value={r.key}>
                              {ROLE_LABELS[r.key] ?? r.key}
                            </option>
                          ))}
                        {customRoles.map((r) => (
                          <option key={r.id} value={r.key}>
                            {r.key} (custom)
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={crSaving}
                className="w-full px-4 py-2 rounded-md text-[12px] font-bold"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: crSaving ? "wait" : "pointer",
                  opacity: crSaving ? 0.6 : 1,
                }}
              >
                {crSaving ? "Criando..." : "Criar Usuário"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit User */}
      {editUser && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setEditUser(null)}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md space-y-4"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <div>
                <h2
                  className="text-[14px] font-bold"
                  style={{ color: COLORS.teal }}
                >
                  Editar Usuário
                </h2>
                <p className="text-[11px]" style={{ color: COLORS.muted }}>
                  {editUser.email} · {editUser.tenant_name}
                </p>
              </div>
              <button
                onClick={() => setEditUser(null)}
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={edFullName}
                  onChange={(e) => setEdFullName(e.target.value)}
                  placeholder="João da Silva"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={edEmail}
                  onChange={(e) => setEdEmail(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    className="text-[10px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Scope
                  </label>
                  <select
                    value={edScope}
                    onChange={(e) =>
                      setEdScope(e.target.value as "global" | "tenant")
                    }
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    <option value="tenant">Tenant (Cliente)</option>
                    <option value="global">Global (JL Staff)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    className="text-[10px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Role
                  </label>
                  <select
                    value={edRole}
                    onChange={(e) => setEdRole(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[13px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {edScope === "global" ? (
                      systemRoles
                        .filter(
                          (r) =>
                            r.key.startsWith("jl:") ||
                            r.key.startsWith("global:"),
                        )
                        .map((r) => (
                          <option key={r.id} value={r.key}>
                            {ROLE_LABELS[r.key] ?? r.key}
                          </option>
                        ))
                    ) : (
                      <>
                        {systemRoles
                          .filter((r) => r.key.startsWith("tenant:"))
                          .map((r) => (
                            <option key={r.id} value={r.key}>
                              {ROLE_LABELS[r.key] ?? r.key}
                            </option>
                          ))}
                        {customRoles.map((r) => (
                          <option key={r.id} value={r.key}>
                            {r.key} (custom)
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              </div>
              <button
                onClick={handleUpdateUser}
                disabled={edSaving}
                className="w-full px-4 py-2 rounded-md text-[12px] font-bold"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: edSaving ? "wait" : "pointer",
                  opacity: edSaving ? 0.6 : 1,
                }}
              >
                {edSaving ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {resetUser && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setResetUser(null)}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md space-y-4"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <div>
                <h2
                  className="text-[14px] font-bold"
                  style={{ color: COLORS.amber }}
                >
                  Redefinir Senha
                </h2>
                <p className="text-[11px]" style={{ color: COLORS.muted }}>
                  {resetUser.email} · {resetUser.tenant_name}
                </p>
              </div>
              <button
                onClick={() => setResetUser(null)}
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  className="text-[10px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nova Senha
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <label
                className="flex items-center gap-2 text-[11px] cursor-pointer"
                style={{ color: COLORS.text }}
              >
                <input
                  type="checkbox"
                  checked={forceChange}
                  onChange={(e) => setForceChange(e.target.checked)}
                  className="cursor-pointer"
                />
                Exigir troca de senha no próximo login
              </label>
              <div
                className="rounded-md p-2 text-[10px]"
                style={{
                  background: `var(--status-warning-bg)`,
                  border: `1px solid var(--status-warning-border)`,
                  color: COLORS.amber,
                }}
              >
                ⚠ O usuário será deslogado de todas as sessões ativas e deverá
                usar a nova senha no próximo acesso.
              </div>
              <button
                onClick={handleResetPassword}
                disabled={pwSaving}
                className="w-full px-4 py-2 rounded-md text-[12px] font-bold"
                style={{
                  background: COLORS.amber,
                  color: COLORS.bg,
                  cursor: pwSaving ? "wait" : "pointer",
                  opacity: pwSaving ? 0.6 : 1,
                }}
              >
                {pwSaving ? "Redefinindo..." : "Redefinir Senha"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
