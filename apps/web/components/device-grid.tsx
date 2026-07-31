"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/state-display";
import type { ZabbixHost, ZabbixTrigger } from "@repo/zabbix";

const PRIORITY_VARIANT: Record<string, "ok" | "info" | "warning" | "error" | "critical" | "neutral"> = {
  "0": "neutral",
  "1": "info",
  "2": "warning",
  "3": "warning",
  "4": "error",
  "5": "critical",
};

const PRIORITY_LABELS: Record<string, string> = {
  "0": "Info",
  "1": "Info",
  "2": "Aviso",
  "3": "Aviso",
  "4": "Crítico",
  "5": "Crítico",
};

function formatBps(bps: number): string {
  if (bps >= 1000000000) return (bps / 1000000000).toFixed(2) + " Gbps";
  if (bps >= 1000000) return (bps / 1000000).toFixed(1) + " Mbps";
  if (bps >= 1000) return (bps / 1000).toFixed(1) + " Kbps";
  return bps.toFixed(0) + " bps";
}

interface DeviceGridProps {
  devices: ZabbixHost[];
  triggersByHost: Record<string, ZabbixTrigger[]>;
  cpuByHost: Map<string, number>;
  netInByHost: Map<string, number>;
  netOutByHost: Map<string, number>;
  netSpeedByHost: Map<string, number>;
}

export function DeviceGrid({
  devices,
  triggersByHost,
  cpuByHost,
  netInByHost,
  netOutByHost,
  netSpeedByHost,
}: DeviceGridProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return devices;
    const q = search.toLowerCase();
    return devices.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.hostid.includes(q) ||
        d.interfaces?.[0]?.ip?.includes(q),
    );
  }, [devices, search]);

  return (
    <div>
      {/* Section header with search */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Dispositivos
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, IP ou ID..."
            className="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none transition-colors"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--brand-primary)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; }}
          />
        </div>
      </div>

      {/* Results count */}
      {search.trim() && (
        <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
          {filtered.length} de {devices.length} dispositivo(s)
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum dispositivo encontrado"
          message="Tente buscar por outro nome, IP ou ID."
        />
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {filtered.map((device) => {
            const isOnline = device.status === "0";
            const hostTriggers = triggersByHost[device.hostid] ?? [];
            const hasCritical = hostTriggers.some((t) => t.priority === "4" || t.priority === "5");
            const hasWarning = hostTriggers.some((t) => t.priority === "2" || t.priority === "3");
            const statusVariant = !isOnline ? "error" : hasCritical ? "critical" : hasWarning ? "warning" : "ok";
            const statusLabel = !isOnline ? "Offline" : hasCritical ? "Crítico" : hasWarning ? "Aviso" : "Saudável";
            const cpuValue = cpuByHost.get(device.hostid);
            const netInValue = netInByHost.get(device.hostid);
            const netOutValue = netOutByHost.get(device.hostid);
            const netSpeedValue = netSpeedByHost.get(device.hostid);
            const alertCount = hostTriggers.length;

            return (
              <Link
                key={device.hostid}
                href={`/dashboard/devices/${device.hostid}`}
                prefetch={false}
                className="block rounded-xl p-4 transition-all duration-200 no-underline group"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-default)",
                  textDecoration: "none",
                }}
              >
                {/* Top row: status + alerts badge */}
                <div className="flex items-center justify-between mb-3">
                  <StatusBadge variant={statusVariant} dot pulse={isOnline && !hasCritical}>
                    {statusLabel}
                  </StatusBadge>
                  {alertCount > 0 && (
                    <StatusBadge variant={hasCritical ? "error" : "warning"}>
                      {alertCount} alerta{alertCount > 1 ? "s" : ""}
                    </StatusBadge>
                  )}
                </div>

                {/* Device name + ID */}
                <div className="mb-3">
                  <h3 className="text-sm font-semibold mb-0.5 transition-colors" style={{ color: "var(--text-primary)" }}>
                    {device.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>#{device.hostid}</span>
                    <span>·</span>
                    <span style={{ color: "var(--brand-secondary)" }}>{device.interfaces?.[0]?.ip ?? "N/A"}</span>
                  </div>
                </div>

                {/* Metrics row */}
                <div className="flex items-center gap-4 mb-3">
                  {/* CPU */}
                  {cpuValue !== undefined && isOnline && (
                    <div className="flex-1 group/cpu relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>CPU</span>
                        <span
                          className="text-xs font-semibold tabular-nums"
                          style={{ color: cpuValue > 80 ? "var(--status-error-text)" : cpuValue > 50 ? "var(--status-warning-text)" : "var(--status-ok-text)" }}
                        >
                          {cpuValue.toFixed(1)}%
                        </span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 4, background: "var(--border-default)" }}>
                        <div
                          className="rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(cpuValue, 100)}%`,
                            height: "100%",
                            background: cpuValue > 80 ? "var(--status-error-text)" : cpuValue > 50 ? "var(--status-warning-text)" : "var(--status-ok-text)",
                          }}
                        />
                      </div>
                      {/* CPU tooltip */}
                      <div
                        className="absolute bottom-full left-0 mb-1 opacity-0 pointer-events-none group-hover/cpu:opacity-100 transition-opacity z-20 rounded-lg px-2.5 py-1.5"
                        style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", whiteSpace: "nowrap" }}
                      >
                        <div className="text-xs font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>CPU</div>
                        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          Em uso: <b style={{ color: cpuValue > 80 ? "var(--status-error-text)" : cpuValue > 50 ? "var(--status-warning-text)" : "var(--status-ok-text)" }}>{cpuValue.toFixed(1)}%</b>
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          Disponível: <b style={{ color: "var(--status-ok-text)" }}>{(100 - cpuValue).toFixed(1)}%</b>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Network */}
                  {netInValue !== undefined && isOnline && (
                    <div className="flex-1 group/net relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Rede</span>
                        <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--brand-secondary)" }}>
                          {formatBps(netInValue + (netOutValue ?? 0))}
                        </span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 4, background: "var(--border-default)" }}>
                        <div
                          className="rounded-full transition-all duration-300"
                          style={{
                            width: `${netSpeedValue && netSpeedValue > 0 ? Math.min(((netInValue + (netOutValue ?? 0)) / netSpeedValue) * 100, 100) : 5}%`,
                            height: "100%",
                            background: "var(--brand-secondary)",
                          }}
                        />
                      </div>
                      {/* Network tooltip */}
                      <div
                        className="absolute bottom-full left-0 mb-1 opacity-0 pointer-events-none group-hover/net:opacity-100 transition-opacity z-20 rounded-lg px-2.5 py-1.5"
                        style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", whiteSpace: "nowrap" }}
                      >
                        <div className="text-xs font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>Tráfego de Rede</div>
                        <div className="text-xs" style={{ color: "var(--brand-secondary)" }}>
                          ↓ Download: <b>{formatBps(netInValue)}</b>
                        </div>
                        <div className="text-xs" style={{ color: "var(--status-warning-text)" }}>
                          ↑ Upload: <b>{formatBps(netOutValue ?? 0)}</b>
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Velocidade: <b style={{ color: "var(--text-secondary)" }}>{netSpeedValue ? formatBps(netSpeedValue) : "N/A"}</b>
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Disponível: <b style={{ color: "var(--text-secondary)" }}>{netSpeedValue ? formatBps(Math.max(netSpeedValue - netInValue - (netOutValue ?? 0), 0)) : "N/A"}</b>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Arrow */}
                  <div className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24 }}>
                    <ChevronRight
                      size={16}
                      className="transition-all"
                      style={{ color: "var(--text-muted)" }}
                    />
                  </div>
                </div>

                {/* Alert pills */}
                {hostTriggers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {hostTriggers.slice(0, 3).map((t) => {
                      const variant = PRIORITY_VARIANT[t.priority] ?? "neutral";
                      const label = PRIORITY_LABELS[t.priority] ?? "Info";
                      return (
                        <StatusBadge key={t.triggerid} variant={variant}>
                          {label}: {t.description}
                        </StatusBadge>
                      );
                    })}
                    {hostTriggers.length > 3 && (
                      <StatusBadge variant="neutral">
                        +{hostTriggers.length - 3}
                      </StatusBadge>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
