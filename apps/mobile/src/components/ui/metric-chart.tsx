// Graficos nativos sem dependencias externas — sparkline e gauge
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// ============================================================================
// Sparkline — barras verticais simples para serie temporal
// ============================================================================
interface SparklineProps {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
  /** Valor maximo para normalizar as barras. Se omitido, usa max dos valores. */
  maxValue?: number;
}

export function Sparkline({
  values,
  color = "#0d9488",
  height = 40,
  width = 120,
  maxValue,
}: SparklineProps) {
  if (!values || values.length === 0) {
    return (
      <View style={{ width, height }} className="items-center justify-center">
        <Text className="text-xs text-muted-foreground">sem dados</Text>
      </View>
    );
  }

  const max = maxValue ?? Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  // Limita a ~30 barras para caber no width
  const step = Math.max(1, Math.floor(values.length / 30));
  const sampled = values.filter((_, i) => i % step === 0).slice(-30);
  const barWidth = Math.max(2, Math.floor(width / sampled.length) - 1);

  return (
    <View style={{ width, height }} className="flex-row items-end gap-px">
      {sampled.map((v, i) => {
        const normalized = ((v - min) / range) * height;
        const barHeight = Math.max(2, normalized);
        return (
          <View
            key={i}
            style={{
              width: barWidth,
              height: barHeight,
              backgroundColor: color,
              opacity: 0.4 + (i / sampled.length) * 0.6,
              borderRadius: 1,
            }}
          />
        );
      })}
    </View>
  );
}

// ============================================================================
// Gauge — medidor circular com porcentagem
// ============================================================================
interface GaugeProps {
  value: number; // 0-100
  label: string;
  color?: string;
  size?: number;
}

export function Gauge({
  value,
  label,
  color = "#0d9488",
  size = 80,
}: GaugeProps) {
  const pct = Math.min(100, Math.max(0, value));
  const colorEffective = pct >= 90 ? "#dc2626" : pct >= 75 ? "#f59e0b" : color;

  return (
    <View className="items-center gap-1">
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 6,
          borderColor: `${colorEffective}30`,
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <Text className="text-lg font-bold" style={{ color: colorEffective }}>
          {pct.toFixed(0)}%
        </Text>
      </View>
      <Text
        className="text-xs text-muted-foreground text-center"
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

// ============================================================================
// MetricBar — barra horizontal com label e valor (para metricas simples)
// ============================================================================
interface MetricBarProps {
  label: string;
  value: string;
  /** Porcentagem 0-100 para preencher a barra. Se omitido, nao mostra barra. */
  percent?: number;
  color?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function MetricBar({
  label,
  value,
  percent,
  color = "#0d9488",
  icon,
}: MetricBarProps) {
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5 flex-1">
          {icon && <Ionicons name={icon} size={12} color="#737373" />}
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {label}
          </Text>
        </View>
        <Text className="text-xs font-semibold text-foreground">{value}</Text>
      </View>
      {percent != null && (
        <View className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <View
            style={{
              width: `${Math.min(100, Math.max(0, percent))}%`,
              height: "100%",
              backgroundColor:
                percent >= 90 ? "#dc2626" : percent >= 75 ? "#f59e0b" : color,
            }}
            className="rounded-full"
          />
        </View>
      )}
    </View>
  );
}
