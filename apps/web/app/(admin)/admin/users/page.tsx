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
};

interface TenantUser {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  role: string;
  scope: string;
  created_at: string;
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
  }>("/api/v1/users");
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
  const [edSaving, setEdSaving] = useState(false);

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

  async function handleUpdateRole() {
    if (!editUser) return;
    setError(null);
    setEdSaving(true);
    try {
      const res = await fetch(`/api/v1/users/${editUser.id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: edRole, scope: edScope }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("Role atualizada com sucesso!");
        setEditUser(null);
        mutateUsers();
      } else {
        setError(data.error?.message ?? "Erro ao atualizar role");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setEdSaving(false);
    }
  }

  async function handleToggleStatus(user: TenantUser) {
    setError(null);
    try {
      const res = await fetch(`/api/v1/users/${user.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: !user.is_active }),
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
      const res = await fetch(`/api/v1/users/${user.id}`, {
        method: "DELETE",
        credentials: "include",
      });
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
            JL Staff
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.purple }}>
            {users.filter((u) => u.scope === "global").length}
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
            Tenant Users
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>
            {users.filter((u) => u.scope === "tenant").length}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <th
                className="text-left p-3 font-bold"
                style={{ color: COLORS.muted }}
              >
                EMAIL
              </th>
              <th
                className="text-left p-3 font-bold"
                style={{ color: COLORS.muted }}
              >
                NOME
              </th>
              <th
                className="text-left p-3 font-bold"
                style={{ color: COLORS.muted }}
              >
                ROLE
              </th>
              <th
                className="text-left p-3 font-bold"
                style={{ color: COLORS.muted }}
              >
                SCOPE
              </th>
              <th
                className="text-left p-3 font-bold"
                style={{ color: COLORS.muted }}
              >
                STATUS
              </th>
              <th
                className="text-right p-3 font-bold"
                style={{ color: COLORS.muted }}
              >
                AÇÕES
              </th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="p-6 text-center"
                  style={{ color: COLORS.muted }}
                >
                  Nenhum usuário encontrado
                </td>
              </tr>
            )}
            {users.map((u) => (
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
                    {u.scope}
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] uppercase font-bold"
                    style={{ color: u.is_active ? COLORS.green : COLORS.muted }}
                  >
                    {u.is_active ? "● ATIVO" : "○ INATIVO"}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => openEdit(u)}
                      title="Editar role"
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Roles Reference */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className="rounded-xl p-4"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <h3
            className="text-[12px] font-bold mb-3"
            style={{ color: COLORS.purple }}
          >
            ROLES JL STAFF (GLOBAL)
          </h3>
          <div className="space-y-1">
            {systemRoles
              .filter(
                (r) => r.key.startsWith("jl:") || r.key.startsWith("global:"),
              )
              .map((r) => (
                <div key={r.id} className="flex justify-between text-[11px]">
                  <span style={{ color: COLORS.text }}>
                    {ROLE_LABELS[r.key] ?? r.key}
                  </span>
                  <span style={{ color: COLORS.muted }}>
                    {r.description ?? "—"}
                  </span>
                </div>
              ))}
          </div>
        </div>
        <div
          className="rounded-xl p-4"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <h3
            className="text-[12px] font-bold mb-3"
            style={{ color: COLORS.teal }}
          >
            ROLES TENANT
          </h3>
          <div className="space-y-1">
            {systemRoles
              .filter((r) => r.key.startsWith("tenant:"))
              .map((r) => (
                <div key={r.id} className="flex justify-between text-[11px]">
                  <span style={{ color: COLORS.text }}>
                    {ROLE_LABELS[r.key] ?? r.key}
                  </span>
                  <span style={{ color: COLORS.muted }}>
                    {r.description ?? "—"}
                  </span>
                </div>
              ))}
            {customRoles.map((r) => (
              <div key={r.id} className="flex justify-between text-[11px]">
                <span style={{ color: COLORS.text }}>
                  {r.key} <span style={{ color: COLORS.amber }}>(custom)</span>
                </span>
                <span style={{ color: COLORS.muted }}>
                  {r.description ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

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

      {/* Modal: Edit Role */}
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
                  Editar Role
                </h2>
                <p className="text-[11px]" style={{ color: COLORS.muted }}>
                  {editUser.email}
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
                onClick={handleUpdateRole}
                disabled={edSaving}
                className="w-full px-4 py-2 rounded-md text-[12px] font-bold"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: edSaving ? "wait" : "pointer",
                  opacity: edSaving ? 0.6 : 1,
                }}
              >
                {edSaving ? "Salvando..." : "Salvar Alteração"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
