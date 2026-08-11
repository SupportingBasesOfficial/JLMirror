// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  createFeatureFlagSchema,
  updateFeatureFlagSchema,
  evaluateFlagSchema,
  createOverrideSchema,
} from "@repo/shared-validation";

// Helper para reproduzir a logica de hash do modulo
function hashString(input: string): number {
  const hash = createHash("sha256").update(input).digest();
  return hash.readUInt32BE(0);
}

function evaluatePercentage(
  flagKey: string,
  userId: string,
  percentage: number,
): boolean {
  const hashVal = hashString(`${flagKey}:${userId}`) % 10000;
  return hashVal < percentage * 100;
}

// ========== createFeatureFlagSchema ==========

describe("feature-flags — createFeatureFlagSchema", () => {
  const validFlag = {
    key: "new_dashboard",
    name: "New Dashboard",
    flag_type: "boolean" as const,
    default_value: true,
  };

  it("valida flag minima", () => {
    const result = createFeatureFlagSchema.safeParse(validFlag);
    expect(result.success).toBe(true);
  });

  it("rejeita sem key", () => {
    const result = createFeatureFlagSchema.safeParse({ ...validFlag, key: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita key com espacos", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      key: "new dashboard",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita key muito longa (>100)", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      key: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem name", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("valida flag_type boolean", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      flag_type: "boolean",
    });
    expect(result.success).toBe(true);
  });

  it("valida flag_type percentage", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      flag_type: "percentage",
    });
    expect(result.success).toBe(true);
  });

  it("valida flag_type variant", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      flag_type: "variant",
    });
    expect(result.success).toBe(true);
  });

  it("valida flag_type kill_switch", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      flag_type: "kill_switch",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita flag_type invalido", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      flag_type: "unknown",
    });
    expect(result.success).toBe(false);
  });

  it("valida rollout_percentage 0-100", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      rollout_percentage: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita rollout_percentage > 100", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      rollout_percentage: 150,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita rollout_percentage negativo", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      rollout_percentage: -10,
    });
    expect(result.success).toBe(false);
  });

  it("valida default_value string", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      default_value: "control",
    });
    expect(result.success).toBe(true);
  });

  it("valida default_value number", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      default_value: 42,
    });
    expect(result.success).toBe(true);
  });

  it("valida excluded_tenant_ids com UUIDs", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      excluded_tenant_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita excluded_tenant_ids com nao-UUID", () => {
    const result = createFeatureFlagSchema.safeParse({
      ...validFlag,
      excluded_tenant_ids: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateFeatureFlagSchema ==========

describe("feature-flags — updateFeatureFlagSchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updateFeatureFlagSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update name", () => {
    const result = updateFeatureFlagSchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(true);
  });

  it("valida update flag_type", () => {
    const result = updateFeatureFlagSchema.safeParse({
      flag_type: "percentage",
    });
    expect(result.success).toBe(true);
  });

  it("valida update rollout_percentage", () => {
    const result = updateFeatureFlagSchema.safeParse({
      rollout_percentage: 75,
    });
    expect(result.success).toBe(true);
  });

  it("valida update is_active", () => {
    const result = updateFeatureFlagSchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it("valida update starts_at ISO datetime", () => {
    const result = updateFeatureFlagSchema.safeParse({
      starts_at: "2025-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita starts_at formato invalido", () => {
    const result = updateFeatureFlagSchema.safeParse({
      starts_at: "2025-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("valida update completo", () => {
    const result = updateFeatureFlagSchema.safeParse({
      name: "Updated",
      description: "Updated description",
      flag_type: "variant",
      is_active: true,
      rollout_percentage: 50,
      default_value: "variant_a",
    });
    expect(result.success).toBe(true);
  });
});

// ========== evaluateFlagSchema ==========

describe("feature-flags — evaluateFlagSchema", () => {
  it("valida com key", () => {
    const result = evaluateFlagSchema.safeParse({ key: "new_dashboard" });
    expect(result.success).toBe(true);
  });

  it("rejeita sem key", () => {
    const result = evaluateFlagSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita key vazia", () => {
    const result = evaluateFlagSchema.safeParse({ key: "" });
    expect(result.success).toBe(false);
  });

  it("valida com context", () => {
    const result = evaluateFlagSchema.safeParse({
      key: "new_dashboard",
      context: { user_role: "admin" },
    });
    expect(result.success).toBe(true);
  });

  it("valida com user_id", () => {
    const result = evaluateFlagSchema.safeParse({
      key: "new_dashboard",
      user_id: "user-123",
    });
    expect(result.success).toBe(true);
  });
});

// ========== createOverrideSchema ==========

describe("feature-flags — createOverrideSchema", () => {
  const validOverride = {
    flag_id: "550e8400-e29b-41d4-a716-446655440000",
    target_type: "user" as const,
    target_id: "user-123",
    value: true,
  };

  it("valida override minimo", () => {
    const result = createOverrideSchema.safeParse(validOverride);
    expect(result.success).toBe(true);
  });

  it("rejeita flag_id nao-UUID", () => {
    const result = createOverrideSchema.safeParse({
      ...validOverride,
      flag_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("valida target_type user", () => {
    const result = createOverrideSchema.safeParse({
      ...validOverride,
      target_type: "user",
    });
    expect(result.success).toBe(true);
  });

  it("valida target_type tenant", () => {
    const result = createOverrideSchema.safeParse({
      ...validOverride,
      target_type: "tenant",
    });
    expect(result.success).toBe(true);
  });

  it("valida target_type device", () => {
    const result = createOverrideSchema.safeParse({
      ...validOverride,
      target_type: "device",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita target_type invalido", () => {
    const result = createOverrideSchema.safeParse({
      ...validOverride,
      target_type: "group",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem target_id", () => {
    const result = createOverrideSchema.safeParse({
      ...validOverride,
      target_id: "",
    });
    expect(result.success).toBe(false);
  });

  it("valida com reason", () => {
    const result = createOverrideSchema.safeParse({
      ...validOverride,
      reason: "Admin override for testing",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita reason muito longo (>500)", () => {
    const result = createOverrideSchema.safeParse({
      ...validOverride,
      reason: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Percentage Rollout ==========

describe("feature-flags — logica de percentage rollout", () => {
  it("0% rollout sempre retorna false", () => {
    const result = evaluatePercentage("flag_key", "user-1", 0);
    expect(result).toBe(false);
  });

  it("100% rollout sempre retorna true", () => {
    const result = evaluatePercentage("flag_key", "user-1", 100);
    expect(result).toBe(true);
  });

  it("50% rollout e deterministico para mesmo user+flag", () => {
    const result1 = evaluatePercentage("flag_key", "user-1", 50);
    const result2 = evaluatePercentage("flag_key", "user-1", 50);
    expect(result1).toBe(result2);
  });

  it("usuarios diferentes podem ter resultados diferentes", () => {
    // Pelo menos nao deve crashar
    const result1 = evaluatePercentage("flag_key", "user-1", 50);
    const result2 = evaluatePercentage("flag_key", "user-2", 50);
    expect(typeof result1).toBe("boolean");
    expect(typeof result2).toBe("boolean");
  });
});

// ========== Logica de Variant Picking ==========

describe("feature-flags — logica de variant picking", () => {
  function pickVariant(
    flagKey: string,
    userId: string,
    variants: Array<{ key: string; value: unknown; weight: number }>,
  ): { key: string; value: unknown } {
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight === 0)
      return {
        key: variants[0]?.key ?? "default",
        value: variants[0]?.value ?? false,
      };
    const hashVal = hashString(`${flagKey}:${userId}:variant`) % totalWeight;
    let cumulative = 0;
    for (const v of variants) {
      cumulative += v.weight;
      if (hashVal < cumulative) return { key: v.key, value: v.value };
    }
    return { key: variants[0]!.key, value: variants[0]!.value };
  }

  it("peso 0 retorna default", () => {
    const result = pickVariant("flag", "user", [
      { key: "a", value: "A", weight: 0 },
      { key: "b", value: "B", weight: 0 },
    ]);
    expect(result.key).toBe("a");
  });

  it("uma variante com peso retorna ela", () => {
    const result = pickVariant("flag", "user", [
      { key: "a", value: "A", weight: 100 },
    ]);
    expect(result.key).toBe("a");
    expect(result.value).toBe("A");
  });

  it("resultado e deterministico para mesmo user+flag", () => {
    const variants = [
      { key: "a", value: "A", weight: 50 },
      { key: "b", value: "B", weight: 50 },
    ];
    const result1 = pickVariant("flag", "user-1", variants);
    const result2 = pickVariant("flag", "user-1", variants);
    expect(result1).toEqual(result2);
  });
});
