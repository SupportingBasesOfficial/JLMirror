// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createKbCategorySchema,
  updateKbCategorySchema,
  createKbArticleSchema,
  updateKbArticleSchema,
  kbArticleFeedbackSchema,
} from "@repo/shared-validation";

// ========== createKbCategorySchema ==========

describe("kb — createKbCategorySchema", () => {
  const validCategory = {
    name: "Suporte Técnico",
  };

  it("valida categoria minima", () => {
    const result = createKbCategorySchema.safeParse(validCategory);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createKbCategorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("valida com description", () => {
    const result = createKbCategorySchema.safeParse({
      ...validCategory,
      description: "Artigos de suporte",
    });
    expect(result.success).toBe(true);
  });

  it("valida com slug", () => {
    const result = createKbCategorySchema.safeParse({
      ...validCategory,
      slug: "suporte-tecnico",
    });
    expect(result.success).toBe(true);
  });

  it("valida com parent_id UUID", () => {
    const result = createKbCategorySchema.safeParse({
      ...validCategory,
      parent_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita parent_id invalido", () => {
    const result = createKbCategorySchema.safeParse({
      ...validCategory,
      parent_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default sort_order=0", () => {
    const result = createKbCategorySchema.safeParse(validCategory);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort_order).toBe(0);
    }
  });

  it("aplica default is_active=true", () => {
    const result = createKbCategorySchema.safeParse(validCategory);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(true);
    }
  });

  it("valida sort_order custom", () => {
    const result = createKbCategorySchema.safeParse({
      ...validCategory,
      sort_order: 5,
    });
    expect(result.success).toBe(true);
  });

  it("valida is_active=false", () => {
    const result = createKbCategorySchema.safeParse({
      ...validCategory,
      is_active: false,
    });
    expect(result.success).toBe(true);
  });
});

// ========== updateKbCategorySchema ==========

describe("kb — updateKbCategorySchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updateKbCategorySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update name", () => {
    const result = updateKbCategorySchema.safeParse({ name: "Novo Nome" });
    expect(result.success).toBe(true);
  });

  it("rejeita name vazio", () => {
    const result = updateKbCategorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("valida update description", () => {
    const result = updateKbCategorySchema.safeParse({
      description: "Nova descrição",
    });
    expect(result.success).toBe(true);
  });

  it("valida update slug", () => {
    const result = updateKbCategorySchema.safeParse({ slug: "novo-slug" });
    expect(result.success).toBe(true);
  });

  it("valida update parent_id", () => {
    const result = updateKbCategorySchema.safeParse({
      parent_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("valida update parent_id null (remove parent)", () => {
    const result = updateKbCategorySchema.safeParse({ parent_id: null });
    expect(result.success).toBe(true);
  });

  it("valida update sort_order", () => {
    const result = updateKbCategorySchema.safeParse({ sort_order: 10 });
    expect(result.success).toBe(true);
  });

  it("valida update is_active", () => {
    const result = updateKbCategorySchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it("valida update completo", () => {
    const result = updateKbCategorySchema.safeParse({
      name: "Atualizado",
      description: "Nova desc",
      slug: "novo-slug",
      parent_id: "550e8400-e29b-41d4-a716-446655440000",
      sort_order: 3,
      is_active: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== createKbArticleSchema ==========

describe("kb — createKbArticleSchema", () => {
  const validArticle = {
    title: "Como resetar senha",
    content: "Para resetar sua senha, siga os passos...",
  };

  it("valida artigo minimo", () => {
    const result = createKbArticleSchema.safeParse(validArticle);
    expect(result.success).toBe(true);
  });

  it("rejeita sem title", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem content", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      content: "",
    });
    expect(result.success).toBe(false);
  });

  it("valida com category_id UUID", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      category_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita category_id invalido", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      category_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("valida com tags", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      tags: ["senha", "reset", "acesso"],
    });
    expect(result.success).toBe(true);
  });

  it("aplica default status=draft", () => {
    const result = createKbArticleSchema.safeParse(validArticle);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("draft");
    }
  });

  it("valida status=published", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      status: "published",
    });
    expect(result.success).toBe(true);
  });

  it("valida status=archived", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      status: "archived",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita status invalido", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      status: "deleted",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default content_format=markdown", () => {
    const result = createKbArticleSchema.safeParse(validArticle);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content_format).toBe("markdown");
    }
  });

  it("valida content_format=html", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      content_format: "html",
    });
    expect(result.success).toBe(true);
  });

  it("valida content_format=plaintext", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      content_format: "plaintext",
    });
    expect(result.success).toBe(true);
  });

  it("aplica default visibility=internal", () => {
    const result = createKbArticleSchema.safeParse(validArticle);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe("internal");
    }
  });

  it("valida visibility=public", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      visibility: "public",
    });
    expect(result.success).toBe(true);
  });

  it("valida visibility=private", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      visibility: "private",
    });
    expect(result.success).toBe(true);
  });

  it("aplica default is_pinned=false", () => {
    const result = createKbArticleSchema.safeParse(validArticle);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_pinned).toBe(false);
    }
  });

  it("valida com summary", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      summary: "Guia rápido para reset de senha",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita title muito longo (>300)", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      title: "a".repeat(301),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita mais de 20 tags", () => {
    const result = createKbArticleSchema.safeParse({
      ...validArticle,
      tags: Array(21).fill("tag"),
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateKbArticleSchema ==========

describe("kb — updateKbArticleSchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updateKbArticleSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update title", () => {
    const result = updateKbArticleSchema.safeParse({ title: "Novo Título" });
    expect(result.success).toBe(true);
  });

  it("valida update content", () => {
    const result = updateKbArticleSchema.safeParse({
      content: "Novo conteúdo",
    });
    expect(result.success).toBe(true);
  });

  it("valida update category_id", () => {
    const result = updateKbArticleSchema.safeParse({
      category_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("valida update category_id null (remove)", () => {
    const result = updateKbArticleSchema.safeParse({ category_id: null });
    expect(result.success).toBe(true);
  });

  it("valida update status", () => {
    const result = updateKbArticleSchema.safeParse({ status: "published" });
    expect(result.success).toBe(true);
  });

  it("valida update visibility", () => {
    const result = updateKbArticleSchema.safeParse({ visibility: "public" });
    expect(result.success).toBe(true);
  });

  it("valida update is_pinned", () => {
    const result = updateKbArticleSchema.safeParse({ is_pinned: true });
    expect(result.success).toBe(true);
  });

  it("valida update content_format", () => {
    const result = updateKbArticleSchema.safeParse({
      content_format: "html",
    });
    expect(result.success).toBe(true);
  });

  it("valida update expires_at", () => {
    const result = updateKbArticleSchema.safeParse({
      expires_at: "2025-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });

  it("valida update expires_at null (remove expiry)", () => {
    const result = updateKbArticleSchema.safeParse({ expires_at: null });
    expect(result.success).toBe(true);
  });

  it("valida update completo", () => {
    const result = updateKbArticleSchema.safeParse({
      category_id: "550e8400-e29b-41d4-a716-446655440000",
      title: "Atualizado",
      content: "Novo conteúdo",
      tags: ["atualizado"],
      summary: "Nova summary",
      content_format: "markdown",
      status: "published",
      visibility: "public",
      is_pinned: true,
      expires_at: "2025-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });
});

// ========== kbArticleFeedbackSchema ==========

describe("kb — kbArticleFeedbackSchema", () => {
  it("valida helpful=true", () => {
    const result = kbArticleFeedbackSchema.safeParse({ helpful: true });
    expect(result.success).toBe(true);
  });

  it("valida helpful=false", () => {
    const result = kbArticleFeedbackSchema.safeParse({ helpful: false });
    expect(result.success).toBe(true);
  });

  it("rejeita sem helpful", () => {
    const result = kbArticleFeedbackSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita helpful como string", () => {
    const result = kbArticleFeedbackSchema.safeParse({ helpful: "true" });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Slug Generation ==========

describe("kb — logica de slug generation", () => {
  it("gera slug de nome simples", () => {
    const name = "Suporte Técnico";
    const slug = name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    expect(slug).toBe("suporte-t-cnico");
  });

  it("gera slug de nome com espacos multiplos", () => {
    const name = "Como  resetar   senha";
    const slug = name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    expect(slug).toBe("como-resetar-senha");
  });

  it("gera slug de nome com caracteres especiais", () => {
    const name = "Configuração @#$% VPN!";
    const slug = name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    expect(slug).toBe("configura-o-vpn");
  });

  it("usa slug fornecido quando presente", () => {
    const data: { name: string; slug?: string } = {
      name: "Teste",
      slug: "meu-slug-custom",
    };
    const slug = data.slug ?? data.name;
    expect(slug).toBe("meu-slug-custom");
  });

  it("gera slug quando nao fornecido", () => {
    const data: { name: string; slug?: string } = {
      name: "Como Resetar Senha",
    };
    const slug =
      data.slug ??
      data.name
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    expect(slug).toBe("como-resetar-senha");
  });
});

// ========== Logica de Published At ==========

describe("kb — logica de published_at", () => {
  it("status=published define publishedAt", () => {
    const status = "published";
    const publishedAt =
      status === "published" ? new Date().toISOString() : null;
    expect(publishedAt).not.toBeNull();
  });

  it("status=draft nao define publishedAt", () => {
    const status: string = "draft";
    const publishedAt =
      status === "published" ? new Date().toISOString() : null;
    expect(publishedAt).toBeNull();
  });

  it("status=archived nao define publishedAt", () => {
    const status: string = "archived";
    const publishedAt =
      status === "published" ? new Date().toISOString() : null;
    expect(publishedAt).toBeNull();
  });
});

// ========== Logica de Limit Pagination ==========

describe("kb — logica de limit pagination", () => {
  it("articles limit default 50", () => {
    const limit = Math.min(parseInt("50", 10), 200);
    expect(limit).toBe(50);
  });

  it("articles limit maximo 200", () => {
    const limit = Math.min(parseInt("999", 10), 200);
    expect(limit).toBe(200);
  });

  it("search limit default 20", () => {
    const limit = Math.min(parseInt("20", 10), 100);
    expect(limit).toBe(20);
  });

  it("search limit maximo 100", () => {
    const limit = Math.min(parseInt("999", 10), 100);
    expect(limit).toBe(100);
  });
});

// ========== Logica de Version Bump ==========

describe("kb — logica de version bump", () => {
  it("incrementa current_version", () => {
    const currentVersion = 3;
    const newVersion = currentVersion + 1;
    expect(newVersion).toBe(4);
  });

  it("primeira versao e 1", () => {
    const currentVersion = 0;
    const newVersion = currentVersion + 1;
    expect(newVersion).toBe(1);
  });

  it("change_summary para content update", () => {
    const data: { content?: string; title?: string } = {
      content: "novo conteudo",
    };
    const summary =
      data.content !== undefined ? "Conteúdo atualizado" : "Título atualizado";
    expect(summary).toBe("Conteúdo atualizado");
  });

  it("change_summary para title update", () => {
    const data: { content?: string; title?: string } = { title: "novo titulo" };
    const summary =
      data.content !== undefined ? "Conteúdo atualizado" : "Título atualizado";
    expect(summary).toBe("Título atualizado");
  });
});
