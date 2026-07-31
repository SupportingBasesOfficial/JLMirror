"use client";

import { RefreshCw } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/state-display";
import type { ZabbixProxy } from "@repo/zabbix";

export default function ProxiesPage() {
  const { data, error, isLoading, progress, mutate } = useApi<{ data: ZabbixProxy[] }>("/api/zabbix/proxies");
  const proxies = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Proxies Zabbix</h1>
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
      ) : proxies.length === 0 ? (
        <EmptyState title="Nenhum proxy configurado" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {proxies.map((p) => (
            <div key={p.proxyid} className="rounded-lg p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{p.name}</h3>
                <StatusBadge variant={p.status === "5" ? "ok" : "warning"}>
                  {p.status === "5" ? "Online" : "Offline"}
                </StatusBadge>
              </div>
              {p.hosts && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{p.hosts.length} host(s) monitorado(s)</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
