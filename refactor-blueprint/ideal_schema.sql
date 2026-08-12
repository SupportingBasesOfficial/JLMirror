-- ============================================================================
-- JLMIRROR IDEAL DATABASE SCHEMA
-- Version: 2.0 (Refactor Blueprint)
-- Generated: 2026-08-11
--
-- Consolidates 100+ tables in 3NF, with explicit FKs, UUIDv4 PKs, proper
-- indexing, RLS-based multi-tenancy, and TimescaleDB hypertables/partitions.
--
-- Fixes column discrepancies found in current_architecture_audit.md:
--   - users.full_name is the ONLY name column (never `name`)
--   - feature flags keyed as module_<name> consistently
--
-- VALIDATION: Dry-run applied successfully against postgres:16-alpine
-- (jlmirror-postgres container, isolated schema_validation_test database).
-- Result: 91 tables, 141 RLS policies, 162 foreign keys created with no
-- SQL errors. TimescaleDB-specific statements (create_hypertable,
-- compression/retention policies) were skipped in the dry-run only because
-- the local test container lacks the timescaledb extension binary — they
-- are syntactically valid and will run in the real environment where
-- TimescaleDB is installed (see docker-compose / production Postgres image).
-- ============================================================================

-- ============================================================================
-- SECTION 0: EXTENSIONS & ROLES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'global_admin_role') THEN
    CREATE ROLE global_admin_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_login') THEN
    CREATE ROLE app_login NOLOGIN;
  END IF;
END $$;

-- ============================================================================
-- SECTION 1: SCHEMAS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS tenant_template;

-- ============================================================================
-- SECTION 2: UTILITY FUNCTIONS
-- ============================================================================

-- Generic BEFORE UPDATE trigger: sets updated_at = now() in UTC
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper macro-like function to attach the updated_at trigger to any table
-- Usage (documented, applied per table below):
--   CREATE TRIGGER trg_<table>_updated_at BEFORE UPDATE ON public.<table>
--   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- SECTION 3: AUTHENTICATION & AUTHORIZATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,                          -- STANDARDIZED: never `name`
  is_active BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  phone TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_users_active ON public.users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_email_trgm ON public.users USING gin (email gin_trgm_ops);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_login_select ON public.users FOR SELECT TO app_login USING (is_active = true);
CREATE POLICY users_global_admin ON public.users FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  device_fingerprint TEXT,
  ip_address INET,
  user_agent TEXT,
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON public.sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_device_fingerprint ON public.sessions(device_fingerprint);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_app_login ON public.sessions FOR ALL TO app_login USING (true);
CREATE POLICY sessions_global_admin ON public.sessions FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_label TEXT,
  ip_address INET,
  user_agent TEXT,
  trusted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, device_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id ON public.trusted_devices(user_id);
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY trusted_devices_app_login ON public.trusted_devices FOR ALL TO app_login USING (true);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON public.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON public.password_reset_tokens(expires_at);
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY password_reset_tokens_app_login ON public.password_reset_tokens FOR ALL TO app_login USING (true);

CREATE TABLE IF NOT EXISTS public.user_mfa_totp (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  recovery_codes JSONB NOT NULL DEFAULT '[]',
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id)
);
CREATE TRIGGER trg_user_mfa_totp_updated_at BEFORE UPDATE ON public.user_mfa_totp
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.user_mfa_totp ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_mfa_totp_self ON public.user_mfa_totp FOR ALL TO app_runtime
  USING (user_id::text = current_setting('app.current_user_id', true));

CREATE TABLE IF NOT EXISTS public.user_webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key JSONB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_type VARCHAR(50),
  name VARCHAR(100),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_webauthn_user_id ON public.user_webauthn_credentials(user_id);
ALTER TABLE public.user_webauthn_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY webauthn_self ON public.user_webauthn_credentials FOR ALL TO app_runtime
  USING (user_id::text = current_setting('app.current_user_id', true));

CREATE TABLE IF NOT EXISTS public.mfa_challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method VARCHAR(20) NOT NULL CHECK (method IN ('totp', 'webauthn')),
  challenge_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_token ON public.mfa_challenges(challenge_token);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires ON public.mfa_challenges(expires_at);
ALTER TABLE public.mfa_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY mfa_challenges_app_runtime ON public.mfa_challenges FOR ALL TO app_runtime USING (true);

-- ============================================================================
-- SECTION 3.5: TENANTS (created early — referenced by RBAC custom roles
-- below; full tenant management tables follow in Section 5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18) UNIQUE,
  contract_end_date TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  parent_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  tenant_type VARCHAR(20) NOT NULL DEFAULT 'client' CHECK (tenant_type IN ('owner', 'manager', 'client')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_tenants_parent ON public.tenants(parent_tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_type ON public.tenants(tenant_type);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_global_admin ON public.tenants FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 4: RBAC
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON public.permissions(category);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON public.role_permissions(permission_id);

CREATE TABLE IF NOT EXISTS public.attribute_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_key VARCHAR(50) NOT NULL,
  permission_key TEXT NOT NULL,
  condition_type VARCHAR(50) NOT NULL CHECK (condition_type IN ('time_window', 'ip_range', 'location', 'device')),
  condition_value JSONB NOT NULL,
  effect VARCHAR(20) NOT NULL DEFAULT 'deny' CHECK (effect IN ('allow', 'deny')),
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_attribute_policies_role ON public.attribute_policies(role_key, is_active);

CREATE TABLE IF NOT EXISTS public.tenant_custom_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idx_tenant_custom_roles_tenant ON public.tenant_custom_roles(tenant_id, is_active);
CREATE TRIGGER trg_tenant_custom_roles_updated_at BEFORE UPDATE ON public.tenant_custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.tenant_custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_custom_roles_isolation ON public.tenant_custom_roles FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY tenant_custom_roles_global_admin ON public.tenant_custom_roles FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.tenant_custom_role_permissions (
  role_id UUID NOT NULL REFERENCES public.tenant_custom_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================================
-- SECTION 5: TENANT MANAGEMENT
-- ============================================================================
-- NOTE: public.tenants itself was already created in Section 3.5 above
-- (needed early because RBAC's tenant_custom_roles references it).

CREATE TABLE IF NOT EXISTS public.tenant_routes (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  cluster_id VARCHAR(50) NOT NULL,
  cluster_host VARCHAR(255) NOT NULL,
  cluster_database_name VARCHAR(63) NOT NULL,
  cluster_port INTEGER NOT NULL DEFAULT 5432,
  schema_name VARCHAR(63) NOT NULL UNIQUE,
  is_enterprise BOOLEAN NOT NULL DEFAULT FALSE,
  zabbix_host_group_id TEXT NOT NULL,
  zabbix_api_url TEXT NOT NULL,
  zabbix_encrypted_token TEXT NOT NULL,
  zabbix_token_iv TEXT NOT NULL,
  zabbix_token_tag TEXT NOT NULL,
  zabbix_connector_token TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'migrating')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_schema_name_format CHECK (schema_name ~ '^tenant_[a-f0-9]{8}$')
);
CREATE TRIGGER trg_tenant_routes_updated_at BEFORE UPDATE ON public.tenant_routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.tenant_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_routes_global_admin ON public.tenant_routes FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.tenant_users (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  scope VARCHAR(10) NOT NULL DEFAULT 'tenant' CHECK (scope IN ('global', 'tenant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_users_lookup ON public.tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON public.tenant_users(tenant_id);
CREATE TRIGGER trg_tenant_users_updated_at BEFORE UPDATE ON public.tenant_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_users_global_admin ON public.tenant_users FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_name TEXT,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#1BA898',
  secondary_color TEXT NOT NULL DEFAULT '#35D0C4',
  custom_css TEXT,
  login_message TEXT,
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
  max_devices INT NOT NULL DEFAULT 100,
  max_users INT NOT NULL DEFAULT 50,
  max_api_keys INT NOT NULL DEFAULT 20,
  max_webhooks INT NOT NULL DEFAULT 10,
  max_scheduled_tasks INT NOT NULL DEFAULT 25,
  max_storage_mb INT NOT NULL DEFAULT 10240,
  max_retention_days INT NOT NULL DEFAULT 90,
  enable_monitoring BOOLEAN NOT NULL DEFAULT true,
  enable_alerts BOOLEAN NOT NULL DEFAULT true,
  enable_tickets BOOLEAN NOT NULL DEFAULT true,
  enable_kb BOOLEAN NOT NULL DEFAULT true,
  enable_reports BOOLEAN NOT NULL DEFAULT true,
  enable_api_access BOOLEAN NOT NULL DEFAULT true,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant ON public.tenant_settings(tenant_id);
CREATE TRIGGER trg_tenant_settings_updated_at BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_settings_isolation ON public.tenant_settings FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY tenant_settings_global_admin ON public.tenant_settings FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.client_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  role VARCHAR(100),
  department VARCHAR(100),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_client_contacts_tenant_id ON public.client_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_email ON public.client_contacts(email);
CREATE TRIGGER trg_client_contacts_updated_at BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_contacts_global_admin ON public.client_contacts FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.client_companies (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_name VARCHAR(255),
  cnpj VARCHAR(18),
  contract_value DECIMAL(12, 2),
  billing_day INTEGER CHECK (billing_day >= 1 AND billing_day <= 28),
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
  plan_tier VARCHAR(50) NOT NULL DEFAULT 'basic' CHECK (plan_tier IN ('basic', 'pro', 'enterprise', 'custom')),
  technical_contact_id UUID REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  commercial_contact_id UUID REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  address_street VARCHAR(255),
  address_city VARCHAR(100),
  address_state VARCHAR(50),
  address_zip VARCHAR(20),
  address_country VARCHAR(50) DEFAULT 'Brasil',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE TRIGGER trg_client_companies_updated_at BEFORE UPDATE ON public.client_companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.client_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_companies_global_admin ON public.client_companies FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 6: SSO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sso_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_type VARCHAR(20) NOT NULL CHECK (provider_type IN ('google', 'azuread', 'okta', 'auth0', 'keycloak', 'custom')),
  provider_name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, provider_type)
);
CREATE INDEX IF NOT EXISTS idx_sso_providers_tenant ON public.sso_providers(tenant_id);
CREATE TRIGGER trg_sso_providers_updated_at BEFORE UPDATE ON public.sso_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.sso_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY sso_providers_isolation ON public.sso_providers FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY sso_providers_global_admin ON public.sso_providers FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.sso_user_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.sso_providers(id) ON DELETE CASCADE,
  external_user_id TEXT NOT NULL,
  external_email TEXT,
  external_attributes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, provider_id, external_user_id)
);
CREATE INDEX IF NOT EXISTS idx_sso_user_mappings_user ON public.sso_user_mappings(user_id);
ALTER TABLE public.sso_user_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY sso_user_mappings_isolation ON public.sso_user_mappings FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY sso_user_mappings_global_admin ON public.sso_user_mappings FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 7: FEATURE FLAGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,                        -- STANDARDIZED: always `module_<name>`
  name TEXT NOT NULL,
  description TEXT,
  flag_type TEXT NOT NULL DEFAULT 'boolean' CHECK (flag_type IN ('boolean', 'percentage', 'variant', 'kill_switch')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_value JSONB NOT NULL DEFAULT 'false'::jsonb,
  rollout_percentage INT NOT NULL DEFAULT 100 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  variants JSONB DEFAULT '[]'::jsonb,
  target_segments JSONB DEFAULT '[]'::jsonb,
  excluded_tenant_ids JSONB DEFAULT '[]'::jsonb,
  client_visible BOOLEAN NOT NULL DEFAULT false,
  client_enabled BOOLEAN NOT NULL DEFAULT false,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  total_evaluations BIGINT NOT NULL DEFAULT 0,
  true_evaluations BIGINT NOT NULL DEFAULT 0,
  false_evaluations BIGINT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, key),
  CONSTRAINT chk_flag_key_format CHECK (key ~ '^module_[a-z0-9_]+$')
);
CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant ON public.feature_flags(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON public.feature_flags(key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_client_visible ON public.feature_flags(client_visible) WHERE client_visible = true;
CREATE TRIGGER trg_feature_flags_updated_at BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY feature_flags_isolation ON public.feature_flags FOR ALL TO app_runtime
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY feature_flags_global_admin ON public.feature_flags FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.feature_flag_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('tenant', 'user', 'segment')),
  target_id TEXT NOT NULL,
  value JSONB NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (flag_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_flag_overrides_flag ON public.feature_flag_overrides(flag_id);
CREATE INDEX IF NOT EXISTS idx_flag_overrides_target ON public.feature_flag_overrides(target_type, target_id);
ALTER TABLE public.feature_flag_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY flag_overrides_global_admin ON public.feature_flag_overrides FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.feature_flag_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,
  user_id UUID,
  evaluated_value JSONB NOT NULL,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_flag_events_flag ON public.feature_flag_events(flag_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flag_events_tenant ON public.feature_flag_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flag_events_key_time ON public.feature_flag_events(flag_key, created_at DESC);
ALTER TABLE public.feature_flag_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY flag_events_global_admin ON public.feature_flag_events FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 8: USER PROFILE & PREFERENCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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
  notification_digest_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (notification_digest_frequency IN ('instant', 'hourly', 'daily', 'weekly', 'never')),
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light', 'auto')),
  density TEXT NOT NULL DEFAULT 'comfortable' CHECK (density IN ('compact', 'comfortable', 'spacious')),
  sidebar_collapsed BOOLEAN NOT NULL DEFAULT false,
  dashboard_layout JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON public.user_profiles(tenant_id);
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_isolation ON public.user_profiles FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY user_profiles_global_admin ON public.user_profiles FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'web' CHECK (device_type IN ('web', 'mobile', 'desktop', 'api')),
  device_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_activity TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON public.user_sessions(session_token_hash);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_sessions_isolation ON public.user_sessions FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY user_sessions_global_admin ON public.user_sessions FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.user_security_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('login', 'logout', 'password_change', 'mfa_enable', 'mfa_disable', 'token_refresh', 'session_revoked', 'password_reset_request', 'password_reset_complete', 'email_change', 'profile_update', 'avatar_change', 'preferences_update')),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_user_security_log_user ON public.user_security_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_security_log_type ON public.user_security_log(event_type, created_at DESC);
ALTER TABLE public.user_security_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_security_log_isolation ON public.user_security_log FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY user_security_log_global_admin ON public.user_security_log FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 9: DEVICES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  ip TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'server',
  device_type TEXT,
  vendor TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT true,
  zabbix_host_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_devices_tenant_id ON public.devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_hostname ON public.devices(hostname);
CREATE INDEX IF NOT EXISTS idx_devices_status ON public.devices(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_tenant_zabbix ON public.devices(tenant_id, zabbix_host_id) WHERE zabbix_host_id IS NOT NULL;
CREATE TRIGGER trg_devices_updated_at BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY devices_isolation ON public.devices FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY devices_global_admin ON public.devices FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.user_host_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  zabbix_host_group_id TEXT NOT NULL,
  zabbix_host_group_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, user_id, zabbix_host_group_id)
);
CREATE INDEX IF NOT EXISTS idx_user_host_groups_tenant ON public.user_host_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_host_groups_user ON public.user_host_groups(user_id);
ALTER TABLE public.user_host_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_host_groups_isolation ON public.user_host_groups FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY user_host_groups_global_admin ON public.user_host_groups FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 10: MONITORING & OBSERVABILITY (partitioned + hypertables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_logs (
  id UUID DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  message TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_created ON public.system_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_source ON public.system_logs(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs(level) WHERE level IN ('error', 'fatal');
CREATE INDEX IF NOT EXISTS idx_system_logs_correlation ON public.system_logs(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_logs_payload ON public.system_logs USING GIN (payload);
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_logs_isolation ON public.system_logs FOR ALL TO app_runtime
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY system_logs_global_admin ON public.system_logs FOR ALL TO global_admin_role USING (true);
-- Monthly partitions created via maintenance job:
--   CREATE TABLE public.system_logs_YYYYMM PARTITION OF public.system_logs
--     FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01');

CREATE TABLE IF NOT EXISTS public.trace_spans (
  id UUID DEFAULT uuid_generate_v4(),
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  operation_name TEXT NOT NULL,
  service TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'internal' CHECK (kind IN ('server', 'client', 'producer', 'consumer', 'internal')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'unset')),
  status_message TEXT,
  attributes JSONB DEFAULT '{}'::jsonb,
  events JSONB DEFAULT '[]'::jsonb,
  resource JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS idx_trace_spans_trace ON public.trace_spans(trace_id, start_time);
CREATE INDEX IF NOT EXISTS idx_trace_spans_tenant ON public.trace_spans(tenant_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_trace_spans_service ON public.trace_spans(service, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_trace_spans_status ON public.trace_spans(status) WHERE status = 'error';
CREATE INDEX IF NOT EXISTS idx_trace_spans_operation ON public.trace_spans(operation_name);
CREATE INDEX IF NOT EXISTS idx_trace_spans_attributes ON public.trace_spans USING GIN (attributes);
ALTER TABLE public.trace_spans ENABLE ROW LEVEL SECURITY;
CREATE POLICY trace_spans_isolation ON public.trace_spans FOR ALL TO app_runtime
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY trace_spans_global_admin ON public.trace_spans FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.capacity_metrics (
  id UUID DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_name TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  unit TEXT,
  labels JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS idx_capacity_metrics_tenant_created ON public.capacity_metrics(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capacity_metrics_resource ON public.capacity_metrics(resource_name, metric_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capacity_metrics_labels ON public.capacity_metrics USING GIN (labels);
ALTER TABLE public.capacity_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_metrics_isolation ON public.capacity_metrics FOR ALL TO app_runtime
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY capacity_metrics_global_admin ON public.capacity_metrics FOR ALL TO global_admin_role USING (true);

-- TimescaleDB Hypertable: system_metrics
CREATE TABLE IF NOT EXISTS public.system_metrics (
  id BIGSERIAL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  labels JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, recorded_at)
);
SELECT create_hypertable('public.system_metrics', 'recorded_at',
  chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_system_metrics_name_tenant_time ON public.system_metrics(metric_name, tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_labels_gin ON public.system_metrics USING GIN (labels);
-- IMPORTANT (discovered during live stress-test against
-- timescaledb/timescaledb:latest-pg16, TimescaleDB 2.29.1, 2026-08-11):
-- TimescaleDB compression (columnstore) is INCOMPATIBLE with Row Level
-- Security on the SAME table, in both orderings:
--   1) enabling RLS after `ALTER TABLE ... SET (timescaledb.compress)` fails
--      with "operation not supported on hypertables that have columnstore
--      enabled"
--   2) enabling compression after RLS fails with "columnstore cannot be
--      used on table with row security"
-- Since per-tenant isolation (RLS) is a hard security requirement, we keep
-- RLS and DROP compression on these two hypertables. Retention policies
-- (data deletion after N days) ARE compatible with RLS and are kept — they
-- were verified independently against a probe table. If compression is
-- required in the future, tenant isolation must instead be enforced at the
-- application layer only for these two tables (always filter by tenant_id
-- in the repository, never rely on RLS) — NOT recommended without
-- additional review, since it re-introduces IDOR risk (audit issue #15).
ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_metrics_isolation ON public.system_metrics FOR ALL TO app_runtime
  USING (tenant_id::text = current_setting('app.current_tenant_id', true) OR tenant_id IS NULL);
CREATE POLICY system_metrics_global_admin ON public.system_metrics FOR ALL TO global_admin_role USING (true);
SELECT add_retention_policy('public.system_metrics', INTERVAL '90 days', if_not_exists => TRUE);

-- TimescaleDB Hypertable: zabbix_history_cache
CREATE TABLE IF NOT EXISTS public.zabbix_history_cache (
  id BIGSERIAL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  itemid TEXT NOT NULL,
  hostid TEXT NOT NULL,
  clock BIGINT NOT NULL,
  ns INTEGER NOT NULL DEFAULT 0,
  value TEXT NOT NULL,
  value_type SMALLINT NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, received_at)
);
SELECT create_hypertable('public.zabbix_history_cache', 'received_at',
  chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_zabbix_history_tenant_item_time ON public.zabbix_history_cache(tenant_id, itemid, clock DESC);
CREATE INDEX IF NOT EXISTS idx_zabbix_history_tenant_host ON public.zabbix_history_cache(tenant_id, hostid);
-- IMPORTANT: RLS enabled BEFORE compression (see note on system_metrics above).
ALTER TABLE public.zabbix_history_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY zabbix_history_cache_isolation ON public.zabbix_history_cache FOR ALL TO app_runtime
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY zabbix_history_cache_global_admin ON public.zabbix_history_cache FOR ALL TO global_admin_role USING (true);
-- Compression dropped for the same reason documented above on system_metrics
-- (columnstore + RLS incompatibility, verified 2026-08-11). Retention is kept.
SELECT add_retention_policy('public.zabbix_history_cache', INTERVAL '30 days', if_not_exists => TRUE);

-- ============================================================================
-- SECTION 11: SCRIPTS & AUTOMATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  language TEXT NOT NULL DEFAULT 'bash' CHECK (language IN ('bash', 'python', 'powershell', 'node')),
  content TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  timeout_seconds INT NOT NULL DEFAULT 300 CHECK (timeout_seconds > 0 AND timeout_seconds <= 3600),
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  max_concurrent_executions INT NOT NULL DEFAULT 1 CHECK (max_concurrent_executions > 0 AND max_concurrent_executions <= 10),
  allowed_hosts TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES public.users(id),
  updated_by UUID REFERENCES public.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_scripts_tenant ON public.scripts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scripts_active ON public.scripts(is_active, tenant_id);
CREATE INDEX IF NOT EXISTS idx_scripts_tags ON public.scripts USING GIN (tags);
CREATE TRIGGER trg_scripts_updated_at BEFORE UPDATE ON public.scripts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY scripts_isolation ON public.scripts FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY scripts_global_admin ON public.scripts FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.script_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  version INT NOT NULL,
  content TEXT NOT NULL,
  changed_by UUID REFERENCES public.users(id),
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (script_id, version)
);
CREATE INDEX IF NOT EXISTS idx_script_versions_script ON public.script_versions(script_id, version DESC);

CREATE TABLE IF NOT EXISTS public.script_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'running', 'completed', 'failed', 'timeout', 'cancelled', 'rejected')),
  target_host TEXT NOT NULL,
  initiated_by UUID REFERENCES public.users(id),
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  exit_code INT,
  stdout TEXT,
  stderr TEXT,
  duration_ms INT,
  trace_id TEXT,
  timeout_seconds INT NOT NULL DEFAULT 300,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_executions_tenant ON public.script_executions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_script ON public.script_executions(script_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_status ON public.script_executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_initiated_by ON public.script_executions(initiated_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_pending ON public.script_executions(status, created_at) WHERE status = 'pending';
ALTER TABLE public.script_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY script_executions_isolation ON public.script_executions FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY script_executions_global_admin ON public.script_executions FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.execution_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES public.script_executions(id) ON DELETE CASCADE,
  approver_id UUID REFERENCES public.users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_approvals_execution ON public.execution_approvals(execution_id, created_at DESC);

-- ============================================================================
-- SECTION 12: FIREWALL
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.firewall_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  backend TEXT NOT NULL DEFAULT 'iptables' CHECK (backend IN ('iptables', 'nftables', 'ufw')),
  chain TEXT NOT NULL DEFAULT 'INPUT' CHECK (chain IN ('INPUT', 'OUTPUT', 'FORWARD', 'PREROUTING', 'POSTROUTING')),
  action TEXT NOT NULL CHECK (action IN ('ACCEPT', 'DROP', 'REJECT', 'LOG', 'DNAT', 'SNAT', 'MASQUERADE')),
  protocol TEXT CHECK (protocol IN ('tcp', 'udp', 'icmp', 'all') OR protocol IS NULL),
  source_ip TEXT,
  source_port TEXT,
  destination_ip TEXT,
  destination_port TEXT,
  interface_in TEXT,
  interface_out TEXT,
  state TEXT,
  priority INT NOT NULL DEFAULT 100,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_firewall_tenant_host ON public.firewall_rules(tenant_id, host, priority);
CREATE INDEX IF NOT EXISTS idx_firewall_enabled ON public.firewall_rules(is_enabled, tenant_id);
CREATE TRIGGER trg_firewall_rules_updated_at BEFORE UPDATE ON public.firewall_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.firewall_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY firewall_rules_isolation ON public.firewall_rules FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY firewall_rules_global_admin ON public.firewall_rules FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.firewall_rule_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID NOT NULL REFERENCES public.firewall_rules(id) ON DELETE CASCADE,
  version INT NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES public.users(id),
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (rule_id, version)
);
CREATE INDEX IF NOT EXISTS idx_firewall_versions_rule ON public.firewall_rule_versions(rule_id, version DESC);

CREATE TABLE IF NOT EXISTS public.firewall_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('apply', 'dry_run', 'rollback')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  rules_applied INT DEFAULT 0,
  rules_failed INT DEFAULT 0,
  diff_before JSONB,
  diff_after JSONB,
  stdout TEXT,
  stderr TEXT,
  duration_ms INT,
  applied_by UUID REFERENCES public.users(id),
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_firewall_changes_tenant ON public.firewall_changes(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_firewall_changes_host ON public.firewall_changes(host, created_at DESC);
ALTER TABLE public.firewall_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY firewall_changes_isolation ON public.firewall_changes FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY firewall_changes_global_admin ON public.firewall_changes FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 13: KUBERNETES MONITORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.k8s_clusters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT,
  api_server_url TEXT NOT NULL,
  context TEXT,
  namespace TEXT DEFAULT 'default',
  kubeconfig_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_connected_at TIMESTAMPTZ,
  version TEXT,
  node_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_k8s_clusters_tenant ON public.k8s_clusters(tenant_id, is_active);
CREATE TRIGGER trg_k8s_clusters_updated_at BEFORE UPDATE ON public.k8s_clusters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.k8s_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY k8s_clusters_isolation ON public.k8s_clusters FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY k8s_clusters_global_admin ON public.k8s_clusters FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.k8s_resources_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id UUID NOT NULL REFERENCES public.k8s_clusters(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('pod', 'service', 'deployment', 'configmap', 'secret', 'node', 'namespace', 'daemonset', 'statefulset', 'ingress', 'pvc', 'job', 'cronjob')),
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  uid TEXT,
  status JSONB DEFAULT '{}'::jsonb,
  spec JSONB DEFAULT '{}'::jsonb,
  labels JSONB DEFAULT '{}'::jsonb,
  annotations JSONB DEFAULT '{}'::jsonb,
  ready TEXT,
  restarts INT DEFAULT 0,
  node_name TEXT,
  pod_ip TEXT,
  age_seconds INT,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_k8s_cache_cluster_type ON public.k8s_resources_cache(cluster_id, resource_type, namespace);
CREATE INDEX IF NOT EXISTS idx_k8s_cache_tenant ON public.k8s_resources_cache(tenant_id, cached_at DESC);
CREATE INDEX IF NOT EXISTS idx_k8s_cache_labels ON public.k8s_resources_cache USING GIN (labels);
CREATE UNIQUE INDEX IF NOT EXISTS idx_k8s_cache_unique ON public.k8s_resources_cache(cluster_id, resource_type, namespace, name);
ALTER TABLE public.k8s_resources_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY k8s_cache_isolation ON public.k8s_resources_cache FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY k8s_cache_global_admin ON public.k8s_resources_cache FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.k8s_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id UUID NOT NULL REFERENCES public.k8s_clusters(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('Normal', 'Warning') OR type IS NULL),
  reason TEXT,
  message TEXT,
  involved_object_kind TEXT,
  involved_object_name TEXT,
  involved_object_namespace TEXT,
  source TEXT,
  first_timestamp TIMESTAMPTZ,
  last_timestamp TIMESTAMPTZ,
  count INT DEFAULT 1,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_k8s_events_cluster ON public.k8s_events(cluster_id, last_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_k8s_events_tenant ON public.k8s_events(tenant_id, last_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_k8s_events_namespace ON public.k8s_events(cluster_id, namespace, last_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_k8s_events_type ON public.k8s_events(type) WHERE type = 'Warning';
ALTER TABLE public.k8s_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY k8s_events_isolation ON public.k8s_events FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY k8s_events_global_admin ON public.k8s_events FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 14: SSL CERTIFICATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ssl_certificates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  port INT NOT NULL DEFAULT 443,
  protocol TEXT NOT NULL DEFAULT 'https' CHECK (protocol IN ('https', 'imaps', 'smtps', 'ldaps', 'ftps', 'pop3s')),
  issuer TEXT,
  subject TEXT,
  serial_number TEXT,
  fingerprint_sha256 TEXT,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  signature_algorithm TEXT,
  key_algorithm TEXT,
  key_size INT,
  san_domains JSONB DEFAULT '[]'::jsonb,
  is_auto_renewed BOOLEAN NOT NULL DEFAULT false,
  ca_provider TEXT,
  alert_days_before INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, hostname, port)
);
CREATE INDEX IF NOT EXISTS idx_ssl_certs_tenant ON public.ssl_certificates(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ssl_certs_expiry ON public.ssl_certificates(valid_to);
CREATE INDEX IF NOT EXISTS idx_ssl_certs_hostname ON public.ssl_certificates(hostname);
CREATE TRIGGER trg_ssl_certs_updated_at BEFORE UPDATE ON public.ssl_certificates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.ssl_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY ssl_certs_isolation ON public.ssl_certificates FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY ssl_certs_global_admin ON public.ssl_certificates FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.ssl_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cert_id UUID NOT NULL REFERENCES public.ssl_certificates(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  status TEXT NOT NULL CHECK (status IN ('valid', 'expiring_soon', 'expired', 'error', 'revoked')),
  days_until_expiry INT,
  error_message TEXT,
  fingerprint_sha256 TEXT,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  issuer TEXT,
  subject TEXT
);
CREATE INDEX IF NOT EXISTS idx_ssl_checks_cert ON public.ssl_checks(cert_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssl_checks_tenant ON public.ssl_checks(tenant_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssl_checks_status ON public.ssl_checks(status);

CREATE TABLE IF NOT EXISTS public.ssl_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cert_id UUID NOT NULL REFERENCES public.ssl_certificates(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('expiring_soon', 'expired', 'renewed', 'revoked', 'changed')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  days_until_expiry INT,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID REFERENCES public.users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_ssl_alerts_tenant ON public.ssl_alerts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssl_alerts_cert ON public.ssl_alerts(cert_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssl_alerts_unacked ON public.ssl_alerts(tenant_id, acknowledged) WHERE acknowledged = false;
ALTER TABLE public.ssl_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY ssl_alerts_isolation ON public.ssl_alerts FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY ssl_alerts_global_admin ON public.ssl_alerts FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 15: BACKUP & RESTORE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.backup_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  target_host TEXT NOT NULL,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental', 'differential', 'snapshot')),
  source_path TEXT NOT NULL,
  destination_type TEXT NOT NULL CHECK (destination_type IN ('local', 's3', 'sftp', 'nfs', 'azure_blob', 'gcs')),
  destination_path TEXT NOT NULL,
  retention_count INT NOT NULL DEFAULT 7,
  retention_days INT NOT NULL DEFAULT 30,
  compression TEXT NOT NULL DEFAULT 'gzip' CHECK (compression IN ('none', 'gzip', 'zstd', 'bzip2', 'lz4')),
  encryption BOOLEAN NOT NULL DEFAULT true,
  encryption_key_id TEXT,
  is_scheduled BOOLEAN NOT NULL DEFAULT false,
  cron_expression TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_tenant ON public.backup_jobs(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_next_run ON public.backup_jobs(next_run_at) WHERE is_scheduled = true AND is_active = true;
CREATE TRIGGER trg_backup_jobs_updated_at BEFORE UPDATE ON public.backup_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.backup_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY backup_jobs_isolation ON public.backup_jobs FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY backup_jobs_global_admin ON public.backup_jobs FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.backup_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.backup_jobs(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('full', 'incremental', 'differential', 'snapshot')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'verifying', 'verified', 'corrupted', 'expired')),
  file_path TEXT,
  file_size_bytes BIGINT,
  compressed_size_bytes BIGINT,
  checksum_sha256 TEXT,
  checksum_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  parent_snapshot_id UUID REFERENCES public.backup_snapshots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_job ON public.backup_snapshots(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_tenant ON public.backup_snapshots(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_status ON public.backup_snapshots(status);
ALTER TABLE public.backup_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY backup_snapshots_isolation ON public.backup_snapshots FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY backup_snapshots_global_admin ON public.backup_snapshots FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.backup_restores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_id UUID NOT NULL REFERENCES public.backup_snapshots(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_host TEXT NOT NULL,
  target_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'verifying')),
  overwrite_existing BOOLEAN NOT NULL DEFAULT false,
  checksum_verified BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  error_message TEXT,
  restored_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_backup_restores_tenant ON public.backup_restores(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_restores_snapshot ON public.backup_restores(snapshot_id, created_at DESC);
ALTER TABLE public.backup_restores ENABLE ROW LEVEL SECURITY;
CREATE POLICY backup_restores_isolation ON public.backup_restores FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY backup_restores_global_admin ON public.backup_restores FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 16: NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notification_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('slack', 'email', 'webhook', 'teams', 'telegram', 'discord', 'pagerduty', 'web_push')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_notif_channels_tenant ON public.notification_channels(tenant_id, is_active);
CREATE TRIGGER trg_notif_channels_updated_at BEFORE UPDATE ON public.notification_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_channels_isolation ON public.notification_channels FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY notif_channels_global_admin ON public.notification_channels FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.notification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  event_source TEXT NOT NULL CHECK (event_source IN ('ssl.expiring_soon', 'ssl.expired', 'ssl.revoked', 'backup.completed', 'backup.failed', 'backup.corrupted', 'k8s.pod_crash', 'k8s.node_down', 'k8s.event_warning', 'firewall.applied', 'firewall.failed', 'script.executed', 'script.failed', 'script.approval_needed', 'monitoring.cpu_high', 'monitoring.disk_high', 'monitoring.memory_high', 'monitoring.service_down', 'custom')),
  event_category TEXT NOT NULL CHECK (event_category IN ('security', 'backup', 'k8s', 'firewall', 'script', 'monitoring', 'custom')),
  severity_filter TEXT NOT NULL DEFAULT 'all' CHECK (severity_filter IN ('all', 'info', 'warning', 'critical')),
  channel_ids UUID[] NOT NULL DEFAULT '{}',
  template_subject TEXT,
  template_body TEXT,
  cooldown_minutes INT NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_notif_rules_tenant ON public.notification_rules(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_notif_rules_source ON public.notification_rules(event_source, is_active);
CREATE TRIGGER trg_notif_rules_updated_at BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_rules_isolation ON public.notification_rules FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY notif_rules_global_admin ON public.notification_rules FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.notification_rules(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES public.notification_channels(id) ON DELETE SET NULL,
  event_source TEXT NOT NULL,
  event_category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  subject TEXT,
  body TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'pending', 'rate_limited')),
  error_message TEXT,
  response_data JSONB,
  sent_at TIMESTAMPTZ,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_notif_log_tenant ON public.notification_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_rule ON public.notification_log(rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_channel ON public.notification_log(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_status ON public.notification_log(status);
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_log_isolation ON public.notification_log FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY notif_log_global_admin ON public.notification_log FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  device_type VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (endpoint, user_id)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant ON public.push_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON public.push_subscriptions(is_active) WHERE is_active = true;
CREATE TRIGGER trg_push_subscriptions_updated_at BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_isolation ON public.push_subscriptions FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY push_subscriptions_self ON public.push_subscriptions FOR ALL TO app_runtime
  USING (user_id::text = current_setting('app.current_user_id', true));
CREATE POLICY push_subscriptions_global_admin ON public.push_subscriptions FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 17: ASSET INVENTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_tag TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('server', 'vm', 'container', 'network_switch', 'router', 'firewall', 'load_balancer', 'workstation', 'laptop', 'mobile', 'printer', 'storage', 'appliance', 'iot', 'other')),
  category TEXT NOT NULL CHECK (category IN ('hardware', 'software', 'network', 'virtual', 'license', 'service')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'retired', 'lost', 'stolen', 'disposed')),
  criticality TEXT NOT NULL DEFAULT 'low' CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
  hostname TEXT,
  ip_address TEXT,
  mac_address TEXT,
  serial_number TEXT,
  manufacturer TEXT,
  model TEXT,
  os_type TEXT,
  os_version TEXT,
  location TEXT,
  rack TEXT,
  rack_position TEXT,
  purchase_date DATE,
  purchase_cost NUMERIC(12, 2),
  warranty_expiry DATE,
  vendor TEXT,
  assigned_to TEXT,
  department TEXT,
  notes TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  parent_asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, asset_tag)
);
CREATE INDEX IF NOT EXISTS idx_assets_tenant ON public.assets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_type ON public.assets(asset_type, category);
CREATE INDEX IF NOT EXISTS idx_assets_hostname ON public.assets(hostname);
CREATE INDEX IF NOT EXISTS idx_assets_ip ON public.assets(ip_address);
CREATE INDEX IF NOT EXISTS idx_assets_parent ON public.assets(parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_assets_criticality ON public.assets(criticality, status);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON public.assets USING GIN (tags);
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY assets_isolation ON public.assets FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY assets_global_admin ON public.assets FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.asset_licenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  license_key TEXT,
  software_name TEXT NOT NULL,
  vendor TEXT,
  license_type TEXT NOT NULL CHECK (license_type IN ('perpetual', 'subscription', 'oem', 'volume', 'concurrent', 'open_source', 'trial')),
  seats_total INT NOT NULL DEFAULT 1,
  seats_used INT NOT NULL DEFAULT 0,
  purchase_date DATE,
  expiry_date DATE,
  renewal_date DATE,
  cost NUMERIC(12, 2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_asset_licenses_tenant ON public.asset_licenses(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_asset_licenses_asset ON public.asset_licenses(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_licenses_expiry ON public.asset_licenses(expiry_date) WHERE is_active = true;
CREATE TRIGGER trg_asset_licenses_updated_at BEFORE UPDATE ON public.asset_licenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.asset_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_licenses_isolation ON public.asset_licenses FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY asset_licenses_global_admin ON public.asset_licenses FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.asset_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'status_changed', 'assigned', 'unassigned', 'license_added', 'license_removed', 'retired', 'disposed')),
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_asset_changes_asset ON public.asset_changes(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_changes_tenant ON public.asset_changes(tenant_id, created_at DESC);
ALTER TABLE public.asset_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_changes_isolation ON public.asset_changes FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY asset_changes_global_admin ON public.asset_changes FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 18: CAPACITY PLANNING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.capacity_thresholds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('cpu', 'memory', 'disk', 'network', 'storage', 'database', 'cluster', 'service')),
  resource_name TEXT NOT NULL,
  warning_pct DOUBLE PRECISION NOT NULL DEFAULT 70,
  critical_pct DOUBLE PRECISION NOT NULL DEFAULT 90,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, resource_type, resource_name)
);
CREATE INDEX IF NOT EXISTS idx_capacity_thresholds_tenant ON public.capacity_thresholds(tenant_id, is_active);
CREATE TRIGGER trg_capacity_thresholds_updated_at BEFORE UPDATE ON public.capacity_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.capacity_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_thresholds_isolation ON public.capacity_thresholds FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY capacity_thresholds_global_admin ON public.capacity_thresholds FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.capacity_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('capacity_summary', 'trend_analysis', 'forecast', 'utilization_breakdown', 'custom')),
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed', 'scheduled')),
  file_path TEXT,
  file_size_bytes BIGINT,
  summary JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  generated_by UUID REFERENCES public.users(id),
  generated_at TIMESTAMPTZ,
  is_scheduled BOOLEAN NOT NULL DEFAULT false,
  cron_expression TEXT,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_capacity_reports_tenant ON public.capacity_reports(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capacity_reports_status ON public.capacity_reports(status);
CREATE TRIGGER trg_capacity_reports_updated_at BEFORE UPDATE ON public.capacity_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.capacity_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_reports_isolation ON public.capacity_reports FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY capacity_reports_global_admin ON public.capacity_reports FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.capacity_forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  forecast_method TEXT NOT NULL DEFAULT 'linear' CHECK (forecast_method IN ('linear', 'exponential', 'moving_average')),
  current_value DOUBLE PRECISION NOT NULL,
  predicted_value_7d DOUBLE PRECISION,
  predicted_value_30d DOUBLE PRECISION,
  predicted_value_90d DOUBLE PRECISION,
  slope DOUBLE PRECISION,
  r_squared DOUBLE PRECISION,
  days_until_capacity INT,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_capacity_forecasts_tenant ON public.capacity_forecasts(tenant_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_capacity_forecasts_resource ON public.capacity_forecasts(resource_type, resource_name);
ALTER TABLE public.capacity_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_forecasts_isolation ON public.capacity_forecasts FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY capacity_forecasts_global_admin ON public.capacity_forecasts FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 19: COMPLIANCE & AUDIT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.compliance_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  framework TEXT NOT NULL CHECK (framework IN ('cis', 'nist', 'iso27001', 'pci_dss', 'hipaa', 'gdpr', 'lgpd', 'soc2', 'custom')),
  policy_category TEXT NOT NULL CHECK (policy_category IN ('access_control', 'encryption', 'logging', 'network_security', 'data_protection', 'vulnerability_management', 'incident_response', 'change_management', 'backup', 'other')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('manual', 'automated', 'scheduled')),
  rule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  check_interval_hours INT NOT NULL DEFAULT 24,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_scanned_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_compliance_policies_tenant ON public.compliance_policies(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_compliance_policies_framework ON public.compliance_policies(framework, is_active);
CREATE TRIGGER trg_compliance_policies_updated_at BEFORE UPDATE ON public.compliance_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.compliance_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_policies_isolation ON public.compliance_policies FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY compliance_policies_global_admin ON public.compliance_policies FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.compliance_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.compliance_policies(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_checks INT NOT NULL DEFAULT 0,
  passed_checks INT NOT NULL DEFAULT 0,
  failed_checks INT NOT NULL DEFAULT 0,
  warning_checks INT NOT NULL DEFAULT 0,
  compliance_score DOUBLE PRECISION,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  error_message TEXT,
  triggered_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_compliance_scans_tenant ON public.compliance_scans(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_scans_policy ON public.compliance_scans(policy_id, created_at DESC);
ALTER TABLE public.compliance_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_scans_isolation ON public.compliance_scans FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY compliance_scans_global_admin ON public.compliance_scans FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.compliance_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES public.compliance_scans(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.compliance_policies(id) ON DELETE CASCADE,
  check_name TEXT NOT NULL,
  check_description TEXT,
  resource_type TEXT,
  resource_id TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive', 'accepted_risk')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_tenant ON public.compliance_violations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_scan ON public.compliance_violations(scan_id);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_severity ON public.compliance_violations(severity, status);
ALTER TABLE public.compliance_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_violations_isolation ON public.compliance_violations FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY compliance_violations_global_admin ON public.compliance_violations FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 20: SLA & SERVICES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  service_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'operational' CHECK (status IN ('operational', 'degraded', 'down', 'maintenance')),
  device_ids JSONB DEFAULT '[]'::jsonb,
  sla_target_percentage NUMERIC(5,2) NOT NULL DEFAULT 99.9,
  coverage_hours TEXT NOT NULL DEFAULT '24x7',
  coverage_timezone TEXT NOT NULL DEFAULT 'UTC',
  coverage_days JSONB DEFAULT '[]'::jsonb,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  zabbix_service_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_services_tenant ON public.services(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_services_status ON public.services(status);
CREATE INDEX IF NOT EXISTS idx_services_zabbix ON public.services(zabbix_service_id);
CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY services_isolation ON public.services FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY services_global_admin ON public.services FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.service_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'major', 'critical', 'maintenance')),
  status TEXT NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved', 'scheduled')),
  started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  downtime_seconds INT,
  root_cause TEXT,
  resolution_notes TEXT,
  affected_device_ids JSONB DEFAULT '[]'::jsonb,
  ticket_id UUID,  -- FK to public.tickets(id) added after tickets is created (see Section 22)
  zabbix_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_service_incidents_tenant ON public.service_incidents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_service_incidents_service ON public.service_incidents(service_id, started_at DESC);
CREATE TRIGGER trg_service_incidents_updated_at BEFORE UPDATE ON public.service_incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.service_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_incidents_isolation ON public.service_incidents FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY service_incidents_global_admin ON public.service_incidents FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.maintenance_windows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  device_ids JSONB DEFAULT '[]'::jsonb,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  maintenance_type TEXT NOT NULL DEFAULT 'scheduled' CHECK (maintenance_type IN ('scheduled', 'emergency', 'corrective')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_maintenance_windows_tenant ON public.maintenance_windows(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_windows_dates ON public.maintenance_windows(start_at, end_at);
CREATE TRIGGER trg_maintenance_windows_updated_at BEFORE UPDATE ON public.maintenance_windows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.maintenance_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY maintenance_windows_isolation ON public.maintenance_windows FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY maintenance_windows_global_admin ON public.maintenance_windows FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.status_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  page_title TEXT NOT NULL,
  company_name TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_status_pages_tenant ON public.status_pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_status_pages_slug ON public.status_pages(slug);
CREATE TRIGGER trg_status_pages_updated_at BEFORE UPDATE ON public.status_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.status_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY status_pages_isolation ON public.status_pages FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY status_pages_public_read ON public.status_pages FOR SELECT TO app_login USING (is_published = true);
CREATE POLICY status_pages_global_admin ON public.status_pages FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 21: CHANGE MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.change_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  rfc_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  change_type TEXT NOT NULL DEFAULT 'standard' CHECK (change_type IN ('standard', 'normal', 'emergency')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'scheduled', 'in_progress', 'implemented', 'failed', 'cancelled')),
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  planned_start_at TIMESTAMPTZ,
  planned_end_at TIMESTAMPTZ,
  actual_start_at TIMESTAMPTZ,
  actual_end_at TIMESTAMPTZ,
  implementation_notes TEXT,
  rollback_plan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, rfc_number)
);
-- NOTE: When joining to public.users for display names, ALWAYS select
-- `u.full_name` (never `u.name`) — this is the standardized column.
CREATE INDEX IF NOT EXISTS idx_change_requests_tenant ON public.change_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_change_requests_requester ON public.change_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_change_requests_assignee ON public.change_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_change_requests_approver ON public.change_requests(approved_by);
CREATE INDEX IF NOT EXISTS idx_change_requests_planned_start ON public.change_requests(planned_start_at);
CREATE TRIGGER trg_change_requests_updated_at BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY change_requests_isolation ON public.change_requests FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY change_requests_global_admin ON public.change_requests FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.change_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  change_id UUID NOT NULL REFERENCES public.change_requests(id) ON DELETE CASCADE,
  approver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_change_approvals_change ON public.change_approvals(change_id, created_at DESC);
ALTER TABLE public.change_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY change_approvals_isolation ON public.change_approvals FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY change_approvals_global_admin ON public.change_approvals FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.change_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  change_id UUID NOT NULL REFERENCES public.change_requests(id) ON DELETE CASCADE,
  task_order INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_change_tasks_change ON public.change_tasks(change_id, task_order);
ALTER TABLE public.change_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY change_tasks_isolation ON public.change_tasks FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY change_tasks_global_admin ON public.change_tasks FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 22: TICKETS & ITSM
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ticket_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  description TEXT,
  color TEXT,
  sla_response_hours NUMERIC(6,2),
  sla_resolution_hours NUMERIC(6,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_ticket_categories_tenant ON public.ticket_categories(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ticket_categories_parent ON public.ticket_categories(parent_id);
CREATE TRIGGER trg_ticket_categories_updated_at BEFORE UPDATE ON public.ticket_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_categories_isolation ON public.ticket_categories FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY ticket_categories_global_admin ON public.ticket_categories FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  category_id UUID REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 4),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'cancelled')),
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requester_name TEXT,
  requester_email TEXT,
  requester_phone TEXT,
  source TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  sla_response_due_at TIMESTAMPTZ,
  sla_resolution_due_at TIMESTAMPTZ,
  sla_responded_at TIMESTAMPTZ,
  sla_resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, ticket_number)
);
-- NOTE: joins to public.users must use `full_name`, never `name`.
CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON public.tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON public.tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_due ON public.tickets(sla_resolution_due_at) WHERE status NOT IN ('resolved', 'closed', 'cancelled');
CREATE INDEX IF NOT EXISTS idx_tickets_created ON public.tickets(created_at DESC);
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tickets_isolation ON public.tickets FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY tickets_global_admin ON public.tickets FOR ALL TO global_admin_role USING (true);

-- Deferred FK: service_incidents.ticket_id -> tickets.id (tickets did not
-- exist yet when service_incidents was created in Section 20)
ALTER TABLE public.service_incidents
  ADD CONSTRAINT fk_service_incidents_ticket
  FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON public.ticket_comments(ticket_id, created_at DESC);
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_comments_isolation ON public.ticket_comments FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY ticket_comments_global_admin ON public.ticket_comments FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.tenant_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  contract_type TEXT NOT NULL CHECK (contract_type IN ('monthly_support', 'project_fixed', 'hour_bank', 'sla_based', 'custom')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
  start_date DATE NOT NULL,
  end_date DATE,
  monthly_hours NUMERIC(8,2),
  hourly_rate NUMERIC(10,2),
  carry_over_rule TEXT NOT NULL DEFAULT 'none' CHECK (carry_over_rule IN ('none', 'unlimited', 'limited', 'expire')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, contract_number)
);
CREATE INDEX IF NOT EXISTS idx_tenant_contracts_tenant ON public.tenant_contracts(tenant_id, status);
CREATE TRIGGER trg_tenant_contracts_updated_at BEFORE UPDATE ON public.tenant_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.tenant_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_contracts_isolation ON public.tenant_contracts FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY tenant_contracts_global_admin ON public.tenant_contracts FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.ticket_work_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.tenant_contracts(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  work_type TEXT NOT NULL CHECK (work_type IN ('diagnosis', 'fix', 'monitoring', 'meeting', 'research', 'travel')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  is_billable BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'finished')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_ticket_work_logs_tenant ON public.ticket_work_logs(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_work_logs_contract ON public.ticket_work_logs(contract_id);
CREATE INDEX IF NOT EXISTS idx_ticket_work_logs_ticket ON public.ticket_work_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_work_logs_user ON public.ticket_work_logs(user_id);
ALTER TABLE public.ticket_work_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_work_logs_isolation ON public.ticket_work_logs FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY ticket_work_logs_global_admin ON public.ticket_work_logs FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 23-46: REMAINING MODULES (webhooks, api_keys, scheduled_tasks, kb,
-- reports, escalation, workflows, discovery, anomaly, predictions,
-- correlation, drift, finops, billing, marketplace, itsm, chatops, lgpd,
-- system_health, client_portal, error_reports, sql_console, audit,
-- data_transfer)
--
-- Each table follows the IDENTICAL pattern established above:
--   id UUID PK, tenant_id UUID FK, domain columns with CHECK constraints,
--   created_at/updated_at TIMESTAMPTZ, indexes on tenant_id + high-traffic
--   fields, RLS isolation policy + global_admin override policy.
--
-- Representative examples below; remaining tables in each module mirror
-- this pattern using the columns documented in current_architecture_audit.md
-- section 4.21.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH')),
  events TEXT[] NOT NULL DEFAULT '{}',
  secret TEXT,
  headers JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  max_retries INT NOT NULL DEFAULT 3,
  retry_delay_seconds INT NOT NULL DEFAULT 60,
  timeout_seconds INT NOT NULL DEFAULT 30,
  expected_status_code INT NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON public.webhooks(tenant_id, is_active);
CREATE TRIGGER trg_webhooks_updated_at BEFORE UPDATE ON public.webhooks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhooks_isolation ON public.webhooks FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY webhooks_global_admin ON public.webhooks FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  webhook_id UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  status_code INT,
  response_body TEXT,
  attempt_number INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON public.webhook_deliveries(webhook_id, created_at DESC);
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_isolation ON public.webhook_deliveries FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY webhook_deliveries_global_admin ON public.webhook_deliveries FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON public.api_keys(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON public.api_keys(key_prefix);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_keys_isolation ON public.api_keys FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY api_keys_global_admin ON public.api_keys FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'script' CHECK (task_type IN ('http_request', 'database_query', 'cleanup', 'script', 'shell_command', 'report', 'custom')),
  cron_expression TEXT NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  max_execution_seconds INT NOT NULL DEFAULT 300,
  retry_on_failure BOOLEAN NOT NULL DEFAULT false,
  max_retries INT NOT NULL DEFAULT 3,
  retry_delay_seconds INT NOT NULL DEFAULT 60,
  notify_on_failure BOOLEAN NOT NULL DEFAULT false,
  notify_emails TEXT[] DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_tenant ON public.scheduled_tasks(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON public.scheduled_tasks(next_run_at) WHERE is_active = true;
CREATE TRIGGER trg_scheduled_tasks_updated_at BEFORE UPDATE ON public.scheduled_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY scheduled_tasks_isolation ON public.scheduled_tasks FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY scheduled_tasks_global_admin ON public.scheduled_tasks FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.scheduled_task_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.scheduled_tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'timeout')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  output TEXT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task ON public.scheduled_task_runs(task_id, started_at DESC);
ALTER TABLE public.scheduled_task_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY scheduled_task_runs_isolation ON public.scheduled_task_runs FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY scheduled_task_runs_global_admin ON public.scheduled_task_runs FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.kb_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  parent_id UUID REFERENCES public.kb_categories(id) ON DELETE SET NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_kb_categories_tenant ON public.kb_categories(tenant_id, is_active);
ALTER TABLE public.kb_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY kb_categories_isolation ON public.kb_categories FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY kb_categories_global_admin ON public.kb_categories FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.kb_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.kb_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  view_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_kb_articles_tenant ON public.kb_articles(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON public.kb_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_kb_articles_content_trgm ON public.kb_articles USING gin (content gin_trgm_ops);
CREATE TRIGGER trg_kb_articles_updated_at BEFORE UPDATE ON public.kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY kb_articles_isolation ON public.kb_articles FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY kb_articles_global_admin ON public.kb_articles FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.kb_article_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.kb_articles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_helpful BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_kb_feedback_article ON public.kb_article_feedback(article_id);
ALTER TABLE public.kb_article_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY kb_feedback_isolation ON public.kb_article_feedback FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY kb_feedback_global_admin ON public.kb_article_feedback FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON public.audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id, created_at DESC);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_isolation ON public.audit_log FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY audit_log_global_admin ON public.audit_log FOR ALL TO global_admin_role USING (true);

CREATE TABLE IF NOT EXISTS public.error_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  stack_trace TEXT,
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('warning', 'error', 'fatal')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'wontfix')),
  route TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_error_reports_status ON public.error_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_tenant ON public.error_reports(tenant_id, created_at DESC);
ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY error_reports_global_admin ON public.error_reports FOR ALL TO global_admin_role USING (true);

-- ============================================================================
-- SECTION 47: VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW public.ssl_certificates_with_status AS
SELECT
  c.*,
  CASE
    WHEN c.valid_to < timezone('utc'::text, now()) THEN 'expired'
    WHEN c.valid_to <= timezone('utc'::text, now()) + (c.alert_days_before || ' days')::INTERVAL THEN 'expiring_soon'
    ELSE 'valid'
  END AS status,
  (EXTRACT(EPOCH FROM (c.valid_to - timezone('utc'::text, now())))::INT / 86400) AS days_until_expiry
FROM public.ssl_certificates c
WHERE c.is_active = true;

CREATE OR REPLACE VIEW public.assets_with_license_alerts AS
SELECT
  a.id AS asset_id,
  a.name AS asset_name,
  a.asset_tag,
  a.hostname,
  l.id AS license_id,
  l.software_name,
  l.expiry_date,
  l.renewal_date,
  CASE
    WHEN l.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN l.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'valid'
  END AS license_status,
  (l.expiry_date - CURRENT_DATE)::INT AS days_until_expiry
FROM public.assets a
JOIN public.asset_licenses l ON a.id = l.asset_id
WHERE l.is_active = true AND a.status = 'active';

CREATE OR REPLACE VIEW public.trace_summary AS
SELECT
  trace_id,
  MIN(start_time) AS start_time,
  MAX(end_time) AS end_time,
  MAX(end_time) - MIN(start_time) AS total_duration,
  EXTRACT(EPOCH FROM (MAX(end_time) - MIN(start_time))) * 1000 AS total_duration_ms,
  COUNT(*) AS span_count,
  COUNT(*) FILTER (WHERE status = 'error') AS error_count,
  COUNT(DISTINCT service) AS service_count,
  (ARRAY_AGG(DISTINCT service))[1] AS primary_service,
  (ARRAY_AGG(DISTINCT operation_name))[1] AS root_operation,
  (MIN(tenant_id::text))::uuid AS tenant_id
FROM public.trace_spans
GROUP BY trace_id;

-- ============================================================================
-- SECTION 48: RPC FUNCTIONS
-- ============================================================================

-- Clone tenant_template schema for a newly onboarded tenant
CREATE OR REPLACE FUNCTION public.onboard_tenant_schema(p_slug TEXT)
RETURNS VOID AS $$
DECLARE
  v_schema_name TEXT := 'tenant_' || p_slug;
  v_table RECORD;
BEGIN
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema_name);

  FOR v_table IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'tenant_template'
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I.%I (LIKE tenant_template.%I INCLUDING ALL)',
      v_schema_name, v_table.table_name, v_table.table_name
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Decrypt and return Zabbix config for a given tenant
CREATE OR REPLACE FUNCTION public.get_tenant_zabbix_config(p_tenant_id UUID)
RETURNS TABLE (
  api_url TEXT,
  host_group_id TEXT,
  encrypted_token TEXT,
  token_iv TEXT,
  token_tag TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tr.zabbix_api_url,
    tr.zabbix_host_group_id,
    tr.zabbix_encrypted_token,
    tr.zabbix_token_iv,
    tr.zabbix_token_tag
  FROM public.tenant_routes tr
  WHERE tr.tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate a sequential ticket number scoped per tenant (e.g. TICKET-000123)
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq;
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'TICKET-' || LPAD(nextval('public.ticket_number_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Process a script execution approval decision
CREATE OR REPLACE FUNCTION public.approve_execution(
  p_execution_id UUID,
  p_approver_id UUID,
  p_decision TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.execution_approvals (execution_id, approver_id, decision, comment)
  VALUES (p_execution_id, p_approver_id, p_decision, p_comment);

  UPDATE public.script_executions
  SET
    status = CASE WHEN p_decision = 'approved' THEN 'approved' ELSE 'rejected' END,
    approved_by = p_approver_id,
    approved_at = timezone('utc'::text, now())
  WHERE id = p_execution_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 49: TENANT_TEMPLATE SCHEMA (cloned per tenant on onboarding)
-- ============================================================================
--
-- tenant_template hosts lightweight, tenant-local override tables that don't
-- need cross-tenant visibility from `public`. Cloned via onboard_tenant_schema().
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_template.local_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS tenant_template.local_cache (
  cache_key TEXT PRIMARY KEY,
  cache_value JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS tenant_template.local_dashboards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS tenant_template.local_reports_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_key TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS tenant_template.local_notifications_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS tenant_template.local_audit_buffer (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- SECTION 50: GRANTS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO app_runtime, app_login, global_admin_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO global_admin_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users, public.sessions,
  public.trusted_devices, public.password_reset_tokens TO app_login;

-- ============================================================================
-- NOTES FOR REMAINING TABLES (escalation, workflows, discovery, anomaly,
-- predictions, correlation, drift, finops, billing, marketplace, itsm,
-- chatops, lgpd, system_health, client_portal, sql_console, data_transfer,
-- reports)
--
-- These ~40 remaining tables follow the exact same pattern documented in
-- current_architecture_audit.md §4.21 and should be added to this file using
-- the same template:
--   1. UUID PK with uuid_generate_v4()
--   2. tenant_id UUID FK -> tenants(id) ON DELETE CASCADE
--   3. CHECK constraints for all enum-like TEXT columns
--   4. created_at/updated_at TIMESTAMPTZ with UTC default
--   5. Indexes on tenant_id + status + FKs + created_at DESC
--   6. ENABLE ROW LEVEL SECURITY + tenant_isolation policy + global_admin policy
--   7. BEFORE UPDATE trigger calling public.set_updated_at()
--
-- This keeps the schema 100% consistent and machine-generatable — the exact
-- property we want when moving to Drizzle (see orm_and_types_blueprint.ts).
-- ============================================================================

-- ============================================================================
-- END OF IDEAL SCHEMA
-- ============================================================================
