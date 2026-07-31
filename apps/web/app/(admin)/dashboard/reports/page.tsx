"use client";

import { RefreshCw } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/state-display";
import type { ZabbixReport } from "@repo/zabbix";

export default function ReportsPage() {
  const { data, error, isLoading, progress, mutate } = useApi<{ data: ZabbixReport[] }>("/api/zabbix/reports");
  const reports = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Relatórios Programados</h1>
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
        <LoadingState label="Carregando..." progress={progress} />
      ) : reports.length === 0 ? (
        <EmptyState title="Nenhum relatório programado" />
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <div key={r.reportid} className="rounded-lg p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{r.name}</span>
                <StatusBadge variant={r.status === "0" ? "ok" : "neutral"}>
                  {r.status === "0" ? "Ativo" : "Inativo"}
                </StatusBadge>
              </div>
              {r.description && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{r.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
