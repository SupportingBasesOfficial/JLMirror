// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/state-display";
import type { ZabbixTemplate } from "@repo/zabbix";

export default function TemplatesPage() {
  const [hostId, setHostId] = useState("");
  const [search, setSearch] = useState("");
  const params = new URLSearchParams();
  if (hostId) params.set("host_id", hostId);
  const { data, error, isLoading, progress, mutate } = useApi<{ data: ZabbixTemplate[] }>(`/api/zabbix/templates?${params.toString()}`);
  const templates = data?.data ?? [];

  const filtered = templates.filter((t) =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.host.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Templates</h1>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{ background: "var(--brand-glow)", border: "1px solid var(--brand-primary)", color: "var(--brand-primary)" }}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Filtrar por Host ID..."
          value={hostId}
          onChange={(e) => setHostId(e.target.value)}
          className="w-full max-w-xs rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        />
        <input
          type="text"
          placeholder="Buscar template..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        />
      </div>

      {error && (
        <ErrorState title="Erro" message={error} />
      )}

      {isLoading ? (
        <LoadingState label="Carregando..." progress={progress} />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum template encontrado" />
      ) : (
        <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border-default)", background: "var(--surface-2)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Nome</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Host</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.templateid} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="py-2 px-3" style={{ color: "var(--text-primary)" }}>{t.name}</td>
                  <td className="py-2 px-3" style={{ color: "var(--text-muted)" }}>{t.host}</td>
                  <td className="py-2 px-3 text-xs" style={{ color: "var(--text-muted)" }}>{t.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
