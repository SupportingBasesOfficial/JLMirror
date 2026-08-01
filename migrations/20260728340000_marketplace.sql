-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: Marketplace de Integracoes ===
-- Catalogo de integracoes instalaveis por tenant

CREATE TABLE IF NOT EXISTS public.marketplace_apps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Identificacao global (nao tenant-specific)
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  -- Categoria
  category VARCHAR(50) NOT NULL CHECK (category IN ('monitoring', 'itsm', 'chatops', 'notification', 'reporting', 'security', 'cloud', 'network', 'other')),
  -- Tipo de integracao
  integration_type VARCHAR(30) NOT NULL CHECK (integration_type IN ('webhook', 'api', 'oauth2', 'agent', 'plugin')),
  -- Logo e branding
  logo_url TEXT,
  vendor VARCHAR(200),
  vendor_url TEXT,
  -- Configuracao
  config_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Documentacao
  docs_url TEXT,
  setup_guide TEXT,
  -- Status do app no marketplace
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'beta', 'deprecated', 'pending')),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  -- Metadados
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  installs_count INT NOT NULL DEFAULT 0,
  rating DECIMAL(2, 1) NOT NULL DEFAULT 0.0 CHECK (rating >= 0 AND rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_marketplace_apps_category ON public.marketplace_apps(category);
CREATE INDEX idx_marketplace_apps_status ON public.marketplace_apps(status);
CREATE INDEX idx_marketplace_apps_featured ON public.marketplace_apps(is_featured);

-- Instalacoes por tenant
CREATE TABLE IF NOT EXISTS public.marketplace_installs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES public.marketplace_apps(id) ON DELETE CASCADE,
  -- Configuracao especifica do tenant
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Credenciais (criptografadas em runtime)
  credentials_encrypted JSONB DEFAULT '{}'::jsonb,
  -- Status da instalacao
  status VARCHAR(20) NOT NULL DEFAULT 'installed' CHECK (status IN ('installed', 'configured', 'active', 'disabled', 'error')),
  error_message TEXT,
  -- Metadados
  installed_by UUID REFERENCES public.users(id),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  configured_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, app_id)
);

CREATE INDEX idx_marketplace_installs_tenant ON public.marketplace_installs(tenant_id);
CREATE INDEX idx_marketplace_installs_app ON public.marketplace_installs(app_id);
CREATE INDEX idx_marketplace_installs_status ON public.marketplace_installs(status);

-- RLS — marketplace_apps é global (leitura para todos os tenants)
ALTER TABLE public.marketplace_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_installs ENABLE ROW LEVEL SECURITY;

-- Apps do marketplace: todos tenants podem ler, apenas global_admin pode escrever
CREATE POLICY marketplace_apps_read_all ON public.marketplace_apps
  FOR SELECT USING (true);
CREATE POLICY marketplace_apps_write_admin ON public.marketplace_apps
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Instalacoes: isoladas por tenant
CREATE POLICY marketplace_installs_tenant_isolation ON public.marketplace_installs
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY marketplace_installs_global_admin ON public.marketplace_installs
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT ON public.marketplace_apps TO app_login;
GRANT SELECT ON public.marketplace_apps TO app_runtime;
GRANT INSERT, UPDATE, DELETE ON public.marketplace_apps TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_installs TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_installs TO app_runtime;

-- Triggers de updated_at
CREATE OR REPLACE FUNCTION public.set_marketplace_apps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_marketplace_apps_updated_at
  BEFORE UPDATE ON public.marketplace_apps
  FOR EACH ROW EXECUTE FUNCTION public.set_marketplace_apps_updated_at();

CREATE OR REPLACE FUNCTION public.set_marketplace_installs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_marketplace_installs_updated_at
  BEFORE UPDATE ON public.marketplace_installs
  FOR EACH ROW EXECUTE FUNCTION public.set_marketplace_installs_updated_at();

-- Seed: apps iniciais do marketplace
INSERT INTO public.marketplace_apps (slug, name, description, category, integration_type, vendor, config_schema, default_config, status, is_featured) VALUES
  ('zabbix', 'Zabbix', 'Integração nativa com Zabbix Monitoring', 'monitoring', 'api', 'Zabbix SIA',
    '{"url": "string", "api_token": "string"}'::jsonb, '{}'::jsonb, 'active', true),
  ('slack', 'Slack', 'Envio de notificações e comandos via Slack', 'chatops', 'webhook', 'Salesforce',
    '{"webhook_url": "string", "channel": "string"}'::jsonb, '{}'::jsonb, 'active', true),
  ('teams', 'Microsoft Teams', 'Notificações via Microsoft Teams', 'chatops', 'webhook', 'Microsoft',
    '{"webhook_url": "string"}'::jsonb, '{}'::jsonb, 'active', true),
  ('jira', 'Jira', 'Sincronização de tickets com Jira', 'itsm', 'api', 'Atlassian',
    '{"base_url": "string", "api_token": "string", "project_key": "string"}'::jsonb, '{}'::jsonb, 'active', true),
  ('freshservice', 'FreshService', 'Integração com FreshService ITSM', 'itsm', 'api', 'Freshworks',
    '{"base_url": "string", "api_key": "string"}'::jsonb, '{}'::jsonb, 'active', false),
  ('servicenow', 'ServiceNow', 'Sincronização com ServiceNow', 'itsm', 'api', 'ServiceNow',
    '{"base_url": "string", "username": "string", "password": "string"}'::jsonb, '{}'::jsonb, 'active', false),
  ('pagerduty', 'PagerDuty', 'Escalonamento de alertas via PagerDuty', 'notification', 'api', 'PagerDuty',
    '{"integration_key": "string"}'::jsonb, '{}'::jsonb, 'active', true),
  ('telegram', 'Telegram Bot', 'Notificações via Telegram Bot', 'notification', 'api', 'Telegram',
    '{"bot_token": "string", "chat_id": "string"}'::jsonb, '{}'::jsonb, 'active', false),
  ('discord', 'Discord Webhook', 'Notificações via Discord Webhook', 'notification', 'webhook', 'Discord',
    '{"webhook_url": "string"}'::jsonb, '{}'::jsonb, 'active', false),
  ('grafana', 'Grafana', 'Dashboards e visualização de métricas', 'monitoring', 'api', 'Grafana Labs',
    '{"url": "string", "api_token": "string"}'::jsonb, '{}'::jsonb, 'beta', false)
ON CONFLICT (slug) DO NOTHING;
