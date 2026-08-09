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
  predictionAnalyzeSchema,
  predictionConfigSchema,
} from "@repo/shared-validation";
import {
  predictFailure,
  type PredictionConfig,
} from "../lib/failure-predictor.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const predictionRoute = new Hono();

// ========== Predictions ==========

// GET /api/v1/predictions — lista predicoes
predictionRoute.get(
  "/",
  requirePermission("prediction:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
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

    try {
      const result = await query(sql, params);

      return c.json({ predictions: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar predictions", {
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

// POST /api/v1/predictions/analyze — analisa uma metrica e gera predicao
predictionRoute.post(
  "/analyze",
  requirePermission("prediction:write"),
  rateLimitWrite,
  validate({ schema: predictionAnalyzeSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as {
      device_id: string;
      metric_name: string;
      values: number[];
    };
    const { device_id, metric_name, values } = body;

    try {
      // Busca configuracao ativa
      const configResult = await query<{
        model_type: string;
        window_size: number;
        threshold_value: number;
        threshold_direction: string;
        prediction_horizon_hours: number;
        warning_probability: number;
        critical_probability: number;
      }>(
        "SELECT model_type, window_size, threshold_value, threshold_direction, prediction_horizon_hours, warning_probability, critical_probability FROM public.prediction_config WHERE tenant_id = $1 AND metric_name = $2 AND is_active = true ORDER BY updated_at DESC LIMIT 1",
        [tenantId, metric_name],
      );

      const dbConfig = configResult.data?.rows[0];
      if (!dbConfig) {
        return c.json(
          {
            error: {
              code: "NO_CONFIG",
              message:
                "Nenhuma configuração de predição ativa para esta métrica",
            },
          },
          404,
        );
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
            tenantId,
            device_id,
            metric_name,
            config.modelType,
            result.predictedFailure,
            result.failureProbability,
            result.estimatedFailureHours,
            result.estimatedFailureAt,
            result.currentValue,
            result.predictedValue,
            result.thresholdValue,
            result.trendSlope,
            result.rSquared,
            result.severity,
          ],
        );

        const predictionId = insertResult.data?.rows[0]?.id;

        if (userId) {
          try {
            await writeAuditLog({
              userId,
              tenantId,
              action: "prediction.analyze",
              entityType: "failure_predictions",
              entityId: predictionId,
              newData: {
                device_id,
                metric_name,
                severity: result.severity,
                probability: result.failureProbability,
              },
            });
          } catch {
            // Audit log falhou — nao bloqueia
          }
        }

        logger.info("Prediction gerada com risco", {
          predictionId,
          device_id,
          metric_name,
          severity: result.severity,
          tenantId,
        });

        return c.json({
          prediction_id: predictionId,
          ...result,
        });
      }

      logger.info("Prediction analisada sem risco", {
        device_id,
        metric_name,
        tenantId,
      });

      return c.json(result);
    } catch (error) {
      logger.error("Erro ao analisar prediction", {
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

// PUT /api/v1/predictions/:id/acknowledge
predictionRoute.put(
  "/:id/acknowledge",
  requirePermission("prediction:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const predictionId = c.req.param("id");

    try {
      const result = await query(
        "UPDATE public.failure_predictions SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3",
        [userId, predictionId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Predição não encontrada" } },
          404,
        );
      }

      logger.info("Prediction reconhecida", { predictionId, tenantId });

      return c.json({ acknowledged: true });
    } catch (error) {
      logger.error("Erro ao reconhecer prediction", {
        predictionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao reconhecer" } },
        500,
      );
    }
  },
);

// PUT /api/v1/predictions/:id/mitigate
predictionRoute.put(
  "/:id/mitigate",
  requirePermission("prediction:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const predictionId = c.req.param("id");

    try {
      const result = await query(
        "UPDATE public.failure_predictions SET status = 'mitigated' WHERE id = $1 AND tenant_id = $2",
        [predictionId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Predição não encontrada" } },
          404,
        );
      }

      logger.info("Prediction mitigada", { predictionId, tenantId });

      return c.json({ mitigated: true });
    } catch (error) {
      logger.error("Erro ao mitigar prediction", {
        predictionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao mitigar" } },
        500,
      );
    }
  },
);

// PUT /api/v1/predictions/:id/occurred
predictionRoute.put(
  "/:id/occurred",
  requirePermission("prediction:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const predictionId = c.req.param("id");

    try {
      const result = await query(
        "UPDATE public.failure_predictions SET status = 'occurred' WHERE id = $1 AND tenant_id = $2",
        [predictionId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Predição não encontrada" } },
          404,
        );
      }

      logger.info("Prediction ocorrida", { predictionId, tenantId });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao marcar prediction como ocorrida", {
        predictionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// PUT /api/v1/predictions/:id/false-positive
predictionRoute.put(
  "/:id/false-positive",
  requirePermission("prediction:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const predictionId = c.req.param("id");

    try {
      const result = await query(
        "UPDATE public.failure_predictions SET status = 'false_positive' WHERE id = $1 AND tenant_id = $2",
        [predictionId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Predição não encontrada" } },
          404,
        );
      }

      logger.info("Prediction marcada como falso positivo", {
        predictionId,
        tenantId,
      });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao marcar falso positivo", {
        predictionId,
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

// GET /api/v1/predictions/config
predictionRoute.get(
  "/config",
  requirePermission("prediction:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "SELECT * FROM public.prediction_config WHERE tenant_id = $1 ORDER BY created_at DESC",
        [tenantId],
      );

      return c.json({ configs: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar prediction configs", {
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

// PUT /api/v1/predictions/config
predictionRoute.put(
  "/config",
  requirePermission("prediction:write"),
  rateLimitWrite,
  validate({ schema: predictionConfigSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as {
      metric_name: string;
      model_type?: string;
      window_size?: number;
      threshold_value: number;
      threshold_direction?: string;
      prediction_horizon_hours?: number;
      warning_probability?: number;
      critical_probability?: number;
      is_active?: boolean;
    };
    const {
      metric_name,
      model_type,
      window_size,
      threshold_value,
      threshold_direction,
      prediction_horizon_hours,
      warning_probability,
      critical_probability,
      is_active,
    } = body;

    try {
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
          tenantId,
          metric_name,
          model_type ?? "linear_trend",
          window_size ?? 168,
          threshold_value,
          threshold_direction ?? "above",
          prediction_horizon_hours ?? 72,
          warning_probability ?? 0.5,
          critical_probability ?? 0.8,
          is_active ?? true,
        ],
      );

      const configId = result.data?.rows[0]?.id;

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "prediction.config.update",
            entityType: "prediction_config",
            entityId: configId,
            newData: { metric_name, model_type, threshold_value },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Prediction config atualizada", {
        configId,
        metric_name,
        tenantId,
      });

      return c.json({ id: configId, updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar prediction config", {
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

// GET /api/v1/predictions/stats
predictionRoute.get(
  "/stats",
  requirePermission("prediction:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 7 queries independentes
      const [
        totalResult,
        openResult,
        criticalResult,
        occurredResult,
        mitigatedResult,
        falsePositiveResult,
        byModelResult,
      ] = await Promise.all([
        query(
          "SELECT COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1 AND status = 'open'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1 AND status = 'open' AND severity = 'critical'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1 AND status = 'occurred'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1 AND status = 'mitigated'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1 AND status = 'false_positive'",
          [tenantId],
        ),
        query(
          "SELECT model_type, COUNT(*) as count FROM public.failure_predictions WHERE tenant_id = $1 GROUP BY model_type",
          [tenantId],
        ),
      ]);

      const getCount = (r: {
        data?: { rows?: Array<Record<string, unknown>> } | null;
      }): number => {
        const row = r.data?.rows?.[0];
        return row ? parseInt((row.count as string) ?? "0", 10) : 0;
      };

      const total = getCount(totalResult);
      const occurred = getCount(occurredResult);
      const mitigated = getCount(mitigatedResult);
      const accuracy = total > 0 ? ((occurred + mitigated) / total) * 100 : 0;

      return c.json({
        total: total,
        open: getCount(openResult),
        critical: getCount(criticalResult),
        occurred: occurred,
        mitigated: mitigated,
        false_positives: getCount(falsePositiveResult),
        accuracy: parseFloat(accuracy.toFixed(1)),
        by_model: byModelResult.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar prediction stats", {
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
