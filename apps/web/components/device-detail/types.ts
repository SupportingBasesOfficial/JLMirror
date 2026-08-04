// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Tipos, constantes e utilidades compartilhadas entre subcomponentes do device detail

import { useSyncExternalStore } from "react";
import type { ZabbixTrigger as ZabbixTriggerZabbix } from "@repo/zabbix";

export interface ZabbixItem {
  itemid: string;
  name: string;
  lastvalue: string;
  units: string;
  key_: string;
  hostid: string;
  value_type: number | string;
}

export interface HistoryEntry {
  itemid: string;
  clock: number;
  value: string;
  ns: number;
}

export type ZabbixTrigger = Pick<
  ZabbixTriggerZabbix,
  "triggerid" | "description" | "priority" | "value" | "lastchange" | "hosts"
>;

export interface DeviceDetailClientProps {
  items: ZabbixItem[];
  hostId: string;
  hostName: string;
  hostIp: string;
  triggers?: ZabbixTrigger[];
}

export type DeviceType = "windows-agent" | "linux-agent" | "snmp" | "unknown";

export interface MetricCategory {
  key: string;
  label: string;
  items: ZabbixItem[];
}

export const COLORS = {
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

export const CHART_COLORS = {
  teal: "#1BA898",
  cyan: "#35D0C4",
  blue: "#3AA0FF",
  purple: "#8E7CFF",
  purpleRead: "#B14EFF",
  amber: "#F5A623",
  red: "#E5484D",
  green: "#3DD68C",
};

export const TIME_RANGES: Record<string, number> = {
  "5min": 300,
  "15min": 900,
  "1h": 3600,
  "6h": 21600,
  "24h": 86400,
  "7d": 604800,
};

export const AUTO_REFRESH_INTERVAL = 30000;

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  "windows-agent": "Windows Agent",
  "linux-agent": "Linux Agent",
  snmp: "SNMP",
  unknown: "Genérico",
};

export const TRIGGER_PRIORITY_COLORS: Record<string, string> = {
  "0": "var(--status-ok-text)",
  "1": "var(--status-ok-text)",
  "2": "var(--status-warning-text)",
  "3": "var(--status-warning-text)",
  "4": "var(--status-error-text)",
  "5": "var(--status-error-text)",
};

export const TRIGGER_PRIORITY_LABELS: Record<string, string> = {
  "0": "Info",
  "1": "Info",
  "2": "Aviso",
  "3": "Aviso",
  "4": "Crítico",
  "5": "Crítico",
};

// Detecta tipo de device baseado nos padroes de keys dos items
export function detectDeviceType(items: ZabbixItem[]): DeviceType {
  const hasWmi = items.some((i) => i.key_.includes("wmi.get"));
  const hasPerfCounter = items.some((i) => i.key_.includes("perf_counter"));
  const hasLinuxAgent = items.some(
    (i) => i.key_.startsWith("system.cpu.") && i.key_.includes("ssCpuRaw"),
  );
  const hasSnmpNetIf = items.some((i) => i.key_.includes("ifHCInOctets"));
  const hasLinuxPaths = items.some((i) => i.key_.includes("vfs.fs.size[/"));
  const hasAgentNetIf = items.some(
    (i) => i.key_.startsWith("net.if.") && !i.key_.includes("ifHC"),
  );

  if (hasWmi || hasPerfCounter) return "windows-agent";
  if (hasLinuxAgent || (hasLinuxPaths && hasAgentNetIf)) return "linux-agent";
  if (hasSnmpNetIf) return "snmp";
  if (hasLinuxPaths) return "linux-agent";
  return "unknown";
}

// Categoriza todos os items em grupos logicos
export function categorizeMetrics(items: ZabbixItem[]): MetricCategory[] {
  const categories: Record<string, ZabbixItem[]> = {};

  const getCategory = (key: string): string => {
    const k = key.toLowerCase();
    if (k.startsWith("system.cpu.") || k.startsWith("system.cpu["))
      return "cpu";
    if (k.startsWith("vm.memory.") || k.startsWith("vm.memory["))
      return "memory";
    if (k.startsWith("system.swap.") || k.startsWith("system.swap["))
      return "swap";
    if (k.startsWith("net.if.") || k.startsWith("net.if[")) return "network";
    if (k.startsWith("vfs.fs.") || k.startsWith("vfs.fs[")) return "disk";
    if (k.startsWith("vfs.dev.")) return "disk-io";
    if (k.startsWith("system.uptime") || k.startsWith("system.uptime["))
      return "system";
    if (k.startsWith("system.load") || k.startsWith("system.load["))
      return "system";
    if (k.startsWith("system.cpu.switches") || k.startsWith("system.cpu.intr"))
      return "system";
    if (k.startsWith("system.hostname") || k.startsWith("system.uname"))
      return "system";
    if (k.startsWith("system.users") || k.startsWith("system.boot"))
      return "system";
    if (k.startsWith("icmpping")) return "connectivity";
    if (k.startsWith("wmi.get") || k.startsWith("perf_counter"))
      return "windows";
    if (k.startsWith("service.info") || k.startsWith("service.info["))
      return "services";
    if (k.startsWith("proc.") || k.startsWith("proc[")) return "processes";
    if (k.startsWith("agent.") || k.startsWith("agent[")) return "agent";
    if (k.startsWith("eventlog") || k.startsWith("eventlog["))
      return "windows-logs";
    if (k.startsWith("log") || k.startsWith("log[")) return "logs";
    if (k.startsWith("vfs.file") || k.startsWith("vfs.file[")) return "files";
    if (k.startsWith("sensor") || k.startsWith("sensor[")) return "sensors";
    if (k.startsWith("system.run") || k.startsWith("system.run["))
      return "system";
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
    .map(([key, catItems]) => {
      const label = categoryLabels[key] ?? key;
      return { key, label, items: catItems };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

export function formatUptime(seconds: number): string {
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

export function findItem(
  items: ZabbixItem[],
  keyPattern: string,
): ZabbixItem | undefined {
  return items.find((i) => i.key_.includes(keyPattern));
}

export function formatMetricValue(value: string, units: string): string {
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

export function triggerTimeAgo(lastchange: string): string {
  const diff = Math.floor(Date.now() / 1000) - parseInt(lastchange);
  if (diff < 60) return "agora";
  if (diff < 3600) return Math.floor(diff / 60) + "min";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  return Math.floor(diff / 86400) + "d";
}
