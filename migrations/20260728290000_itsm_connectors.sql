-- === Migration: ITSM Connector Framework ===
-- Framework agnostico de connector para ITSM externo (Jira, FreshService, ServiceNow, etc)
-- Mapeamento de campos customizavel por tenant

CREATE TABLE IF NOT EXISTS public.itsm_connectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Identificacao
  name VARCHAR(200) NOT NULL,
  connector_type VARCHAR(50) NOT NULL CHECK (connector_type IN ('jira', 'freshservice', 'servicenow', 'zendesk', 'custom')),
  -- Configuracao de conexao
  base_url TEXT NOT NULL,
  auth_type VARCHAR(20) NOT NULL DEFAULT 'api_key' CHECK (auth_type IN ('api_key', 'basic', 'bearer', 'oauth2')),
  -- Credenciais (criptografadas em runtime)
  api_key_encrypted TEXT,
  username VARCHAR(200),
  password_encrypted TEXT,
  bearer_token_encrypted TEXT,
  oauth_client_id VARCHAR(200),
  oauth_client_secret_encrypted TEXT,
  oauth_token_url TEXT,
  -- Mapeamento de campos (JLMIRROR field -> ITSM field)
  field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Configuracao de sincronizacao
  sync_direction VARCHAR(20) NOT NULL DEFAULT 'outbound' CHECK (sync_direction IN ('outbound', 'bidirectional')),
  auto_create_on_incident BOOLEAN NOT NULL DEFAULT false,
  auto_update_on_resolve BOOLEAN NOT NULL DEFAULT false,
  -- Metadados
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(20),
  last_sync_error TEXT,
  configured_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_itsm_connectors_tenant ON public.itsm_connectors(tenant_id);
CREATE INDEX idx_itsm_connectors_type ON public.itsm_connectors(connector_type);

-- Log de sincronizacao
CREATE TABLE IF NOT EXISTS public.itsm_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES public.itsm_connectors(id) ON DELETE CASCADE,
  -- Origem
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('incident', 'alert', 'manual')),
  source_id UUID,
  -- Operacao
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'close', 'comment')),
  -- Dados enviados/recebidos
  external_ticket_id VARCHAR(200),
  external_ticket_url TEXT,
  request_payload JSONB,
  response_payload JSONB,
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error_message TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_itsm_sync_log_tenant ON public.itsm_sync_log(tenant_id);
CREATE INDEX idx_itsm_sync_log_connector ON public.itsm_sync_log(connector_id);
CREATE INDEX idx_itsm_sync_log_created ON public.itsm_sync_log(created_at DESC);

-- RLS
ALTER TABLE public.itsm_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itsm_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY itsm_connectors_tenant_isolation ON public.itsm_connectors
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY itsm_connectors_global_admin ON public.itsm_connectors
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY itsm_sync_log_tenant_isolation ON public.itsm_sync_log
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY itsm_sync_log_global_admin ON public.itsm_sync_log
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.itsm_connectors TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itsm_connectors TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itsm_sync_log TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itsm_sync_log TO app_runtime;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_itsm_connectors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_itsm_connectors_updated_at
  BEFORE UPDATE ON public.itsm_connectors
  FOR EACH ROW EXECUTE FUNCTION public.set_itsm_connectors_updated_at();
