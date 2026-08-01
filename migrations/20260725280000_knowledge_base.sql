-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Knowledge Base — categorias, artigos, versionamento, tags

CREATE TABLE IF NOT EXISTS public.kb_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL,
  parent_id UUID REFERENCES public.kb_categories(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_kb_categories_tenant ON public.kb_categories (tenant_id, is_active);
CREATE INDEX idx_kb_categories_parent ON public.kb_categories (parent_id);

-- Artigos
CREATE TABLE IF NOT EXISTS public.kb_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.kb_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  summary TEXT,
  content TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'markdown' CHECK (content_format IN ('markdown','html','plaintext')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('public','internal','private')),
  author_id UUID REFERENCES public.users(id),
  author_name TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  view_count INT NOT NULL DEFAULT 0,
  helpful_count INT NOT NULL DEFAULT 0,
  unhelpful_count INT NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  current_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_kb_articles_tenant ON public.kb_articles (tenant_id, created_at DESC);
CREATE INDEX idx_kb_articles_status ON public.kb_articles (status, visibility);
CREATE INDEX idx_kb_articles_category ON public.kb_articles (category_id);
CREATE INDEX idx_kb_articles_search ON public.kb_articles USING gin(to_tsvector('english', title || ' ' || coalesce(summary, '') || ' ' || content));
CREATE INDEX idx_kb_articles_tags ON public.kb_articles USING gin(tags);

-- Versionamento
CREATE TABLE IF NOT EXISTS public.kb_article_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.kb_articles(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  edited_by UUID REFERENCES public.users(id),
  edited_by_name TEXT NOT NULL,
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(article_id, version_number)
);

CREATE INDEX idx_kb_article_versions_article ON public.kb_article_versions (article_id, version_number DESC);

-- RLS
ALTER TABLE public.kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_article_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY kb_categories_tenant_isolation ON public.kb_categories
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY kb_categories_global_admin ON public.kb_categories
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY kb_articles_tenant_isolation ON public.kb_articles
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY kb_articles_global_admin ON public.kb_articles
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY kb_article_versions_tenant_isolation ON public.kb_article_versions
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY kb_article_versions_global_admin ON public.kb_article_versions
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_categories TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_categories TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_articles TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_articles TO app_runtime;
GRANT SELECT, INSERT ON public.kb_article_versions TO app_login;
GRANT SELECT, INSERT ON public.kb_article_versions TO app_runtime;

-- Triggers
CREATE TRIGGER set_updated_at_kb_categories BEFORE UPDATE ON public.kb_categories
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER set_updated_at_kb_articles BEFORE UPDATE ON public.kb_articles
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Funcao para gerar slug
CREATE OR REPLACE FUNCTION public.generate_kb_slug(p_tenant_id UUID, p_title TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_base_slug TEXT;
  v_slug TEXT;
  v_count INT := 0;
BEGIN
  v_base_slug := lower(regexp_replace(p_title, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN v_base_slug := 'article'; END IF;

  v_slug := v_base_slug;
  LOOP
    SELECT COUNT(*) INTO v_count FROM public.kb_articles WHERE tenant_id = p_tenant_id AND slug = v_slug;
    IF v_count = 0 THEN EXIT; END IF;
    v_slug := v_base_slug || '-' || (v_count + 1)::TEXT;
  END LOOP;

  RETURN v_slug;
END;
$$;
