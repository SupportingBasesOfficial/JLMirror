// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { validate } from "../middleware/validate.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { marketplaceConfigureSchema } from "@repo/shared-validation";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const marketplaceRoute = new Hono();

// GET /api/v1/marketplace — overview do modulo
marketplaceRoute.get("/", httpCache(60), async (c) => {
  return c.json({
    overview: "Marketplace — Catálogo de integrações",
    endpoints: ["/apps", "/apps/:slug", "/installs", "/installs/:id", "/stats"],
  });
});

// ========== Apps Catalog ==========

// GET /api/v1/marketplace/apps — lista apps do catalogo
marketplaceRoute.get(
  "/apps",
  requirePermission("marketplace:read"),
  httpCache(60),
  async (c) => {
    const category = c.req.query("category");
    const search = c.req.query("search");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    let sql =
      "SELECT id, slug, name, description, category, integration_type, logo_url, vendor, vendor_url, status, is_featured, version, installs_count, rating, docs_url FROM public.marketplace_apps WHERE status IN ('active', 'beta')";
    const params: unknown[] = [];
    let paramIdx = 1;

    if (category) {
      sql += ` AND category = $${paramIdx++}`;
      params.push(category);
    }
    if (search) {
      sql += ` AND (name ILIKE $${paramIdx++} OR description ILIKE $${paramIdx++} OR vendor ILIKE $${paramIdx++})`;
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    sql += " ORDER BY is_featured DESC, rating DESC, name ASC";

    try {
      // Paraleliza: busca apps + busca installs do tenant
      const [result, installsResult] = await Promise.all([
        query(sql, params),
        query(
          "SELECT app_id, status FROM public.marketplace_installs WHERE tenant_id = $1",
          [tenantId],
        ),
      ]);

      const installedMap = new Map<string, string>();
      for (const row of installsResult.data?.rows ?? []) {
        installedMap.set(row.app_id as string, row.status as string);
      }

      const apps = (result.data?.rows ?? []).map(
        (app: Record<string, unknown>) => ({
          ...app,
          installed: installedMap.has(app.id as string),
          install_status: installedMap.get(app.id as string) ?? null,
        }),
      );

      return c.json({ apps });
    } catch (error) {
      logger.error("Erro ao listar marketplace apps", {
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

// GET /api/v1/marketplace/apps/:slug — detalhe de um app
marketplaceRoute.get(
  "/apps/:slug",
  requirePermission("marketplace:read"),
  httpCache(60),
  async (c) => {
    const slug = c.req.param("slug");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "SELECT * FROM public.marketplace_apps WHERE slug = $1 AND status IN ('active', 'beta') LIMIT 1",
        [slug],
      );

      const app = result.data?.rows[0];
      if (!app) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "App não encontrado" } },
          404,
        );
      }

      // Verifica se ja esta instalado
      const installResult = await query(
        "SELECT id, status, config, installed_at, configured_at FROM public.marketplace_installs WHERE tenant_id = $1 AND app_id = $2 LIMIT 1",
        [tenantId, app.id],
      );

      return c.json({
        app,
        install: installResult.data?.rows[0] ?? null,
      });
    } catch (error) {
      logger.error("Erro ao buscar marketplace app", {
        slug,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// ========== Installs ==========

// GET /api/v1/marketplace/installs — lista instalacoes do tenant
marketplaceRoute.get(
  "/installs",
  requirePermission("marketplace:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `SELECT i.*, a.slug, a.name, a.description, a.category, a.integration_type, a.logo_url, a.vendor
         FROM public.marketplace_installs i
         JOIN public.marketplace_apps a ON i.app_id = a.id
         WHERE i.tenant_id = $1
         ORDER BY i.installed_at DESC`,
        [tenantId],
      );

      return c.json({ installs: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar marketplace installs", {
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

// POST /api/v1/marketplace/apps/:id/install — instala um app
marketplaceRoute.post(
  "/apps/:id/install",
  requirePermission("marketplace:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const appId = c.req.param("id");

    const parsedBody = await safeJsonBody(c);
    const body = parsedBody.success ? parsedBody.data : {};

    try {
      // Verifica se o app existe
      const appResult = await query<{
        id: string;
        slug: string;
        name: string;
        default_config: Record<string, unknown>;
      }>(
        "SELECT id, slug, name, default_config FROM public.marketplace_apps WHERE id = $1 AND status IN ('active', 'beta') LIMIT 1",
        [appId],
      );

      const app = appResult.data?.rows[0];
      if (!app) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "App não encontrado" } },
          404,
        );
      }

      // Verifica se ja esta instalado
      const existingResult = await query<{ id: string }>(
        "SELECT id FROM public.marketplace_installs WHERE tenant_id = $1 AND app_id = $2 LIMIT 1",
        [tenantId, appId],
      );

      if (existingResult.data?.rows[0]) {
        return c.json(
          { error: { code: "ALREADY_INSTALLED", message: "App já instalado" } },
          409,
        );
      }

      // Instala
      const installResult = await query<{ id: string }>(
        `INSERT INTO public.marketplace_installs (tenant_id, app_id, config, status, installed_by)
         VALUES ($1, $2, $3, 'installed', $4)
         RETURNING id`,
        [
          tenantId,
          appId,
          JSON.stringify(
            (body as { config?: Record<string, unknown> })?.config ??
              app.default_config ??
              {},
          ),
          userId,
        ],
      );

      const installId = installResult.data?.rows[0]?.id;

      // Paraleliza: incrementa installs_count + audit log
      await Promise.all([
        query(
          "UPDATE public.marketplace_apps SET installs_count = installs_count + 1 WHERE id = $1",
          [appId],
        ),
        userId
          ? writeAuditLog({
              userId,
              tenantId,
              action: "marketplace.install",
              entityType: "marketplace_installs",
              entityId: installId,
              newData: {
                app_slug: app.slug,
                app_name: app.name,
                install_id: installId,
              },
            }).catch(() => {})
          : Promise.resolve(),
      ]);

      logger.info("Marketplace app instalado", {
        installId,
        appId,
        appSlug: app.slug,
        tenantId,
      });

      return c.json({ id: installId, installed: true });
    } catch (error) {
      logger.error("Erro ao instalar marketplace app", {
        appId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INSTALL_ERROR", message: "Erro ao instalar" } },
        500,
      );
    }
  },
);

// PUT /api/v1/marketplace/installs/:id/configure — configura a instalacao
marketplaceRoute.put(
  "/installs/:id/configure",
  requirePermission("marketplace:write"),
  rateLimitWrite,
  validate({ schema: marketplaceConfigureSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const installId = c.req.param("id");
    const body = c.get("validatedData") as {
      config?: Record<string, unknown>;
    };

    try {
      const result = await query(
        "UPDATE public.marketplace_installs SET config = $1, status = 'configured', configured_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3",
        [JSON.stringify(body.config ?? {}), installId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          {
            error: { code: "NOT_FOUND", message: "Instalação não encontrada" },
          },
          404,
        );
      }

      logger.info("Marketplace install configurada", {
        installId,
        tenantId,
      });

      return c.json({ configured: true });
    } catch (error) {
      logger.error("Erro ao configurar marketplace install", {
        installId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao configurar" } },
        500,
      );
    }
  },
);

// PUT /api/v1/marketplace/installs/:id/activate — ativa a instalacao
marketplaceRoute.put(
  "/installs/:id/activate",
  requirePermission("marketplace:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const installId = c.req.param("id");

    try {
      const result = await query(
        "UPDATE public.marketplace_installs SET status = 'active' WHERE id = $1 AND tenant_id = $2",
        [installId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          {
            error: { code: "NOT_FOUND", message: "Instalação não encontrada" },
          },
          404,
        );
      }

      logger.info("Marketplace install ativada", {
        installId,
        tenantId,
      });

      return c.json({ activated: true });
    } catch (error) {
      logger.error("Erro ao ativar marketplace install", {
        installId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao ativar" } },
        500,
      );
    }
  },
);

// PUT /api/v1/marketplace/installs/:id/disable — desativa a instalacao
marketplaceRoute.put(
  "/installs/:id/disable",
  requirePermission("marketplace:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const installId = c.req.param("id");

    try {
      const result = await query(
        "UPDATE public.marketplace_installs SET status = 'disabled' WHERE id = $1 AND tenant_id = $2",
        [installId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          {
            error: { code: "NOT_FOUND", message: "Instalação não encontrada" },
          },
          404,
        );
      }

      logger.info("Marketplace install desativada", {
        installId,
        tenantId,
      });

      return c.json({ disabled: true });
    } catch (error) {
      logger.error("Erro ao desativar marketplace install", {
        installId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao desativar" } },
        500,
      );
    }
  },
);

// DELETE /api/v1/marketplace/installs/:id — desinstala
marketplaceRoute.delete(
  "/installs/:id",
  requirePermission("marketplace:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const installId = c.req.param("id");

    try {
      // Busca app_id para decrementar installs_count
      const installResult = await query<{ app_id: string }>(
        "SELECT app_id FROM public.marketplace_installs WHERE id = $1 AND tenant_id = $2 LIMIT 1",
        [installId, tenantId],
      );

      const appId = installResult.data?.rows[0]?.app_id;

      if (!appId) {
        return c.json(
          {
            error: { code: "NOT_FOUND", message: "Instalação não encontrada" },
          },
          404,
        );
      }

      // Paraleliza: delete + decrement count + audit log
      await Promise.all([
        query(
          "DELETE FROM public.marketplace_installs WHERE id = $1 AND tenant_id = $2",
          [installId, tenantId],
        ),
        query(
          "UPDATE public.marketplace_apps SET installs_count = GREATEST(installs_count - 1, 0) WHERE id = $1",
          [appId],
        ),
        userId
          ? writeAuditLog({
              userId,
              tenantId,
              action: "marketplace.uninstall",
              entityType: "marketplace_installs",
              entityId: installId,
            }).catch(() => {})
          : Promise.resolve(),
      ]);

      logger.info("Marketplace app desinstalado", {
        installId,
        appId,
        tenantId,
      });

      return c.json({ uninstalled: true });
    } catch (error) {
      logger.error("Erro ao desinstalar marketplace app", {
        installId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao desinstalar" } },
        500,
      );
    }
  },
);

// ========== Stats ==========

// GET /api/v1/marketplace/stats — estatisticas
marketplaceRoute.get(
  "/stats",
  requirePermission("marketplace:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 4 queries independentes
      const [totalAppsResult, installedResult, activeResult, byCategoryResult] =
        await Promise.all([
          query(
            "SELECT COUNT(*) as count FROM public.marketplace_apps WHERE status IN ('active', 'beta')",
          ),
          query(
            "SELECT COUNT(*) as count FROM public.marketplace_installs WHERE tenant_id = $1",
            [tenantId],
          ),
          query(
            "SELECT COUNT(*) as count FROM public.marketplace_installs WHERE tenant_id = $1 AND status = 'active'",
            [tenantId],
          ),
          query(
            `SELECT a.category, COUNT(i.id) as count
             FROM public.marketplace_installs i
             JOIN public.marketplace_apps a ON i.app_id = a.id
             WHERE i.tenant_id = $1
             GROUP BY a.category`,
            [tenantId],
          ),
        ]);

      const getCount = (r: {
        data?: { rows?: Array<Record<string, unknown>> } | null;
      }): number => {
        const row = r.data?.rows?.[0];
        return row ? Number.parseInt((row.count as string) ?? "0", 10) || 0 : 0;
      };

      return c.json({
        total_apps: getCount(totalAppsResult),
        installed: getCount(installedResult),
        active: getCount(activeResult),
        by_category: byCategoryResult.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar marketplace stats", {
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
