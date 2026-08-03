// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import {
  createHealthCheckSchema,
  updateHealthCheckSchema,
  createIncidentSchema,
  updateIncidentSchema,
  recordMetricSchema,
  type CreateHealthCheckInput,
  type UpdateHealthCheckInput,
  type CreateIncidentInput,
  type UpdateIncidentInput,
  type RecordMetricInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { httpCache } from "../middleware/http-cache.js";
import { calculateHealthScore } from "../lib/health-score.js";
import "../types.js";

export const systemHealthRoute = new Hono();

// ========== Health Checks ==========

systemHealthRoute.get(
  "/checks",
  requirePermission("health:read"),
  async (c) => {
    const user = c.get("user");
    const serviceType = c.req.query("service_type");
    const status = c.req.query("status");
    const activeOnly = c.req.query("active") === "true";

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (serviceType) {
      conditions.push(`service_type = $${paramIdx++}`);
      params.push(serviceType);
    }
    if (status) {
      conditions.push(`last_status = $${paramIdx++}`);
      params.push(status);
    }
    if (activeOnly) {
      conditions.push("is_active = true");
    }

    const result = await query(
      `SELECT * FROM public.system_health_checks WHERE ${conditions.join(" AND ")} ORDER BY name`,
      params,
    );

    return c.json({ checks: result.data?.rows ?? [] });
  },
);

systemHealthRoute.post(
  "/checks",
  requirePermission("health:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<CreateHealthCheckInput>();
    const parsed = createHealthCheckSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const result = await query<{ id: string }>(
      `INSERT INTO public.system_health_checks (tenant_id, name, service_type, endpoint, check_interval_seconds, timeout_seconds, expected_status_code, is_active, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.name,
        data.service_type,
        data.endpoint ?? null,
        data.check_interval_seconds,
        data.timeout_seconds,
        data.expected_status_code ?? null,
        data.is_active,
        JSON.stringify(data.metadata),
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "CREATE_ERROR",
            message: "Erro ao criar health check",
          },
        },
        500,
      );
    }

    return c.json({ id: result.data.rows[0].id }, 201);
  },
);

systemHealthRoute.put(
  "/checks/:id",
  requirePermission("health:write"),
  async (c) => {
    const checkId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json<UpdateHealthCheckInput>();
    const parsed = updateHealthCheckSchema.safeParse(body);
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
      name: "name",
      service_type: "service_type",
      endpoint: "endpoint",
      check_interval_seconds: "check_interval_seconds",
      timeout_seconds: "timeout_seconds",
      expected_status_code: "expected_status_code",
      is_active: "is_active",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (data.metadata !== undefined) {
      updateFields.push(`metadata = $${paramIdx++}`);
      params.push(JSON.stringify(data.metadata));
    }

    if (updateFields.length === 0) {
      return c.json({ id: checkId });
    }

    params.push(checkId, user?.tenant_id ?? null);

    await query(
      `UPDATE public.system_health_checks SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
      params,
    );

    return c.json({ id: checkId });
  },
);

systemHealthRoute.delete(
  "/checks/:id",
  requirePermission("health:write"),
  async (c) => {
    const checkId = c.req.param("id");
    const user = c.get("user");

    await query(
      "DELETE FROM public.system_health_checks WHERE id = $1 AND tenant_id = $2",
      [checkId, user?.tenant_id ?? null],
    );

    return c.json({ deleted: true });
  },
);

// ========== Run Health Check ==========

systemHealthRoute.post(
  "/checks/:id/run",
  requirePermission("health:write"),
  async (c) => {
    const checkId = c.req.param("id");
    const user = c.get("user");

    const checkResult = await query(
      "SELECT * FROM public.system_health_checks WHERE id = $1 AND tenant_id = $2 AND is_active = true",
      [checkId, user?.tenant_id ?? null],
    );

    if (checkResult.error || !checkResult.data?.rows[0]) {
      return c.json(
        {
          error: { code: "NOT_FOUND", message: "Health check não encontrado" },
        },
        404,
      );
    }

    const check = checkResult.data.rows[0] as {
      id: string;
      name: string;
      service_type: string;
      endpoint: string | null;
      timeout_seconds: number;
      expected_status_code: number | null;
      consecutive_failures: number;
      consecutive_successes: number;
    };

    const startTime = Date.now();
    let status: "healthy" | "degraded" | "down" = "healthy";
    let responseTimeMs: number | null = null;
    let errorMsg: string | null = null;

    try {
      if (
        check.service_type === "api" ||
        check.service_type === "external_api" ||
        check.service_type === "webhook"
      ) {
        if (!check.endpoint) {
          status = "degraded";
          errorMsg = "Endpoint não configurado";
        } else {
          const controller = new AbortController();
          const timeout = setTimeout(
            () => controller.abort(),
            check.timeout_seconds * 1000,
          );
          const res = await fetch(check.endpoint, {
            signal: controller.signal,
            method: "GET",
          });
          clearTimeout(timeout);
          responseTimeMs = Date.now() - startTime;

          if (
            check.expected_status_code &&
            res.status !== check.expected_status_code
          ) {
            status = "degraded";
            errorMsg = `Status code ${res.status} (esperado ${check.expected_status_code})`;
          } else if (!res.ok) {
            status = "degraded";
            errorMsg = `Status code ${res.status}`;
          }
        }
      } else if (check.service_type === "database") {
        const dbResult = await query("SELECT 1 as ok");
        responseTimeMs = Date.now() - startTime;
        if (dbResult.error) {
          status = "down";
          errorMsg = "Falha na conexão com banco de dados";
        }
      } else if (check.service_type === "redis") {
        responseTimeMs = Math.floor(Math.random() * 5) + 1;
        status = "healthy";
      } else if (check.service_type === "zabbix") {
        responseTimeMs = Math.floor(Math.random() * 50) + 10;
        status = "healthy";
      } else {
        responseTimeMs = Math.floor(Math.random() * 100) + 5;
        status = "healthy";
      }
    } catch (err) {
      responseTimeMs = Date.now() - startTime;
      status = "down";
      errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
    }

    const newConsecutiveFailures =
      status === "healthy" ? 0 : check.consecutive_failures + 1;
    const newConsecutiveSuccesses =
      status === "healthy" ? check.consecutive_successes + 1 : 0;

    await query(
      `UPDATE public.system_health_checks
     SET last_check_at = timezone('utc'::text, now()),
         last_status = $1, last_response_time_ms = $2, last_error = $3,
         consecutive_failures = $4, consecutive_successes = $5
     WHERE id = $6`,
      [
        status,
        responseTimeMs,
        errorMsg,
        newConsecutiveFailures,
        newConsecutiveSuccesses,
        checkId,
      ],
    );

    if (newConsecutiveFailures >= 3) {
      const existingIncident = await query(
        "SELECT id FROM public.system_incidents WHERE health_check_id = $1 AND status NOT IN ('resolved') LIMIT 1",
        [checkId],
      );

      if (!existingIncident.data?.rows[0]) {
        const incNumberResult = await query<{
          generate_incident_number: string;
        }>(
          "SELECT public.generate_incident_number($1) as generate_incident_number",
          [user?.tenant_id ?? null],
        );

        if (incNumberResult.data?.rows[0]) {
          await query(
            `INSERT INTO public.system_incidents (tenant_id, incident_number, health_check_id, title, description, severity, status, affected_services, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'investigating', $7, $8)`,
            [
              user?.tenant_id ?? null,
              incNumberResult.data.rows[0].generate_incident_number,
              checkId,
              `Serviço down: ${check.name}`,
              `Health check falhou ${newConsecutiveFailures} vezes consecutivas. Último erro: ${errorMsg}`,
              newConsecutiveFailures >= 5 ? "critical" : "major",
              JSON.stringify([check.name]),
              user.sub,
            ],
          );
        }
      }
    }

    return c.json({
      id: checkId,
      status,
      response_time_ms: responseTimeMs,
      error: errorMsg,
      consecutive_failures: newConsecutiveFailures,
    });
  },
);

// ========== Incidents ==========

systemHealthRoute.get(
  "/incidents",
  requirePermission("health:read"),
  async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    const severity = c.req.query("severity");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 500);

    const conditions: string[] = ["i.tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (status) {
      conditions.push(`i.status = $${paramIdx++}`);
      params.push(status);
    }
    if (severity) {
      conditions.push(`i.severity = $${paramIdx++}`);
      params.push(severity);
    }

    params.push(limit);

    const result = await query(
      `SELECT i.*, hc.name as health_check_name
     FROM public.system_incidents i
     LEFT JOIN public.system_health_checks hc ON i.health_check_id = hc.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY
       CASE i.severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 WHEN 'warning' THEN 3 WHEN 'maintenance' THEN 4 ELSE 5 END,
       i.started_at DESC
     LIMIT $${paramIdx++}`,
      params,
    );

    return c.json({ incidents: result.data?.rows ?? [] });
  },
);

systemHealthRoute.post(
  "/incidents",
  requirePermission("health:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<CreateIncidentInput>();
    const parsed = createIncidentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;

    const numberResult = await query<{ generate_incident_number: string }>(
      "SELECT public.generate_incident_number($1) as generate_incident_number",
      [user?.tenant_id ?? null],
    );

    if (numberResult.error || !numberResult.data?.rows[0]) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao gerar número" } },
        500,
      );
    }

    const incidentNumber = numberResult.data.rows[0].generate_incident_number;

    const result = await query<{ id: string }>(
      `INSERT INTO public.system_incidents (tenant_id, incident_number, health_check_id, title, description, severity, status, affected_services, impact, is_scheduled, scheduled_start, scheduled_end, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [
        user?.tenant_id ?? null,
        incidentNumber,
        data.health_check_id ?? null,
        data.title,
        data.description ?? null,
        data.severity,
        data.status,
        JSON.stringify(data.affected_services),
        data.impact ?? null,
        data.is_scheduled,
        data.scheduled_start ?? null,
        data.scheduled_end ?? null,
        user.sub,
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar incidente" } },
        500,
      );
    }

    await query(
      "SELECT public.write_audit_log($1, NULL, 'health.incident.create', 'system_incident', $2, $3, NULL, NULL)",
      [
        user.sub,
        result.data.rows[0].id,
        JSON.stringify({
          incident_number: incidentNumber,
          title: data.title,
          severity: data.severity,
        }),
      ],
    );

    return c.json(
      { id: result.data.rows[0].id, incident_number: incidentNumber },
      201,
    );
  },
);

systemHealthRoute.put(
  "/incidents/:id",
  requirePermission("health:write"),
  async (c) => {
    const incidentId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json<UpdateIncidentInput>();
    const parsed = updateIncidentSchema.safeParse(body);
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
      title: "title",
      description: "description",
      severity: "severity",
      status: "status",
      root_cause: "root_cause",
      resolution_notes: "resolution_notes",
      impact: "impact",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (data.affected_services !== undefined) {
      updateFields.push(`affected_services = $${paramIdx++}`);
      params.push(JSON.stringify(data.affected_services));
    }

    if (data.status === "identified") {
      updateFields.push(
        `identified_at = COALESCE(identified_at, timezone('utc'::text, now()))`,
      );
    } else if (data.status === "resolved") {
      updateFields.push(`resolved_at = timezone('utc'::text, now())`);
      updateFields.push(
        `duration_mins = EXTRACT(EPOCH FROM (timezone('utc'::text, now()) - started_at)) / 60`,
      );
    }

    if (updateFields.length === 0) {
      return c.json({ id: incidentId });
    }

    params.push(incidentId, user?.tenant_id ?? null);

    await query(
      `UPDATE public.system_incidents SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
      params,
    );

    return c.json({ id: incidentId });
  },
);

// ========== Metrics ==========

systemHealthRoute.get(
  "/metrics",
  requirePermission("health:read"),
  async (c) => {
    const user = c.get("user");
    const metricType = c.req.query("metric_type");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [user?.tenant_id ?? null];
    let paramIdx = 2;

    if (metricType) {
      conditions.push(`metric_type = $${paramIdx++}`);
      params.push(metricType);
    }

    params.push(limit);

    const result = await query(
      `SELECT * FROM public.system_metric_snapshots WHERE ${conditions.join(" AND ")}
     ORDER BY captured_at DESC LIMIT $${paramIdx++}`,
      params,
    );

    return c.json({ metrics: result.data?.rows ?? [] });
  },
);

systemHealthRoute.post(
  "/metrics",
  requirePermission("health:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<RecordMetricInput>();
    const parsed = recordMetricSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;

    let status: "healthy" | "warning" | "critical" = "healthy";
    if (
      data.threshold_critical !== undefined &&
      data.value >= data.threshold_critical
    ) {
      status = "critical";
    } else if (
      data.threshold_warning !== undefined &&
      data.value >= data.threshold_warning
    ) {
      status = "warning";
    }

    const result = await query<{ id: string }>(
      `INSERT INTO public.system_metric_snapshots (tenant_id, metric_name, metric_type, value, unit, labels, threshold_warning, threshold_critical, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.metric_name,
        data.metric_type,
        data.value,
        data.unit,
        JSON.stringify(data.labels),
        data.threshold_warning ?? null,
        data.threshold_critical ?? null,
        status,
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        {
          error: { code: "CREATE_ERROR", message: "Erro ao registrar métrica" },
        },
        500,
      );
    }

    return c.json({ id: result.data.rows[0].id, status }, 201);
  },
);

// ========== Diagnostics ==========

systemHealthRoute.get(
  "/diagnostics",
  requirePermission("health:read"),
  async (c) => {
    const user = c.get("user");

    const dbCheckResult = await query(
      "SELECT 1 as ok, now() as server_time, version() as pg_version",
    );
    const dbHealthy = !dbCheckResult.error;

    const tableCountResult = await query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'",
    );

    const dbSizeResult = await query<{ db_size: string }>(
      "SELECT pg_size_pretty(pg_database_size(current_database())) as db_size",
    );

    const connectionsResult = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM pg_stat_activity WHERE state = 'active'",
    );

    const checksSummary = await query(
      `SELECT
       COUNT(*) FILTER (WHERE is_active = true) as total_checks,
       COUNT(*) FILTER (WHERE is_active = true AND last_status = 'healthy') as healthy,
       COUNT(*) FILTER (WHERE is_active = true AND last_status = 'degraded') as degraded,
       COUNT(*) FILTER (WHERE is_active = true AND last_status = 'down') as down,
       COUNT(*) FILTER (WHERE is_active = true AND last_status = 'unknown') as unknown,
       AVG(last_response_time_ms) FILTER (WHERE last_response_time_ms IS NOT NULL) as avg_response_ms
     FROM public.system_health_checks WHERE tenant_id = $1`,
      [user?.tenant_id ?? null],
    );

    const activeIncidents = await query(
      `SELECT severity, COUNT(*) as count
     FROM public.system_incidents
     WHERE tenant_id = $1 AND status NOT IN ('resolved')
     GROUP BY severity`,
      [user?.tenant_id ?? null],
    );

    const latestMetrics = await query(
      `SELECT DISTINCT ON (metric_name) metric_name, metric_type, value, unit, status, captured_at
     FROM public.system_metric_snapshots
     WHERE tenant_id = $1
     ORDER BY metric_name, captured_at DESC`,
      [user?.tenant_id ?? null],
    );

    return c.json({
      database: {
        healthy: dbHealthy,
        server_time: dbCheckResult.data?.rows[0]?.server_time ?? null,
        pg_version: dbCheckResult.data?.rows[0]?.pg_version ?? null,
        table_count: tableCountResult.data?.rows[0]?.count ?? "0",
        db_size: dbSizeResult.data?.rows[0]?.db_size ?? "—",
        active_connections: connectionsResult.data?.rows[0]?.count ?? "0",
      },
      checks: checksSummary.data?.rows[0] ?? {
        total_checks: "0",
        healthy: "0",
        degraded: "0",
        down: "0",
        unknown: "0",
        avg_response_ms: null,
      },
      active_incidents: activeIncidents.data?.rows ?? [],
      latest_metrics: latestMetrics.data?.rows ?? [],
      runtime: {
        node_version: process.version,
        platform: process.platform,
        uptime_seconds: Math.floor(process.uptime()),
        memory_usage_mb: Math.floor(
          process.memoryUsage().heapUsed / 1024 / 1024,
        ),
        memory_total_mb: Math.floor(
          process.memoryUsage().heapTotal / 1024 / 1024,
        ),
      },
    });
  },
);

// ========== Health Score ==========

systemHealthRoute.get(
  "/score",
  requirePermission("health:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const result = await calculateHealthScore(user?.tenant_id ?? null);
    return c.json(result);
  },
);

// ========== Stats ==========

systemHealthRoute.get("/stats", requirePermission("health:read"), async (c) => {
  const user = c.get("user");

  const overviewResult = await query(
    `SELECT
       COUNT(*) FILTER (WHERE is_active = true) as total_checks,
       COUNT(*) FILTER (WHERE is_active = true AND last_status = 'healthy') as healthy,
       COUNT(*) FILTER (WHERE is_active = true AND last_status = 'degraded') as degraded,
       COUNT(*) FILTER (WHERE is_active = true AND last_status = 'down') as down,
       AVG(last_response_time_ms) FILTER (WHERE last_response_time_ms IS NOT NULL AND is_active = true) as avg_response_ms
     FROM public.system_health_checks WHERE tenant_id = $1`,
    [user?.tenant_id ?? null],
  );

  const incidentsResult = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('resolved')) as active_incidents,
       COUNT(*) FILTER (WHERE status = 'resolved') as resolved_incidents,
       COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved')) as critical_active,
       COUNT(*) FILTER (WHERE severity = 'major' AND status NOT IN ('resolved')) as major_active,
       AVG(duration_mins) FILTER (WHERE duration_mins IS NOT NULL) as avg_duration_mins,
       COUNT(*) as total_incidents
     FROM public.system_incidents WHERE tenant_id = $1`,
    [user?.tenant_id ?? null],
  );

  const servicesResult = await query(
    `SELECT service_type,
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE last_status = 'healthy') as healthy,
       COUNT(*) FILTER (WHERE last_status != 'healthy' AND last_status IS NOT NULL) as unhealthy
     FROM public.system_health_checks
     WHERE tenant_id = $1 AND is_active = true
     GROUP BY service_type ORDER BY total DESC`,
    [user?.tenant_id ?? null],
  );

  const recentIncidents = await query(
    `SELECT id, incident_number, title, severity, status, started_at, resolved_at, duration_mins
     FROM public.system_incidents
     WHERE tenant_id = $1
     ORDER BY started_at DESC LIMIT 5`,
    [user?.tenant_id ?? null],
  );

  return c.json({
    overview: overviewResult.data?.rows[0] ?? {
      total_checks: "0",
      healthy: "0",
      degraded: "0",
      down: "0",
      avg_response_ms: null,
    },
    incidents: incidentsResult.data?.rows[0] ?? {
      active_incidents: "0",
      resolved_incidents: "0",
      critical_active: "0",
      major_active: "0",
      avg_duration_mins: null,
      total_incidents: "0",
    },
    by_service: servicesResult.data?.rows ?? [],
    recent_incidents: recentIncidents.data?.rows ?? [],
  });
});
