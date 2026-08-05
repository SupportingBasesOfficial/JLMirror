// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Globe, Loader2, ExternalLink } from "lucide-react";

interface StatusPageConfig {
  slug: string;
  page_title: string;
  company_name: string;
  is_published: boolean;
}

export default function StatusPageIndex() {
  const [pages, setPages] = useState<StatusPageConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/status-page/admin/config");
        if (!res.ok) {
          setError("Não foi possível carregar as páginas de status.");
          return;
        }
        const data = await res.json();
        // Config pode ser um objeto unico ou array
        if (Array.isArray(data)) {
          setPages(data);
        } else if (data?.slug) {
          setPages([data]);
        } else {
          setPages([]);
        }
      } catch {
        setError("Erro ao carregar páginas de status.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2
          className="h-6 w-6 animate-spin"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Globe className="h-10 w-10" style={{ color: "var(--text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Globe className="h-10 w-10" style={{ color: "var(--text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Nenhuma página de status configurada.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1
        className="text-xl font-bold mb-6"
        style={{ color: "var(--text-primary)" }}
      >
        Páginas de Status
      </h1>
      <div className="space-y-3">
        {pages.map((page) => (
          <Link
            key={page.slug}
            href={`/status/${page.slug}`}
            className="flex items-center justify-between rounded-lg p-4 transition-all no-underline"
            style={{
              border: "1px solid var(--border-default)",
              background: "var(--surface-1)",
            }}
          >
            <div>
              <div
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {page.page_title}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {page.company_name}
                {!page.is_published && " • Rascunho"}
              </div>
            </div>
            <ExternalLink
              className="h-4 w-4 shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
