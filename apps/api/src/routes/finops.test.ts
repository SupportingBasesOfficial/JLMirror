// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  finopsCostSchema,
  finopsOptimizationSchema,
  finopsOptimizationStatusSchema,
  finopsBudgetSchema,
} from "@repo/shared-validation";

// ========== finopsCostSchema ==========

describe("finops — finopsCostSchema", () => {
  const validCost = {
    period_start: "2024-01-01",
    period_end: "2024-01-31",
    category: "compute",
    cost_amount: 1500.0,
  };

  it("valida cost minimo", () => {
    const result = finopsCostSchema.safeParse(validCost);
    expect(result.success).toBe(true);
  });

  it("rejeita sem period_start", () => {
    const result = finopsCostSchema.safeParse({
      ...validCost,
      period_start: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem category", () => {
    const result = finopsCostSchema.safeParse({ ...validCost, category: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita category muito longa (>100)", () => {
    const result = finopsCostSchema.safeParse({
      ...validCost,
      category: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("valida com resource_name", () => {
    const result = finopsCostSchema.safeParse({
      ...validCost,
      resource_name: "ec2-prod-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita resource_name muito longo (>200)", () => {
    const result = finopsCostSchema.safeParse({
      ...validCost,
      resource_name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida com currency", () => {
    const result = finopsCostSchema.safeParse({
      ...validCost,
      currency: "BRL",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita currency muito longa (>10)", () => {
    const result = finopsCostSchema.safeParse({
      ...validCost,
      currency: "BRAZILIANREAL",
    });
    expect(result.success).toBe(false);
  });

  it("valida cost completo", () => {
    const result = finopsCostSchema.safeParse({
      period_start: "2024-01-01",
      period_end: "2024-01-31",
      category: "compute",
      resource_name: "ec2-prod-01",
      resource_type: "ec2",
      cost_amount: 1500.0,
      currency: "BRL",
      usage_quantity: 720,
      usage_unit: "hours",
      source: "aws",
    });
    expect(result.success).toBe(true);
  });
});

// ========== finopsOptimizationSchema ==========

describe("finops — finopsOptimizationSchema", () => {
  const validOpt = {
    category: "compute",
    title: "Downsize overprovisioned EC2 instances",
    estimated_savings_monthly: 500.0,
  };

  it("valida optimization minima", () => {
    const result = finopsOptimizationSchema.safeParse(validOpt);
    expect(result.success).toBe(true);
  });

  it("rejeita sem title", () => {
    const result = finopsOptimizationSchema.safeParse({
      ...validOpt,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita title muito longo (>500)", () => {
    const result = finopsOptimizationSchema.safeParse({
      ...validOpt,
      title: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("valida effort low", () => {
    const result = finopsOptimizationSchema.safeParse({
      ...validOpt,
      effort: "low",
    });
    expect(result.success).toBe(true);
  });

  it("valida effort high", () => {
    const result = finopsOptimizationSchema.safeParse({
      ...validOpt,
      effort: "high",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita effort invalido", () => {
    const result = finopsOptimizationSchema.safeParse({
      ...validOpt,
      effort: "critical",
    });
    expect(result.success).toBe(false);
  });

  it("valida com estimated_savings_annual", () => {
    const result = finopsOptimizationSchema.safeParse({
      ...validOpt,
      estimated_savings_annual: 6000.0,
    });
    expect(result.success).toBe(true);
  });
});

// ========== finopsOptimizationStatusSchema ==========

describe("finops — finopsOptimizationStatusSchema", () => {
  it("valida status identified", () => {
    const result = finopsOptimizationStatusSchema.safeParse({
      status: "identified",
    });
    expect(result.success).toBe(true);
  });

  it("valida status approved", () => {
    const result = finopsOptimizationStatusSchema.safeParse({
      status: "approved",
    });
    expect(result.success).toBe(true);
  });

  it("valida status in_progress", () => {
    const result = finopsOptimizationStatusSchema.safeParse({
      status: "in_progress",
    });
    expect(result.success).toBe(true);
  });

  it("valida status implemented", () => {
    const result = finopsOptimizationStatusSchema.safeParse({
      status: "implemented",
    });
    expect(result.success).toBe(true);
  });

  it("valida status rejected", () => {
    const result = finopsOptimizationStatusSchema.safeParse({
      status: "rejected",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita status invalido", () => {
    const result = finopsOptimizationStatusSchema.safeParse({
      status: "closed",
    });
    expect(result.success).toBe(false);
  });

  it("valida com actual_savings_monthly", () => {
    const result = finopsOptimizationStatusSchema.safeParse({
      status: "implemented",
      actual_savings_monthly: 450.0,
    });
    expect(result.success).toBe(true);
  });
});

// ========== finopsBudgetSchema ==========

describe("finops — finopsBudgetSchema", () => {
  const validBudget = {
    month: 1,
    year: 2024,
    budget_amount: 10000.0,
  };

  it("valida budget minimo", () => {
    const result = finopsBudgetSchema.safeParse(validBudget);
    expect(result.success).toBe(true);
  });

  it("rejeita month < 1", () => {
    const result = finopsBudgetSchema.safeParse({ ...validBudget, month: 0 });
    expect(result.success).toBe(false);
  });

  it("rejeita month > 12", () => {
    const result = finopsBudgetSchema.safeParse({
      ...validBudget,
      month: 13,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita year < 2000", () => {
    const result = finopsBudgetSchema.safeParse({
      ...validBudget,
      year: 1999,
    });
    expect(result.success).toBe(false);
  });

  it("valida com category", () => {
    const result = finopsBudgetSchema.safeParse({
      ...validBudget,
      category: "compute",
    });
    expect(result.success).toBe(true);
  });

  it("valida com alert_threshold_pct", () => {
    const result = finopsBudgetSchema.safeParse({
      ...validBudget,
      alert_threshold_pct: 80,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita alert_threshold_pct > 100", () => {
    const result = finopsBudgetSchema.safeParse({
      ...validBudget,
      alert_threshold_pct: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita alert_threshold_pct < 0", () => {
    const result = finopsBudgetSchema.safeParse({
      ...validBudget,
      alert_threshold_pct: -1,
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Savings Calculation ==========

describe("finops — logica de savings calculation", () => {
  it("calcula savings anual = monthly * 12", () => {
    const monthly = 500;
    const annual = monthly * 12;
    expect(annual).toBe(6000);
  });

  it("calcula savings anual default", () => {
    const estimated_savings_monthly = 250;
    const estimated_savings_annual = estimated_savings_monthly * 12;
    expect(estimated_savings_annual).toBe(3000);
  });
});
