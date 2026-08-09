// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { validate } from "../middleware/validate.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { statusPageConfigSchema } from "@repo/shared-validation";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

// Router público — montado ANTES do jwtAuth (sem autenticação)
export const statusPagePublicRoute = new Hono();

// ========== Public Endpoints (no auth) ==========

// GET /api/v1/status-page/:slug — dados publicos da pagina de status
statusPagePublicRoute.get("/:slug", httpCache(60), async (c) => {
  const slug = c.req.param("slug");

  try {
    const pageResult = await query<{
      id: string;
      tenant_id: string;
      page_title: string;
      company_name: string;
      logo_url: string | null;
      primary_color: string;
      show_uptime: boolean;
      show_incident_history: boolean;
      show_sla_percentage: boolean;
      days_of_history: number;
      support_email: string | null;
      support_url: string | null;
    }>(
      `SELECT id, tenant_id, page_title, company_name, logo_url, primary_color,
         show_uptime, show_incident_history, show_sla_percentage, days_of_history,
         support_email, support_url
       FROM public.status_pages WHERE slug = $1 AND is_published = true LIMIT 1`,
      [slug],
    );

    const page = pageResult.data?.rows[0];
    if (!page) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Página de status não encontrada",
          },
        },
        404,
      );
    }

    const tenantId = page.tenant_id;
    const historyDays = page.days_of_history;

    // Paraleliza 4 queries independentes
    const [
      servicesResult,
      activeIncidentsResult,
      historyResult,
      maintenanceResult,
    ] = await Promise.all([
      query(
        `SELECT id, name, description, service_type, status, priority,
             COALESCE(sla_target_percentage, 100)::text as sla_target
           FROM public.services
           WHERE tenant_id = $1 AND is_active = true
           ORDER BY priority DESC, name ASC`,
        [tenantId],
      ),
      query(
        `SELECT id, title, description, severity, status, started_at, resolved_at, root_cause
           FROM public.service_incidents
           WHERE tenant_id = $1 AND status NOT IN ('resolved')
           ORDER BY started_at DESC`,
        [tenantId],
      ),
      query(
        `SELECT id, title, severity, status, started_at, resolved_at,
             EXTRACT(EPOCH FROM (COALESCE(resolved_at, timezone('utc'::text, now())) - started_at)) / 60 as duration_minutes
           FROM public.service_incidents
           WHERE tenant_id = $1 AND started_at >= timezone('utc'::text, now()) - ($2 || ' days')::INTERVAL
           ORDER BY started_at DESC LIMIT 20`,
        [tenantId, String(historyDays)],
      ),
      query(
        `SELECT id, name, description, start_at, end_at, status, maintenance_type
           FROM public.maintenance_windows
           WHERE tenant_id = $1 AND start_at > timezone('utc'::text, now()) AND end_at > timezone('utc'::text, now())
           ORDER BY start_at ASC LIMIT 10`,
        [tenantId],
      ),
    ]);

    const services = servicesResult.data?.rows ?? [];
    const activeIncidents = activeIncidentsResult.data?.rows ?? [];
    const incidentHistory = historyResult.data?.rows ?? [];
    const scheduledMaintenance = maintenanceResult.data?.rows ?? [];

    // Status geral
    const hasDown = services.some(
      (s: Record<string, unknown>) => s.status === "down",
    );
    const hasDegraded = services.some(
      (s: Record<string, unknown>) => s.status === "degraded",
    );
    const overallStatus = hasDown
      ? "down"
      : hasDegraded
        ? "degraded"
        : "operational";

    return c.json({
      page: {
        page_title: page.page_title,
        company_name: page.company_name,
        logo_url: page.logo_url,
        primary_color: page.primary_color,
        support_email: page.support_email,
        support_url: page.support_url,
        show_uptime: page.show_uptime,
        show_incident_history: page.show_incident_history,
        show_sla_percentage: page.show_sla_percentage,
      },
      overall_status: overallStatus,
      services,
      active_incidents: activeIncidents,
      incident_history: page.show_incident_history ? incidentHistory : [],
      scheduled_maintenance: scheduledMaintenance,
    });
  } catch (error) {
    logger.error("Erro ao buscar status page pública", {
      slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// Router protegido — montado DEPOIS do jwtAuth (requer autenticação)
export const statusPageRoute = new Hono();

// ========== Admin Config (auth required) ==========

// GET /api/v1/status-page/admin/config — busca config do tenant
statusPageRoute.get(
  "/admin/config",
  requirePermission("status_page:manage"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "SELECT * FROM public.status_pages WHERE tenant_id = $1 LIMIT 1",
        [tenantId],
      );

      return c.json({ config: result.data?.rows[0] ?? null });
    } catch (error) {
      logger.error("Erro ao buscar status page config", {
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

// PUT /api/v1/status-page/admin/config — cria ou atualiza config (upsert)
statusPageRoute.put(
  "/admin/config",
  requirePermission("status_page:manage"),
  rateLimitWrite,
  validate({ schema: statusPageConfigSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as {
      slug: string;
      page_title?: string;
      company_name: string;
      logo_url?: string;
      primary_color?: string;
      show_uptime?: boolean;
      show_incident_history?: boolean;
      show_sla_percentage?: boolean;
      days_of_history?: number;
      support_email?: string;
      support_url?: string;
      is_published?: boolean;
    };
    const {
      slug,
      page_title,
      company_name,
      logo_url,
      primary_color,
      show_uptime,
      show_incident_history,
      show_sla_percentage,
      days_of_history,
      support_email,
      support_url,
      is_published,
    } = body;

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.status_pages
         (tenant_id, slug, page_title, company_name, logo_url, primary_color,
          show_uptime, show_incident_history, show_sla_percentage, days_of_history,
          support_email, support_url, is_published, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (tenant_id) DO UPDATE SET
           slug = EXCLUDED.slug,
           page_title = EXCLUDED.page_title,
           company_name = EXCLUDED.company_name,
           logo_url = EXCLUDED.logo_url,
           primary_color = EXCLUDED.primary_color,
           show_uptime = EXCLUDED.show_uptime,
           show_incident_history = EXCLUDED.show_incident_history,
           show_sla_percentage = EXCLUDED.show_sla_percentage,
           days_of_history = EXCLUDED.days_of_history,
           support_email = EXCLUDED.support_email,
           support_url = EXCLUDED.support_url,
           is_published = EXCLUDED.is_published
         RETURNING id`,
        [
          tenantId,
          slug,
          page_title ?? "Status do Sistema",
          company_name,
          logo_url ?? null,
          primary_color ?? "#0d9488",
          show_uptime ?? true,
          show_incident_history ?? true,
          show_sla_percentage ?? false,
          days_of_history ?? 90,
          support_email ?? null,
          support_url ?? null,
          is_published ?? false,
          userId,
        ],
      );

      const pageId = result.data?.rows[0]?.id;

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "status_page.config.update",
            entityType: "status_pages",
            entityId: pageId,
            newData: { id: pageId, slug, is_published },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Status page config atualizada", {
        pageId,
        slug,
        tenantId,
      });

      return c.json({ id: pageId, updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar status page config", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);
