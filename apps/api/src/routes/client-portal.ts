// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { validate } from "../middleware/validate.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { clientPortalUserSchema } from "@repo/shared-validation";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const clientPortalRoute = new Hono();

// Middleware: verifica feature flag "module_client_portal"
clientPortalRoute.use("/*", async (c, next) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const flagResult = await query<{ default_value: boolean }>(
      `SELECT default_value FROM public.feature_flags
       WHERE key = 'module_client_portal' AND (tenant_id IS NULL OR tenant_id = $1) AND is_active = true
       LIMIT 1`,
      [tenantId],
    );

    const flagEnabled = flagResult.data?.rows[0]?.default_value === true;
    if (!flagEnabled) {
      return c.json(
        {
          error: {
            code: "MODULE_DISABLED",
            message: "Portal do Cliente não está ativado para este tenant",
          },
        },
        403,
      );
    }

    await next();
  } catch (error) {
    logger.error("Erro ao verificar feature flag client_portal", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// GET /api/v1/client-portal — overview do modulo
clientPortalRoute.get("/", httpCache(60), async (c) => {
  return c.json({
    overview: "Client Portal — Portal do cliente",
    endpoints: ["/users", "/overview", "/services", "/incidents"],
  });
});

// ========== Client Portal Users (Admin manage) ==========

// GET /api/v1/client-portal/users — lista usuarios do portal
clientPortalRoute.get(
  "/users",
  requirePermission("client_portal:manage"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `SELECT id, email, contact_name, company_name, phone, user_id,
         can_view_incidents, can_view_sla, can_view_services, can_create_tickets,
         is_active, last_login_at, created_at
         FROM public.client_portal_users WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId],
      );

      return c.json({ users: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar client portal users", {
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

// POST /api/v1/client-portal/users — cria usuario do portal
clientPortalRoute.post(
  "/users",
  requirePermission("client_portal:manage"),
  rateLimitWrite,
  validate({ schema: clientPortalUserSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as {
      email: string;
      contact_name: string;
      company_name?: string;
      phone?: string;
      can_view_incidents?: boolean;
      can_view_sla?: boolean;
      can_view_services?: boolean;
      can_create_tickets?: boolean;
    };
    const {
      email,
      contact_name,
      company_name,
      phone,
      can_view_incidents,
      can_view_sla,
      can_view_services,
      can_create_tickets,
    } = body;

    try {
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
          tenantId,
          email,
          contact_name,
          company_name ?? null,
          phone ?? null,
          can_view_incidents ?? true,
          can_view_sla ?? true,
          can_view_services ?? true,
          can_create_tickets ?? false,
          portalToken,
        ],
      );

      const portalUserId = result.data?.rows[0]?.id;

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "client_portal.user.create",
            entityType: "client_portal_users",
            entityId: portalUserId,
            newData: { id: portalUserId, email },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Client portal user criado", {
        portalUserId,
        email,
        tenantId,
      });

      return c.json({
        id: portalUserId,
        portal_token: result.data?.rows[0]?.portal_token,
        created: true,
      });
    } catch (error) {
      logger.error("Erro ao criar client portal user", {
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

// DELETE /api/v1/client-portal/users/:id — desativa usuario
clientPortalRoute.delete(
  "/users/:id",
  requirePermission("client_portal:manage"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const portalUserId = c.req.param("id");

    try {
      const result = await query(
        "UPDATE public.client_portal_users SET is_active = false WHERE id = $1 AND tenant_id = $2",
        [portalUserId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Usuário não encontrado" } },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "client_portal.user.deactivate",
            entityType: "client_portal_users",
            entityId: portalUserId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Client portal user desativado", {
        portalUserId,
        tenantId,
      });

      return c.json({ deactivated: true });
    } catch (error) {
      logger.error("Erro ao desativar client portal user", {
        portalUserId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao desativar" } },
        500,
      );
    }
  },
);

// ========== Portal Data (Client view) ==========

// GET /api/v1/client-portal/overview — visao geral para o cliente
clientPortalRoute.get("/overview", httpCache(30), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    // Paraleliza 4 queries independentes
    const [servicesResult, incidentsResult, slaResult, recentIncidents] =
      await Promise.all([
        query(
          `SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'operational') as operational,
           COUNT(*) FILTER (WHERE status = 'degraded') as degraded,
           COUNT(*) FILTER (WHERE status = 'down') as down
           FROM public.services WHERE tenant_id = $1 AND is_active = true`,
          [tenantId],
        ),
        query(
          `SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE status NOT IN ('resolved')) as open,
           COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved')) as critical_open
           FROM public.service_incidents WHERE tenant_id = $1 AND started_at >= timezone('utc'::text, now()) - INTERVAL '30 days'`,
          [tenantId],
        ),
        query(
          `SELECT COALESCE(AVG(sr.uptime_percentage), 100.0)::text as avg_sla
           FROM public.sla_records sr
           WHERE sr.tenant_id = $1 AND sr.period_start >= date_trunc('month', timezone('utc'::text, now()))`,
          [tenantId],
        ),
        query(
          `SELECT id, title, severity, status, started_at, resolved_at,
           EXTRACT(EPOCH FROM (COALESCE(resolved_at, timezone('utc'::text, now())) - started_at)) / 60 as duration_minutes
           FROM public.service_incidents
           WHERE tenant_id = $1 AND started_at >= timezone('utc'::text, now()) - INTERVAL '30 days'
           ORDER BY started_at DESC LIMIT 5`,
          [tenantId],
        ),
      ]);

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
  } catch (error) {
    logger.error("Erro ao buscar client portal overview", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// GET /api/v1/client-portal/services — lista servicos (visao do cliente)
clientPortalRoute.get("/services", httpCache(60), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const result = await query(
      `SELECT id, name, description, service_type, status, priority,
       sla_target_percentage::text
       FROM public.services
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY priority DESC, name ASC`,
      [tenantId],
    );

    return c.json({ services: result.data?.rows ?? [] });
  } catch (error) {
    logger.error("Erro ao listar client portal services", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// GET /api/v1/client-portal/incidents — incidentes (visao do cliente)
clientPortalRoute.get("/incidents", httpCache(30), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const parsedLimit = Number.parseInt(c.req.query("limit") ?? "20", 10);
  const limit = Math.min(Number.isNaN(parsedLimit) ? 20 : parsedLimit, 50);

  try {
    const result = await query(
      `SELECT id, title, description, severity, status,
       started_at, resolved_at, downtime_seconds, root_cause
       FROM public.service_incidents
       WHERE tenant_id = $1
       ORDER BY started_at DESC LIMIT $2`,
      [tenantId, limit],
    );

    return c.json({ incidents: result.data?.rows ?? [] });
  } catch (error) {
    logger.error("Erro ao listar client portal incidents", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});
