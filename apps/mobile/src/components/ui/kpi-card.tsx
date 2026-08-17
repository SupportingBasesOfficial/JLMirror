// @ai-context: .zero-error/architecture-map.md#ingress
// KpiCard — card de KPI reutilizavel com variant de cor.
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  variant?: "default" | "ok" | "warning" | "error" | "info";
}

const VARIANT_COLORS: Record<string, string> = {
  default: "#0d9488",
  ok: "#0d9488",
  warning: "#f59e0b",
  error: "#dc2626",
  info: "#3b82f6",
};

export function KpiCard({
  label,
  value,
  subtitle,
  icon,
  color,
  variant = "default",
}: KpiCardProps) {
  const effectiveColor = color ?? VARIANT_COLORS[variant] ?? "#0d9488";

  return (
    <View
      className="rounded-lg bg-card p-4 border"
      style={{ borderColor: `${effectiveColor}30` }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs uppercase text-muted-foreground">{label}</Text>
        <View
          className="w-7 h-7 rounded-lg items-center justify-center"
          style={{ backgroundColor: `${effectiveColor}15` }}
        >
          <Ionicons name={icon} size={16} color={effectiveColor} />
        </View>
      </View>
      <Text className="text-2xl font-bold text-foreground">{value}</Text>
      {subtitle && (
        <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={1}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}
