// @ai-context: .zero-error/architecture-map.md#ingress
// Detalhe do device — informacoes completas + metricas Zabbix + alertas ativos
import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useDevice } from "@/hooks/use-device";
import {
  useZabbixHostTriggers,
  useZabbixItems,
  useZabbixHistory,
} from "@/hooks/use-zabbix-device";
import { AlertItem } from "@/components/ui/alert-item";
import { EmptyState } from "@/components/ui/empty-state";
import { Gauge, MetricBar, Sparkline } from "@/components/ui/metric-chart";
import { Ionicons } from "@expo/vector-icons";
import {
  categorizeMetrics,
  detectDeviceType,
  findItem,
  formatMetricValue,
  extractPercent,
  type ZabbixItem,
} from "@/lib/zabbix-metrics";

const STATUS_COLORS: Record<string, string> = {
  online: "#0d9488",
  offline: "#dc2626",
  maintenance: "#f59e0b",
  unknown: "#525252",
};

const DEVICE_TYPE_LABELS: Record<string, string> = {
  "windows-agent": "Windows Agent",
  "linux-agent": "Linux Agent",
  snmp: "SNMP",
  unknown: "Generico",
};

// 1h em segundos para historico
const HISTORY_FROM = Math.floor(Date.now() / 1000) - 3600;

export default function DeviceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: device, isLoading } = useDevice(id);
  const zabbixHostId = device?.zabbix_host_id ?? null;
  const { data: triggersData } = useZabbixHostTriggers(zabbixHostId);
  const { data: itemsData } = useZabbixItems(zabbixHostId);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#0d9488" />
      </View>
    );
  }

  if (!device) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        message="Dispositivo nao encontrado"
      />
    );
  }

  const statusColor = STATUS_COLORS[device.status] ?? "#525252";
  const alerts = triggersData?.data ?? [];
  const items = itemsData?.items ?? [];
  const deviceType = detectDeviceType(items);
  const categories = categorizeMetrics(items);

  // Items principais para gauges (CPU e memoria)
  const cpuItem =
    findItem(items, "system.cpu.util") ?? findItem(items, "cpu.util");
  const memItem =
    findItem(items, "vm.memory.util") ?? findItem(items, "memory.util");
  const cpuPercent = extractPercent(cpuItem);
  const memPercent = extractPercent(memItem);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-4 pb-8 gap-4"
    >
      {/* Header */}
      <View className="items-center mb-2">
        <View className="w-16 h-16 rounded-xl bg-secondary items-center justify-center mb-3">
          <Ionicons
            name="hardware-chip-outline"
            size={32}
            color={statusColor}
          />
        </View>
        <Text className="text-xl font-bold text-foreground text-center">
          {device.hostname}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-1">
          <View
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          <Text className="text-sm" style={{ color: statusColor }}>
            {device.status}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {" "}
            · {DEVICE_TYPE_LABELS[deviceType]}
          </Text>
        </View>
      </View>

      {/* Info grid */}
      <View className="rounded-lg bg-card p-4 border border-border gap-3">
        <InfoRow icon="cube-outline" label="Tipo" value={device.type} />
        <InfoRow icon="wifi-outline" label="IP" value={device.ip} />
        <InfoRow
          icon="finger-print-outline"
          label="ID"
          value={device.id.slice(0, 8) + "..."}
        />
        {device.zabbix_host_id && (
          <InfoRow
            icon="link-outline"
            label="Zabbix ID"
            value={device.zabbix_host_id.slice(0, 12) + "..."}
          />
        )}
        <InfoRow
          icon="time-outline"
          label="Atualizado"
          value={new Date(device.updated_at).toLocaleString("pt-BR")}
        />
      </View>

      {/* Gauges — CPU e Memoria */}
      {(cpuPercent != null || memPercent != null) && (
        <View className="rounded-lg bg-card p-4 border border-border">
          <Text className="text-sm font-semibold text-foreground mb-3">
            Medidores
          </Text>
          <View className="flex-row justify-around">
            {cpuPercent != null && <Gauge value={cpuPercent} label="CPU" />}
            {memPercent != null && <Gauge value={memPercent} label="Memoria" />}
          </View>
        </View>
      )}

      {/* Metricas principais (barras) */}
      <View className="rounded-lg bg-card p-4 border border-border gap-3">
        <Text className="text-sm font-semibold text-foreground mb-1">
          Metricas principais
        </Text>
        <MainMetrics items={items} />
      </View>

      {/* Categorias de metricas (colapsaveis) */}
      {categories.length > 0 && (
        <CategoriesSection
          categories={categories}
          zabbixHostId={zabbixHostId}
        />
      )}

      {/* Alertas ativos */}
      <View>
        <Text className="text-sm font-semibold text-foreground mb-3">
          Alertas ativos ({alerts.length})
        </Text>
        {alerts.length === 0 ? (
          <View className="rounded-lg bg-card p-4 border border-border items-center">
            <Ionicons
              name="checkmark-circle-outline"
              size={32}
              color="#0d9488"
            />
            <Text className="mt-2 text-sm text-muted-foreground">
              Sem alertas ativos
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {alerts.map((trigger) => (
              <AlertItem key={trigger.triggerid} alert={trigger} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ============================================================================
// Metricas principais — barras horizontais para CPU, memoria, swap, disco, rede
// ============================================================================
function MainMetrics({ items }: { items: ZabbixItem[] }) {
  const metrics: Array<{
    label: string;
    item?: ZabbixItem;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    {
      label: "CPU",
      item: findItem(items, "system.cpu.util") ?? findItem(items, "cpu.util"),
      icon: "speedometer-outline",
    },
    {
      label: "Memoria",
      item: findItem(items, "vm.memory.util") ?? findItem(items, "memory.util"),
      icon: "hardware-chip-outline",
    },
    {
      label: "Swap",
      item: findItem(items, "system.swap.util") ?? findItem(items, "swap.util"),
      icon: "swap-horizontal",
    },
    {
      label: "Uptime",
      item: findItem(items, "system.uptime"),
      icon: "time-outline",
    },
    { label: "Ping", item: findItem(items, "icmpping"), icon: "pulse-outline" },
  ];

  const visible = metrics.filter((m) => m.item);
  if (visible.length === 0) {
    return (
      <Text className="text-xs text-muted-foreground">
        Sem metricas principais disponiveis
      </Text>
    );
  }

  return (
    <View className="gap-3">
      {visible.map(({ label, item, icon }) => {
        const percent = extractPercent(item);
        const value = formatMetricValue(item?.lastvalue, item?.units);
        return (
          <MetricBar
            key={label}
            label={label}
            value={value}
            percent={percent}
            icon={icon}
          />
        );
      })}
    </View>
  );
}

// ============================================================================
// Secao de categorias — lista colapsavel de items por categoria
// ============================================================================
function CategoriesSection({
  categories,
  zabbixHostId,
}: {
  categories: ReturnType<typeof categorizeMetrics>;
  zabbixHostId: string | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-foreground">
        Todas as metricas ({categories.length} categorias)
      </Text>
      {categories.map((cat) => {
        const isOpen = expanded === cat.key;
        return (
          <View
            key={cat.key}
            className="rounded-lg bg-card border border-border overflow-hidden"
          >
            <Pressable
              onPress={() => setExpanded(isOpen ? null : cat.key)}
              className="flex-row items-center justify-between p-3 active:opacity-70"
            >
              <View className="flex-row items-center gap-2">
                <Ionicons
                  name={isOpen ? "chevron-down" : "chevron-forward"}
                  size={14}
                  color="#737373"
                />
                <Text className="text-sm font-medium text-foreground">
                  {cat.label}
                </Text>
                <View className="px-1.5 py-0.5 rounded bg-secondary">
                  <Text className="text-xs text-muted-foreground">
                    {cat.items.length}
                  </Text>
                </View>
              </View>
            </Pressable>
            {isOpen && (
              <View className="px-3 pb-3 gap-2">
                {cat.items.slice(0, 50).map((item) => (
                  <ItemRow
                    key={item.itemid}
                    item={item}
                    zabbixHostId={zabbixHostId}
                  />
                ))}
                {cat.items.length > 50 && (
                  <Text className="text-xs text-muted-foreground italic">
                    +{cat.items.length - 50} items nao exibidos
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ============================================================================
// ItemRow — um item individual com nome, valor e sparkline opcional
// ============================================================================
function ItemRow({
  item,
  zabbixHostId,
}: {
  item: ZabbixItem;
  zabbixHostId: string | null;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const value = formatMetricValue(item.lastvalue, item.units);

  // Busca historico apenas quando o usuario expande
  const { data: historyData } = useZabbixHistory(
    showHistory ? item.itemid : null,
    HISTORY_FROM,
  );

  const historyValues = useMemo(() => {
    if (!historyData?.data) return [];
    return historyData.data
      .map((h) => Number.parseFloat(h.value))
      .filter((v) => !Number.isNaN(v));
  }, [historyData]);

  return (
    <Pressable
      onPress={() => setShowHistory((s) => !s)}
      className="active:opacity-70"
    >
      <View className="flex-row items-center justify-between py-1">
        <Text
          className="text-xs text-muted-foreground flex-1 pr-2"
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text className="text-xs font-medium text-foreground">{value}</Text>
      </View>
      {showHistory && (
        <View className="mt-1 mb-1">
          {historyValues.length > 0 ? (
            <View className="flex-row items-center gap-2">
              <Sparkline values={historyValues} width={200} height={30} />
              <Text className="text-xs text-muted-foreground">
                {historyValues.length} pontos (1h)
              </Text>
            </View>
          ) : (
            <Text className="text-xs text-muted-foreground italic">
              {zabbixHostId ? "Sem historico disponivel" : "Sem Zabbix ID"}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ============================================================================
// InfoRow — linha de informacao simples
// ============================================================================
function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        <Ionicons name={icon} size={16} color="#525252" />
        <Text className="text-sm text-muted-foreground">{label}</Text>
      </View>
      <Text className="text-sm text-foreground font-medium">{value}</Text>
    </View>
  );
}
