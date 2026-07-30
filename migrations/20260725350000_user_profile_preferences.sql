-- Migration: User Profile & Preferences — perfil, preferências, sessões

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  display_name TEXT,
  bio TEXT,
  phone TEXT,
  location TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  avatar_url TEXT,
  avatar_initials TEXT,
  avatar_color TEXT DEFAULT '#1BA898',
  job_title TEXT,
  department TEXT,
  skills JSONB DEFAULT '[]'::jsonb,
  social_links JSONB DEFAULT '{}'::jsonb,
  notification_email BOOLEAN NOT NULL DEFAULT true,
  notification_push BOOLEAN NOT NULL DEFAULT true,
  notification_sms BOOLEAN NOT NULL DEFAULT false,
  notification_digest_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (notification_digest_frequency IN ('instant','hourly','daily','weekly','never')),
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light','auto')),
  density TEXT NOT NULL DEFAULT 'comfortable' CHECK (density IN ('compact','comfortable','spacious')),
  sidebar_collapsed BOOLEAN NOT NULL DEFAULT false,
  dashboard_layout JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_user_profiles_user ON public.user_profiles (user_id);
CREATE INDEX idx_user_profiles_tenant ON public.user_profiles (tenant_id);

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  session_token_hash TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'web' CHECK (device_type IN ('web','mobile','desktop','api')),
  device_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_activity TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_user_sessions_user ON public.user_sessions (user_id, is_active);
CREATE INDEX idx_user_sessions_token ON public.user_sessions (session_token_hash);

CREATE TABLE IF NOT EXISTS public.user_security_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('login','logout','password_change','mfa_enable','mfa_disable','token_refresh','session_revoked','password_reset_request','password_reset_complete','email_change','profile_update','avatar_change','preferences_update')),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_user_security_log_user ON public.user_security_log (user_id, created_at DESC);
CREATE INDEX idx_user_security_log_type ON public.user_security_log (event_type, created_at DESC);

-- RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_tenant_isolation ON public.user_profiles
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY user_profiles_global_admin ON public.user_profiles
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY user_sessions_tenant_isolation ON public.user_sessions
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY user_sessions_global_admin ON public.user_sessions
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY user_security_log_tenant_isolation ON public.user_security_log
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY user_security_log_global_admin ON public.user_security_log
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO app_runtime;
GRANT SELECT, INSERT ON public.user_security_log TO app_login;
GRANT SELECT, INSERT ON public.user_security_log TO app_runtime;

-- Triggers
CREATE TRIGGER set_updated_at_user_profiles BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
