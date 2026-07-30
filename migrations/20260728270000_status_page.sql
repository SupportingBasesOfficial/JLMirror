-- === Migration: Public Status Page ===
-- Pagina de status publica (sem auth) por tenant
-- Acessivel via /status/<slug> — mostra servicos, incidentes e manutencao

CREATE TABLE IF NOT EXISTS public.status_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Slug unico para URL publica (ex: /status/jl-informatica)
  slug VARCHAR(100) NOT NULL UNIQUE,
  -- Branding da pagina de status
  page_title VARCHAR(200) NOT NULL DEFAULT 'Status do Sistema',
  company_name VARCHAR(200) NOT NULL,
  logo_url TEXT,
  primary_color VARCHAR(7) NOT NULL DEFAULT '#0d9488',
  -- Configuracao
  show_uptime BOOLEAN NOT NULL DEFAULT true,
  show_incident_history BOOLEAN NOT NULL DEFAULT true,
  show_sla_percentage BOOLEAN NOT NULL DEFAULT false,
  days_of_history INT NOT NULL DEFAULT 90,
  -- Contato de suporte
  support_email VARCHAR(255),
  support_url TEXT,
  -- Metadados
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id)
);

CREATE INDEX idx_status_pages_slug ON public.status_pages(slug);
CREATE INDEX idx_status_pages_tenant ON public.status_pages(tenant_id);

-- RLS — status pages sao publicas quando publicadas, mas so admin pode editar
ALTER TABLE public.status_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY status_pages_tenant_isolation ON public.status_pages
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY status_pages_global_admin ON public.status_pages
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));
-- Leitura publica quando publicada (via app_runtime com SET LOCAL)
CREATE POLICY status_pages_public_read ON public.status_pages
  FOR SELECT USING (is_published = true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.status_pages TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.status_pages TO app_runtime;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_status_pages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_status_pages_updated_at
  BEFORE UPDATE ON public.status_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_status_pages_updated_at();
