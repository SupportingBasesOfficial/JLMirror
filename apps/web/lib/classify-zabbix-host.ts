// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Classificacao automatica de hosts do Zabbix em tipos de ativos
// Baseado em: templates anexados, nome do host, tipo de interface, inventory

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
  // Workstations
  {
    patterns: [/template.*workstation/i, /template.*desktop/i, /template.*pc/i],
    type: "workstation",
    category: "hardware",
  },
  // IoT / sensores
  {
    patterns: [
      /template.*iot/i,
      /template.*sensor/i,
      /template.*temperature/i,
      /template.*humidity/i,
      /template.*ups/i,
      /template.*apc/i,
      /template.*nutanix/i,
      /template.*pdu/i,
    ],
    type: "iot",
    category: "hardware",
  },
  // Appliances
  {
    patterns: [
      /template.*appliance/i,
      /template.*proxy/i,
      /template.*squid/i,
      /template.*cache/i,
    ],
    type: "appliance",
    category: "hardware",
  },
];

// Padroes de nome de host para classificacao
const HOSTNAME_PATTERNS: {
  patterns: RegExp[];
  type: AssetType;
  category: ClassificationResult["category"];
}[] = [
  { patterns: [/^srv-|^server-|^s\d+/i], type: "server", category: "hardware" },
  { patterns: [/^vm-|^vps-|^cloud-/i], type: "vm", category: "virtual" },
  {
    patterns: [/^sw-|^switch-|^acs-/i],
    type: "network_switch",
    category: "network",
  },
  { patterns: [/^rt-|^router-|^rtr-/i], type: "router", category: "network" },
  {
    patterns: [/^fw-|^firewall-|^pf-/i],
    type: "firewall",
    category: "network",
  },
  {
    patterns: [/^lb-|^loadbalanc/i],
    type: "load_balancer",
    category: "network",
  },
  {
    patterns: [/^pr-|^printer-|^imp-|^hp-|^ricoh-/i],
    type: "printer",
    category: "hardware",
  },
  {
    patterns: [/^nas-|^storage-|^san-/i],
    type: "storage",
    category: "hardware",
  },
  {
    patterns: [/^ws-|^pc-|^desktop-/i],
    type: "workstation",
    category: "hardware",
  },
  { patterns: [/^ups-|^sensor-|^iot-/i], type: "iot", category: "hardware" },
];

// Tipo de interface do Zabbix: 1=agent, 2=SNMP, 3=IPMI, 4=JMX
// SNMP geralmente indica dispositivo de rede / impressora / appliance
const SNMP_INTERFACE_TYPE = 2;

export function classifyZabbixHost(host: ZabbixHost): ClassificationResult {
  const templates = host.parentTemplates ?? host.templates ?? [];
  const hostname = host.host ?? "";
  const inventory = host.inventory;
  const inventoryType = inventory?.type ?? "";
  const interfaces = host.interfaces ?? [];

  // 1. Tenta classificar pelo inventory.type (mais confiavel se preenchido)
  if (inventoryType) {
    const lowerType = inventoryType.toLowerCase();
    for (const { patterns, type, category } of TEMPLATE_PATTERNS) {
      if (patterns.some((p) => p.test(lowerType))) {
        return {
          assetType: type,
          category,
          confidence: "high",
          reason: `inventory.type: "${inventoryType}"`,
        };
      }
    }
  }

  // 2. Tenta classificar pelos templates anexados
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

  // 3. Tenta classificar pelo nome do host
  for (const { patterns, type, category } of HOSTNAME_PATTERNS) {
    if (patterns.some((p) => p.test(hostname))) {
      return {
        assetType: type,
        category,
        confidence: "medium",
        reason: `hostname: "${hostname}"`,
      };
    }
  }

  // 4. Heuristica por tipo de interface
  const hasSnmp = interfaces.some((i) => i.type === SNMP_INTERFACE_TYPE);
  if (hasSnmp) {
    // SNMP sem template especifico — provavelmente switch/router/appliance de rede
    return {
      assetType: "network_switch",
      category: "network",
      confidence: "low",
      reason: "interface SNMP sem template especifico",
    };
  }

  // 5. Fallback — assume server se tem interface agent (tipo 1)
  const hasAgent = interfaces.some((i) => i.type === 1);
  if (hasAgent) {
    return {
      assetType: "server",
      category: "hardware",
      confidence: "low",
      reason: "interface agent (Zabbix) sem template especifico",
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
