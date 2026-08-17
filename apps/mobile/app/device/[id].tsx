// @ai-context: .zero-error/architecture-map.md#ingress
// Detalhe do device â€” painel execututivo completo (port do web device-detail-client)
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  TextInput,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  useZabbixHost,
  useZabbixItems,
  useZabbixHistory,
  useZabbixHostTriggers,
} from "@/hooks/use-zabbix-device";
import { AlertItem } from "@/components/ui/alert-item";
import { EmptyState } from "@/components/ui/empty-state";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Gauge, MetricBar, LineChart } from "@/components/ui/metric-chart";
import { Ionicons } from "@expo/vector-icons";
import {
  categorizeMetrics,
  detectDeviceType,
  findItem,
  formatMetricValue,
  formatBytes,
  formatUptime,
  extractPercent,
  safeParseFloat,
  mapToCartesianSeries,
  type ZabbixItem,
} from "@/lib/zabbix-metrics";
import type { ZabbixTrigger, ZabbixHistoryResponse } from "@/lib/api-routes";
import { apiRoutes } from "@/lib/api-routes";
import { api } from "@/lib/api-client";

const DEVICE_TYPE_LABELS: Record<string, string> = {
  "windows-agent": "Windows Agent",
  "linux-agent": "Linux Agent",
  snmp: "SNMP",
  unknown: "Generico",
};

const TIME_RANGES: Record<string, number> = {
  "5min": 300,
  "15min": 900,
  "1h": 3600,
  "6h": 21600,
  "24h": 86400,
  "7d": 604800,
};

const TIME_RANGE_LABELS: Record<string, string> = {
  "5min": "5min",
  "15min": "15min",
  "1h": "1h",
  "6h": "6h",
  "24h": "24h",
  "7d": "7d",
};

export default function DeviceDetailScreen() {
  const { id: hostId } = useLocalSearchParams<{ id: string }>();
  const {
    data: hostData,
    isLoading,
    refetch,
    isRefetching,
  } = useZabbixHost(hostId);
  const { data: triggersData } = useZabbixHostTriggers(hostId);
  const { data: itemsData } = useZabbixItems(hostId);

  const [timeRange, setTimeRange] = useState("1h");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const handleRefresh = useCallback(() => {
    refetch();
    setLastUpdate(new Date());
  }, [refetch]);

  // Auto-refresh a cada 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(handleRefresh, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, handleRefresh]);

  // Dados derivados â€” usar fallbacks para que hooks sempre executem
  const host = hostData?.host;
  const items = itemsData?.items ?? [];

  // Items de rede â€” padrao web: net.if.* com InOctets/OutOctets
  const netInterfaceItems = items.filter((i) => i.key_.startsWith("net.if."));
  // Extrai nomes unicos de interfaces (igual web) â€” useMemo ANTES dos early returns
  const netInterfaceNames = useMemo(() => {
    return Array.from(
      new Set(
        netInterfaceItems
          .map((i) => {
            const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
            if (nameMatch) return nameMatch[1]!;
            const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
            if (keyMatch) {
              const raw = keyMatch[1]!;
              const parts = raw.split(".");
              if (parts.length > 1) return `if.${parts[parts.length - 1]}`;
              return raw;
            }
            return null;
          })
          .filter((n): n is string => n !== null),
      ),
    );
  }, [netInterfaceItems]);

  // Interfaces com in/out pareadas â€” useMemo ANTES dos early returns
  const netInterfacesByIface = useMemo(() => {
    return netInterfaceNames
      .map((ifaceName) => {
        const inItem = netInterfaceItems.find((i) => {
          const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
          const extracted = nameMatch
            ? nameMatch[1]
            : (() => {
                const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
                if (!keyMatch) return null;
                const raw = keyMatch[1]!;
                const parts = raw.split(".");
                return parts.length > 1 ? `if.${parts[parts.length - 1]}` : raw;
              })();
          return (
            extracted === ifaceName &&
            (i.key_.includes("InOctets") || i.key_.startsWith("net.if.in"))
          );
        });
        const outItem = netInterfaceItems.find((i) => {
          const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
          const extracted = nameMatch
            ? nameMatch[1]
            : (() => {
                const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
                if (!keyMatch) return null;
                const raw = keyMatch[1]!;
                const parts = raw.split(".");
                return parts.length > 1 ? `if.${parts[parts.length - 1]}` : raw;
              })();
          return (
            extracted === ifaceName &&
            (i.key_.includes("OutOctets") || i.key_.startsWith("net.if.out"))
          );
        });
        return { ifaceName, inItem: inItem ?? null, outItem: outItem ?? null };
      })
      .filter((iface) => iface.inItem || iface.outItem);
  }, [netInterfaceNames, netInterfaceItems]);

  // Early returns â€” DEPOIS de todos os hooks
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#0d9488" />
      </View>
    );
  }

  if (!host) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Dispositivo" />
        <EmptyState
          icon="alert-circle-outline"
          message="Dispositivo nao encontrado"
        />
      </View>
    );
  }

  const isOnline = host.status === "0";
  const statusLabel = isOnline ? "Online" : "Offline";
  const alerts = (triggersData?.data ?? []).filter((t) => t.value === "1");
  const deviceType = detectDeviceType(items);
  const categories = categorizeMetrics(items);
  const ip = host.interfaces?.[0]?.ip ?? "N/A";
  const group = host.hostgroups?.[0]?.name;
  const os =
    host.inventory && !Array.isArray(host.inventory)
      ? host.inventory.os
      : undefined;
  const location =
    host.inventory && !Array.isArray(host.inventory)
      ? host.inventory.location
      : undefined;
  const contact =
    host.inventory && !Array.isArray(host.inventory)
      ? host.inventory.contact
      : undefined;

  // Items principais â€” padroes do web
  const cpuItem = findItem(items, "system.cpu.util");
  const memItem =
    findItem(items, "vm.memory.available") ?? findItem(items, "vm.memory.free");
  const memUtilItem = findItem(items, "vm.memory.util");
  const cpuPercent = extractPercent(cpuItem);
  const memPercent = extractPercent(memUtilItem) ?? extractPercent(memItem);
  const uptimeItem =
    findItem(items, "system.uptime") ?? findItem(items, "uptime");
  const pingItem = items.find((i) => i.key_ === "icmpping");
  const pingLossItem = items.find((i) => i.key_ === "icmppingloss");
  const pingSecItem = items.find((i) => i.key_ === "icmppingsec");
  const cpuNumItem = findItem(items, "system.cpu.num");
  const cpuLoadItem = items.find(
    (i) => i.key_.startsWith("system.cpu.load[") && i.key_.includes("avg1"),
  );
  const contextSwitchesItem = findItem(items, "system.cpu.switches");
  const interruptsItem = findItem(items, "system.cpu.intr");

  // Items de disco â€” padrao web: vfs.fs.size[...,pused]
  const fsItems = items.filter(
    (i) => i.key_.startsWith("vfs.fs.size[") && i.key_.endsWith(",pused]"),
  );
  const fsTotalItems = items.filter(
    (i) => i.key_.startsWith("vfs.fs.size[") && i.key_.endsWith(",total]"),
  );
  const fsUsedItems = items.filter(
    (i) => i.key_.startsWith("vfs.fs.size[") && i.key_.endsWith(",used]"),
  );
  const fsFreeItems = items.filter(
    (i) => i.key_.startsWith("vfs.fs.size[") && i.key_.endsWith(",free]"),
  );

  // Disk I/O
  const diskReadOpsItem = findItem(items, "vfs.dev.read.ops");
  const diskWriteOpsItem = findItem(items, "vfs.dev.write.ops");
  const diskReadLatItem = findItem(items, "vfs.dev.read.lat");
  const diskWriteLatItem = findItem(items, "vfs.dev.write.lat");
  const diskReadQueueItem = findItem(items, "vfs.dev.read.queue");
  const diskWriteQueueItem = findItem(items, "vfs.dev.write.queue");

  const netInItem =
    findItem(items, "ifHCInOctets") ?? findItem(items, "net.if.in");
  const netOutItem =
    findItem(items, "ifHCOutOctets") ?? findItem(items, "net.if.out");

  // Servicos â€” padrao web: service.info[...,state]
  const serviceItems = items.filter(
    (i) => i.key_.startsWith("service.info[") && i.key_.endsWith(",state]"),
  );

  // Processos â€” padrao web: proc.cpu.util[...] / proc.mem[...]
  const procItems = items.filter(
    (i) =>
      i.key_.startsWith("proc.cpu.util[") || i.key_.startsWith("proc.mem["),
  );

  // CPU breakdown â€” padrao web: system.cpu.* com "time" no nome, valor 0-100
  const cpuBreakdownItems = items.filter(
    (i) =>
      i.key_.startsWith("system.cpu.") &&
      !i.key_.includes("util") &&
      !i.key_.includes("load") &&
      !i.key_.includes("switches") &&
      !i.key_.includes("intr") &&
      !i.key_.includes("num") &&
      i.name.toLowerCase().includes("time") &&
      Number.parseFloat(i.lastvalue ?? "0") >= 0 &&
      Number.parseFloat(i.lastvalue ?? "0") <= 100,
  );

  // Memoria detalhada â€” padroes web
  const memTotalItem =
    findItem(items, "vm.memory.total") ??
    findItem(items, "vm.memory.size[total]");
  const memAvailItem =
    findItem(items, "vm.memory.available") ??
    findItem(items, "vm.memory.size[available]");
  const memFreeItem =
    findItem(items, "vm.memory.free") ??
    findItem(items, "vm.memory.size[free]");
  const memBuffersItem =
    findItem(items, "vm.memory.buffers") ??
    findItem(items, "vm.memory.size[buffers]");
  const memCachedItem =
    findItem(items, "vm.memory.cached") ??
    findItem(items, "vm.memory.size[cached]");

  // Swap
  const swapFreeItem = items.find(
    (i) =>
      (i.key_.startsWith("system.swap.size[") &&
        (i.key_.endsWith(",free]") || i.key_.endsWith(",pfree]"))) ||
      i.key_.startsWith("system.swap.free["),
  );
  const swapPfreeItem = items.find(
    (i) => i.key_.startsWith("system.swap.") && i.key_.includes("pfree"),
  );
  const swapItem = swapPfreeItem ?? swapFreeItem;

  // System info
  const systemNameItem = items.find((i) => i.key_.startsWith("system.name"));
  const systemDescrItem = items.find((i) => i.key_.startsWith("system.descr"));
  const systemLocationItem = items.find((i) =>
    i.key_.startsWith("system.location"),
  );
  const systemContactItem = items.find((i) =>
    i.key_.startsWith("system.contact"),
  );
  const systemObjectIdItem = items.find((i) =>
    i.key_.startsWith("system.objectid"),
  );

  // SNMP availability
  const snmpAvailItem = items.find(
    (i) => i.key_ === "zabbix[host,snmp,available]",
  );

  // Hardware/network uptime fallbacks
  const hwUptimeItem = items.find((i) => i.key_.startsWith("system.hw.uptime"));
  const netUptimeItem = items.find((i) =>
    i.key_.startsWith("system.net.uptime"),
  );

  // CPU idle
  const cpuIdleItem = cpuBreakdownItems.find((i) =>
    i.name.toLowerCase().includes("idle"),
  );

  // Updates pending / reboot pending (Windows)
  const updatesPendingItem = items.find(
    (i) =>
      (i.key_.includes("wmi.get") && i.name.toLowerCase().includes("update")) ||
      i.key_.includes("apt.update") ||
      i.key_.includes("pkg.update"),
  );
  const rebootPendingItem = items.find(
    (i) =>
      i.key_.includes("system.hw.reboot") ||
      (i.key_.includes("wmi.get") && i.name.toLowerCase().includes("reboot")) ||
      (i.key_.includes("system.run") &&
        i.name.toLowerCase().includes("reboot")),
  );

  // SSL certificates
  const sslCertItems = items.filter(
    (i) => i.key_.startsWith("cert.") || i.key_.startsWith("web.test."),
  );

  // Temperaturas
  const tempItems = items.filter(
    (i) =>
      i.key_.startsWith("sensor.temp") || i.key_.startsWith("system.hw.temp"),
  );

  // Portas TCP/UDP
  const tcpPortItems = items.filter(
    (i) =>
      i.key_.startsWith("net.tcp.listen[") ||
      i.key_.startsWith("net.tcp.port["),
  );
  const udpPortItems = items.filter(
    (i) =>
      i.key_.startsWith("net.udp.listen[") ||
      i.key_.startsWith("net.udp.port["),
  );

  // Item selecionado para grafico detalhado
  const numericItems = items.filter((i) => {
    const v = Number.parseFloat(i.lastvalue ?? "");
    return !Number.isNaN(v);
  });
  const selectedItem = numericItems.find((i) => i.itemid === selectedItemId);

  return (
    <View className="flex-1 bg-background">
      {/* Header com botao voltar + auto-refresh + time range */}
      <ScreenHeader
        title={host.name}
        subtitle={`${statusLabel} Â· ${DEVICE_TYPE_LABELS[deviceType]}`}
        right={
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => setAutoRefresh(!autoRefresh)}
              className="flex-row items-center gap-1 px-2 py-1 rounded"
              style={{
                backgroundColor: autoRefresh ? "#0d948820" : "#262626",
              }}
            >
              <View
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: autoRefresh ? "#0d9488" : "#737373" }}
              />
              <Text
                className="text-xs font-semibold"
                style={{ color: autoRefresh ? "#0d9488" : "#737373" }}
              >
                {autoRefresh ? "AO VIVO" : "PAUSADO"}
              </Text>
            </Pressable>
          </View>
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-8 gap-4"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor="#0d9488"
          />
        }
      >
        {/* Badges: IP, Host ID, Device Type + Time Range selector */}
        <View className="flex-row flex-wrap gap-2">
          <Badge icon="wifi-outline" label={ip} />
          <Badge icon="finger-print-outline" label={host.hostid} />
          <Badge
            icon="hardware-chip-outline"
            label={DEVICE_TYPE_LABELS[deviceType] ?? ""}
          />
        </View>

        {/* Time range selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {Object.entries(TIME_RANGES).map(([key, _]) => (
            <Pressable
              key={key}
              onPress={() => setTimeRange(key)}
              className={`px-3 py-1.5 rounded-lg border ${
                timeRange === key
                  ? "bg-primary border-primary"
                  : "bg-card border-border"
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  timeRange === key
                    ? "text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {TIME_RANGE_LABELS[key]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* INFORMACOES DO SISTEMA */}
        {(os ||
          location ||
          contact ||
          group ||
          systemNameItem ||
          systemDescrItem) && (
          <Section title="Informacoes do Sistema">
            {systemNameItem?.lastvalue && (
              <InfoRow
                icon="server-outline"
                label="Hostname"
                value={systemNameItem.lastvalue}
              />
            )}
            {systemDescrItem?.lastvalue && (
              <View className="gap-1.5">
                <Text className="text-xs font-bold text-muted-foreground">
                  SISTEMA OPERACIONAL
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {(() => {
                    const descr = systemDescrItem.lastvalue;
                    const osMatch =
                      /^(Linux|Windows|FreeBSD|OpenBSD|SunOS|AIX|HP-UX|Darwin)/i.exec(
                        descr,
                      );
                    const kernelMatch = /(\d+\.\d+\.\d+[\w.-]*)/.exec(descr);
                    const archMatch =
                      /(x86_64|i386|i686|armv\w+|aarch64)/i.exec(descr);
                    const osName = osMatch ? osMatch[1] : "Desconhecido";
                    const kernel = kernelMatch ? kernelMatch[1] : null;
                    const arch = archMatch ? archMatch[1] : null;
                    return (
                      <>
                        <View
                          className="rounded px-2 py-0.5"
                          style={{ backgroundColor: "rgba(27,168,152,0.15)" }}
                        >
                          <Text
                            className="text-xs font-bold"
                            style={{ color: "#1BA898" }}
                          >
                            {osName}
                          </Text>
                        </View>
                        {kernel && (
                          <View
                            className="rounded px-2 py-0.5"
                            style={{ backgroundColor: "rgba(62,139,240,0.15)" }}
                          >
                            <Text
                              className="text-xs"
                              style={{ color: "#3E8BF0" }}
                            >
                              Kernel {kernel}
                            </Text>
                          </View>
                        )}
                        {arch && (
                          <View
                            className="rounded px-2 py-0.5"
                            style={{
                              backgroundColor: "rgba(142,124,255,0.15)",
                            }}
                          >
                            <Text
                              className="text-xs"
                              style={{ color: "#8E7CFF" }}
                            >
                              {arch}
                            </Text>
                          </View>
                        )}
                      </>
                    );
                  })()}
                </View>
                <Text
                  className="text-xs text-muted-foreground"
                  style={{ flexShrink: 1 }}
                >
                  {systemDescrItem.lastvalue}
                </Text>
              </View>
            )}
            {os && !systemDescrItem && (
              <InfoRow
                icon="desktop-outline"
                label="OS"
                value={os.slice(0, 60)}
              />
            )}
            {group && (
              <InfoRow icon="folder-outline" label="Grupo" value={group} />
            )}
            {(systemLocationItem?.lastvalue || location) && (
              <InfoRow
                icon="location-outline"
                label="Localizacao"
                value={systemLocationItem?.lastvalue ?? location!}
              />
            )}
            {(systemContactItem?.lastvalue || contact) && (
              <InfoRow
                icon="person-outline"
                label="Contato"
                value={systemContactItem?.lastvalue ?? contact!}
              />
            )}
            {systemObjectIdItem?.lastvalue && (
              <InfoRow
                icon="barcode-outline"
                label="Object ID (SNMP)"
                value={systemObjectIdItem.lastvalue}
              />
            )}
            {uptimeItem?.lastvalue && (
              <InfoRow
                icon="time-outline"
                label="Uptime"
                value={formatUptime(Number.parseFloat(uptimeItem.lastvalue))}
              />
            )}
            {cpuNumItem?.lastvalue && (
              <InfoRow
                icon="hardware-chip-outline"
                label="CPUs"
                value={cpuNumItem.lastvalue}
              />
            )}
            {pingItem?.lastvalue && (
              <InfoRow
                icon="pulse-outline"
                label="Ping"
                value={pingItem.lastvalue === "1" ? "OK" : "Falhou"}
              />
            )}
            {pingLossItem?.lastvalue && (
              <InfoRow
                icon="trending-down-outline"
                label="Perda de Pacotes"
                value={`${Number.parseFloat(pingLossItem.lastvalue).toFixed(1)}%`}
              />
            )}
            {pingSecItem?.lastvalue && (
              <InfoRow
                icon="timer-outline"
                label="Latencia"
                value={`${Number.parseFloat(pingSecItem.lastvalue).toFixed(2)}s`}
              />
            )}
            {contextSwitchesItem?.lastvalue && (
              <InfoRow
                icon="swap-horizontal-outline"
                label="Context Switches"
                value={Number.parseFloat(
                  contextSwitchesItem.lastvalue,
                ).toLocaleString("pt-BR")}
              />
            )}
            {interruptsItem?.lastvalue && (
              <InfoRow
                icon="flash-outline"
                label="Interrupcoes"
                value={Number.parseFloat(
                  interruptsItem.lastvalue,
                ).toLocaleString("pt-BR")}
              />
            )}
          </Section>
        )}

        {/* VISAO GERAL â€” KPI CARDS */}
        <KpiOverviewSection
          items={items}
          icmpPingItem={pingItem}
          icmpLossItem={pingLossItem}
          icmpSecItem={pingSecItem}
          snmpAvailItem={snmpAvailItem}
          uptimeItem={uptimeItem}
          hwUptimeItem={hwUptimeItem}
          netUptimeItem={netUptimeItem}
          cpuItem={cpuItem}
          cpuValue={cpuPercent ?? 0}
          cpuNumItem={cpuNumItem}
          swapPfreeItem={swapPfreeItem}
          swapFreeItem={swapFreeItem}
          interruptsItem={interruptsItem}
          contextSwitchesItem={contextSwitchesItem}
          tempItems={tempItems}
          tcpPortItems={tcpPortItems}
          udpPortItems={udpPortItems}
          sslCertItems={sslCertItems}
          updatesPendingItem={updatesPendingItem}
          rebootPendingItem={rebootPendingItem}
        />

        {/* GAUGES â€” CPU e Memoria */}
        {(cpuPercent != null || memPercent != null) && (
          <Section title="Desempenho â€” Medidores">
            <View className="flex-row justify-around">
              {cpuPercent != null && <Gauge value={cpuPercent} label="CPU" />}
              {memPercent != null && (
                <Gauge value={memPercent} label="Memoria" />
              )}
            </View>
          </Section>
        )}

        {/* COMPOSICAO DE CPU */}
        {cpuBreakdownItems.length > 0 && (
          <Section title="Composicao de CPU â€” Detalhamento por Componente">
            <CpuBreakdown items={cpuBreakdownItems} cpuIdleItem={cpuIdleItem} />
          </Section>
        )}

        {/* MEMORIA E SWAP DETALHES */}
        {(memTotalItem || memAvailItem || swapItem) && (
          <Section title="Memoria e Swap â€” Detalhes">
            <MemoryDetails
              totalItem={memTotalItem}
              availItem={memAvailItem}
              freeItem={memFreeItem}
              buffersItem={memBuffersItem}
              cachedItem={memCachedItem}
              swapItem={swapItem}
              swapFreeItem={swapFreeItem}
            />
          </Section>
        )}

        {/* SPARKLINES â€” CPU, RAM, Load, Rede, Disco (multi-serie com SVG) */}
        <SparklinesSection
          _items={items}
          timeRange={timeRange}
          _hostId={hostId}
          cpuItem={cpuItem}
          cpuLoadItem={cpuLoadItem}
          memUtilItem={memUtilItem}
          memItem={memItem}
          memBuffersItem={memBuffersItem}
          memCachedItem={memCachedItem}
          netInItem={netInItem}
          netOutItem={netOutItem}
          netInterfacesByIface={netInterfacesByIface}
          diskReadOpsItem={diskReadOpsItem}
          diskWriteOpsItem={diskWriteOpsItem}
          diskReadLatItem={diskReadLatItem}
          diskWriteLatItem={diskWriteLatItem}
          diskReadQueueItem={diskReadQueueItem}
          diskWriteQueueItem={diskWriteQueueItem}
        />

        {/* DISCO â€” UTILIZACAO POR VOLUME */}
        {fsItems.length > 0 && (
          <Section title="Disco â€” Utilizacao por Volume">
            <DiskSection
              fsItems={fsItems}
              fsTotalItems={fsTotalItems}
              fsUsedItems={fsUsedItems}
              fsFreeItems={fsFreeItems}
            />
          </Section>
        )}

        {/* REDE â€” DETALHES POR INTERFACE */}
        {netInterfacesByIface.length > 0 && (
          <Section title="Rede â€” Detalhes por Interface">
            <NetworkDetails interfaces={netInterfacesByIface} items={items} />
          </Section>
        )}

        {/* SERVICOS E PROCESSOS */}
        {(serviceItems.length > 0 || procItems.length > 0) && (
          <ServicesProcessesSection
            serviceItems={serviceItems}
            procItems={procItems}
            triggers={alerts}
            _items={items}
          />
        )}

        {/* GRAFICO DETALHADO */}
        {numericItems.length > 0 && (
          <Section title="Grafico Detalhado">
            <ChartSection
              items={numericItems}
              selectedItem={selectedItem ?? null}
              onItemChange={setSelectedItemId}
              timeRange={timeRange}
            />
          </Section>
        )}

        {/* TEMPERATURAS (sensores) */}
        {tempItems.length > 0 && (
          <Section title="Temperaturas">
            <View className="gap-2">
              {tempItems.slice(0, 10).map((item) => {
                const temp = Number.parseFloat(item.lastvalue ?? "0");
                const tempColor =
                  temp > 70 ? "#dc2626" : temp > 50 ? "#f59e0b" : "#3DD68C";
                return (
                  <View
                    key={item.itemid}
                    className="flex-row items-center justify-between"
                  >
                    <View className="flex-row items-center gap-2 flex-1">
                      <Ionicons
                        name="thermometer-outline"
                        size={14}
                        color={tempColor}
                      />
                      <Text
                        className="text-xs text-foreground flex-1"
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                    </View>
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: tempColor }}
                    >
                      {temp.toFixed(1)}Â°C
                    </Text>
                  </View>
                );
              })}
            </View>
          </Section>
        )}

        {/* PORTAS TCP/UDP */}
        {(tcpPortItems.length > 0 || udpPortItems.length > 0) && (
          <Section title="Portas Abertas">
            <View className="gap-2">
              {tcpPortItems.map((item) => {
                const portMatch = item.key_.match(/\[(\d+)\]/);
                const port = portMatch ? portMatch[1] : item.name;
                const isOpen = item.lastvalue === "1";
                return (
                  <View
                    key={item.itemid}
                    className="flex-row items-center justify-between"
                  >
                    <View className="flex-row items-center gap-2 flex-1">
                      <View
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: isOpen ? "#3DD68C" : "#525252",
                        }}
                      />
                      <Text className="text-xs text-foreground">
                        TCP {port}
                      </Text>
                    </View>
                    <Text
                      className="text-xs"
                      style={{ color: isOpen ? "#3DD68C" : "#525252" }}
                    >
                      {isOpen ? "Aberta" : "Fechada"}
                    </Text>
                  </View>
                );
              })}
              {udpPortItems.map((item) => {
                const portMatch = item.key_.match(/\[(\d+)\]/);
                const port = portMatch ? portMatch[1] : item.name;
                const isOpen = item.lastvalue === "1";
                return (
                  <View
                    key={item.itemid}
                    className="flex-row items-center justify-between"
                  >
                    <View className="flex-row items-center gap-2 flex-1">
                      <View
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: isOpen ? "#3DD68C" : "#525252",
                        }}
                      />
                      <Text className="text-xs text-foreground">
                        UDP {port}
                      </Text>
                    </View>
                    <Text
                      className="text-xs"
                      style={{ color: isOpen ? "#3DD68C" : "#525252" }}
                    >
                      {isOpen ? "Aberta" : "Fechada"}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Section>
        )}

        {/* ALERTAS ATIVOS â€” agrupados por severidade */}
        <Section title={`Alertas Ativos (${alerts.length})`}>
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
            <AlertsBySeverity alerts={alerts} />
          )}
        </Section>

        {/* TODAS AS METRICAS (tabela categorizada) */}
        {categories.length > 0 && (
          <AllMetricsSection categories={categories} hostId={hostId} />
        )}

        {/* Ultima atualizacao */}
        {lastUpdate && (
          <Text className="text-xs text-muted-foreground text-center">
            Atualizado: {lastUpdate.toLocaleTimeString("pt-BR")}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Section â€” wrapper com titulo para cada secao
// ============================================================================
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </Text>
      <View className="rounded-lg bg-card p-4 border border-border gap-3">
        {children}
      </View>
    </View>
  );
}

// ============================================================================
// KpiOverviewSection â€” KPI cards de visao geral (ICMP, SNMP, latencia, etc)
// Port do Gauges component do web
// ============================================================================
function KpiOverviewSection({
  items,
  icmpPingItem,
  icmpLossItem,
  icmpSecItem,
  snmpAvailItem,
  uptimeItem,
  hwUptimeItem,
  netUptimeItem,
  cpuItem,
  cpuValue,
  cpuNumItem,
  swapPfreeItem,
  swapFreeItem,
  interruptsItem,
  contextSwitchesItem,
  tempItems,
  tcpPortItems,
  udpPortItems,
  sslCertItems,
  updatesPendingItem,
  rebootPendingItem,
}: {
  items: ZabbixItem[];
  icmpPingItem?: ZabbixItem;
  icmpLossItem?: ZabbixItem;
  icmpSecItem?: ZabbixItem;
  snmpAvailItem?: ZabbixItem;
  uptimeItem?: ZabbixItem;
  hwUptimeItem?: ZabbixItem;
  netUptimeItem?: ZabbixItem;
  cpuItem?: ZabbixItem;
  cpuValue: number;
  cpuNumItem?: ZabbixItem;
  swapPfreeItem?: ZabbixItem;
  swapFreeItem?: ZabbixItem;
  interruptsItem?: ZabbixItem;
  contextSwitchesItem?: ZabbixItem;
  tempItems: ZabbixItem[];
  tcpPortItems: ZabbixItem[];
  udpPortItems: ZabbixItem[];
  sslCertItems: ZabbixItem[];
  updatesPendingItem?: ZabbixItem;
  rebootPendingItem?: ZabbixItem;
}) {
  const icmpPing = icmpPingItem
    ? Number.parseFloat(icmpPingItem.lastvalue ?? "0") === 1
    : false;
  const icmpLoss = icmpLossItem
    ? Number.parseFloat(icmpLossItem.lastvalue ?? "0")
    : 0;
  const icmpSec = icmpSecItem
    ? Number.parseFloat(icmpSecItem.lastvalue ?? "0")
    : 0;
  const uptimeValue = uptimeItem
    ? Number.parseFloat(uptimeItem.lastvalue ?? "0")
    : 0;

  const kpiCards: {
    label: string;
    value: string;
    color: string;
    sub: string;
  }[] = [];

  // ICMP PING
  if (icmpPingItem) {
    kpiCards.push({
      label: "ICMP PING",
      value: icmpPing ? "OK" : "FALHA",
      color: icmpPing ? "#3DD68C" : "#E5484D",
      sub: icmpLoss > 0 ? `Perda: ${icmpLoss.toFixed(1)}%` : "Sem perda",
    });
  }

  // SNMP AGENT
  if (snmpAvailItem) {
    const ok = Number.parseFloat(snmpAvailItem.lastvalue ?? "0") === 1;
    kpiCards.push({
      label: "SNMP AGENT",
      value: ok ? "OK" : "INDISPONIVEL",
      color: ok ? "#3DD68C" : "#E5484D",
      sub: "Disponibilidade do agente",
    });
  }

  // LATENCIA
  if (icmpSecItem) {
    kpiCards.push({
      label: "LATENCIA",
      value: icmpSec > 0 ? `${icmpSec.toFixed(3)}s` : "N/A",
      color: "#3E8BF0",
      sub: "Tempo de resposta ICMP",
    });
  }

  // UPTIME
  if (uptimeItem || hwUptimeItem || netUptimeItem) {
    const uptime =
      uptimeValue > 0
        ? formatUptime(uptimeValue)
        : hwUptimeItem
          ? formatUptime(Number.parseFloat(hwUptimeItem.lastvalue ?? "0"))
          : netUptimeItem
            ? formatUptime(Number.parseFloat(netUptimeItem.lastvalue ?? "0"))
            : "N/A";
    kpiCards.push({
      label: "UPTIME",
      value: uptime,
      color: "#3E8BF0",
      sub: hwUptimeItem
        ? "Uptime de hardware"
        : netUptimeItem
          ? "Uptime de rede"
          : "Tempo de atividade",
    });
  }

  // CPU
  if (cpuItem) {
    kpiCards.push({
      label: "CPU",
      value: `${cpuValue.toFixed(1)}%`,
      color: "#1BA898",
      sub: cpuNumItem
        ? `${Number.parseFloat(cpuNumItem.lastvalue ?? "0").toFixed(0)} nucleo(s)`
        : "Utilizacao atual",
    });
  }

  // SWAP
  if (swapPfreeItem || swapFreeItem) {
    kpiCards.push({
      label: "SWAP",
      value: swapPfreeItem
        ? `${(100 - Number.parseFloat(swapPfreeItem.lastvalue ?? "0")).toFixed(1)}%`
        : swapFreeItem
          ? formatBytes(Number.parseFloat(swapFreeItem.lastvalue ?? "0"))
          : "N/A",
      color: "#8E7CFF",
      sub: swapPfreeItem ? "Swap em uso" : "Swap livre",
    });
  }

  // INTERRUPTS
  if (interruptsItem) {
    kpiCards.push({
      label: "INTERRUPTS",
      value: `${Number.parseFloat(interruptsItem.lastvalue ?? "0").toFixed(0)}/s`,
      color: "#1BA898",
      sub: "Interrupcoes por segundo",
    });
  }

  // CONTEXT SWITCHES
  if (contextSwitchesItem) {
    kpiCards.push({
      label: "CONTEXT SWITCHES",
      value: `${Number.parseFloat(contextSwitchesItem.lastvalue ?? "0").toFixed(0)}/s`,
      color: "#3E8BF0",
      sub: "Trocas de contexto/s",
    });
  }

  // TEMPERATURA
  if (tempItems.length > 0) {
    const t = tempItems[0]!;
    const v = Number.parseFloat(t.lastvalue ?? "0");
    const unit = t.units || "Â°C";
    const tempColor =
      !Number.isNaN(v) && v >= 70
        ? "#E5484D"
        : !Number.isNaN(v) && v >= 55
          ? "#F5A623"
          : "#3DD68C";
    kpiCards.push({
      label: "TEMPERATURA",
      value: Number.isNaN(v) ? "N/A" : `${v.toFixed(1)}${unit}`,
      color: tempColor,
      sub:
        tempItems.length > 1
          ? `${tempItems.length} sensores`
          : "Sensor de temperatura",
    });
  }

  // PORTAS TCP/UDP
  if (tcpPortItems.length > 0 || udpPortItems.length > 0) {
    kpiCards.push({
      label: "PORTAS TCP/UDP",
      value: `${tcpPortItems.length}/${udpPortItems.length}`,
      color: "#1BA898",
      sub: `TCP ${tcpPortItems.filter((p) => Number.parseFloat(p.lastvalue ?? "0") === 1).length} ativas Â· UDP ${udpPortItems.filter((p) => Number.parseFloat(p.lastvalue ?? "0") === 1).length} ativas`,
    });
  }

  // CERTIFICADOS SSL
  if (sslCertItems.length > 0) {
    const valid = sslCertItems.filter((c) => {
      const v = Number.parseFloat(c.lastvalue ?? "0");
      return !Number.isNaN(v) && v > 0;
    }).length;
    const invalid = sslCertItems.length - valid;
    kpiCards.push({
      label: "CERTIFICADOS SSL",
      value: `${valid}/${sslCertItems.length}`,
      color: invalid > 0 ? "#E5484D" : "#3DD68C",
      sub:
        sslCertItems.length > 1
          ? `${sslCertItems.length} certificados monitorados`
          : sslCertItems[0]!.name,
    });
  }

  // METRICAS
  kpiCards.push({
    label: "METRICAS",
    value: items.length.toString(),
    color: "#F5A623",
    sub: "Total coletadas",
  });

  // UPDATES PENDENTES
  if (updatesPendingItem) {
    kpiCards.push({
      label: "UPDATES PEND.",
      value: updatesPendingItem.lastvalue ?? "",
      color: "#F5A623",
      sub: "Atualizacoes do Windows",
    });
  }

  // REINICIALIZACAO
  if (rebootPendingItem) {
    const pending = Number.parseFloat(rebootPendingItem.lastvalue ?? "0") > 0;
    kpiCards.push({
      label: "REINICIALIZACAO",
      value: pending ? "SIM" : "NAO",
      color: pending ? "#E5484D" : "#3DD68C",
      sub: "Pendente?",
    });
  }

  if (kpiCards.length === 0) return null;

  return (
    <Section title="Visao Geral">
      <View className="flex-row flex-wrap gap-2">
        {kpiCards.map((kpi, i) => (
          <View
            key={i}
            className="rounded-lg bg-secondary p-3 flex-1 min-w-[140px]"
          >
            <View className="flex-row items-center gap-1.5 mb-1.5">
              <View
                className="w-2 h-2 rounded-sm"
                style={{ backgroundColor: kpi.color }}
              />
              <Text
                className="text-xs font-bold text-muted-foreground"
                numberOfLines={1}
              >
                {kpi.label}
              </Text>
            </View>
            <Text className="text-xl font-bold" style={{ color: kpi.color }}>
              {kpi.value}
            </Text>
            <Text
              className="text-xs text-muted-foreground mt-0.5"
              numberOfLines={2}
            >
              {kpi.sub}
            </Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

// ============================================================================
// AlertsBySeverity â€” alertas agrupados por severidade (Critico/Aviso/Info)
// ============================================================================
function AlertsBySeverity({ alerts }: { alerts: ZabbixTrigger[] }) {
  const criticalAlerts = alerts.filter((t) => Number.parseInt(t.priority) >= 4);
  const warningAlerts = alerts.filter((t) => {
    const p = Number.parseInt(t.priority);
    return p >= 2 && p <= 3;
  });
  const infoAlerts = alerts.filter((t) => Number.parseInt(t.priority) <= 1);

  const [expandedCritical, setExpandedCritical] = useState(true);
  const [expandedWarning, setExpandedWarning] = useState(true);
  const [expandedInfo, setExpandedInfo] = useState(true);

  return (
    <View className="gap-3">
      {/* Criticos */}
      {criticalAlerts.length > 0 && (
        <View className="gap-1.5">
          <Pressable
            onPress={() => setExpandedCritical((v) => !v)}
            className="flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-2">
              <View
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: "#E5484D" }}
              />
              <Text className="text-xs font-bold text-foreground">
                Criticos ({criticalAlerts.length})
              </Text>
            </View>
            <Ionicons
              name={expandedCritical ? "chevron-down" : "chevron-forward"}
              size={14}
              color="#737373"
            />
          </Pressable>
          {expandedCritical && (
            <View className="gap-1.5 pl-4">
              {criticalAlerts.map((trigger) => (
                <AlertItem key={trigger.triggerid} alert={trigger} />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Avisos */}
      {warningAlerts.length > 0 && (
        <View className="gap-1.5">
          <Pressable
            onPress={() => setExpandedWarning((v) => !v)}
            className="flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-2">
              <View
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: "#F5A623" }}
              />
              <Text className="text-xs font-bold text-foreground">
                Avisos ({warningAlerts.length})
              </Text>
            </View>
            <Ionicons
              name={expandedWarning ? "chevron-down" : "chevron-forward"}
              size={14}
              color="#737373"
            />
          </Pressable>
          {expandedWarning && (
            <View className="gap-1.5 pl-4">
              {warningAlerts.map((trigger) => (
                <AlertItem key={trigger.triggerid} alert={trigger} />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Informacoes */}
      {infoAlerts.length > 0 && (
        <View className="gap-1.5">
          <Pressable
            onPress={() => setExpandedInfo((v) => !v)}
            className="flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-2">
              <View
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: "#3E8BF0" }}
              />
              <Text className="text-xs font-bold text-foreground">
                Informacoes ({infoAlerts.length})
              </Text>
            </View>
            <Ionicons
              name={expandedInfo ? "chevron-down" : "chevron-forward"}
              size={14}
              color="#737373"
            />
          </Pressable>
          {expandedInfo && (
            <View className="gap-1.5 pl-4">
              {infoAlerts.map((trigger) => (
                <AlertItem key={trigger.triggerid} alert={trigger} />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Badge â€” pill de informacao (IP, Host ID, etc)
// ============================================================================
function Badge({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-border">
      <Ionicons name={icon} size={12} color="#737373" />
      <Text className="text-xs text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ============================================================================
// InfoRow â€” linha de informacao simples
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
      <Text
        className="text-sm text-foreground font-medium flex-1 text-right"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

// ============================================================================
// CpuBreakdown â€” barras de breakdown de CPU (user, system, iowait, etc)
// Mostra CPU OCIOSA separadamente no topo e filtra idle do breakdown
// ============================================================================
function CpuBreakdown({
  items,
  cpuIdleItem,
}: {
  items: ZabbixItem[];
  cpuIdleItem?: ZabbixItem;
}) {
  const colors: Record<string, string> = {
    idle: "#525252",
    user: "#1BA898",
    system: "#3E8BF0",
    nice: "#8E7CFF",
    iowait: "#F5A623",
    irq: "#E5484D",
    softirq: "#ec4899",
    steal: "#7f1d1d",
    guest: "#8E7CFF",
  };

  // Extrai label amigavel como o web: "CPU (.+?) time" -> componente
  const sorted = [...items]
    .filter((item) => !item.name.toLowerCase().includes("idle")) // Filtra idle do breakdown
    .map((item) => {
      // Tenta extrair do nome: "CPU X time" -> X
      const nameMatch = item.name.match(/CPU\s+(.+?)\s+time/i);
      const component = nameMatch
        ? nameMatch[1]!.toLowerCase()
        : (() => {
            const keyMatch = item.key_.match(/\[([^\]]+)\]/);
            return keyMatch?.[1] ?? item.name;
          })();
      const value = Number.parseFloat(item.lastvalue ?? "0");
      return { item, component, value };
    })
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  if (sorted.length === 0 && !cpuIdleItem) return null;

  const idleValue = cpuIdleItem ? safeParseFloat(cpuIdleItem.lastvalue) : 0;

  return (
    <View className="gap-2">
      {/* CPU OCIOSA â€” destaque no topo */}
      {cpuIdleItem && (
        <View className="flex-row items-center justify-between pb-2 mb-1 border-b border-border">
          <View className="flex-row items-center gap-2">
            <View
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: "#3DD68C" }}
            />
            <Text className="text-xs font-bold text-foreground">
              CPU OCIOSA
            </Text>
          </View>
          <Text className="text-sm font-bold" style={{ color: "#3DD68C" }}>
            {idleValue.toFixed(2)}%
          </Text>
        </View>
      )}

      {/* Breakdown por componente (sem idle) */}
      {sorted.map(({ item, component, value }) => {
        const color = colors[component] ?? "#1BA898";
        return (
          <View key={item.itemid} className="gap-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-muted-foreground capitalize">
                {component}
              </Text>
              <Text className="text-xs font-semibold" style={{ color }}>
                {value.toFixed(1)}%
              </Text>
            </View>
            <View className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <View
                style={{
                  width: `${Math.min(100, value)}%`,
                  height: "100%",
                  backgroundColor:
                    value > 50 ? "#E5484D" : value > 20 ? "#F5A623" : color,
                }}
                className="rounded-full"
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ============================================================================
// MemoryDetails â€” detalhes de memoria e swap
// ============================================================================
function MemoryDetails({
  totalItem,
  availItem,
  freeItem,
  buffersItem,
  cachedItem,
  swapItem,
  swapFreeItem,
}: {
  totalItem?: ZabbixItem;
  availItem?: ZabbixItem;
  freeItem?: ZabbixItem;
  buffersItem?: ZabbixItem;
  cachedItem?: ZabbixItem;
  swapItem?: ZabbixItem;
  swapFreeItem?: ZabbixItem;
}) {
  const total = totalItem ? Number.parseFloat(totalItem.lastvalue ?? "0") : 0;
  const avail = availItem ? Number.parseFloat(availItem.lastvalue ?? "0") : 0;
  const free = freeItem ? Number.parseFloat(freeItem.lastvalue ?? "0") : 0;
  const buffers = buffersItem
    ? Number.parseFloat(buffersItem.lastvalue ?? "0")
    : 0;
  const cached = cachedItem
    ? Number.parseFloat(cachedItem.lastvalue ?? "0")
    : 0;
  const used = total - avail;
  const utilPct = total > 0 ? (used / total) * 100 : 0;

  return (
    <View className="gap-3">
      {/* RAM */}
      {total > 0 && (
        <View className="gap-2">
          <Text className="text-xs font-semibold text-foreground">RAM</Text>
          <View className="flex-row justify-between">
            <Text className="text-xs text-muted-foreground">Total</Text>
            <Text className="text-xs font-semibold text-foreground">
              {formatBytes(total)}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-xs text-muted-foreground">Disponivel</Text>
            <Text
              className="text-xs font-semibold"
              style={{ color: "#35D0C4" }}
            >
              {formatBytes(avail)}
            </Text>
          </View>
          {free > 0 && (
            <View className="flex-row justify-between">
              <Text className="text-xs text-muted-foreground">Livre</Text>
              <Text
                className="text-xs font-semibold"
                style={{ color: "#3DD68C" }}
              >
                {formatBytes(free)}
              </Text>
            </View>
          )}
          {buffers > 0 && (
            <View className="flex-row justify-between">
              <Text className="text-xs text-muted-foreground">Buffers</Text>
              <Text
                className="text-xs font-semibold"
                style={{ color: "#f59e0b" }}
              >
                {formatBytes(buffers)}
              </Text>
            </View>
          )}
          {cached > 0 && (
            <View className="flex-row justify-between">
              <Text className="text-xs text-muted-foreground">Cached</Text>
              <Text
                className="text-xs font-semibold"
                style={{ color: "#8E7CFF" }}
              >
                {formatBytes(cached)}
              </Text>
            </View>
          )}
          <View className="flex-row justify-between">
            <Text className="text-xs text-muted-foreground">Em uso</Text>
            <Text
              className="text-xs font-semibold"
              style={{ color: "#dc2626" }}
            >
              {formatBytes(used)} ({utilPct.toFixed(0)}%)
            </Text>
          </View>
          {/* Barra de utilizacao */}
          <View className="h-2 rounded-full bg-secondary overflow-hidden">
            <View
              style={{
                width: `${Math.min(100, utilPct)}%`,
                height: "100%",
                backgroundColor:
                  utilPct > 80
                    ? "#dc2626"
                    : utilPct > 60
                      ? "#f59e0b"
                      : "#0d9488",
              }}
              className="rounded-full"
            />
          </View>
        </View>
      )}

      {/* Swap */}
      {(swapItem || swapFreeItem) && (
        <View className="gap-2 pt-2 border-t border-border">
          <Text className="text-xs font-semibold text-foreground">Swap</Text>
          {swapItem && (
            <MetricBar
              label="Swap utilizado"
              value={formatMetricValue(swapItem.lastvalue, swapItem.units)}
              percent={extractPercent(swapItem)}
            />
          )}
          {swapFreeItem && (
            <View className="flex-row justify-between">
              <Text className="text-xs text-muted-foreground">Swap livre</Text>
              <Text
                className="text-xs font-semibold"
                style={{ color: "#3DD68C" }}
              >
                {formatMetricValue(swapFreeItem.lastvalue, swapFreeItem.units)}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// SparklinesSection â€” sparklines de CPU, RAM, load, rede, disco (multi-serie SVG)
// Cada bloco e um componente independente que busca seu proprio history
// ============================================================================
function SparklinesSection({
  _items,
  timeRange,
  _hostId,
  cpuItem,
  cpuLoadItem,
  memUtilItem,
  memItem,
  memBuffersItem,
  memCachedItem,
  netInItem,
  netOutItem,
  netInterfacesByIface,
  diskReadOpsItem,
  diskWriteOpsItem,
  diskReadLatItem,
  diskWriteLatItem,
  diskReadQueueItem,
  diskWriteQueueItem,
}: {
  _items: ZabbixItem[];
  timeRange: string;
  _hostId: string;
  cpuItem?: ZabbixItem;
  cpuLoadItem?: ZabbixItem;
  memUtilItem?: ZabbixItem;
  memItem?: ZabbixItem;
  memBuffersItem?: ZabbixItem;
  memCachedItem?: ZabbixItem;
  netInItem?: ZabbixItem;
  netOutItem?: ZabbixItem;
  netInterfacesByIface: {
    ifaceName: string;
    inItem: ZabbixItem | null;
    outItem: ZabbixItem | null;
  }[];
  diskReadOpsItem?: ZabbixItem;
  diskWriteOpsItem?: ZabbixItem;
  diskReadLatItem?: ZabbixItem;
  diskWriteLatItem?: ZabbixItem;
  diskReadQueueItem?: ZabbixItem;
  diskWriteQueueItem?: ZabbixItem;
}) {
  const rangeSec = TIME_RANGES[timeRange] ?? 3600;
  const nowSec = Math.floor(Date.now() / 1000);
  const from = nowSec - rangeSec;

  // Seletor de interface de rede
  const [selectedIface, setSelectedIface] = useState<string | null>(null);
  const ifaceForChart =
    netInterfacesByIface.find((i) => i.ifaceName === selectedIface) ??
    netInterfacesByIface[0];

  return (
    <View className="gap-2">
      <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Series Temporais ({timeRange})
      </Text>
      <View className="rounded-lg bg-card p-4 border border-border gap-4">
        {/* CPU */}
        {cpuItem && (
          <SparklineBlock
            title="CPU (%)"
            series={[{ item: cpuItem, color: "#1BA898", label: "CPU" }]}
            unit="%"
            from={from}
            rangeSec={rangeSec}
            nowSec={nowSec}
            thresholds={[
              { value: 80, color: "#F5A623", label: "80%" },
              { value: 90, color: "#E5484D", label: "90%" },
            ]}
          />
        )}

        {/* CPU Load */}
        {cpuLoadItem && (
          <SparklineBlock
            title="Load Average (avg1)"
            series={[{ item: cpuLoadItem, color: "#8E7CFF", label: "Load" }]}
            from={from}
            rangeSec={rangeSec}
            nowSec={nowSec}
          />
        )}

        {/* Memoria */}
        {(memUtilItem || memItem || memBuffersItem || memCachedItem) && (
          <SparklineBlock
            title="Memoria"
            series={[
              ...(memUtilItem
                ? [{ item: memUtilItem, color: "#35D0C4", label: "Util %" }]
                : []),
              ...(memItem
                ? [{ item: memItem, color: "#3DD68C", label: "Available" }]
                : []),
              ...(memBuffersItem
                ? [{ item: memBuffersItem, color: "#F5A623", label: "Buffers" }]
                : []),
              ...(memCachedItem
                ? [{ item: memCachedItem, color: "#8E7CFF", label: "Cached" }]
                : []),
            ]}
            unit={memUtilItem ? "%" : undefined}
            from={from}
            rangeSec={rangeSec}
            nowSec={nowSec}
          />
        )}

        {/* Rede â€” com seletor de interface */}
        {(netInterfacesByIface.length > 0 || netInItem || netOutItem) && (
          <View className="gap-2">
            {/* Seletor de interface */}
            {netInterfacesByIface.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-1.5"
              >
                {netInterfacesByIface.map((iface) => (
                  <Pressable
                    key={iface.ifaceName}
                    onPress={() => setSelectedIface(iface.ifaceName)}
                    className={`px-2.5 py-1 rounded border ${selectedIface === iface.ifaceName ? "bg-primary border-primary" : "bg-secondary border-border"}`}
                  >
                    <Text
                      className={`text-xs ${selectedIface === iface.ifaceName ? "text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      {iface.ifaceName}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <SparklineBlock
              title={`Rede${ifaceForChart ? ` â€” ${ifaceForChart.ifaceName}` : ""}`}
              series={[
                ...((ifaceForChart?.inItem ?? netInItem)
                  ? [
                      {
                        item: ifaceForChart?.inItem ?? netInItem!,
                        color: "#35D0C4",
                        label: "In",
                      },
                    ]
                  : []),
                ...((ifaceForChart?.outItem ?? netOutItem)
                  ? [
                      {
                        item: ifaceForChart?.outItem ?? netOutItem!,
                        color: "#F5A623",
                        label: "Out",
                      },
                    ]
                  : []),
              ]}
              unit="bps"
              from={from}
              rangeSec={rangeSec}
              nowSec={nowSec}
            />
          </View>
        )}

        {/* Disco I/O */}
        {(diskReadOpsItem ||
          diskWriteOpsItem ||
          diskReadLatItem ||
          diskWriteLatItem ||
          diskReadQueueItem ||
          diskWriteQueueItem) && (
          <SparklineBlock
            title="Disco I/O"
            series={[
              ...(diskReadOpsItem
                ? [
                    {
                      item: diskReadOpsItem,
                      color: "#35D0C4",
                      label: "Read ops",
                    },
                  ]
                : []),
              ...(diskWriteOpsItem
                ? [
                    {
                      item: diskWriteOpsItem,
                      color: "#F5A623",
                      label: "Write ops",
                    },
                  ]
                : []),
              ...(diskReadLatItem
                ? [
                    {
                      item: diskReadLatItem,
                      color: "#3DD68C",
                      label: "Read lat",
                    },
                  ]
                : []),
              ...(diskWriteLatItem
                ? [
                    {
                      item: diskWriteLatItem,
                      color: "#E5484D",
                      label: "Write lat",
                    },
                  ]
                : []),
              ...(diskReadQueueItem
                ? [
                    {
                      item: diskReadQueueItem,
                      color: "#8E7CFF",
                      label: "Read queue",
                    },
                  ]
                : []),
              ...(diskWriteQueueItem
                ? [
                    {
                      item: diskWriteQueueItem,
                      color: "#3E8BF0",
                      label: "Write queue",
                    },
                  ]
                : []),
            ]}
            from={from}
            rangeSec={rangeSec}
            nowSec={nowSec}
          />
        )}
      </View>
    </View>
  );
}

// ============================================================================
// SparklineBlock â€” um bloco com titulo + legenda + grafico SVG
// Cada bloco busca seu proprio history diretamente (sem callbacks)
// ============================================================================
function SparklineBlock({
  title,
  series,
  unit,
  from,
  rangeSec,
  nowSec,
  thresholds,
}: {
  title: string;
  series: { item: ZabbixItem; color: string; label: string }[];
  unit?: string;
  from: number;
  rangeSec: number;
  nowSec: number;
  thresholds?: { value: number; color: string; label?: string }[];
}) {
  return (
    <View className="gap-2">
      {/* Titulo + legenda */}
      <View className="flex-row items-center justify-between flex-wrap gap-2">
        <Text className="text-xs font-semibold text-foreground">{title}</Text>
        <View className="flex-row gap-3 flex-wrap">
          {series.map((s, i) => (
            <View key={i} className="flex-row items-center gap-1">
              <View
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <Text className="text-xs text-muted-foreground">{s.label}</Text>
            </View>
          ))}
        </View>
      </View>
      {/* Grafico â€” coleta dados das series */}
      <SeriesChart
        items={series.map((s) => s.item)}
        colors={series.map((s) => s.color)}
        labels={series.map((s) => s.label)}
        from={from}
        rangeSec={rangeSec}
        nowSec={nowSec}
        unit={unit}
        thresholds={thresholds}
      />
    </View>
  );
}

// ============================================================================
// SeriesChart â€” busca history de cada item e renderiza LineChart
// Usa useState + useEffect para coletar dados das series
// ============================================================================
function SeriesChart({
  items,
  colors,
  labels,
  from,
  rangeSec,
  nowSec,
  unit,
  thresholds,
}: {
  items: ZabbixItem[];
  colors: string[];
  labels: string[];
  from: number;
  rangeSec: number;
  nowSec: number;
  unit?: string;
  thresholds?: { value: number; color: string; label?: string }[];
}) {
  const [seriesData, setSeriesData] = useState<
    { data: number[]; color: string; label: string }[]
  >(
    items.map((_, i) => ({
      data: [],
      color: colors[i] ?? "#0d9488",
      label: labels[i] ?? "",
    })),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Busca history de cada item em paralelo
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(
      items.map(async (item) => {
        try {
          const res = await api.get<ZabbixHistoryResponse>(
            apiRoutes.zabbix.history(item.itemid, from),
          );
          if (res?.data) {
            return res.data
              .map((h: { value: string }) => Number.parseFloat(h.value))
              .filter((v: number) => !Number.isNaN(v));
          }
          return [];
        } catch {
          return [];
        }
      }),
    )
      .then((results) => {
        if (cancelled) return;
        setSeriesData(
          results.map((data, i) => ({
            data,
            color: colors[i] ?? "#0d9488",
            label: labels[i] ?? "",
          })),
        );
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Erro ao carregar historico");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [items, colors, labels, from]);

  if (loading) {
    return (
      <View className="items-center py-4">
        <ActivityIndicator size="small" color="#0d9488" />
        <Text className="mt-1.5 text-xs text-muted-foreground">
          Carregando...
        </Text>
      </View>
    );
  }

  if (error) {
    return <Text className="text-xs text-destructive italic">{error}</Text>;
  }

  const hasAny = seriesData.some((s) => s.data.length > 0);
  if (!hasAny) {
    return (
      <Text className="text-xs text-muted-foreground italic">
        Sem dados no periodo
      </Text>
    );
  }

  return (
    <LineChart
      series={seriesData.map((s) => ({
        ...s,
        data: mapToCartesianSeries(s.data, rangeSec),
      }))}
      height={140}
      unit={unit}
      timeRangeSeconds={rangeSec}
      nowSec={nowSec}
      thresholds={thresholds}
    />
  );
}

// SeriesHistoryLoader â€” nao usado mais, mantido para compatibilidade
function _SeriesHistoryLoader({
  item,
  _color,
  _label,
  from,
}: {
  item: ZabbixItem;
  _color: string;
  _label: string;
  from: number;
}) {
  // Apenas busca o history para aquecer o cache do React Query
  useZabbixHistory(item.itemid, from);
  return null;
}

// ============================================================================
// DiskSection â€” utilizacao de disco por volume (pused)
// ============================================================================
function DiskSection({
  fsItems,
  fsTotalItems,
  fsUsedItems,
  fsFreeItems,
}: {
  fsItems: ZabbixItem[];
  fsTotalItems: ZabbixItem[];
  fsUsedItems: ZabbixItem[];
  fsFreeItems: ZabbixItem[];
}) {
  return (
    <View className="gap-3">
      {fsItems.map((fs) => {
        const driveMatch = fs.key_.match(/vfs\.fs\.size\[([^\],]+)/);
        const driveName = driveMatch ? driveMatch[1]! : fs.name;
        // pused ja e a porcentagem usada (0-100)
        const pct = Number.parseFloat(fs.lastvalue ?? "0");
        const totalItem = fsTotalItems.find((t) => t.key_.includes(driveName));
        const usedItem = fsUsedItems.find((u) => u.key_.includes(driveName));
        const freeItem = fsFreeItems.find((f) => f.key_.includes(driveName));
        const total = totalItem
          ? Number.parseFloat(totalItem.lastvalue ?? "0")
          : 0;
        const used = usedItem
          ? Number.parseFloat(usedItem.lastvalue ?? "0")
          : 0;
        const free = freeItem
          ? Number.parseFloat(freeItem.lastvalue ?? "0")
          : 0;
        const barColor =
          pct > 80 ? "#dc2626" : pct > 60 ? "#f59e0b" : "#35D0C4";

        return (
          <View key={fs.itemid} className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text
                className="text-xs font-medium text-foreground"
                numberOfLines={1}
              >
                {driveName}
              </Text>
              <Text
                className="text-xs font-semibold"
                style={{ color: barColor }}
              >
                {pct.toFixed(0)}%
              </Text>
            </View>
            <View className="h-2 rounded-full bg-secondary overflow-hidden">
              <View
                style={{
                  width: `${Math.min(100, pct)}%`,
                  height: "100%",
                  backgroundColor: barColor,
                }}
                className="rounded-full"
              />
            </View>
            {total > 0 && (
              <Text className="text-xs text-muted-foreground">
                {formatBytes(used)} usado Â· {formatBytes(free)} livre Â·{" "}
                {formatBytes(total)} total
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ============================================================================
// NetworkDetails â€” detalhes por interface de rede com status/speed/errors/discards
// ============================================================================
function NetworkDetails({
  interfaces,
  items,
}: {
  interfaces: {
    ifaceName: string;
    inItem: ZabbixItem | null;
    outItem: ZabbixItem | null;
  }[];
  items: ZabbixItem[];
}) {
  // Busca items extras de rede por interface (ifOperStatus, ifHighSpeed, ifInErrors, etc)
  const findNetItem = (
    ifaceName: string,
    keyPart: string,
  ): ZabbixItem | undefined => {
    return items.find((i) => {
      if (!i.key_.startsWith("net.if.")) return false;
      const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
      if (!keyMatch) return false;
      const raw = keyMatch[1]!;
      const parts = raw.split(".");
      const extracted =
        parts.length > 1 ? `if.${parts[parts.length - 1]}` : raw;
      return extracted === ifaceName && i.key_.includes(keyPart);
    });
  };

  return (
    <View className="gap-3">
      {interfaces.map((iface) => {
        const operStatusItem = findNetItem(iface.ifaceName, "OperStatus");
        const highSpeedItem = findNetItem(iface.ifaceName, "HighSpeed");
        const inErrorsItem = findNetItem(iface.ifaceName, "InErrors");
        const outErrorsItem = findNetItem(iface.ifaceName, "OutErrors");
        const inDiscardsItem = findNetItem(iface.ifaceName, "InDiscards");
        const outDiscardsItem = findNetItem(iface.ifaceName, "OutDiscards");

        const isUp = operStatusItem
          ? safeParseFloat(operStatusItem.lastvalue) === 1
          : true;
        const statusColor = isUp ? "#3DD68C" : "#E5484D";
        const speed = highSpeedItem
          ? safeParseFloat(highSpeedItem.lastvalue)
          : 0;
        const inErrors = inErrorsItem
          ? safeParseFloat(inErrorsItem.lastvalue)
          : 0;
        const outErrors = outErrorsItem
          ? safeParseFloat(outErrorsItem.lastvalue)
          : 0;
        const inDiscards = inDiscardsItem
          ? safeParseFloat(inDiscardsItem.lastvalue)
          : 0;
        const outDiscards = outDiscardsItem
          ? safeParseFloat(outDiscardsItem.lastvalue)
          : 0;

        return (
          <View
            key={iface.ifaceName}
            className="rounded-lg bg-secondary p-3 gap-2"
          >
            {/* Header com nome + status */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: statusColor }}
                />
                <Text className="text-xs font-semibold text-foreground">
                  {iface.ifaceName}
                </Text>
              </View>
              <Text
                className="text-xs font-bold"
                style={{ color: statusColor }}
              >
                {isUp ? "UP" : "DOWN"}
              </Text>
            </View>

            {/* Velocidade da interface */}
            {speed > 0 && (
              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">
                  Velocidade
                </Text>
                <Text className="text-xs font-semibold text-foreground">
                  {speed >= 1000
                    ? `${(speed / 1000).toFixed(1)} Gbps`
                    : `${speed} Mbps`}
                </Text>
              </View>
            )}

            {/* Trafego in/out */}
            {iface.inItem && (
              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">
                  Recebido (in)
                </Text>
                <Text
                  className="text-xs font-semibold"
                  style={{ color: "#35D0C4" }}
                >
                  {formatMetricValue(
                    iface.inItem.lastvalue,
                    iface.inItem.units,
                  )}
                </Text>
              </View>
            )}
            {iface.outItem && (
              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">
                  Enviado (out)
                </Text>
                <Text
                  className="text-xs font-semibold"
                  style={{ color: "#F5A623" }}
                >
                  {formatMetricValue(
                    iface.outItem.lastvalue,
                    iface.outItem.units,
                  )}
                </Text>
              </View>
            )}

            {/* Erros */}
            {(inErrors > 0 || outErrors > 0) && (
              <View className="flex-row justify-between pt-1 border-t border-border">
                <Text className="text-xs text-muted-foreground">
                  Erros (in/out)
                </Text>
                <Text
                  className="text-xs font-semibold"
                  style={{
                    color: inErrors + outErrors > 10 ? "#E5484D" : "#F5A623",
                  }}
                >
                  {inErrors.toFixed(0)} / {outErrors.toFixed(0)}
                </Text>
              </View>
            )}

            {/* Descartes */}
            {(inDiscards > 0 || outDiscards > 0) && (
              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">
                  Descartes (in/out)
                </Text>
                <Text
                  className="text-xs font-semibold"
                  style={{
                    color:
                      inDiscards + outDiscards > 10 ? "#E5484D" : "#F5A623",
                  }}
                >
                  {inDiscards.toFixed(0)} / {outDiscards.toFixed(0)}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ============================================================================
// ServicesProcessesSection â€” servicos + processos
// ============================================================================
function ServicesProcessesSection({
  serviceItems,
  procItems,
  triggers,
  _items,
}: {
  serviceItems: ZabbixItem[];
  procItems: ZabbixItem[];
  triggers: ZabbixTrigger[];
  _items: ZabbixItem[];
}) {
  const [showProcesses, setShowProcesses] = useState(false);

  // Servicos parados (state != 0 no padrao web)
  const stoppedServices = serviceItems.filter((s) => {
    const v = Number.parseFloat(s.lastvalue ?? "0");
    return v !== 0;
  });
  const runningCount = serviceItems.length - stoppedServices.length;
  const allOk = stoppedServices.length === 0;

  // Mapeia nomes amigaveis de servicos Windows (como o web)
  const WINDOWS_SERVICE_NAMES: Record<string, string> = {
    W3SVC: "IIS World Wide Web Publishing",
    MSSQLSERVER: "SQL Server",
    MSSQL: "SQL Server",
    Spooler: "Spooler de Impressao",
    Winmgmt: "Windows Management Instrumentation",
    EventLog: "Log de Eventos do Windows",
    BITS: "Servico de Transferencia Inteligente em Segundo Plano",
    TermService: "Servicos de Area de Trabalho Remota",
    lanmanserver: "Servidor (Compartilhamento de Arquivos)",
    lanmanworkstation: "Estacao de Trabalho",
    Dnscache: "Cliente DNS",
    Dhcp: "Cliente DHCP",
    WinHttpAutoProxySvc: "Servico de Auto-Proxy WinHTTP",
    RpcSs: "Chamada de Procedimento Remoto (RPC)",
    Schedule: "Agendador de Tarefas",
    wuauserv: "Windows Update",
    AdobeARMservice: "Adobe Acrobat Update",
    AJR: "Agent",
  };

  const getFriendlyName = (svcName: string): string => {
    return WINDOWS_SERVICE_NAMES[svcName] ?? svcName;
  };

  // Busca trigger relacionado a um servico para severidade
  const getServiceTrigger = (svcName: string): ZabbixTrigger | undefined => {
    return triggers.find(
      (t) =>
        t.description?.toLowerCase().includes(svcName.toLowerCase()) ||
        t.comments?.toLowerCase().includes(svcName.toLowerCase()),
    );
  };

  return (
    <View className="gap-2">
      {/* SERVICOS */}
      {serviceItems.length > 0 && (
        <View className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Disponibilidade de Servicos
          </Text>
          <View
            className="rounded-lg p-4 border"
            style={{
              borderColor: allOk ? "#0d948840" : "#dc262640",
              backgroundColor: allOk ? "#0d948810" : "#dc262610",
            }}
          >
            <View className="flex-row items-center justify-between">
              <Text
                className="text-sm font-bold"
                style={{ color: allOk ? "#0d9488" : "#dc2626" }}
              >
                {allOk ? "OK" : "ATENCAO"}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {runningCount} de {serviceItems.length} ativos
              </Text>
            </View>
          </View>

          {/* Lista de servicos parados com severity e friendly names */}
          {stoppedServices.length > 0 && (
            <View className="gap-1.5">
              {stoppedServices.slice(0, 15).map((svc) => {
                const nameMatch = svc.key_.match(/service\.info\[([^\],]+)/);
                const rawName = nameMatch ? nameMatch[1]! : svc.name;
                const friendlyName = getFriendlyName(rawName);
                const trigger = getServiceTrigger(rawName);
                const severity = trigger
                  ? Number.parseInt(trigger.priority)
                  : 0;
                const sevColor =
                  severity >= 4
                    ? "#E5484D"
                    : severity >= 2
                      ? "#F5A623"
                      : "#3E8BF0";
                const sevLabel =
                  severity >= 4 ? "Critico" : severity >= 2 ? "Aviso" : "Info";

                return (
                  <View
                    key={svc.itemid}
                    className="rounded-lg bg-card p-2.5 border border-border gap-1"
                  >
                    <View className="flex-row items-center gap-2">
                      <View
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: sevColor }}
                      />
                      <Text
                        className="text-xs text-foreground flex-1 font-medium"
                        numberOfLines={1}
                      >
                        {friendlyName}
                      </Text>
                      <View
                        className="rounded px-1.5 py-0.5"
                        style={{ backgroundColor: `${sevColor}20` }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: sevColor }}
                        >
                          {sevLabel}
                        </Text>
                      </View>
                    </View>
                    {friendlyName !== rawName && (
                      <Text className="text-xs text-muted-foreground pl-4">
                        {rawName}
                      </Text>
                    )}
                    <Text className="text-xs text-destructive pl-4">
                      Parado
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* PROCESSOS */}
      {procItems.length > 0 && (
        <View className="gap-2">
          <Pressable
            onPress={() => setShowProcesses(!showProcesses)}
            className="flex-row items-center justify-between active:opacity-70"
          >
            <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Processos em Execucao (Top 10)
            </Text>
            <Ionicons
              name={showProcesses ? "chevron-down" : "chevron-forward"}
              size={14}
              color="#737373"
            />
          </Pressable>
          {showProcesses && (
            <View className="rounded-lg bg-card p-3 border border-border gap-2">
              {/* Header da tabela */}
              <View className="flex-row items-center pb-1.5 border-b border-border">
                <Text className="text-xs font-bold text-muted-foreground flex-1">
                  NOME
                </Text>
                <Text className="text-xs font-bold text-muted-foreground w-16 text-right">
                  CPU%
                </Text>
                <Text className="text-xs font-bold text-muted-foreground w-16 text-right">
                  MEM MB
                </Text>
              </View>
              {procItems.slice(0, 10).map((proc, i) => {
                // Extrai nome do processo da key_
                const cpuNameMatch = proc.key_.match(
                  /proc\.cpu\.util\[([^,\]]+)/,
                );
                const memNameMatch = proc.key_.match(/proc\.mem\[([^,\]]+)/);
                const procName =
                  cpuNameMatch?.[1] ?? memNameMatch?.[1] ?? proc.name;
                const cpuValue = Number.parseFloat(proc.lastvalue ?? "0");
                const cpuColor =
                  cpuValue > 50
                    ? "#E5484D"
                    : cpuValue > 20
                      ? "#F5A623"
                      : "#1BA898";

                // Busca item de memoria do mesmo processo
                const memItem = procItems.find(
                  (p) =>
                    p.key_.startsWith("proc.mem[") && p.key_.includes(procName),
                );
                const memMB = memItem
                  ? Number.parseFloat(memItem.lastvalue ?? "0") / 1048576
                  : 0;

                // PID simulado (como o web faz)
                const pid = (i + 1) * 137;

                return (
                  <View key={proc.itemid} className="flex-row items-center">
                    <View className="flex-1 flex-row items-center gap-1">
                      <Text className="text-xs text-muted-foreground">
                        {pid}
                      </Text>
                      <Text
                        className="text-xs text-foreground"
                        numberOfLines={1}
                      >
                        {procName}
                      </Text>
                    </View>
                    <Text
                      className="text-xs font-semibold w-16 text-right"
                      style={{ color: cpuColor }}
                    >
                      {cpuValue.toFixed(1)}%
                    </Text>
                    <Text className="text-xs font-semibold w-16 text-right text-foreground">
                      {memMB > 0 ? memMB.toFixed(0) : "â€”"}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// ChartSection â€” grafico detalhado com seletor de metrica
// ============================================================================
function ChartSection({
  items,
  selectedItem,
  onItemChange,
  timeRange,
}: {
  items: ZabbixItem[];
  selectedItem: ZabbixItem | null;
  onItemChange: (itemId: string) => void;
  timeRange: string;
}) {
  const from = Math.floor(Date.now() / 1000) - (TIME_RANGES[timeRange] ?? 3600);
  const itemId = selectedItem?.itemid ?? items[0]?.itemid;

  const { data: historyData, isLoading: historyLoading } = useZabbixHistory(
    itemId ?? null,
    from,
  );

  const values = useMemo(() => {
    if (!historyData?.data) return [];
    return historyData.data
      .map((h) => Number.parseFloat(h.value))
      .filter((v) => !Number.isNaN(v));
  }, [historyData]);

  return (
    <View className="gap-3">
      {/* Seletor de metrica */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {items.slice(0, 20).map((item) => (
          <Pressable
            key={item.itemid}
            onPress={() => onItemChange(item.itemid)}
            className={`px-3 py-1.5 rounded-lg border max-w-48 ${
              (selectedItem?.itemid ?? items[0]?.itemid) === item.itemid
                ? "bg-primary border-primary"
                : "bg-card border-border"
            }`}
          >
            <Text
              className="text-xs font-medium"
              style={{
                color:
                  (selectedItem?.itemid ?? items[0]?.itemid) === item.itemid
                    ? "#f0fdfa"
                    : "#737373",
              }}
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Grafico */}
      {historyLoading ? (
        <View className="items-center py-8">
          <ActivityIndicator size="small" color="#0d9488" />
          <Text className="mt-2 text-xs text-muted-foreground">
            Carregando...
          </Text>
        </View>
      ) : values.length > 0 ? (
        <View className="items-center">
          <LineChart
            series={[
              {
                data: mapToCartesianSeries(
                  values,
                  TIME_RANGES[timeRange] ?? 3600,
                ),
                color: "#0d9488",
                label: selectedItem?.name ?? "",
              },
            ]}
            height={160}
            unit={selectedItem?.units === "%" ? "%" : undefined}
            timeRangeSeconds={TIME_RANGES[timeRange] ?? 3600}
            nowSec={Math.floor(Date.now() / 1000)}
          />
          <Text className="mt-2 text-xs text-muted-foreground">
            {values.length} pontos Â· {timeRange} Â· atual:{" "}
            {formatMetricValue(selectedItem?.lastvalue, selectedItem?.units)}
          </Text>
        </View>
      ) : (
        <Text className="text-xs text-muted-foreground italic">
          Sem historico disponivel para esta metrica
        </Text>
      )}
    </View>
  );
}

// ============================================================================
// AllMetricsSection â€” tabela de todas as metricas categorizada e colapsavel
// ============================================================================
function AllMetricsSection({
  categories,
  hostId,
}: {
  categories: ReturnType<typeof categorizeMetrics>;
  hostId: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Busca flat (ignora categorias)
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase().trim();
    return categories
      .flatMap((c) => c.items)
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) || i.key_.toLowerCase().includes(q),
      );
  }, [categories, search]);

  return (
    <View className="gap-2">
      <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Todas as Metricas ({categories.reduce((s, c) => s + c.items.length, 0)}{" "}
        items)
      </Text>

      {/* Busca */}
      <View className="flex-row items-center gap-2 rounded-lg bg-card border border-border px-3">
        <Ionicons name="search-outline" size={14} color="#525252" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por nome ou key..."
          placeholderTextColor="#525252"
          className="flex-1 py-2 text-xs text-foreground"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={14} color="#525252" />
          </Pressable>
        )}
      </View>

      {/* Resultados de busca (flat) */}
      {searchResults ? (
        <View className="rounded-lg bg-card border border-border overflow-hidden">
          {searchResults.slice(0, 50).map((item) => (
            <View
              key={item.itemid}
              className="flex-row items-center justify-between px-3 py-2 border-b border-border"
            >
              <Text
                className="text-xs text-foreground flex-1 pr-2"
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <Text className="text-xs font-medium text-muted-foreground">
                {formatMetricValue(item.lastvalue, item.units)}
              </Text>
            </View>
          ))}
          {searchResults.length === 0 && (
            <Text className="text-xs text-muted-foreground p-3">
              Nenhuma metrica encontrada
            </Text>
          )}
        </View>
      ) : (
        // Modo categorizado
        <View className="gap-2">
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
                  <View className="px-3 pb-3 gap-1">
                    {cat.items.slice(0, 50).map((item) => (
                      <ItemRow key={item.itemid} item={item} _hostId={hostId} />
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
      )}
    </View>
  );
}

// ============================================================================
// ItemRow â€” um item individual com nome, valor e sparkline opcional
// ============================================================================
function ItemRow({ item, _hostId }: { item: ZabbixItem; _hostId: string }) {
  const [showHistory, setShowHistory] = useState(false);
  const value = formatMetricValue(item.lastvalue, item.units);
  const from = Math.floor(Date.now() / 1000) - 3600;

  const { data: historyData } = useZabbixHistory(
    showHistory ? item.itemid : null,
    from,
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
            <LineChart
              series={[
                {
                  data: mapToCartesianSeries(historyValues, 3600),
                  color: "#0d9488",
                  label: item.name,
                },
              ]}
              height={60}
              unit={item.units === "%" ? "%" : undefined}
              timeRangeSeconds={3600}
              nowSec={Math.floor(Date.now() / 1000)}
            />
          ) : (
            <Text className="text-xs text-muted-foreground italic">
              Sem historico
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}
