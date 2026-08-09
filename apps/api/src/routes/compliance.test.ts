// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createPolicySchema,
  updatePolicySchema,
  createScanSchema,
  updateViolationSchema,
} from "@repo/shared-validation";

// ========== createPolicySchema ==========

describe("compliance — createPolicySchema", () => {
  const validPolicy = {
    name: "GDPR Compliance Check",
    framework: "GDPR",
  };

  it("valida policy minima", () => {
    const result = createPolicySchema.safeParse(validPolicy);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createPolicySchema.safeParse({ ...validPolicy, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita name muito longo (>200)", () => {
    const result = createPolicySchema.safeParse({
      ...validPolicy,
      name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem framework", () => {
    const result = createPolicySchema.safeParse({ name: "Test" });
    expect(result.success).toBe(false);
  });

  it("valida com description", () => {
    const result = createPolicySchema.safeParse({
      ...validPolicy,
      description: "Verifica conformidade com GDPR",
    });
    expect(result.success).toBe(true);
  });

  it("valida severity low", () => {
    const result = createPolicySchema.safeParse({
      ...validPolicy,
      severity: "low",
    });
    expect(result.success).toBe(true);
  });

  it("valida severity critical", () => {
    const result = createPolicySchema.safeParse({
      ...validPolicy,
      severity: "critical",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita severity invalido", () => {
    const result = createPolicySchema.safeParse({
      ...validPolicy,
      severity: "extreme",
    });
    expect(result.success).toBe(false);
  });

  it("valida rule_type manual", () => {
    const result = createPolicySchema.safeParse({
      ...validPolicy,
      rule_type: "manual",
    });
    expect(result.success).toBe(true);
  });

  it("valida rule_type automated", () => {
    const result = createPolicySchema.safeParse({
      ...validPolicy,
      rule_type: "automated",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita rule_type invalido", () => {
    const result = createPolicySchema.safeParse({
      ...validPolicy,
      rule_type: "custom",
    });
    expect(result.success).toBe(false);
  });

  it("valida check_interval_hours", () => {
    const result = createPolicySchema.safeParse({
      ...validPolicy,
      check_interval_hours: 24,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita check_interval_hours < 1", () => {
    const result = createPolicySchema.safeParse({
      ...validPolicy,
      check_interval_hours: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita check_interval_hours > 720", () => {
    const result = createPolicySchema.safeParse({
      ...validPolicy,
      check_interval_hours: 721,
    });
    expect(result.success).toBe(false);
  });

  it("valida is_active default true", () => {
    const result = createPolicySchema.safeParse(validPolicy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(true);
    }
  });

  it("valida rule_config", () => {
    const result = createPolicySchema.safeParse({
      ...validPolicy,
      rule_config: { require_mfa: true, require_ssl_valid: true },
    });
    expect(result.success).toBe(true);
  });
});

// ========== updatePolicySchema ==========

describe("compliance — updatePolicySchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updatePolicySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update name", () => {
    const result = updatePolicySchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(true);
  });

  it("valida update severity", () => {
    const result = updatePolicySchema.safeParse({ severity: "high" });
    expect(result.success).toBe(true);
  });

  it("rejeita severity invalido no update", () => {
    const result = updatePolicySchema.safeParse({ severity: "extreme" });
    expect(result.success).toBe(false);
  });

  it("valida update is_active", () => {
    const result = updatePolicySchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it("valida update framework", () => {
    const result = updatePolicySchema.safeParse({ framework: "ISO27001" });
    expect(result.success).toBe(true);
  });

  it("valida update check_interval_hours", () => {
    const result = updatePolicySchema.safeParse({
      check_interval_hours: 48,
    });
    expect(result.success).toBe(true);
  });
});

// ========== createScanSchema ==========

describe("compliance — createScanSchema", () => {
  it("valida com policy_id UUID", () => {
    const result = createScanSchema.safeParse({
      policy_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem policy_id", () => {
    const result = createScanSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita policy_id nao-UUID", () => {
    const result = createScanSchema.safeParse({ policy_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});

// ========== updateViolationSchema ==========

describe("compliance — updateViolationSchema", () => {
  it("valida status open", () => {
    const result = updateViolationSchema.safeParse({ status: "open" });
    expect(result.success).toBe(true);
  });

  it("valida status acknowledged", () => {
    const result = updateViolationSchema.safeParse({
      status: "acknowledged",
    });
    expect(result.success).toBe(true);
  });

  it("valida status remediated", () => {
    const result = updateViolationSchema.safeParse({ status: "remediated" });
    expect(result.success).toBe(true);
  });

  it("valida status false_positive", () => {
    const result = updateViolationSchema.safeParse({
      status: "false_positive",
    });
    expect(result.success).toBe(true);
  });

  it("valida status wont_fix", () => {
    const result = updateViolationSchema.safeParse({ status: "wont_fix" });
    expect(result.success).toBe(true);
  });

  it("rejeita status invalido", () => {
    const result = updateViolationSchema.safeParse({ status: "closed" });
    expect(result.success).toBe(false);
  });

  it("rejeita sem status", () => {
    const result = updateViolationSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Compliance Score ==========

describe("compliance — logica de compliance score", () => {
  function calcScore(passed: number, total: number): number {
    return total > 0 ? (passed / total) * 100 : 0;
  }

  it("todos checks passam = 100%", () => {
    expect(calcScore(5, 5)).toBe(100);
  });

  it("nenhum check passa = 0%", () => {
    expect(calcScore(0, 5)).toBe(0);
  });

  it("metade dos checks = 50%", () => {
    expect(calcScore(3, 6)).toBe(50);
  });

  it("total 0 = 0%", () => {
    expect(calcScore(0, 0)).toBe(0);
  });
});
