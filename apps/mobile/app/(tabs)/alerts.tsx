// @ai-context: .zero-error/architecture-map.md#ingress
// Alerts — triggers ativos do Zabbix agrupados por severidade (igual web)
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

export default function AlertsScreen() {
  const [liveCount, setLiveCount] = useState(0);
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch, isRefetching } = useZabbixTriggers(
    {
      onlyActive: true,
    },
  );

  const handleNotification = useCallback((_notification: WsNotification) => {
    setLiveCount((c) => c + 1);
  }, []);

  const { isConnected } = useWebSocket({
    enabled: true,
    onNotification: handleNotification,
  });

  const allTriggers = useMemo(() => data?.data ?? [], [data]);

  // Filtra por busca
  const filtered = useMemo(() => {
    if (!search.trim()) return allTriggers;
    const q = search.toLowerCase().trim();
    return allTriggers.filter(
      (t) =>
        t.description.toLowerCase().includes(q) ||
        t.hosts?.some(
          (h) =>
            h.name.toLowerCase().includes(q) ||
            h.host.toLowerCase().includes(q),
        ),
    );
  }, [allTriggers, search]);

  // Agrupa por severidade (igual web)
  const criticalTriggers = filtered.filter(
    (t) => t.priority === "4" || t.priority === "5",
  );
  const warningTriggers = filtered.filter(
    (t) => t.priority === "2" || t.priority === "3",
  );
  const infoTriggers = filtered.filter(
    (t) => t.priority === "0" || t.priority === "1",
  );

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
      contentContainerClassName="px-4 pt-4 pb-8 gap-4"
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
      {/* Header com contadores (igual web) */}
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-foreground">
          Alertas Ativos
        </Text>
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <View
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "#dc2626" }}
            />
            <Text className="text-xs text-muted-foreground">
              {criticalTriggers.length} crit.
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <View
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "#f59e0b" }}
            />
            <Text className="text-xs text-muted-foreground">
              {warningTriggers.length} aviso
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <View
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "#525252" }}
            />
            <Text className="text-xs text-muted-foreground">
              {infoTriggers.length} info
            </Text>
          </View>
        </View>
      </View>

      {/* Status WebSocket */}
      <View className="flex-row items-center justify-between rounded-lg bg-card p-2.5 border border-border">
        <View className="flex-row items-center gap-2">
          <View
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: isConnected ? "#0d9488" : "#525252" }}
          />
          <Text className="text-xs text-muted-foreground">
            {isConnected ? "Tempo real" : "Reconectando..."}
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

      {/* Secao Criticos */}
      {criticalTriggers.length > 0 && (
        <SeveritySection
          title="Criticos"
          count={criticalTriggers.length}
          color="#dc2626"
          triggers={criticalTriggers}
        />
      )}

      {/* Secao Avisos */}
      {warningTriggers.length > 0 && (
        <SeveritySection
          title="Avisos"
          count={warningTriggers.length}
          color="#f59e0b"
          triggers={warningTriggers}
        />
      )}

      {/* Secao Info */}
      {infoTriggers.length > 0 && (
        <SeveritySection
          title="Info"
          count={infoTriggers.length}
          color="#525252"
          triggers={infoTriggers}
        />
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <EmptyState
          icon="checkmark-circle-outline"
          message={search ? "Nenhum alerta encontrado" : "Nenhum alerta ativo"}
        />
      )}
    </ScrollView>
  );
}

// ============================================================================
// Secao por severidade — header com ponto colorido + lista de alerts
// ============================================================================
function SeveritySection({
  title,
  count,
  color,
  triggers,
}: {
  title: string;
  count: number;
  color: string;
  triggers: ZabbixTrigger[];
}) {
  return (
    <View className="gap-2">
      {/* Header da secao */}
      <View className="flex-row items-center gap-2">
        <View
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: color,
            shadowColor: color,
            shadowOpacity: 0.5,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
        <Text
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color }}
        >
          {title}
        </Text>
        <Text className="text-xs text-muted-foreground">({count})</Text>
      </View>

      {/* Lista de alerts */}
      <View className="gap-1.5">
        {triggers.map((trigger) => (
          <AlertItem key={trigger.triggerid} alert={trigger} />
        ))}
      </View>
    </View>
  );
}
