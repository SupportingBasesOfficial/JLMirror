"use client";

import { useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/zabbix-fetch";
import { useApi } from "@/lib/use-api";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/state-display";
import type { ZabbixMaintenance } from "@repo/zabbix";

export default function MaintenancePage() {
  const { data, error, isLoading, progress, mutate } = useApi<{ data: ZabbixMaintenance[] }>("/api/zabbix/maintenances");
  const maintenances = data?.data ?? [];
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Confirma remover esta janela de manutenção?")) return;
    try {
      await apiFetch(`/api/zabbix/maintenances/${id}`, { method: "DELETE" });
      await mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Janelas de Manutenção</h1>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-primary)", color: "var(--brand-primary)" }}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {(error || actionError) && (
        <ErrorState title="Erro" message={error ?? actionError ?? "Erro desconhecido"} />
      )}

      {isLoading ? (
        <LoadingState label="Carregando..." progress={progress} />
      ) : maintenances.length === 0 ? (
        <EmptyState title="Nenhuma janela de manutenção ativa" />
      ) : (
        <div className="space-y-2">
          {maintenances.map((m) => (
            <div key={m.maintenanceid} className="rounded-lg p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{m.name}</h3>
                  {m.description && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{m.description}</p>}
                </div>
                <button
                  onClick={() => handleDelete(m.maintenanceid)}
                  className="flex items-center gap-1 rounded-lg px-3 py-1 text-xs transition-colors"
                  style={{ background: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: "var(--status-error-text)" }}
                >
                  <Trash2 size={12} />
                  Remover
                </button>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>De: {new Date(Number(m.active_since) * 1000).toLocaleString("pt-BR")}</span>
                <span>Até: {new Date(Number(m.active_till) * 1000).toLocaleString("pt-BR")}</span>
                <span>Tipo: {String(m.maintenance_type) === "0" ? "Coleta de dados" : "Sem coleta"}</span>
              </div>
              {m.hosts && m.hosts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {m.hosts.map((h) => (
                    <span key={h.hostid} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--brand-glow)", color: "var(--brand-primary)" }}>
                      {h.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
