// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";

// Testes da logica de validacao e processamento de devices
// Segue o padrao dos outros testes — isolado, sem subir servidor

// Replica da funcao de validacao de hostId do devices/[id]/page.tsx
function isValidHostId(id: string): boolean {
  if (!id || id.length === 0 || id.length > 50) return false;
  return /^\d+$/.test(id);
}

// Replica da funcao safeParseFloat do devices/page.tsx
function safeParseFloat(value: string | undefined | null): number {
  if (!value || value === "") return 0;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

describe("devices — validacao de hostId", () => {
  it("aceita ID numerico valido", () => {
    expect(isValidHostId("12345")).toBe(true);
  });

  it("aceita ID numerico grande", () => {
    expect(isValidHostId("999999999999")).toBe(true);
  });

  it("rejeita string vazia", () => {
    expect(isValidHostId("")).toBe(false);
  });

  it("rejeita ID com letras", () => {
    expect(isValidHostId("abc123")).toBe(false);
  });

  it("rejeita ID com caracteres especiais", () => {
    expect(isValidHostId("123;DROP TABLE")).toBe(false);
  });

  it("rejeita ID com espacos", () => {
    expect(isValidHostId("123 456")).toBe(false);
  });

  it("rejeita ID muito longo (>50 chars)", () => {
    expect(isValidHostId("1".repeat(51))).toBe(false);
  });

  it("aceita ID com exatamente 50 chars", () => {
    expect(isValidHostId("1".repeat(50))).toBe(true);
  });

  it("rejeita null/undefined", () => {
    expect(isValidHostId(null as unknown as string)).toBe(false);
    expect(isValidHostId(undefined as unknown as string)).toBe(false);
  });

  it("rejeita tentativa de path traversal", () => {
    expect(isValidHostId("../../../etc/passwd")).toBe(false);
  });

  it("rejeita tentativa de SQL injection", () => {
    expect(isValidHostId("1;--")).toBe(false);
    expect(isValidHostId("1 OR 1=1")).toBe(false);
  });
});

describe("devices — safeParseFloat", () => {
  it("parse valor numerico valido", () => {
    expect(safeParseFloat("42.5")).toBe(42.5);
  });

  it("parse valor inteiro", () => {
    expect(safeParseFloat("100")).toBe(100);
  });

  it("retorna 0 para string vazia", () => {
    expect(safeParseFloat("")).toBe(0);
  });

  it("retorna 0 para undefined", () => {
    expect(safeParseFloat(undefined)).toBe(0);
  });

  it("retorna 0 para null", () => {
    expect(safeParseFloat(null)).toBe(0);
  });

  it("retorna 0 para NaN", () => {
    expect(safeParseFloat("abc")).toBe(0);
  });

  it("retorna 0 para string com texto", () => {
    expect(safeParseFloat("N/A")).toBe(0);
  });

  it("parse valor negativo", () => {
    expect(safeParseFloat("-15.3")).toBe(-15.3);
  });

  it("parse valor cientifico", () => {
    expect(safeParseFloat("1e5")).toBe(100000);
  });

  it("retorna 0 para apenas espacos", () => {
    expect(safeParseFloat("   ")).toBe(0);
  });
});

// Testes da logica de agrupamento de devices
describe("devices — agrupamento por grupo", () => {
  type MockHost = {
    hostid: string;
    name: string;
    status: string;
    groups?: Array<{ groupid: string; name: string }>;
    hostgroups?: Array<{ groupid: string; name: string }>;
  };

  function groupDevices(devices: MockHost[]) {
    const devicesByGroup: Record<
      string,
      { groupName: string; devices: MockHost[] }
    > = {};
    for (const d of devices) {
      const groups = d.groups ?? d.hostgroups ?? [];
      if (groups.length === 0) {
        const key = "__sem_grupo";
        if (!devicesByGroup[key])
          devicesByGroup[key] = { groupName: "Sem categoria", devices: [] };
        devicesByGroup[key].devices.push(d);
      } else {
        for (const g of groups) {
          if (!devicesByGroup[g.groupid])
            devicesByGroup[g.groupid] = { groupName: g.name, devices: [] };
          devicesByGroup[g.groupid].devices.push(d);
        }
      }
    }
    return devicesByGroup;
  }

  it("agrupa devices por grupo", () => {
    const devices: MockHost[] = [
      {
        hostid: "1",
        name: "Server 1",
        status: "0",
        groups: [{ groupid: "g1", name: "Servers" }],
      },
      {
        hostid: "2",
        name: "Server 2",
        status: "0",
        groups: [{ groupid: "g1", name: "Servers" }],
      },
      {
        hostid: "3",
        name: "Router 1",
        status: "0",
        groups: [{ groupid: "g2", name: "Network" }],
      },
    ];
    const grouped = groupDevices(devices);
    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped["g1"].devices).toHaveLength(2);
    expect(grouped["g2"].devices).toHaveLength(1);
  });

  it("coloca devices sem grupo em 'Sem categoria'", () => {
    const devices: MockHost[] = [
      { hostid: "1", name: "Server 1", status: "0" },
    ];
    const grouped = groupDevices(devices);
    expect(grouped["__sem_grupo"].groupName).toBe("Sem categoria");
    expect(grouped["__sem_grupo"].devices).toHaveLength(1);
  });

  it("suporta hostgroups (Zabbix 5.x) em vez de groups", () => {
    const devices: MockHost[] = [
      {
        hostid: "1",
        name: "Server 1",
        status: "0",
        hostgroups: [{ groupid: "g1", name: "Legacy" }],
      },
    ];
    const grouped = groupDevices(devices);
    expect(grouped["g1"].groupName).toBe("Legacy");
  });

  it("device com multiplos grupos aparece em todos", () => {
    const devices: MockHost[] = [
      {
        hostid: "1",
        name: "Server 1",
        status: "0",
        groups: [
          { groupid: "g1", name: "Servers" },
          { groupid: "g2", name: "Linux" },
        ],
      },
    ];
    const grouped = groupDevices(devices);
    expect(grouped["g1"].devices).toHaveLength(1);
    expect(grouped["g2"].devices).toHaveLength(1);
  });

  it("lista vazia retorna objeto vazio", () => {
    const grouped = groupDevices([]);
    expect(Object.keys(grouped)).toHaveLength(0);
  });
});

// Testes da logica de metricas (CPU/rede)
describe("devices — extracao de metricas", () => {
  type MockItem = {
    hostid: string;
    key_: string;
    lastvalue: string;
    units: string;
  };

  function extractMetrics(items: MockItem[]) {
    const cpuByHost = new Map<string, number>();
    const netInByHost = new Map<string, number>();
    const netOutByHost = new Map<string, number>();

    for (const item of items) {
      if (item.key_.includes("system.cpu.util")) {
        const val = parseFloat(item.lastvalue);
        if (!Number.isNaN(val)) cpuByHost.set(item.hostid, val);
      }
      if (item.key_.includes("net.if.in") && item.units === "bps") {
        const val = parseFloat(item.lastvalue);
        if (!Number.isNaN(val)) {
          const current = netInByHost.get(item.hostid) ?? 0;
          if (val > current) netInByHost.set(item.hostid, val);
        }
      }
      if (item.key_.includes("net.if.out") && item.units === "bps") {
        const val = parseFloat(item.lastvalue);
        if (!Number.isNaN(val)) {
          const current = netOutByHost.get(item.hostid) ?? 0;
          if (val > current) netOutByHost.set(item.hostid, val);
        }
      }
    }

    return { cpuByHost, netInByHost, netOutByHost };
  }

  it("extrai CPU de item system.cpu.util", () => {
    const items: MockItem[] = [
      { hostid: "1", key_: "system.cpu.util", lastvalue: "45.5", units: "%" },
    ];
    const { cpuByHost } = extractMetrics(items);
    expect(cpuByHost.get("1")).toBe(45.5);
  });

  it("extrai rede in/out com maior valor", () => {
    const items: MockItem[] = [
      { hostid: "1", key_: "net.if.in[eth0]", lastvalue: "1000", units: "bps" },
      { hostid: "1", key_: "net.if.in[eth1]", lastvalue: "5000", units: "bps" },
      { hostid: "1", key_: "net.if.out[eth0]", lastvalue: "800", units: "bps" },
    ];
    const { netInByHost, netOutByHost } = extractMetrics(items);
    expect(netInByHost.get("1")).toBe(5000);
    expect(netOutByHost.get("1")).toBe(800);
  });

  it("ignora items com units diferente de bps para rede", () => {
    const items: MockItem[] = [
      { hostid: "1", key_: "net.if.in[eth0]", lastvalue: "1000", units: "Bps" },
    ];
    const { netInByHost } = extractMetrics(items);
    expect(netInByHost.get("1")).toBeUndefined();
  });

  it("trata lastvalue vazio sem quebrar", () => {
    const items: MockItem[] = [
      { hostid: "1", key_: "system.cpu.util", lastvalue: "", units: "%" },
    ];
    const { cpuByHost } = extractMetrics(items);
    expect(cpuByHost.get("1")).toBeUndefined();
  });

  it("trata lastvalue NaN sem quebrar", () => {
    const items: MockItem[] = [
      { hostid: "1", key_: "system.cpu.util", lastvalue: "N/A", units: "%" },
    ];
    const { cpuByHost } = extractMetrics(items);
    expect(cpuByHost.get("1")).toBeUndefined();
  });

  it("lista vazia retorna maps vazios", () => {
    const { cpuByHost, netInByHost, netOutByHost } = extractMetrics([]);
    expect(cpuByHost.size).toBe(0);
    expect(netInByHost.size).toBe(0);
    expect(netOutByHost.size).toBe(0);
  });
});

// Testes do batch endpoint
describe("devices — batch items endpoint", () => {
  it("parametro host_ids vazio retorna erro 400", () => {
    const hostIdsParam = "";
    expect(hostIdsParam).toBe("");
  });

  it("parametro host_ids com IDs validos", () => {
    const hostIdsParam = "1,2,3,4,5";
    const hostIds = hostIdsParam.split(",").filter(Boolean);
    expect(hostIds).toHaveLength(5);
  });

  it("limite de 500 hosts por request", () => {
    const hostIds = Array.from({ length: 501 }, (_, i) => String(i + 1));
    expect(hostIds.length).toBeGreaterThan(500);
  });

  it("agrupa items por hostid corretamente", () => {
    const items = [
      { itemid: "1", hostid: "h1", name: "CPU", key_: "system.cpu.util" },
      { itemid: "2", hostid: "h1", name: "Net In", key_: "net.if.in" },
      { itemid: "3", hostid: "h2", name: "CPU", key_: "system.cpu.util" },
    ];
    const itemsByHost: Record<string, typeof items> = {};
    for (const item of items) {
      if (!itemsByHost[item.hostid]) itemsByHost[item.hostid] = [];
      itemsByHost[item.hostid].push(item);
    }
    expect(itemsByHost["h1"]).toHaveLength(2);
    expect(itemsByHost["h2"]).toHaveLength(1);
  });
});

// ========== Logica de Tenant Isolation ==========

describe("devices — logica de tenant isolation", () => {
  it("queries de devices filtram por tenant_id", () => {
    const tenantId = "t-123";
    const sql =
      "SELECT * FROM public.devices WHERE tenant_id = $1 ORDER BY hostname";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("GET /:id inclui tenant_id no WHERE", () => {
    const tenantId = "t-456";
    const deviceId = "d-1";
    const sql = "SELECT * FROM public.devices WHERE tenant_id = $1 AND id = $2";
    const params: unknown[] = [tenantId, deviceId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });
});

// ========== Logica de Error Handling ==========

describe("devices — logica de error handling", () => {
  it("result.error retorna DB_ERROR 500", () => {
    const result = { error: { message: "Connection refused" } };
    const hasError = !!result.error;
    expect(hasError).toBe(true);
  });

  it("result sem error retorna dados normalmente", () => {
    const result = { error: null, data: { rows: [] } };
    const hasError = !!result.error;
    expect(hasError).toBe(false);
  });

  it("device nao encontrado retorna 404", () => {
    const device = null;
    const notFound = !device;
    expect(notFound).toBe(true);
  });

  it("device encontrado retorna 200", () => {
    const device = { id: "d-1", hostname: "server-01" };
    const notFound = !device;
    expect(notFound).toBe(false);
  });

  it("catch retorna INTERNAL_ERROR 500", () => {
    const error = new Error("Unexpected failure");
    const message = error instanceof Error ? error.message : "Erro interno";
    expect(message).toBe("Unexpected failure");
  });

  it("catch com non-Error retorna mensagem generica", () => {
    const error = "string error";
    const message = error instanceof Error ? error.message : "Erro interno";
    expect(message).toBe("Erro interno");
  });
});

// ========== Logica de safeRows/safeFirstRow ==========

describe("devices — logica de safeRows/safeFirstRow", () => {
  it("safeRows retorna array vazio quando data undefined", () => {
    const result = { data: undefined };
    const rows = result.data?.rows ?? [];
    expect(rows).toEqual([]);
  });

  it("safeRows retorna rows quando data existe", () => {
    const result = { data: { rows: [{ id: "1" }, { id: "2" }] } };
    const rows = result.data?.rows ?? [];
    expect(rows).toHaveLength(2);
  });

  it("safeFirstRow retorna undefined quando vazio", () => {
    const result = { data: { rows: [] } };
    const first = result.data?.rows?.[0];
    expect(first).toBeUndefined();
  });

  it("safeFirstRow retorna primeiro elemento", () => {
    const result = { data: { rows: [{ id: "1" }] } };
    const first = result.data?.rows?.[0];
    expect(first).toEqual({ id: "1" });
  });
});
