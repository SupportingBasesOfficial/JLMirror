// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import { validate } from "../middleware/validate.js";
import { predictionAnalyzeSchema, predictionConfigSchema } from "@repo/shared-validation";
import { predictFailure, type PredictionConfig } from "../lib/failure-predictor.js";
import "../types.js";

export const predictionRoute = new Hono();

predictionRoute.use("/*", jwtAuth);
predictionRoute.use("/*", tenantContext);

// ========== Predictions ==========

// GET /api/v1/predictions — lista predicoes
predictionRoute.get("/", requirePermission("prediction:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const status = c.req.query("status");
  const severity = c.req.query("severity");

  let sql = `SELECT p.*, d.hostname as device_hostname
     FROM public.failure_predictions p
     JOIN public.devices d ON p.device_id = d.id
     WHERE p.tenant_id = $1`;
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (status) {
    sql += ` AND p.status = $${paramIdx++}`;
    params.push(status);
  }
  if (severity) {
    sql += ` AND p.severity = $${paramIdx++}`;
    params.push(severity);
  }

  sql += ` ORDER BY p.detected_at DESC LIMIT $${paramIdx++}`;
  params.push(limit);

  const result = await query(sql, params);

  return c.json({ predictions: result.data?.rows ?? [] });
});

// POST /api/v1/predictions/analyze — analisa uma metrica e gera predicao
predictionRoute.post("/analyze", requirePermission("prediction:write"), validate({ schema: predictionAnalyzeSchema }), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const body = c.get("validatedData") as { device_id: string; metric_name: string; values: number[] };
  const { device_id, metric_name, values } = body;

  // Busca configuracao ativa
  const configResult = await query<{
    model_type: string; window_size: number; threshold_value: number;
    threshold_direction: string; prediction_horizon_hours: number;
    warning_probability: number; critical_probability: number;
  }>(
    "SELECT model_type, window_size, threshold_value, threshold_direction, prediction_horizon_hours, warning_probability, critical_probability FROM public.prediction_config WHERE tenant_id = $1 AND metric_name = $2 AND is_active = true ORDER BY updated_at DESC LIMIT 1",
    [tenantId, metric_name],
  );

  const dbConfig = configResult.data?.rows[0];
  if (!dbConfig) {
    return c.json({ error: { code: "NO_CONFIG", message: "Nenhuma configuração de predição ativa para esta métrica" } }, 404);
  }

  const config: PredictionConfig = {
    modelType: dbConfig.model_type,
    windowSize: dbConfig.window_size,
    thresholdValue: dbConfig.threshold_value,
    thresholdDirection: dbConfig.threshold_direction,
    predictionHorizonHours: dbConfig.prediction_horizon_hours,
    warningProbability: dbConfig.warning_probability,
    criticalProbability: dbConfig.critical_probability,
  };

  // Usa apenas os ultimos N valores
  const windowedValues = values.slice(-config.windowSize);
  const result = predictFailure(windowedValues, config);

  // Registra predicao se houver risco
  if (result.predictedFailure) {
    const insertResult = await query<{ id: string }>(
      `INSERT INTO public.failure_predictions
         (tenant_id, device_id, metric_name, model_type, predicted_failure,
          failure_probability, estimated_failure_hours, estimated_failure_at,
          current_value, predicted_value, threshold_value, trend_slope, r_squared, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        tenantId, device_id, metric_name, config.modelType,
        result.predictedFailure, result.failureProbability,
        result.estimatedFailureHours, result.estimatedFailureAt,
        result.currentValue, result.predictedValue, result.thresholdValue,
        result.trendSlope, result.rSquared, result.severity,
      ],
    );

    return c.json({ prediction_id: insertResult.data?.rows[0]?.id, ...result });
  }

  return c.json(result);
});

// PUT /api/v1/predictions/:id/acknowledge
predictionRoute.put("/:id/acknowledge", requirePermission("prediction:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const predictionId = c.req.param("id");

  await query(
    "UPDATE public.failure_predictions SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3",
    [user.sub, predictionId, tenantId],
  );

  return c.json({ acknowledged: true });
});

// PUT /api/v1/predictions/:id/mitigate
predictionRoute.put("/:id/mitigate", requirePermission("prediction:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const predictionId = c.req.param("id");

  await query(
    "UPDATE public.failure_predictions SET status = 'mitigated' WHERE id = $1 AND tenant_id = $2",
    [predictionId, tenantId],
  );

  return c.json({ mitigated: true });
});

// PUT /api/v1/predictions/:id/occurred
predictionRoute.put("/:id/occurred", requirePermission("prediction:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const predictionId = c.req.param("id");

  await query(
    "UPDATE public.failure_predictions SET status = 'occurred' WHERE id = $1 AND tenant_id = $2",
    [predictionId, tenantId],
  );

  return c.json({ updated: true });
});

// PUT /api/v1/predictions/:id/false-positive
predictionRoute.put("/:id/false-positive", requirePermission("prediction:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const predictionId = c.req.param("id");

  await query(
    "UPDATE public.failure_predictions SET status = 'false_positive' WHERE id = $1 AND tenant_id = $2",
    [predictionId, tenantId],
  );

  return c.json({ updated: true });
});

// ========== Config ==========

// GET /api/v1/predictions/config
predictionRoute.get("/config", requirePermission("prediction:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const result = await query(
    "SELECT * FROM public.prediction_config WHERE tenant_id = $1 ORDER BY created_at DESC",
    [tenantId],
  );

  return c.json({ configs: result.data?.rows ?? [] });
});

// PUT /api/v1/predictions/config
predictionRoute.put("/config", requirePermission("prediction:write"), validate({ schema: predictionConfigSchema }), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const body = c.get("validatedData") as { metric_name: string; model_type?: string; window_size?: number; threshold_value: number; threshold_direction?: string; prediction_horizon_hours?: number; warning_probability?: number; critical_probability?: number; is_active?: boolean };
  const { metric_name, model_type, window_size, threshold_value, threshold_direction, prediction_horizon_hours, warning_probability, critical_probability, is_active } = body;

  const result = await query<{ id: string }>(
    `INSERT INTO public.prediction_config
       (tenant_id, metric_name, model_type, window_size, threshold_value,
        threshold_direction, prediction_horizon_hours, warning_probability, critical_probability, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (tenant_id, metric_name, model_type) DO UPDATE SET
       window_size = EXCLUDED.window_size,
       threshold_value = EXCLUDED.threshold_value,
       threshold_direction = EXCLUDED.threshold_direction,
       prediction_horizon_hours = EXCLUDED.prediction_horizon_hours,
       warning_probability = EXCLUDED.warning_probability,
       critical_probability = EXCLUDED.critical_probability,
       is_active = EXCLUDED.is_active
     RETURNING id`,
    [
      tenantId, metric_name,
      model_type ?? "linear_trend", window_size ?? 168,
      threshold_value, threshold_direction ?? "above",
      prediction_horizon_hours ?? 72,
      warning_probability ?? 0.5, critical_probability ?? 0.8,
      is_active ?? true,
    ],
  );

  return c.json({ id: result.data?.rows[0]?.id, updated: true });
});

// ========== Stats ==========

// GET /api/v1/predictions/stats
predictionRoute.get("/stats", requirePermission("prediction:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const totalResult = await query("SELECT COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1", [tenantId]);
  const openResult = await query("SELECT COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1 AND status = 'open'", [tenantId]);
  const criticalResult = await query("SELECT COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1 AND status = 'open' AND severity = 'critical'", [tenantId]);
  const occurredResult = await query("SELECT COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1 AND status = 'occurred'", [tenantId]);
  const mitigatedResult = await query("SELECT COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1 AND status = 'mitigated'", [tenantId]);
  const falsePositiveResult = await query("SELECT COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1 AND status = 'false_positive'", [tenantId]);
  const byModelResult = await query(
    "SELECT model_type, COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1 GROUP BY model_type",
    [tenantId],
  );

  const getCount = (r: { data?: { rows?: Array<Record<string, unknown>> } | null }): number => {
    const row = r.data?.rows?.[0];
    return row ? parseInt((row.count as string) ?? "0", 10) : 0;
  };

  const total = getCount(totalResult);
  const occurred = getCount(occurredResult);
  const accuracy = total > 0 ? ((occurred + getCount(mitigatedResult)) / total) * 100 : 0;

  return c.json({
    total: total,
    open: getCount(openResult),
    critical: getCount(criticalResult),
    occurred: occurred,
    mitigated: getCount(mitigatedResult),
    false_positives: getCount(falsePositiveResult),
    accuracy: parseFloat(accuracy.toFixed(1)),
    by_model: byModelResult.data?.rows ?? [],
  });
});
