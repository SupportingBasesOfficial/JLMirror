// Graficos nativos com Victory Native (Skia) — line chart profissional
// Renderizacao nativa Skia com escala responsiva + zoom/pan nativo
import React, { useMemo } from "react";
import { View, Text, useWindowDimensions } from "react-native";
import { CartesianChart, Line, useChartTransformState } from "victory-native";
import { matchFont } from "@shopify/react-native-skia";

// ============================================================================
// Tipos compartilhados
// ============================================================================
export interface DataPoint {
  time: number; // timestamp em segundos (clock do Zabbix)
  value: number; // valor da metrica
}

interface LineChartSeries {
  data: DataPoint[];
  color: string;
  label: string;
}

interface LineChartProps {
  series: LineChartSeries[];
  height?: number;
  width?: number;
  unit?: string;
  timeRangeSeconds?: number;
  nowSec?: number;
  thresholds?: { value: number; color: string; label?: string }[];
}

// ============================================================================
// Formata timestamp baseado no periodo
// ============================================================================
function formatAxisTime(ts: number, rangeSec: number): string {
  const d = new Date(ts * 1000);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");

  // Periodo curto (< 24h): so HH:mm
  if (rangeSec <= 86400) return `${h}:${m}`;
  // Periodo medio (1-3 dias): dd/MM HH:mm
  if (rangeSec <= 259200) return `${dd}/${mm} ${h}:${m}`;
  // Periodo longo (7+ dias): dd/MM
  return `${dd}/${mm}`;
}

// ============================================================================
// Downsample — LTTB (Largest Triangle Three Buckets) preserva a forma visual
// ============================================================================
function downsample(data: DataPoint[], maxPoints = 200): DataPoint[] {
  if (data.length <= maxPoints) return data;

  const result: DataPoint[] = [data[0]!];
  const bucketSize = (data.length - 2) / (maxPoints - 2);
  let a = data[0]!;

  for (let i = 0; i < maxPoints - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    const nextBucket =
      data.slice(rangeEnd, rangeEnd + 1)[0] ?? data[data.length - 1]!;

    // Encontra o ponto no bucket atual que forma o maior triangulo
    let maxArea = -1;
    let maxAreaPoint = data[rangeStart]!;
    for (let j = rangeStart; j < rangeEnd; j++) {
      const p = data[j]!;
      const area =
        Math.abs(
          (a.time - nextBucket.time) * (p.value - a.value) -
            (a.time - p.time) * (nextBucket.value - a.value),
        ) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = p;
      }
    }
    result.push(maxAreaPoint);
    a = maxAreaPoint;
  }
  result.push(data[data.length - 1]!);
  return result;
}

// ============================================================================
// Formata valor do eixo Y com sufixos (K, M, G)
// ============================================================================
function formatYValue(val: number, unit?: string): string {
  const abs = Math.abs(val);
  if (unit === "bps") {
    if (abs >= 1e9) return `${(val / 1e9).toFixed(1)}G`;
    if (abs >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  }
  if (abs >= 1e6) return `${(val / 1e6).toFixed(1)}M${unit ?? ""}`;
  if (abs >= 1e3) return `${(val / 1e3).toFixed(1)}K${unit ?? ""}`;
  return `${val.toFixed(0)}${unit ?? ""}`;
}

// ============================================================================
// LineChart — grafico de linha com Victory Native (Skia) + zoom/pan nativo
// ============================================================================
export function LineChart({
  series,
  height = 160,
  width,
  unit,
  timeRangeSeconds,
  nowSec,
}: LineChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = width ?? screenWidth - 32;
  const hasData = series.some((s) => s.data.length > 0);

  // Fonte do sistema via matchFont
  const font = useMemo(
    () =>
      matchFont({
        fontFamily: "sans-serif",
        fontSize: 10,
        fontWeight: "normal",
      }),
    [],
  );

  // Estado de transformacao para zoom/pan nativo
  const { state } = useChartTransformState();

  // Periodo efetivo
  const rangeSec = timeRangeSeconds ?? 3600;
  const currentNow = nowSec ?? Math.floor(Date.now() / 1000);
  const fromSec = currentNow - rangeSec;

  // Downsample cada serie para max 300 pontos
  const downsampledSeries = useMemo(
    () => series.map((s) => ({ ...s, data: downsample(s.data, 200) })),
    [series],
  );

  if (!hasData) {
    return (
      <View
        style={{ width: chartWidth, height }}
        className="items-center justify-center"
      >
        <Text className="text-xs text-muted-foreground">sem dados</Text>
      </View>
    );
  }

  // Transforma dados: eixo X numerico (timestamp), multi-serie agrupada por timestamp
  const victoryData = useMemo(() => {
    const byTime = new Map<
      number,
      {
        ts: number;
        value0?: number;
        value1?: number;
        value2?: number;
        value3?: number;
      }
    >();

    for (let s = 0; s < downsampledSeries.length; s++) {
      for (const pt of downsampledSeries[s]!.data) {
        if (!byTime.has(pt.time)) {
          byTime.set(pt.time, { ts: pt.time });
        }
        const entry = byTime.get(pt.time)!;
        const key = `value${s}` as "value0" | "value1" | "value2" | "value3";
        entry[key] = pt.value;
      }
    }

    return Array.from(byTime.values()).sort((a, b) => a.ts - b.ts);
  }, [downsampledSeries]);

  const yKeys = downsampledSeries.map((_, i) => `value${i}`) as (
    "value0" | "value1" | "value2" | "value3"
  )[];

  return (
    <View style={{ width: chartWidth, height }}>
      <CartesianChart
        data={victoryData}
        xKey="ts"
        yKeys={yKeys}
        padding={{ left: 44, right: 16, top: 10, bottom: 24 }}
        domainPadding={{ left: 10, right: 10, top: 10, bottom: 10 }}
        domain={{
          x: [fromSec, currentNow],
        }}
        axisOptions={{
          font,
          labelColor: "#6E7F88",
          lineColor: "#1E2530",
          lineWidth: 0.5,
          labelOffset: 6,
          labelPosition: "outset",
          tickCount: { x: 6, y: 5 },
          formatXLabel: (label: number) => formatAxisTime(label, rangeSec),
          formatYLabel: (label: number | undefined) =>
            formatYValue(label ?? 0, unit),
        }}
        transformState={state}
        transformConfig={{
          pan: { enabled: true, dimensions: ["x"] },
          pinch: { enabled: true, dimensions: ["x"] },
        }}
      >
        {({ points }) => (
          <>
            {downsampledSeries.map((s, i) => {
              const key = `value${i}` as
                "value0" | "value1" | "value2" | "value3";
              const pts = points[key];
              if (!pts || pts.length === 0) return null;
              return (
                <React.Fragment key={i}>
                  <Line
                    points={pts}
                    color={s.color}
                    strokeWidth={1}
                    curveType="linear"
                    connectMissingData={false}
                  />
                </React.Fragment>
              );
            })}
          </>
        )}
      </CartesianChart>
    </View>
  );
}

// ============================================================================
// Sparkline — alias para LineChart com uma serie
// ============================================================================
interface SparklineProps {
  values: DataPoint[];
  color?: string;
  height?: number;
  width?: number;
  unit?: string;
  timeRangeSeconds?: number;
  nowSec?: number;
}

export function Sparkline({
  values,
  color = "#0d9488",
  height = 80,
  width,
  unit,
  timeRangeSeconds,
  nowSec,
}: SparklineProps) {
  return (
    <LineChart
      series={[{ data: values, color, label: "" }]}
      height={height}
      width={width}
      unit={unit}
      timeRangeSeconds={timeRangeSeconds}
      nowSec={nowSec}
    />
  );
}

// ============================================================================
// Gauge — medidor circular (CPU, memoria) — mantem SVG simples
// ============================================================================
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";

interface GaugeProps {
  value: number;
  label: string;
  size?: number;
  unit?: string;
}

export function Gauge({ value, label, size = 80, unit = "%" }: GaugeProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;
  const color =
    clampedValue > 80 ? "#dc2626" : clampedValue > 60 ? "#f59e0b" : "#35D0C4";
  const gaugeId = useMemo(
    () => `gauge-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  return (
    <View className="items-center">
      <View
        style={{ width: size, height: size }}
        className="items-center justify-center"
      >
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id={gaugeId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={color} stopOpacity="0.8" />
              <Stop offset="100%" stopColor={color} stopOpacity="0.4" />
            </LinearGradient>
          </Defs>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#1E2530"
            strokeWidth="4"
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={`url(#${gaugeId})`}
            strokeWidth="4"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View
          style={{ position: "absolute" }}
          className="items-center justify-center"
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color }}>
            {clampedValue.toFixed(0)}
            {unit}
          </Text>
        </View>
      </View>
      <Text className="mt-1 text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

// ============================================================================
// MetricBar — barra de progresso horizontal com label e percentual
// ============================================================================
interface MetricBarProps {
  label: string;
  value: string;
  percent?: number;
  color?: string;
}

export function MetricBar({ label, value, percent, color }: MetricBarProps) {
  const pct = Math.max(0, Math.min(100, percent ?? 0));
  const barColor =
    color ?? (pct > 80 ? "#dc2626" : pct > 60 ? "#f59e0b" : "#35D0C4");

  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-medium text-foreground" numberOfLines={1}>
          {label}
        </Text>
        <Text className="text-xs font-semibold" style={{ color: barColor }}>
          {value}
        </Text>
      </View>
      {percent != null && (
        <View className="h-2 rounded-full bg-secondary overflow-hidden">
          <View
            style={{
              width: `${pct}%`,
              height: "100%",
              backgroundColor: barColor,
            }}
            className="rounded-full"
          />
        </View>
      )}
    </View>
  );
}
