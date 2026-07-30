import { Hono } from "hono";
import { query } from "@repo/db";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const marketplaceRoute = new Hono();

marketplaceRoute.use("/*", jwtAuth);
marketplaceRoute.use("/*", tenantContext);

// ========== Apps Catalog ==========

// GET /api/v1/marketplace/apps — lista apps do catalogo
marketplaceRoute.get("/apps", async (c) => {
  const category = c.req.query("category");
  const search = c.req.query("search");

  let sql = "SELECT id, slug, name, description, category, integration_type, logo_url, vendor, vendor_url, status, is_featured, version, installs_count, rating, docs_url FROM public.marketplace_apps WHERE status IN ('active', 'beta')";
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

  const result = await query(sql, params);

  // Busca instalacoes do tenant para marcar quais ja estao instalados
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const installsResult = await query(
    "SELECT app_id, status FROM public.marketplace_installs WHERE tenant_id = $1",
    [tenantId],
  );

  const installedMap = new Map<string, string>();
  for (const row of installsResult.data?.rows ?? []) {
    installedMap.set(row.app_id as string, row.status as string);
  }

  const apps = (result.data?.rows ?? []).map((app: Record<string, unknown>) => ({
    ...app,
    installed: installedMap.has(app.id as string),
    install_status: installedMap.get(app.id as string) ?? null,
  }));

  return c.json({ apps });
});

// GET /api/v1/marketplace/apps/:slug — detalhe de um app
marketplaceRoute.get("/apps/:slug", async (c) => {
  const slug = c.req.param("slug");

  const result = await query(
    "SELECT * FROM public.marketplace_apps WHERE slug = $1 AND status IN ('active', 'beta') LIMIT 1",
    [slug],
  );

  const app = result.data?.rows[0];
  if (!app) {
    return c.json({ error: { code: "NOT_FOUND", message: "App não encontrado" } }, 404);
  }

  // Verifica se ja esta instalado
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const installResult = await query(
    "SELECT id, status, config, installed_at, configured_at FROM public.marketplace_installs WHERE tenant_id = $1 AND app_id = $2 LIMIT 1",
    [tenantId, app.id],
  );

  return c.json({
    app,
    install: installResult.data?.rows[0] ?? null,
  });
});

// ========== Installs ==========

// GET /api/v1/marketplace/installs — lista instalacoes do tenant
marketplaceRoute.get("/installs", requirePermission("marketplace:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const result = await query(
    `SELECT i.*, a.slug, a.name, a.description, a.category, a.integration_type, a.logo_url, a.vendor
     FROM public.marketplace_installs i
     JOIN public.marketplace_apps a ON i.app_id = a.id
     WHERE i.tenant_id = $1
     ORDER BY i.installed_at DESC`,
    [tenantId],
  );

  return c.json({ installs: result.data?.rows ?? [] });
});

// POST /api/v1/marketplace/apps/:id/install — instala um app
marketplaceRoute.post("/apps/:id/install", requirePermission("marketplace:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const appId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  // Verifica se o app existe
  const appResult = await query<{ id: string; slug: string; name: string; default_config: Record<string, unknown> }>(
    "SELECT id, slug, name, default_config FROM public.marketplace_apps WHERE id = $1 AND status IN ('active', 'beta') LIMIT 1",
    [appId],
  );

  const app = appResult.data?.rows[0];
  if (!app) {
    return c.json({ error: { code: "NOT_FOUND", message: "App não encontrado" } }, 404);
  }

  // Verifica se ja esta instalado
  const existingResult = await query<{ id: string }>(
    "SELECT id FROM public.marketplace_installs WHERE tenant_id = $1 AND app_id = $2 LIMIT 1",
    [tenantId, appId],
  );

  if (existingResult.data?.rows[0]) {
    return c.json({ error: { code: "ALREADY_INSTALLED", message: "App já instalado" } }, 409);
  }

  // Instala
  const installResult = await query<{ id: string }>(
    `INSERT INTO public.marketplace_installs (tenant_id, app_id, config, status, installed_by)
     VALUES ($1, $2, $3, 'installed', $4)
     RETURNING id`,
    [tenantId, appId, JSON.stringify(body.config ?? app.default_config ?? {}), user.sub],
  );

  // Incrementa installs_count
  await query(
    "UPDATE public.marketplace_apps SET installs_count = installs_count + 1 WHERE id = $1",
    [appId],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'marketplace.install', 'marketplace_installs', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ app_slug: app.slug, app_name: app.name, install_id: installResult.data?.rows[0]?.id })],
  );

  return c.json({ id: installResult.data?.rows[0]?.id, installed: true });
});

// PUT /api/v1/marketplace/installs/:id/configure — configura a instalacao
marketplaceRoute.put("/installs/:id/configure", requirePermission("marketplace:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const installId = c.req.param("id");
  const body = await c.req.json();

  await query(
    "UPDATE public.marketplace_installs SET config = $1, status = 'configured', configured_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3",
    [JSON.stringify(body.config ?? {}), installId, tenantId],
  );

  return c.json({ configured: true });
});

// PUT /api/v1/marketplace/installs/:id/activate — ativa a instalacao
marketplaceRoute.put("/installs/:id/activate", requirePermission("marketplace:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const installId = c.req.param("id");

  await query(
    "UPDATE public.marketplace_installs SET status = 'active' WHERE id = $1 AND tenant_id = $2",
    [installId, tenantId],
  );

  return c.json({ activated: true });
});

// PUT /api/v1/marketplace/installs/:id/disable — desativa a instalacao
marketplaceRoute.put("/installs/:id/disable", requirePermission("marketplace:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const installId = c.req.param("id");

  await query(
    "UPDATE public.marketplace_installs SET status = 'disabled' WHERE id = $1 AND tenant_id = $2",
    [installId, tenantId],
  );

  return c.json({ disabled: true });
});

// DELETE /api/v1/marketplace/installs/:id — desinstala
marketplaceRoute.delete("/installs/:id", requirePermission("marketplace:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const installId = c.req.param("id");

  // Busca app_id para decrementar installs_count
  const installResult = await query<{ app_id: string }>(
    "SELECT app_id FROM public.marketplace_installs WHERE id = $1 AND tenant_id = $2 LIMIT 1",
    [installId, tenantId],
  );

  const appId = installResult.data?.rows[0]?.app_id;

  await query("DELETE FROM public.marketplace_installs WHERE id = $1 AND tenant_id = $2", [installId, tenantId]);

  if (appId) {
    await query(
      "UPDATE public.marketplace_apps SET installs_count = GREATEST(installs_count - 1, 0) WHERE id = $1",
      [appId],
    );
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'marketplace.uninstall', 'marketplace_installs', $2, NULL, NULL, NULL)",
    [user.sub, installId],
  );

  return c.json({ uninstalled: true });
});

// ========== Stats ==========

// GET /api/v1/marketplace/stats — estatisticas
marketplaceRoute.get("/stats", requirePermission("marketplace:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const totalAppsResult = await query("SELECT COUNT(*) as count FROM public.marketplace_apps WHERE status IN ('active', 'beta')");
  const installedResult = await query("SELECT COUNT(*) as count FROM public.marketplace_installs WHERE tenant_id = $1", [tenantId]);
  const activeResult = await query("SELECT COUNT(*) as count FROM public.marketplace_installs WHERE tenant_id = $1 AND status = 'active'", [tenantId]);
  const byCategoryResult = await query(
    `SELECT a.category, COUNT(i.id) as count
     FROM public.marketplace_installs i
     JOIN public.marketplace_apps a ON i.app_id = a.id
     WHERE i.tenant_id = $1
     GROUP BY a.category`,
    [tenantId],
  );

  const getCount = (r: { data?: { rows?: Array<Record<string, unknown>> } | null }): number => {
    const row = r.data?.rows?.[0];
    return row ? parseInt((row.count as string) ?? "0", 10) : 0;
  };

  return c.json({
    total_apps: getCount(totalAppsResult),
    installed: getCount(installedResult),
    active: getCount(activeResult),
    by_category: byCategoryResult.data?.rows ?? [],
  });
});
