-- === Migration: White-label Branding & Admin Delivery Control ===
-- Branding automatizado por tenant (logo, cores, nome, footer)
-- Admin controla: (a) se relatorios automaticos estao ativados, (b) meio de entrega

CREATE TABLE IF NOT EXISTS public.report_branding (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Branding visual
  company_name VARCHAR(200) NOT NULL,
  logo_url TEXT,
  logo_width INT DEFAULT 180,
  primary_color VARCHAR(7) NOT NULL DEFAULT '#0d9488',
  secondary_color VARCHAR(7) NOT NULL DEFAULT '#1f2937',
  accent_color VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
  -- Footer customizado
  footer_text TEXT,
  footer_url TEXT,
  -- Cores de fundo do cabecalho
  header_bg_color VARCHAR(7) NOT NULL DEFAULT '#ffffff',
  header_text_color VARCHAR(7) NOT NULL DEFAULT '#1f2937',
  -- Fonte
  font_family VARCHAR(100) NOT NULL DEFAULT 'Helvetica',
  -- Metadados
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id)
);

CREATE INDEX idx_report_branding_tenant ON public.report_branding(tenant_id);

-- Configuracao de entrega controlada pelo admin
CREATE TABLE IF NOT EXISTS public.report_delivery_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Admin controla se relatorios automaticos estao ativados para este tenant
  auto_reports_enabled BOOLEAN NOT NULL DEFAULT false,
  -- Meios de entrega permitidos (admin define quais o tenant pode usar)
  allowed_delivery_methods TEXT[] NOT NULL DEFAULT '{email}',
  -- Configuracoes de entrega padrao
  default_delivery_method VARCHAR(50) NOT NULL DEFAULT 'email',
  -- Config de email
  email_from VARCHAR(255),
  email_subject_prefix VARCHAR(100) DEFAULT '[Relatório]',
  -- Config de Slack
  slack_webhook_url TEXT,
  -- Config de Teams
  teams_webhook_url TEXT,
  -- Config de webhook generico
  webhook_url TEXT,
  webhook_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Limite de relatorios por mes (0 = ilimitado)
  monthly_report_limit INT NOT NULL DEFAULT 0,
  -- Metadados
  configured_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id)
);

CREATE INDEX idx_report_delivery_config_tenant ON public.report_delivery_config(tenant_id);

-- RLS
ALTER TABLE public.report_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_delivery_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_branding_tenant_isolation ON public.report_branding
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY report_branding_global_admin ON public.report_branding
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY report_delivery_config_tenant_isolation ON public.report_delivery_config
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY report_delivery_config_global_admin ON public.report_delivery_config
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_branding TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_branding TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_delivery_config TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_delivery_config TO app_runtime;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_report_branding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_report_branding_updated_at
  BEFORE UPDATE ON public.report_branding
  FOR EACH ROW EXECUTE FUNCTION public.set_report_branding_updated_at();

CREATE TRIGGER trg_report_delivery_config_updated_at
  BEFORE UPDATE ON public.report_delivery_config
  FOR EACH ROW EXECUTE FUNCTION public.set_report_branding_updated_at();
