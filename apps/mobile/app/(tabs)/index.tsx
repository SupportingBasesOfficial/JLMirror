// @ai-context: .zero-error/architecture-map.md#ingress
// Dashboard — KPIs + alertas ativos do Zabbix + grid de devices + auto-refresh
import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useDashboard } from "@/hooks/use-dashboard";
import { useZabbixTriggers } from "@/hooks/use-zabbix-triggers";
import { useZabbixDevices } from "@/hooks/use-zabbix-devices";
import { KpiCard } from "@/components/ui/kpi-card";
import { DeviceCard } from "@/components/ui/device-card";
import { Ionicons } from "@expo/vector-icons";
import type { ZabbixTrigger } from "@/lib/api-routes";

// Config de prioridade dos triggers — cor + label do badge
const PRIORITY_BADGE: Record<string, { color: string; label: string }> = {
  "0": { color: "#525252", label: "Info" },
  "1": { color: "#525252", label: "Info" },
  "2": { color: "#0d9488", label: "Aviso" },
  "3": { color: "#f59e0b", label: "Aviso" },
  "4": { color: "#dc2626", label: "Critico" },
  "5": { color: "#7f1d1d", label: "Critico" },
};

function timeAgo(timestamp: string): string {
  const ts = Number.parseInt(timestamp, 10);
  if (!ts || ts <= 0) return "—";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 0) return "agora";
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Badge de status do alerta (Critico/Aviso/Info)
function AlertBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_BADGE[priority] ?? PRIORITY_BADGE["0"]!;
  return (
    <View
      className="px-2 py-0.5 rounded"
      style={{ backgroundColor: `${cfg.color}20` }}
    >
      <Text className="text-xs font-semibold" style={{ color: cfg.color }}>
        {cfg.label}
      </Text>
    </View>
  );
}

// Item de alerta reutilizavel — descricao + host + badge + chevron
function AlertItem({
  trigger,
  color,
  onPress,
}: {
  trigger: ZabbixTrigger;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="active:opacity-70">
      <View className="flex-row items-center gap-2 py-1.5">
        <View
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <View className="flex-1 min-w-0">
          <Text className="text-xs text-foreground" numberOfLines={2}>
            {trigger.description}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {trigger.hosts?.[0]?.name ?? "N/A"} · {timeAgo(trigger.lastchange)}
          </Text>
        </View>
        <AlertBadge priority={trigger.priority} />
        <Ionicons name="chevron-forward" size={14} color="#737373" />
      </View>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } = useDashboard();
  const { data: triggersData } = useZabbixTriggers({ onlyActive: true });
  const { data: zabbixDevicesData } = useZabbixDevices();
  const [deviceSearch, setDeviceSearch] = useState("");

  const zabbixDevices = zabbixDevicesData?.devices ?? [];
  const onlineDevices = zabbixDevices.filter(
    (d) => d.host.status === "0",
  ).length;
  const offlineDevices = zabbixDevices.filter(
    (d) => d.host.status === "1",
  ).length;
  const totalDevices = zabbixDevices.length;

  // Filtra devices pela busca (nome, IP ou hostid)
  const filteredDevices = useMemo(() => {
    if (!deviceSearch.trim()) return zabbixDevices;
    const q = deviceSearch.toLowerCase();
    return zabbixDevices.filter(
      (d) =>
        d.host.name.toLowerCase().includes(q) ||
        d.host.hostid.includes(q) ||
        d.host.interfaces?.[0]?.ip?.includes(q),
    );
  }, [zabbixDevices, deviceSearch]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#0d9488" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Ionicons name="cloud-offline-outline" size={48} color="#525252" />
        <Text className="mt-4 text-muted-foreground">
          Erro ao carregar dashboard
        </Text>
      </View>
    );
  }

  const {
    kpis,
    recent_tickets: recentTickets,
    ssl_expiring_soon: sslExpiringSoon,
  } = data;
  const triggers = triggersData?.data ?? [];
  const criticalTriggers = triggers.filter(
    (t) => t.priority === "4" || t.priority === "5",
  );
  const warningTriggers = triggers.filter(
    (t) => t.priority === "2" || t.priority === "3",
  );
  const infoTriggers = triggers.filter(
    (t) => t.priority === "0" || t.priority === "1",
  );

  // Navega para o device detail
  const goToDevice = (hostid: string) => router.push(`/device/${hostid}`);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-4 pb-8 gap-4"
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor="#0d9488"
        />
      }
    >
      {/* Saudacao */}
      <Text className="text-2xl font-bold text-foreground">
        Ola, {user?.full_name?.split(" ")[0] ?? "Usuario"}
      </Text>
      <Text className="text-sm text-muted-foreground">
        Visao geral do monitoramento
      </Text>

      {/* Alertas criticos (destaque) */}
      {criticalTriggers.length > 0 && (
        <View
          className="rounded-lg border p-3"
          style={{ backgroundColor: "#dc262610", borderColor: "#dc262640" }}
        >
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="alert-circle" size={16} color="#dc2626" />
              <Text className="text-sm font-bold text-destructive">
                {criticalTriggers.length} Critico
                {criticalTriggers.length !== 1 ? "s" : ""}
              </Text>
            </View>
            <Pressable onPress={() => router.push("/(tabs)/alerts")}>
              <Text className="text-xs text-primary">Ver todos</Text>
            </Pressable>
          </View>
          <View className="gap-1">
            {criticalTriggers.map((t: ZabbixTrigger) => (
              <AlertItem
                key={t.triggerid}
                trigger={t}
                color="#dc2626"
                onPress={() => {
                  const hostid = t.hosts?.[0]?.hostid;
                  if (hostid) goToDevice(hostid);
                }}
              />
            ))}
          </View>
        </View>
      )}

      {/* KPIs do Zabbix (tempo real) — grid 2 colunas, clicaveis */}
      {totalDevices > 0 && (
        <View className="flex-row flex-wrap gap-3">
          <Pressable
            className="flex-1 min-w-[45%]"
            onPress={() => router.push("/(tabs)/devices")}
          >
            <KpiCard
              label="Online"
              value={String(onlineDevices)}
              subtitle="dispositivos"
              icon="wifi-outline"
              variant="ok"
            />
          </Pressable>
          <Pressable
            className="flex-1 min-w-[45%]"
            onPress={() => router.push("/(tabs)/devices")}
          >
            <KpiCard
              label="Offline"
              value={String(offlineDevices)}
              subtitle="dispositivos"
              icon="cloud-offline-outline"
              variant={offlineDevices > 0 ? "error" : "default"}
            />
          </Pressable>
          <Pressable
            className="flex-1 min-w-[45%]"
            onPress={() => router.push("/(tabs)/devices")}
          >
            <KpiCard
              label="Total"
              value={String(totalDevices)}
              subtitle="dispositivos"
              icon="server-outline"
              variant="info"
            />
          </Pressable>
          <Pressable
            className="flex-1 min-w-[45%]"
            onPress={() => router.push("/(tabs)/alerts")}
          >
            <KpiCard
              label="Alertas"
              value={String(triggers.length)}
              subtitle="ativos"
              icon="notifications-outline"
              variant={triggers.length > 0 ? "warning" : "ok"}
            />
          </Pressable>
        </View>
      )}

      {/* KPIs do DB — grid 2 colunas, clicaveis */}
      <View className="flex-row flex-wrap gap-3">
        <Pressable
          className="flex-1 min-w-[45%]"
          onPress={() => router.push("/(tabs)/devices")}
        >
          <KpiCard
            label="Dispositivos"
            value={`${kpis.devices.online}/${kpis.devices.total}`}
            subtitle="online"
            icon="hardware-chip-outline"
            color="#0d9488"
          />
        </Pressable>
        <Pressable
          className="flex-1 min-w-[45%]"
          onPress={() => router.push("/(tabs)/tickets")}
        >
          <KpiCard
            label="Tickets"
            value={String(kpis.tickets.open)}
            subtitle={
              kpis.tickets.critical > 0
                ? `${kpis.tickets.critical} criticos`
                : "abertos"
            }
            icon="ticket-outline"
            color={kpis.tickets.critical > 0 ? "#dc2626" : "#0d9488"}
          />
        </Pressable>
        <Pressable
          className="flex-1 min-w-[45%]"
          onPress={() => router.push("/(tabs)/tickets")}
        >
          <KpiCard
            label="Compliance"
            value={`${(kpis.compliance.rate * 100).toFixed(0)}%`}
            subtitle={`${kpis.compliance.compliant}/${kpis.compliance.total} conformes`}
            icon="shield-checkmark-outline"
            color={kpis.compliance.rate > 0.8 ? "#0d9488" : "#f59e0b"}
          />
        </Pressable>
        <Pressable
          className="flex-1 min-w-[45%]"
          onPress={() => router.push("/(tabs)/tickets")}
        >
          <KpiCard
            label="SSL"
            value={String(kpis.ssl.total)}
            subtitle={
              kpis.ssl.expiring > 0
                ? `${kpis.ssl.expiring} expirando`
                : "certificados"
            }
            icon="lock-closed-outline"
            color={kpis.ssl.expiring > 0 ? "#f59e0b" : "#0d9488"}
          />
        </Pressable>
        <Pressable
          className="flex-1 min-w-[45%]"
          onPress={() => router.push("/(tabs)/tickets")}
        >
          <KpiCard
            label="Backups"
            value={`${(kpis.backups.rate * 100).toFixed(0)}%`}
            subtitle={`${kpis.backups.successful}/${kpis.backups.total} sucesso`}
            icon="cloud-download-outline"
            color={kpis.backups.rate > 0.9 ? "#0d9488" : "#dc2626"}
          />
        </Pressable>
        <Pressable
          className="flex-1 min-w-[45%]"
          onPress={() => router.push("/(tabs)/devices")}
        >
          <KpiCard
            label="Ativos"
            value={String(kpis.assets.total)}
            subtitle="cadastrados"
            icon="cube-outline"
            color="#0d9488"
          />
        </Pressable>
        <Pressable
          className="flex-1 min-w-[45%]"
          onPress={() => router.push("/(tabs)/devices")}
        >
          <KpiCard
            label="Firewall"
            value={String(kpis.firewall.active)}
            subtitle={`de ${kpis.firewall.total} regras`}
            icon="shield-outline"
            color="#3b82f6"
          />
        </Pressable>
        <Pressable
          className="flex-1 min-w-[45%]"
          onPress={() => router.push("/(tabs)/tickets")}
        >
          <KpiCard
            label="Changes"
            value={String(kpis.changes.pending)}
            subtitle={`${kpis.changes.in_progress} em exec.`}
            icon="git-branch-outline"
            color="#3b82f6"
          />
        </Pressable>
        <Pressable
          className="flex-1 min-w-[45%]"
          onPress={() => router.push("/(tabs)/devices")}
        >
          <KpiCard
            label="Scripts"
            value={String(kpis.scripts.total)}
            subtitle="scripts"
            icon="code-slash-outline"
            color="#3b82f6"
          />
        </Pressable>
        <Pressable
          className="flex-1 min-w-[45%]"
          onPress={() => router.push("/(tabs)/alerts")}
        >
          <KpiCard
            label="Notif."
            value={String(kpis.notifications.unread)}
            subtitle={
              kpis.notifications.unread > 0 ? "nao lidas" : "sem novidade"
            }
            icon="mail-unread-outline"
            color={kpis.notifications.unread > 0 ? "#f59e0b" : "#0d9488"}
          />
        </Pressable>
      </View>

      {/* Avisos (warning) — todos os itens */}
      {warningTriggers.length > 0 && (
        <View
          className="rounded-lg border p-3"
          style={{ backgroundColor: "#f59e0b10", borderColor: "#f59e0b40" }}
        >
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="warning" size={16} color="#f59e0b" />
              <Text className="text-sm font-bold" style={{ color: "#f59e0b" }}>
                {warningTriggers.length} Aviso
                {warningTriggers.length !== 1 ? "s" : ""}
              </Text>
            </View>
            <Pressable onPress={() => router.push("/(tabs)/alerts")}>
              <Text className="text-xs text-primary">Ver todos</Text>
            </Pressable>
          </View>
          <View className="gap-0.5">
            {warningTriggers.map((t: ZabbixTrigger) => (
              <AlertItem
                key={t.triggerid}
                trigger={t}
                color="#f59e0b"
                onPress={() => {
                  const hostid = t.hosts?.[0]?.hostid;
                  if (hostid) goToDevice(hostid);
                }}
              />
            ))}
          </View>
        </View>
      )}

      {/* Informacoes (info-level, prioridade 0-1) — todos os itens */}
      {infoTriggers.length > 0 && (
        <View
          className="rounded-lg border p-3"
          style={{ backgroundColor: "#26262610", borderColor: "#26262640" }}
        >
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <Ionicons
                name="information-circle-outline"
                size={16}
                color="#737373"
              />
              <Text className="text-sm font-bold text-muted-foreground">
                {infoTriggers.length} Informacao
                {infoTriggers.length !== 1 ? "s" : ""}
              </Text>
            </View>
            <Pressable onPress={() => router.push("/(tabs)/alerts")}>
              <Text className="text-xs text-primary">Ver todos</Text>
            </Pressable>
          </View>
          <View className="gap-0.5">
            {infoTriggers.map((t: ZabbixTrigger) => (
              <AlertItem
                key={t.triggerid}
                trigger={t}
                color="#737373"
                onPress={() => {
                  const hostid = t.hosts?.[0]?.hostid;
                  if (hostid) goToDevice(hostid);
                }}
              />
            ))}
          </View>
        </View>
      )}

      {/* SSL Expirando — certificados proximos do vencimento */}
      {sslExpiringSoon && sslExpiringSoon.length > 0 && (
        <View
          className="rounded-lg border p-3"
          style={{ backgroundColor: "#f59e0b10", borderColor: "#f59e0b40" }}
        >
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="lock-closed-outline" size={16} color="#f59e0b" />
              <Text className="text-sm font-bold" style={{ color: "#f59e0b" }}>
                SSL Expirando ({sslExpiringSoon.length})
              </Text>
            </View>
          </View>
          <View className="gap-1.5">
            {sslExpiringSoon.map((cert) => {
              const validToDate = new Date(cert.valid_to);
              const daysLeft = Math.floor(
                (validToDate.getTime() - Date.now()) / 86400000,
              );
              return (
                <View
                  key={cert.id}
                  className="flex-row items-center gap-2 py-1.5"
                >
                  <View
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: "#f59e0b" }}
                  />
                  <View className="flex-1 min-w-0">
                    <Text className="text-xs text-foreground" numberOfLines={1}>
                      {cert.hostname}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Expira em {daysLeft}d ·{" "}
                      {validToDate.toLocaleDateString("pt-BR")}
                    </Text>
                  </View>
                  <View
                    className="px-2 py-0.5 rounded"
                    style={{ backgroundColor: "#f59e0b20" }}
                  >
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: "#f59e0b" }}
                    >
                      {daysLeft}d
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Tickets Recentes — ultimos chamados */}
      {recentTickets && recentTickets.length > 0 && (
        <View className="rounded-lg border border-border p-3 bg-card">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="ticket-outline" size={16} color="#0d9488" />
              <Text className="text-sm font-bold text-foreground">
                Tickets Recentes
              </Text>
            </View>
            <Pressable onPress={() => router.push("/(tabs)/tickets")}>
              <Text className="text-xs text-primary">Ver todos</Text>
            </Pressable>
          </View>
          <View className="gap-1.5">
            {recentTickets.map((ticket) => {
              const isCritical =
                ticket.priority === "critical" || ticket.priority === "high";
              return (
                <Pressable
                  key={ticket.id}
                  onPress={() => router.push("/(tabs)/tickets")}
                  className="active:opacity-70"
                >
                  <View className="flex-row items-center gap-2 py-1.5">
                    <View
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: isCritical ? "#dc2626" : "#0d9488",
                      }}
                    />
                    <View className="flex-1 min-w-0">
                      <Text
                        className="text-xs text-foreground"
                        numberOfLines={1}
                      >
                        {ticket.subject}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {ticket.status} · {timeAgo(ticket.created_at)}
                      </Text>
                    </View>
                    <View
                      className="px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: isCritical ? "#dc262620" : "#0d948820",
                      }}
                    >
                      <Text
                        className="text-xs font-semibold"
                        style={{ color: isCritical ? "#dc2626" : "#0d9488" }}
                      >
                        {ticket.priority}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color="#737373"
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Grid de Dispositivos — busca + cards com status, CPU, memoria e alertas */}
      {zabbixDevices.length > 0 && (
        <View>
          {/* Header + busca */}
          <View className="flex-row items-center justify-between mb-3 gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Dispositivos
            </Text>
            <View className="flex-1 max-w-[220px] flex-row items-center gap-2 rounded-lg bg-card border border-border px-2.5 py-2">
              <Ionicons name="search-outline" size={14} color="#737373" />
              <TextInput
                value={deviceSearch}
                onChangeText={setDeviceSearch}
                placeholder="Buscar nome, IP..."
                placeholderTextColor="#737373"
                className="flex-1 text-sm text-foreground"
              />
              {deviceSearch.length > 0 && (
                <Pressable onPress={() => setDeviceSearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={14} color="#737373" />
                </Pressable>
              )}
            </View>
          </View>

          {/* Contagem de resultados quando filtrando */}
          {deviceSearch.trim() && (
            <Text className="text-xs text-muted-foreground mb-2">
              {filteredDevices.length} de {zabbixDevices.length} dispositivo(s)
            </Text>
          )}

          {/* Lista de device cards */}
          {filteredDevices.length === 0 ? (
            <View className="items-center py-6">
              <Ionicons name="search-outline" size={32} color="#525252" />
              <Text className="mt-2 text-sm text-muted-foreground">
                Nenhum dispositivo encontrado
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {filteredDevices.map((device) => (
                <DeviceCard
                  key={device.host.hostid}
                  device={device}
                  onPress={(d) => goToDevice(d.host.hostid)}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
