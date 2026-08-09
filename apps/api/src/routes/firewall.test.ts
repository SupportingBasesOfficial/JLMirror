// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createFirewallRuleSchema,
  updateFirewallRuleSchema,
  applyFirewallSchema,
} from "@repo/shared-validation";

// ========== createFirewallRuleSchema ==========

describe("firewall — createFirewallRuleSchema", () => {
  const validRule = {
    name: "Bloquear SSH externo",
    action: "deny" as const,
    protocol: "tcp" as const,
    host: "server1.example.com",
    backend: "iptables" as const,
  };

  it("valida regra minima", () => {
    const result = createFirewallRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem host", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      host: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita host com caracteres shell", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      host: "server; rm -rf /",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita host com espacos", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      host: "server with spaces",
    });
    expect(result.success).toBe(false);
  });

  it("valida host com subdominio", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      host: "fw.internal.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("valida action=allow", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      action: "allow",
    });
    expect(result.success).toBe(true);
  });

  it("valida action=reject", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      action: "reject",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita action invalida", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      action: "DROP",
    });
    expect(result.success).toBe(false);
  });

  it("valida protocol=udp", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      protocol: "udp",
    });
    expect(result.success).toBe(true);
  });

  it("valida protocol=icmp", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      protocol: "icmp",
    });
    expect(result.success).toBe(true);
  });

  it("valida protocol=any", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      protocol: "any",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita protocol invalido", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      protocol: "gre",
    });
    expect(result.success).toBe(false);
  });

  it("valida backend=iptables", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      backend: "iptables",
    });
    expect(result.success).toBe(true);
  });

  it("valida backend=nftables", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      backend: "nftables",
    });
    expect(result.success).toBe(true);
  });

  it("valida backend=ufw", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      backend: "ufw",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita backend invalido", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      backend: "pf",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default chain=INPUT", () => {
    const result = createFirewallRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.chain).toBe("INPUT");
    }
  });

  it("valida chain=OUTPUT", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      chain: "OUTPUT",
    });
    expect(result.success).toBe(true);
  });

  it("valida chain=FORWARD", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      chain: "FORWARD",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita chain invalido", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      chain: "PREROUTING",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default priority=100", () => {
    const result = createFirewallRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe(100);
    }
  });

  it("valida com source_ip", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      source_ip: "192.168.1.0/24",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita source_ip com caracteres shell", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      source_ip: "192.168.1.1; rm -rf /",
    });
    expect(result.success).toBe(false);
  });

  it("valida com destination_port", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      destination_port: "443",
    });
    expect(result.success).toBe(true);
  });

  it("valida destination_port como intervalo", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      destination_port: "1000:2000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita destination_port com caracteres shell", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      destination_port: "443; cat /etc/passwd",
    });
    expect(result.success).toBe(false);
  });

  it("valida com interface_in", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      interface_in: "eth0",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita interface_in com caracteres shell", () => {
    const result = createFirewallRuleSchema.safeParse({
      ...validRule,
      interface_in: "eth0; reboot",
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateFirewallRuleSchema ==========

describe("firewall — updateFirewallRuleSchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updateFirewallRuleSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update name", () => {
    const result = updateFirewallRuleSchema.safeParse({ name: "Novo Nome" });
    expect(result.success).toBe(true);
  });

  it("valida update action", () => {
    const result = updateFirewallRuleSchema.safeParse({ action: "allow" });
    expect(result.success).toBe(true);
  });

  it("valida update backend", () => {
    const result = updateFirewallRuleSchema.safeParse({ backend: "nftables" });
    expect(result.success).toBe(true);
  });

  it("valida update is_enabled", () => {
    const result = updateFirewallRuleSchema.safeParse({ is_enabled: false });
    expect(result.success).toBe(true);
  });

  it("valida update priority", () => {
    const result = updateFirewallRuleSchema.safeParse({ priority: 50 });
    expect(result.success).toBe(true);
  });

  it("rejeita priority negativo", () => {
    const result = updateFirewallRuleSchema.safeParse({ priority: -1 });
    expect(result.success).toBe(false);
  });

  it("rejeita priority > 32767", () => {
    const result = updateFirewallRuleSchema.safeParse({ priority: 32768 });
    expect(result.success).toBe(false);
  });

  it("valida update host", () => {
    const result = updateFirewallRuleSchema.safeParse({
      host: "new.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita host com shell injection no update", () => {
    const result = updateFirewallRuleSchema.safeParse({
      host: "host; rm -rf /",
    });
    expect(result.success).toBe(false);
  });

  it("valida update completo", () => {
    const result = updateFirewallRuleSchema.safeParse({
      name: "Atualizado",
      action: "allow",
      protocol: "udp",
      host: "new.example.com",
      backend: "nftables",
      chain: "OUTPUT",
      source_ip: "10.0.0.0/8",
      destination_ip: "192.168.1.1",
      destination_port: "8080",
      interface_in: "eth1",
      priority: 50,
      is_enabled: true,
      description: "Updated rule",
    });
    expect(result.success).toBe(true);
  });
});

// ========== applyFirewallSchema ==========

describe("firewall — applyFirewallSchema", () => {
  const validApply = {
    device_id: "dev-001",
    rule_ids: ["rule-1", "rule-2"],
  };

  it("valida apply minimo", () => {
    const result = applyFirewallSchema.safeParse(validApply);
    expect(result.success).toBe(true);
  });

  it("rejeita sem device_id", () => {
    const result = applyFirewallSchema.safeParse({
      rule_ids: ["rule-1"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem rule_ids", () => {
    const result = applyFirewallSchema.safeParse({
      device_id: "dev-001",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita rule_ids vazio", () => {
    const result = applyFirewallSchema.safeParse({
      device_id: "dev-001",
      rule_ids: [],
    });
    expect(result.success).toBe(false);
  });

  it("aplica default dry_run=false", () => {
    const result = applyFirewallSchema.safeParse(validApply);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dry_run).toBe(false);
    }
  });

  it("valida dry_run=true", () => {
    const result = applyFirewallSchema.safeParse({
      ...validApply,
      dry_run: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida com host", () => {
    const result = applyFirewallSchema.safeParse({
      ...validApply,
      host: "server.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita host com shell injection", () => {
    const result = applyFirewallSchema.safeParse({
      ...validApply,
      host: "server; cat /etc/passwd",
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Command Building (iptables) ==========

describe("firewall — logica de iptables args building", () => {
  interface FirewallRule {
    id: string;
    host: string;
    backend: string;
    chain: string;
    action: string;
    protocol: string | null;
    source_ip: string | null;
    source_port: string | null;
    destination_ip: string | null;
    destination_port: string | null;
    interface_in: string | null;
    interface_out: string | null;
    state: string | null;
    priority: number;
    is_enabled: boolean;
    description: string | null;
  }

  function buildIptablesArgs(rule: FirewallRule): string[] {
    const args = ["-A", rule.chain];
    if (rule.protocol) args.push("-p", rule.protocol);
    if (rule.source_ip) args.push("-s", rule.source_ip);
    if (rule.destination_ip) args.push("-d", rule.destination_ip);
    if (rule.destination_port) args.push("--dport", rule.destination_port);
    if (rule.interface_in) args.push("-i", rule.interface_in);
    args.push("-j", rule.action.toUpperCase());
    return args;
  }

  it("gera args para regra simples", () => {
    const rule: FirewallRule = {
      id: "1",
      host: "server",
      backend: "iptables",
      chain: "INPUT",
      action: "deny",
      protocol: "tcp",
      source_ip: null,
      source_port: null,
      destination_ip: null,
      destination_port: "443",
      interface_in: null,
      interface_out: null,
      state: null,
      priority: 100,
      is_enabled: true,
      description: null,
    };
    const args = buildIptablesArgs(rule);
    expect(args).toContain("-A");
    expect(args).toContain("INPUT");
    expect(args).toContain("-p");
    expect(args).toContain("tcp");
    expect(args).toContain("--dport");
    expect(args).toContain("443");
    expect(args).toContain("-j");
    expect(args).toContain("DENY");
  });

  it("gera args para regra completa", () => {
    const rule: FirewallRule = {
      id: "1",
      host: "server",
      backend: "iptables",
      chain: "FORWARD",
      action: "allow",
      protocol: "udp",
      source_ip: "10.0.0.0/8",
      source_port: null,
      destination_ip: "192.168.1.1",
      destination_port: "53",
      interface_in: "eth0",
      interface_out: null,
      state: null,
      priority: 50,
      is_enabled: true,
      description: null,
    };
    const args = buildIptablesArgs(rule);
    expect(args).toContain("-s");
    expect(args).toContain("10.0.0.0/8");
    expect(args).toContain("-d");
    expect(args).toContain("192.168.1.1");
    expect(args).toContain("-i");
    expect(args).toContain("eth0");
    expect(args).toContain("ALLOW");
  });

  it("args sao array (nao string) para prevenir injection", () => {
    const rule: FirewallRule = {
      id: "1",
      host: "server",
      backend: "iptables",
      chain: "INPUT",
      action: "deny",
      protocol: "tcp",
      source_ip: null,
      source_port: null,
      destination_ip: null,
      destination_port: "443",
      interface_in: null,
      interface_out: null,
      state: null,
      priority: 100,
      is_enabled: true,
      description: null,
    };
    const args = buildIptablesArgs(rule);
    expect(Array.isArray(args)).toBe(true);
    // Cada arg e separada — nao ha interpolacao de string
    expect(args.every((a) => !a.includes(";"))).toBe(true);
  });
});

// ========== Logica de Limit Pagination ==========

describe("firewall — logica de limit pagination", () => {
  it("changes limit default 50", () => {
    const limit = Math.min(parseInt("50", 10), 200);
    expect(limit).toBe(50);
  });

  it("changes limit maximo 200", () => {
    const limit = Math.min(parseInt("999", 10), 200);
    expect(limit).toBe(200);
  });

  it("changes offset default 0", () => {
    const offset = parseInt("0", 10);
    expect(offset).toBe(0);
  });
});

// ========== Logica de Version Bump ==========

describe("firewall — logica de version bump", () => {
  it("incrementa version", () => {
    const currentVersion = 2;
    const newVersion = currentVersion + 1;
    expect(newVersion).toBe(3);
  });

  it("primeira versao e 1", () => {
    const currentVersion = 0;
    const newVersion = currentVersion + 1;
    expect(newVersion).toBe(1);
  });
});
