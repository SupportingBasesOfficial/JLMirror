import { Hono } from "hono";
import { query } from "@repo/db";
import {
  createKbCategorySchema,
  updateKbCategorySchema,
  createKbArticleSchema,
  updateKbArticleSchema,
  type CreateKbCategoryInput,
  type UpdateKbCategoryInput,
  type CreateKbArticleInput,
  type UpdateKbArticleInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const kbRoute = new Hono();

// ========== Categories ==========

kbRoute.get("/categories", jwtAuth, tenantContext, requirePermission("kb:read"), async (c) => {
  const user = c.get("user");
  const result = await query(
    "SELECT * FROM public.kb_categories WHERE tenant_id = $1 ORDER BY sort_order, name",
    [user?.tenant_id ?? null],
  );

  return c.json({ categories: result.data?.rows ?? [] });
});

kbRoute.post("/categories", jwtAuth, tenantContext, requirePermission("kb:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateKbCategoryInput>();
  const parsed = createKbCategorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const slug = data.slug ?? data.name.toLowerCase().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");

  const result = await query<{ id: string }>(
    `INSERT INTO public.kb_categories (tenant_id, name, description, slug, parent_id, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [user?.tenant_id ?? null, data.name, data.description ?? null, slug, data.parent_id ?? null, data.sort_order, data.is_active],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao criar categoria" } }, 500);
  }

  return c.json({ id: result.data.rows[0].id }, 201);
});

kbRoute.put("/categories/:id", jwtAuth, tenantContext, requirePermission("kb:write"), async (c) => {
  const categoryId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<UpdateKbCategoryInput>();
  const parsed = updateKbCategorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    name: "name", description: "description", slug: "slug",
    parent_id: "parent_id", sort_order: "sort_order", is_active: "is_active",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key as keyof typeof data] !== undefined) {
      updateFields.push(`${dbField} = $${paramIdx++}`);
      params.push(data[key as keyof typeof data]);
    }
  }

  if (updateFields.length === 0) {
    return c.json({ id: categoryId });
  }

  params.push(categoryId, user?.tenant_id ?? null);

  await query(
    `UPDATE public.kb_categories SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
    params,
  );

  return c.json({ id: categoryId });
});

kbRoute.delete("/categories/:id", jwtAuth, tenantContext, requirePermission("kb:write"), async (c) => {
  const categoryId = c.req.param("id");
  const user = c.get("user");

  await query(
    "DELETE FROM public.kb_categories WHERE id = $1 AND tenant_id = $2",
    [categoryId, user?.tenant_id ?? null],
  );

  return c.json({ deleted: true });
});

// ========== Articles ==========

kbRoute.get("/articles", jwtAuth, tenantContext, requirePermission("kb:read"), async (c) => {
  const user = c.get("user");
  const status = c.req.query("status");
  const categoryId = c.req.query("category_id");
  const tag = c.req.query("tag");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  let paramIdx = 2;

  if (status) { conditions.push(`status = $${paramIdx++}`); params.push(status); }
  if (categoryId) { conditions.push(`category_id = $${paramIdx++}`); params.push(categoryId); }
  if (tag) { conditions.push(`tags @> $${paramIdx++}::jsonb`); params.push(JSON.stringify([tag])); }

  params.push(limit);

  const result = await query(
    `SELECT a.*, c.name as category_name, c.slug as category_slug
     FROM public.kb_articles a
     LEFT JOIN public.kb_categories c ON a.category_id = c.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.is_pinned DESC, a.updated_at DESC
     LIMIT $${paramIdx++}`,
    params,
  );

  return c.json({ articles: result.data?.rows ?? [] });
});

kbRoute.get("/articles/:id", jwtAuth, tenantContext, requirePermission("kb:read"), async (c) => {
  const articleId = c.req.param("id");
  const user = c.get("user");

  const articleResult = await query(
    `SELECT a.*, c.name as category_name, c.slug as category_slug
     FROM public.kb_articles a
     LEFT JOIN public.kb_categories c ON a.category_id = c.id
     WHERE a.id = $1 AND a.tenant_id = $2`,
    [articleId, user?.tenant_id ?? null],
  );

  if (articleResult.error || !articleResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Artigo não encontrado" } }, 404);
  }

  // Incrementa view_count
  await query(
    "UPDATE public.kb_articles SET view_count = view_count + 1 WHERE id = $1",
    [articleId],
  );

  // Busca versões
  const versionsResult = await query(
    "SELECT id, version_number, title, change_summary, edited_by_name, created_at FROM public.kb_article_versions WHERE article_id = $1 ORDER BY version_number DESC",
    [articleId],
  );

  return c.json({
    article: articleResult.data.rows[0],
    versions: versionsResult.data?.rows ?? [],
  });
});

kbRoute.post("/articles", jwtAuth, tenantContext, requirePermission("kb:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateKbArticleInput>();
  const parsed = createKbArticleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;

  // Gera slug
  const slugResult = await query<{ generate_kb_slug: string }>(
    "SELECT public.generate_kb_slug($1, $2) as generate_kb_slug",
    [user?.tenant_id ?? null, data.title],
  );

  if (slugResult.error || !slugResult.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao gerar slug" } }, 500);
  }

  const slug = slugResult.data.rows[0].generate_kb_slug;
  const publishedAt = data.status === "published" ? new Date().toISOString() : null;

  const result = await query<{ id: string }>(
    `INSERT INTO public.kb_articles (tenant_id, category_id, title, slug, summary, content, content_format, status, visibility, author_id, author_name, tags, is_pinned, published_at, current_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1)
     RETURNING id`,
    [
      user?.tenant_id ?? null, data.category_id ?? null, data.title, slug,
      data.summary ?? null, data.content, data.content_format, data.status, data.visibility,
      user.sub, user.sub, JSON.stringify(data.tags), data.is_pinned, publishedAt,
    ],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao criar artigo" } }, 500);
  }

  const articleId = result.data.rows[0].id;

  // Versão inicial
  await query(
    `INSERT INTO public.kb_article_versions (tenant_id, article_id, version_number, title, summary, content, tags, edited_by, edited_by_name, change_summary)
     VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, 'Versão inicial')`,
    [user?.tenant_id ?? null, articleId, data.title, data.summary ?? null, data.content, JSON.stringify(data.tags), user.sub, user.sub],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'kb.article.create', 'kb_article', $2, $3, NULL, NULL)",
    [user.sub, articleId, JSON.stringify({ title: data.title, status: data.status })],
  );

  return c.json({ id: articleId, slug }, 201);
});

kbRoute.put("/articles/:id", jwtAuth, tenantContext, requirePermission("kb:write"), async (c) => {
  const articleId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<UpdateKbArticleInput>();
  const parsed = updateKbArticleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;

  // Busca versão atual para criar nova versão se content mudou
  if (data.content !== undefined || data.title !== undefined) {
    const currentResult = await query<{ title: string; summary: string | null; content: string; tags: string[]; current_version: number }>(
      "SELECT title, summary, content, tags, current_version FROM public.kb_articles WHERE id = $1",
      [articleId],
    );

    if (currentResult.data?.rows[0]) {
      const current = currentResult.data.rows[0];
      const newVersion = current.current_version + 1;

      await query(
        `INSERT INTO public.kb_article_versions (tenant_id, article_id, version_number, title, summary, content, tags, edited_by, edited_by_name, change_summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          user?.tenant_id ?? null, articleId, newVersion,
          data.title ?? current.title, data.summary ?? current.summary,
          data.content ?? current.content,
          JSON.stringify(data.tags ?? current.tags), user.sub, user.sub,
          data.content !== undefined ? "Conteúdo atualizado" : "Título atualizado",
        ],
      );

      // Atualiza current_version
      await query(
        "UPDATE public.kb_articles SET current_version = $1 WHERE id = $2",
        [newVersion, articleId],
      );
    }
  }

  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    category_id: "category_id", title: "title", summary: "summary",
    content: "content", content_format: "content_format", status: "status",
    visibility: "visibility", is_pinned: "is_pinned", expires_at: "expires_at",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key as keyof typeof data] !== undefined) {
      updateFields.push(`${dbField} = $${paramIdx++}`);
      params.push(data[key as keyof typeof data]);
    }
  }

  if (data.tags !== undefined) {
    updateFields.push(`tags = $${paramIdx++}`);
    params.push(JSON.stringify(data.tags));
  }

  // Marca published_at se status mudou para published
  if (data.status === "published") {
    updateFields.push(`published_at = COALESCE(published_at, timezone('utc'::text, now()))`);
  }

  if (updateFields.length > 0) {
    params.push(articleId, user?.tenant_id ?? null);
    await query(
      `UPDATE public.kb_articles SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
      params,
    );
  }

  return c.json({ id: articleId });
});

kbRoute.delete("/articles/:id", jwtAuth, tenantContext, requirePermission("kb:write"), async (c) => {
  const articleId = c.req.param("id");
  const user = c.get("user");

  await query(
    "DELETE FROM public.kb_articles WHERE id = $1 AND tenant_id = $2",
    [articleId, user?.tenant_id ?? null],
  );

  return c.json({ deleted: true });
});

// ========== Feedback ==========

kbRoute.post("/articles/:id/feedback", jwtAuth, tenantContext, requirePermission("kb:read"), async (c) => {
  const articleId = c.req.param("id");
  const body = await c.req.json<{ helpful: boolean }>();

  if (body.helpful) {
    await query(
      "UPDATE public.kb_articles SET helpful_count = helpful_count + 1 WHERE id = $1",
      [articleId],
    );
  } else {
    await query(
      "UPDATE public.kb_articles SET unhelpful_count = unhelpful_count + 1 WHERE id = $1",
      [articleId],
    );
  }

  return c.json({ recorded: true });
});

// ========== Search ==========

kbRoute.get("/search", jwtAuth, tenantContext, requirePermission("kb:read"), async (c) => {
  const user = c.get("user");
  const q = c.req.query("q");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);

  if (!q) {
    return c.json({ results: [] });
  }

  const result = await query(
    `SELECT a.id, a.title, a.summary, a.slug, a.status, a.visibility, a.tags, a.view_count,
       a.author_name, a.updated_at, c.name as category_name,
       ts_rank(to_tsvector('english', a.title || ' ' || coalesce(a.summary, '') || ' ' || a.content), plainto_tsquery('english', $2)) as rank
     FROM public.kb_articles a
     LEFT JOIN public.kb_categories c ON a.category_id = c.id
     WHERE a.tenant_id = $1
       AND a.status = 'published'
       AND to_tsvector('english', a.title || ' ' || coalesce(a.summary, '') || ' ' || a.content) @@ plainto_tsquery('english', $2)
     ORDER BY rank DESC, a.updated_at DESC
     LIMIT $3`,
    [user?.tenant_id ?? null, q, limit],
  );

  return c.json({ results: result.data?.rows ?? [] });
});

// ========== Stats ==========

kbRoute.get("/stats", jwtAuth, tenantContext, requirePermission("kb:read"), async (c) => {
  const user = c.get("user");

  const overviewResult = await query(
    `SELECT
       COUNT(*) as total_articles,
       COUNT(*) FILTER (WHERE status = 'published') as published,
       COUNT(*) FILTER (WHERE status = 'draft') as drafts,
       COUNT(*) FILTER (WHERE status = 'archived') as archived,
       COUNT(*) FILTER (WHERE is_pinned = true) as pinned,
       SUM(view_count) as total_views,
       SUM(helpful_count) as total_helpful,
       SUM(unhelpful_count) as total_unhelpful
     FROM public.kb_articles WHERE tenant_id = $1`,
    [user?.tenant_id ?? null],
  );

  const categoryResult = await query(
    `SELECT c.name, c.color,
       COUNT(a.id) as article_count,
       COALESCE(SUM(a.view_count), 0) as total_views
     FROM public.kb_categories c
     LEFT JOIN public.kb_articles a ON c.id = a.category_id AND a.tenant_id = $1
     WHERE c.tenant_id = $1 AND c.is_active = true
     GROUP BY c.name, c.color ORDER BY article_count DESC`,
    [user?.tenant_id ?? null],
  );

  const topArticles = await query(
    `SELECT id, title, slug, view_count, helpful_count, author_name, updated_at
     FROM public.kb_articles
     WHERE tenant_id = $1 AND status = 'published'
     ORDER BY view_count DESC LIMIT 5`,
    [user?.tenant_id ?? null],
  );

  return c.json({
    overview: overviewResult.data?.rows[0] ?? { total_articles: "0", published: "0", drafts: "0", archived: "0", pinned: "0", total_views: "0", total_helpful: "0", total_unhelpful: "0" },
    by_category: categoryResult.data?.rows ?? [],
    top_articles: topArticles.data?.rows ?? [],
  });
});
