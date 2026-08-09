// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  predictionAnalyzeSchema,
  predictionConfigSchema,
} from "@repo/shared-validation";

// ========== predictionAnalyzeSchema ==========

describe("predictions — predictionAnalyzeSchema", () => {
  const validAnalyze = {
    device_id: "dev-001",
    metric_name: "cpu_usage",
    values: [10, 20, 30, 40, 50],
  };

  it("valida analyze valido", () => {
    const result = predictionAnalyzeSchema.safeParse(validAnalyze);
    expect(result.success).toBe(true);
  });

  it("rejeita sem device_id", () => {
    const result = predictionAnalyzeSchema.safeParse({
      ...validAnalyze,
      device_id: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita device_id muito longo (>200)", () => {
    const result = predictionAnalyzeSchema.safeParse({
      ...validAnalyze,
      device_id: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem metric_name", () => {
    const result = predictionAnalyzeSchema.safeParse({
      ...validAnalyze,
      metric_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita metric_name muito longo (>200)", () => {
    const result = predictionAnalyzeSchema.safeParse({
      ...validAnalyze,
      metric_name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita values vazio", () => {
    const result = predictionAnalyzeSchema.safeParse({
      ...validAnalyze,
      values: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita mais de 10000 values", () => {
    const result = predictionAnalyzeSchema.safeParse({
      ...validAnalyze,
      values: Array(10001).fill(1),
    });
    expect(result.success).toBe(false);
  });

  it("valida values com um elemento", () => {
    const result = predictionAnalyzeSchema.safeParse({
      ...validAnalyze,
      values: [42],
    });
    expect(result.success).toBe(true);
  });

  it("valida values com decimais", () => {
    const result = predictionAnalyzeSchema.safeParse({
      ...validAnalyze,
      values: [10.5, 20.3, 30.7],
    });
    expect(result.success).toBe(true);
  });
});

// ========== predictionConfigSchema ==========

describe("predictions — predictionConfigSchema", () => {
  const validConfig = {
    metric_name: "cpu_usage",
    threshold_value: 90,
  };

  it("valida config minimo", () => {
    const result = predictionConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("rejeita sem metric_name", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      metric_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita metric_name muito longo (>200)", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      metric_name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem threshold_value", () => {
    const result = predictionConfigSchema.safeParse({
      metric_name: "cpu_usage",
    });
    expect(result.success).toBe(false);
  });

  it("valida model_type linear", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      model_type: "linear",
    });
    expect(result.success).toBe(true);
  });

  it("valida model_type exponential", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      model_type: "exponential",
    });
    expect(result.success).toBe(true);
  });

  it("valida model_type arima", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      model_type: "arima",
    });
    expect(result.success).toBe(true);
  });

  it("valida model_type lstm", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      model_type: "lstm",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita model_type invalido", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      model_type: "random_forest",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita window_size < 2", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      window_size: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita window_size > 8760", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      window_size: 8761,
    });
    expect(result.success).toBe(false);
  });

  it("valida threshold_direction above", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      threshold_direction: "above",
    });
    expect(result.success).toBe(true);
  });

  it("valida threshold_direction below", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      threshold_direction: "below",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita threshold_direction invalido", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      threshold_direction: "equal",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita prediction_horizon_hours > 720", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      prediction_horizon_hours: 721,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita warning_probability > 1", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      warning_probability: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita critical_probability < 0", () => {
    const result = predictionConfigSchema.safeParse({
      ...validConfig,
      critical_probability: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it("valida config completo", () => {
    const result = predictionConfigSchema.safeParse({
      metric_name: "memory_usage",
      model_type: "arima",
      window_size: 336,
      threshold_value: 85,
      threshold_direction: "above",
      prediction_horizon_hours: 168,
      warning_probability: 0.6,
      critical_probability: 0.85,
      is_active: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Accuracy Calculation ==========

describe("predictions — logica de accuracy", () => {
  it("calcula accuracy com ocorridos + mitigados", () => {
    const total = 100;
    const occurred = 40;
    const mitigated = 30;
    const accuracy = ((occurred + mitigated) / total) * 100;
    expect(accuracy).toBe(70);
  });

  it("retorna 0 accuracy quando total e 0", () => {
    const total = 0;
    const occurred = 0;
    const mitigated = 0;
    const accuracy = total > 0 ? ((occurred + mitigated) / total) * 100 : 0;
    expect(accuracy).toBe(0);
  });

  it("arredonda accuracy para 1 casa decimal", () => {
    const total = 3;
    const occurred = 1;
    const mitigated = 1;
    const accuracy = ((occurred + mitigated) / total) * 100;
    expect(parseFloat(accuracy.toFixed(1))).toBe(66.7);
  });
});

// ========== Logica de Window Slicing ==========

describe("predictions — logica de window slicing", () => {
  it("usa apenas os ultimos N valores", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const windowSize = 5;
    const windowed = values.slice(-windowSize);
    expect(windowed).toEqual([6, 7, 8, 9, 10]);
  });

  it("mantem todos se values < windowSize", () => {
    const values = [1, 2, 3];
    const windowSize = 10;
    const windowed = values.slice(-windowSize);
    expect(windowed).toEqual([1, 2, 3]);
  });

  it("retorna vazio se values vazio", () => {
    const values: number[] = [];
    const windowSize = 5;
    const windowed = values.slice(-windowSize);
    expect(windowed).toEqual([]);
  });
});
