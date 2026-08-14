// Item de alert — renderiza um ZabbixTrigger ativo com severidade, host e time-ago
import { useState } from "react";
import { View, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { ZabbixTrigger } from "@/lib/api-routes";
import { useAcknowledge } from "@/hooks/use-acknowledge";

// Mapa de prioridade do Zabbix (0-5) para cor + icone + label
const PRIORITY_CONFIG: Record<
  string,
  { color: string; icon: keyof typeof Ionicons.glyphMap; label: string }
> = {
  "0": { color: "#525252", icon: "information-circle-outline", label: "Info" },
  "1": { color: "#525252", icon: "information-circle-outline", label: "Info" },
  "2": { color: "#0d9488", icon: "warning-outline", label: "Aviso" },
  "3": { color: "#f59e0b", icon: "warning", label: "Medio" },
  "4": { color: "#dc2626", icon: "alert-circle", label: "Alto" },
  "5": { color: "#7f1d1d", icon: "alert-circle", label: "Critico" },
};

/** Converte timestamp unix (segundos) em texto relativo (time-ago). */
function timeAgo(timestamp: string): string {
  const ts = Number.parseInt(timestamp, 10);
  if (!ts || ts <= 0) return "—";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 0) return "agora";
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  return `${Math.floor(diff / 2592000)}mese`;
}

interface AlertItemProps {
  alert: ZabbixTrigger;
}

export function AlertItem({ alert }: AlertItemProps) {
  const router = useRouter();
  const config = PRIORITY_CONFIG[alert.priority] ?? PRIORITY_CONFIG["2"]!;
  const host = alert.hosts?.[0];
  const time = timeAgo(alert.lastchange);
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
      className="flex-row gap-3 rounded-lg bg-card p-4 border border-border active:opacity-70"
    >
      <View
        className="w-10 h-10 rounded-lg items-center justify-center"
        style={{ backgroundColor: `${config.color}20` }}
      >
        <Ionicons name={config.icon} size={20} color={config.color} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between mb-1">
          <Text
            className="text-sm font-semibold text-foreground flex-1 pr-2"
            numberOfLines={2}
          >
            {alert.description}
          </Text>
          <View
            className="px-2 py-0.5 rounded"
            style={{ backgroundColor: `${config.color}20` }}
          >
            <Text
              className="text-xs font-medium"
              style={{ color: config.color }}
            >
              {config.label}
            </Text>
          </View>
        </View>
        {host && (
          <View className="flex-row items-center gap-1">
            <Ionicons name="server-outline" size={11} color="#737373" />
            <Text className="text-xs text-muted-foreground">{host.name}</Text>
          </View>
        )}
        {alert.comments && (
          <Text
            className="text-xs text-muted-foreground mt-1"
            numberOfLines={2}
          >
            {alert.comments}
          </Text>
        )}
        <View className="flex-row items-center justify-between mt-2">
          <View className="flex-row items-center gap-3">
            {host?.hostid && (
              <View className="flex-row items-center gap-1">
                <Ionicons
                  name="chevron-forward-outline"
                  size={11}
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
                    size={11}
                    color="#737373"
                  />
                )}
                <Text className="text-xs text-muted-foreground">
                  Acknowledge
                </Text>
              </Pressable>
            )}
            {isAcknowledged && (
              <View className="flex-row items-center gap-1">
                <Ionicons name="checkmark-circle" size={11} color="#0d9488" />
                <Text className="text-xs text-primary">Reconhecido</Text>
              </View>
            )}
          </View>
          <Text className="text-xs text-muted-foreground">{time}</Text>
        </View>
      </View>
    </Pressable>
  );
}
