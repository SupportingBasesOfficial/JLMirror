// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { driftBaselineSchema, driftScanSchema } from "@repo/shared-validation";

// ========== driftBaselineSchema ==========

describe("drift — driftBaselineSchema", () => {
  const validBaseline = {
    device_id: "dev-001",
    name: "Production Router Config",
    config_snapshot: { hostname: "router-01", interfaces: ["eth0", "eth1"] },
  };

  it("valida baseline valido", () => {
    const result = driftBaselineSchema.safeParse(validBaseline);
    expect(result.success).toBe(true);
  });

  it("rejeita sem device_id", () => {
    const result = driftBaselineSchema.safeParse({
      ...validBaseline,
      device_id: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita device_id muito longo (>200)", () => {
    const result = driftBaselineSchema.safeParse({
      ...validBaseline,
      device_id: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem name", () => {
    const result = driftBaselineSchema.safeParse({
      ...validBaseline,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita name muito longo (>200)", () => {
    const result = driftBaselineSchema.safeParse({
      ...validBaseline,
      name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida config_snapshot vazio", () => {
    const result = driftBaselineSchema.safeParse({
      ...validBaseline,
      config_snapshot: {},
    });
    expect(result.success).toBe(true);
  });

  it("valida config_snapshot com nested objects", () => {
    const result = driftBaselineSchema.safeParse({
      ...validBaseline,
      config_snapshot: {
        routing: { ospf: { enabled: true, areas: [0, 1] } },
      },
    });
    expect(result.success).toBe(true);
  });
});

// ========== driftScanSchema ==========

describe("drift — driftScanSchema", () => {
  const validScan = {
    device_id: "dev-001",
    current_config: { hostname: "router-01", interfaces: ["eth0"] },
  };

  it("valida scan valido", () => {
    const result = driftScanSchema.safeParse(validScan);
    expect(result.success).toBe(true);
  });

  it("rejeita sem device_id", () => {
    const result = driftScanSchema.safeParse({
      ...validScan,
      device_id: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita device_id muito longo (>200)", () => {
    const result = driftScanSchema.safeParse({
      ...validScan,
      device_id: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida current_config vazio", () => {
    const result = driftScanSchema.safeParse({
      ...validScan,
      current_config: {},
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Config Hash ==========

describe("drift — logica de config hash", () => {
  it("gera hash SHA-256 consistente", () => {
    const config = { hostname: "router-01", ip: "192.168.1.1" };
    const hash1 = createHash("sha256")
      .update(JSON.stringify(config))
      .digest("hex");
    const hash2 = createHash("sha256")
      .update(JSON.stringify(config))
      .digest("hex");
    expect(hash1).toBe(hash2);
  });

  it("gera hash diferente para configs diferentes", () => {
    const config1 = { hostname: "router-01" };
    const config2 = { hostname: "router-02" };
    const hash1 = createHash("sha256")
      .update(JSON.stringify(config1))
      .digest("hex");
    const hash2 = createHash("sha256")
      .update(JSON.stringify(config2))
      .digest("hex");
    expect(hash1).not.toBe(hash2);
  });

  it("gera hash de 64 caracteres hex", () => {
    const config = { test: true };
    const hash = createHash("sha256")
      .update(JSON.stringify(config))
      .digest("hex");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ========== Logica de Drift Detection ==========

describe("drift — logica de drift detection", () => {
  function detectDrifts(
    baseline: Record<string, unknown>,
    current: Record<string, unknown>,
  ): Array<{
    path: string;
    drift_type: string;
    old_value: string | null;
    new_value: string | null;
    severity: string;
  }> {
    const drifts: Array<{
      path: string;
      drift_type: string;
      old_value: string | null;
      new_value: string | null;
      severity: string;
    }> = [];

    const allKeys = new Set([
      ...Object.keys(baseline),
      ...Object.keys(current),
    ]);

    for (const key of allKeys) {
      const inBaseline = key in baseline;
      const inCurrent = key in current;
      const oldVal = inBaseline ? JSON.stringify(baseline[key]) : null;
      const newVal = inCurrent ? JSON.stringify(current[key]) : null;

      if (!inBaseline && inCurrent) {
        drifts.push({
          path: key,
          drift_type: "added",
          old_value: null,
          new_value: newVal,
          severity: "warning",
        });
      } else if (inBaseline && !inCurrent) {
        drifts.push({
          path: key,
          drift_type: "removed",
          old_value: oldVal,
          new_value: null,
          severity: "critical",
        });
      } else if (oldVal !== newVal) {
        drifts.push({
          path: key,
          drift_type: "modified",
          old_value: oldVal,
          new_value: newVal,
          severity: "warning",
        });
      }
    }

    return drifts;
  }

  it("detecta chave adicionada", () => {
    const drifts = detectDrifts(
      { hostname: "router-01" },
      { hostname: "router-01", new_key: "value" },
    );
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.drift_type).toBe("added");
    expect(drifts[0]!.severity).toBe("warning");
  });

  it("detecta chave removida", () => {
    const drifts = detectDrifts(
      { hostname: "router-01", old_key: "value" },
      { hostname: "router-01" },
    );
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.drift_type).toBe("removed");
    expect(drifts[0]!.severity).toBe("critical");
  });

  it("detecta chave modificada", () => {
    const drifts = detectDrifts(
      { hostname: "router-01" },
      { hostname: "router-02" },
    );
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.drift_type).toBe("modified");
    expect(drifts[0]!.severity).toBe("warning");
  });

  it("retorna vazio quando configs sao identicas", () => {
    const drifts = detectDrifts(
      { hostname: "router-01", ip: "10.0.0.1" },
      { hostname: "router-01", ip: "10.0.0.1" },
    );
    expect(drifts).toHaveLength(0);
  });

  it("detecta multiplas drifts simultaneas", () => {
    const drifts = detectDrifts({ a: 1, b: 2, c: 3 }, { a: 1, b: 99, d: 4 });
    expect(drifts).toHaveLength(3);
    expect(drifts.find((d) => d.path === "b")?.drift_type).toBe("modified");
    expect(drifts.find((d) => d.path === "c")?.drift_type).toBe("removed");
    expect(drifts.find((d) => d.path === "d")?.drift_type).toBe("added");
  });

  it("detecta configs vazias sem drifts", () => {
    const drifts = detectDrifts({}, {});
    expect(drifts).toHaveLength(0);
  });
});
