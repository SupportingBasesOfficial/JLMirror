// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { cacheGetJSON, cacheSetJSON } from "@repo/cache";
import { requirePermission } from "../middleware/require-permission.js";
import {
  createServiceSchema,
  updateServiceSchema,
  createMaintenanceWindowSchema,
  updateMaintenanceWindowSchema,
  createServiceIncidentSchema,
  updateServiceIncidentSchema,
  slaReportQuerySchema,
  type CreateServiceInput,
  type UpdateServiceInput,
  type CreateMaintenanceWindowInput,
  type UpdateMaintenanceWindowInput,
  type CreateServiceIncidentInput,
  type UpdateServiceIncidentInput,
} from "@repo/shared-validation";
import "../types.js";

export const slaRoute = new Hono();

// ========== Services ==========

// GET /api/v1/sla/services — lista todos os serviços
slaRoute.get("/services", requirePermission("sla:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const result = await query<{
    id: string;
    name: string;
    description: string | null;
    service_type: string;
    status: string;
    device_ids: unknown;
    sla_target_percentage: string;
    coverage_hours: string;
    coverage_timezone: string;
    priority: string;
    zabbix_service_id: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, name, description, service_type, status, device_ids, sla_target_percentage::text,
     coverage_hours, coverage_timezone, priority, zabbix_service_id, is_active, created_at, updated_at
     FROM public.services WHERE tenant_id = $1 ORDER BY priority DESC, name ASC`,
    [tenantId],
  );

  if (result.error) {
    return c.json(
      { error: { code: "DB_ERROR", message: result.error.message } },
      500,
    );
  }

  return c.json({ data: result.data?.rows ?? [] });
});

// GET /api/v1/sla/services/:id — detalhe de um serviço
slaRoute.get("/services/:id", requirePermission("sla:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const serviceId = c.req.param("id");

  const result = await query(
    `SELECT * FROM public.services WHERE id = $1 AND tenant_id = $2`,
    [serviceId, tenantId],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Serviço não encontrado" } },
      404,
    );
  }

  return c.json({ data: result.data.rows[0] });
});

// POST /api/v1/sla/services — cria um serviço
slaRoute.post("/services", requirePermission("sla:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const body = await c.req.json<CreateServiceInput>();
  const parsed = createServiceSchema.safeParse(body);
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

  const d = parsed.data;
  const result = await query(
    `INSERT INTO public.services (tenant_id, name, description, service_type, status, device_ids,
     sla_target_percentage, coverage_hours, coverage_timezone, coverage_days, priority,
     zabbix_service_id, metadata, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [
      tenantId,
      d.name,
      d.description ?? null,
      d.service_type,
      d.status,
      JSON.stringify(d.device_ids),
      d.sla_target_percentage,
      d.coverage_hours,
      d.coverage_timezone,
      d.coverage_days,
      d.priority,
      d.zabbix_service_id ?? null,
      JSON.stringify(d.metadata),
      d.is_active,
    ],
  );

  if (result.error) {
    return c.json(
      { error: { code: "DB_ERROR", message: result.error.message } },
      500,
    );
  }

  return c.json({ data: { id: result.data?.rows[0]?.id } }, 201);
});

// PUT /api/v1/sla/services/:id — atualiza um serviço
slaRoute.put("/services/:id", requirePermission("sla:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const serviceId = c.req.param("id");

  const body = await c.req.json<UpdateServiceInput>();
  const parsed = updateServiceSchema.safeParse(body);
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

  const d = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const addField = (col: string, val: unknown) => {
    if (val !== undefined) {
      fields.push(`${col} = $${idx}`);
      values.push(val);
      idx++;
    }
  };

  addField("name", d.name);
  addField("description", d.description ?? null);
  addField("service_type", d.service_type);
  addField("status", d.status);
  addField(
    "device_ids",
    d.device_ids ? JSON.stringify(d.device_ids) : undefined,
  );
  addField("sla_target_percentage", d.sla_target_percentage);
  addField("coverage_hours", d.coverage_hours);
  addField("coverage_timezone", d.coverage_timezone);
  addField("coverage_days", d.coverage_days);
  addField("priority", d.priority);
  addField("zabbix_service_id", d.zabbix_service_id ?? null);
  addField("metadata", d.metadata ? JSON.stringify(d.metadata) : undefined);
  addField("is_active", d.is_active);

  if (fields.length === 0) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Nenhum campo para atualizar",
        },
      },
      400,
    );
  }

  values.push(serviceId, tenantId);
  const result = await query(
    `UPDATE public.services SET ${fields.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING id`,
    values,
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Serviço não encontrado" } },
      404,
    );
  }

  return c.json({ data: { id: result.data.rows[0].id } });
});

// DELETE /api/v1/sla/services/:id — remove um serviço
slaRoute.delete("/services/:id", requirePermission("sla:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const serviceId = c.req.param("id");

  const result = await query(
    "DELETE FROM public.services WHERE id = $1 AND tenant_id = $2 RETURNING id",
    [serviceId, tenantId],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Serviço não encontrado" } },
      404,
    );
  }

  return c.json({ data: { id: result.data.rows[0].id } });
});

// ========== SLA Records & Reports ==========

// GET /api/v1/sla/report — relatório de SLA por serviço
slaRoute.get("/report", requirePermission("sla:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const queryParams = c.req.query();
  const parsed = slaReportQuerySchema.safeParse({
    service_id: queryParams.service_id,
    from: queryParams.from,
    to: queryParams.to,
  });

  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Parâmetros inválidos",
          details: parsed.error.flatten(),
        },
      },
      400,
    );
  }

  let sql = `SELECT sr.*, s.name as service_name, s.sla_target_percentage::text
    FROM public.sla_records sr
    JOIN public.services s ON sr.service_id = s.id
    WHERE sr.tenant_id = $1`;
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (parsed.data.service_id) {
    sql += ` AND sr.service_id = $${paramIdx}`;
    params.push(parsed.data.service_id);
    paramIdx++;
  }
  if (parsed.data.from) {
    sql += ` AND sr.period_start >= $${paramIdx}`;
    params.push(parsed.data.from);
    paramIdx++;
  }
  if (parsed.data.to) {
    sql += ` AND sr.period_end <= $${paramIdx}`;
    params.push(parsed.data.to);
    paramIdx++;
  }

  sql += ` ORDER BY sr.period_start DESC LIMIT 200`;

  const result = await query(sql, params);
  if (result.error) {
    return c.json(
      { error: { code: "DB_ERROR", message: result.error.message } },
      500,
    );
  }

  return c.json({ data: result.data?.rows ?? [] });
});

// ========== Service Incidents ==========

// GET /api/v1/sla/incidents — lista incidentes de serviço
slaRoute.get("/incidents", requirePermission("sla:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const status = c.req.query("status");
  let sql = `SELECT si.*, s.name as service_name
    FROM public.service_incidents si
    JOIN public.services s ON si.service_id = s.id
    WHERE si.tenant_id = $1`;
  const params: unknown[] = [tenantId];
  if (status) {
    sql += ` AND si.status = $2`;
    params.push(status);
  }
  sql += ` ORDER BY si.started_at DESC LIMIT 200`;

  const result = await query(sql, params);
  if (result.error) {
    return c.json(
      { error: { code: "DB_ERROR", message: result.error.message } },
      500,
    );
  }

  return c.json({ data: result.data?.rows ?? [] });
});

// POST /api/v1/sla/incidents — cria um incidente
slaRoute.post("/incidents", requirePermission("sla:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const body = await c.req.json<CreateServiceIncidentInput>();
  const parsed = createServiceIncidentSchema.safeParse(body);
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

  const d = parsed.data;
  const result = await query(
    `INSERT INTO public.service_incidents (tenant_id, service_id, title, description, severity, status,
     started_at, resolved_at, root_cause, resolution_notes, affected_device_ids, ticket_id, zabbix_event_id)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now()), $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      tenantId,
      d.service_id,
      d.title,
      d.description ?? null,
      d.severity,
      d.status,
      d.started_at ?? null,
      d.resolved_at ?? null,
      d.root_cause ?? null,
      d.resolution_notes ?? null,
      JSON.stringify(d.affected_device_ids),
      d.ticket_id ?? null,
      d.zabbix_event_id ?? null,
    ],
  );

  if (result.error) {
    return c.json(
      { error: { code: "DB_ERROR", message: result.error.message } },
      500,
    );
  }

  return c.json({ data: { id: result.data?.rows[0]?.id } }, 201);
});

// PUT /api/v1/sla/incidents/:id — atualiza um incidente
slaRoute.put("/incidents/:id", requirePermission("sla:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const incidentId = c.req.param("id");

  const body = await c.req.json<UpdateServiceIncidentInput>();
  const parsed = updateServiceIncidentSchema.safeParse(body);
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

  const d = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const addField = (col: string, val: unknown) => {
    if (val !== undefined) {
      fields.push(`${col} = $${idx}`);
      values.push(val);
      idx++;
    }
  };

  addField("title", d.title);
  addField("description", d.description ?? null);
  addField("severity", d.severity);
  addField("status", d.status);
  addField("resolved_at", d.resolved_at ?? null);
  addField("root_cause", d.root_cause ?? null);
  addField("resolution_notes", d.resolution_notes ?? null);
  addField(
    "affected_device_ids",
    d.affected_device_ids ? JSON.stringify(d.affected_device_ids) : undefined,
  );
  addField("ticket_id", d.ticket_id ?? null);

  if (fields.length === 0) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Nenhum campo para atualizar",
        },
      },
      400,
    );
  }

  // Se status foi alterado para resolved, calcula downtime_seconds
  if (d.status === "resolved") {
    fields.push(
      `downtime_seconds = EXTRACT(EPOCH FROM (COALESCE($${idx}, now()) - started_at))::bigint`,
    );
    values.push(d.resolved_at ?? null);
    idx++;
  }

  values.push(incidentId, tenantId);
  const result = await query(
    `UPDATE public.service_incidents SET ${fields.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING id`,
    values,
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Incidente não encontrado" } },
      404,
    );
  }

  return c.json({ data: { id: result.data.rows[0].id } });
});

// ========== Maintenance Windows ==========

// GET /api/v1/sla/maintenance — lista janelas de manutenção
slaRoute.get("/maintenance", requirePermission("sla:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const status = c.req.query("status");
  let sql = `SELECT * FROM public.maintenance_windows WHERE tenant_id = $1`;
  const params: unknown[] = [tenantId];
  if (status) {
    sql += ` AND status = $2`;
    params.push(status);
  }
  sql += ` ORDER BY start_at DESC LIMIT 200`;

  const result = await query(sql, params);
  if (result.error) {
    return c.json(
      { error: { code: "DB_ERROR", message: result.error.message } },
      500,
    );
  }

  return c.json({ data: result.data?.rows ?? [] });
});

// POST /api/v1/sla/maintenance — cria uma janela de manutenção
slaRoute.post("/maintenance", requirePermission("sla:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const body = await c.req.json<CreateMaintenanceWindowInput>();
  const parsed = createMaintenanceWindowSchema.safeParse(body);
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

  const d = parsed.data;
  const result = await query(
    `INSERT INTO public.maintenance_windows (tenant_id, name, description, device_ids, start_at, end_at,
     maintenance_type, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      tenantId,
      d.name,
      d.description ?? null,
      JSON.stringify(d.device_ids),
      d.start_at,
      d.end_at,
      d.maintenance_type,
      JSON.stringify(d.metadata),
    ],
  );

  if (result.error) {
    return c.json(
      { error: { code: "DB_ERROR", message: result.error.message } },
      500,
    );
  }

  return c.json({ data: { id: result.data?.rows[0]?.id } }, 201);
});

// PUT /api/v1/sla/maintenance/:id — atualiza uma janela de manutenção
slaRoute.put("/maintenance/:id", requirePermission("sla:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const maintenanceId = c.req.param("id");

  const body = await c.req.json<UpdateMaintenanceWindowInput>();
  const parsed = updateMaintenanceWindowSchema.safeParse(body);
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

  const d = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const addField = (col: string, val: unknown) => {
    if (val !== undefined) {
      fields.push(`${col} = $${idx}`);
      values.push(val);
      idx++;
    }
  };

  addField("name", d.name);
  addField("description", d.description ?? null);
  addField(
    "device_ids",
    d.device_ids ? JSON.stringify(d.device_ids) : undefined,
  );
  addField("start_at", d.start_at);
  addField("end_at", d.end_at);
  addField("status", d.status);
  addField("maintenance_type", d.maintenance_type);

  if (fields.length === 0) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Nenhum campo para atualizar",
        },
      },
      400,
    );
  }

  values.push(maintenanceId, tenantId);
  const result = await query(
    `UPDATE public.maintenance_windows SET ${fields.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING id`,
    values,
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Janela de manutenção não encontrada",
        },
      },
      404,
    );
  }

  return c.json({ data: { id: result.data.rows[0].id } });
});

// DELETE /api/v1/sla/maintenance/:id — remove uma janela de manutenção
slaRoute.delete(
  "/maintenance/:id",
  requirePermission("sla:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const maintenanceId = c.req.param("id");

    const result = await query(
      "DELETE FROM public.maintenance_windows WHERE id = $1 AND tenant_id = $2 RETURNING id",
      [maintenanceId, tenantId],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Janela de manutenção não encontrada",
          },
        },
        404,
      );
    }

    return c.json({ data: { id: result.data.rows[0].id } });
  },
);

// ========== SLA Dashboard (módulo ativável por tenant via feature flag) ==========

// GET /api/v1/sla/dashboard — dashboard de SLA em tempo real
// Requer feature flag "sla_dashboard_enabled" ativa para o tenant
slaRoute.get("/dashboard", requirePermission("sla:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  // Verifica feature flag
  const flagResult = await query<{
    default_value: boolean;
    is_active: boolean;
  }>(
    `SELECT default_value, is_active FROM public.feature_flags
     WHERE key = 'sla_dashboard_enabled' AND (tenant_id IS NULL OR tenant_id = $1) AND is_active = true
     LIMIT 1`,
    [tenantId],
  );

  const flagEnabled = flagResult.data?.rows[0]?.default_value === true;
  if (!flagEnabled) {
    return c.json(
      {
        error: {
          code: "MODULE_DISABLED",
          message: "Módulo SLA Dashboard não está ativado para este tenant",
        },
      },
      403,
    );
  }

  // Cache de 30s para evitar queries pesadas
  const cacheKey = `sla:dashboard:${tenantId}`;
  const cached = await cacheGetJSON<unknown>(cacheKey);
  if (cached) {
    return c.json({ data: cached, cached: true });
  }

  const now = new Date();
  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString();

  // SLA % do mês por serviço
  const slaResult = await query(
    `SELECT s.id, s.name, s.service_type, s.status, s.sla_target_percentage::text,
       s.priority, s.is_active,
       COALESCE(
         (SELECT sr.uptime_percentage::text
          FROM public.sla_records sr
          WHERE sr.service_id = s.id AND sr.tenant_id = $1
            AND sr.period_start >= $2
          ORDER BY sr.period_start DESC LIMIT 1),
         '100.0000'
       ) as current_uptime,
       COALESCE(
         (SELECT sr.incident_count::text
          FROM public.sla_records sr
          WHERE sr.service_id = s.id AND sr.tenant_id = $1
            AND sr.period_start >= $2
          ORDER BY sr.period_start DESC LIMIT 1),
         '0'
       ) as current_incident_count
     FROM public.services s
     WHERE s.tenant_id = $1 AND s.is_active = true
     ORDER BY s.priority DESC, s.name ASC`,
    [tenantId, monthStart],
  );

  const services = slaResult.data?.rows ?? [];

  // Incidentes do mês
  const incidentsResult = await query(
    `SELECT
       COUNT(*) as total_incidents,
       COUNT(*) FILTER (WHERE status = 'resolved') as resolved_incidents,
       COUNT(*) FILTER (WHERE status NOT IN ('resolved')) as open_incidents,
       COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, timezone('utc'::text, now())) - started_at)) / 60), 0)::text as avg_mttr_minutes,
       COALESCE(AVG(EXTRACT(EPOCH FROM (created_at - started_at)) / 60) FILTER (WHERE created_at IS NOT NULL), 0)::text as avg_response_minutes,
       COALESCE(MAX(EXTRACT(EPOCH FROM (COALESCE(resolved_at, timezone('utc'::text, now())) - started_at)) / 60), 0)::text as max_mttr_minutes
     FROM public.service_incidents
     WHERE tenant_id = $1 AND started_at >= $2`,
    [tenantId, monthStart],
  );

  const incidentStats = incidentsResult.data?.rows[0] ?? {};

  // SLA agregado (média ponderada por prioridade)
  const aggregateResult = await query(
    `SELECT
       COALESCE(AVG(CASE
         WHEN s.priority = 'critical' THEN CAST(COALESCE(
           (SELECT sr.uptime_percentage
            FROM public.sla_records sr
            WHERE sr.service_id = s.id AND sr.tenant_id = $1
              AND sr.period_start >= $2
            ORDER BY sr.period_start DESC LIMIT 1),
           100.0
         ) AS DOUBLE PRECISION) * 3
         WHEN s.priority = 'high' THEN CAST(COALESCE(
           (SELECT sr.uptime_percentage
            FROM public.sla_records sr
            WHERE sr.service_id = s.id AND sr.tenant_id = $1
              AND sr.period_start >= $2
            ORDER BY sr.period_start DESC LIMIT 1),
           100.0
         ) AS DOUBLE PRECISION) * 2
         ELSE CAST(COALESCE(
           (SELECT sr.uptime_percentage
            FROM public.sla_records sr
            WHERE sr.service_id = s.id AND sr.tenant_id = $1
              AND sr.period_start >= $2
            ORDER BY sr.period_start DESC LIMIT 1),
           100.0
         ) AS DOUBLE PRECISION)
       END) / NULLIF(SUM(CASE
         WHEN s.priority = 'critical' THEN 3
         WHEN s.priority = 'high' THEN 2
         ELSE 1
       END), 0), 100.0)::text as weighted_sla_percentage,
       COUNT(*) as total_services,
       COUNT(*) FILTER (WHERE s.status = 'operational') as operational,
       COUNT(*) FILTER (WHERE s.status = 'degraded') as degraded,
       COUNT(*) FILTER (WHERE s.status = 'down') as down,
       COUNT(*) FILTER (WHERE s.status = 'maintenance') as maintenance
     FROM public.services s
     WHERE s.tenant_id = $1 AND s.is_active = true`,
    [tenantId, monthStart],
  );

  const aggregate = aggregateResult.data?.rows[0] ?? {};

  // Tendência dos últimos 7 dias
  const trendResult = await query(
    `SELECT
       DATE(sr.period_start) as date,
       AVG(sr.uptime_percentage)::text as avg_uptime,
       MAX(sr.uptime_percentage)::text as max_uptime,
       MIN(sr.uptime_percentage)::text as min_uptime
     FROM public.sla_records sr
     WHERE sr.tenant_id = $1
       AND sr.period_start >= timezone('utc'::text, now()) - INTERVAL '7 days'
     GROUP BY DATE(sr.period_start)
     ORDER BY date ASC`,
    [tenantId],
  );

  const trend = trendResult.data?.rows ?? [];

  const dashboard = {
    period: { start: monthStart, end: now.toISOString() },
    aggregate: {
      weighted_sla_percentage: aggregate.weighted_sla_percentage ?? "100.0",
      total_services: aggregate.total_services ?? "0",
      operational: aggregate.operational ?? "0",
      degraded: aggregate.degraded ?? "0",
      down: aggregate.down ?? "0",
      maintenance: aggregate.maintenance ?? "0",
    },
    incidents: {
      total: incidentStats.total_incidents ?? "0",
      resolved: incidentStats.resolved_incidents ?? "0",
      open: incidentStats.open_incidents ?? "0",
      avg_mttr_minutes: incidentStats.avg_mttr_minutes ?? "0",
      max_mttr_minutes: incidentStats.max_mttr_minutes ?? "0",
    },
    services,
    trend,
  };

  // Cache por 30s
  await cacheSetJSON(cacheKey, dashboard, 30);

  return c.json({ data: dashboard, cached: false });
});
