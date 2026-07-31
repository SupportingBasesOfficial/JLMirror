"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/state-display";
import type { ZabbixGraph } from "@repo/zabbix";

export default function GraphsPage() {
  const [hostId, setHostId] = useState<string>("");
  const params = new URLSearchParams();
  if (hostId) params.set("host_id", hostId);
  const { data, error, isLoading, progress, mutate } = useApi<{ data: ZabbixGraph[] }>(`/api/zabbix/graphs?${params.toString()}`);
  const graphs = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Gráficos</h1>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-primary)", color: "var(--brand-primary)" }}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      <input
        type="text"
        placeholder="Filtrar por Host ID..."
        value={hostId}
        onChange={(e) => setHostId(e.target.value)}
        className="w-full max-w-xs rounded-lg px-3 py-1.5 text-sm outline-none"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
      />

      {error && (
        <ErrorState title="Erro" message={error} />
      )}

      {isLoading ? (
        <LoadingState label="Carregando..." progress={progress} />
      ) : graphs.length === 0 ? (
        <EmptyState title="Nenhum gráfico encontrado" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {graphs.map((g) => (
            <div key={g.graphid} className="rounded-lg p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
              <h3 className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>{g.name}</h3>
              <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>{g.width}x{g.height}</span>
                <span>Tipo: {g.graphtype}</span>
              </div>
              {g.gitems && g.gitems.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {g.gitems.map((gi) => (
                    <span key={gi.gitemid} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `color-mix(in srgb, ${gi.color} 20%, transparent)`, color: gi.color }}>
                      Item {gi.itemid}
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
