"use client";

import { RefreshCw } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/state-display";
import type { ZabbixAction } from "@repo/zabbix";

const EVENT_SOURCE_LABELS: Record<string, string> = {
  "0": "Trigger",
  "1": "Discovery",
  "2": "Auto-registration",
  "3": "Internal",
  "4": "Service",
};

export default function ActionsPage() {
  const { data, error, isLoading, mutate } = useApi<{ data: ZabbixAction[] }>("/api/zabbix/actions");
  const actions = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Ações de Notificação</h1>
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
      ) : actions.length === 0 ? (
        <EmptyState title="Nenhuma ação configurada" />
      ) : (
        <div className="space-y-2">
          {actions.map((a) => (
            <div key={a.actionid} className="rounded-lg p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{a.name}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                    {EVENT_SOURCE_LABELS[a.eventsource] ?? "Desconhecido"}
                  </span>
                </div>
                <StatusBadge variant={a.status === "0" ? "ok" : "neutral"}>
                  {a.status === "0" ? "Ativa" : "Desativada"}
                </StatusBadge>
              </div>
              {a.operations && a.operations.length > 0 && (
                <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {a.operations.length} operação(ões)
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
