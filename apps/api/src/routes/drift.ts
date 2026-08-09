// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { createHash } from "node:crypto";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { validate } from "../middleware/validate.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { driftBaselineSchema, driftScanSchema } from "@repo/shared-validation";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const driftRoute = new Hono();

// GET /api/v1/drift — overview do modulo
driftRoute.get(
  "/",
  requirePermission("drift:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 2 queries independentes
      const [baselinesResult, eventsResult] = await Promise.all([
        query(
          "SELECT COUNT(*) as total FROM public.config_baselines WHERE tenant_id = $1",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'open') as open FROM public.config_drift_events WHERE tenant_id = $1",
          [tenantId],
        ),
      ]);

      return c.json({
        overview: {
          baselines: baselinesResult.data?.rows[0]?.total ?? "0",
          events: eventsResult.data?.rows[0] ?? { total: "0", open: "0" },
        },
        endpoints: ["/baselines", "/events", "/scan", "/stats"],
      });
    } catch (error) {
      logger.error("Erro ao buscar drift overview", {
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

// ========== Baselines ==========

// GET /api/v1/drift/baselines — lista baselines
driftRoute.get(
  "/baselines",
  requirePermission("drift:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Corrigido N+1: LEFT JOIN + agregacao em vez de subquery por linha
      const result = await query(
        `SELECT b.*, d.hostname as device_hostname, d.ip as device_ip,
           COALESCE(ed.open_drifts, 0) as open_drifts
         FROM public.config_baselines b
         JOIN public.devices d ON b.device_id = d.id
         LEFT JOIN (
           SELECT baseline_id, COUNT(*) as open_drifts
           FROM public.config_drift_events
           WHERE status = 'open'
           GROUP BY baseline_id
         ) ed ON ed.baseline_id = b.id
         WHERE b.tenant_id = $1
         ORDER BY b.created_at DESC`,
        [tenantId],
      );

      return c.json({ baselines: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar drift baselines", {
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

// POST /api/v1/drift/baselines — captura baseline de um dispositivo
driftRoute.post(
  "/baselines",
  requirePermission("drift:write"),
  rateLimitWrite,
  validate({ schema: driftBaselineSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as {
      device_id: string;
      name: string;
      config_snapshot: Record<string, unknown>;
    };
    const { device_id, name, config_snapshot } = body;

    try {
      // Valida que o dispositivo pertence ao tenant
      const deviceResult = await query(
        "SELECT id, hostname FROM public.devices WHERE id = $1 AND tenant_id = $2",
        [device_id, tenantId],
      );
      if (!deviceResult.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "DEVICE_NOT_FOUND",
              message: "Dispositivo não encontrado",
            },
          },
          404,
        );
      }

      const configHash = createHash("sha256")
        .update(JSON.stringify(config_snapshot))
        .digest("hex");

      const result = await query<{ id: string }>(
        `INSERT INTO public.config_baselines (tenant_id, device_id, name, config_snapshot, config_hash, captured_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (device_id, name) DO UPDATE SET
           config_snapshot = EXCLUDED.config_snapshot,
           config_hash = EXCLUDED.config_hash,
           captured_at = timezone('utc'::text, now()),
           captured_by = EXCLUDED.captured_by,
           is_active = true
         RETURNING id`,
        [
          tenantId,
          device_id,
          name,
          JSON.stringify(config_snapshot),
          configHash,
          userId,
        ],
      );

      const baselineId = result.data?.rows[0]?.id;

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "drift.baseline.create",
            entityType: "config_baselines",
            entityId: baselineId,
            newData: { id: baselineId, device_id, name },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Drift baseline criado", {
        baselineId,
        device_id,
        name,
        tenantId,
      });

      return c.json({
        id: baselineId,
        created: true,
        config_hash: configHash,
      });
    } catch (error) {
      logger.error("Erro ao criar drift baseline", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar" } },
        500,
      );
    }
  },
);

// DELETE /api/v1/drift/baselines/:id — remove baseline
driftRoute.delete(
  "/baselines/:id",
  requirePermission("drift:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const baselineId = c.req.param("id");

    try {
      const result = await query(
        "DELETE FROM public.config_baselines WHERE id = $1 AND tenant_id = $2",
        [baselineId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Baseline não encontrada" } },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "drift.baseline.delete",
            entityType: "config_baselines",
            entityId: baselineId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Drift baseline removida", { baselineId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover drift baseline", {
        baselineId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover" } },
        500,
      );
    }
  },
);

// ========== Drift Events ==========

// GET /api/v1/drift/events — lista eventos de drift
driftRoute.get(
  "/events",
  requirePermission("drift:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
    const status = c.req.query("status");
    const deviceId = c.req.query("device_id");

    let sql = `SELECT e.*, d.hostname as device_hostname, b.name as baseline_name
       FROM public.config_drift_events e
       JOIN public.devices d ON e.device_id = d.id
       JOIN public.config_baselines b ON e.baseline_id = b.id
       WHERE e.tenant_id = $1`;
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (status) {
      sql += ` AND e.status = $${paramIdx++}`;
      params.push(status);
    }
    if (deviceId) {
      sql += ` AND e.device_id = $${paramIdx++}`;
      params.push(deviceId);
    }

    sql += ` ORDER BY e.detected_at DESC LIMIT $${paramIdx++}`;
    params.push(limit);

    try {
      const result = await query(sql, params);

      return c.json({ events: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar drift events", {
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

// POST /api/v1/drift/scan — escanea um dispositivo contra baseline
driftRoute.post(
  "/scan",
  requirePermission("drift:write"),
  rateLimitWrite,
  validate({ schema: driftScanSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as {
      device_id: string;
      current_config: Record<string, unknown>;
    };
    const { device_id, current_config } = body;

    try {
      // Busca baseline ativo
      const baselineResult = await query<{
        id: string;
        config_snapshot: Record<string, unknown>;
        config_hash: string;
      }>(
        "SELECT id, config_snapshot, config_hash FROM public.config_baselines WHERE device_id = $1 AND tenant_id = $2 AND is_active = true ORDER BY captured_at DESC LIMIT 1",
        [device_id, tenantId],
      );

      const baseline = baselineResult.data?.rows[0];
      if (!baseline) {
        return c.json(
          {
            error: {
              code: "NO_BASELINE",
              message: "Nenhum baseline ativo encontrado para este dispositivo",
            },
          },
          404,
        );
      }

      const baselineConfig = baseline.config_snapshot as Record<
        string,
        unknown
      >;
      const drifts: Array<{
        path: string;
        drift_type: string;
        old_value: string | null;
        new_value: string | null;
        severity: string;
      }> = [];

      // Compara chaves
      const allKeys = new Set([
        ...Object.keys(baselineConfig),
        ...Object.keys(current_config),
      ]);

      for (const key of allKeys) {
        const inBaseline = key in baselineConfig;
        const inCurrent = key in current_config;
        const oldVal = inBaseline ? JSON.stringify(baselineConfig[key]) : null;
        const newVal = inCurrent ? JSON.stringify(current_config[key]) : null;

        if (!inBaseline && inCurrent) {
          drifts.push({
            path: key,
            drift_type: "added",
            old_value: null,
            new_value: newVal,
            severity: "warning",
          });
        } else if (inBaseline && !inCurrent) {
          drifts.push({
            path: key,
            drift_type: "removed",
            old_value: oldVal,
            new_value: null,
            severity: "critical",
          });
        } else if (oldVal !== newVal) {
          drifts.push({
            path: key,
            drift_type: "modified",
            old_value: oldVal,
            new_value: newVal,
            severity: "warning",
          });
        }
      }

      // Batch insert: todos drifts em uma unica query
      let inserted = 0;
      if (drifts.length > 0) {
        const valuesClause: string[] = [];
        const insertParams: unknown[] = [];
        let paramIdx = 1;

        for (const drift of drifts) {
          valuesClause.push(
            `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`,
          );
          insertParams.push(
            tenantId,
            device_id,
            baseline.id,
            drift.drift_type,
            drift.path,
            drift.old_value,
            drift.new_value,
            drift.severity,
          );
        }

        await query(
          `INSERT INTO public.config_drift_events (tenant_id, device_id, baseline_id, drift_type, config_path, old_value, new_value, severity)
           VALUES ${valuesClause.join(", ")}`,
          insertParams,
        );
        inserted = drifts.length;
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "drift.scan",
            entityType: "config_drift_events",
            entityId: baseline.id,
            newData: {
              device_id,
              baseline_id: baseline.id,
              drifts_found: inserted,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Drift scan concluido", {
        device_id,
        baselineId: baseline.id,
        driftsFound: inserted,
        tenantId,
      });

      return c.json({ drifts_found: inserted, drifts });
    } catch (error) {
      logger.error("Erro ao executar drift scan", {
        device_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "SCAN_ERROR", message: "Erro ao escanear" } },
        500,
      );
    }
  },
);

// PUT /api/v1/drift/events/:id/resolve — resolve um drift
driftRoute.put(
  "/events/:id/resolve",
  requirePermission("drift:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const eventId = c.req.param("id");

    try {
      const result = await query(
        "UPDATE public.config_drift_events SET status = 'resolved', resolved_by = $1, resolved_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3",
        [userId, eventId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Evento não encontrado" } },
          404,
        );
      }

      logger.info("Drift event resolvido", { eventId, tenantId });

      return c.json({ resolved: true });
    } catch (error) {
      logger.error("Erro ao resolver drift event", {
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao resolver" } },
        500,
      );
    }
  },
);

// PUT /api/v1/drift/events/:id/acknowledge — reconhece um drift
driftRoute.put(
  "/events/:id/acknowledge",
  requirePermission("drift:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const eventId = c.req.param("id");

    try {
      const result = await query(
        "UPDATE public.config_drift_events SET status = 'acknowledged' WHERE id = $1 AND tenant_id = $2",
        [eventId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Evento não encontrado" } },
          404,
        );
      }

      logger.info("Drift event reconhecido", { eventId, tenantId });

      return c.json({ acknowledged: true });
    } catch (error) {
      logger.error("Erro ao reconhecer drift event", {
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao reconhecer" } },
        500,
      );
    }
  },
);

// GET /api/v1/drift/stats — estatisticas
driftRoute.get(
  "/stats",
  requirePermission("drift:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 5 queries independentes
      const [
        totalBaselines,
        openDrifts,
        criticalDrifts,
        recentDrifts,
        byDevice,
      ] = await Promise.all([
        query(
          "SELECT COUNT(*) as count FROM public.config_baselines WHERE tenant_id = $1 AND is_active = true",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.config_drift_events WHERE tenant_id = $1 AND status = 'open'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.config_drift_events WHERE tenant_id = $1 AND status = 'open' AND severity = 'critical'",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as count FROM public.config_drift_events WHERE tenant_id = $1 AND detected_at >= timezone('utc'::text, now()) - INTERVAL '24 hours'",
          [tenantId],
        ),
        query(
          `SELECT d.hostname, COUNT(*) as drift_count
             FROM public.config_drift_events e
             JOIN public.devices d ON e.device_id = d.id
             WHERE e.tenant_id = $1 AND e.status = 'open'
             GROUP BY d.hostname ORDER BY drift_count DESC LIMIT 10`,
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
        total_baselines: getCount(totalBaselines),
        open_drifts: getCount(openDrifts),
        critical_drifts: getCount(criticalDrifts),
        recent_drifts_24h: getCount(recentDrifts),
        by_device: byDevice.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar drift stats", {
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
