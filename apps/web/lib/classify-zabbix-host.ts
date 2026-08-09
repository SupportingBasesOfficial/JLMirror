// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Classificacao automatica de hosts do Zabbix em tipos de ativos
// Baseado em: OS do inventory, templates, nome do host, tipo de interface

import type { ZabbixHost } from "@repo/zabbix";

export type AssetType =
  | "server"
  | "vm"
  | "container"
  | "network_switch"
  | "router"
  | "firewall"
  | "load_balancer"
  | "workstation"
  | "laptop"
  | "mobile"
  | "printer"
  | "storage"
  | "appliance"
  | "iot"
  | "other";

interface ClassificationResult {
  assetType: AssetType;
  category:
    "hardware" | "software" | "network" | "virtual" | "license" | "service";
  confidence: "high" | "medium" | "low";
  reason: string;
}

// Tipo de interface do Zabbix: 1=agent, 2=SNMP, 3=IPMI, 4=JMX
const SNMP_INTERFACE_TYPE = 2;

// Padroes de OS do inventory para classificacao (alta confianca)
const OS_PATTERNS: {
  patterns: RegExp[];
  type: AssetType;
  category: ClassificationResult["category"];
}[] = [
  // Windows Server → servidor
  {
    patterns: [/windows.*server/i, /windows\s+server/i],
    type: "server",
    category: "hardware",
  },
  // Linux → servidor (geralmente)
  {
    patterns: [/linux/i],
    type: "server",
    category: "hardware",
  },
  // FreeBSD → appliance/servidor
  {
    patterns: [/freebsd/i],
    type: "server",
    category: "hardware",
  },
  // Windows 10/11 (nao Server) → workstation
  {
    patterns: [/windows\s*1[01]/i, /windows.*pro/i],
    type: "workstation",
    category: "hardware",
  },
];

// Padroes de nome de template para classificacao
const TEMPLATE_PATTERNS: {
  patterns: RegExp[];
  type: AssetType;
  category: ClassificationResult["category"];
}[] = [
  // Servidores / VMs
  {
    patterns: [
      /template.*os.*linux/i,
      /template.*linux/i,
      /template.*os.*windows/i,
      /template.*windows/i,
      /template.*operating\s*system/i,
    ],
    type: "server",
    category: "hardware",
  },
  // VMs
  {
    patterns: [
      /template.*vmware/i,
      /template.*virtual/i,
      /template.*hyperv/i,
      /template.*kvm/i,
      /template.*xen/i,
    ],
    type: "vm",
    category: "virtual",
  },
  // Containers
  {
    patterns: [
      /template.*docker/i,
      /template.*container/i,
      /template.*kubernetes/i,
      /template.*k8s/i,
    ],
    type: "container",
    category: "virtual",
  },
  // Switches
  {
    patterns: [
      /template.*switch/i,
      /template.*catalyst/i,
      /template.*procurve/i,
      /template.*hp.*switch/i,
      /template.*cisco.*switch/i,
    ],
    type: "network_switch",
    category: "network",
  },
  // Routers
  {
    patterns: [
      /template.*router/i,
      /template.*cisco.*router/i,
      /template.*isr/i,
      /template.*mikrotik/i,
    ],
    type: "router",
    category: "network",
  },
  // Firewalls
  {
    patterns: [
      /template.*firewall/i,
      /template.*fortigate/i,
      /template.*palo.*alto/i,
      /template.*sonicwall/i,
      /template.*checkpoint/i,
      /template.*pfSense/i,
      /template.*iptables/i,
    ],
    type: "firewall",
    category: "network",
  },
  // Load balancers
  {
    patterns: [
      /template.*load.*balanc/i,
      /template.*f5/i,
      /template.*haproxy/i,
      /template.*nginx/i,
    ],
    type: "load_balancer",
    category: "network",
  },
  // Impressoras
  {
    patterns: [
      /template.*printer/i,
      /template.*impressora/i,
      /template.*hp.*laser/i,
      /template.*ricoh/i,
      /template.*xerox/i,
      /template.*brother/i,
      /template.*epson.*printer/i,
      /template.*canon.*printer/i,
      /template.*snmp.*printer/i,
    ],
    type: "printer",
    category: "hardware",
  },
  // Storage / NAS
  {
    patterns: [
      /template.*storage/i,
      /template.*nas/i,
      /template.*san/i,
      /template.*disk.*array/i,
      /template.*netapp/i,
      /template.*emc/i,
      /template.*synology/i,
      /template.*qnap/i,
    ],
    type: "storage",
    category: "hardware",
  },
  // IoT / sensores / UPS
  {
    patterns: [
      /template.*iot/i,
      /template.*sensor/i,
      /template.*temperature/i,
      /template.*humidity/i,
      /template.*ups/i,
      /template.*apc/i,
      /template.*pdu/i,
    ],
    type: "iot",
    category: "hardware",
  },
];

// Padroes de nome de host — match em qualquer parte do hostname (nao so prefixo)
const HOSTNAME_PATTERNS: {
  patterns: RegExp[];
  type: AssetType;
  category: ClassificationResult["category"];
}[] = [
  // Firewalls — FW, FOGATTI, PFSENSE, FORTIGATE
  {
    patterns: [/\bFW\b/i, /FOGATTI/i, /PFSENSE/i, /FORTIGATE/i, /FIREWALL/i],
    type: "firewall",
    category: "network",
  },
  // VMs — vSRV, VM-, VPS-, HYPERV
  {
    patterns: [/vSRV/i, /\bVM\b/i, /^vm-/i, /^vps-/i, /HYPERV/i],
    type: "vm",
    category: "virtual",
  },
  // Switches — SW, SWITCH, CATALYST
  {
    patterns: [/\bSW\b/i, /SWITCH/i, /CATALYST/i, /PROCURVE/i],
    type: "network_switch",
    category: "network",
  },
  // Routers — RT, ROUTER, MIKROTIK
  {
    patterns: [/\bRT\b/i, /ROUTER/i, /MIKROTIK/i, /\bRTR\b/i],
    type: "router",
    category: "network",
  },
  // Impressoras — PR, IMP, PRINTER
  {
    patterns: [/\bPR\b/i, /\bIMP\b/i, /PRINTER/i, /LASER/i],
    type: "printer",
    category: "hardware",
  },
  // Storage — NAS, STORAGE, SAN
  {
    patterns: [/\bNAS\b/i, /STORAGE/i, /\bSAN\b/i, /NETAPP/i, /SYNOLOGY/i],
    type: "storage",
    category: "hardware",
  },
  // Servidores — SRV, SERVER, SQL, ORCL, BD, AD, APL, APP, MAIL, DB
  {
    patterns: [
      /\bSRV\b/i,
      /\bSERVER\b/i,
      /\bSQL\b/i,
      /\bORCL\b/i,
      /\bBD\b/i,
      /\bDB\b/i,
      /\bAD\b/i,
      /\bAPL\b/i,
      /\bAPP\b/i,
      /MAIL/i,
      /SVNO/i,
    ],
    type: "server",
    category: "hardware",
  },
  // IoT / UPS
  {
    patterns: [/\bUPS\b/i, /SENSOR/i, /\bIOT\b/i, /\bAPC\b/i],
    type: "iot",
    category: "hardware",
  },
];

export function classifyZabbixHost(host: ZabbixHost): ClassificationResult {
  const templates = host.parentTemplates ?? host.templates ?? [];
  const hostname = host.host ?? "";
  const name = host.name ?? "";
  const inventory = host.inventory;
  const os = inventory?.os ?? "";
  const inventoryType = inventory?.type ?? "";
  const interfaces = host.interfaces ?? [];
  const combinedName = `${hostname} ${name}`;

  // 1. OS do inventory — alta confianca (Windows Server, Linux, etc)
  if (os) {
    for (const { patterns, type, category } of OS_PATTERNS) {
      if (patterns.some((p) => p.test(os))) {
        // Se OS diz server mas hostname indica firewall, prioriza firewall
        if (type === "server") {
          const fwMatch = HOSTNAME_PATTERNS.find(
            (h) =>
              h.type === "firewall" &&
              h.patterns.some((p) => p.test(combinedName)),
          );
          if (fwMatch) {
            return {
              assetType: "firewall",
              category: "network",
              confidence: "high",
              reason: `hostname + OS: "${os}" indica firewall`,
            };
          }
        }
        return {
          assetType: type,
          category,
          confidence: "high",
          reason: `OS: "${os}"`,
        };
      }
    }
  }

  // 2. inventory.type
  if (inventoryType) {
    for (const { patterns, type, category } of TEMPLATE_PATTERNS) {
      if (patterns.some((p) => p.test(inventoryType))) {
        return {
          assetType: type,
          category,
          confidence: "high",
          reason: `inventory.type: "${inventoryType}"`,
        };
      }
    }
  }

  // 3. Templates anexados
  for (const { patterns, type, category } of TEMPLATE_PATTERNS) {
    for (const tpl of templates) {
      const tplName = tpl.name ?? tpl.host ?? "";
      if (patterns.some((p) => p.test(tplName))) {
        return {
          assetType: type,
          category,
          confidence: "high",
          reason: `template: "${tplName}"`,
        };
      }
    }
  }

  // 4. Padroes no nome do host (match em qualquer parte)
  for (const { patterns, type, category } of HOSTNAME_PATTERNS) {
    if (patterns.some((p) => p.test(combinedName))) {
      return {
        assetType: type,
        category,
        confidence: "medium",
        reason: `hostname: "${hostname}"`,
      };
    }
  }

  // 5. Heuristica por tipo de interface
  const hasSnmp = interfaces.some((i) => i.type === SNMP_INTERFACE_TYPE);
  if (hasSnmp) {
    // SNMP sem template — dispositivo de rede
    return {
      assetType: "firewall",
      category: "network",
      confidence: "low",
      reason: "interface SNMP sem template — provavelmente firewall/router",
    };
  }

  // 6. Fallback — agent interface = servidor
  const hasAgent = interfaces.some((i) => i.type === 1);
  if (hasAgent) {
    return {
      assetType: "server",
      category: "hardware",
      confidence: "low",
      reason: "interface agent (Zabbix) sem classificacao especifica",
    };
  }

  return {
    assetType: "other",
    category: "hardware",
    confidence: "low",
    reason: "sem informacao suficiente para classificar",
  };
}

// Mapa de icone por tipo de ativo
export const ASSET_TYPE_ICONS: Record<AssetType, string> = {
  server: "🖥",
  vm: "▢",
  container: "📦",
  network_switch: "🔀",
  router: "🌐",
  firewall: "🛡",
  load_balancer: "⚖",
  workstation: "💻",
  laptop: "💻",
  mobile: "📱",
  printer: "🖨",
  storage: "💾",
  appliance: "🔌",
  iot: "📡",
  other: "•",
};

// Mapa de label em portugues por tipo de ativo
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  server: "Servidor",
  vm: "VM",
  container: "Container",
  network_switch: "Switch",
  router: "Router",
  firewall: "Firewall",
  load_balancer: "Load Balancer",
  workstation: "Workstation",
  laptop: "Notebook",
  mobile: "Mobile",
  printer: "Impressora",
  storage: "Storage/NAS",
  appliance: "Appliance",
  iot: "IoT/Sensor",
  other: "Outro",
};
