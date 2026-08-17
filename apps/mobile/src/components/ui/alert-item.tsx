// Item de alert — renderiza um ZabbixTrigger ativo (estilo web: dot + border por severidade)
import { useState } from "react";
import { View, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { ZabbixTrigger } from "@/lib/api-routes";
import { useAcknowledge } from "@/hooks/use-acknowledge";

// Mapa de prioridade do Zabbix (0-5) para cor + label
const PRIORITY_CONFIG: Record<
  string,
  { color: string; label: string; borderColor: string }
> = {
  "0": { color: "#525252", label: "Info", borderColor: "#262626" },
  "1": { color: "#525252", label: "Info", borderColor: "#262626" },
  "2": { color: "#0d9488", label: "Aviso", borderColor: "#0d948840" },
  "3": { color: "#f59e0b", label: "Medio", borderColor: "#f59e0b40" },
  "4": { color: "#dc2626", label: "Alto", borderColor: "#dc262640" },
  "5": { color: "#7f1d1d", label: "Critico", borderColor: "#7f1d1d40" },
};

/** Converte timestamp unix (segundos) em texto relativo (time-ago). */
function timeAgo(timestamp: string, fallbackClock?: string | number): string {
  const ts = Number.parseInt(timestamp, 10);
  const fallback =
    typeof fallbackClock === "string"
      ? Number.parseInt(fallbackClock, 10)
      : fallbackClock;
  const effectiveTs =
    (!ts || ts <= 0) && fallback && fallback > 0 ? fallback : ts;
  if (!effectiveTs || effectiveTs <= 0) return "—";
  const diff = Math.floor(Date.now() / 1000) - effectiveTs;
  if (diff < 0) return "agora";
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  return `${Math.floor(diff / 2592000)}mes`;
}

interface AlertItemProps {
  alert: ZabbixTrigger;
}

export function AlertItem({ alert }: AlertItemProps) {
  const router = useRouter();
  const config = PRIORITY_CONFIG[alert.priority] ?? PRIORITY_CONFIG["2"]!;
  const host = alert.hosts?.[0];
  const time = timeAgo(alert.lastchange, alert.lastEvent?.clock);
  const acknowledge = useAcknowledge();
  const [acknowledging, setAcknowledging] = useState(false);

  const eventId = alert.lastEvent?.eventid;
  const isAcknowledged = alert.lastEvent?.acknowledged === 1;

  const handlePress = () => {
    if (host?.hostid) {
      router.push(`/device/${host.hostid}`);
    }
  };

  const handleAcknowledge = () => {
    if (!eventId) {
      Alert.alert(
        "Sem evento",
        "Este alerta nao tem um evento associado para acknowledge.",
      );
      return;
    }
    Alert.prompt("Acknowledge", "Informe uma mensagem (opcional):", (text) => {
      if (!eventId) return;
      setAcknowledging(true);
      acknowledge.mutate(
        { eventids: [eventId], message: text ?? "" },
        {
          onSuccess: () => {
            setAcknowledging(false);
            Alert.alert("Sucesso", "Evento reconhecido.");
          },
          onError: (err) => {
            setAcknowledging(false);
            Alert.alert(
              "Erro",
              err instanceof Error ? err.message : "Falha ao reconhecer evento",
            );
          },
        },
      );
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={!host?.hostid}
      className="rounded-lg bg-card p-3 border active:opacity-70"
      style={{ borderColor: config.borderColor }}
    >
      <View className="flex-row items-center gap-3">
        {/* Dot colorido (igual web) */}
        <View
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            backgroundColor: config.color,
            shadowColor: config.color,
            shadowOpacity: 0.5,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 0 },
          }}
        />

        {/* Conteudo principal */}
        <View className="flex-1 min-w-0">
          <Text
            className="text-sm font-medium text-foreground"
            numberOfLines={2}
          >
            {alert.description}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            <Ionicons name="server-outline" size={10} color="#737373" />
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {host?.name ?? "N/A"}
            </Text>
            <Text className="text-xs text-muted-foreground">·</Text>
            <Text className="text-xs text-muted-foreground">ha {time}</Text>
          </View>
        </View>

        {/* Badge de severidade */}
        <View
          className="px-2 py-0.5 rounded shrink-0"
          style={{ backgroundColor: `${config.color}20` }}
        >
          <Text
            className="text-xs font-semibold"
            style={{ color: config.color }}
          >
            {config.label}
          </Text>
        </View>
      </View>

      {/* Rodape: acknowledge + ver dispositivo */}
      <View className="flex-row items-center justify-between mt-2 pl-4.5">
        <View className="flex-row items-center gap-3">
          {host?.hostid && (
            <View className="flex-row items-center gap-1">
              <Ionicons
                name="chevron-forward-outline"
                size={10}
                color="#0d9488"
              />
              <Text className="text-xs text-primary">Ver dispositivo</Text>
            </View>
          )}
          {eventId && !isAcknowledged && (
            <Pressable
              onPress={handleAcknowledge}
              disabled={acknowledging}
              className="flex-row items-center gap-1 active:opacity-70"
            >
              {acknowledging ? (
                <ActivityIndicator size={10} color="#737373" />
              ) : (
                <Ionicons
                  name="checkmark-done-outline"
                  size={10}
                  color="#737373"
                />
              )}
              <Text className="text-xs text-muted-foreground">Ack</Text>
            </Pressable>
          )}
          {isAcknowledged && (
            <View className="flex-row items-center gap-1">
              <Ionicons name="checkmark-circle" size={10} color="#0d9488" />
              <Text className="text-xs text-primary">Reconhecido</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}
