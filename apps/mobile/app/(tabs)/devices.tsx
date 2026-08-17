// @ai-context: .zero-error/architecture-map.md#ingress
// Devices — lista de hosts do Zabbix com busca, filtro de status e metricas
import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import {
  useZabbixDevices,
  type DeviceWithMetrics,
} from "@/hooks/use-zabbix-devices";
import { DeviceCard } from "@/components/ui/device-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Ionicons } from "@expo/vector-icons";

type StatusFilter = "all" | "online" | "offline" | "critical" | "warning";
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "critical", label: "Criticos" },
  { value: "warning", label: "Avisos" },
];

export default function DevicesScreen() {
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } =
    useZabbixDevices();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filteredDevices = useMemo(() => {
    if (!data?.devices) return [];
    return data.devices.filter((d: DeviceWithMetrics) => {
      const host = d.host;
      const q = search.toLowerCase();
      const matchesSearch =
        !search ||
        host.name.toLowerCase().includes(q) ||
        host.host.toLowerCase().includes(q) ||
        host.hostid.includes(search) ||
        (host.interfaces?.[0]?.ip ?? "").includes(search);
      const isOnline = host.status === "0";
      const hasCritical = d.triggers.some(
        (t) => t.priority === "4" || t.priority === "5",
      );
      const hasWarning = d.triggers.some(
        (t) => t.priority === "2" || t.priority === "3",
      );
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "online" && isOnline && !hasCritical) ||
        (statusFilter === "offline" && !isOnline) ||
        (statusFilter === "critical" && hasCritical) ||
        (statusFilter === "warning" && hasWarning && !hasCritical);
      return matchesSearch && matchesStatus;
    });
  }, [data, search, statusFilter]);

  function handleDevicePress(device: DeviceWithMetrics) {
    router.push(`/device/${device.host.hostid}`);
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#0d9488" />
      </View>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        message="Erro ao carregar dispositivos"
      />
    );
  }

  const total = data?.devices.length ?? 0;
  const onlineCount = (data?.devices ?? []).filter(
    (d) => d.host.status === "0",
  ).length;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-4 pb-8 gap-3"
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor="#0d9488"
        />
      }
    >
      {/* Resumo */}
      <View className="flex-row gap-2">
        <View className="flex-1 rounded-lg bg-card p-3 border border-border flex-row items-center justify-between">
          <Text className="text-xs text-muted-foreground">Online</Text>
          <Text className="text-sm font-bold text-primary">
            {onlineCount}/{total}
          </Text>
        </View>
      </View>

      {/* Busca */}
      <View className="flex-row items-center gap-2 rounded-lg bg-card border border-border px-3">
        <Ionicons name="search-outline" size={18} color="#525252" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por nome, host, IP ou ID..."
          placeholderTextColor="#525252"
          className="flex-1 py-3 text-sm text-foreground"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color="#525252" />
          </Pressable>
        )}
      </View>

      {/* Filtros de status */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {STATUS_FILTERS.map((filter) => (
          <Pressable
            key={filter.value}
            onPress={() => setStatusFilter(filter.value)}
            className={`px-3 py-1.5 rounded-lg border ${
              statusFilter === filter.value
                ? "bg-primary border-primary"
                : "bg-card border-border"
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                statusFilter === filter.value
                  ? "text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Contador */}
      <Text className="text-xs text-muted-foreground">
        {filteredDevices.length} dispositivo
        {filteredDevices.length !== 1 ? "s" : ""}
      </Text>

      {/* Lista — agrupada por host groups */}
      {filteredDevices.length === 0 ? (
        <EmptyState
          icon="hardware-chip-outline"
          message="Nenhum dispositivo encontrado"
        />
      ) : (
        <DeviceGroups devices={filteredDevices} onPress={handleDevicePress} />
      )}
    </ScrollView>
  );
}

// ============================================================================
// DeviceGroups — agrupa devices por host groups do Zabbix
// ============================================================================
function DeviceGroups({
  devices,
  onPress,
}: {
  devices: DeviceWithMetrics[];
  onPress: (device: DeviceWithMetrics) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  // Agrupa por primeiro host group (ou "Sem grupo")
  const groups = useMemo(() => {
    const map: Record<string, DeviceWithMetrics[]> = {};
    for (const device of devices) {
      const groupName = device.host.hostgroups?.[0]?.name ?? "Sem grupo";
      if (!map[groupName]) map[groupName] = [];
      map[groupName].push(device);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [devices]);

  function toggleGroup(name: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <View className="gap-4">
      {groups.map(([groupName, groupDevices]) => {
        const isCollapsed = collapsedGroups.has(groupName);
        const onlineInGroup = groupDevices.filter(
          (d) => d.host.status === "0",
        ).length;
        return (
          <View key={groupName} className="gap-2">
            {/* Header do grupo */}
            <Pressable
              onPress={() => toggleGroup(groupName)}
              className="flex-row items-center justify-between active:opacity-70"
            >
              <View className="flex-row items-center gap-2 flex-1">
                <Ionicons
                  name={isCollapsed ? "chevron-forward" : "chevron-down"}
                  size={14}
                  color="#737373"
                />
                <Ionicons name="folder-outline" size={14} color="#0d9488" />
                <Text
                  className="text-sm font-semibold text-foreground flex-1"
                  numberOfLines={1}
                >
                  {groupName}
                </Text>
              </View>
              <Text className="text-xs text-muted-foreground">
                {onlineInGroup}/{groupDevices.length}
              </Text>
            </Pressable>

            {/* Devices do grupo */}
            {!isCollapsed && (
              <View className="gap-3">
                {groupDevices.map((device) => (
                  <DeviceCard
                    key={device.host.hostid}
                    device={device}
                    onPress={onPress}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
