-- Migration: API Key Management — chaves, escopos, rate limiting, rotação

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_ips JSONB DEFAULT '[]'::jsonb,
  rate_limit_per_min INT NOT NULL DEFAULT 60,
  rate_limit_per_hour INT NOT NULL DEFAULT 3600,
  rate_limit_per_day INT NOT NULL DEFAULT 86400,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  last_used_ip TEXT,
  total_requests BIGINT NOT NULL DEFAULT 0,
  requests_today INT NOT NULL DEFAULT 0,
  requests_this_hour INT NOT NULL DEFAULT 0,
  requests_this_minute INT NOT NULL DEFAULT 0,
  rotated_from UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  rotated_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, key_hash)
);

CREATE INDEX idx_api_keys_tenant ON public.api_keys (tenant_id, is_active);
CREATE INDEX idx_api_keys_hash ON public.api_keys (key_hash);
CREATE INDEX idx_api_keys_prefix ON public.api_keys (key_prefix);
CREATE INDEX idx_api_keys_expires ON public.api_keys (expires_at) WHERE expires_at IS NOT NULL AND is_active = true;

-- Log de uso de API keys
CREATE TABLE IF NOT EXISTS public.api_key_usage_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INT NOT NULL,
  response_time_ms INT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_api_key_usage_key ON public.api_key_usage_log (api_key_id, created_at DESC);
CREATE INDEX idx_api_key_usage_tenant ON public.api_key_usage_log (tenant_id, created_at DESC);

-- RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_keys_tenant_isolation ON public.api_keys
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY api_keys_global_admin ON public.api_keys
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY api_key_usage_tenant_isolation ON public.api_key_usage_log
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY api_key_usage_global_admin ON public.api_key_usage_log
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO app_runtime;
GRANT SELECT, INSERT ON public.api_key_usage_log TO app_login;
GRANT SELECT, INSERT ON public.api_key_usage_log TO app_runtime;

-- Triggers
CREATE TRIGGER set_updated_at_api_keys BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Funcao para gerar hash de API key (SHA-256)
CREATE OR REPLACE FUNCTION public.hash_api_key(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN encode(digest(p_key, 'sha256'), 'hex');
END;
$$;

-- Funcao para resetar contadores diarios/horarios/minutuais
CREATE OR REPLACE FUNCTION public.reset_api_key_counters()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reset INT;
BEGIN
  UPDATE public.api_keys
  SET requests_this_minute = 0
  WHERE is_active = true;

  UPDATE public.api_keys
  SET requests_this_hour = 0
  WHERE is_active = true
    AND (last_used_at IS NULL OR last_used_at < date_trunc('hour', timezone('utc'::text, now())));

  UPDATE public.api_keys
  SET requests_today = 0
  WHERE is_active = true
    AND (last_used_at IS NULL OR last_used_at < date_trunc('day', timezone('utc'::text, now())));

  GET DIAGNOSTICS v_reset = ROW_COUNT;
  RETURN v_reset;
END;
$$;
