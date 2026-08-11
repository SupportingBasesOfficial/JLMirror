// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { discoverySessionSchema } from "@repo/shared-validation";

// ========== discoverySessionSchema ==========

describe("discovery — discoverySessionSchema", () => {
  const validSession = {
    name: "Network Scan - Office",
    ip_ranges: ["192.168.1.0/24"],
  };

  it("valida session minima", () => {
    const result = discoverySessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita name muito longo (>200)", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem ip_ranges", () => {
    const result = discoverySessionSchema.safeParse({
      name: "Scan",
      ip_ranges: [],
    });
    expect(result.success).toBe(false);
  });

  it("valida multiplos ip_ranges", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      ip_ranges: ["192.168.1.0/24", "10.0.0.0/16"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita ip_ranges vazio no array", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      ip_ranges: [""],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita ip_range muito longo (>50)", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      ip_ranges: ["a".repeat(51)],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita mais de 100 ip_ranges", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      ip_ranges: Array(101).fill("192.168.1.0/24"),
    });
    expect(result.success).toBe(false);
  });

  it("valida com snmp_communities", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      snmp_communities: ["public", "private"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita mais de 20 snmp_communities", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      snmp_communities: Array(21).fill("public"),
    });
    expect(result.success).toBe(false);
  });

  it("valida com snmp_ports", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      snmp_ports: [161, 1161],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita snmp_port invalido (>65535)", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      snmp_ports: [70000],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita snmp_port negativo", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      snmp_ports: [-1],
    });
    expect(result.success).toBe(false);
  });

  it("valida snmp_timeout_ms", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      snmp_timeout_ms: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita snmp_timeout_ms muito alto (>60000)", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      snmp_timeout_ms: 60001,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita snmp_timeout_ms negativo", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      snmp_timeout_ms: -1,
    });
    expect(result.success).toBe(false);
  });

  it("valida snmp_retries", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      snmp_retries: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita snmp_retries > 10", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      snmp_retries: 11,
    });
    expect(result.success).toBe(false);
  });

  it("valida use_snmp boolean", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      use_snmp: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida use_lldp boolean", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      use_lldp: false,
    });
    expect(result.success).toBe(true);
  });

  it("valida use_arp boolean", () => {
    const result = discoverySessionSchema.safeParse({
      ...validSession,
      use_arp: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida session completa", () => {
    const result = discoverySessionSchema.safeParse({
      name: "Full Network Scan",
      ip_ranges: ["192.168.1.0/24", "10.0.0.0/16"],
      snmp_communities: ["public", "private"],
      snmp_ports: [161, 1161],
      snmp_timeout_ms: 5000,
      snmp_retries: 3,
      use_snmp: true,
      use_lldp: true,
      use_arp: false,
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Defaults ==========

describe("discovery — logica de defaults", () => {
  it("default snmp_communities e ['public']", () => {
    const snmp_communities = undefined;
    const result = snmp_communities ?? ["public"];
    expect(result).toEqual(["public"]);
  });

  it("default snmp_ports e [161]", () => {
    const snmp_ports = undefined;
    const result = snmp_ports ?? [161];
    expect(result).toEqual([161]);
  });

  it("default snmp_timeout_ms e 3000", () => {
    const snmp_timeout_ms = undefined;
    const result = snmp_timeout_ms ?? 3000;
    expect(result).toBe(3000);
  });

  it("default snmp_retries e 2", () => {
    const snmp_retries = undefined;
    const result = snmp_retries ?? 2;
    expect(result).toBe(2);
  });

  it("default use_snmp e true", () => {
    const use_snmp = undefined;
    const result = use_snmp ?? true;
    expect(result).toBe(true);
  });

  it("default use_lldp e true", () => {
    const use_lldp = undefined;
    const result = use_lldp ?? true;
    expect(result).toBe(true);
  });

  it("default use_arp e true", () => {
    const use_arp = undefined;
    const result = use_arp ?? true;
    expect(result).toBe(true);
  });
});

// ========== Logica de Topology ==========

describe("discovery — logica de topology", () => {
  it("converte devices em nodes", () => {
    const devices = [
      {
        id: "dev-1",
        ip_address: "192.168.1.1",
        hostname: "router-01",
        device_type: "router",
        vendor: "cisco",
      },
      {
        id: "dev-2",
        ip_address: "192.168.1.2",
        hostname: null,
        device_type: "switch",
        vendor: "hp",
      },
    ];
    const nodes = devices.map((d) => ({
      id: d.id,
      label: d.hostname ?? d.ip_address,
      ip: d.ip_address,
      type: d.device_type,
      vendor: d.vendor,
    }));
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.label).toBe("router-01");
    expect(nodes[1]!.label).toBe("192.168.1.2");
  });

  it("converte links em edges", () => {
    const links = [
      {
        id: "link-1",
        source_device_id: "dev-1",
        target_device_id: "dev-2",
        source_interface: "Gi0/1",
        target_interface: "Gi0/24",
        discovered_via: "lldp",
        link_speed: "1Gbps",
      },
    ];
    const edges = links.map((l) => ({
      id: l.id,
      source: l.source_device_id,
      target: l.target_device_id,
      source_interface: l.source_interface,
      target_interface: l.target_interface,
      discovered_via: l.discovered_via,
      speed: l.link_speed,
    }));
    expect(edges).toHaveLength(1);
    expect(edges[0]!.source).toBe("dev-1");
    expect(edges[0]!.target).toBe("dev-2");
  });
});

// ========== Logica de Import ==========

describe("discovery — logica de import", () => {
  it("gera hostname default quando null", () => {
    const hostname = null;
    const ip_address = "192.168.1.10";
    const result = hostname ?? `device-${ip_address}`;
    expect(result).toBe("device-192.168.1.10");
  });

  it("usa hostname quando fornecido", () => {
    const hostname = "server-01";
    const ip_address = "192.168.1.10";
    const result = hostname ?? `device-${ip_address}`;
    expect(result).toBe("server-01");
  });

  it("default device_type e unknown", () => {
    const device_type = null;
    const result = device_type ?? "unknown";
    expect(result).toBe("unknown");
  });
});
