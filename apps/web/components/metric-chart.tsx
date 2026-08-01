// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
} from "recharts";

interface HistoryPoint {
  clock: number;
  value: number;
  time: string;
}

function formatValue(value: number, units: string): string {
  if (units === "B") {
    if (value >= 1073741824) return (value / 1073741824).toFixed(2) + " GB";
    if (value >= 1048576) return (value / 1048576).toFixed(1) + " MB";
    if (value >= 1024) return (value / 1024).toFixed(1) + " KB";
    return value.toFixed(0) + " B";
  }
  if (units === "bps") {
    if (value >= 1000000000) return (value / 1000000000).toFixed(2) + " Gbps";
    if (value >= 1000000) return (value / 1000000).toFixed(1) + " Mbps";
    if (value >= 1000) return (value / 1000).toFixed(1) + " Kbps";
    return value.toFixed(0) + " bps";
  }
  if (units === "%") return value.toFixed(2) + "%";
  if (units === "s") return value.toFixed(3) + "s";
  return value.toFixed(2) + units;
}

function formatAxis(value: number, units: string): string {
  if (units === "B") {
    if (value >= 1073741824) return (value / 1073741824).toFixed(1) + "GB";
    if (value >= 1048576) return (value / 1048576).toFixed(0) + "MB";
    if (value >= 1024) return (value / 1024).toFixed(0) + "KB";
    return value.toFixed(0) + "B";
  }
  if (units === "bps") {
    if (value >= 1000000000) return (value / 1000000000).toFixed(1) + "G";
    if (value >= 1000000) return (value / 1000000).toFixed(0) + "M";
    if (value >= 1000) return (value / 1000).toFixed(0) + "K";
    return value.toFixed(0);
  }
  if (units === "%") return value.toFixed(0) + "%";
  if (units === "s") return value.toFixed(2) + "s";
  if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
  if (value >= 1000) return (value / 1000).toFixed(1) + "K";
  return value.toFixed(0);
}

export function MetricChart({
  data,
  metricName,
  units,
}: {
  data: HistoryPoint[];
  metricName: string;
  units: string;
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex h-64 items-center justify-center rounded-md"
        style={{ border: "1px solid var(--border-default)", background: "var(--surface-2)" }}
      >
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Sem dados de monitoramento para esta métrica no período selecionado.
        </p>
      </div>
    );
  }

  const lastValue = data[data.length - 1]?.value ?? 0;
  const strokeW = data.length > 200 ? 1 : data.length > 100 ? 1.5 : 2;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {metricName}
        </h3>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {data.length} pontos · último: {formatValue(lastValue, units)}
        </span>
      </div>
      <div
        className="h-64 w-full rounded-md p-4"
        style={{ border: "1px solid var(--border-default)", background: "var(--surface-2)" }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 8, right: 8, bottom: data.length > 50 ? 10 : 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
            <XAxis
              dataKey="time"
              stroke="var(--text-muted)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={70}
              tickFormatter={(v: number) => formatAxis(v, units)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "var(--text-primary)" }}
              formatter={(value) => [formatValue(Number(value), units), metricName]}
            />
            <Line
              type="natural"
              dataKey="value"
              stroke="var(--brand-primary)"
              strokeWidth={strokeW}
              dot={false}
              animationDuration={300}
              isAnimationActive={data.length <= 200}
            />
            {data.length > 50 && (
              <Brush
                dataKey="time"
                height={20}
                stroke="var(--brand-primary)"
                fill="var(--surface-2)"
                travellerWidth={8}
                tickFormatter={() => ""}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
