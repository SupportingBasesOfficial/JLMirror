// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Header do device detail — título, auto-refresh, badges, time ranges

"use client";

import {
  COLORS,
  CHART_COLORS,
  TIME_RANGES,
  DEVICE_TYPE_LABELS,
  type DeviceType,
} from "./types";

interface DeviceHeaderProps {
  hostName: string;
  hostIp: string;
  hostId: string;
  deviceType: DeviceType;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  mounted: boolean;
  lastUpdate: string | null;
  timeRange: string;
  onRangeChange: (range: string) => void;
}

export function DeviceHeader({
  hostName,
  hostIp,
  hostId,
  deviceType,
  autoRefresh,
  onToggleAutoRefresh,
  mounted,
  lastUpdate,
  timeRange,
  onRangeChange,
}: DeviceHeaderProps) {
  return (
    <div className="flex flex-col gap-3 mb-3.5">
      {/* Row 1: title + auto-refresh + last update */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm font-medium" style={{ color: COLORS.text }}>
          Painel Executivo — {hostName}
        </div>
        <button
          onClick={onToggleAutoRefresh}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-[13px] transition-colors"
          style={{
            background: autoRefresh ? "var(--status-ok-bg)" : COLORS.card,
            color: autoRefresh ? CHART_COLORS.green : COLORS.muted,
            borderColor: autoRefresh
              ? "var(--status-ok-border)"
              : COLORS.border,
            cursor: "pointer",
          }}
        >
          {autoRefresh && (
            <span
              className="inline-block rounded-full"
              style={{
                width: 7,
                height: 7,
                background: CHART_COLORS.green,
                animation: "jlblink 0.9s infinite",
              }}
            />
          )}
          {autoRefresh ? "AO VIVO" : "PAUSADO"}
        </button>
        {mounted && lastUpdate && (
          <span className="text-[12px]" style={{ color: COLORS.muted }}>
            Atualizado: {lastUpdate}
          </span>
        )}
      </div>
      {/* Row 2: badges + time ranges + back */}
      <div className="flex items-center gap-2 text-[13px] flex-wrap">
        <span
          className="px-2.5 py-1 rounded border"
          style={{
            background: COLORS.card,
            color: COLORS.muted,
            borderColor: COLORS.border,
          }}
        >
          IP: {hostIp}
        </span>
        <span
          className="px-2.5 py-1 rounded border"
          style={{
            background: COLORS.card,
            color: COLORS.muted,
            borderColor: COLORS.border,
          }}
        >
          Host ID: {hostId}
        </span>
        <span
          className="px-2.5 py-1 rounded border font-bold text-[12px]"
          style={{
            background:
              deviceType === "unknown" ? COLORS.card : "var(--brand-glow)",
            color: deviceType === "unknown" ? COLORS.muted : COLORS.teal,
            borderColor:
              deviceType === "unknown" ? COLORS.border : "var(--brand-border)",
          }}
        >
          {DEVICE_TYPE_LABELS[deviceType]}
        </span>
        <div className="flex gap-1 ml-auto flex-wrap">
          {Object.keys(TIME_RANGES).map((range) => (
            <button
              key={range}
              onClick={() => onRangeChange(range)}
              className="px-2.5 py-1 rounded border transition-colors"
              style={{
                background: timeRange === range ? COLORS.teal : COLORS.card,
                color: timeRange === range ? "var(--surface-1)" : COLORS.muted,
                borderColor: COLORS.border,
                cursor: "pointer",
              }}
            >
              {range}
            </button>
          ))}
        </div>
        <a
          href="/dashboard"
          className="px-2.5 py-1 rounded border no-underline"
          style={{
            background: COLORS.card,
            color: COLORS.text,
            borderColor: COLORS.border,
          }}
        >
          ← Voltar
        </a>
      </div>
    </div>
  );
}
