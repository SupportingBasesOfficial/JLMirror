"use client";

import { RefreshCw } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/state-display";
import type { ZabbixUser } from "@repo/zabbix";

export default function UsersPage() {
  const { data, error, isLoading, mutate } = useApi<{ data: ZabbixUser[] }>("/api/zabbix/users");
  const users = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Usuários Zabbix</h1>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-primary)", color: "var(--brand-primary)" }}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {error && (
        <ErrorState title="Erro" message={error} />
      )}

      {isLoading ? (
        <LoadingState label="Carregando..." />
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
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userid} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="py-2 px-3" style={{ color: "var(--text-primary)" }}>{u.username}</td>
                  <td className="py-2 px-3" style={{ color: "var(--text-muted)" }}>{u.name || "—"}</td>
                  <td className="py-2 px-3" style={{ color: "var(--text-muted)" }}>{u.surname || "—"}</td>
                  <td className="py-2 px-3" style={{ color: "var(--text-muted)" }}>{u.role?.name ?? "—"}</td>
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
    </div>
  );
}
