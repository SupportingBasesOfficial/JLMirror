// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createKbCategorySchema,
  updateKbCategorySchema,
  createKbArticleSchema,
  updateKbArticleSchema,
  kbArticleFeedbackSchema,
  type CreateKbCategoryInput,
  type UpdateKbCategoryInput,
  type CreateKbArticleInput,
  type UpdateKbArticleInput,
  type KbArticleFeedbackInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const kbRoute = new Hono();

// GET /api/v1/kb — overview do modulo
kbRoute.get("/", requirePermission("kb:read"), httpCache(30), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const [categoriesResult, articlesResult] = await Promise.all([
      query<{ total: string }>(
        "SELECT COUNT(*) as total FROM public.kb_categories WHERE tenant_id = $1",
        [tenantId],
      ),
      query<{ total: string; published: string }>(
        "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'published') as published FROM public.kb_articles WHERE tenant_id = $1",
        [tenantId],
      ),
    ]);

    return c.json({
      overview: {
        categories: categoriesResult.data?.rows[0]?.total ?? "0",
        articles: articlesResult.data?.rows[0] ?? {
          total: "0",
          published: "0",
        },
      },
      endpoints: [
        "/categories",
        "/articles",
        "/articles/:id",
        "/search",
        "/stats",
      ],
    });
  } catch (error) {
    logger.error("Erro no overview KB", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// ========== Categories ==========

kbRoute.get(
  "/categories",
  requirePermission("kb:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");

    try {
      const result = await query(
        "SELECT * FROM public.kb_categories WHERE tenant_id = $1 ORDER BY sort_order, name",
        [user?.tenant_id ?? null],
      );

      return c.json({ categories: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar categorias KB", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

kbRoute.post(
  "/categories",
  rateLimitWrite,
  requirePermission("kb:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createKbCategorySchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as CreateKbCategoryInput;
    const slug =
      data.slug ??
      data.name
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.kb_categories (tenant_id, name, description, slug, parent_id, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          tenantId,
          data.name,
          data.description ?? null,
          slug,
          data.parent_id ?? null,
          data.sort_order,
          data.is_active,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao criar categoria" },
          },
          500,
        );
      }

      const categoryId = result.data.rows[0].id;

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "kb.category.create",
            entityType: "kb_category",
            entityId: categoryId,
            newData: { name: data.name, slug },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Categoria KB criada", { categoryId, tenantId });

      return c.json({ id: categoryId }, 201);
    } catch (error) {
      logger.error("Erro ao criar categoria KB", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar categoria" } },
        500,
      );
    }
  },
);

kbRoute.put(
  "/categories/:id",
  rateLimitWrite,
  requirePermission("kb:write"),
  async (c) => {
    const categoryId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateKbCategorySchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as UpdateKbCategoryInput;
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      name: "name",
      description: "description",
      slug: "slug",
      parent_id: "parent_id",
      sort_order: "sort_order",
      is_active: "is_active",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (updateFields.length === 0) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Nada para atualizar" } },
        400,
      );
    }

    try {
      params.push(categoryId, tenantId);
      const result = await query(
        `UPDATE public.kb_categories SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        params,
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Categoria não encontrada" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "kb.category.update",
            entityType: "kb_category",
            entityId: categoryId,
            newData: data,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Categoria KB atualizada", { categoryId, tenantId });

      return c.json({ id: categoryId });
    } catch (error) {
      logger.error("Erro ao atualizar categoria KB", {
        categoryId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "UPDATE_ERROR",
            message: "Erro ao atualizar categoria",
          },
        },
        500,
      );
    }
  },
);

kbRoute.delete(
  "/categories/:id",
  rateLimitWrite,
  requirePermission("kb:write"),
  async (c) => {
    const categoryId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.kb_categories WHERE id = $1 AND tenant_id = $2",
        [categoryId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Categoria não encontrada" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "kb.category.delete",
            entityType: "kb_category",
            entityId: categoryId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Categoria KB removida", { categoryId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover categoria KB", {
        categoryId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "DELETE_ERROR", message: "Erro ao remover categoria" },
        },
        500,
      );
    }
  },
);

// ========== Articles ==========

kbRoute.get(
  "/articles",
  requirePermission("kb:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const status = c.req.query("status");
    const categoryId = c.req.query("category_id");
    const tag = c.req.query("tag");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (categoryId) {
      conditions.push(`category_id = $${paramIdx++}`);
      params.push(categoryId);
    }
    if (tag) {
      conditions.push(`tags @> $${paramIdx++}::jsonb`);
      params.push(JSON.stringify([tag]));
    }

    params.push(limit);

    try {
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
    } catch (error) {
      logger.error("Erro ao listar artigos KB", {
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

kbRoute.get(
  "/articles/:id",
  requirePermission("kb:read"),
  httpCache(15),
  async (c) => {
    const articleId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Busca artigo e versões em paralelo (view_count update nao depende de versions)
      const [articleResult, versionsResult] = await Promise.all([
        query(
          `SELECT a.*, c.name as category_name, c.slug as category_slug
           FROM public.kb_articles a
           LEFT JOIN public.kb_categories c ON a.category_id = c.id
           WHERE a.id = $1 AND a.tenant_id = $2`,
          [articleId, tenantId],
        ),
        query(
          "SELECT id, version_number, title, change_summary, edited_by_name, created_at FROM public.kb_article_versions WHERE article_id = $1 ORDER BY version_number DESC",
          [articleId],
        ),
      ]);

      if (articleResult.error || !articleResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Artigo não encontrado" } },
          404,
        );
      }

      // Incrementa view_count (fire-and-forget, nao bloqueia resposta)
      query(
        "UPDATE public.kb_articles SET view_count = view_count + 1 WHERE id = $1",
        [articleId],
      ).catch(() => {
        // View count falhou — nao bloqueia leitura
      });

      return c.json({
        article: articleResult.data.rows[0],
        versions: versionsResult.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar artigo KB", {
        articleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

kbRoute.post(
  "/articles",
  rateLimitWrite,
  requirePermission("kb:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createKbArticleSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as CreateKbArticleInput;

    try {
      // Gera slug
      const slugResult = await query<{ generate_kb_slug: string }>(
        "SELECT public.generate_kb_slug($1, $2) as generate_kb_slug",
        [tenantId, data.title],
      );

      if (slugResult.error || !slugResult.data?.rows[0]) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao gerar slug" } },
          500,
        );
      }

      const slug = slugResult.data.rows[0].generate_kb_slug;
      const publishedAt =
        data.status === "published" ? new Date().toISOString() : null;
      const authorId = user?.sub ?? null;

      const result = await query<{ id: string }>(
        `INSERT INTO public.kb_articles (tenant_id, category_id, title, slug, summary, content, content_format, status, visibility, author_id, author_name, tags, is_pinned, published_at, current_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1)
         RETURNING id`,
        [
          tenantId,
          data.category_id ?? null,
          data.title,
          slug,
          data.summary ?? null,
          data.content,
          data.content_format,
          data.status,
          data.visibility,
          authorId,
          authorId,
          JSON.stringify(data.tags ?? []),
          data.is_pinned,
          publishedAt,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar artigo" } },
          500,
        );
      }

      const articleId = result.data.rows[0].id;

      // Versão inicial
      await query(
        `INSERT INTO public.kb_article_versions (tenant_id, article_id, version_number, title, summary, content, tags, edited_by, edited_by_name, change_summary)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, 'Versão inicial')`,
        [
          tenantId,
          articleId,
          data.title,
          data.summary ?? null,
          data.content,
          JSON.stringify(data.tags ?? []),
          authorId,
          authorId,
        ],
      );

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "kb.article.create",
            entityType: "kb_article",
            entityId: articleId,
            newData: { title: data.title, status: data.status },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Artigo KB criado", { articleId, tenantId });

      return c.json({ id: articleId, slug }, 201);
    } catch (error) {
      logger.error("Erro ao criar artigo KB", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar artigo" } },
        500,
      );
    }
  },
);

kbRoute.put(
  "/articles/:id",
  rateLimitWrite,
  requirePermission("kb:write"),
  async (c) => {
    const articleId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateKbArticleSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as UpdateKbArticleInput;
    const authorId = user?.sub ?? null;

    try {
      // Busca versão atual para criar nova versão se content mudou
      if (data.content !== undefined || data.title !== undefined) {
        const currentResult = await query<{
          title: string;
          summary: string | null;
          content: string;
          tags: string[];
          current_version: number;
        }>(
          "SELECT title, summary, content, tags, current_version FROM public.kb_articles WHERE id = $1 AND tenant_id = $2",
          [articleId, tenantId],
        );

        if (!currentResult.data?.rows[0]) {
          return c.json(
            { error: { code: "NOT_FOUND", message: "Artigo não encontrado" } },
            404,
          );
        }

        const current = currentResult.data.rows[0];
        const newVersion = current.current_version + 1;

        await query(
          `INSERT INTO public.kb_article_versions (tenant_id, article_id, version_number, title, summary, content, tags, edited_by, edited_by_name, change_summary)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            tenantId,
            articleId,
            newVersion,
            data.title ?? current.title,
            data.summary ?? current.summary,
            data.content ?? current.content,
            JSON.stringify(data.tags ?? current.tags),
            authorId,
            authorId,
            data.content !== undefined
              ? "Conteúdo atualizado"
              : "Título atualizado",
          ],
        );

        // Atualiza current_version
        await query(
          "UPDATE public.kb_articles SET current_version = $1 WHERE id = $2",
          [newVersion, articleId],
        );
      }

      const updateFields: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      const fieldMap: Record<string, string> = {
        category_id: "category_id",
        title: "title",
        summary: "summary",
        content: "content",
        content_format: "content_format",
        status: "status",
        visibility: "visibility",
        is_pinned: "is_pinned",
        expires_at: "expires_at",
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
        updateFields.push(
          `published_at = COALESCE(published_at, timezone('utc'::text, now()))`,
        );
      }

      if (updateFields.length > 0) {
        params.push(articleId, tenantId);
        const result = await query(
          `UPDATE public.kb_articles SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
          params,
        );

        if (result.data?.rowCount === 0) {
          return c.json(
            { error: { code: "NOT_FOUND", message: "Artigo não encontrado" } },
            404,
          );
        }
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "kb.article.update",
            entityType: "kb_article",
            entityId: articleId,
            newData: data,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Artigo KB atualizado", { articleId, tenantId });

      return c.json({ id: articleId });
    } catch (error) {
      logger.error("Erro ao atualizar artigo KB", {
        articleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "UPDATE_ERROR", message: "Erro ao atualizar artigo" },
        },
        500,
      );
    }
  },
);

kbRoute.delete(
  "/articles/:id",
  rateLimitWrite,
  requirePermission("kb:write"),
  async (c) => {
    const articleId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.kb_articles WHERE id = $1 AND tenant_id = $2",
        [articleId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Artigo não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "kb.article.delete",
            entityType: "kb_article",
            entityId: articleId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Artigo KB removido", { articleId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover artigo KB", {
        articleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover artigo" } },
        500,
      );
    }
  },
);

// ========== Feedback ==========

kbRoute.post(
  "/articles/:id/feedback",
  rateLimitWrite,
  requirePermission("kb:read"),
  async (c) => {
    const articleId = c.req.param("id");

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = kbArticleFeedbackSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const { helpful } = parsed.data as KbArticleFeedbackInput;

    try {
      const result = await query(
        helpful
          ? "UPDATE public.kb_articles SET helpful_count = helpful_count + 1 WHERE id = $1"
          : "UPDATE public.kb_articles SET unhelpful_count = unhelpful_count + 1 WHERE id = $1",
        [articleId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Artigo não encontrado" } },
          404,
        );
      }

      return c.json({ recorded: true });
    } catch (error) {
      logger.error("Erro ao registrar feedback KB", {
        articleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// ========== Search ==========

kbRoute.get(
  "/search",
  requirePermission("kb:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const q = c.req.query("q");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);

    if (!q) {
      return c.json({ results: [] });
    }

    try {
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
        [tenantId, q, limit],
      );

      return c.json({ results: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao buscar artigos KB", {
        q,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// ========== Stats ==========

kbRoute.get(
  "/stats",
  requirePermission("kb:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 3 queries (antes seriais)
      const [overviewResult, categoryResult, topArticles] = await Promise.all([
        query(
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
          [tenantId],
        ),
        query(
          `SELECT c.name, c.color,
             COUNT(a.id) as article_count,
             COALESCE(SUM(a.view_count), 0) as total_views
           FROM public.kb_categories c
           LEFT JOIN public.kb_articles a ON c.id = a.category_id AND a.tenant_id = $1
           WHERE c.tenant_id = $1 AND c.is_active = true
           GROUP BY c.name, c.color ORDER BY article_count DESC`,
          [tenantId],
        ),
        query(
          `SELECT id, title, slug, view_count, helpful_count, author_name, updated_at
           FROM public.kb_articles
           WHERE tenant_id = $1 AND status = 'published'
           ORDER BY view_count DESC LIMIT 5`,
          [tenantId],
        ),
      ]);

      return c.json({
        overview: overviewResult.data?.rows[0] ?? {
          total_articles: "0",
          published: "0",
          drafts: "0",
          archived: "0",
          pinned: "0",
          total_views: "0",
          total_helpful: "0",
          total_unhelpful: "0",
        },
        by_category: categoryResult.data?.rows ?? [],
        top_articles: topArticles.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar stats KB", {
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
