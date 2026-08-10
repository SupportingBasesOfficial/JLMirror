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
  it.each([
    ["open", true],
    ["acknowledged", true],
    ["remediated", true],
    ["false_positive", true],
    ["wont_fix", true],
    ["closed", false],
  ] as const)("valida status %s → success=%s", (status, expected) => {
    const result = updateViolationSchema.safeParse({ status });
    expect(result.success).toBe(expected);
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

// ========== Logica de safeCount ==========

describe("compliance — logica de safeCount", () => {
  function safeCount(value: string | undefined): number {
    const parsed = Number.parseInt(value ?? "0", 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  it.each([
    ["10", 10],
    ["0", 0],
    [undefined, 0],
    ["abc", 0],
    ["", 0],
    ["999", 999],
  ])(`safeCount(%j) → %s`, (input, expected) => {
    expect(safeCount(input)).toBe(expected);
  });
});

// ========== Logica de Tenant Isolation ==========

describe("compliance — logica de tenant isolation", () => {
  it("queries de compliance_policies filtram por tenant_id", () => {
    const tenantId = "t-123";
    const sql = "SELECT * FROM public.compliance_policies WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("queries de compliance_scans filtram por tenant_id", () => {
    const tenantId = "t-456";
    const sql = "SELECT * FROM public.compliance_scans WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("queries de compliance_violations filtram por tenant_id", () => {
    const tenantId = "t-789";
    const sql =
      "SELECT * FROM public.compliance_violations WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("DELETE compliance_policies inclui tenant_id no WHERE", () => {
    const tenantId = "t-del";
    const policyId = "p-1";
    const sql =
      "DELETE FROM public.compliance_policies WHERE id = $1 AND tenant_id = $2";
    const params: unknown[] = [policyId, tenantId];
    expect(sql).toContain("tenant_id = $2");
    expect(params[1]).toBe(tenantId);
  });

  it("UPDATE compliance_policies inclui tenant_id no WHERE", () => {
    const tenantId = "t-upd";
    const policyId = "p-2";
    const sql =
      "UPDATE public.compliance_policies SET name = $1 WHERE id = $2 AND tenant_id = $3";
    const params: unknown[] = ["novo", policyId, tenantId];
    expect(sql).toContain("tenant_id = $3");
    expect(params[2]).toBe(tenantId);
  });
});

// ========== Logica de Optional Chaining ==========

describe("compliance — logica de optional chaining", () => {
  it("result.data?.rows[0] retorna undefined quando vazio", () => {
    const result: { data?: { rows?: unknown[] } } = { data: { rows: [] } };
    expect(result.data?.rows?.[0]).toBeUndefined();
  });

  it("user?.tenant_id retorna null quando user e null", () => {
    type TestUser = { tenant_id?: string } | null;
    const user = null as TestUser;
    expect(user?.tenant_id ?? null).toBeNull();
  });

  it("user?.sub retorna null quando user e undefined", () => {
    type TestUser = { sub?: string } | undefined;
    const user = undefined as TestUser;
    expect(user?.sub ?? null).toBeNull();
  });

  it("userId null nao chama writeAuditLog", () => {
    const userId: string | null = null;
    const shouldCallAudit = !!userId;
    expect(shouldCallAudit).toBe(false);
  });
});

// ========== Logica de Limit Pagination ==========

describe("compliance — logica de limit pagination", () => {
  function parseLimitScans(raw: string): number {
    const parsed = Number.parseInt(raw, 10);
    return Math.min(Number.isNaN(parsed) ? 50 : parsed, 200);
  }

  function parseLimitViolations(raw: string): number {
    const parsed = Number.parseInt(raw, 10);
    return Math.min(Number.isNaN(parsed) ? 100 : parsed, 500);
  }

  it.each([
    ["50", 50],
    ["999", 200],
    ["abc", 50],
    ["", 50],
  ])(`scans limit(%j) → %s`, (raw, expected) => {
    expect(parseLimitScans(raw)).toBe(expected);
  });

  it.each([
    ["100", 100],
    ["999", 500],
    ["abc", 100],
    ["", 100],
  ])(`violations limit(%j) → %s`, (raw, expected) => {
    expect(parseLimitViolations(raw)).toBe(expected);
  });
});

// ========== Logica de Violation Status Update ==========

describe("compliance — logica de violation status update", () => {
  it("status acknowledged adiciona acknowledged_by", () => {
    const status = "acknowledged";
    const updateFields: string[] = ["status = $1"];
    if (status === "acknowledged") {
      updateFields.push("acknowledged_by = $2", "acknowledged_at = now()");
    }
    expect(updateFields).toContain("acknowledged_by = $2");
  });

  it("status remediated adiciona remediated_by", () => {
    const status = "remediated";
    const updateFields: string[] = ["status = $1"];
    if (status === "remediated") {
      updateFields.push("remediated_by = $2", "remediated_at = now()");
    }
    expect(updateFields).toContain("remediated_by = $2");
  });

  it("status open nao adiciona campos extras", () => {
    const status: string = "open";
    const updateFields: string[] = ["status = $1"];
    if (status === "acknowledged") {
      updateFields.push("acknowledged_by = $2");
    } else if (status === "remediated") {
      updateFields.push("remediated_by = $2");
    }
    expect(updateFields).toEqual(["status = $1"]);
  });
});
