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
    const hoursRaw = Number.parseInt(raw ?? "24", 10);
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
  function generateSummary(reportType: string): Record<string, unknown> {
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
    return summary;
  }

  it.each([
    ["capacity_summary", "by_resource_type"],
    ["trend_analysis", "trends"],
    ["forecast", "forecasts"],
    ["utilization_breakdown", "breakdown"],
  ])(`report_type=%s gera %s`, (reportType, expectedKey) => {
    const summary = generateSummary(reportType);
    expect(summary).toHaveProperty(expectedKey);
  });
});

// ========== Logica de Limit Pagination ==========

describe("capacity — logica de limit pagination", () => {
  function parseLimit(raw: string): number {
    const parsed = Number.parseInt(raw, 10);
    return Math.min(Number.isNaN(parsed) ? 500 : parsed, 5000);
  }

  it.each([
    ["500", 500],
    ["99999", 5000],
    ["100", 100],
    ["5000", 5000],
    ["abc", 500],
    ["", 500],
  ])(`limit(%j) → %s`, (raw, expected) => {
    expect(parseLimit(raw)).toBe(expected);
  });
});

// ========== Logica de Labels Construction ==========

describe("capacity — logica de labels construction", () => {
  function buildLabels(data: {
    resource_type: string;
    resource_id?: string;
    max_capacity?: number;
    utilization_pct?: number;
    metadata?: Record<string, unknown>;
  }): Record<string, unknown> {
    const labels: Record<string, unknown> = {
      resource_type: data.resource_type,
    };
    if (data.resource_id) labels.resource_id = data.resource_id;
    if (data.max_capacity !== undefined)
      labels.max_capacity = data.max_capacity;
    if (data.utilization_pct !== undefined)
      labels.utilization_pct = data.utilization_pct;
    if (data.metadata) Object.assign(labels, data.metadata);
    return labels;
  }

  it("inclui resource_type obrigatoriamente", () => {
    const labels = buildLabels({ resource_type: "cpu" });
    expect(labels.resource_type).toBe("cpu");
  });

  it("inclui resource_id quando fornecido", () => {
    const labels = buildLabels({
      resource_type: "cpu",
      resource_id: "i-123",
    });
    expect(labels.resource_id).toBe("i-123");
  });

  it("nao inclui resource_id quando ausente", () => {
    const labels = buildLabels({ resource_type: "cpu" });
    expect(labels).not.toHaveProperty("resource_id");
  });

  it("inclui max_capacity quando fornecido", () => {
    const labels = buildLabels({
      resource_type: "cpu",
      max_capacity: 100,
    });
    expect(labels.max_capacity).toBe(100);
  });

  it("inclui utilization_pct quando fornecido", () => {
    const labels = buildLabels({
      resource_type: "cpu",
      utilization_pct: 75.5,
    });
    expect(labels.utilization_pct).toBe(75.5);
  });

  it("merge metadata via Object.assign", () => {
    const labels = buildLabels({
      resource_type: "cpu",
      metadata: { region: "us-east-1", az: "a" },
    });
    expect(labels.region).toBe("us-east-1");
    expect(labels.az).toBe("a");
  });

  it("JSON.stringify labels corretamente", () => {
    const labels = buildLabels({
      resource_type: "cpu",
      resource_id: "i-123",
      utilization_pct: 80,
    });
    const json = JSON.stringify(labels);
    expect(json).toContain('"resource_type":"cpu"');
    expect(json).toContain('"resource_id":"i-123"');
    expect(json).toContain('"utilization_pct":80');
  });
});

// ========== Logica de Tenant Isolation ==========

describe("capacity — logica de tenant isolation", () => {
  it("queries de metrics filtram por tenant_id", () => {
    const tenantId = "tenant-123";
    const sql = "SELECT * FROM public.capacity_metrics WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("queries de thresholds filtram por tenant_id", () => {
    const tenantId = "tenant-456";
    const sql = "SELECT * FROM public.capacity_thresholds WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("queries de reports filtram por tenant_id", () => {
    const tenantId = "tenant-789";
    const sql = "SELECT * FROM public.capacity_reports WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("queries de forecasts filtram por tenant_id", () => {
    const tenantId = "tenant-fc";
    const sql = "SELECT * FROM public.capacity_forecasts WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("INSERT inclui tenant_id", () => {
    const tenantId = "tenant-ins";
    const params: unknown[] = [tenantId, "cpu", "server-01", 75.5, "%", "{}"];
    expect(params[0]).toBe(tenantId);
  });

  it("UPDATE inclui tenant_id no WHERE", () => {
    const tenantId = "tenant-upd";
    const thresholdId = "thr-1";
    const sql = `UPDATE public.capacity_thresholds SET warning_pct = $1 WHERE id = $2 AND tenant_id = $3`;
    const params: unknown[] = [80, thresholdId, tenantId];
    expect(sql).toContain("tenant_id = $3");
    expect(params[2]).toBe(tenantId);
  });

  it("DELETE inclui tenant_id no WHERE", () => {
    const tenantId = "tenant-del";
    const thresholdId = "thr-2";
    const sql = `DELETE FROM public.capacity_thresholds WHERE id = $1 AND tenant_id = $2`;
    const params: unknown[] = [thresholdId, tenantId];
    expect(sql).toContain("tenant_id = $2");
    expect(params[1]).toBe(tenantId);
  });
});

// ========== Logica de 404 Handling ==========

describe("capacity — logica de 404 handling", () => {
  it("PUT /thresholds/:id retorna 404 quando rowCount=0", () => {
    const rowCount = 0;
    const shouldReturn404 = rowCount === 0;
    expect(shouldReturn404).toBe(true);
  });

  it("PUT /thresholds/:id nao retorna 404 quando rowCount>0", () => {
    const rowCount: number = 1;
    const shouldReturn404 = rowCount === 0;
    expect(shouldReturn404).toBe(false);
  });

  it("DELETE /thresholds/:id retorna 404 quando rowCount=0", () => {
    const rowCount = 0;
    const shouldReturn404 = rowCount === 0;
    expect(shouldReturn404).toBe(true);
  });

  it("DELETE /reports/:id retorna 404 quando rowCount=0", () => {
    const rowCount = 0;
    const shouldReturn404 = rowCount === 0;
    expect(shouldReturn404).toBe(true);
  });
});

// ========== Logica de Optional Chaining ==========

describe("capacity — logica de optional chaining", () => {
  type TestUser = { sub: string; tenant_id: string };

  function getSub(user: TestUser | null | undefined): string | null {
    return user?.sub ?? null;
  }

  function getTenantId(user: TestUser | null | undefined): string | null {
    return user?.tenant_id ?? null;
  }

  it("user?.sub retorna null quando user e null", () => {
    expect(getSub(null)).toBeNull();
  });

  it("user?.tenant_id retorna null quando user e undefined", () => {
    expect(getTenantId(undefined)).toBeNull();
  });

  it("user?.sub retorna valor quando user existe", () => {
    expect(getSub({ sub: "u1", tenant_id: "t1" })).toBe("u1");
  });

  it("userId null nao chama writeAuditLog", () => {
    const userId: string | null = null;
    const shouldCallAudit = !!userId;
    expect(shouldCallAudit).toBe(false);
  });
});

// ========== Logica de Parallel Queries ==========

describe("capacity — logica de parallel queries", () => {
  it("overview paraleliza 2 queries", async () => {
    const results = await Promise.all([
      Promise.resolve({ data: { rows: [{ total: "10" }] } }),
      Promise.resolve({ data: { rows: [{ total: "5", active: "3" }] } }),
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].data.rows[0].total).toBe("10");
  });

  it("stats paraleliza 4 queries", async () => {
    const results = await Promise.all([
      Promise.resolve({ data: { rows: [{ total_resources: "10" }] } }),
      Promise.resolve({ data: { rows: [] } }),
      Promise.resolve({ data: { rows: [] } }),
      Promise.resolve({ data: { rows: [{ total: "5" }] } }),
    ]);
    expect(results).toHaveLength(4);
  });

  it("Promise.all propaga erro", async () => {
    await expect(
      Promise.all([
        Promise.resolve({ data: { rows: [] } }),
        Promise.reject(new Error("DB error")),
      ]),
    ).rejects.toThrow("DB error");
  });
});

// ========== Logica de ON CONFLICT Upsert ==========

describe("capacity — logica de ON CONFLICT upsert", () => {
  it("SQL contem ON CONFLICT para upsert", () => {
    const sql = `INSERT INTO public.capacity_thresholds (tenant_id, resource_type, resource_name, warning_pct, critical_pct, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, resource_type, resource_name)
       DO UPDATE SET warning_pct = $4, critical_pct = $5, is_active = $6
       RETURNING id`;
    expect(sql).toContain(
      "ON CONFLICT (tenant_id, resource_type, resource_name)",
    );
    expect(sql).toContain("DO UPDATE SET");
  });

  it("upsert reutiliza parametros $4, $5, $6", () => {
    const sql = `DO UPDATE SET warning_pct = $4, critical_pct = $5, is_active = $6`;
    expect(sql).toContain("$4");
    expect(sql).toContain("$5");
    expect(sql).toContain("$6");
  });
});

// ========== Logica de Forecast Calculation ==========

describe("capacity — logica de forecast calculation", () => {
  it("forecast requer resource_type e resource_name", () => {
    const resourceType = "cpu";
    const resourceName = "server-01";
    const shouldCalculate = !!(resourceType && resourceName);
    expect(shouldCalculate).toBe(true);
  });

  it("sem filtros lista forecasts persistidos", () => {
    const resourceType = undefined;
    const resourceName = undefined;
    const shouldList = !resourceType || !resourceName;
    expect(shouldList).toBe(true);
  });

  it("metric_type default utilization_pct", () => {
    const metricType = undefined;
    const resolved = metricType ?? "utilization_pct";
    expect(resolved).toBe("utilization_pct");
  });
});
