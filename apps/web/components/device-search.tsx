"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, X, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/state-display";
import type { ZabbixHost } from "@repo/zabbix";

interface DeviceSearchProps {
  devices: ZabbixHost[];
  triggersByHost: Record<string, { description: string; priority: string }[]>;
}

export function DeviceSearch({ devices, triggersByHost }: DeviceSearchProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter((d) => {
      const matchesQuery =
        q === "" ||
        d.name.toLowerCase().includes(q) ||
        d.host.toLowerCase().includes(q) ||
        d.interfaces?.[0]?.ip?.includes(q);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "online" && d.status === "0") ||
        (statusFilter === "offline" && d.status !== "0");
      return matchesQuery && matchesStatus;
    });
  }, [devices, query, statusFilter]);

  return (
    <div className="space-y-3">
      {/* Barra de busca + filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, host ou IP..."
            className="w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none transition-colors"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors"
              style={{ color: "var(--text-muted)" }}
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filtros de status */}
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
          {(["all", "online", "offline"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: statusFilter === s ? "var(--brand-glow)" : "transparent",
                color: statusFilter === s ? "var(--brand-primary)" : "var(--text-muted)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {s === "all" ? "Todos" : s === "online" ? "Online" : "Offline"}
            </button>
          ))}
        </div>
      </div>

      {/* Resultados */}
      {query.trim() || statusFilter !== "all" ? (
        <div>
          <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </div>
          <div className="space-y-1.5">
            {filtered.map((d) => {
              const isOnline = d.status === "0";
              const ip = d.interfaces?.[0]?.ip ?? "N/A";
              const hostTriggers = triggersByHost[d.hostid] ?? [];
              const criticalCount = hostTriggers.filter((t) => t.priority === "4" || t.priority === "5").length;
              return (
                <Link
                  key={d.hostid}
                  href={`/dashboard/devices/${d.hostid}`}
                  className="block rounded-lg p-3 transition-all duration-150 no-underline"
                  style={{
                    background: "var(--surface-2)",
                    border: `1px solid ${isOnline ? "var(--border-default)" : "var(--status-error-border)"}`,
                    textDecoration: "none",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge variant={isOnline ? "ok" : "error"} dot pulse={isOnline}>
                      {isOnline ? "Online" : "Offline"}
                    </StatusBadge>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {d.name}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {d.host} · {ip}
                      </div>
                    </div>
                    {criticalCount > 0 && (
                      <StatusBadge variant="error">
                        {criticalCount} crítico{criticalCount !== 1 ? "s" : ""}
                      </StatusBadge>
                    )}
                    <ChevronRight size={16} className="shrink-0" style={{ color: "var(--text-muted)" }} />
                  </div>
                </Link>
              );
            })}
            {filtered.length === 0 && (
              <EmptyState
                title={`Nenhum dispositivo encontrado para "${query}"`}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
