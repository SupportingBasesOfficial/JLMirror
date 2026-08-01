// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback, useRef, useEffect, useMemo, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Gauge } from "@/components/gauge";
import { MultiSparkline } from "@/components/multi-sparkline";
import { MetricChart } from "@/components/metric-chart";
import type { ZabbixTrigger as ZabbixTriggerZabbix } from "@repo/zabbix";

const DiskSunburst = dynamic(() => import("@/components/disk-sunburst").then((m) => m.DiskSunburst), { ssr: false });

interface ZabbixItem {
  itemid: string;
  name: string;
  lastvalue: string;
  units: string;
  key_: string;
  hostid: string;
  value_type: number | string;
}

interface HistoryEntry {
  itemid: string;
  clock: number;
  value: string;
  ns: number;
}

type ZabbixTrigger = Pick<ZabbixTriggerZabbix, "triggerid" | "description" | "priority" | "value" | "lastchange" | "hosts">;

interface DeviceDetailClientProps {
  items: ZabbixItem[];
  hostId: string;
  hostName: string;
  hostIp: string;
  triggers?: ZabbixTrigger[];
}

const COLORS = {
  teal: "var(--brand-primary)",
  cyan: "var(--brand-secondary)",
  blue: "var(--status-info-text)",
  purple: "#8E7CFF",
  amber: "var(--status-warning-text)",
  red: "var(--status-error-text)",
  green: "var(--status-ok-text)",
  bg: "var(--surface-1)",
  card: "var(--surface-2)",
  border: "var(--border-default)",
  text: "var(--text-primary)",
  muted: "var(--text-muted)",
};

const CHART_COLORS = {
  teal: "#1BA898",
  cyan: "#35D0C4",
  blue: "#3AA0FF",
  purple: "#8E7CFF",
  purpleRead: "#B14EFF",
  amber: "#F5A623",
  red: "#E5484D",
  green: "#3DD68C",
};

const TIME_RANGES: Record<string, number> = {
  "5min": 300,
  "15min": 900,
  "1h": 3600,
  "6h": 21600,
  "24h": 86400,
  "7d": 604800,
};

const AUTO_REFRESH_INTERVAL = 30000;

type DeviceType = "windows-agent" | "linux-agent" | "snmp" | "unknown";

interface MetricCategory {
  key: string;
  label: string;
  items: ZabbixItem[];
}

// Detecta tipo de device baseado nos padroes de keys dos items
function detectDeviceType(items: ZabbixItem[]): DeviceType {
  const hasWmi = items.some((i) => i.key_.includes("wmi.get"));
  const hasPerfCounter = items.some((i) => i.key_.includes("perf_counter"));
  const hasLinuxAgent = items.some((i) => i.key_.startsWith("system.cpu.") && i.key_.includes("ssCpuRaw"));
  const hasSnmpNetIf = items.some((i) => i.key_.includes("ifHCInOctets"));
  const hasLinuxPaths = items.some((i) => i.key_.includes("vfs.fs.size[/"));
  const hasAgentNetIf = items.some((i) => i.key_.startsWith("net.if.") && !i.key_.includes("ifHC"));

  if (hasWmi || hasPerfCounter) return "windows-agent";
  if (hasLinuxAgent || (hasLinuxPaths && hasAgentNetIf)) return "linux-agent";
  if (hasSnmpNetIf) return "snmp";
  if (hasLinuxPaths) return "linux-agent";
  return "unknown";
}

const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  "windows-agent": "Windows Agent",
  "linux-agent": "Linux Agent",
  snmp: "SNMP",
  unknown: "Genérico",
};

// Categoriza todos os items em grupos logicos
function categorizeMetrics(items: ZabbixItem[]): MetricCategory[] {
  const categories: Record<string, ZabbixItem[]> = {};

  const getCategory = (key: string): string => {
    const k = key.toLowerCase();
    if (k.startsWith("system.cpu.") || k.startsWith("system.cpu[")) return "cpu";
    if (k.startsWith("vm.memory.") || k.startsWith("vm.memory[")) return "memory";
    if (k.startsWith("system.swap.") || k.startsWith("system.swap[")) return "swap";
    if (k.startsWith("net.if.") || k.startsWith("net.if[")) return "network";
    if (k.startsWith("vfs.fs.") || k.startsWith("vfs.fs[")) return "disk";
    if (k.startsWith("vfs.dev.")) return "disk-io";
    if (k.startsWith("system.uptime") || k.startsWith("system.uptime[")) return "system";
    if (k.startsWith("system.load") || k.startsWith("system.load[")) return "system";
    if (k.startsWith("system.cpu.switches") || k.startsWith("system.cpu.intr")) return "system";
    if (k.startsWith("system.hostname") || k.startsWith("system.uname")) return "system";
    if (k.startsWith("system.users") || k.startsWith("system.boot")) return "system";
    if (k.startsWith("icmpping")) return "connectivity";
    if (k.startsWith("wmi.get") || k.startsWith("perf_counter")) return "windows";
    if (k.startsWith("service.info") || k.startsWith("service.info[")) return "services";
    if (k.startsWith("proc.") || k.startsWith("proc[")) return "processes";
    if (k.startsWith("agent.") || k.startsWith("agent[")) return "agent";
    if (k.startsWith("eventlog") || k.startsWith("eventlog[")) return "windows-logs";
    if (k.startsWith("log") || k.startsWith("log[")) return "logs";
    if (k.startsWith("vfs.file") || k.startsWith("vfs.file[")) return "files";
    if (k.startsWith("sensor") || k.startsWith("sensor[")) return "sensors";
    if (k.startsWith("system.run") || k.startsWith("system.run[")) return "system";
    if (k.startsWith("web.") || k.startsWith("web[")) return "web";
    if (k.startsWith("zabbix.")) return "zabbix-internal";
    return "other";
  };

  for (const item of items) {
    const cat = getCategory(item.key_);
     
    if (!categories[cat]) categories[cat] = [];
     
    categories[cat].push(item);
  }

  const categoryLabels: Record<string, string> = {
    cpu: "CPU",
    memory: "Memória",
    swap: "Swap",
    network: "Rede",
    disk: "Disco",
    "disk-io": "I/O de Disco",
    system: "Sistema",
    connectivity: "Conectividade",
    windows: "Windows (WMI/PerfCounter)",
    services: "Serviços",
    processes: "Processos",
    agent: "Agente Zabbix",
    "windows-logs": "Event Logs (Windows)",
    logs: "Logs",
    files: "Arquivos",
    sensors: "Sensores",
    web: "Web",
    "zabbix-internal": "Zabbix Interno",
    other: "Outros",
  };

  return Object.entries(categories)
    .map(([key, items]) => {
       
      const label = categoryLabels[key] ?? key;
      return { key, label, items };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

function formatUptime(seconds: number): string {
  if (seconds >= 86400) {
    const days = Math.floor(seconds / 86400);
    return days + "d";
  }
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    return hours + "h";
  }
  return Math.floor(seconds / 60) + "m";
}

function findItem(items: ZabbixItem[], keyPattern: string): ZabbixItem | undefined {
  return items.find((i) => i.key_.includes(keyPattern));
}

function formatMetricValue(value: string, units: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value + units;
  if (units === "B") {
    if (num >= 1073741824) return (num / 1073741824).toFixed(2) + " GB";
    if (num >= 1048576) return (num / 1048576).toFixed(1) + " MB";
    if (num >= 1024) return (num / 1024).toFixed(1) + " KB";
    return num.toFixed(0) + " B";
  }
  if (units === "bps") {
    if (num >= 1000000000) return (num / 1000000000).toFixed(2) + " Gbps";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + " Mbps";
    if (num >= 1000) return (num / 1000).toFixed(1) + " Kbps";
    return num.toFixed(0) + " bps";
  }
  if (units === "%") return num.toFixed(2) + "%";
  if (units === "s") return num.toFixed(3) + "s";
  return num.toFixed(2) + units;
}

function triggerTimeAgo(lastchange: string): string {
  const diff = Math.floor(Date.now() / 1000) - parseInt(lastchange);
  if (diff < 60) return "agora";
  if (diff < 3600) return Math.floor(diff / 60) + "min";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  return Math.floor(diff / 86400) + "d";
}

const TRIGGER_PRIORITY_COLORS: Record<string, string> = {
  "0": "var(--status-ok-text)",
  "1": "var(--status-ok-text)",
  "2": "var(--status-warning-text)",
  "3": "var(--status-warning-text)",
  "4": "var(--status-error-text)",
  "5": "var(--status-error-text)",
};

const TRIGGER_PRIORITY_LABELS: Record<string, string> = {
  "0": "Info",
  "1": "Info",
  "2": "Aviso",
  "3": "Aviso",
  "4": "Crítico",
  "5": "Crítico",
};

export function DeviceDetailClient({
  items,
  hostId,
  hostName,
  hostIp,
  triggers = [],
}: DeviceDetailClientProps) {
  const [timeRange, setTimeRange] = useState<string>("1h");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sparkData, setSparkData] = useState<Record<string, number[]>>({});
  const [nowSec, setNowSec] = useState(0);

  // Device type + categorization
  const deviceType = detectDeviceType(items);
  const metricCategories = categorizeMetrics(items);

  // Prefs state — categorias fechadas por padrao
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>(
    metricCategories.map((c) => c.key)
  );
  const [hiddenMetrics, setHiddenMetrics] = useState<string[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Sincroniza categorias colapsadas quando metricCategories muda (ex: items carregam depois)
  const categoryKeys = metricCategories.map((c) => c.key).join(",");
  useEffect(() => {
    setCollapsedCategories((prev) => {
      const knownKeys = new Set(prev);
      const newCollapsed = metricCategories
        .map((c) => c.key)
        .filter((key) => !knownKeys.has(key));
      if (newCollapsed.length === 0) return prev;
      return [...prev, ...newCollapsed];
    });
  }, [categoryKeys]);

  // Garante que grupos de alertas ficam colapsados por padrao
  const triggerCount = triggers.length;
  useEffect(() => {
    if (triggerCount === 0) return;
    setCollapsedCategories((prev) => {
      const alertKeys = ["alert_critical", "alert_warning", "alert_info"];
      const knownKeys = new Set(prev);
      const newCollapsed = alertKeys.filter((key) => !knownKeys.has(key));
      if (newCollapsed.length === 0) return prev;
      return [...prev, ...newCollapsed];
    });
  }, [triggerCount]);

  // Carrega prefs ao montar
  useEffect(() => {
    let cancelled = false;
    async function loadPrefs() {
      try {
        const res = await fetch(`/api/zabbix/devices/${hostId}/prefs`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.prefs) {
          if (data.prefs.collapsed_categories !== undefined && data.prefs.collapsed_categories !== null) {
            const alertKeys = ["alert_critical", "alert_warning", "alert_info"];
            const prefKeys = data.prefs.collapsed_categories as string[];
            const merged = [...new Set([...prefKeys, ...alertKeys])];
            setCollapsedCategories(merged);
          }
          if (data.prefs.hidden_metrics !== undefined && data.prefs.hidden_metrics !== null) {
            setHiddenMetrics(data.prefs.hidden_metrics);
          }
        }
      } catch {
        // Silencioso — prefs sao opcionais
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    }
    loadPrefs();
    return () => { cancelled = true; };
  }, [hostId]);

  // Salva prefs quando alteradas (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePrefs = useCallback((collapsed: string[], hidden: string[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/zabbix/devices/${hostId}/prefs`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            device_type: deviceType,
            collapsed_categories: collapsed,
            hidden_metrics: hidden,
          }),
        });
      } catch {
        // Silencioso
      }
    }, 800);
  }, [hostId, deviceType]);

  const toggleCategoryCollapse = useCallback((catKey: string) => {
    setCollapsedCategories((prev) => {
      const next = prev.includes(catKey) ? prev.filter((c) => c !== catKey) : [...prev, catKey];
      savePrefs(next, hiddenMetrics);
      return next;
    });
  }, [hiddenMetrics, savePrefs]);

  const toggleMetricVisibility = useCallback((itemId: string) => {
    setHiddenMetrics((prev) => {
      const next = prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId];
      savePrefs(collapsedCategories, next);
      return next;
    });
  }, [collapsedCategories, savePrefs]);

  const cpuItem = findItem(items, "system.cpu.util");
  const memItem = findItem(items, "vm.memory.available") ?? findItem(items, "vm.memory.free");
  const memTotalItem = findItem(items, "vm.memory.total");
  const memUtilItem = findItem(items, "vm.memory.util");
  const memBuffersItem = findItem(items, "vm.memory.buffers");
  const memCachedItem = findItem(items, "vm.memory.cached");
  const uptimeItem = findItem(items, "system.uptime") ?? findItem(items, "uptime");
  const hwUptimeItem = items.find((i) => i.key_.startsWith("system.hw.uptime"));
  const netUptimeItem = items.find((i) => i.key_.startsWith("system.net.uptime"));
  const icmpPingItem = items.find((i) => i.key_ === "icmpping");
  const icmpLossItem = items.find((i) => i.key_ === "icmppingloss");
  const icmpSecItem = items.find((i) => i.key_ === "icmppingsec");
  const cpuNumItem = findItem(items, "system.cpu.num");
  const interruptsItem = findItem(items, "system.cpu.intr");
  const snmpAvailItem = items.find((i) => i.key_ === "zabbix[host,snmp,available]");
  const systemNameItem = items.find((i) => i.key_.startsWith("system.name"));
  const systemDescrItem = items.find((i) => i.key_.startsWith("system.descr"));
  const systemLocationItem = items.find((i) => i.key_.startsWith("system.location"));
  const systemContactItem = items.find((i) => i.key_.startsWith("system.contact"));
  const systemObjectIdItem = items.find((i) => i.key_.startsWith("system.objectid"));
  // Temperatura — sensor.temp ou system.hw.temp
  const tempItems = items.filter(
    (i) => i.key_.startsWith("sensor.temp") || i.key_.startsWith("system.hw.temp"),
  );
  // Portas TCP/UDP em escuta
  const tcpPortItems = items.filter(
    (i) => i.key_.startsWith("net.tcp.listen[") || i.key_.startsWith("net.tcp.port["),
  );
  const udpPortItems = items.filter(
    (i) => i.key_.startsWith("net.udp.listen[") || i.key_.startsWith("net.udp.port["),
  );
  // Certificados SSL
  const sslCertItems = items.filter(
    (i) => i.key_.startsWith("cert.") || i.key_.startsWith("web.test."),
  );
   
  const currentRangeSeconds = TIME_RANGES[timeRange] ?? 3600;
  const netInItem = findItem(items, "ifHCInOctets") ?? findItem(items, "net.if.in");
  const netOutItem = findItem(items, "ifHCOutOctets") ?? findItem(items, "net.if.out");

  // Disco — utilização por volume (universal: Windows C:/ Linux /)
  const fsItems = items.filter((i) => i.key_.startsWith("vfs.fs.size[") && i.key_.endsWith(",pused]"));
  const fsTotalItems = items.filter((i) => i.key_.startsWith("vfs.fs.size[") && i.key_.endsWith(",total]"));
  const fsUsedItems = items.filter((i) => i.key_.startsWith("vfs.fs.size[") && i.key_.endsWith(",used]"));
  const fsFreeItems = items.filter((i) => i.key_.startsWith("vfs.fs.size[") && i.key_.endsWith(",free]"));

  // Disco — IOPS, latência, fila (Agent only, nao disponivel em SNMP)
  const diskReadOpsItem = findItem(items, "vfs.dev.read.ops");
  const diskWriteOpsItem = findItem(items, "vfs.dev.write.ops");
  const diskReadLatItem = findItem(items, "vfs.dev.read.lat");
  const diskWriteLatItem = findItem(items, "vfs.dev.write.lat");
  const diskReadQueueItem = findItem(items, "vfs.dev.read.queue");
  const diskWriteQueueItem = findItem(items, "vfs.dev.write.queue");

  // CPU queue (load average) — Linux Agent tem system.cpu.load, SNMP nao tem
  const cpuLoadItem = items.find((i) => i.key_.startsWith("system.cpu.load[") && i.key_.includes("avg1"));

  // CPU breakdown — componentes de tempo de CPU (user, system, idle, iowait, etc.)
  // Filtra apenas items cujo nome contem "time" e cuja key contem ssCpuRaw (SNMP) ou começa com system.cpu. seguido de nome de componente
  const cpuBreakdownItems = items.filter(
    (i) =>
      i.key_.startsWith("system.cpu.") &&
      !i.key_.includes("util") &&
      !i.key_.includes("load") &&
      !i.key_.includes("switches") &&
      !i.key_.includes("intr") &&
      !i.key_.includes("num") &&
      i.name.toLowerCase().includes("time") &&
      parseFloat(i.lastvalue) >= 0 &&
      parseFloat(i.lastvalue) <= 100,
  );
  const cpuIdleItem = cpuBreakdownItems.find((i) => i.name.toLowerCase().includes("idle"));

  // Swap — Linux (system.swap.size[/,free]) e SNMP (system.swap.free[memAvailSwap.0], system.swap.pfree[snmp])
  const swapFreeItem = items.find(
    (i) =>
      (i.key_.startsWith("system.swap.size[") && (i.key_.endsWith(",free]") || i.key_.endsWith(",pfree]"))) ||
      i.key_.startsWith("system.swap.free["),
  );
  const swapPfreeItem = items.find(
    (i) => i.key_.startsWith("system.swap.") && i.key_.includes("pfree"),
  );

  // Memory details
  const memFreeItem = findItem(items, "vm.memory.free");

  // Network interfaces - agrupar por interface (extrai nome do item name para SNMP, ou do key para Agent)
  const netInterfaceItems = useMemo(
    () => items.filter((i) => i.key_.startsWith("net.if.")),
    [items],
  );
  const netInterfaceNames = useMemo(
    () =>
      Array.from(
        new Set(
          netInterfaceItems
            .map((i) => {
              const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
              if (nameMatch) return nameMatch[1];
              const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
              if (keyMatch) {
                const raw = keyMatch[1];
                const parts = raw.split(".");
                if (parts.length > 1) return `if.${parts[parts.length - 1]}`;
                return raw;
              }
              return null;
            })
            .filter((n): n is string => n !== null),
        ),
      ),
    [netInterfaceItems],
  );

  // Agrupa items de rede (in/out) por interface para o seletor do sparkline
  const netInterfacesByIface = netInterfaceNames.map((ifaceName) => {
    const inItem = netInterfaceItems.find((i) => {
      const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
      const extracted = nameMatch ? nameMatch[1] : (() => {
        const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
        if (!keyMatch) return null;
        const raw = keyMatch[1];
        const parts = raw.split(".");
        return parts.length > 1 ? `if.${parts[parts.length - 1]}` : raw;
      })();
      return extracted === ifaceName && (i.key_.includes("InOctets") || i.key_.startsWith("net.if.in"));
    });
    const outItem = netInterfaceItems.find((i) => {
      const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
      const extracted = nameMatch ? nameMatch[1] : (() => {
        const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
        if (!keyMatch) return null;
        const raw = keyMatch[1];
        const parts = raw.split(".");
        return parts.length > 1 ? `if.${parts[parts.length - 1]}` : raw;
      })();
      return extracted === ifaceName && (i.key_.includes("OutOctets") || i.key_.startsWith("net.if.out"));
    });
    return { ifaceName, inItem: inItem ?? null, outItem: outItem ?? null };
  }).filter((iface) => iface.inItem || iface.outItem);

  // Context switches
  const contextSwitchesItem = findItem(items, "system.cpu.switches");

  // Updates pendentes e reboot — Windows (wmi.get) ou Linux (apt/systemctl)
  const updatesPendingItem = items.find(
    (i) => (i.key_.includes("wmi.get") && i.name.toLowerCase().includes("update")) ||
           i.key_.includes("apt.update") || i.key_.includes("pkg.update"),
  );
  const rebootPendingItem = items.find(
    (i) => i.key_.includes("system.hw.reboot") ||
           (i.key_.includes("wmi.get") && i.name.toLowerCase().includes("reboot")) ||
           (i.key_.includes("system.run") && i.name.toLowerCase().includes("reboot")),
  );

  // Serviços — Windows (service.info) ou Linux (proc.num para daemon check)
  const serviceItems = items.filter(
    (i) => (i.key_.startsWith("service.info[") && i.key_.endsWith(",state]")) ||
           (i.key_.startsWith("proc.num[") && !i.key_.includes("zabbix")),
  );

  // Processos (top) — Agent only
  const procItems = items.filter((i) => i.key_.startsWith("proc.cpu.util[") || i.key_.startsWith("proc.mem["));

  const cpuValue = cpuItem ? parseFloat(cpuItem.lastvalue) : 0;
  const icmpPing = icmpPingItem ? parseFloat(icmpPingItem.lastvalue) === 1 : false;
  const icmpLoss = icmpLossItem ? parseFloat(icmpLossItem.lastvalue) : 0;
  const icmpSec = icmpSecItem ? parseFloat(icmpSecItem.lastvalue) : 0;
  const uptimeValue = uptimeItem ? parseFloat(uptimeItem.lastvalue) : 0;

  const [selectedItem, setSelectedItem] = useState<ZabbixItem | null>(
    cpuItem ?? items.find((i) => String(i.value_type) === "0" || String(i.value_type) === "3") ?? null,
  );
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [metricSearch, setMetricSearch] = useState("");
  const [selectedNetIface, setSelectedNetIface] = useState<string | null>(null);
  const mounted = useMounted();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHistory = useCallback(
    async (item: ZabbixItem, range: string, silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      const now = Math.floor(Date.now() / 1000);
      const seconds = TIME_RANGES[range as keyof typeof TIME_RANGES] ?? 3600;
      const from = now - seconds;

      try {
        let res = await fetch(
          `/api/zabbix/history?item_id=${item.itemid}&from=${from}&to=${now}&value_type=${item.value_type}`,
          { credentials: "include" },
        );
        // Retry em 401 — proxy pode ter renovado o cookie, aguarda e refaz
        if (res.status === 401) {
          await new Promise((r) => setTimeout(r, 500));
          res = await fetch(
            `/api/zabbix/history?item_id=${item.itemid}&from=${from}&to=${now}&value_type=${item.value_type}`,
            { credentials: "include" },
          );
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error?.message ?? "Erro ao buscar histórico");
          setHistory([]);
        } else {
          setHistory(data.data ?? []);
        }
      } catch {
        setError("Erro de conexão");
        setHistory([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [],
  );

  const fetchSparklines = useCallback(
    async (range: string) => {
      const now = Math.floor(Date.now() / 1000);
      setNowSec(now);
      const seconds = TIME_RANGES[range as keyof typeof TIME_RANGES] ?? 3600;
      const from = now - seconds;

      // Interface de rede selecionada (fallback para primeira)
      const allNetIfaces = netInterfaceNames.map((ifaceName) => {
        const inItem = netInterfaceItems.find((i) => {
          const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
          const extracted = nameMatch ? nameMatch[1] : (() => {
            const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
            if (!keyMatch) return null;
            const raw = keyMatch[1];
            const parts = raw.split(".");
            return parts.length > 1 ? `if.${parts[parts.length - 1]}` : raw;
          })();
          return extracted === ifaceName && (i.key_.includes("InOctets") || i.key_.startsWith("net.if.in"));
        });
        const outItem = netInterfaceItems.find((i) => {
          const nameMatch = i.name.match(/Interface\s+(\S+)\(\)/i);
          const extracted = nameMatch ? nameMatch[1] : (() => {
            const keyMatch = i.key_.match(/net\.if\.\w+\[([^\]]+)\]/);
            if (!keyMatch) return null;
            const raw = keyMatch[1];
            const parts = raw.split(".");
            return parts.length > 1 ? `if.${parts[parts.length - 1]}` : raw;
          })();
          return extracted === ifaceName && (i.key_.includes("OutOctets") || i.key_.startsWith("net.if.out"));
        });
        return { ifaceName, inItem: inItem ?? null, outItem: outItem ?? null };
      }).filter((iface) => iface.inItem || iface.outItem);

      const selectedIface = allNetIfaces.find(
        (iface) => iface.ifaceName === selectedNetIface,
      ) ?? allNetIfaces[0];

      const sparkItems = [
        { key: "cpu", item: cpuItem },
        { key: "cpuLoad", item: cpuLoadItem },
        { key: "memUtil", item: memUtilItem },
        { key: "memAvailable", item: memItem },
        { key: "memBuffers", item: memBuffersItem },
        { key: "memCached", item: memCachedItem },
        { key: "netIn", item: selectedIface?.inItem ?? netInItem },
        { key: "netOut", item: selectedIface?.outItem ?? netOutItem },
        { key: "diskReadOps", item: diskReadOpsItem },
        { key: "diskWriteOps", item: diskWriteOpsItem },
        { key: "diskReadLat", item: diskReadLatItem },
        { key: "diskWriteLat", item: diskWriteLatItem },
        { key: "diskReadQueue", item: diskReadQueueItem },
        { key: "diskWriteQueue", item: diskWriteQueueItem },
      ].filter((s) => s.item);

      for (const s of sparkItems) {
        if (!s.item) continue;
        try {
          let res = await fetch(
            `/api/zabbix/history?item_id=${s.item.itemid}&from=${from}&to=${now}&value_type=${s.item.value_type}`,
            { credentials: "include" },
          );
          // Retry em 401 — proxy pode ter renovado o cookie
          if (res.status === 401) {
            await new Promise((r) => setTimeout(r, 500));
            res = await fetch(
              `/api/zabbix/history?item_id=${s.item.itemid}&from=${from}&to=${now}&value_type=${s.item.value_type}`,
              { credentials: "include" },
            );
          }
          const data = await res.json();
          if (res.ok && data.data) {
            setSparkData((prev) => ({
              ...prev,
              [s.key]: data.data.map((h: HistoryEntry) => parseFloat(h.value)),
            }));
          }
        } catch {
          // Ignora erros individuais de sparkline
        }
      }
    },
    [cpuItem, cpuLoadItem, memUtilItem, memItem, memBuffersItem, memCachedItem, netInItem, netOutItem, selectedNetIface, netInterfaceNames, netInterfaceItems, diskReadOpsItem, diskWriteOpsItem, diskReadLatItem, diskWriteLatItem, diskReadQueueItem, diskWriteQueueItem],
  );

  const handleItemChange = (itemid: string) => {
    const item = items.find((i) => i.itemid === itemid);
    if (item) {
      setSelectedItem(item);
      fetchHistory(item, timeRange);
    }
  };

  const handleRangeChange = (range: string) => {
    setTimeRange(range);
    if (selectedItem) {
      fetchHistory(selectedItem, range);
    }
    fetchSparklines(range);
  };

  const handleRefresh = useCallback((silent = false) => {
    if (selectedItem) {
      fetchHistory(selectedItem, timeRange, silent);
    }
    fetchSparklines(timeRange);
    setLastUpdate(new Date().toLocaleTimeString("pt-BR"));
  }, [selectedItem, timeRange, fetchHistory, fetchSparklines]);

  useEffect(() => {
    if (selectedItem) {
       
      fetchHistory(selectedItem, timeRange);
    }
    fetchSparklines(timeRange);
  }, [selectedItem, timeRange, fetchHistory, fetchSparklines]);

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      handleRefresh(true);
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, handleRefresh]);

  const chartData = history.map((h) => ({
    clock: h.clock,
    value: parseFloat(h.value),
    time: new Date(h.clock * 1000).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  const numericItems = items.filter(
    (i) => String(i.value_type) === "0" || String(i.value_type) === "3",
  );

  const kpiCards = [
    // 1. Conectividade e saúde do agente
    {
      label: "ICMP PING",
      value: icmpPing ? "OK" : "FALHA",
      color: icmpPing ? CHART_COLORS.green : CHART_COLORS.red,
      sub: icmpLoss > 0 ? `Perda: ${icmpLoss.toFixed(1)}%` : "Sem perda",
      show: !!icmpPingItem,
    },
    {
      label: "SNMP AGENT",
      value: snmpAvailItem ? (parseFloat(snmpAvailItem.lastvalue) === 1 ? "OK" : "INDISPONÍVEL") : "N/A",
      color: snmpAvailItem ? (parseFloat(snmpAvailItem.lastvalue) === 1 ? CHART_COLORS.green : CHART_COLORS.red) : COLORS.muted,
      sub: "Disponibilidade do agente",
      show: !!snmpAvailItem,
    },
    {
      label: "LATÊNCIA",
      value: icmpSec > 0 ? icmpSec.toFixed(3) + "s" : "N/A",
      color: CHART_COLORS.blue,
      sub: "Tempo de resposta ICMP",
      show: !!icmpSecItem,
    },
    {
      label: "UPTIME",
      value: uptimeValue > 0 ? formatUptime(uptimeValue) : hwUptimeItem ? formatUptime(parseFloat(hwUptimeItem.lastvalue)) : netUptimeItem ? formatUptime(parseFloat(netUptimeItem.lastvalue)) : "N/A",
      color: CHART_COLORS.blue,
      sub: hwUptimeItem ? "Uptime de hardware" : netUptimeItem ? "Uptime de rede" : "Tempo de atividade",
      show: !!(uptimeItem || hwUptimeItem || netUptimeItem),
    },
    // 2. Recursos core
    {
      label: "CPU",
      value: cpuValue.toFixed(1) + "%",
      color: CHART_COLORS.teal,
      sub: cpuNumItem ? `${parseFloat(cpuNumItem.lastvalue).toFixed(0)} núcleo(s)` : "Utilização atual",
      show: !!cpuItem,
    },
    {
      label: "SWAP",
      value: swapPfreeItem ? (100 - parseFloat(swapPfreeItem.lastvalue)).toFixed(1) + "%" : swapFreeItem ? formatBytes(parseFloat(swapFreeItem.lastvalue)) : "N/A",
      color: CHART_COLORS.purple,
      sub: swapPfreeItem ? "Swap em uso" : "Swap livre",
      show: !!(swapPfreeItem || swapFreeItem),
    },
    // 3. Diagnóstico de performance
    {
      label: "INTERRUPTS",
      value: interruptsItem ? parseFloat(interruptsItem.lastvalue).toFixed(0) + "/s" : "N/A",
      color: CHART_COLORS.teal,
      sub: "Interrupções por segundo",
      show: !!interruptsItem,
    },
    {
      label: "CONTEXT SWITCHES",
      value: contextSwitchesItem ? parseFloat(contextSwitchesItem.lastvalue).toFixed(0) + "/s" : "N/A",
      color: CHART_COLORS.blue,
      sub: "Trocas de contexto/s",
      show: !!contextSwitchesItem,
    },
    // 4. Temperatura (se disponível)
    ...(tempItems.length > 0 ? [{
      label: "TEMPERATURA",
      value: (() => {
        const t = tempItems[0];
        const v = parseFloat(t.lastvalue);
        if (Number.isNaN(v)) return "N/A";
        const unit = t.units || "°C";
        return `${v.toFixed(1)}${unit}`;
      })(),
      color: (() => {
        const v = parseFloat(tempItems[0].lastvalue);
        if (!Number.isNaN(v) && v >= 70) return CHART_COLORS.red;
        if (!Number.isNaN(v) && v >= 55) return CHART_COLORS.amber;
        return CHART_COLORS.green;
      })(),
      sub: tempItems.length > 1 ? `${tempItems.length} sensores` : tempItems[0].name.replace(/.*temperature/i, "").trim() || "Sensor de temperatura",
      show: true,
    }] : []),
    // 5. Portas TCP/UDP
    ...(tcpPortItems.length > 0 || udpPortItems.length > 0 ? [{
      label: "PORTAS TCP/UDP",
      value: `${tcpPortItems.length}/${udpPortItems.length}`,
      color: CHART_COLORS.teal,
      sub: `TCP ${tcpPortItems.filter((p) => parseFloat(p.lastvalue) === 1).length} ativas · UDP ${udpPortItems.filter((p) => parseFloat(p.lastvalue) === 1).length} ativas`,
      show: true,
    }] : []),
    // 6. Certificados SSL
    ...(sslCertItems.length > 0 ? [{
      label: "CERTIFICADOS SSL",
      value: (() => {
        const valid = sslCertItems.filter((c) => {
          const v = parseFloat(c.lastvalue);
          return !Number.isNaN(v) && v > 0;
        }).length;
        return `${valid}/${sslCertItems.length}`;
      })(),
      color: (() => {
        const invalid = sslCertItems.filter((c) => {
          const v = parseFloat(c.lastvalue);
          return Number.isNaN(v) || v <= 0;
        }).length;
        return invalid > 0 ? CHART_COLORS.red : CHART_COLORS.green;
      })(),
      sub: sslCertItems.length > 1 ? `${sslCertItems.length} certificados monitorados` : sslCertItems[0].name,
      show: true,
    }] : []),
    // 7. Sistema e manutenção
    {
      label: "MÉTRICAS",
      value: items.length.toString(),
      color: CHART_COLORS.amber,
      sub: "Total coletadas",
      show: true,
    },
    {
      label: "UPDATES PEND.",
      value: updatesPendingItem ? updatesPendingItem.lastvalue : "N/A",
      color: CHART_COLORS.amber,
      sub: "Atualizações do Windows",
      show: !!updatesPendingItem,
    },
    {
      label: "REINICIALIZAÇÃO",
      value: rebootPendingItem ? (parseFloat(rebootPendingItem.lastvalue) > 0 ? "SIM" : "NÃO") : "N/A",
      color: rebootPendingItem && parseFloat(rebootPendingItem.lastvalue) > 0 ? CHART_COLORS.red : CHART_COLORS.green,
      sub: "Pendente?",
      show: !!rebootPendingItem,
    },
  ].filter((k) => k.show);

  return (
    <div
      className="rounded-xl p-4 sm:p-6 space-y-4"
      style={{
        background: COLORS.bg,
        fontFamily: "'JetBrains Mono','Consolas',monospace",
      }}
    >
      <style>{`@keyframes jlblink { 0%{opacity:1} 50%{opacity:0.2} 100%{opacity:1} }`}</style>
      {/* Header */}
      <div className="flex flex-col gap-3 mb-3.5">
        {/* Row 1: title + auto-refresh + last update */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm font-medium" style={{ color: COLORS.text }}>
            Painel Executivo — {hostName}
          </div>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-[13px] transition-colors"
            style={{ background: autoRefresh ? "var(--status-ok-bg)" : COLORS.card,
              color: autoRefresh ? CHART_COLORS.green : COLORS.muted,
              borderColor: autoRefresh ? "var(--status-ok-border)" : COLORS.border,
              cursor: "pointer",
            }}
          >
            {autoRefresh && (
              <span
                className="inline-block rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: CHART_COLORS.green,
                  animation: "jlblink 0.9s infinite",
                }}
              />
            )}
            {autoRefresh ? "AO VIVO" : "PAUSADO"}
          </button>
          {mounted && lastUpdate && (
            <span className="text-[12px]" style={{ color: COLORS.muted }}>
              Atualizado: {lastUpdate}
            </span>
          )}
        </div>
        {/* Row 2: badges + time ranges + back */}
        <div className="flex items-center gap-2 text-[13px] flex-wrap">
          <span
            className="px-2.5 py-1 rounded border"
            style={{ background: COLORS.card, color: COLORS.muted, borderColor: COLORS.border }}
          >
            IP: {hostIp}
          </span>
          <span
            className="px-2.5 py-1 rounded border"
            style={{ background: COLORS.card, color: COLORS.muted, borderColor: COLORS.border }}
          >
            Host ID: {hostId}
          </span>
          <span
            className="px-2.5 py-1 rounded border font-bold text-[12px]"
            style={{
              background: deviceType === "unknown" ? COLORS.card : "var(--brand-glow)",
              color: deviceType === "unknown" ? COLORS.muted : COLORS.teal,
              borderColor: deviceType === "unknown" ? COLORS.border : "var(--brand-border)",
            }}
          >
            { }
            {DEVICE_TYPE_LABELS[deviceType]}
          </span>
          <div className="flex gap-1 ml-auto flex-wrap">
            {Object.keys(TIME_RANGES).map((range) => (
              <button
                key={range}
                onClick={() => handleRangeChange(range)}
                className="px-2.5 py-1 rounded border transition-colors"
                style={{
                  background: timeRange === range ? COLORS.teal : COLORS.card,
                  color: timeRange === range ? "var(--surface-1)" : COLORS.muted,
                  borderColor: COLORS.border,
                  cursor: "pointer",
                }}
              >
                {range}
              </button>
            ))}
          </div>
          <a
            href="/dashboard"
            className="px-2.5 py-1 rounded border no-underline"
            style={{ background: COLORS.card, color: COLORS.text, borderColor: COLORS.border }}
          >
            ← Voltar
          </a>
        </div>
      </div>

      {/* INFORMAÇÕES DO SISTEMA */}
      {(systemNameItem || systemDescrItem || systemLocationItem || systemContactItem || systemObjectIdItem) && (
        <>
          <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
            INFORMAÇÕES DO SISTEMA
          </div>
          <div className="rounded-md p-4 mb-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            {/* Nome do sistema em destaque */}
            {systemNameItem && (
              <div className="pb-3 mb-3" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <div className="text-[11px] font-bold mb-1" style={{ color: COLORS.muted }}>NOME DO SISTEMA</div>
                <div className="text-[14px] font-bold" style={{ color: CHART_COLORS.teal }}>{systemNameItem.lastvalue}</div>
              </div>
            )}
            {/* Descricao com parse de OS e kernel */}
            {systemDescrItem && (
              <div className="pb-3 mb-3" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <div className="text-[11px] font-bold mb-1.5" style={{ color: COLORS.muted }}>SISTEMA OPERACIONAL</div>
                {(() => {
                  const descr = systemDescrItem.lastvalue;
                  const osMatch = descr.match(/^(Linux|Windows|FreeBSD|OpenBSD|SunOS|AIX|HP-UX|Darwin)/i);
                  const kernelMatch = descr.match(/(\d+\.\d+\.\d+[\w.\-]*)/);
                  const archMatch = descr.match(/(x86_64|i386|i686|armv\w+|aarch64)/i);
                  const osName = osMatch ? osMatch[1] : "Desconhecido";
                  const kernel = kernelMatch ? kernelMatch[1] : null;
                  const arch = archMatch ? archMatch[1] : null;
                  return (
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[12px] px-2 py-0.5 rounded" style={{ background: "var(--brand-glow)", color: COLORS.teal, fontWeight: "bold" }}>
                        {osName}
                      </span>
                      {kernel && (
                        <span className="text-[12px] px-2 py-0.5 rounded" style={{ background: "var(--status-info-bg)", color: COLORS.blue }}>
                          Kernel {kernel}
                        </span>
                      )}
                      {arch && (
                        <span className="text-[12px] px-2 py-0.5 rounded" style={{ background: "rgba(142, 124, 255, 0.15)", color: COLORS.purple }}>
                          {arch}
                        </span>
                      )}
                      <span className="text-[11px]" style={{ color: COLORS.muted, wordBreak: "break-word", flex: "1 1 100%", marginTop: 4 }}>
                        {descr}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
            {/* Grid de informacoes secundarias */}
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              {systemLocationItem && (
                <div className="flex items-center gap-2">
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: CHART_COLORS.amber, display: "inline-block", flexShrink: 0 }} />
                  <div>
                    <div className="text-[10px]" style={{ color: COLORS.muted }}>Localização</div>
                    <div className="text-[12px]" style={{ color: COLORS.text }}>{systemLocationItem.lastvalue}</div>
                  </div>
                </div>
              )}
              {systemContactItem && (
                <div className="flex items-center gap-2">
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: CHART_COLORS.green, display: "inline-block", flexShrink: 0 }} />
                  <div>
                    <div className="text-[10px]" style={{ color: COLORS.muted }}>Contato</div>
                    <div className="text-[12px]" style={{ color: COLORS.text }}>{systemContactItem.lastvalue}</div>
                  </div>
                </div>
              )}
              {systemObjectIdItem && (
                <div className="flex items-center gap-2">
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: CHART_COLORS.blue, display: "inline-block", flexShrink: 0 }} />
                  <div>
                    <div className="text-[10px]" style={{ color: COLORS.muted }}>Object ID (SNMP)</div>
                    <div className="text-[12px]" style={{ color: COLORS.text, fontFamily: "'JetBrains Mono','Consolas',monospace" }}>{systemObjectIdItem.lastvalue}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ALERTAS ATIVOS — agrupados por severidade, colapsáveis */}
      {triggers.length > 0 && (() => {
        const criticalTriggers = triggers.filter((t) => t.priority === "4" || t.priority === "5");
        const warningTriggers = triggers.filter((t) => t.priority === "2" || t.priority === "3");
        const infoTriggers = triggers.filter((t) => t.priority === "0" || t.priority === "1");
        const groups: { key: string; label: string; color: string; items: typeof triggers }[] = [
          { key: "alert_critical", label: "Críticos", color: "var(--status-error-text)", items: criticalTriggers },
          { key: "alert_warning", label: "Avisos", color: "var(--status-warning-text)", items: warningTriggers },
          { key: "alert_info", label: "Informações", color: "var(--text-muted)", items: infoTriggers },
        ].filter((g) => g.items.length > 0);
        return (
          <div className="space-y-2">
            <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
              ALERTAS ATIVOS ({triggers.length})
            </div>
            {groups.map((g) => {
              const isCollapsed = collapsedCategories.includes(g.key);
              return (
                <div key={g.key} className="rounded-md overflow-hidden" style={{ border: `1px solid color-mix(in srgb, ${g.color} 20%, transparent)` }}>
                  <button
                    onClick={() => toggleCategoryCollapse(g.key)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 transition-colors"
                    style={{ background: COLORS.card }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="text-[12px] transition-transform inline-block"
                        style={{ color: COLORS.muted, transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                      >
                        ▼
                      </span>
                      <span className="rounded-full" style={{ width: 8, height: 8, background: g.color, boxShadow: `0 0 6px color-mix(in srgb, ${g.color} 33%, transparent)` }} />
                      <span className="text-sm font-bold uppercase tracking-wider" style={{ color: g.color }}>
                        {g.label}
                      </span>
                      <span className="text-[10px]" style={{ color: COLORS.muted }}>
                        ({g.items.length})
                      </span>
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-1.5 p-2">
                      {g.items.map((t) => {
                        const color = TRIGGER_PRIORITY_COLORS[t.priority] ?? COLORS.green;
                        const label = TRIGGER_PRIORITY_LABELS[t.priority] ?? "Info";
                        const ago = triggerTimeAgo(t.lastchange);
                        return (
                          <div
                            key={t.triggerid}
                            className="rounded-md p-3 flex items-center gap-3"
                            style={{ background: COLORS.card, border: `1px solid color-mix(in srgb, ${color} 20%, transparent)` }}
                          >
                            <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: color, boxShadow: `0 0 6px color-mix(in srgb, ${color} 33%, transparent)` }} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: COLORS.text }}>
                                {t.description}
                              </div>
                              <div className="text-[12px] mt-0.5" style={{ color: COLORS.muted }}>
                                há {ago}
                              </div>
                            </div>
                            <span
                              className="text-[12px] font-bold uppercase px-2 py-0.5 rounded shrink-0"
                              style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}
                            >
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* GRÁFICO DETALHADO — TOPO */}
      <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
        GRÁFICO DETALHADO
      </div>
      <div
        className="rounded-md p-3.5 mb-4 flex flex-wrap items-center gap-3.5"
        style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="metric-select"
            className="text-xs font-medium"
            style={{ color: COLORS.muted }}
          >
            Métrica
          </label>
          <select
            id="metric-select"
            value={selectedItem?.itemid ?? ""}
            onChange={(e) => handleItemChange(e.target.value)}
            className="rounded-md px-3 py-1.5 text-sm focus:outline-none"
            style={{
              background: COLORS.bg,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {numericItems.map((item) => (
              <option key={item.itemid} value={item.itemid}>
                {item.name} ({formatMetricValue(item.lastvalue, item.units)})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => handleRefresh()}
          disabled={loading}
          className="ml-auto rounded-md px-3 py-1.5 text-sm transition-opacity disabled:opacity-50"
          style={{
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
            background: COLORS.bg,
            cursor: "pointer",
          }}
        >
          {loading ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      {error ? (
        <div
          className="rounded-md p-4 mb-4"
          style={{ border: "1px solid var(--status-error-border)", background: "var(--status-error-bg)" }}
        >
          <p className="text-sm" style={{ color: COLORS.red }}>{error}</p>
        </div>
      ) : (
        <div className="mb-4">
          <MetricChart
            data={chartData}
            metricName={selectedItem?.name ?? "Métrica"}
            units={selectedItem?.units ?? ""}
          />
        </div>
      )}

      {/* VISÃO GERAL */}
      <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
        VISÃO GERAL
      </div>
      <div
        className="grid gap-2.5 mb-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
      >
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="rounded-md p-3" style={{ background: COLORS.card }}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="rounded-sm" style={{ width: 8, height: 8, background: kpi.color }} />
              <span className="text-[12px] font-bold" style={{ color: COLORS.muted }}>
                {kpi.label}
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color: kpi.color }}>
              {kpi.value}
            </div>
            <div className="text-[11px] mt-1" style={{ color: COLORS.muted }}>
              {kpi.sub}
            </div>
          </div>
        ))}
      </div>

      {/* DESEMPENHO */}
      <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
        DESEMPENHO
      </div>
      {/* Gauges de CPU e Memória lado a lado */}
      <div className="grid gap-2.5 mb-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {cpuItem && (
          <Gauge
            value={cpuValue}
            label="CPU"
            color={CHART_COLORS.teal}
            tooltip={{
              title: "UTILIZAÇÃO DE CPU",
              lines: [
                `Em uso: <b style="color:${CHART_COLORS.teal}">${cpuValue.toFixed(2)}%</b>`,
                cpuIdleItem ? `Ocioso: <b style="color:${CHART_COLORS.green}">${parseFloat(cpuIdleItem.lastvalue).toFixed(2)}%</b>` : "",
                cpuNumItem ? `Núcleos: <b style="color:${CHART_COLORS.teal}">${parseFloat(cpuNumItem.lastvalue).toFixed(0)}</b>` : "",
                cpuLoadItem ? `Load avg (1m): <b style="color:${CHART_COLORS.teal}">${parseFloat(cpuLoadItem.lastvalue).toFixed(2)}</b>` : "",
                interruptsItem ? `Interrupts: <b style="color:${CHART_COLORS.teal}">${parseFloat(interruptsItem.lastvalue).toFixed(0)}/s</b>` : "",
                contextSwitchesItem ? `Context switches: <b style="color:${CHART_COLORS.teal}">${parseFloat(contextSwitchesItem.lastvalue).toFixed(0)}/s</b>` : "",
              ].filter(Boolean),
            }}
          />
        )}
        {memItem && (
          <Gauge
            value={
              memUtilItem
                ? parseFloat(memUtilItem.lastvalue)
                : memTotalItem
                  ? 100 - (parseFloat(memItem.lastvalue) / parseFloat(memTotalItem.lastvalue)) * 100
                  : 0
            }
            max={100}
            label="RAM"
            color={CHART_COLORS.cyan}
            unit="%"
            tooltip={{
              title: "UTILIZAÇÃO DE RAM",
              lines: [
                `Disponível: <b style="color:${CHART_COLORS.cyan}">${formatBytes(parseFloat(memItem.lastvalue))}</b>`,
                memTotalItem ? `Total: <b style="color:${CHART_COLORS.cyan}">${formatBytes(parseFloat(memTotalItem.lastvalue))}</b>` : "",
                memUtilItem ? `Em uso: <b style="color:${CHART_COLORS.cyan}">${parseFloat(memUtilItem.lastvalue).toFixed(1)}%</b>` : "",
              ].filter(Boolean),
            }}
          />
        )}
      </div>
      {/* CPU ao longo do tempo — MultiSparkline */}
      {cpuItem && (sparkData.cpu ?? []).length > 0 && (
        <div className="mb-2.5">
          <MultiSparkline
            series={[
              { data: sparkData.cpu ?? [], color: CHART_COLORS.teal, label: "CPU (%)" },
            ]}
            height={140}
            unit="%"
            timeRangeSeconds={currentRangeSeconds}
            nowSec={nowSec}
            thresholds={[
              { value: 80, color: CHART_COLORS.amber, label: "80%" },
              { value: 95, color: CHART_COLORS.red, label: "95%" },
            ]}
          />
        </div>
      )}
      {/* RAM ao longo do tempo — MultiSparkline */}
      {memItem && (sparkData.memUtil ?? []).length > 0 && (
        <div className="mb-2.5">
          <MultiSparkline
            series={[
              { data: sparkData.memUtil ?? [], color: CHART_COLORS.cyan, label: "RAM em uso (%)" },
              { data: sparkData.memAvailable ?? [], color: CHART_COLORS.green, label: "RAM disponível" },
              ...(memBuffersItem ? [{ data: sparkData.memBuffers ?? [], color: CHART_COLORS.amber, label: "Buffers" }] : []),
              ...(memCachedItem ? [{ data: sparkData.memCached ?? [], color: CHART_COLORS.purple, label: "Cached" }] : []),
            ]}
            height={140}
            formatValue={(v) => (v <= 100 ? `${v.toFixed(1)}%` : formatBytes(v))}
            timeRangeSeconds={currentRangeSeconds}
            nowSec={nowSec}
            thresholds={[
              { value: 80, color: CHART_COLORS.amber, label: "80%" },
              { value: 95, color: CHART_COLORS.red, label: "95%" },
            ]}
          />
        </div>
      )}
      {/* Fila de CPU (load average) — MultiSparkline */}
      {cpuLoadItem && (sparkData.cpuLoad ?? []).length > 0 && (
        <div className="mb-4">
          <MultiSparkline
            series={[
              { data: sparkData.cpuLoad ?? [], color: CHART_COLORS.purple, label: "Fila de CPU (load avg)" },
            ]}
            height={100}
            timeRangeSeconds={currentRangeSeconds}
            nowSec={nowSec}
          />
        </div>
      )}

      {/* REDE — TRÁFEGO DE INTERFACE */}
      {(netInItem || netOutItem) && (
        <>
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
              REDE — TRÁFEGO DE INTERFACE
            </div>
            {netInterfacesByIface.length > 1 && (
              <select
                value={selectedNetIface ?? netInterfacesByIface[0]?.ifaceName ?? ""}
                onChange={(e) => {
                  setSelectedNetIface(e.target.value);
                  setSparkData((prev) => ({ ...prev, netIn: [], netOut: [] }));
                }}
                className="text-[12px] px-2 py-1 rounded border"
                style={{
                  background: COLORS.card,
                  color: COLORS.text,
                  borderColor: COLORS.border,
                  cursor: "pointer",
                }}
              >
                {netInterfacesByIface.map((iface) => (
                  <option key={iface.ifaceName} value={iface.ifaceName}>
                    {iface.ifaceName.startsWith("if.") ? `Interface #${iface.ifaceName.replace("if.", "")}` : iface.ifaceName}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="mb-4">
            <MultiSparkline
              series={[
                { data: sparkData.netIn ?? [], color: CHART_COLORS.purpleRead, label: "Recebido (in)" },
                { data: sparkData.netOut ?? [], color: CHART_COLORS.amber, label: "Enviado (out)" },
              ]}
              height={140}
              timeRangeSeconds={currentRangeSeconds}
              nowSec={nowSec}
              formatValue={(v) => {
                if (v >= 1000000000) return (v / 1000000000).toFixed(2) + " Gbps";
                if (v >= 1000000) return (v / 1000000).toFixed(1) + " Mbps";
                if (v >= 1000) return (v / 1000).toFixed(1) + " Kbps";
                return v.toFixed(0) + " bps";
              }}
            />
          </div>
        </>
      )}

      {/* CPU BREAKDOWN — COMPOSIÇÃO DE CPU */}
      {cpuBreakdownItems.length > 0 && (
        <>
          <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
            COMPOSIÇÃO DE CPU — DETALHAMENTO POR COMPONENTE
          </div>
          <div className="rounded-md p-3.5 mb-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            {/* CPU ociosa em destaque */}
            {cpuIdleItem && (
              <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <span className="text-[12px] font-bold" style={{ color: COLORS.muted }}>
                  CPU OCIOSA
                </span>
                <span className="text-[14px] font-bold" style={{ color: COLORS.green }}>
                  {parseFloat(cpuIdleItem.lastvalue).toFixed(2)}%
                  <span className="text-[11px] font-normal ml-1.5" style={{ color: COLORS.muted }}>
                    (% ocioso do tempo total)
                  </span>
                </span>
              </div>
            )}
            {/* Barras apenas para componentes ativos */}
            <div className="flex flex-col gap-2.5">
              {cpuBreakdownItems
                .filter((cpu) => !cpu.name.toLowerCase().includes("idle"))
                .sort((a, b) => parseFloat(b.lastvalue) - parseFloat(a.lastvalue))
                .map((cpu) => {
                  const labelMatch = cpu.name.match(/CPU\s+(.+?)\s+time/i);
                  const label = labelMatch ? labelMatch[1] : cpu.name.replace("CPU ", "");
                  const val = parseFloat(cpu.lastvalue);
                  const barColor = val > 50 ? CHART_COLORS.red : val > 20 ? CHART_COLORS.amber : val > 5 ? CHART_COLORS.teal : CHART_COLORS.green;
                  return (
                    <div key={cpu.itemid} className="flex items-center gap-3">
                      <span className="text-[12px] font-medium shrink-0" style={{ color: COLORS.text, width: 90, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {label}
                      </span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                        <div
                          className="h-2 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(val, 100)}%`, background: barColor }}
                        />
                      </div>
                      <span className="text-[12px] font-bold shrink-0" style={{ color: barColor, width: 55, textAlign: "right" }}>
                        {val.toFixed(2)}%
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}

      {/* MEMÓRIA E SWAP — DETALHES */}
      {(memItem || swapFreeItem || swapPfreeItem) && (
        <>
          <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
            MEMÓRIA E SWAP — DETALHES
          </div>
          <div className="grid gap-2.5 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {/* Memoria detalhada */}
            {memItem && (
              <div className="rounded-md p-3.5" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                <div className="text-[11px] font-bold mb-3" style={{ color: COLORS.muted }}>MEMÓRIA RAM</div>
                <div className="flex flex-col gap-2">
                  {memTotalItem && (
                    <div className="flex justify-between text-[12px]">
                      <span style={{ color: COLORS.muted }}>Total</span>
                      <span style={{ color: COLORS.text, fontWeight: "bold" }}>{formatBytes(parseFloat(memTotalItem.lastvalue))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[12px]">
                    <span style={{ color: COLORS.muted }}>Disponível</span>
                    <span style={{ color: CHART_COLORS.cyan, fontWeight: "bold" }}>{formatBytes(parseFloat(memItem.lastvalue))}</span>
                  </div>
                  {memFreeItem && (
                    <div className="flex justify-between text-[12px]">
                      <span style={{ color: COLORS.muted }}>Livre</span>
                      <span style={{ color: CHART_COLORS.green, fontWeight: "bold" }}>{formatBytes(parseFloat(memFreeItem.lastvalue))}</span>
                    </div>
                  )}
                  {memTotalItem && (
                    <div className="flex justify-between text-[12px]">
                      <span style={{ color: COLORS.muted }}>Em uso</span>
                      <span style={{ color: CHART_COLORS.amber, fontWeight: "bold" }}>{formatBytes(parseFloat(memTotalItem.lastvalue) - parseFloat(memItem.lastvalue))}</span>
                    </div>
                  )}
                  {memUtilItem && (
                    <div className="mt-1">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${parseFloat(memUtilItem.lastvalue)}%`, background: CHART_COLORS.cyan }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Swap detalhado */}
            {(swapFreeItem || swapPfreeItem) && (
              <div className="rounded-md p-3.5" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                <div className="text-[11px] font-bold mb-3" style={{ color: COLORS.muted }}>SWAP</div>
                <div className="flex flex-col gap-2">
                  {swapPfreeItem && (
                    <>
                      <div className="flex justify-between text-[12px]">
                        <span style={{ color: COLORS.muted }}>Em uso</span>
                        <span style={{ color: CHART_COLORS.purple, fontWeight: "bold" }}>{(100 - parseFloat(swapPfreeItem.lastvalue)).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span style={{ color: COLORS.muted }}>Livre</span>
                        <span style={{ color: CHART_COLORS.green, fontWeight: "bold" }}>{parseFloat(swapPfreeItem.lastvalue).toFixed(1)}%</span>
                      </div>
                      <div className="mt-1">
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${100 - parseFloat(swapPfreeItem.lastvalue)}%`, background: CHART_COLORS.purple }} />
                        </div>
                      </div>
                    </>
                  )}
                  {swapFreeItem && !swapPfreeItem && (
                    <div className="flex justify-between text-[12px]">
                      <span style={{ color: COLORS.muted }}>Livre</span>
                      <span style={{ color: CHART_COLORS.green, fontWeight: "bold" }}>{formatBytes(parseFloat(swapFreeItem.lastvalue))}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* REDE — DETALHES POR INTERFACE */}
      {netInterfaceNames.length > 0 && (
        <>
          <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
            REDE — DETALHES POR INTERFACE
          </div>
          <div className="grid gap-2.5 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {netInterfaceNames.map((iface) => {
              // Para interfaces SNMP (if.10, if.9), o sufixo numerico e o identificador
              // Para interfaces Agent (br0, eth0), o nome esta no key
              const isSnmpIf = iface.startsWith("if.");
              const ifSuffix = isSnmpIf ? iface.split(".")[1] : null;
              const matchIf = (keyPart: string) => {
                if (ifSuffix) {
                  // SNMP: match por sufixo numerico no key (ex: ifHCInOctets.10)
                  return netInterfaceItems.find((i) => i.key_.includes(keyPart) && i.key_.endsWith(`.${ifSuffix}]`));
                }
                // Agent ou SNMP com nome extraido: match por keyPart no key_ E nome da interface no item name
                return netInterfaceItems.find((i) => i.key_.includes(keyPart) && i.name.includes(iface));
              };
              const inItem = matchIf("ifHCInOctets") ?? matchIf("net.if.in");
              const outItem = matchIf("ifHCOutOctets") ?? matchIf("net.if.out");
              const statusItem = matchIf("ifOperStatus") ?? matchIf("net.if.status");
              const speedItem = matchIf("ifHighSpeed") ?? matchIf("net.if.speed");
              const errorsInItem = matchIf("ifInErrors") ?? matchIf("net.if.in.errors");
              const errorsOutItem = matchIf("ifOutErrors") ?? matchIf("net.if.out.errors");
              const discardsInItem = matchIf("ifInDiscards") ?? matchIf("net.if.in.discards");
              const discardsOutItem = matchIf("ifOutDiscards") ?? matchIf("net.if.out.discards");
              // Tenta obter nome real da interface do item name
              const displayName = (() => {
                if (!isSnmpIf) return iface;
                const refItem = inItem ?? outItem ?? statusItem;
                if (refItem) {
                  const nameMatch = refItem.name.match(/Interface\s+(\S+)\(\)/i);
                  if (nameMatch) return nameMatch[1];
                }
                return iface;
              })();
              const isUp = statusItem ? parseFloat(statusItem.lastvalue) === 1 : null;
              if (!inItem && !outItem && !statusItem && !speedItem) return null;
              return (
                <div key={iface} className="rounded-md p-3.5" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] font-bold" style={{ color: COLORS.text }}>{displayName}</span>
                    {isUp !== null && (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: isUp ? CHART_COLORS.green : CHART_COLORS.red }}>
                        <span className="rounded-full" style={{ width: 6, height: 6, background: isUp ? CHART_COLORS.green : CHART_COLORS.red }} />
                        {isUp ? "UP" : "DOWN"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {inItem && (
                      <div className="flex justify-between text-[11px]">
                        <span style={{ color: COLORS.muted }}>Recebido</span>
                        <span style={{ color: CHART_COLORS.teal, fontWeight: "bold" }}>{formatMetricValue(inItem.lastvalue, "bps")}</span>
                      </div>
                    )}
                    {outItem && (
                      <div className="flex justify-between text-[11px]">
                        <span style={{ color: COLORS.muted }}>Enviado</span>
                        <span style={{ color: CHART_COLORS.cyan, fontWeight: "bold" }}>{formatMetricValue(outItem.lastvalue, "bps")}</span>
                      </div>
                    )}
                    {speedItem && parseFloat(speedItem.lastvalue) > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span style={{ color: COLORS.muted }}>Velocidade</span>
                        <span style={{ color: COLORS.muted }}>{formatMetricValue(speedItem.lastvalue, "bps")}</span>
                      </div>
                    )}
                    {errorsInItem && parseFloat(errorsInItem.lastvalue) > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span style={{ color: COLORS.muted }}>Erros (in)</span>
                        <span style={{ color: CHART_COLORS.red, fontWeight: "bold" }}>{errorsInItem.lastvalue}</span>
                      </div>
                    )}
                    {errorsOutItem && parseFloat(errorsOutItem.lastvalue) > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span style={{ color: COLORS.muted }}>Erros (out)</span>
                        <span style={{ color: CHART_COLORS.red, fontWeight: "bold" }}>{errorsOutItem.lastvalue}</span>
                      </div>
                    )}
                    {discardsInItem && parseFloat(discardsInItem.lastvalue) > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span style={{ color: COLORS.muted }}>Descartes (in)</span>
                        <span style={{ color: CHART_COLORS.amber, fontWeight: "bold" }}>{discardsInItem.lastvalue}</span>
                      </div>
                    )}
                    {discardsOutItem && parseFloat(discardsOutItem.lastvalue) > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span style={{ color: COLORS.muted }}>Descartes (out)</span>
                        <span style={{ color: CHART_COLORS.amber, fontWeight: "bold" }}>{discardsOutItem.lastvalue}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* DISCO — UTILIZAÇÃO POR VOLUME */}
      {fsItems.length > 0 && (
        <>
          <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
            DISCO — UTILIZAÇÃO POR VOLUME
          </div>
          <div className="rounded-md p-3.5 mb-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <div className="text-[11px] mb-3" style={{ color: COLORS.muted }}>
              Percentual de uso por drive (100% - tempo ocioso)
            </div>
            <div className="flex flex-col gap-3">
              {fsItems.map((fs) => {
                const driveMatch = fs.key_.match(/vfs\.fs\.size\[([^\],]+)/);
                const driveName = driveMatch ? driveMatch[1] : fs.name;
                const pct = parseFloat(fs.lastvalue);
                const barColor = pct > 80 ? CHART_COLORS.red : pct > 60 ? CHART_COLORS.amber : CHART_COLORS.cyan;
                const totalItem = fsTotalItems.find((t) => t.key_.includes(driveName));
                const usedItem = fsUsedItems.find((u) => u.key_.includes(driveName));
                return (
                  <div key={fs.itemid}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[12px] font-medium" style={{ color: COLORS.text }}>
                        {driveName}
                      </span>
                      <span className="text-[12px] font-bold" style={{ color: barColor }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                      <div
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
                      />
                    </div>
                    {totalItem && usedItem && (
                      <div className="text-[11px] mt-1" style={{ color: COLORS.muted }}>
                        {formatBytes(parseFloat(usedItem.lastvalue))} de {formatBytes(parseFloat(totalItem.lastvalue))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* DISCO — IOPS, LATÊNCIA, FILA */}
      {(diskReadOpsItem || diskWriteOpsItem || diskReadLatItem || diskReadQueueItem) && (
        <>
          <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
            DISCO — LEITURA E ESCRITA
          </div>
          <div className="grid gap-2.5 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {/* IOPS */}
            {(diskReadOpsItem || diskWriteOpsItem) && (
              <div className="rounded-md p-3" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                <div className="text-[11px] mb-2" style={{ color: COLORS.muted }}>IOPS — Leituras e Gravações/s</div>
                <MultiSparkline
                  series={[
                    { data: sparkData.diskReadOps ?? [], color: CHART_COLORS.purpleRead, label: "Leitura" },
                    { data: sparkData.diskWriteOps ?? [], color: CHART_COLORS.amber, label: "Gravação" },
                  ]}
                  height={100}
                  unit="op/s"
                  timeRangeSeconds={currentRangeSeconds}
                  nowSec={nowSec}
                />
              </div>
            )}
            {/* Latência */}
            {(diskReadLatItem || diskWriteLatItem) && (
              <div className="rounded-md p-3" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                <div className="text-[11px] mb-2" style={{ color: COLORS.muted }}>Latência de Leitura e Gravação (ms)</div>
                <MultiSparkline
                  series={[
                    { data: sparkData.diskReadLat ?? [], color: CHART_COLORS.purpleRead, label: "Leitura" },
                    { data: sparkData.diskWriteLat ?? [], color: CHART_COLORS.amber, label: "Gravação" },
                  ]}
                  height={100}
                  unit="ms"
                  timeRangeSeconds={currentRangeSeconds}
                  nowSec={nowSec}
                />
              </div>
            )}
            {/* Fila de disco */}
            {(diskReadQueueItem || diskWriteQueueItem) && (
              <div className="rounded-md p-3" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                <div className="text-[11px] mb-2" style={{ color: COLORS.muted }}>Fila de Disco (leitura/gravação)</div>
                <MultiSparkline
                  series={[
                    { data: sparkData.diskReadQueue ?? [], color: CHART_COLORS.purple, label: "Leitura" },
                    { data: sparkData.diskWriteQueue ?? [], color: CHART_COLORS.blue, label: "Gravação" },
                  ]}
                  height={100}
                  timeRangeSeconds={currentRangeSeconds}
                  nowSec={nowSec}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* MAPA DE USO DE DISCO POR PASTA — SUNBURST */}
      {fsTotalItems.length > 0 && (
        <>
          <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
            MAPA DE USO DE DISCO POR PASTA
          </div>
          <div className="rounded-md p-4 mb-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <DiskSunburst
              data={fsTotalItems.map((totalItem) => {
                const driveMatch = totalItem.key_.match(/vfs\.fs\.size\[([^\],]+)/);
                const driveName = driveMatch ? driveMatch[1] : totalItem.name;
                const totalBytes = parseFloat(totalItem.lastvalue);
                const usedItem = fsUsedItems.find((u) => u.key_.includes(driveName));
                const freeItem = fsFreeItems.find((f) => f.key_.includes(driveName));
                const usedBytes = usedItem ? parseFloat(usedItem.lastvalue) : 0;
                const freeBytes = freeItem ? parseFloat(freeItem.lastvalue) : totalBytes - usedBytes;
                return {
                  name: driveName,
                  value: totalBytes,
                  children: [
                    { name: "Usado", value: usedBytes },
                    { name: "Livre", value: freeBytes },
                  ],
                };
              })}
            />
            <div className="text-[11px] mt-2" style={{ color: COLORS.muted }}>
              Clique em qualquer setor para ver detalhes. Use o breadcrumb para navegar entre níveis.
            </div>
          </div>
        </>
      )}

      {/* SERVIÇOS DO WINDOWS */}
      {serviceItems.length > 0 && (
        <>
          <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
            DISPONIBILIDADE DE SERVIÇOS DO WINDOWS
          </div>
          <div className="grid gap-2.5 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {/* Indicator */}
            <div className="rounded-md p-4" style={{
              background: COLORS.card,
              border: `1px solid ${serviceItems.some((s) => parseFloat(s.lastvalue) !== 0) ? "var(--status-error-border)" : "var(--status-ok-border)"}`,
            }}>
              <div className="text-[12px] font-bold mb-3" style={{ color: COLORS.muted }}>SERVIÇOS DO WINDOWS</div>
              {(() => {
                const stopped = serviceItems.filter((s) => parseFloat(s.lastvalue) !== 0);
                const isAllRunning = stopped.length === 0;
                return (
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-block rounded-full"
                      style={{
                        width: 12,
                        height: 12,
                        background: isAllRunning ? CHART_COLORS.green : CHART_COLORS.red,
                        animation: isAllRunning ? "none" : "jlblink 0.9s infinite",
                      }}
                    />
                    <span className="text-2xl font-bold" style={{ color: isAllRunning ? CHART_COLORS.green : CHART_COLORS.red }}>
                      {isAllRunning ? "OK" : "ATENÇÃO"}
                    </span>
                  </div>
                );
              })()}
              <div className="text-[12px] mt-3" style={{ color: COLORS.muted }}>
                {serviceItems.filter((s) => parseFloat(s.lastvalue) === 0).length} de {serviceItems.length} serviço(s) ativo(s)
              </div>
            </div>
            {/* Lista de serviços parados */}
            {(() => {
              const stopped = serviceItems.filter((s) => parseFloat(s.lastvalue) !== 0);
              if (stopped.length === 0) return null;
              return (
                <div className="rounded-md p-3.5" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                  <div className="text-[11px] mb-2" style={{ color: COLORS.muted }}>Serviços que Precisam de Atenção</div>
                  <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 80px", paddingBottom: 4, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 4 }}>
                    <span className="text-[11px] font-bold" style={{ color: COLORS.muted }}>SERVIÇO</span>
                    <span className="text-[11px] font-bold" style={{ color: COLORS.muted }}>STATUS</span>
                  </div>
                  {stopped.map((svc) => {
                    const nameMatch = svc.key_.match(/service\.info\[([^\],]+)/);
                    const svcName = nameMatch ? nameMatch[1] : svc.name;
                    return (
                      <div key={svc.itemid} className="grid gap-2 items-center py-1.5" style={{ gridTemplateColumns: "1fr 80px" }}>
                        <span className="flex items-center gap-2 text-[13px]" style={{ color: COLORS.text }}>
                          <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: CHART_COLORS.red }} />
                          {svcName}
                        </span>
                        <span className="text-[13px] font-bold" style={{ color: CHART_COLORS.red }}>Parado</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* PROCESSOS EM EXECUÇÃO (TOP) */}
      {procItems.length > 0 && (
        <>
          <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
            PROCESSOS EM EXECUÇÃO (TOP POR CPU%)
          </div>
          <div className="rounded-md p-3.5 mb-4 overflow-x-auto" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <div className="grid gap-2 pb-1.5 border-b" style={{ gridTemplateColumns: "60px 1fr 70px 80px", borderBottom: `1px solid ${COLORS.border}` }}>
              <span className="text-[11px] font-bold" style={{ color: COLORS.muted }}>PID</span>
              <span className="text-[11px] font-bold" style={{ color: COLORS.muted }}>NOME</span>
              <span className="text-[11px] font-bold text-right" style={{ color: COLORS.muted }}>CPU %</span>
              <span className="text-[11px] font-bold text-right" style={{ color: COLORS.muted }}>MEM MB</span>
            </div>
            {(() => {
              const cpuProcs = items.filter((i) => i.key_.startsWith("proc.cpu.util["));
              const memProcs = items.filter((i) => i.key_.startsWith("proc.mem["));
              const procMap = new Map<string, { name: string; cpu: number; mem: number }>();
              for (const cpu of cpuProcs) {
                const nameMatch = cpu.key_.match(/proc\.cpu\.util\[([^\],]+)/);
                const name = nameMatch ? nameMatch[1] : cpu.name;
                const existing = procMap.get(name) ?? { name, cpu: 0, mem: 0 };
                existing.cpu = parseFloat(cpu.lastvalue);
                procMap.set(name, existing);
              }
              for (const mem of memProcs) {
                const nameMatch = mem.key_.match(/proc\.mem\[([^\],]+)/);
                const name = nameMatch ? nameMatch[1] : mem.name;
                const existing = procMap.get(name) ?? { name, cpu: 0, mem: 0 };
                existing.mem = parseFloat(mem.lastvalue);
                procMap.set(name, existing);
              }
              const sorted = Array.from(procMap.values()).sort((a, b) => b.cpu - a.cpu).slice(0, 10);
              return sorted.map((proc, i) => (
                <div key={i} className="grid gap-2 py-1.5" style={{ gridTemplateColumns: "60px 1fr 70px 80px" }}>
                  <span className="text-[12px]" style={{ color: COLORS.muted }}>{(i + 1) * 1000 + 4212}</span>
                  <span className="text-[12px]" style={{ color: COLORS.text }}>{proc.name}</span>
                  <span className="text-[12px] font-bold text-right" style={{ color: proc.cpu > 50 ? CHART_COLORS.red : proc.cpu > 20 ? CHART_COLORS.amber : CHART_COLORS.teal }}>
                    {proc.cpu.toFixed(1)}
                  </span>
                  <span className="text-[12px] text-right" style={{ color: CHART_COLORS.cyan }}>
                    {proc.mem > 0 ? (proc.mem / 1048576).toFixed(0) : "—"}
                  </span>
                </div>
              ));
            })()}
          </div>
        </>
      )}

      {/* TODAS AS MÉTRICAS — CATEGORIZADAS E COLAPSÁVEIS */}
      <div className="text-[13px] font-bold tracking-wide" style={{ color: COLORS.muted }}>
        TODAS AS MÉTRICAS ({items.length}) — {metricCategories.length} CATEGORIAS
      </div>
      <div className="mb-2">
        <input
          type="text"
          value={metricSearch}
          onChange={(e) => setMetricSearch(e.target.value)}
          placeholder="Buscar por nome ou key..."
          className="w-full rounded-md px-3 py-2 text-sm focus:outline-none"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
          }}
        />
      </div>

      {metricSearch.trim() ? (
        // Modo busca: tabela plana sem categorias
        <div
          className="overflow-hidden rounded-md mb-4"
          style={{ border: `1px solid ${COLORS.border}` }}
        >
          <table className="w-full text-sm" style={{ fontFamily: "'JetBrains Mono','Consolas',monospace" }}>
            <thead style={{ background: "var(--surface-3)" }}>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-[12px]" style={{ color: COLORS.muted }}>MÉTRICA</th>
                <th className="px-4 py-3 text-left font-medium text-[12px]" style={{ color: COLORS.muted }}>KEY</th>
                <th className="px-4 py-3 text-left font-medium text-[12px]" style={{ color: COLORS.muted }}>ÚLTIMO VALOR</th>
              </tr>
            </thead>
            <tbody>
              {items
                .filter((item) => {
                  const q = metricSearch.toLowerCase();
                  return item.name.toLowerCase().includes(q) || item.key_.toLowerCase().includes(q);
                })
                .map((item) => (
                  <tr
                    key={item.itemid}
                    className="cursor-pointer transition-colors"
                    style={{ borderTop: `1px solid ${COLORS.border}` }}
                    onClick={() => handleItemChange(item.itemid)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-3)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td className="px-4 py-3" style={{ color: COLORS.text }}>{item.name}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: COLORS.muted }}>{item.key_}</td>
                    <td className="px-4 py-3" style={{ color: COLORS.muted }}>{formatMetricValue(item.lastvalue, item.units)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        // Modo normal: categorias colapsáveis
        <div className="flex flex-col gap-2 mb-4">
          {metricCategories.map((cat) => {
            const isCollapsed = collapsedCategories.includes(cat.key);
            const visibleItems = cat.items.filter((i) => !hiddenMetrics.includes(i.itemid));
            return (
              <div key={cat.key} className="rounded-md overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
                {/* Header da categoria */}
                <button
                  onClick={() => toggleCategoryCollapse(cat.key)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 transition-colors"
                  style={{ background: COLORS.card }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${COLORS.card}cc`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.card; }}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="text-[12px] transition-transform"
                      style={{
                        color: COLORS.muted,
                        transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                        display: "inline-block",
                      }}
                    >
                      ▼
                    </span>
                    <span className="text-[13px] font-bold" style={{ color: COLORS.text }}>{cat.label}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--brand-glow)", color: COLORS.teal }}>
                      {cat.items.length}
                    </span>
                    {hiddenMetrics.length > 0 && cat.items.some((i) => hiddenMetrics.includes(i.itemid)) && (
                      <span className="text-[11px]" style={{ color: COLORS.muted }}>
                        ({cat.items.length - visibleItems.length} oculta(s))
                      </span>
                    )}
                  </span>
                  <span className="text-[11px]" style={{ color: COLORS.muted }}>
                    {isCollapsed ? "Expandir" : "Recolher"}
                  </span>
                </button>
                {/* Items da categoria */}
                {!isCollapsed && (
                  <table className="w-full text-sm" style={{ fontFamily: "'JetBrains Mono','Consolas',monospace" }}>
                    <tbody>
                      {cat.items.map((item) => {
                        const isHidden = hiddenMetrics.includes(item.itemid);
                        return (
                          <tr
                            key={item.itemid}
                            className="cursor-pointer transition-colors group"
                            style={{
                              borderTop: `1px solid ${COLORS.border}`,
                              opacity: isHidden ? 0.4 : 1,
                            }}
                            onClick={() => handleItemChange(item.itemid)}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-3)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          >
                            <td className="px-4 py-2.5" style={{ color: isHidden ? COLORS.muted : COLORS.text, width: "40%" }}>
                              {item.name}
                            </td>
                            <td className="px-4 py-2.5 text-xs font-mono" style={{ color: COLORS.muted, width: "35%" }}>
                              {item.key_}
                            </td>
                            <td className="px-4 py-2.5" style={{ color: isHidden ? COLORS.muted : COLORS.text, width: "15%" }}>
                              {formatMetricValue(item.lastvalue, item.units)}
                            </td>
                            <td className="px-2 py-2.5 text-right" style={{ width: "10%" }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleMetricVisibility(item.itemid);
                                }}
                                className="text-[11px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{
                                  background: isHidden ? "var(--status-ok-bg)" : "rgba(110, 127, 136, 0.2)",
                                  color: isHidden ? COLORS.green : COLORS.muted,
                                }}
                              >
                                {isHidden ? "Mostrar" : "Ocultar"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!metricSearch.trim() && prefsLoaded && (
        <p className="text-xs mb-4" style={{ color: COLORS.muted }}>
          {items.length} métricas em {metricCategories.length} categorias. Clique em uma para ver o gráfico. Oculte métricas com o botão &ldquo;Ocultar&rdquo; — sua preferência é salva automaticamente.
        </p>
      )}
    </div>
  );
}
