// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Gráfico detalhado com seletor de métrica

"use client";

import { MetricChart } from "@/components/metric-chart";
import {
  COLORS,
  formatMetricValue,
  type HistoryEntry,
  type ZabbixItem,
} from "./types";

interface ChartSectionProps {
  selectedItem: ZabbixItem | null;
  numericItems: ZabbixItem[];
  loading: boolean;
  error: string | null;
  history: HistoryEntry[];
  onItemChange: (itemId: string) => void;
  onRefresh: () => void;
}

export function ChartSection({
  selectedItem,
  numericItems,
  loading,
  error,
  history,
  onItemChange,
  onRefresh,
}: ChartSectionProps) {
  const chartData = history.map((h) => ({
    clock: h.clock,
    value: parseFloat(h.value),
    time: new Date(h.clock * 1000).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  return (
    <>
      <div
        className="text-[13px] font-bold tracking-wide"
        style={{ color: COLORS.muted }}
      >
        GRÁFICO DETALHADO
      </div>
      <div
        className="rounded-md p-3.5 mb-4 flex flex-wrap items-center gap-3.5"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="metric-select"
            className="text-xs font-medium"
            style={{ color: COLORS.muted }}
          >
            Métrica
          </label>
          <select
            id="metric-select"
            value={selectedItem?.itemid ?? ""}
            onChange={(e) => onItemChange(e.target.value)}
            className="rounded-md px-3 py-1.5 text-sm focus:outline-none"
            style={{
              background: COLORS.bg,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {numericItems.map((item) => (
              <option key={item.itemid} value={item.itemid}>
                {item.name} ({formatMetricValue(item.lastvalue, item.units)})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto rounded-md px-3 py-1.5 text-sm transition-opacity disabled:opacity-50"
          style={{
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
            background: COLORS.bg,
            cursor: "pointer",
          }}
        >
          {loading ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      {error ? (
        <div
          className="rounded-md p-4 mb-4"
          style={{
            border: "1px solid var(--status-error-border)",
            background: "var(--status-error-bg)",
          }}
        >
          <p className="text-sm" style={{ color: COLORS.red }}>
            {error}
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <MetricChart
            data={chartData}
            metricName={selectedItem?.name ?? "Métrica"}
            units={selectedItem?.units ?? ""}
          />
        </div>
      )}
    </>
  );
}
