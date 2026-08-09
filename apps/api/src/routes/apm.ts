// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { httpCache } from "../middleware/http-cache.js";
import "../types.js";

export const apmRoute = new Hono();

// GET /api/v1/apm — overview do modulo
apmRoute.get(
  "/",
  requirePermission("traces:read"),
  httpCache(60),
  async (c) => {
    return c.json({
      overview: "APM — Application Performance Monitoring",
      endpoints: ["/overview", "/throughput"],
    });
  },
);

// GET /api/v1/apm/overview — dashboard de observabilidade runtime
apmRoute.get(
  "/overview",
  requirePermission("traces:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 6 queries independentes (antes seriais)
      const [
        traceStats,
        topServices,
        slowOperations,
        recentErrors,
        throughput,
        taskStats,
      ] = await Promise.all([
        query<{
          total_traces: string;
          total_spans: string;
          error_spans: string;
          avg_duration_ms: string;
          p95_duration_ms: string;
          p99_duration_ms: string;
        }>(
          `SELECT
            COUNT(DISTINCT trace_id)::text as total_traces,
            COUNT(*)::text as total_spans,
            COUNT(*) FILTER (WHERE status = 'error')::text as error_spans,
            AVG(duration_ms)::text as avg_duration_ms,
            COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::text as p95_duration_ms,
            COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms), 0)::text as p99_duration_ms
          FROM public.trace_spans
          WHERE start_time >= timezone('utc'::text, now()) - INTERVAL '15 minutes'
            AND ($1::uuid IS NULL OR tenant_id = $1)`,
          [tenantId],
        ),
        query<{
          service: string;
          span_count: string;
          error_count: string;
          avg_duration_ms: string;
        }>(
          `SELECT
            service,
            COUNT(*)::text as span_count,
            COUNT(*) FILTER (WHERE status = 'error')::text as error_count,
            AVG(duration_ms)::text as avg_duration_ms
          FROM public.trace_spans
          WHERE start_time >= timezone('utc'::text, now()) - INTERVAL '15 minutes'
            AND ($1::uuid IS NULL OR tenant_id = $1)
          GROUP BY service
          ORDER BY span_count DESC
          LIMIT 5`,
          [tenantId],
        ),
        query<{
          operation_name: string;
          service: string;
          avg_duration_ms: string;
          max_duration_ms: string;
          count: string;
        }>(
          `SELECT
            operation_name,
            service,
            AVG(duration_ms)::text as avg_duration_ms,
            MAX(duration_ms)::text as max_duration_ms,
            COUNT(*)::text as count
          FROM public.trace_spans
          WHERE start_time >= timezone('utc'::text, now()) - INTERVAL '15 minutes'
            AND ($1::uuid IS NULL OR tenant_id = $1)
          GROUP BY operation_name, service
          ORDER BY avg_duration_ms DESC
          LIMIT 5`,
          [tenantId],
        ),
        query<{
          trace_id: string;
          operation_name: string;
          service: string;
          status_message: string;
          start_time: string;
          duration_ms: number;
        }>(
          `SELECT trace_id, operation_name, service, status_message, start_time, duration_ms
          FROM public.trace_spans
          WHERE status = 'error'
            AND start_time >= timezone('utc'::text, now()) - INTERVAL '15 minutes'
            AND ($1::uuid IS NULL OR tenant_id = $1)
          ORDER BY start_time DESC
          LIMIT 10`,
          [tenantId],
        ),
        query<{ minute: string; count: string }>(
          `SELECT
            date_trunc('minute', start_time) as minute,
            COUNT(*)::text as count
          FROM public.trace_spans
          WHERE start_time >= timezone('utc'::text, now()) - INTERVAL '15 minutes'
            AND ($1::uuid IS NULL OR tenant_id = $1)
          GROUP BY date_trunc('minute', start_time)
          ORDER BY minute ASC`,
          [tenantId],
        ),
        query<{
          active_tasks: string;
          due_soon: string;
          failed_today: string;
          running: string;
        }>(
          `SELECT
            COUNT(*) FILTER (WHERE is_active = true)::text as active_tasks,
            COUNT(*) FILTER (WHERE is_active = true AND next_run_at IS NOT NULL AND next_run_at <= timezone('utc'::text, now()) + INTERVAL '1 hour')::text as due_soon,
            COUNT(*) FILTER (WHERE last_run_status = 'failed' AND last_run_at >= timezone('utc'::text, now()) - INTERVAL '24 hours')::text as failed_today,
            COUNT(*) FILTER (WHERE last_run_status = 'running')::text as running
          FROM public.scheduled_tasks
          WHERE $1::uuid IS NULL OR tenant_id = $1`,
          [tenantId],
        ),
      ]);

      return c.json({
        window: "15min",
        traces: traceStats.data?.rows[0] ?? null,
        top_services: topServices.data?.rows ?? [],
        slow_operations: slowOperations.data?.rows ?? [],
        recent_errors: recentErrors.data?.rows ?? [],
        throughput: throughput.data?.rows ?? [],
        tasks: taskStats.data?.rows[0] ?? null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Erro no overview APM", {
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

// GET /api/v1/apm/throughput — throughput por minuto em tempo real
apmRoute.get(
  "/throughput",
  requirePermission("traces:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const minutesRaw = parseInt(c.req.query("minutes") ?? "15", 10);
    // Valida minutes — fallback para 15 se NaN ou invalido
    const minutes =
      Number.isNaN(minutesRaw) || minutesRaw < 1
        ? 15
        : Math.min(minutesRaw, 60);

    try {
      const result = await query<{
        minute: string;
        count: string;
        error_count: string;
      }>(
        `SELECT
          date_trunc('minute', start_time) as minute,
          COUNT(*)::text as count,
          COUNT(*) FILTER (WHERE status = 'error')::text as error_count
        FROM public.trace_spans
        WHERE start_time >= timezone('utc'::text, now()) - make_interval(mins => $2::int)
          AND ($1::uuid IS NULL OR tenant_id = $1)
        GROUP BY date_trunc('minute', start_time)
        ORDER BY minute ASC`,
        [tenantId, minutes],
      );

      return c.json({ data: result.data?.rows ?? [], minutes });
    } catch (error) {
      logger.error("Erro ao buscar throughput APM", {
        tenantId,
        minutes,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);
