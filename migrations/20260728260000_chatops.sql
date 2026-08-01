-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: ChatOps Integrado ===
-- Comandos via Slack/Teams slash commands executam operacoes no JLMIRROR
-- Ex: /jlmirror status, /jlmirror ack <eventid>, /jlmirror resolve <eventid>

CREATE TABLE IF NOT EXISTS public.chatops_commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Origem do comando
  source VARCHAR(20) NOT NULL CHECK (source IN ('slack', 'teams', 'web')),
  -- Usuario que executou no chat
  chat_user_id VARCHAR(200),
  chat_user_name VARCHAR(200),
  chat_channel_id VARCHAR(200),
  chat_channel_name VARCHAR(200),
  -- Comando
  command VARCHAR(50) NOT NULL,
  arguments TEXT,
  -- Resposta
  response_text TEXT,
  response_blocks JSONB,
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'executed' CHECK (status IN ('executed', 'failed', 'pending')),
  error_message TEXT,
  -- Metadados
  response_time_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_chatops_commands_tenant ON public.chatops_commands(tenant_id);
CREATE INDEX idx_chatops_commands_created ON public.chatops_commands(created_at DESC);
CREATE INDEX idx_chatops_commands_source ON public.chatops_commands(source);

-- Configuracao de integracao ChatOps por tenant
CREATE TABLE IF NOT EXISTS public.chatops_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Plataforma
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('slack', 'teams')),
  -- Slack: verification token e signing secret
  slack_verification_token VARCHAR(200),
  slack_signing_secret VARCHAR(200),
  slack_bot_token VARCHAR(200),
  -- Teams: app id e secret
  teams_app_id VARCHAR(200),
  teams_app_password VARCHAR(200),
  -- Comandos habilitados
  enabled_commands TEXT[] NOT NULL DEFAULT '{status,ack,resolve,incidents,services,silence}',
  -- Metadados
  is_active BOOLEAN NOT NULL DEFAULT true,
  configured_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, platform)
);

CREATE INDEX idx_chatops_config_tenant ON public.chatops_config(tenant_id);

-- RLS
ALTER TABLE public.chatops_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatops_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY chatops_commands_tenant_isolation ON public.chatops_commands
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY chatops_commands_global_admin ON public.chatops_commands
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY chatops_config_tenant_isolation ON public.chatops_config
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY chatops_config_global_admin ON public.chatops_config
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatops_commands TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatops_commands TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatops_config TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatops_config TO app_runtime;

-- Trigger de updated_at para config
CREATE OR REPLACE FUNCTION public.set_chatops_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chatops_config_updated_at
  BEFORE UPDATE ON public.chatops_config
  FOR EACH ROW EXECUTE FUNCTION public.set_chatops_config_updated_at();
