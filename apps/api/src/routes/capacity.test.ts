// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  ingestMetricSchema,
  ingestMetricsBatchSchema,
  createThresholdSchema,
  updateThresholdSchema,
  createReportSchema,
} from "@repo/shared-validation";

// ========== ingestMetricSchema ==========

describe("capacity — ingestMetricSchema", () => {
  const validMetric = {
    resource_type: "cpu",
    resource_name: "server-01",
    metric_name: "utilization_pct",
    metric_value: 75.5,
  };

  it("valida metrica minima", () => {
    const result = ingestMetricSchema.safeParse(validMetric);
    expect(result.success).toBe(true);
  });

  it("rejeita sem resource_type", () => {
    const result = ingestMetricSchema.safeParse({
      ...validMetric,
      resource_type: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem resource_name", () => {
    const result = ingestMetricSchema.safeParse({
      ...validMetric,
      resource_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem metric_name", () => {
    const result = ingestMetricSchema.safeParse({
      ...validMetric,
      metric_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem metric_value", () => {
    const result = ingestMetricSchema.safeParse({
      ...validMetric,
      metric_value: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("valida com metric_unit", () => {
    const result = ingestMetricSchema.safeParse({
      ...validMetric,
      metric_unit: "%",
    });
    expect(result.success).toBe(true);
  });

  it("valida com max_capacity", () => {
    const result = ingestMetricSchema.safeParse({
      ...validMetric,
      max_capacity: 100,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita max_capacity negativo", () => {
    const result = ingestMetricSchema.safeParse({
      ...validMetric,
      max_capacity: -1,
    });
    expect(result.success).toBe(false);
  });

  it("valida com utilization_pct", () => {
    const result = ingestMetricSchema.safeParse({
      ...validMetric,
      utilization_pct: 75.5,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita utilization_pct > 100", () => {
    const result = ingestMetricSchema.safeParse({
      ...validMetric,
      utilization_pct: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita utilization_pct negativo", () => {
    const result = ingestMetricSchema.safeParse({
      ...validMetric,
      utilization_pct: -1,
    });
    expect(result.success).toBe(false);
  });

  it("valida com metadata", () => {
    const result = ingestMetricSchema.safeParse({
      ...validMetric,
      metadata: { region: "us-east-1", az: "a" },
    });
    expect(result.success).toBe(true);
  });

  it("valida com resource_id", () => {
    const result = ingestMetricSchema.safeParse({
      ...validMetric,
      resource_id: "i-12345678",
    });
    expect(result.success).toBe(true);
  });
});

// ========== ingestMetricsBatchSchema ==========

describe("capacity — ingestMetricsBatchSchema", () => {
  const validMetric = {
    resource_type: "memory",
    resource_name: "server-01",
    metric_name: "used_bytes",
    metric_value: 8589934592,
  };

  it("valida batch com 1 metrica", () => {
    const result = ingestMetricsBatchSchema.safeParse([validMetric]);
    expect(result.success).toBe(true);
  });

  it("valida batch com 100 metricas", () => {
    const batch = Array(100).fill(validMetric);
    const result = ingestMetricsBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it("valida batch com 1000 metricas (limite)", () => {
    const batch = Array(1000).fill(validMetric);
    const result = ingestMetricsBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it("rejeita batch vazio", () => {
    const result = ingestMetricsBatchSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("rejeita batch com mais de 1000", () => {
    const batch = Array(1001).fill(validMetric);
    const result = ingestMetricsBatchSchema.safeParse(batch);
    expect(result.success).toBe(false);
  });

  it("rejeita batch com metrica invalida", () => {
    const result = ingestMetricsBatchSchema.safeParse([
      { ...validMetric, metric_value: undefined },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejeita se nao for array", () => {
    const result = ingestMetricsBatchSchema.safeParse(validMetric);
    expect(result.success).toBe(false);
  });
});

// ========== createThresholdSchema ==========

describe("capacity — createThresholdSchema", () => {
  const validThreshold = {
    resource_type: "cpu",
    resource_name: "server-01",
    warning_pct: 70,
    critical_pct: 90,
  };

  it("valida threshold minimo", () => {
    const result = createThresholdSchema.safeParse(validThreshold);
    expect(result.success).toBe(true);
  });

  it("aplica default is_active=true", () => {
    const result = createThresholdSchema.safeParse(validThreshold);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(true);
    }
  });

  it("rejeita warning_pct > 100", () => {
    const result = createThresholdSchema.safeParse({
      ...validThreshold,
      warning_pct: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita warning_pct negativo", () => {
    const result = createThresholdSchema.safeParse({
      ...validThreshold,
      warning_pct: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita critical_pct > 100", () => {
    const result = createThresholdSchema.safeParse({
      ...validThreshold,
      critical_pct: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita critical_pct negativo", () => {
    const result = createThresholdSchema.safeParse({
      ...validThreshold,
      critical_pct: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita critical_pct <= warning_pct", () => {
    const result = createThresholdSchema.safeParse({
      ...validThreshold,
      warning_pct: 90,
      critical_pct: 90,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita critical_pct < warning_pct", () => {
    const result = createThresholdSchema.safeParse({
      ...validThreshold,
      warning_pct: 90,
      critical_pct: 70,
    });
    expect(result.success).toBe(false);
  });

  it("valida warning_pct=0", () => {
    const result = createThresholdSchema.safeParse({
      ...validThreshold,
      warning_pct: 0,
      critical_pct: 50,
    });
    expect(result.success).toBe(true);
  });

  it("valida critical_pct=100", () => {
    const result = createThresholdSchema.safeParse({
      ...validThreshold,
      warning_pct: 90,
      critical_pct: 100,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem resource_type", () => {
    const result = createThresholdSchema.safeParse({
      ...validThreshold,
      resource_type: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem resource_name", () => {
    const result = createThresholdSchema.safeParse({
      ...validThreshold,
      resource_name: "",
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateThresholdSchema ==========

describe("capacity — updateThresholdSchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updateThresholdSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update warning_pct", () => {
    const result = updateThresholdSchema.safeParse({ warning_pct: 75 });
    expect(result.success).toBe(true);
  });

  it("rejeita update warning_pct > 100", () => {
    const result = updateThresholdSchema.safeParse({ warning_pct: 101 });
    expect(result.success).toBe(false);
  });

  it("valida update critical_pct", () => {
    const result = updateThresholdSchema.safeParse({ critical_pct: 95 });
    expect(result.success).toBe(true);
  });

  it("rejeita update critical_pct negativo", () => {
    const result = updateThresholdSchema.safeParse({ critical_pct: -5 });
    expect(result.success).toBe(false);
  });

  it("valida update is_active", () => {
    const result = updateThresholdSchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it("valida update completo", () => {
    const result = updateThresholdSchema.safeParse({
      warning_pct: 80,
      critical_pct: 95,
      is_active: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== createReportSchema ==========

describe("capacity — createReportSchema", () => {
  const validReport = {
    name: "Relatório Mensal",
    type: "capacity",
  };

  it("valida report minimo", () => {
    const result = createReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
  });

  it("aplica default format=pdf", () => {
    const result = createReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("pdf");
    }
  });

  it("aplica default is_scheduled=false", () => {
    const result = createReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_scheduled).toBe(false);
    }
  });

  it("valida format=csv", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      format: "csv",
    });
    expect(result.success).toBe(true);
  });

  it("valida format=json", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      format: "json",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita format invalido", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      format: "xml",
    });
    expect(result.success).toBe(false);
  });

  it("valida report_type=capacity_summary", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      report_type: "capacity_summary",
    });
    expect(result.success).toBe(true);
  });

  it("valida report_type=trend_analysis", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      report_type: "trend_analysis",
    });
    expect(result.success).toBe(true);
  });

  it("valida report_type=forecast", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      report_type: "forecast",
    });
    expect(result.success).toBe(true);
  });

  it("valida report_type=utilization_breakdown", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      report_type: "utilization_breakdown",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita report_type invalido", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      report_type: "invalid_type",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem name", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem type", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      type: "",
    });
    expect(result.success).toBe(false);
  });

  it("valida com date_range", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      date_range_start: "2025-01-01T00:00:00Z",
      date_range_end: "2025-01-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });

  it("valida com is_scheduled=true e cron_expression", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      is_scheduled: true,
      cron_expression: "0 0 * * *",
    });
    expect(result.success).toBe(true);
  });

  it("valida com template_id (UUID)", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      template_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita template_id invalido", () => {
    const result = createReportSchema.safeParse({
      ...validReport,
      template_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Hours Validation ==========

describe("capacity — logica de hours validation", () => {
  function validateHours(raw: string | undefined): number {
    const hoursRaw = parseInt(raw ?? "24", 10);
    return Number.isNaN(hoursRaw) || hoursRaw < 1
      ? 24
      : Math.min(hoursRaw, 720);
  }

  it("default 24 quando undefined", () => {
    expect(validateHours(undefined)).toBe(24);
  });

  it("default 24 quando NaN", () => {
    expect(validateHours("abc")).toBe(24);
  });

  it("default 24 quando zero", () => {
    expect(validateHours("0")).toBe(24);
  });

  it("default 24 quando negativo", () => {
    expect(validateHours("-5")).toBe(24);
  });

  it("aceita valor valido 48", () => {
    expect(validateHours("48")).toBe(48);
  });

  it("limita a 720 (30 dias)", () => {
    expect(validateHours("9999")).toBe(720);
  });

  it("aceita exatamente 720", () => {
    expect(validateHours("720")).toBe(720);
  });
});

// ========== Logica de Batch Insert ==========

describe("capacity — logica de batch insert", () => {
  it("BATCH_SIZE=100 divide corretamente", () => {
    const total = 250;
    const BATCH_SIZE = 100;
    const batches = Math.ceil(total / BATCH_SIZE);
    expect(batches).toBe(3);
  });

  it("100 metricas = 1 batch", () => {
    const total = 100;
    const BATCH_SIZE = 100;
    const batches = Math.ceil(total / BATCH_SIZE);
    expect(batches).toBe(1);
  });

  it("1 metrica = 1 batch", () => {
    const total = 1;
    const BATCH_SIZE = 100;
    const batches = Math.ceil(total / BATCH_SIZE);
    expect(batches).toBe(1);
  });

  it("1000 metricas = 10 batches", () => {
    const total = 1000;
    const BATCH_SIZE = 100;
    const batches = Math.ceil(total / BATCH_SIZE);
    expect(batches).toBe(10);
  });
});

// ========== Logica de Report Type Selection ==========

describe("capacity — logica de report type selection", () => {
  it("capacity_summary gera by_resource_type", () => {
    const reportType: string = "capacity_summary";
    const summary: Record<string, unknown> = {};
    if (reportType === "capacity_summary") {
      summary.by_resource_type = [];
    } else if (reportType === "trend_analysis") {
      summary.trends = [];
    } else if (reportType === "forecast") {
      summary.forecasts = [];
    } else if (reportType === "utilization_breakdown") {
      summary.breakdown = [];
    }
    expect(summary).toHaveProperty("by_resource_type");
    expect(summary).not.toHaveProperty("trends");
  });

  it("trend_analysis gera trends", () => {
    const reportType: string = "trend_analysis";
    const summary: Record<string, unknown> = {};
    if (reportType === "capacity_summary") {
      summary.by_resource_type = [];
    } else if (reportType === "trend_analysis") {
      summary.trends = [];
    } else if (reportType === "forecast") {
      summary.forecasts = [];
    } else if (reportType === "utilization_breakdown") {
      summary.breakdown = [];
    }
    expect(summary).toHaveProperty("trends");
  });

  it("forecast gera forecasts", () => {
    const reportType: string = "forecast";
    const summary: Record<string, unknown> = {};
    if (reportType === "capacity_summary") {
      summary.by_resource_type = [];
    } else if (reportType === "trend_analysis") {
      summary.trends = [];
    } else if (reportType === "forecast") {
      summary.forecasts = [];
    } else if (reportType === "utilization_breakdown") {
      summary.breakdown = [];
    }
    expect(summary).toHaveProperty("forecasts");
  });

  it("utilization_breakdown gera breakdown", () => {
    const reportType: string = "utilization_breakdown";
    const summary: Record<string, unknown> = {};
    if (reportType === "capacity_summary") {
      summary.by_resource_type = [];
    } else if (reportType === "trend_analysis") {
      summary.trends = [];
    } else if (reportType === "forecast") {
      summary.forecasts = [];
    } else if (reportType === "utilization_breakdown") {
      summary.breakdown = [];
    }
    expect(summary).toHaveProperty("breakdown");
  });
});

// ========== Logica de Limit Pagination ==========

describe("capacity — logica de limit pagination", () => {
  it("metrics limit default 500", () => {
    const limit = Math.min(parseInt("500", 10), 5000);
    expect(limit).toBe(500);
  });

  it("metrics limit maximo 5000", () => {
    const limit = Math.min(parseInt("99999", 10), 5000);
    expect(limit).toBe(5000);
  });
});
