// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { httpCache } from "../middleware/http-cache.js";
import { rateLimitApi } from "../middleware/rate-limit.js";

// Rota publica de branding — retorna cores, logo e mensagem de login
// Usada por telas publicas (login, client-portal, status-page) antes da autenticacao
export const brandingRoute = new Hono();

// GET /api/v1/branding/:tenantSlug — retorna branding publico do tenant
brandingRoute.get("/:tenantSlug", httpCache(300), rateLimitApi, async (c) => {
  const tenantSlug = c.req.param("tenantSlug");

  try {
    // Busca tenant por slug (name lowercase, sem espacos) ou por subdominio
    const result = await query<{
      company_name: string | null;
      logo_url: string | null;
      primary_color: string;
      secondary_color: string;
      custom_css: string | null;
      login_message: string | null;
    }>(
      `SELECT ts.company_name, ts.logo_url, ts.primary_color, ts.secondary_color,
              ts.custom_css, ts.login_message
       FROM public.tenant_settings ts
       JOIN public.tenants t ON ts.tenant_id = t.id
       WHERE t.id = $1 OR LOWER(REPLACE(t.name, ' ', '-')) = LOWER($2)
       LIMIT 1`,
      [tenantSlug, tenantSlug],
    );

    const branding = result.data?.rows?.[0];
    if (!branding) {
      // Retorna defaults se tenant nao encontrado
      return c.json({
        company_name: null,
        logo_url: null,
        primary_color: "#1BA898",
        secondary_color: "#35D0C4",
        custom_css: null,
        login_message: null,
      });
    }

    return c.json(branding);
  } catch (error) {
    logger.error("Erro ao buscar branding", {
      tenantSlug,
      error: error instanceof Error ? error.message : String(error),
    });
    // Retorna defaults em caso de erro (endpoint publico nao deve quebrar)
    return c.json({
      company_name: null,
      logo_url: null,
      primary_color: "#1BA898",
      secondary_color: "#35D0C4",
      custom_css: null,
      login_message: null,
    });
  }
});

// GET /api/v1/branding — retorna branding default (sem tenant)
brandingRoute.get("/", httpCache(600), async (c) => {
  return c.json({
    company_name: null,
    logo_url: null,
    primary_color: "#1BA898",
    secondary_color: "#35D0C4",
    custom_css: null,
    login_message: null,
  });
});
