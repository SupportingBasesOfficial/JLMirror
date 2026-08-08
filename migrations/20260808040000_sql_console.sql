-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: SQL Console — conexoes externas, templates e log de queries

-- ===================================================================
-- 1. CONEXOES COM BANCOS EXTERNOS DE CLIENTES
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.sql_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Pode ou nao estar vinculado a um tenant do JLMIRROR
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,

  -- Dados de conexao
  name TEXT NOT NULL,
  db_engine TEXT NOT NULL DEFAULT 'postgres' CHECK (db_engine IN ('postgres','mysql','sqlserver','oracle')),
  host TEXT NOT NULL,
  port INT NOT NULL DEFAULT 5432,
  database_name TEXT NOT NULL,
  username TEXT NOT NULL,

  -- Senha criptografada
  encrypted_password TEXT NOT NULL,
  password_iv TEXT NOT NULL,
  password_tag TEXT NOT NULL,

  -- SSL/TLS
  ssl_mode TEXT NOT NULL DEFAULT 'prefer' CHECK (ssl_mode IN ('disable','prefer','require','verify-ca','verify-full')),

  -- Seguranca
  is_read_only BOOLEAN NOT NULL DEFAULT true,
  max_rows INT NOT NULL DEFAULT 1000,
  timeout_seconds INT NOT NULL DEFAULT 30,

  -- Quem pode usar (NULL = todos JL Staff global)
  allowed_user_ids UUID[],

  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_sql_connections_active ON public.sql_connections (is_active) WHERE is_active = true;
CREATE INDEX idx_sql_connections_tenant ON public.sql_connections (tenant_id) WHERE tenant_id IS NOT NULL;

-- RLS: apenas JL Staff (scope global) pode acessar
ALTER TABLE public.sql_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY sql_connections_global_admin ON public.sql_connections
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sql_connections TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sql_connections TO app_runtime;

CREATE TRIGGER set_updated_at_sql_connections BEFORE UPDATE ON public.sql_connections
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ===================================================================
-- 2. TEMPLATES DE SQL
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.sql_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  sql_text TEXT NOT NULL,
  category TEXT,
  db_engine TEXT, -- NULL = funciona em qualquer banco
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_global BOOLEAN NOT NULL DEFAULT true,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_sql_templates_category ON public.sql_templates (category);
CREATE INDEX idx_sql_templates_tags ON public.sql_templates USING GIN (tags);
CREATE INDEX idx_sql_templates_engine ON public.sql_templates (db_engine) WHERE db_engine IS NOT NULL;

ALTER TABLE public.sql_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY sql_templates_global_admin ON public.sql_templates
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sql_templates TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sql_templates TO app_runtime;

CREATE TRIGGER set_updated_at_sql_templates BEFORE UPDATE ON public.sql_templates
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ===================================================================
-- 3. LOG DE QUERIES EXECUTADAS
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.sql_query_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID NOT NULL REFERENCES public.sql_connections(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  query_text TEXT NOT NULL,
  template_id UUID REFERENCES public.sql_templates(id) ON DELETE SET NULL,
  rows_returned INT,
  execution_ms INT,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  client_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_sql_query_log_connection ON public.sql_query_log (connection_id, created_at DESC);
CREATE INDEX idx_sql_query_log_user ON public.sql_query_log (user_id, created_at DESC) WHERE user_id IS NOT NULL;

ALTER TABLE public.sql_query_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY sql_query_log_global_admin ON public.sql_query_log
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT ON public.sql_query_log TO app_login;
GRANT SELECT, INSERT ON public.sql_query_log TO app_runtime;
