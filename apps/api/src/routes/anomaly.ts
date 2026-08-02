// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import { validate } from "../middleware/validate.js";
import { anomalyAnalyzeSchema, anomalyConfigSchema } from "@repo/shared-validation";
import { detectAnomaly, type AnomalyConfig } from "../lib/anomaly-detector.js";
import "../types.js";

export const anomalyRoute = new Hono();

anomalyRoute.use("/*", jwtAuth);
anomalyRoute.use("/*", tenantContext);

// ========== Anomaly Detections ==========

// GET /api/v1/anomaly/detections — lista deteccoes
anomalyRoute.get("/detections", requirePermission("anomaly:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const status = c.req.query("status");
  const severity = c.req.query("severity");
  const deviceId = c.req.query("device_id");

  let sql = `SELECT a.*, d.hostname as device_hostname
     FROM public.anomaly_detections a
     JOIN public.devices d ON a.device_id = d.id
     WHERE a.tenant_id = $1`;
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (status) {
    sql += ` AND a.status = $${paramIdx++}`;
    params.push(status);
  }
  if (severity) {
    sql += ` AND a.severity = $${paramIdx++}`;
    params.push(severity);
  }
  if (deviceId) {
    sql += ` AND a.device_id = $${paramIdx++}`;
    params.push(deviceId);
  }

  sql += ` ORDER BY a.detected_at DESC LIMIT $${paramIdx++}`;
  params.push(limit);

  const result = await query(sql, params);

  return c.json({ detections: result.data?.rows ?? [] });
});

// POST /api/v1/anomaly/analyze — analisa uma metrica de um dispositivo
anomalyRoute.post("/analyze", requirePermission("anomaly:write"), validate({ schema: anomalyAnalyzeSchema }), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const body = c.get("validatedData") as { device_id: string; metric_name: string; values: number[]; observed_value: number };

  const { device_id, metric_name, values, observed_value } = body;

  // Busca configuracao ativa para a metrica
  const configResult = await query<{
    algorithm: string; window_size: number; zscore_threshold: number;
    iqr_multiplier: number; ewma_alpha: number; warning_threshold: number; critical_threshold: number;
  }>(
    "SELECT algorithm, window_size, zscore_threshold, iqr_multiplier, ewma_alpha, warning_threshold, critical_threshold FROM public.anomaly_config WHERE tenant_id = $1 AND metric_name = $2 AND is_active = true ORDER BY updated_at DESC LIMIT 1",
    [tenantId, metric_name],
  );

  // Config padrao se nao existir
  const dbConfig = configResult.data?.rows[0];
  const config: AnomalyConfig = {
    algorithm: dbConfig?.algorithm ?? "zscore",
    windowSize: dbConfig?.window_size ?? 100,
    zscoreThreshold: dbConfig?.zscore_threshold ?? 3.0,
    iqrMultiplier: dbConfig?.iqr_multiplier ?? 1.5,
    ewmaAlpha: dbConfig?.ewma_alpha ?? 0.3,
    warningThreshold: dbConfig?.warning_threshold ?? 2.0,
    criticalThreshold: dbConfig?.critical_threshold ?? 3.5,
  };

  // Usa apenas os ultimos N valores (window_size)
  const windowedValues = values.slice(-config.windowSize);

  const result = detectAnomaly(windowedValues, parseFloat(observed_value), config);

  // Se anomalia detectada, registra no banco
  if (result.isAnomaly) {
    const insertResult = await query<{ id: string }>(
      `INSERT INTO public.anomaly_detections
         (tenant_id, device_id, metric_name, algorithm, observed_value, expected_value,
          deviation_score, threshold_low, threshold_high, severity, window_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        tenantId, device_id, metric_name, config.algorithm,
        result.observedValue, result.expectedValue, result.deviationScore,
        result.thresholdLow, result.thresholdHigh, result.severity, config.windowSize,
      ],
    );

    return c.json({
      anomaly: true,
      detection_id: insertResult.data?.rows[0]?.id,
      ...result,
    });
  }

  return c.json({ anomaly: false, ...result });
});

// PUT /api/v1/anomaly/detections/:id/acknowledge — reconhece uma deteccao
anomalyRoute.put("/detections/:id/acknowledge", requirePermission("anomaly:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const detectionId = c.req.param("id");

  await query(
    "UPDATE public.anomaly_detections SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3",
    [user.sub, detectionId, tenantId],
  );

  return c.json({ acknowledged: true });
});

// PUT /api/v1/anomaly/detections/:id/resolve — resolve uma deteccao
anomalyRoute.put("/detections/:id/resolve", requirePermission("anomaly:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const detectionId = c.req.param("id");

  await query(
    "UPDATE public.anomaly_detections SET status = 'resolved' WHERE id = $1 AND tenant_id = $2",
    [detectionId, tenantId],
  );

  return c.json({ resolved: true });
});

// PUT /api/v1/anomaly/detections/:id/false-positive — marca como falso positivo
anomalyRoute.put("/detections/:id/false-positive", requirePermission("anomaly:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const detectionId = c.req.param("id");

  await query(
    "UPDATE public.anomaly_detections SET status = 'false_positive' WHERE id = $1 AND tenant_id = $2",
    [detectionId, tenantId],
  );

  return c.json({ updated: true });
});

// ========== Config ==========

// GET /api/v1/anomaly/config — lista configuracoes
anomalyRoute.get("/config", requirePermission("anomaly:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const result = await query(
    "SELECT * FROM public.anomaly_config WHERE tenant_id = $1 ORDER BY created_at DESC",
    [tenantId],
  );

  return c.json({ configs: result.data?.rows ?? [] });
});

// PUT /api/v1/anomaly/config — cria ou atualiza configuracao
anomalyRoute.put("/config", requirePermission("anomaly:write"), validate({ schema: anomalyConfigSchema }), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const body = c.get("validatedData") as { metric_name: string; algorithm?: string; window_size?: number; zscore_threshold?: number; iqr_multiplier?: number; ewma_alpha?: number; warning_threshold?: number; critical_threshold?: number; is_active?: boolean };

  const { metric_name, algorithm, window_size, zscore_threshold, iqr_multiplier, ewma_alpha, warning_threshold, critical_threshold, is_active } = body;

  const result = await query<{ id: string }>(
    `INSERT INTO public.anomaly_config
       (tenant_id, metric_name, algorithm, window_size, zscore_threshold,
        iqr_multiplier, ewma_alpha, warning_threshold, critical_threshold, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (tenant_id, metric_name, algorithm) DO UPDATE SET
       window_size = EXCLUDED.window_size,
       zscore_threshold = EXCLUDED.zscore_threshold,
       iqr_multiplier = EXCLUDED.iqr_multiplier,
       ewma_alpha = EXCLUDED.ewma_alpha,
       warning_threshold = EXCLUDED.warning_threshold,
       critical_threshold = EXCLUDED.critical_threshold,
       is_active = EXCLUDED.is_active
     RETURNING id`,
    [
      tenantId, metric_name,
      algorithm ?? "zscore", window_size ?? 100,
      zscore_threshold ?? 3.0, iqr_multiplier ?? 1.5, ewma_alpha ?? 0.3,
      warning_threshold ?? 2.0, critical_threshold ?? 3.5, is_active ?? true,
    ],
  );

  return c.json({ id: result.data?.rows[0]?.id, updated: true });
});

// ========== Stats ==========

// GET /api/v1/anomaly/stats — estatisticas
anomalyRoute.get("/stats", requirePermission("anomaly:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const totalResult = await query("SELECT COUNT(*) as count FROM public.anomaly_detections WHERE tenant_id = $1", [tenantId]);
  const openResult = await query("SELECT COUNT(*) as count FROM public.anomaly_detections WHERE tenant_id = $1 AND status = 'open'", [tenantId]);
  const criticalResult = await query("SELECT COUNT(*) as count FROM public.anomaly_detections WHERE tenant_id = $1 AND status = 'open' AND severity = 'critical'", [tenantId]);
  const falsePositiveResult = await query("SELECT COUNT(*) as count FROM public.anomaly_detections WHERE tenant_id = $1 AND status = 'false_positive'", [tenantId]);
  const byAlgorithmResult = await query(
    "SELECT algorithm, COUNT(*) as count FROM public.anomaly_detections WHERE tenant_id = $1 GROUP BY algorithm",
    [tenantId],
  );
  const recentResult = await query(
    "SELECT COUNT(*) as count FROM public.anomaly_detections WHERE tenant_id = $1 AND detected_at >= timezone('utc'::text, now()) - INTERVAL '24 hours'",
    [tenantId],
  );

  const getCount = (r: { data?: { rows?: Array<Record<string, unknown>> } | null }): number => {
    const row = r.data?.rows?.[0];
    return row ? parseInt((row.count as string) ?? "0", 10) : 0;
  };

  return c.json({
    total: getCount(totalResult),
    open: getCount(openResult),
    critical: getCount(criticalResult),
    false_positives: getCount(falsePositiveResult),
    recent_24h: getCount(recentResult),
    by_algorithm: byAlgorithmResult.data?.rows ?? [],
  });
});
