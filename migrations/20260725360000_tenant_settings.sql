-- Migration: Tenant Settings — branding, integrações, SMTP, limites

CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Branding
  company_name TEXT,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#1BA898',
  secondary_color TEXT NOT NULL DEFAULT '#35D0C4',
  custom_css TEXT,
  login_message TEXT,
  -- Integrações
  smtp_enabled BOOLEAN NOT NULL DEFAULT false,
  smtp_host TEXT,
  smtp_port INT,
  smtp_username TEXT,
  smtp_password_encrypted TEXT,
  smtp_from_email TEXT,
  smtp_from_name TEXT,
  smtp_use_tls BOOLEAN NOT NULL DEFAULT true,
  smtp_use_ssl BOOLEAN NOT NULL DEFAULT false,
  slack_webhook_url TEXT,
  slack_enabled BOOLEAN NOT NULL DEFAULT false,
  discord_webhook_url TEXT,
  discord_enabled BOOLEAN NOT NULL DEFAULT false,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  telegram_enabled BOOLEAN NOT NULL DEFAULT false,
  -- Limites
  max_devices INT NOT NULL DEFAULT 100,
  max_users INT NOT NULL DEFAULT 50,
  max_api_keys INT NOT NULL DEFAULT 20,
  max_webhooks INT NOT NULL DEFAULT 10,
  max_scheduled_tasks INT NOT NULL DEFAULT 25,
  max_storage_mb INT NOT NULL DEFAULT 10240,
  max_retention_days INT NOT NULL DEFAULT 90,
  -- Features
  enable_monitoring BOOLEAN NOT NULL DEFAULT true,
  enable_alerts BOOLEAN NOT NULL DEFAULT true,
  enable_tickets BOOLEAN NOT NULL DEFAULT true,
  enable_kb BOOLEAN NOT NULL DEFAULT true,
  enable_reports BOOLEAN NOT NULL DEFAULT true,
  enable_api_access BOOLEAN NOT NULL DEFAULT true,
  -- Segurança
  password_min_length INT NOT NULL DEFAULT 12,
  password_require_uppercase BOOLEAN NOT NULL DEFAULT true,
  password_require_lowercase BOOLEAN NOT NULL DEFAULT true,
  password_require_numbers BOOLEAN NOT NULL DEFAULT true,
  password_require_symbols BOOLEAN NOT NULL DEFAULT true,
  session_timeout_minutes INT NOT NULL DEFAULT 60,
  max_login_attempts INT NOT NULL DEFAULT 5,
  lockout_duration_minutes INT NOT NULL DEFAULT 30,
  require_mfa BOOLEAN NOT NULL DEFAULT false,
  ip_whitelist JSONB DEFAULT '[]'::jsonb,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id)
);

CREATE INDEX idx_tenant_settings_tenant ON public.tenant_settings (tenant_id);

-- RLS
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_settings_isolation ON public.tenant_settings
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_settings_global_admin ON public.tenant_settings
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO app_runtime;

CREATE TRIGGER set_updated_at_tenant_settings BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
