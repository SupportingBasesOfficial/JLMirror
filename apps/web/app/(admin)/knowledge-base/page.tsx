// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState } from "react";
import { RefreshCw, ArrowLeft, Plus } from "lucide-react";
import { LoadingState } from "@/components/ui/state-display";
import { useApi } from "@/lib/use-api";

const COLORS = {
  bg: "var(--surface-0)",
  card: "var(--surface-2)",
  border: "var(--border-default)",
  text: "var(--text-primary)",
  muted: "var(--text-muted)",
  teal: "var(--brand-primary)",
  green: "var(--status-ok-text)",
  red: "var(--status-error-text)",
  amber: "var(--status-warning-text)",
  blue: "var(--status-info-text)",
  purple: "var(--status-info-text)",
};

const STATUSES = ["draft", "published", "archived"];
const VISIBILITIES = ["public", "internal", "private"];
const FORMATS = ["markdown", "html", "plaintext"];

const STATUS_COLORS: Record<string, string> = {
  draft: COLORS.amber,
  published: COLORS.green,
  archived: COLORS.muted,
};

const VISIBILITY_COLORS: Record<string, string> = {
  public: COLORS.green,
  internal: COLORS.blue,
  private: COLORS.red,
};

interface KbCategory {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
}

interface KbArticle {
  id: string;
  category_id: string | null;
  category_name: string | null;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  content_format: string;
  status: string;
  visibility: string;
  author_name: string;
  tags: string[];
  view_count: number;
  helpful_count: number;
  unhelpful_count: number;
  is_pinned: boolean;
  current_version: number;
  published_at: string | null;
  updated_at: string;
  created_at: string;
}

interface ArticleVersion {
  id: string;
  version_number: number;
  title: string;
  change_summary: string | null;
  edited_by_name: string;
  created_at: string;
}

interface SearchResults {
  id: string;
  title: string;
  summary: string | null;
  slug: string;
  category_name: string | null;
  rank: number;
}

interface KbStats {
  overview: {
    total_articles: string;
    published: string;
    drafts: string;
    archived: string;
    pinned: string;
    total_views: string;
    total_helpful: string;
    total_unhelpful: string;
  };
  by_category: {
    name: string;
    color: string;
    article_count: string;
    total_views: string;
  }[];
  top_articles: {
    id: string;
    title: string;
    view_count: number;
    helpful_count: number;
    author_name: string;
  }[];
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function KnowledgeBasePage() {
  const [searchResults, setSearchResults] = useState<SearchResults[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"articles" | "categories" | "search">(
    "articles",
  );
  const [showArticle, setShowArticle] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<KbArticle | null>(
    null,
  );
  const [versions, setVersions] = useState<ArticleVersion[]>([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Article form
  const [aTitle, setATitle] = useState("");
  const [aSummary, setASummary] = useState("");
  const [aContent, setAContent] = useState("");
  const [aFormat, setAFormat] = useState("markdown");
  const [aStatus, setAStatus] = useState("draft");
  const [aVisibility, setAVisibility] = useState("internal");
  const [aCategory, setACategory] = useState("");
  const [aTags, setATags] = useState("");

  // Category form
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");

  const articlesQuery = (() => {
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterCategory) params.set("category_id", filterCategory);
    const qs = params.toString();
    return qs ? `/api/kb/articles?${qs}` : "/api/kb/articles";
  })();
  const { data: aData, mutate: mutateArticles } = useApi<{
    articles: KbArticle[];
  }>(articlesQuery);
  const { data: cData, mutate: mutateCategories } = useApi<{
    categories: KbCategory[];
  }>("/api/kb/categories");
  const { data: stats, mutate: mutateStats } = useApi<KbStats>("/api/kb/stats");
  const articles = aData?.articles ?? [];
  const categories = cData?.categories ?? [];

  async function handleSearch() {
    if (!searchQuery) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/kb/search?q=${encodeURIComponent(searchQuery)}`,
        { credentials: "include" },
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results ?? []);
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  async function handleSelectArticle(article: KbArticle) {
    setSelectedArticle(article);
    try {
      const res = await fetch(`/api/kb/articles/${article.id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions ?? []);
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  async function handleCreateArticle() {
    setError(null);
    try {
      const tags = aTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch("/api/kb/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: aTitle,
          summary: aSummary || undefined,
          content: aContent,
          content_format: aFormat,
          status: aStatus,
          visibility: aVisibility,
          category_id: aCategory || undefined,
          tags,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar artigo");
        return;
      }
      setSuccess("Artigo criado!");
      setShowArticle(false);
      setATitle("");
      setASummary("");
      setAContent("");
      setATags("");
      mutateArticles();
      mutateStats();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleUpdateStatus(articleId: string, status: string) {
    try {
      const res = await fetch(`/api/kb/articles/${articleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        if (selectedArticle?.id === articleId) {
          setSelectedArticle({ ...selectedArticle, status });
        }
        mutateArticles();
        mutateStats();
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  async function handleFeedback(articleId: string, helpful: boolean) {
    try {
      await fetch(`/api/kb/articles/${articleId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ helpful }),
      });
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  async function handleDeleteArticle(id: string) {
    try {
      const res = await fetch(`/api/kb/articles/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        mutateArticles();
        mutateStats();
      }
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  async function handleCreateCategory() {
    setError(null);
    try {
      const res = await fetch("/api/kb/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: cName, description: cDesc || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Erro ao criar categoria");
        return;
      }
      setSuccess("Categoria criada!");
      setShowCategory(false);
      setCName("");
      setCDesc("");
      mutateCategories();
    } catch {
      setError("Erro de conexão");
    }
  }

  async function handleDeleteCategory(id: string) {
    try {
      const res = await fetch(`/api/kb/categories/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) mutateCategories();
    } catch (err) {
      console.error("Operacao falhou:", err);
    }
  }

  if (!aData && !cData && !stats)
    return <LoadingState label="Carregando base de conhecimento..." />;

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{
        background: COLORS.bg,
        fontFamily: "'JetBrains Mono','Consolas',monospace",
        color: COLORS.text,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: COLORS.teal }}>
            Knowledge Base — Artigos & Documentação
          </h1>
          <p className="text-[12px]" style={{ color: COLORS.muted }}>
            Categorias · Versionamento · Busca Full-Text · Tags · Feedback
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "articles" && (
            <button
              onClick={() => setShowArticle(true)}
              className="text-[12px] px-3 py-1.5 rounded font-bold"
              style={{
                background: COLORS.teal,
                color: COLORS.bg,
                cursor: "pointer",
              }}
            >
              <Plus size={12} className="inline" /> Artigo
            </button>
          )}
          {tab === "categories" && (
            <button
              onClick={() => setShowCategory(true)}
              className="text-[12px] px-3 py-1.5 rounded font-bold"
              style={{
                background: COLORS.teal,
                color: COLORS.bg,
                cursor: "pointer",
              }}
            >
              <Plus size={12} className="inline" /> Categoria
            </button>
          )}
          <button
            onClick={() => {
              mutateArticles();
              mutateCategories();
              mutateStats();
            }}
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.muted,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={12} className="inline" /> Atualizar
          </button>
          <a
            href="/dashboard"
            className="text-[12px] px-3 py-1.5 rounded border"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.muted,
            }}
          >
            <ArrowLeft size={12} className="inline" /> Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: `var(--status-error-bg)`,
            border: `1px solid var(--status-error-border)`,
            color: COLORS.red,
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            background: `var(--status-ok-bg)`,
            border: `1px solid var(--status-ok-border)`,
            color: COLORS.green,
          }}
        >
          {success}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Total Artigos
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.teal }}>
              {stats.overview.total_articles}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              {stats.overview.published} publicados · {stats.overview.drafts}{" "}
              rascunhos
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-info-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Total Views
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.blue }}>
              {stats.overview.total_views}
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-ok-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Útil
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.green }}>
              {stats.overview.total_helpful}
            </div>
            <div className="text-[10px]" style={{ color: COLORS.muted }}>
              Não útil: {stats.overview.total_unhelpful}
            </div>
          </div>
          <div
            className="p-4 rounded-xl"
            style={{
              background: COLORS.card,
              border: `1px solid var(--status-warning-border)`,
            }}
          >
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: COLORS.muted }}
            >
              Fixados
            </div>
            <div className="text-2xl font-bold" style={{ color: COLORS.amber }}>
              {stats.overview.pinned}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {(
          [
            { key: "articles", label: `Artigos (${articles.length})` },
            { key: "categories", label: `Categorias (${categories.length})` },
            { key: "search", label: "Buscar" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-t-md text-[12px] font-bold transition-colors"
            style={{
              background: tab === t.key ? COLORS.card : "transparent",
              border: `1px solid ${COLORS.border}`,
              borderBottom:
                tab === t.key ? "none" : `1px solid ${COLORS.border}`,
              color: tab === t.key ? COLORS.teal : COLORS.muted,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Articles */}
      {tab === "articles" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 items-end">
            <div className="space-y-1">
              <label
                htmlFor="a-fs"
                className="text-[11px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Status
              </label>
              <select
                id="a-fs"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-md px-3 py-1.5 text-[12px]"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              >
                <option value="">Todos</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label
                htmlFor="a-fc"
                className="text-[11px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Categoria
              </label>
              <select
                id="a-fc"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="rounded-md px-3 py-1.5 text-[12px]"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              >
                <option value="">Todas</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {articles.length === 0 ? (
              <div
                className="p-8 text-center text-sm"
                style={{ color: COLORS.muted }}
              >
                Nenhum artigo encontrado
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Título
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Categoria
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Status
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Visibilidade
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Views
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Tags
                    </th>
                    <th
                      className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    >
                      Atualizado
                    </th>
                    <th
                      className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                      style={{ color: COLORS.muted }}
                    ></th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((a) => (
                    <tr
                      key={a.id}
                      style={{
                        borderBottom: `1px solid ${COLORS.border}`,
                        cursor: "pointer",
                      }}
                      onClick={() => handleSelectArticle(a)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSelectArticle(a);
                      }}
                    >
                      <td
                        className="px-3 py-2 max-w-[200px] truncate"
                        style={{ color: COLORS.teal }}
                      >
                        {a.is_pinned && (
                          <span style={{ color: COLORS.amber }}>📌 </span>
                        )}
                        {a.title}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {a.category_name ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{
                            background: `${STATUS_COLORS[a.status] ?? COLORS.muted}15`,
                            color: STATUS_COLORS[a.status] ?? COLORS.muted,
                          }}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{
                            background: `${VISIBILITY_COLORS[a.visibility] ?? COLORS.muted}15`,
                            color:
                              VISIBILITY_COLORS[a.visibility] ?? COLORS.muted,
                          }}
                        >
                          {a.visibility}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {a.view_count}
                      </td>
                      <td
                        className="px-3 py-2 max-w-[150px] truncate"
                        style={{ color: COLORS.muted }}
                      >
                        {Array.isArray(a.tags) ? a.tags.join(", ") : ""}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                        {formatTime(a.updated_at)}
                      </td>
                      <td
                        className="px-3 py-2 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleDeleteArticle(a.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={{
                            background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`,
                            border: `1px solid var(--status-error-border)`,
                            color: COLORS.red,
                            cursor: "pointer",
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab: Categories */}
      {tab === "categories" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          {categories.length === 0 ? (
            <div
              className="p-8 text-center text-sm"
              style={{ color: COLORS.muted }}
            >
              Nenhuma categoria criada
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Nome
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Slug
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Descrição
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Ordem
                  </th>
                  <th
                    className="text-left px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    Ativo
                  </th>
                  <th
                    className="text-right px-3 py-2 font-bold uppercase text-[10px]"
                    style={{ color: COLORS.muted }}
                  ></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr
                    key={cat.id}
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`,
                      opacity: cat.is_active ? 1 : 0.4,
                    }}
                  >
                    <td className="px-3 py-2" style={{ color: COLORS.teal }}>
                      {cat.name}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {cat.slug}
                    </td>
                    <td
                      className="px-3 py-2 max-w-[200px] truncate"
                      style={{ color: COLORS.muted }}
                    >
                      {cat.description ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.muted }}>
                      {cat.sort_order}
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{
                        color: cat.is_active ? COLORS.green : COLORS.muted,
                      }}
                    >
                      {cat.is_active ? "✓" : "✕"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="px-2 py-1 rounded text-[10px] font-bold"
                        style={{
                          background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`,
                          border: `1px solid var(--status-error-border)`,
                          color: COLORS.red,
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Search */}
      {tab === "search" && (
        <div
          className="space-y-4 rounded-xl p-6"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderTop: "none",
          }}
        >
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1">
              <label
                htmlFor="s-q"
                className="text-[11px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Buscar nos artigos publicados
              </label>
              <input
                id="s-q"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Como configurar VPN..."
                className="w-full rounded-md px-3 py-2 text-[13px]"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                }}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!searchQuery}
              className="px-4 py-2 rounded-md text-[12px] font-bold disabled:opacity-50"
              style={{
                background: COLORS.teal,
                color: COLORS.bg,
                cursor: !searchQuery ? "not-allowed" : "pointer",
              }}
            >
              Buscar
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((r) => (
                <div
                  key={r.id}
                  className="p-3 rounded-md"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div
                    className="text-[13px] font-bold"
                    style={{ color: COLORS.teal }}
                  >
                    {r.title}
                  </div>
                  {r.summary && (
                    <div
                      className="text-[12px] mt-1"
                      style={{ color: COLORS.muted }}
                    >
                      {r.summary}
                    </div>
                  )}
                  <div
                    className="flex items-center gap-3 mt-1 text-[10px]"
                    style={{ color: COLORS.muted }}
                  >
                    {r.category_name && (
                      <span>Categoria: {r.category_name}</span>
                    )}
                    <span>Relevância: {(r.rank * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {searchQuery && searchResults.length === 0 && (
            <div
              className="text-center text-sm py-4"
              style={{ color: COLORS.muted }}
            >
              Nenhum resultado encontrado
            </div>
          )}
        </div>
      )}

      {/* Modal: Article detail */}
      {selectedArticle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => {
            setSelectedArticle(null);
            setVersions([]);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSelectedArticle(null);
              setVersions([]);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <h2
                  className="text-sm font-bold"
                  style={{ color: COLORS.teal }}
                >
                  {selectedArticle.is_pinned && "📌 "}
                  {selectedArticle.title}
                </h2>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: `${STATUS_COLORS[selectedArticle.status] ?? COLORS.muted}15`,
                      color:
                        STATUS_COLORS[selectedArticle.status] ?? COLORS.muted,
                    }}
                  >
                    {selectedArticle.status}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: `${VISIBILITY_COLORS[selectedArticle.visibility] ?? COLORS.muted}15`,
                      color:
                        VISIBILITY_COLORS[selectedArticle.visibility] ??
                        COLORS.muted,
                    }}
                  >
                    {selectedArticle.visibility}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      background: `color-mix(in srgb, var(--text-muted) 8%, transparent)`,
                      color: COLORS.muted,
                    }}
                  >
                    v{selectedArticle.current_version}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedArticle(null);
                  setVersions([]);
                }}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Info */}
            <div className="grid grid-cols-2 gap-3 mb-4 text-[12px]">
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Autor:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedArticle.author_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Categoria:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedArticle.category_name ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Views:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedArticle.view_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.muted }}>Formato:</span>
                <span style={{ color: COLORS.text }}>
                  {selectedArticle.content_format}
                </span>
              </div>
            </div>

            {/* Summary */}
            {selectedArticle.summary && (
              <div
                className="mb-3 p-3 rounded-md"
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div
                  className="text-[10px] uppercase mb-1"
                  style={{ color: COLORS.muted }}
                >
                  Resumo
                </div>
                <div className="text-[12px]" style={{ color: COLORS.text }}>
                  {selectedArticle.summary}
                </div>
              </div>
            )}

            {/* Content */}
            <div
              className="mb-4 p-3 rounded-md"
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                className="text-[10px] uppercase mb-1"
                style={{ color: COLORS.muted }}
              >
                Conteúdo
              </div>
              <div
                className="text-[12px] whitespace-pre-wrap max-h-[300px] overflow-y-auto"
                style={{ color: COLORS.text }}
              >
                {selectedArticle.content}
              </div>
            </div>

            {/* Tags */}
            {Array.isArray(selectedArticle.tags) &&
              selectedArticle.tags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1">
                  {selectedArticle.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[10px] font-bold"
                      style={{
                        background: `color-mix(in srgb, var(--status-info-text) 8%, transparent)`,
                        color: COLORS.purple,
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

            {/* Status actions */}
            <div className="mb-4 flex flex-wrap gap-1">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleUpdateStatus(selectedArticle.id, s)}
                  className="px-2 py-1 rounded text-[10px] font-bold uppercase"
                  style={{
                    background:
                      selectedArticle.status === s
                        ? `${STATUS_COLORS[s] ?? COLORS.muted}20`
                        : "transparent",

                    border: `1px solid ${STATUS_COLORS[s] ?? COLORS.muted}44`,

                    color: STATUS_COLORS[s] ?? COLORS.muted,
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Feedback */}
            <div className="mb-4 flex items-center gap-3">
              <span
                className="text-[11px] font-bold uppercase"
                style={{ color: COLORS.muted }}
              >
                Este artigo foi útil?
              </span>
              <button
                onClick={() => handleFeedback(selectedArticle.id, true)}
                className="px-3 py-1 rounded text-[11px] font-bold"
                style={{
                  background: `color-mix(in srgb, var(--status-ok-text) 12%, transparent)`,
                  border: `1px solid var(--status-ok-border)`,
                  color: COLORS.green,
                  cursor: "pointer",
                }}
              >
                ✓ Sim ({selectedArticle.helpful_count})
              </button>
              <button
                onClick={() => handleFeedback(selectedArticle.id, false)}
                className="px-3 py-1 rounded text-[11px] font-bold"
                style={{
                  background: `color-mix(in srgb, var(--status-error-text) 12%, transparent)`,
                  border: `1px solid var(--status-error-border)`,
                  color: COLORS.red,
                  cursor: "pointer",
                }}
              >
                ✕ Não ({selectedArticle.unhelpful_count})
              </button>
            </div>

            {/* Versions */}
            {versions.length > 0 && (
              <div>
                <div
                  className="text-[10px] uppercase mb-2"
                  style={{ color: COLORS.muted }}
                >
                  Histórico de Versões ({versions.length})
                </div>
                <div className="space-y-1">
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between text-[11px] py-1"
                      style={{ borderBottom: `1px solid ${COLORS.border}` }}
                    >
                      <span style={{ color: COLORS.teal }}>
                        v{v.version_number}
                      </span>
                      <span style={{ color: COLORS.muted }}>
                        {v.change_summary ?? "—"}
                      </span>
                      <span style={{ color: COLORS.muted }}>
                        {v.edited_by_name}
                      </span>
                      <span style={{ color: COLORS.muted }}>
                        {formatTime(v.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create article */}
      {showArticle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowArticle(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowArticle(false);
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
                Novo Artigo
              </h2>
              <button
                onClick={() => setShowArticle(false)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="ar-t"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Título
                </label>
                <input
                  id="ar-t"
                  type="text"
                  value={aTitle}
                  onChange={(e) => setATitle(e.target.value)}
                  placeholder="Como configurar VPN"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="ar-s"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Resumo (opcional)
                </label>
                <input
                  id="ar-s"
                  type="text"
                  value={aSummary}
                  onChange={(e) => setASummary(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="ar-c"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Conteúdo
                </label>
                <textarea
                  id="ar-c"
                  value={aContent}
                  onChange={(e) => setAContent(e.target.value)}
                  rows={8}
                  placeholder="Escreva o conteúdo em markdown..."
                  className="w-full rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="ar-cat"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Categoria
                  </label>
                  <select
                    id="ar-cat"
                    value={aCategory}
                    onChange={(e) => setACategory(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="ar-fmt"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Formato
                  </label>
                  <select
                    id="ar-fmt"
                    value={aFormat}
                    onChange={(e) => setAFormat(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="ar-st"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Status
                  </label>
                  <select
                    id="ar-st"
                    value={aStatus}
                    onChange={(e) => setAStatus(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="ar-vi"
                    className="text-[11px] font-bold uppercase"
                    style={{ color: COLORS.muted }}
                  >
                    Visibilidade
                  </label>
                  <select
                    id="ar-vi"
                    value={aVisibility}
                    onChange={(e) => setAVisibility(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                    }}
                  >
                    {VISIBILITIES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="ar-tg"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Tags (vírgula)
                </label>
                <input
                  id="ar-tg"
                  type="text"
                  value={aTags}
                  onChange={(e) => setATags(e.target.value)}
                  placeholder="vpn, rede, security"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <button
                onClick={handleCreateArticle}
                disabled={!aTitle || !aContent}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !aTitle || !aContent ? "not-allowed" : "pointer",
                }}
              >
                Criar Artigo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create category */}
      {showCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-modal)" }}
          onClick={() => setShowCategory(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowCategory(false);
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="rounded-xl p-6 max-w-md w-full"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: COLORS.teal }}>
                Nova Categoria
              </h2>
              <button
                onClick={() => setShowCategory(false)}
                className="text-[16px]"
                style={{ color: COLORS.muted, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="kb-cn"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Nome
                </label>
                <input
                  id="kb-cn"
                  type="text"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="Rede"
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="kb-cd"
                  className="text-[11px] font-bold uppercase"
                  style={{ color: COLORS.muted }}
                >
                  Descrição (opcional)
                </label>
                <input
                  id="kb-cd"
                  type="text"
                  value={cDesc}
                  onChange={(e) => setCDesc(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                  }}
                />
              </div>
              <button
                onClick={handleCreateCategory}
                disabled={!cName}
                className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: COLORS.teal,
                  color: COLORS.bg,
                  cursor: !cName ? "not-allowed" : "pointer",
                }}
              >
                Criar Categoria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
