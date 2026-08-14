// @ai-context: .zero-error/architecture-map.md#ingress
// Alerts — triggers ativos do Zabbix agrupados por severidade + WebSocket live + busca
import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  TextInput,
} from "react-native";
import { useZabbixTriggers } from "@/hooks/use-zabbix-triggers";
import type { ZabbixTrigger } from "@/lib/api-routes";
import { useWebSocket, type WsNotification } from "@/lib/ws-client";
import { AlertItem } from "@/components/ui/alert-item";
import { EmptyState } from "@/components/ui/empty-state";
import { Ionicons } from "@expo/vector-icons";

// Filtros alinhados com prioridade do Zabbix: critical (4-5), warning (2-3), info (0-1)
type SeverityFilter = "all" | "critical" | "warning" | "info";
const SEVERITY_FILTERS: SeverityFilter[] = [
  "all",
  "critical",
  "warning",
  "info",
];

const FILTER_LABELS: Record<SeverityFilter, string> = {
  all: "Todos",
  critical: "Criticos",
  warning: "Avisos",
  info: "Info",
};

function matchesFilter(
  trigger: ZabbixTrigger,
  filter: SeverityFilter,
): boolean {
  if (filter === "all") return true;
  const p = Number.parseInt(trigger.priority, 10);
  if (filter === "critical") return p >= 4;
  if (filter === "warning") return p === 2 || p === 3;
  if (filter === "info") return p <= 1;
  return false;
}

export default function AlertsScreen() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [liveCount, setLiveCount] = useState(0);
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch, isRefetching } = useZabbixTriggers(
    {
      onlyActive: true,
    },
  );

  // WebSocket para notificacoes em tempo real
  const handleNotification = useCallback((_notification: WsNotification) => {
    setLiveCount((c) => c + 1);
  }, []);

  const { isConnected } = useWebSocket({
    enabled: true,
    onNotification: handleNotification,
  });

  const allTriggers = useMemo(() => data?.data ?? [], [data]);

  const filtered = useMemo(() => {
    let result = allTriggers.filter((t) => matchesFilter(t, severityFilter));
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.hosts?.some(
            (h) =>
              h.name.toLowerCase().includes(q) ||
              h.host.toLowerCase().includes(q),
          ),
      );
    }
    return result;
  }, [allTriggers, severityFilter, search]);

  // Agrupamento por severidade para contagem no header
  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 };
    for (const t of allTriggers) {
      const p = Number.parseInt(t.priority, 10);
      if (p >= 4) c.critical++;
      else if (p >= 2) c.warning++;
      else c.info++;
    }
    return c;
  }, [allTriggers]);

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
        message="Erro ao carregar alertas"
      />
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-4 pb-8 gap-3"
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => {
            setLiveCount(0);
            refetch();
          }}
          tintColor="#0d9488"
        />
      }
    >
      {/* Status WebSocket + notificacoes live */}
      <View className="flex-row items-center justify-between rounded-lg bg-card p-3 border border-border">
        <View className="flex-row items-center gap-2">
          <View
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: isConnected ? "#0d9488" : "#525252" }}
          />
          <Text className="text-xs text-muted-foreground">
            {isConnected ? "Tempo real conectado" : "Reconectando..."}
          </Text>
        </View>
        {liveCount > 0 && (
          <Pressable
            onPress={() => {
              setLiveCount(0);
              refetch();
            }}
            className="flex-row items-center gap-1"
          >
            <Ionicons name="notifications" size={14} color="#0d9488" />
            <Text className="text-xs font-semibold text-primary">
              {liveCount} nova{liveCount !== 1 ? "s" : ""}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Busca */}
      <View className="flex-row items-center gap-2 rounded-lg bg-card border border-border px-3">
        <Ionicons name="search-outline" size={16} color="#525252" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar alerta ou host..."
          placeholderTextColor="#525252"
          className="flex-1 py-2.5 text-sm text-foreground"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={16} color="#525252" />
          </Pressable>
        )}
      </View>

      {/* Resumo por severidade */}
      <View className="flex-row gap-2">
        <SummaryChip color="#dc2626" label="Criticos" count={counts.critical} />
        <SummaryChip color="#f59e0b" label="Avisos" count={counts.warning} />
        <SummaryChip color="#525252" label="Info" count={counts.info} />
      </View>

      {/* Filtros de severidade */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {SEVERITY_FILTERS.map((severity) => (
          <Pressable
            key={severity}
            onPress={() => setSeverityFilter(severity)}
            className={`px-3 py-1.5 rounded-lg border ${
              severityFilter === severity
                ? "bg-primary border-primary"
                : "bg-card border-border"
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                severityFilter === severity
                  ? "text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {FILTER_LABELS[severity]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Contador */}
      <Text className="text-xs text-muted-foreground">
        {filtered.length} alerta{filtered.length !== 1 ? "s" : ""} ativo
        {filtered.length !== 1 ? "s" : ""}
      </Text>

      {/* Lista */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          message="Nenhum alerta ativo"
        />
      ) : (
        <View className="gap-3">
          {filtered.map((trigger: ZabbixTrigger) => (
            <AlertItem key={trigger.triggerid} alert={trigger} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function SummaryChip({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <View className="flex-1 flex-row items-center justify-between rounded-lg bg-card p-3 border border-border">
      <View className="flex-row items-center gap-2">
        <View
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <Text className="text-xs text-muted-foreground">{label}</Text>
      </View>
      <Text className="text-sm font-bold" style={{ color }}>
        {count}
      </Text>
    </View>
  );
}
