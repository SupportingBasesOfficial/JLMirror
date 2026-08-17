// Card de device Zabbix — status, CPU, memoria, rede, alertas, IP, grupo e uptime
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DeviceWithMetrics } from "@/hooks/use-zabbix-devices";
import type { ZabbixTrigger } from "@/lib/api-routes";
import { formatUptime } from "@/lib/zabbix-metrics";

const PRIORITY_COLORS: Record<string, string> = {
  "0": "#525252",
  "1": "#525252",
  "2": "#0d9488",
  "3": "#f59e0b",
  "4": "#dc2626",
  "5": "#7f1d1d",
};

/** Formata bits por segundo para Gbps/Mbps/Kbps/bps. */
function formatBps(bps: number): string {
  if (bps >= 1_000_000_000) return (bps / 1_000_000_000).toFixed(2) + " Gbps";
  if (bps >= 1_000_000) return (bps / 1_000_000).toFixed(1) + " Mbps";
  if (bps >= 1_000) return (bps / 1_000).toFixed(1) + " Kbps";
  return bps.toFixed(0) + " bps";
}

interface DeviceCardProps {
  device: DeviceWithMetrics;
  onPress?: (device: DeviceWithMetrics) => void;
}

export function DeviceCard({ device, onPress }: DeviceCardProps) {
  const {
    host,
    triggers,
    cpuPercent,
    memPercent,
    uptime,
    netInBps,
    netOutBps,
    netSpeedBps,
  } = device;
  const isOnline = host.status === "0";
  const statusColor = isOnline ? "#0d9488" : "#dc2626";

  const criticalCount = triggers.filter(
    (t) => t.priority === "4" || t.priority === "5",
  ).length;
  const warningCount = triggers.filter(
    (t) => t.priority === "2" || t.priority === "3",
  ).length;

  const statusLabel = !isOnline
    ? "Offline"
    : criticalCount > 0
      ? "Critico"
      : warningCount > 0
        ? "Aviso"
        : "Saudavel";

  const ip = host.interfaces?.[0]?.ip ?? "N/A";
  const group = host.hostgroups?.[0]?.name;
  const totalNetBps = (netInBps ?? 0) + (netOutBps ?? 0);
  const netPercent =
    netSpeedBps && netSpeedBps > 0
      ? Math.min((totalNetBps / netSpeedBps) * 100, 100)
      : undefined;

  return (
    <Pressable
      onPress={() => onPress?.(device)}
      className="rounded-lg bg-card p-4 border border-border active:opacity-70"
      style={{
        borderLeftWidth: 3,
        borderLeftColor:
          criticalCount > 0
            ? "#dc2626"
            : warningCount > 0
              ? "#f59e0b"
              : "#262626",
      }}
    >
      {/* Topo: status + alertas */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-1.5">
          <View
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          <Text className="text-xs font-medium" style={{ color: statusColor }}>
            {statusLabel}
          </Text>
        </View>
        {triggers.length > 0 && (
          <View
            className="px-2 py-0.5 rounded flex-row items-center gap-1"
            style={{
              backgroundColor: criticalCount > 0 ? "#dc262620" : "#f59e0b20",
            }}
          >
            <Ionicons
              name="notifications"
              size={10}
              color={criticalCount > 0 ? "#dc2626" : "#f59e0b"}
            />
            <Text
              className="text-xs font-semibold"
              style={{ color: criticalCount > 0 ? "#dc2626" : "#f59e0b" }}
            >
              {triggers.length}
            </Text>
          </View>
        )}
      </View>

      {/* Conteudo principal + chevron */}
      <View className="flex-row items-start gap-2">
        <View className="flex-1">
          {/* Nome + host ID */}
          <Text
            className="text-sm font-semibold text-foreground mb-0.5"
            numberOfLines={1}
          >
            {host.name}
          </Text>
          <View className="flex-row items-center gap-1.5 mb-1">
            <Text className="text-xs text-muted-foreground">
              #{host.hostid}
            </Text>
            <Text className="text-xs text-muted-foreground">·</Text>
            <Ionicons name="wifi-outline" size={11} color="#737373" />
            <Text className="text-xs text-muted-foreground">{ip}</Text>
          </View>

          {/* Grupo + uptime */}
          <View className="flex-row items-center gap-2 mb-1">
            {group && (
              <View className="flex-row items-center gap-1 flex-1">
                <Ionicons name="folder-outline" size={11} color="#737373" />
                <Text
                  className="text-xs text-muted-foreground"
                  numberOfLines={1}
                >
                  {group}
                </Text>
              </View>
            )}
            {uptime != null && isOnline && (
              <View className="flex-row items-center gap-1">
                <Ionicons name="time-outline" size={11} color="#737373" />
                <Text className="text-xs text-muted-foreground">
                  {formatUptime(uptime)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Chevron de navegacao */}
        <View className="items-center justify-center pt-1">
          <Ionicons name="chevron-forward" size={18} color="#737373" />
        </View>
      </View>

      {/* Metricas: CPU + Memoria + Rede */}
      {(cpuPercent != null || memPercent != null || netInBps != null) &&
        isOnline && (
          <View className="flex-row gap-3 mt-2">
            {cpuPercent != null && (
              <View className="flex-1">
                <View className="flex-row items-center justify-between mb-0.5">
                  <Text className="text-xs text-muted-foreground">CPU</Text>
                  <Text
                    className="text-xs font-semibold"
                    style={{
                      color:
                        cpuPercent > 80
                          ? "#dc2626"
                          : cpuPercent > 50
                            ? "#f59e0b"
                            : "#0d9488",
                    }}
                  >
                    {cpuPercent.toFixed(1)}%
                  </Text>
                </View>
                <View className="h-1 rounded-full bg-secondary overflow-hidden">
                  <View
                    style={{
                      width: `${Math.min(cpuPercent, 100)}%`,
                      height: "100%",
                      backgroundColor:
                        cpuPercent > 80
                          ? "#dc2626"
                          : cpuPercent > 50
                            ? "#f59e0b"
                            : "#0d9488",
                    }}
                    className="rounded-full"
                  />
                </View>
              </View>
            )}
            {memPercent != null && (
              <View className="flex-1">
                <View className="flex-row items-center justify-between mb-0.5">
                  <Text className="text-xs text-muted-foreground">Mem</Text>
                  <Text
                    className="text-xs font-semibold"
                    style={{
                      color:
                        memPercent > 85
                          ? "#dc2626"
                          : memPercent > 70
                            ? "#f59e0b"
                            : "#0d9488",
                    }}
                  >
                    {memPercent.toFixed(0)}%
                  </Text>
                </View>
                <View className="h-1 rounded-full bg-secondary overflow-hidden">
                  <View
                    style={{
                      width: `${Math.min(memPercent, 100)}%`,
                      height: "100%",
                      backgroundColor:
                        memPercent > 85
                          ? "#dc2626"
                          : memPercent > 70
                            ? "#f59e0b"
                            : "#0d9488",
                    }}
                    className="rounded-full"
                  />
                </View>
              </View>
            )}
            {netInBps != null && (
              <View className="flex-1">
                <View className="flex-row items-center justify-between mb-0.5">
                  <Text className="text-xs text-muted-foreground">Rede</Text>
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: "#0d9488" }}
                  >
                    {formatBps(totalNetBps)}
                  </Text>
                </View>
                <View className="h-1 rounded-full bg-secondary overflow-hidden">
                  <View
                    style={{
                      width: `${netPercent != null ? netPercent : 5}%`,
                      height: "100%",
                      backgroundColor: "#0d9488",
                    }}
                    className="rounded-full"
                  />
                </View>
                {/* Detalhe download/upload */}
                <View className="flex-row items-center gap-2 mt-0.5">
                  <Text className="text-[10px]" style={{ color: "#0d9488" }}>
                    ↓ {formatBps(netInBps)}
                  </Text>
                  <Text className="text-[10px]" style={{ color: "#f59e0b" }}>
                    ↑ {formatBps(netOutBps ?? 0)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

      {/* Alert pills — ate 3 + "+N" */}
      {triggers.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 mt-2">
          {triggers.slice(0, 3).map((t: ZabbixTrigger) => {
            const color = PRIORITY_COLORS[t.priority] ?? "#525252";
            return (
              <View
                key={t.triggerid}
                className="px-2 py-0.5 rounded"
                style={{ backgroundColor: `${color}20` }}
              >
                <Text
                  className="text-xs font-medium"
                  style={{ color }}
                  numberOfLines={1}
                >
                  {t.description.slice(0, 30)}
                </Text>
              </View>
            );
          })}
          {triggers.length > 3 && (
            <View className="px-2 py-0.5 rounded bg-secondary">
              <Text className="text-xs text-muted-foreground">
                +{triggers.length - 3}
              </Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}
