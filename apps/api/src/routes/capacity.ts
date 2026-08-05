// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import {
  ingestMetricSchema,
  ingestMetricsBatchSchema,
  createThresholdSchema,
  updateThresholdSchema,
  createReportSchema,
  type IngestMetricInput,
  type CreateThresholdInput,
  type UpdateThresholdInput,
  type CreateReportInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const capacityRoute = new Hono();

// GET /api/v1/capacity — overview do modulo
capacityRoute.get("/", requirePermission("capacity:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const metricsResult = await query(
    "SELECT COUNT(*) as total FROM public.capacity_metrics WHERE tenant_id = $1",
    [tenantId],
  );
  const thresholdsResult = await query(
    "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.capacity_thresholds WHERE tenant_id = $1",
    [tenantId],
  );

  return c.json({
    overview: {
      metrics: metricsResult.data?.rows[0]?.total ?? "0",
      thresholds: thresholdsResult.data?.rows[0] ?? { total: "0", active: "0" },
    },
    endpoints: ["/metrics", "/thresholds", "/reports", "/stats"],
  });
});

// ========== Metrics ==========

// GET /api/v1/capacity/metrics — lista métricas com filtros
capacityRoute.get("/metrics", requirePermission("capacity:read"), async (c) => {
  const user = c.get("user");
  const resourceName = c.req.query("resource_name");
  const metricType = c.req.query("metric_type");
  const hours = parseInt(c.req.query("hours") ?? "24", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "500", 10), 5000);

  const conditions: string[] = [
    "tenant_id = $1",
    `recorded_at > timezone('utc'::text, now()) - ($2 || ' hours')::INTERVAL`,
  ];
  const params: unknown[] = [user?.tenant_id ?? null, hours.toString()];
  let paramIdx = 3;

  if (resourceName) {
    conditions.push(`resource_name = $${paramIdx++}`);
    params.push(resourceName);
  }
  if (metricType) {
    conditions.push(`metric_type = $${paramIdx++}`);
    params.push(metricType);
  }

  params.push(limit);

  const result = await query(
    `SELECT * FROM public.capacity_metrics WHERE ${conditions.join(" AND ")} ORDER BY recorded_at DESC LIMIT $${paramIdx++}`,
    params,
  );

  if (result.error) {
    return c.json(
      { error: { code: "QUERY_ERROR", message: "Erro ao buscar métricas" } },
      500,
    );
  }

  return c.json({ metrics: result.data?.rows ?? [] });
});

// POST /api/v1/capacity/metrics — ingere uma métrica
capacityRoute.post(
  "/metrics",
  requirePermission("capacity:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<IngestMetricInput>();
    const parsed = ingestMetricSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const labels: Record<string, unknown> = {
      resource_type: data.resource_type,
    };
    if (data.resource_id) labels.resource_id = data.resource_id;
    if (data.max_capacity !== undefined)
      labels.max_capacity = data.max_capacity;
    if (data.utilization_pct !== undefined)
      labels.utilization_pct = data.utilization_pct;
    if (data.metadata) Object.assign(labels, data.metadata);
    const result = await query<{ id: string }>(
      `INSERT INTO public.capacity_metrics (tenant_id, resource_name, metric_type, value, unit, labels, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, timezone('utc'::text, now()))
     RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.resource_name,
        data.metric_name,
        data.metric_value,
        data.metric_unit,
        JSON.stringify(labels),
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao inserir métrica" } },
        500,
      );
    }

    return c.json({ id: result.data.rows[0].id }, 201);
  },
);

// POST /api/v1/capacity/metrics/batch — ingere múltiplas métricas
capacityRoute.post(
  "/metrics/batch",
  requirePermission("capacity:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<IngestMetricInput[]>();
    const parsed = ingestMetricsBatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const metrics = parsed.data;
    let inserted = 0;

    for (const m of metrics) {
      const labels: Record<string, unknown> = {
        resource_type: m.resource_type,
      };
      if (m.resource_id) labels.resource_id = m.resource_id;
      if (m.max_capacity !== undefined) labels.max_capacity = m.max_capacity;
      if (m.utilization_pct !== undefined)
        labels.utilization_pct = m.utilization_pct;
      if (m.metadata) Object.assign(labels, m.metadata);
      const result = await query(
        `INSERT INTO public.capacity_metrics (tenant_id, resource_name, metric_type, value, unit, labels, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, timezone('utc'::text, now()))`,
        [
          user?.tenant_id ?? null,
          m.resource_name,
          m.metric_name,
          m.metric_value,
          m.metric_unit,
          JSON.stringify(labels),
        ],
      );
      if (!result.error) inserted++;
    }

    return c.json({ inserted, total: metrics.length }, 201);
  },
);

// ========== Thresholds ==========

capacityRoute.get(
  "/thresholds",
  requirePermission("capacity:read"),
  async (c) => {
    const user = c.get("user");
    const result = await query(
      "SELECT * FROM public.capacity_thresholds WHERE tenant_id = $1 ORDER BY resource_type, resource_name",
      [user?.tenant_id ?? null],
    );

    return c.json({ thresholds: result.data?.rows ?? [] });
  },
);

capacityRoute.post(
  "/thresholds",
  requirePermission("capacity:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<CreateThresholdInput>();
    const parsed = createThresholdSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const result = await query<{ id: string }>(
      `INSERT INTO public.capacity_thresholds (tenant_id, resource_type, resource_name, warning_pct, critical_pct, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, resource_type, resource_name)
     DO UPDATE SET warning_pct = $4, critical_pct = $5, is_active = $6
     RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.resource_type,
        data.resource_name,
        data.warning_pct,
        data.critical_pct,
        data.is_active,
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar threshold" } },
        500,
      );
    }

    await query(
      "SELECT public.write_audit_log($1, NULL, 'capacity.threshold.create', 'capacity_threshold', $2, $3, NULL, NULL)",
      [
        user.sub,
        result.data.rows[0].id,
        JSON.stringify({
          resource: data.resource_name,
          type: data.resource_type,
        }),
      ],
    );

    return c.json({ id: result.data.rows[0].id }, 201);
  },
);

capacityRoute.put(
  "/thresholds/:id",
  requirePermission("capacity:write"),
  async (c) => {
    const thresholdId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json<UpdateThresholdInput>();
    const parsed = updateThresholdSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      warning_pct: "warning_pct",
      critical_pct: "critical_pct",
      is_active: "is_active",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (updateFields.length === 0) {
      return c.json({ id: thresholdId });
    }

    params.push(thresholdId, user?.tenant_id ?? null);

    await query(
      `UPDATE public.capacity_thresholds SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
      params,
    );

    return c.json({ id: thresholdId });
  },
);

capacityRoute.delete(
  "/thresholds/:id",
  requirePermission("capacity:write"),
  async (c) => {
    const thresholdId = c.req.param("id");
    const user = c.get("user");

    await query(
      "DELETE FROM public.capacity_thresholds WHERE id = $1 AND tenant_id = $2",
      [thresholdId, user?.tenant_id ?? null],
    );

    return c.json({ deleted: true });
  },
);

// ========== Forecasts ==========

capacityRoute.get(
  "/forecast",
  requirePermission("capacity:read"),
  async (c) => {
    const user = c.get("user");
    const resourceType = c.req.query("resource_type");
    const resourceName = c.req.query("resource_name");

    // Se resource_type e resource_name fornecidos, calcula forecast on-the-fly
    if (resourceType && resourceName) {
      const metricType =
        c.req.query("metric_type") ??
        c.req.query("metric_name") ??
        "utilization_pct";
      const result = await query(
        "SELECT * FROM public.calculate_linear_forecast($1, $2, $3, $4)",
        [user?.tenant_id ?? null, resourceType, resourceName, metricType],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "FORECAST_ERROR",
              message: "Erro ao calcular previsão",
            },
          },
          500,
        );
      }

      const row = result.data.rows[0] as {
        current_value: number;
        predicted_7d: number | null;
        predicted_30d: number | null;
        predicted_90d: number | null;
        slope: number;
        r_squared: number;
        days_until_capacity: number | null;
        confidence: string;
      };

      // Persiste forecast
      await query(
        `INSERT INTO public.capacity_forecasts (tenant_id, resource_type, resource_name, metric_name, current_value, predicted_value_7d, predicted_value_30d, predicted_value_90d, slope, r_squared, days_until_capacity, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          user?.tenant_id ?? null,
          resourceType,
          resourceName,
          metricType,
          row.current_value,
          row.predicted_7d,
          row.predicted_30d,
          row.predicted_90d,
          row.slope,
          row.r_squared,
          row.days_until_capacity,
          row.confidence,
        ],
      );

      return c.json({
        resource_type: resourceType,
        resource_name: resourceName,
        metric_type: metricType,
        ...row,
      });
    }

    // Sem filtros: lista forecasts persistidos
    const result = await query(
      "SELECT * FROM public.capacity_forecasts WHERE tenant_id = $1 ORDER BY generated_at DESC LIMIT 50",
      [user?.tenant_id ?? null],
    );

    return c.json({ forecasts: result.data?.rows ?? [] });
  },
);

// ========== Reports ==========

capacityRoute.get("/reports", requirePermission("capacity:read"), async (c) => {
  const user = c.get("user");
  const result = await query(
    "SELECT * FROM public.capacity_reports WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50",
    [user?.tenant_id ?? null],
  );

  return c.json({ reports: result.data?.rows ?? [] });
});

capacityRoute.post(
  "/reports",
  requirePermission("capacity:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<CreateReportInput>();
    const parsed = createReportSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const result = await query<{ id: string }>(
      `INSERT INTO public.capacity_reports (tenant_id, name, report_type, date_range_start, date_range_end, status, is_scheduled, cron_expression, generated_by)
     VALUES ($1, $2, $3, $4, $5, 'generating', $6, $7, $8)
     RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.name,
        data.report_type,
        data.date_range_start ?? null,
        data.date_range_end ?? null,
        data.is_scheduled,
        data.cron_expression ?? null,
        user.sub,
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar relatório" } },
        500,
      );
    }

    const reportId = result.data.rows[0].id;

    // MVP: Gera relatório síncrono — Enterprise: job assíncrono
    const startDate = data.date_range_start
      ? new Date(data.date_range_start)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = data.date_range_end
      ? new Date(data.date_range_end)
      : new Date();

    let summary: Record<string, unknown> = {};

    if (data.report_type === "capacity_summary") {
      const statsResult = await query(
        `SELECT
         labels->>'resource_type' as resource_type,
         COUNT(DISTINCT resource_name) as resource_count,
         AVG((labels->>'utilization_pct')::numeric) as avg_utilization,
         MAX((labels->>'utilization_pct')::numeric) as max_utilization,
         MAX(value) as max_value
       FROM public.capacity_metrics
       WHERE tenant_id = $1 AND recorded_at >= $2 AND recorded_at <= $3
       GROUP BY labels->>'resource_type' ORDER BY resource_type`,
        [user?.tenant_id ?? null, startDate, endDate],
      );
      summary = { by_resource_type: statsResult.data?.rows ?? [] };
    } else if (data.report_type === "trend_analysis") {
      const trendResult = await query(
        `SELECT labels->>'resource_type' as resource_type, resource_name, metric_type,
         MIN(value) as min_value,
         AVG(value) as avg_value,
         MAX(value) as max_value,
         (MAX(value) - MIN(value)) as variation
       FROM public.capacity_metrics
       WHERE tenant_id = $1 AND recorded_at >= $2 AND recorded_at <= $3
       GROUP BY labels->>'resource_type', resource_name, metric_type
       ORDER BY variation DESC LIMIT 20`,
        [user?.tenant_id ?? null, startDate, endDate],
      );
      summary = { trends: trendResult.data?.rows ?? [] };
    } else if (data.report_type === "forecast") {
      const forecastResult = await query(
        "SELECT * FROM public.capacity_forecasts WHERE tenant_id = $1 ORDER BY generated_at DESC LIMIT 20",
        [user?.tenant_id ?? null],
      );
      summary = { forecasts: forecastResult.data?.rows ?? [] };
    } else if (data.report_type === "utilization_breakdown") {
      const breakdownResult = await query(
        `SELECT labels->>'resource_type' as resource_type, resource_name,
         AVG((labels->>'utilization_pct')::numeric) as avg_utilization,
         MAX((labels->>'utilization_pct')::numeric) as peak_utilization
       FROM public.capacity_metrics
       WHERE tenant_id = $1 AND recorded_at >= $2 AND recorded_at <= $3 AND labels->>'utilization_pct' IS NOT NULL
       GROUP BY labels->>'resource_type', resource_name
       ORDER BY peak_utilization DESC NULLS LAST LIMIT 30`,
        [user?.tenant_id ?? null, startDate, endDate],
      );
      summary = { breakdown: breakdownResult.data?.rows ?? [] };
    }

    const reportJson = JSON.stringify(summary);
    const reportSize = new TextEncoder().encode(reportJson).length;

    await query(
      `UPDATE public.capacity_reports
     SET status = 'completed', summary = $1, file_size_bytes = $2, generated_at = timezone('utc'::text, now()),
         file_path = $3
     WHERE id = $4`,
      [reportJson, reportSize, `/reports/capacity/${reportId}.json`, reportId],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'capacity.report.generate', 'capacity_report', $2, $3, NULL, NULL)",
      [
        user.sub,
        reportId,
        JSON.stringify({ name: data.name, type: data.report_type }),
      ],
    );

    return c.json({ id: reportId, status: "completed", summary }, 201);
  },
);

capacityRoute.delete(
  "/reports/:id",
  requirePermission("capacity:write"),
  async (c) => {
    const reportId = c.req.param("id");
    const user = c.get("user");

    await query(
      "DELETE FROM public.capacity_reports WHERE id = $1 AND tenant_id = $2",
      [reportId, user?.tenant_id ?? null],
    );

    return c.json({ deleted: true });
  },
);

// ========== Stats ==========

capacityRoute.get("/stats", requirePermission("capacity:read"), async (c) => {
  const user = c.get("user");

  const overviewResult = await query(
    `SELECT
       COUNT(DISTINCT resource_name) as total_resources,
       COUNT(DISTINCT labels->>'resource_type') as total_types,
       COUNT(*) FILTER (WHERE (labels->>'utilization_pct')::numeric >= 90) as critical_count,
       COUNT(*) FILTER (WHERE (labels->>'utilization_pct')::numeric >= 70 AND (labels->>'utilization_pct')::numeric < 90) as warning_count
     FROM public.capacity_metrics
     WHERE tenant_id = $1 AND recorded_at > timezone('utc'::text, now()) - INTERVAL '1 hour'`,
    [user?.tenant_id ?? null],
  );

  const byTypeResult = await query(
    `SELECT labels->>'resource_type' as resource_type,
       COUNT(DISTINCT resource_name) as resource_count,
       AVG((labels->>'utilization_pct')::numeric) as avg_utilization,
       MAX((labels->>'utilization_pct')::numeric) as max_utilization
     FROM public.capacity_metrics
     WHERE tenant_id = $1 AND recorded_at > timezone('utc'::text, now()) - INTERVAL '1 hour'
     GROUP BY labels->>'resource_type' ORDER BY max_utilization DESC NULLS LAST`,
    [user?.tenant_id ?? null],
  );

  const topUtilized = await query(
    `SELECT labels->>'resource_type' as resource_type, resource_name, metric_type,
       AVG((labels->>'utilization_pct')::numeric) as avg_utilization,
       MAX((labels->>'utilization_pct')::numeric) as peak_utilization
     FROM public.capacity_metrics
     WHERE tenant_id = $1 AND recorded_at > timezone('utc'::text, now()) - INTERVAL '1 hour'
       AND labels->>'utilization_pct' IS NOT NULL
     GROUP BY labels->>'resource_type', resource_name, metric_type
     ORDER BY peak_utilization DESC NULLS LAST LIMIT 10`,
    [user?.tenant_id ?? null],
  );

  const forecastsResult = await query(
    `SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE days_until_capacity IS NOT NULL AND days_until_capacity <= 30) as within_30d,
       COUNT(*) FILTER (WHERE days_until_capacity IS NOT NULL AND days_until_capacity <= 90 AND days_until_capacity > 30) as within_90d,
       COUNT(*) FILTER (WHERE confidence = 'high') as high_confidence
     FROM public.capacity_forecasts
     WHERE tenant_id = $1 AND generated_at > timezone('utc'::text, now()) - INTERVAL '24 hours'`,
    [user?.tenant_id ?? null],
  );

  return c.json({
    overview: overviewResult.data?.rows[0] ?? {
      total_resources: "0",
      total_types: "0",
      critical_count: "0",
      warning_count: "0",
    },
    by_type: byTypeResult.data?.rows ?? [],
    top_utilized: topUtilized.data?.rows ?? [],
    forecasts: forecastsResult.data?.rows[0] ?? {
      total: "0",
      within_30d: "0",
      within_90d: "0",
      high_confidence: "0",
    },
  });
});
