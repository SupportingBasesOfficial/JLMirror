// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { validate } from "../middleware/validate.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import {
  anomalyAnalyzeSchema,
  anomalyConfigSchema,
} from "@repo/shared-validation";
import { detectAnomaly, type AnomalyConfig } from "../lib/anomaly-detector.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const anomalyRoute = new Hono();

// GET /api/v1/anomaly — overview do modulo
anomalyRoute.get(
  "/",
  requirePermission("anomaly:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const detectionsResult = await query(
        "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'open') as open FROM public.anomaly_detections WHERE tenant_id = $1",
        [tenantId],
      );

      return c.json({
        overview: {
          detections: detectionsResult.data?.rows[0] ?? {
            total: "0",
            open: "0",
          },
        },
        endpoints: ["/detections", "/analyze", "/stats", "/config"],
      });
    } catch (error) {
      logger.error("Erro ao buscar anomaly overview", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// ========== Anomaly Detections ==========

// GET /api/v1/anomaly/detections — lista deteccoes
anomalyRoute.get(
  "/detections",
  requirePermission("anomaly:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
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

    try {
      const result = await query(sql, params);

      return c.json({ detections: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar anomaly detections", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/anomaly/analyze — analisa uma metrica de um dispositivo
anomalyRoute.post(
  "/analyze",
  requirePermission("anomaly:write"),
  rateLimitWrite,
  validate({ schema: anomalyAnalyzeSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as {
      device_id: string;
      metric_name: string;
      values: number[];
      observed_value: number;
    };

    const { device_id, metric_name, values, observed_value } = body;

    try {
      // Busca configuracao ativa para a metrica
      const configResult = await query<{
        algorithm: string;
        window_size: number;
        zscore_threshold: number;
        iqr_multiplier: number;
        ewma_alpha: number;
        warning_threshold: number;
        critical_threshold: number;
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

      const result = detectAnomaly(windowedValues, observed_value, config);

      // Se anomalia detectada, registra no banco
      if (result.isAnomaly) {
        const insertResult = await query<{ id: string }>(
          `INSERT INTO public.anomaly_detections
           (tenant_id, device_id, metric_name, algorithm, observed_value, expected_value,
            deviation_score, threshold_low, threshold_high, severity, window_size)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [
            tenantId,
            device_id,
            metric_name,
            config.algorithm,
            result.observedValue,
            result.expectedValue,
            result.deviationScore,
            result.thresholdLow,
            result.thresholdHigh,
            result.severity,
            config.windowSize,
          ],
        );

        const detectionId = insertResult.data?.rows[0]?.id;

        if (userId) {
          try {
            await writeAuditLog({
              userId,
              tenantId,
              action: "anomaly.analyze",
              entityType: "anomaly_detections",
              entityId: detectionId,
              newData: {
                device_id,
                metric_name,
                severity: result.severity,
                deviation_score: result.deviationScore,
              },
            });
          } catch {
            // Audit log falhou — nao bloqueia
          }
        }

        logger.info("Anomalia detectada", {
          detectionId,
          device_id,
          metric_name,
          severity: result.severity,
          tenantId,
        });

        return c.json({
          anomaly: true,
          detection_id: detectionId,
          ...result,
        });
      }

      logger.info("Anomalia analisada sem deteccao", {
        device_id,
        metric_name,
        tenantId,
      });

      return c.json({ anomaly: false, ...result });
    } catch (error) {
      logger.error("Erro ao analisar anomalia", {
        device_id,
        metric_name,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "ANALYZE_ERROR", message: "Erro ao analisar" } },
        500,
      );
    }
  },
);

// PUT /api/v1/anomaly/detections/:id/acknowledge — reconhece uma deteccao
anomalyRoute.put(
  "/detections/:id/acknowledge",
  requirePermission("anomaly:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const detectionId = c.req.param("id");

    try {
      const result = await query(
        "UPDATE public.anomaly_detections SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3",
        [userId, detectionId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Detecção não encontrada" } },
          404,
        );
      }

      logger.info("Anomalia reconhecida", { detectionId, tenantId });

      return c.json({ acknowledged: true });
    } catch (error) {
      logger.error("Erro ao reconhecer anomalia", {
        detectionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao reconhecer" } },
        500,
      );
    }
  },
);

// PUT /api/v1/anomaly/detections/:id/resolve — resolve uma deteccao
anomalyRoute.put(
  "/detections/:id/resolve",
  requirePermission("anomaly:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const detectionId = c.req.param("id");

    try {
      const result = await query(
        "UPDATE public.anomaly_detections SET status = 'resolved' WHERE id = $1 AND tenant_id = $2",
        [detectionId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Detecção não encontrada" } },
          404,
        );
      }

      logger.info("Anomalia resolvida", { detectionId, tenantId });

      return c.json({ resolved: true });
    } catch (error) {
      logger.error("Erro ao resolver anomalia", {
        detectionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao resolver" } },
        500,
      );
    }
  },
);

// PUT /api/v1/anomaly/detections/:id/false-positive — marca como falso positivo
anomalyRoute.put(
  "/detections/:id/false-positive",
  requirePermission("anomaly:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const detectionId = c.req.param("id");

    try {
      const result = await query(
        "UPDATE public.anomaly_detections SET status = 'false_positive' WHERE id = $1 AND tenant_id = $2",
        [detectionId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Detecção não encontrada" } },
          404,
        );
      }

      logger.info("Anomalia marcada como falso positivo", {
        detectionId,
        tenantId,
      });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao marcar falso positivo", {
        detectionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// ========== Config ==========

// GET /api/v1/anomaly/config — lista configuracoes
anomalyRoute.get(
  "/config",
  requirePermission("anomaly:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "SELECT * FROM public.anomaly_config WHERE tenant_id = $1 ORDER BY created_at DESC",
        [tenantId],
      );

      return c.json({ configs: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar anomaly configs", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// PUT /api/v1/anomaly/config — cria ou atualiza configuracao
anomalyRoute.put(
  "/config",
  requirePermission("anomaly:write"),
  rateLimitWrite,
  validate({ schema: anomalyConfigSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as {
      metric_name: string;
      algorithm?: string;
      window_size?: number;
      zscore_threshold?: number;
      iqr_multiplier?: number;
      ewma_alpha?: number;
      warning_threshold?: number;
      critical_threshold?: number;
      is_active?: boolean;
    };

    const {
      metric_name,
      algorithm,
      window_size,
      zscore_threshold,
      iqr_multiplier,
      ewma_alpha,
      warning_threshold,
      critical_threshold,
      is_active,
    } = body;

    try {
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
          tenantId,
          metric_name,
          algorithm ?? "zscore",
          window_size ?? 100,
          zscore_threshold ?? 3.0,
          iqr_multiplier ?? 1.5,
          ewma_alpha ?? 0.3,
          warning_threshold ?? 2.0,
          critical_threshold ?? 3.5,
          is_active ?? true,
        ],
      );

      const configId = result.data?.rows[0]?.id;

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "anomaly.config.update",
            entityType: "anomaly_config",
            entityId: configId,
            newData: { metric_name, algorithm },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Anomaly config atualizada", {
        configId,
        metric_name,
        tenantId,
      });

      return c.json({ id: configId, updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar anomaly config", {
        tenantId,
        metric_name,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// ========== Stats ==========

// GET /api/v1/anomaly/stats — estatisticas
anomalyRoute.get(
  "/stats",
  requirePermission("anomaly:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 6 queries independentes
      const [
        totalResult,
        openResult,
        criticalResult,
        falsePositiveResult,
        byAlgorithmResult,
        recentResult,
      ] = await Promise.all([
        query(
          "SELECT COUNT(*) as count FROM public.anomaly_detections WHERE tenant_id = $1",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.anomaly_detections WHERE tenant_id = $1 AND status = 'open'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.anomaly_detections WHERE tenant_id = $1 AND status = 'open' AND severity = 'critical'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.anomaly_detections WHERE tenant_id = $1 AND status = 'false_positive'",
          [tenantId],
        ),
        query(
          "SELECT algorithm, COUNT(*) as count FROM public.anomaly_detections WHERE tenant_id = $1 GROUP BY algorithm",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.anomaly_detections WHERE tenant_id = $1 AND detected_at >= timezone('utc'::text, now()) - INTERVAL '24 hours'",
          [tenantId],
        ),
      ]);

      const getCount = (r: {
        data?: { rows?: Array<Record<string, unknown>> } | null;
      }): number => {
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
    } catch (error) {
      logger.error("Erro ao buscar anomaly stats", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);
