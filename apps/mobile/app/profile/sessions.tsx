// Sessoes ativas + security log — revogar sessao individual e todas
import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { api } from "@/lib/api-client";
import {
  apiRoutes,
  type UserSession,
  type SecurityEvent,
} from "@/lib/api-routes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";

const EVENT_COLORS: Record<string, string> = {
  login: "#3DD68C",
  logout: "#737373",
  password_change: "#F5A623",
  mfa_enable: "#3DD68C",
  mfa_disable: "#E5484D",
  session_revoked: "#E5484D",
  password_reset_request: "#F5A623",
  password_reset_complete: "#3DD68C",
  profile_update: "#3E8BF0",
  avatar_change: "#8B5CF6",
  preferences_update: "#3E8BF0",
};

const EVENT_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  password_change: "Alteracao de senha",
  mfa_enable: "MFA ativado",
  mfa_disable: "MFA desativado",
  session_revoked: "Sessao revogada",
  password_reset_request: "Reset de senha solicitado",
  password_reset_complete: "Reset de senha concluido",
  profile_update: "Perfil atualizado",
  avatar_change: "Avatar alterado",
  preferences_update: "Preferencias atualizadas",
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SessionsScreen() {
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    refetch: refetchSessions,
    isRefetching: refetchingSessions,
  } = useQuery<{ sessions: UserSession[] }>({
    queryKey: ["profile", "sessions"],
    queryFn: () => api.get(apiRoutes.profile.sessions),
  });

  const {
    data: securityData,
    isLoading: securityLoading,
    refetch: refetchSecurity,
    isRefetching: refetchingSecurity,
  } = useQuery<{ events: SecurityEvent[] }>({
    queryKey: ["profile", "security-log"],
    queryFn: () => api.get(apiRoutes.profile.securityLog(20)),
  });

  const sessions = sessionsData?.sessions ?? [];
  const events = securityData?.events ?? [];

  async function handleRevoke(id: string) {
    Alert.alert("Revogar sessao", "Tem certeza?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Revogar",
        style: "destructive",
        onPress: async () => {
          setRevoking(id);
          try {
            await api.delete(apiRoutes.profile.sessionRevoke(id));
            queryClient.invalidateQueries({
              queryKey: ["profile", "sessions"],
            });
            queryClient.invalidateQueries({
              queryKey: ["profile", "security-log"],
            });
          } catch (err: unknown) {
            Alert.alert(
              "Erro",
              err instanceof Error ? err.message : "Falha ao revogar",
            );
          } finally {
            setRevoking(null);
          }
        },
      },
    ]);
  }

  async function handleRevokeAll() {
    Alert.alert(
      "Revogar todas as sessoes",
      "Todas as outras sessoes serao encerradas. Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Revogar Todas",
          style: "destructive",
          onPress: async () => {
            setRevokingAll(true);
            try {
              await api.delete(apiRoutes.profile.sessions);
              queryClient.invalidateQueries({
                queryKey: ["profile", "sessions"],
              });
              queryClient.invalidateQueries({
                queryKey: ["profile", "security-log"],
              });
              Alert.alert("Sucesso", "Sessoes revogadas");
            } catch (err: unknown) {
              Alert.alert(
                "Erro",
                err instanceof Error ? err.message : "Falha ao revogar",
              );
            } finally {
              setRevokingAll(false);
            }
          },
        },
      ],
    );
  }

  const onRefresh = () => {
    refetchSessions();
    refetchSecurity();
  };

  if (sessionsLoading && securityLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Sessoes & Seguranca" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0d9488" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Sessoes & Seguranca"
        right={
          <Pressable
            onPress={handleRevokeAll}
            disabled={revokingAll || sessions.length <= 1}
            className="px-2 py-1 rounded"
            style={{ opacity: revokingAll || sessions.length <= 1 ? 0.5 : 1 }}
          >
            <Text className="text-xs font-semibold text-destructive">
              Revogar Todas
            </Text>
          </Pressable>
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-8 gap-4"
        refreshControl={
          <RefreshControl
            refreshing={refetchingSessions || refetchingSecurity}
            onRefresh={onRefresh}
            tintColor="#0d9488"
          />
        }
      >
        {/* Sessoes ativas */}
        <View className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Sessoes Ativas ({sessions.length})
          </Text>
          {sessions.map((session) => (
            <View
              key={session.id}
              className="rounded-lg bg-card p-4 border border-border gap-2"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2 flex-1">
                  <Ionicons
                    name={
                      session.device_type === "mobile"
                        ? "phone-portrait-outline"
                        : "desktop-outline"
                    }
                    size={16}
                    color="#737373"
                  />
                  <Text
                    className="text-sm font-medium text-foreground flex-1"
                    numberOfLines={1}
                  >
                    {session.device_name ?? session.device_type}
                  </Text>
                </View>
                {session.is_active ? (
                  <View
                    className="px-2 py-0.5 rounded"
                    style={{ backgroundColor: "#0d948820" }}
                  >
                    <Text className="text-xs font-semibold text-primary">
                      Ativa
                    </Text>
                  </View>
                ) : (
                  <View className="px-2 py-0.5 rounded bg-secondary">
                    <Text className="text-xs text-muted-foreground">
                      Revogada
                    </Text>
                  </View>
                )}
              </View>
              {session.ip_address && (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="location-outline" size={12} color="#525252" />
                  <Text className="text-xs text-muted-foreground">
                    {session.ip_address}
                    {session.location ? ` · ${session.location}` : ""}
                  </Text>
                </View>
              )}
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-muted-foreground">
                  Ultima atividade: {formatTime(session.last_activity)}
                </Text>
                {session.is_active && (
                  <Pressable
                    onPress={() => handleRevoke(session.id)}
                    disabled={revoking === session.id}
                    className="active:opacity-70"
                  >
                    {revoking === session.id ? (
                      <ActivityIndicator size={12} color="#dc2626" />
                    ) : (
                      <Text className="text-xs font-semibold text-destructive">
                        Revogar
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>
              {session.expires_at && (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="time-outline" size={12} color="#525252" />
                  <Text className="text-xs text-muted-foreground">
                    Expira em: {formatTime(session.expires_at)}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Security log */}
        <View className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Historico de Seguranca
          </Text>
          {events.length === 0 ? (
            <View className="rounded-lg bg-card p-4 border border-border items-center">
              <Text className="text-sm text-muted-foreground">Sem eventos</Text>
            </View>
          ) : (
            events.map((event) => {
              const color = EVENT_COLORS[event.event_type] ?? "#737373";
              const label = EVENT_LABELS[event.event_type] ?? event.event_type;
              return (
                <View
                  key={event.id}
                  className="rounded-lg bg-card p-3 border border-border"
                >
                  <View className="flex-row items-center justify-between mb-1">
                    <View className="flex-row items-center gap-2 flex-1">
                      <View
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <Text
                        className="text-sm font-medium text-foreground flex-1"
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                    </View>
                    <Text className="text-xs text-muted-foreground">
                      {formatTime(event.created_at)}
                    </Text>
                  </View>
                  {event.ip_address && (
                    <Text className="text-xs text-muted-foreground ml-4">
                      IP: {event.ip_address}
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
