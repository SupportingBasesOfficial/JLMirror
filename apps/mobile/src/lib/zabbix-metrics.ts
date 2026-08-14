// Utilidades para categorizar e formatar metricas do Zabbix (port do web)
import type { ZabbixItem } from "@/lib/api-routes";

export type { ZabbixItem };

export type DeviceType = "windows-agent" | "linux-agent" | "snmp" | "unknown";

export interface MetricCategory {
  key: string;
  label: string;
  items: ZabbixItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  cpu: "CPU",
  memory: "Memoria",
  swap: "Swap",
  network: "Rede",
  disk: "Disco",
  "disk-io": "I/O de Disco",
  system: "Sistema",
  connectivity: "Conectividade",
  windows: "Windows (WMI/PerfCounter)",
  services: "Servicos",
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

function getCategory(key: string): string {
  const k = key.toLowerCase();
  if (k.startsWith("system.cpu.") || k.startsWith("system.cpu[")) return "cpu";
  if (k.startsWith("vm.memory.") || k.startsWith("vm.memory[")) return "memory";
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
  if (k.startsWith("wmi.get") || k.startsWith("perf_counter")) return "windows";
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
}

export function categorizeMetrics(items: ZabbixItem[]): MetricCategory[] {
  const categories: Record<string, ZabbixItem[]> = {};
  for (const item of items) {
    const cat = getCategory(item.key_);
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(item);
  }
  return Object.entries(categories)
    .map(([key, catItems]) => ({
      key,
      label: CATEGORY_LABELS[key] ?? key,
      items: catItems,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

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

/** Encontra um item cuja key_ contem o padrao. */
export function findItem(
  items: ZabbixItem[],
  keyPattern: string,
): ZabbixItem | undefined {
  return items.find((i) => i.key_.includes(keyPattern));
}

/** Formata valor numerico com units do Zabbix. */
export function formatMetricValue(
  value: string | undefined,
  units: string | undefined,
): string {
  if (!value || value === "") return "—";
  const num = Number.parseFloat(value);
  if (Number.isNaN(num)) return value + (units ?? "");
  const u = units ?? "";
  if (u === "B") {
    if (num >= 1073741824) return (num / 1073741824).toFixed(2) + " GB";
    if (num >= 1048576) return (num / 1048576).toFixed(1) + " MB";
    if (num >= 1024) return (num / 1024).toFixed(1) + " KB";
    return num.toFixed(0) + " B";
  }
  if (u === "bps") {
    if (num >= 1000000000) return (num / 1000000000).toFixed(2) + " Gbps";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + " Mbps";
    if (num >= 1000) return (num / 1000).toFixed(1) + " Kbps";
    return num.toFixed(0) + " bps";
  }
  if (u === "%") return num.toFixed(2) + "%";
  if (u === "s") {
    if (num >= 86400) return Math.floor(num / 86400) + "d";
    if (num >= 3600) return Math.floor(num / 3600) + "h";
    return Math.floor(num / 60) + "m";
  }
  if (u === "uptime") {
    if (num >= 86400) return Math.floor(num / 86400) + "d";
    if (num >= 3600) return Math.floor(num / 3600) + "h";
    return Math.floor(num / 60) + "m";
  }
  return num.toFixed(2) + u;
}

/** Extrai porcentagem 0-100 de um item (para gauges e barras). */
export function extractPercent(
  item: ZabbixItem | undefined,
): number | undefined {
  if (!item?.lastvalue) return undefined;
  const num = Number.parseFloat(item.lastvalue);
  if (Number.isNaN(num)) return undefined;
  // Items com units "%" ja sao porcentagem
  if (item.units === "%") return num;
  // vm.memory.util tambem e porcentagem
  if (item.key_.includes("util")) return num;
  // system.cpu.util tambem
  if (item.key_.startsWith("system.cpu.util")) return num;
  return undefined;
}
