import { Hono } from "hono";
import { query } from "@repo/db";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const clientPortalRoute = new Hono();

// Middleware: verifica feature flag "client_portal_enabled"
clientPortalRoute.use("/*", async (c, next) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const flagResult = await query<{ default_value: boolean }>(
    `SELECT default_value FROM public.feature_flags
     WHERE key = 'client_portal_enabled' AND (tenant_id IS NULL OR tenant_id = $1) AND is_active = true
     LIMIT 1`,
    [tenantId],
  );

  const flagEnabled = flagResult.data?.rows[0]?.default_value === true;
  if (!flagEnabled) {
    return c.json({ error: { code: "MODULE_DISABLED", message: "Portal do Cliente não está ativado para este tenant" } }, 403);
  }

  await next();
});

// ========== Client Portal Users (Admin manage) ==========

// GET /api/v1/client-portal/users — lista usuarios do portal
clientPortalRoute.get("/users", jwtAuth, tenantContext, requirePermission("client_portal:manage"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const result = await query(
    `SELECT id, email, contact_name, company_name, phone, user_id,
       can_view_incidents, can_view_sla, can_view_services, can_create_tickets,
       is_active, last_login_at, created_at
     FROM public.client_portal_users WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );

  return c.json({ users: result.data?.rows ?? [] });
});

// POST /api/v1/client-portal/users — cria usuario do portal
clientPortalRoute.post("/users", jwtAuth, tenantContext, requirePermission("client_portal:manage"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const body = await c.req.json();

  const { email, contact_name, company_name, phone, can_view_incidents, can_view_sla, can_view_services, can_create_tickets } = body;

  if (!email || !contact_name) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "email e contact_name são obrigatórios" } }, 400);
  }

  // Gera token unico
  const { randomUUID } = await import("node:crypto");
  const portalToken = randomUUID();

  const result = await query<{ id: string; portal_token: string }>(
    `INSERT INTO public.client_portal_users
       (tenant_id, email, contact_name, company_name, phone,
        can_view_incidents, can_view_sla, can_view_services, can_create_tickets, portal_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (tenant_id, email) DO UPDATE SET
       contact_name = EXCLUDED.contact_name,
       company_name = EXCLUDED.company_name,
       phone = EXCLUDED.phone,
       can_view_incidents = EXCLUDED.can_view_incidents,
       can_view_sla = EXCLUDED.can_view_sla,
       can_view_services = EXCLUDED.can_view_services,
       can_create_tickets = EXCLUDED.can_create_tickets,
       is_active = true
     RETURNING id, portal_token`,
    [
      tenantId, email, contact_name, company_name ?? null, phone ?? null,
      can_view_incidents ?? true, can_view_sla ?? true, can_view_services ?? true, can_create_tickets ?? false,
      portalToken,
    ],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'client_portal.user.create', 'client_portal_users', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ id: result.data?.rows[0]?.id, email })],
  );

  return c.json({ id: result.data?.rows[0]?.id, portal_token: result.data?.rows[0]?.portal_token, created: true });
});

// DELETE /api/v1/client-portal/users/:id — desativa usuario
clientPortalRoute.delete("/users/:id", jwtAuth, tenantContext, requirePermission("client_portal:manage"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const userId = c.req.param("id");

  await query(
    "UPDATE public.client_portal_users SET is_active = false WHERE id = $1 AND tenant_id = $2",
    [userId, tenantId],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'client_portal.user.deactivate', 'client_portal_users', $2, NULL, NULL, NULL)",
    [user.sub, userId],
  );

  return c.json({ deactivated: true });
});

// ========== Portal Data (Client view) ==========

// GET /api/v1/client-portal/overview — visao geral para o cliente
clientPortalRoute.get("/overview", jwtAuth, tenantContext, async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  // Servicos ativos
  const servicesResult = await query(
    `SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'operational') as operational,
       COUNT(*) FILTER (WHERE status = 'degraded') as degraded,
       COUNT(*) FILTER (WHERE status = 'down') as down
     FROM public.services WHERE tenant_id = $1 AND is_active = true`,
    [tenantId],
  );

  // Incidentes abertos
  const incidentsResult = await query(
    `SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE status NOT IN ('resolved')) as open,
       COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved')) as critical_open
     FROM public.service_incidents WHERE tenant_id = $1 AND started_at >= timezone('utc'::text, now()) - INTERVAL '30 days'`,
    [tenantId],
  );

  // SLA do mes
  const slaResult = await query(
    `SELECT COALESCE(AVG(sr.uptime_percentage), 100.0)::text as avg_sla
     FROM public.sla_records sr
     WHERE sr.tenant_id = $1 AND sr.period_start >= date_trunc('month', timezone('utc'::text, now()))`,
    [tenantId],
  );

  // Incidentes recentes (ultimos 5)
  const recentIncidents = await query(
    `SELECT id, title, severity, status, started_at, resolved_at,
       EXTRACT(EPOCH FROM (COALESCE(resolved_at, timezone('utc'::text, now())) - started_at)) / 60 as duration_minutes
     FROM public.service_incidents
     WHERE tenant_id = $1 AND started_at >= timezone('utc'::text, now()) - INTERVAL '30 days'
     ORDER BY started_at DESC LIMIT 5`,
    [tenantId],
  );

  const svc = servicesResult.data?.rows[0] ?? {};
  const inc = incidentsResult.data?.rows[0] ?? {};

  return c.json({
    services: {
      total: svc.total ?? "0",
      operational: svc.operational ?? "0",
      degraded: svc.degraded ?? "0",
      down: svc.down ?? "0",
    },
    incidents: {
      total_30d: inc.total ?? "0",
      open: inc.open ?? "0",
      critical_open: inc.critical_open ?? "0",
    },
    sla: {
      avg_percentage: slaResult.data?.rows[0]?.avg_sla ?? "100.0",
    },
    recent_incidents: recentIncidents.data?.rows ?? [],
  });
});

// GET /api/v1/client-portal/services — lista servicos (visao do cliente)
clientPortalRoute.get("/services", jwtAuth, tenantContext, async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const result = await query(
    `SELECT id, name, description, service_type, status, priority,
       sla_target_percentage::text
     FROM public.services
     WHERE tenant_id = $1 AND is_active = true
     ORDER BY priority DESC, name ASC`,
    [tenantId],
  );

  return c.json({ services: result.data?.rows ?? [] });
});

// GET /api/v1/client-portal/incidents — incidentes (visao do cliente)
clientPortalRoute.get("/incidents", jwtAuth, tenantContext, async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 50);

  const result = await query(
    `SELECT id, title, description, severity, status,
       started_at, resolved_at, downtime_seconds, root_cause
     FROM public.service_incidents
     WHERE tenant_id = $1
     ORDER BY started_at DESC LIMIT $2`,
    [tenantId, limit],
  );

  return c.json({ incidents: result.data?.rows ?? [] });
});
