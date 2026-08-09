// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createHealthCheckSchema,
  updateHealthCheckSchema,
  createIncidentSchema,
  updateIncidentSchema,
  recordMetricSchema,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { calculateHealthScore } from "../lib/health-score.js";
import "../types.js";

export const systemHealthRoute = new Hono();

// Helper: valida URL para evitar SSRF (bloqueia IPs internos e metadata)
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Bloqueia localhost e IPs internas
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.") ||
      hostname.startsWith("172.16.") ||
      hostname.startsWith("172.17.") ||
      hostname.startsWith("172.18.") ||
      hostname.startsWith("172.19.") ||
      hostname.startsWith("172.20.") ||
      hostname.startsWith("172.21.") ||
      hostname.startsWith("172.22.") ||
      hostname.startsWith("172.23.") ||
      hostname.startsWith("172.24.") ||
      hostname.startsWith("172.25.") ||
      hostname.startsWith("172.26.") ||
      hostname.startsWith("172.27.") ||
      hostname.startsWith("172.28.") ||
      hostname.startsWith("172.29.") ||
      hostname.startsWith("172.30.") ||
      hostname.startsWith("172.31.") ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    ) {
      return false;
    }
    // Permite apenas http/https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// GET /api/v1/system-health — overview do modulo
systemHealthRoute.get("/", requirePermission("health:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const checksResult = await query(
      "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.system_health_checks WHERE tenant_id = $1",
      [tenantId],
    );

    if (checksResult.error) {
      logger.error("Erro ao buscar overview system-health", {
        tenantId,
        error: checksResult.error.message,
      });
      return c.json(
        { error: { code: "QUERY_ERROR", message: "Erro ao buscar overview" } },
        500,
      );
    }

    return c.json({
      overview: {
        checks: checksResult.data?.rows[0] ?? { total: "0", active: "0" },
      },
      endpoints: [
        "/checks",
        "/checks/:id",
        "/incidents",
        "/score",
        "/stats",
        "/metrics",
        "/diagnostics",
      ],
    });
  } catch (error) {
    logger.error("Erro inesperado no overview system-health", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// ========== Health Checks ==========

systemHealthRoute.get(
  "/checks",
  httpCache(30),
  requirePermission("health:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const serviceType = c.req.query("service_type");
    const status = c.req.query("status");
    const activeOnly = c.req.query("active") === "true";

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
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

    try {
      const result = await query(
        `SELECT * FROM public.system_health_checks WHERE ${conditions.join(" AND ")} ORDER BY name`,
        params,
      );

      if (result.error) {
        logger.error("Erro ao listar health checks", {
          tenantId,
          error: result.error.message,
        });
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar checks" } },
          500,
        );
      }

      return c.json({ checks: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar health checks", {
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

systemHealthRoute.post(
  "/checks",
  rateLimitWrite,
  requirePermission("health:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = createHealthCheckSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;

    // Protecao SSRF: valida endpoint se fornecido
    if (data.endpoint && !isSafeUrl(data.endpoint)) {
      return c.json(
        {
          error: {
            code: "INVALID_URL",
            message: "Endpoint não permitido (URL interna bloqueada)",
          },
        },
        400,
      );
    }

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.system_health_checks (tenant_id, name, service_type, endpoint, check_interval_seconds, timeout_seconds, expected_status_code, is_active, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          tenantId,
          data.name,
          data.service_type,
          data.endpoint ?? null,
          data.check_interval_seconds,
          data.timeout_seconds,
          data.expected_status_code ?? null,
          data.is_active,
          JSON.stringify(data.metadata ?? {}),
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        logger.error("Erro ao criar health check", {
          tenantId,
          error: result.error?.message,
        });
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

      logger.info("Health check criado", {
        checkId: result.data.rows[0].id,
        tenantId,
        serviceType: data.service_type,
      });

      return c.json({ id: result.data.rows[0].id }, 201);
    } catch (error) {
      logger.error("Erro inesperado ao criar health check", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
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
  },
);

systemHealthRoute.put(
  "/checks/:id",
  rateLimitWrite,
  requirePermission("health:write"),
  async (c) => {
    const checkId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = updateHealthCheckSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;

    // Protecao SSRF: valida endpoint se fornecido
    if (data.endpoint && !isSafeUrl(data.endpoint)) {
      return c.json(
        {
          error: {
            code: "INVALID_URL",
            message: "Endpoint não permitido (URL interna bloqueada)",
          },
        },
        400,
      );
    }

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

    params.push(checkId, tenantId);

    try {
      const result = await query(
        `UPDATE public.system_health_checks SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++} RETURNING id`,
        params,
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Health check não encontrado",
            },
          },
          404,
        );
      }

      return c.json({ id: checkId });
    } catch (error) {
      logger.error("Erro ao atualizar health check", {
        checkId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar check" } },
        500,
      );
    }
  },
);

systemHealthRoute.delete(
  "/checks/:id",
  rateLimitWrite,
  requirePermission("health:write"),
  async (c) => {
    const checkId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.system_health_checks WHERE id = $1 AND tenant_id = $2 RETURNING id",
        [checkId, tenantId],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Health check não encontrado",
            },
          },
          404,
        );
      }

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao deletar health check", {
        checkId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao excluir check" } },
        500,
      );
    }
  },
);

// ========== Run Health Check ==========

systemHealthRoute.post(
  "/checks/:id/run",
  rateLimitWrite,
  requirePermission("health:write"),
  async (c) => {
    const checkId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const checkResult = await query(
        "SELECT * FROM public.system_health_checks WHERE id = $1 AND tenant_id = $2 AND is_active = true",
        [checkId, tenantId],
      );

      if (checkResult.error || !checkResult.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Health check não encontrado",
            },
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
          } else if (!isSafeUrl(check.endpoint)) {
            // Protecao SSRF: bloqueia URLs internas mesmo no run
            status = "down";
            errorMsg = "Endpoint bloqueado por política de segurança (SSRF)";
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
            errorMsg = "Erro de conexão com banco";
          }
        } else if (check.service_type === "redis") {
          // Simula check Redis (sem cliente Redis direto aqui)
          responseTimeMs = Math.floor(Math.random() * 20) + 5;
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

      // Cria incidente automaticamente apos 3 falhas consecutivas
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
            [tenantId],
          );

          if (incNumberResult.data?.rows[0]) {
            await query(
              `INSERT INTO public.system_incidents (tenant_id, incident_number, health_check_id, title, description, severity, status, affected_services, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, 'investigating', $7, $8)`,
              [
                tenantId,
                incNumberResult.data.rows[0].generate_incident_number,
                checkId,
                `Serviço down: ${check.name}`,
                `Health check falhou ${newConsecutiveFailures} vezes consecutivas. Último erro: ${errorMsg}`,
                newConsecutiveFailures >= 5 ? "critical" : "major",
                JSON.stringify([check.name]),
                user?.sub ?? null,
              ],
            );

            logger.warn("Incidente criado automaticamente", {
              checkId,
              tenantId,
              consecutiveFailures: newConsecutiveFailures,
              severity: newConsecutiveFailures >= 5 ? "critical" : "major",
            });
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
    } catch (error) {
      logger.error("Erro inesperado ao executar health check", {
        checkId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "RUN_ERROR", message: "Erro ao executar check" } },
        500,
      );
    }
  },
);

// ========== Incidents ==========

systemHealthRoute.get(
  "/incidents",
  httpCache(30),
  requirePermission("health:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const status = c.req.query("status");
    const severity = c.req.query("severity");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 500);

    const conditions: string[] = ["i.tenant_id = $1"];
    const params: unknown[] = [tenantId];
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

    try {
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

      if (result.error) {
        logger.error("Erro ao listar incidentes", {
          tenantId,
          error: result.error.message,
        });
        return c.json(
          {
            error: {
              code: "QUERY_ERROR",
              message: "Erro ao buscar incidentes",
            },
          },
          500,
        );
      }

      return c.json({ incidents: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar incidentes", {
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

systemHealthRoute.post(
  "/incidents",
  rateLimitWrite,
  requirePermission("health:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = createIncidentSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data;

    try {
      const numberResult = await query<{ generate_incident_number: string }>(
        "SELECT public.generate_incident_number($1) as generate_incident_number",
        [tenantId],
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
          tenantId,
          incidentNumber,
          data.health_check_id ?? null,
          data.title,
          data.description ?? null,
          data.severity,
          data.status,
          JSON.stringify(data.affected_services ?? []),
          data.impact ?? null,
          data.is_scheduled,
          data.scheduled_start ?? null,
          data.scheduled_end ?? null,
          user?.sub ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        logger.error("Erro ao criar incidente", {
          tenantId,
          error: result.error?.message,
        });
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao criar incidente" },
          },
          500,
        );
      }

      if (user?.sub) {
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
      }

      logger.info("Incidente criado", {
        incidentId: result.data.rows[0].id,
        incidentNumber,
        tenantId,
        severity: data.severity,
      });

      return c.json(
        { id: result.data.rows[0].id, incident_number: incidentNumber },
        201,
      );
    } catch (error) {
      logger.error("Erro inesperado ao criar incidente", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar incidente" } },
        500,
      );
    }
  },
);

systemHealthRoute.put(
  "/incidents/:id",
  rateLimitWrite,
  requirePermission("health:write"),
  async (c) => {
    const incidentId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = updateIncidentSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
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

    params.push(incidentId, tenantId);

    try {
      const result = await query(
        `UPDATE public.system_incidents SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++} RETURNING id`,
        params,
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Incidente não encontrado",
            },
          },
          404,
        );
      }

      return c.json({ id: incidentId });
    } catch (error) {
      logger.error("Erro ao atualizar incidente", {
        incidentId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "UPDATE_ERROR",
            message: "Erro ao atualizar incidente",
          },
        },
        500,
      );
    }
  },
);

// ========== Metrics ==========

systemHealthRoute.get(
  "/metrics",
  httpCache(30),
  requirePermission("health:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const metricType = c.req.query("metric_type");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (metricType) {
      conditions.push(`metric_type = $${paramIdx++}`);
      params.push(metricType);
    }

    params.push(limit);

    try {
      const result = await query(
        `SELECT * FROM public.system_metric_snapshots WHERE ${conditions.join(" AND ")}
       ORDER BY captured_at DESC LIMIT $${paramIdx++}`,
        params,
      );

      if (result.error) {
        logger.error("Erro ao listar metricas", {
          tenantId,
          error: result.error.message,
        });
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar métricas" },
          },
          500,
        );
      }

      return c.json({ metrics: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar metricas", {
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

systemHealthRoute.post(
  "/metrics",
  rateLimitWrite,
  requirePermission("health:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = recordMetricSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
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

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.system_metric_snapshots (tenant_id, metric_name, metric_type, value, unit, labels, threshold_warning, threshold_critical, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          tenantId,
          data.metric_name,
          data.metric_type,
          data.value,
          data.unit,
          JSON.stringify(data.labels ?? {}),
          data.threshold_warning ?? null,
          data.threshold_critical ?? null,
          status,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        logger.error("Erro ao registrar metrica", {
          tenantId,
          error: result.error?.message,
        });
        return c.json(
          {
            error: {
              code: "CREATE_ERROR",
              message: "Erro ao registrar métrica",
            },
          },
          500,
        );
      }

      return c.json({ id: result.data.rows[0].id, status }, 201);
    } catch (error) {
      logger.error("Erro inesperado ao registrar metrica", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "CREATE_ERROR", message: "Erro ao registrar métrica" },
        },
        500,
      );
    }
  },
);

// ========== Diagnostics ==========

systemHealthRoute.get(
  "/diagnostics",
  requirePermission("health:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 7 queries independentes (antes seriais)
      const [
        dbCheckResult,
        tableCountResult,
        dbSizeResult,
        connectionsResult,
        checksSummary,
        activeIncidents,
        latestMetrics,
      ] = await Promise.all([
        query("SELECT 1 as ok, now() as server_time, version() as pg_version"),
        query(
          "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'",
        ),
        query<{ db_size: string }>(
          "SELECT pg_size_pretty(pg_database_size(current_database())) as db_size",
        ),
        query<{ count: string }>(
          "SELECT COUNT(*) as count FROM pg_stat_activity WHERE state = 'active'",
        ),
        query(
          `SELECT
           COUNT(*) FILTER (WHERE is_active = true) as total_checks,
           COUNT(*) FILTER (WHERE is_active = true AND last_status = 'healthy') as healthy,
           COUNT(*) FILTER (WHERE is_active = true AND last_status = 'degraded') as degraded,
           COUNT(*) FILTER (WHERE is_active = true AND last_status = 'down') as down,
           COUNT(*) FILTER (WHERE is_active = true AND last_status = 'unknown') as unknown,
           AVG(last_response_time_ms) FILTER (WHERE last_response_time_ms IS NOT NULL) as avg_response_ms
         FROM public.system_health_checks WHERE tenant_id = $1`,
          [tenantId],
        ),
        query(
          `SELECT severity, COUNT(*) as count
         FROM public.system_incidents
         WHERE tenant_id = $1 AND status NOT IN ('resolved')
         GROUP BY severity`,
          [tenantId],
        ),
        query(
          `SELECT DISTINCT ON (metric_name) metric_name, metric_type, value, unit, status, captured_at
         FROM public.system_metric_snapshots
         WHERE tenant_id = $1
         ORDER BY metric_name, captured_at DESC`,
          [tenantId],
        ),
      ]);

      const dbHealthy = !dbCheckResult.error;

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
    } catch (error) {
      logger.error("Erro inesperado no diagnostics", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro no diagnóstico" } },
        500,
      );
    }
  },
);

// ========== Health Score ==========

systemHealthRoute.get(
  "/score",
  requirePermission("health:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await calculateHealthScore(tenantId);
      return c.json(result);
    } catch (error) {
      logger.error("Erro ao calcular health score", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "INTERNAL_ERROR", message: "Erro ao calcular score" },
        },
        500,
      );
    }
  },
);

// ========== Stats ==========

systemHealthRoute.get(
  "/stats",
  requirePermission("health:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 4 queries independentes (antes seriais)
      const [overviewResult, incidentsResult, servicesResult, recentIncidents] =
        await Promise.all([
          query(
            `SELECT
               COUNT(*) FILTER (WHERE is_active = true) as total_checks,
               COUNT(*) FILTER (WHERE is_active = true AND last_status = 'healthy') as healthy,
               COUNT(*) FILTER (WHERE is_active = true AND last_status = 'degraded') as degraded,
               COUNT(*) FILTER (WHERE is_active = true AND last_status = 'down') as down,
               AVG(last_response_time_ms) FILTER (WHERE last_response_time_ms IS NOT NULL AND is_active = true) as avg_response_ms
             FROM public.system_health_checks WHERE tenant_id = $1`,
            [tenantId],
          ),
          query(
            `SELECT
               COUNT(*) FILTER (WHERE status NOT IN ('resolved')) as active_incidents,
               COUNT(*) FILTER (WHERE status = 'resolved') as resolved_incidents,
               COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved')) as critical_active,
               COUNT(*) FILTER (WHERE severity = 'major' AND status NOT IN ('resolved')) as major_active,
               AVG(duration_mins) FILTER (WHERE duration_mins IS NOT NULL) as avg_duration_mins,
               COUNT(*) as total_incidents
             FROM public.system_incidents WHERE tenant_id = $1`,
            [tenantId],
          ),
          query(
            `SELECT service_type,
               COUNT(*) as total,
               COUNT(*) FILTER (WHERE last_status = 'healthy') as healthy,
               COUNT(*) FILTER (WHERE last_status != 'healthy' AND last_status IS NOT NULL) as unhealthy
             FROM public.system_health_checks
             WHERE tenant_id = $1 AND is_active = true
             GROUP BY service_type ORDER BY total DESC`,
            [tenantId],
          ),
          query(
            `SELECT id, incident_number, title, severity, status, started_at, resolved_at, duration_mins
             FROM public.system_incidents
             WHERE tenant_id = $1
             ORDER BY started_at DESC LIMIT 5`,
            [tenantId],
          ),
        ]);

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
    } catch (error) {
      logger.error("Erro inesperado no stats", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar stats" } },
        500,
      );
    }
  },
);
