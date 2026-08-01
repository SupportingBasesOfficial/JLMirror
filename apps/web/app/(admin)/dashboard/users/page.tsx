// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { RefreshCw, Shield, Users } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/state-display";
import type { ZabbixUser } from "@repo/zabbix";

export default function UsersPage() {
  const { data, error, isLoading, progress, mutate } = useApi<{ data: ZabbixUser[] }>("/api/zabbix/users");
  const users = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Usuários Zabbix</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Usuários do Zabbix para este tenant · Isolamento via host group
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-primary)", color: "var(--brand-primary)" }}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {/* Info banner — isolamento por tenant */}
      <div className="rounded-lg p-3 flex items-start gap-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
        <Shield size={16} className="shrink-0 mt-0.5" style={{ color: "var(--brand-primary)" }} />
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text-primary)" }}>Isolamento por tenant:</strong> Cada tenant possui um
          <code className="px-1 rounded" style={{ background: "var(--surface-0)", color: "var(--brand-primary)" }}>zabbix_host_group_id</code>
          que filtra hosts, triggers e eventos visíveis. Usuários Zabbix listados abaixo são do tenant atual.
        </div>
      </div>

      {error && (
        <ErrorState title="Erro" message={error} />
      )}

      {isLoading ? (
        <LoadingState label="Carregando..." progress={progress} />
      ) : users.length === 0 ? (
        <EmptyState title="Nenhum usuário encontrado" />
      ) : (
        <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border-default)", background: "var(--surface-2)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Usuário</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Nome</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Sobrenome</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Role</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Grupos</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userid} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="py-2 px-3" style={{ color: "var(--text-primary)" }}>{u.username}</td>
                  <td className="py-2 px-3" style={{ color: "var(--text-muted)" }}>{u.name || "—"}</td>
                  <td className="py-2 px-3" style={{ color: "var(--text-muted)" }}>{u.surname || "—"}</td>
                  <td className="py-2 px-3">
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold" style={{ background: "var(--brand-glow)", color: "var(--brand-primary)" }}>
                      {u.role?.name ?? "—"}
                    </span>
                  </td>
                  <td className="py-2 px-3" style={{ color: "var(--text-muted)" }}>
                    {u.usrgrps && u.usrgrps.length > 0
                      ? u.usrgrps.map((g) => g.name).join(", ")
                      : "—"}
                  </td>
                  <td className="py-2 px-3">
                    <StatusBadge variant={u.users_status !== "1" ? "ok" : "neutral"}>
                      {u.users_status !== "1" ? "Ativo" : "Desativado"}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Link to JLMIRROR user management */}
      <div className="rounded-lg p-4 flex items-center justify-between" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
        <div className="flex items-center gap-3">
          <Users size={20} style={{ color: "var(--brand-primary)" }} />
          <div>
            <div className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>Gestão de Usuários JLMIRROR</div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Gerenciar usuários e roles do portal (two-layer hierarchy)</div>
          </div>
        </div>
        <a
          href="/admin/users"
          className="text-[12px] px-3 py-1.5 rounded-lg font-bold"
          style={{ background: "var(--brand-primary)", color: "var(--surface-0)", textDecoration: "none" }}
        >
          Ir para Gestão →
        </a>
      </div>
    </div>
  );
}
