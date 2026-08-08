// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { RefreshCw, ScrollText } from "lucide-react";
import { useApi } from "@/lib/use-api";
import {
  ErrorState,
  EmptyState,
  LoadingState,
} from "@/components/ui/state-display";

interface AuditLogEntry {
  auditid: string;
  userid: string;
  username: string;
  clock: number;
  action: number;
  resourcetype: number;
  resourceid: string;
  resourcename: string;
  details: string;
}

const ACTION_LABELS: Record<number, string> = {
  0: "Login",
  1: "Logout",
  2: "Adicionar",
  3: "Atualizar",
  4: "Remover",
  5: "Habilitar",
  6: "Desabilitar",
  7: "Executar",
  8: "Limpar",
};

const RESOURCE_LABELS: Record<number, string> = {
  0: "Usuário",
  3: "Role",
  4: "Host",
  5: "Item",
  6: "Trigger",
  7: "Host Group",
  9: "Template",
  10: "Maintenance",
  11: "Action",
  14: "User Group",
  16: "Graph",
  17: "Dashboard",
  22: "Service",
  25: "Proxy",
  38: "Media Type",
  39: "Connector",
};

export default function AuditLogPage() {
  const { data, error, isLoading, progress, mutate } = useApi<{
    data: AuditLogEntry[];
  }>("/api/zabbix/audit-log?limit=100");

  const entries = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText size={20} style={{ color: "var(--brand-primary)" }} />
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Audit Log do Zabbix
          </h1>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{
            background: "var(--brand-glow)",
            border: "1px solid var(--brand-primary)",
            color: "var(--brand-primary)",
          }}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {error && <ErrorState title="Erro" message={error} />}

      {isLoading ? (
        <LoadingState label="Carregando audit log..." progress={progress} />
      ) : entries.length === 0 ? (
        <EmptyState title="Nenhuma entrada de audit log encontrada" />
      ) : (
        <div
          className="overflow-x-auto rounded-lg"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
          }}
        >
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                <th
                  className="text-left py-2 px-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  Timestamp
                </th>
                <th
                  className="text-left py-2 px-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  Usuário
                </th>
                <th
                  className="text-left py-2 px-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  Ação
                </th>
                <th
                  className="text-left py-2 px-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  Recurso
                </th>
                <th
                  className="text-left py-2 px-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  Nome
                </th>
                <th
                  className="text-left py-2 px-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  Detalhes
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.auditid}
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <td
                    className="py-1.5 px-3"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {new Date(e.clock * 1000).toLocaleString("pt-BR")}
                  </td>
                  <td
                    className="py-1.5 px-3"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {e.username}
                  </td>
                  <td className="py-1.5 px-3">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{
                        background: "var(--brand-glow)",
                        color: "var(--brand-primary)",
                      }}
                    >
                      {ACTION_LABELS[e.action] ?? `Ação ${e.action}`}
                    </span>
                  </td>
                  <td
                    className="py-1.5 px-3"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {RESOURCE_LABELS[e.resourcetype] ??
                      `Tipo ${e.resourcetype}`}
                  </td>
                  <td
                    className="py-1.5 px-3"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {e.resourcename}
                  </td>
                  <td
                    className="py-1.5 px-3 max-w-xs truncate"
                    style={{ color: "var(--text-muted)" }}
                    title={e.details}
                  >
                    {e.details}
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
