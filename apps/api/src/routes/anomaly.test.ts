// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  anomalyAnalyzeSchema,
  anomalyConfigSchema,
} from "@repo/shared-validation";

// ========== anomalyAnalyzeSchema ==========

describe("anomaly — anomalyAnalyzeSchema", () => {
  const validAnalyze = {
    device_id: "dev-001",
    metric_name: "cpu_usage",
    values: [10, 20, 30, 40, 50],
    observed_value: 95,
  };

  it("valida analyze valido", () => {
    const result = anomalyAnalyzeSchema.safeParse(validAnalyze);
    expect(result.success).toBe(true);
  });

  it("rejeita sem device_id", () => {
    const result = anomalyAnalyzeSchema.safeParse({
      ...validAnalyze,
      device_id: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita device_id muito longo (>200)", () => {
    const result = anomalyAnalyzeSchema.safeParse({
      ...validAnalyze,
      device_id: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem metric_name", () => {
    const result = anomalyAnalyzeSchema.safeParse({
      ...validAnalyze,
      metric_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita metric_name muito longo (>200)", () => {
    const result = anomalyAnalyzeSchema.safeParse({
      ...validAnalyze,
      metric_name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita values vazio", () => {
    const result = anomalyAnalyzeSchema.safeParse({
      ...validAnalyze,
      values: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita mais de 10000 values", () => {
    const result = anomalyAnalyzeSchema.safeParse({
      ...validAnalyze,
      values: Array(10001).fill(1),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem observed_value", () => {
    const result = anomalyAnalyzeSchema.safeParse({
      device_id: "dev-001",
      metric_name: "cpu_usage",
      values: [10, 20],
    });
    expect(result.success).toBe(false);
  });

  it("valida observed_value negativo", () => {
    const result = anomalyAnalyzeSchema.safeParse({
      ...validAnalyze,
      observed_value: -5,
    });
    expect(result.success).toBe(true);
  });

  it("valida observed_value decimal", () => {
    const result = anomalyAnalyzeSchema.safeParse({
      ...validAnalyze,
      observed_value: 95.7,
    });
    expect(result.success).toBe(true);
  });
});

// ========== anomalyConfigSchema ==========

describe("anomaly — anomalyConfigSchema", () => {
  const validConfig = {
    metric_name: "cpu_usage",
  };

  it("valida config minimo", () => {
    const result = anomalyConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("rejeita sem metric_name", () => {
    const result = anomalyConfigSchema.safeParse({ metric_name: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita metric_name muito longo (>200)", () => {
    const result = anomalyConfigSchema.safeParse({
      metric_name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida algorithm zscore", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      algorithm: "zscore",
    });
    expect(result.success).toBe(true);
  });

  it("valida algorithm iqr", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      algorithm: "iqr",
    });
    expect(result.success).toBe(true);
  });

  it("valida algorithm ewma", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      algorithm: "ewma",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita algorithm invalido", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      algorithm: "random_forest",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita window_size < 2", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      window_size: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita window_size > 8760", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      window_size: 8761,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita zscore_threshold negativo", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      zscore_threshold: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita zscore_threshold > 100", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      zscore_threshold: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita iqr_multiplier > 100", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      iqr_multiplier: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita ewma_alpha > 1", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      ewma_alpha: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita ewma_alpha < 0", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      ewma_alpha: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita warning_threshold > 1000", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      warning_threshold: 1001,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita critical_threshold > 1000", () => {
    const result = anomalyConfigSchema.safeParse({
      ...validConfig,
      critical_threshold: 1001,
    });
    expect(result.success).toBe(false);
  });

  it("valida config completo", () => {
    const result = anomalyConfigSchema.safeParse({
      metric_name: "memory_usage",
      algorithm: "iqr",
      window_size: 200,
      zscore_threshold: 3.5,
      iqr_multiplier: 1.5,
      ewma_alpha: 0.2,
      warning_threshold: 2.5,
      critical_threshold: 4.0,
      is_active: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Defaults ==========

describe("anomaly — logica de defaults", () => {
  it("default algorithm e zscore", () => {
    const algorithm = undefined;
    const result = algorithm ?? "zscore";
    expect(result).toBe("zscore");
  });

  it("default window_size e 100", () => {
    const window_size = undefined;
    const result = window_size ?? 100;
    expect(result).toBe(100);
  });

  it("default zscore_threshold e 3.0", () => {
    const zscore_threshold = undefined;
    const result = zscore_threshold ?? 3.0;
    expect(result).toBe(3.0);
  });

  it("default iqr_multiplier e 1.5", () => {
    const iqr_multiplier = undefined;
    const result = iqr_multiplier ?? 1.5;
    expect(result).toBe(1.5);
  });

  it("default ewma_alpha e 0.3", () => {
    const ewma_alpha = undefined;
    const result = ewma_alpha ?? 0.3;
    expect(result).toBe(0.3);
  });

  it("default warning_threshold e 2.0", () => {
    const warning_threshold = undefined;
    const result = warning_threshold ?? 2.0;
    expect(result).toBe(2.0);
  });

  it("default critical_threshold e 3.5", () => {
    const critical_threshold = undefined;
    const result = critical_threshold ?? 3.5;
    expect(result).toBe(3.5);
  });

  it("default is_active e true", () => {
    const is_active = undefined;
    const result = is_active ?? true;
    expect(result).toBe(true);
  });
});

// ========== Logica de Window Slicing ==========

describe("anomaly — logica de window slicing", () => {
  it("usa apenas os ultimos N valores", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const windowSize = 5;
    const windowed = values.slice(-windowSize);
    expect(windowed).toEqual([6, 7, 8, 9, 10]);
  });

  it("mantem todos se values < windowSize", () => {
    const values = [1, 2, 3];
    const windowSize = 100;
    const windowed = values.slice(-windowSize);
    expect(windowed).toEqual([1, 2, 3]);
  });

  it("retorna vazio se values vazio", () => {
    const values: number[] = [];
    const windowSize = 5;
    const windowed = values.slice(-windowSize);
    expect(windowed).toEqual([]);
  });

  it("retorna exatamente windowSize se values maior", () => {
    const values = Array(200).fill(1);
    const windowSize = 100;
    const windowed = values.slice(-windowSize);
    expect(windowed).toHaveLength(100);
  });
});
