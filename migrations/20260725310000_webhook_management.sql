-- @ai-context: .zero-error/architecture-map.md#ingress
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Webhook Management — webhooks de saída, assinaturas HMAC, retries, logs de entrega

CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST' CHECK (method IN ('POST','PUT','PATCH')),
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  headers JSONB DEFAULT '{}'::jsonb,
  secret TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  max_retries INT NOT NULL DEFAULT 3,
  retry_delay_seconds INT NOT NULL DEFAULT 60,
  timeout_seconds INT NOT NULL DEFAULT 30,
  expected_status_code INT NOT NULL DEFAULT 200,
  last_triggered_at TIMESTAMPTZ,
  last_delivery_status TEXT CHECK (last_delivery_status IN ('success','failed','pending','retrying')),
  total_deliveries INT NOT NULL DEFAULT 0,
  successful_deliveries INT NOT NULL DEFAULT 0,
  failed_deliveries INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_webhooks_tenant ON public.webhooks (tenant_id, is_active);
CREATE INDEX idx_webhooks_events ON public.webhooks USING gin(events);

-- Log de entregas
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  webhook_id UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','retrying')),
  attempt_number INT NOT NULL DEFAULT 1,
  response_status_code INT,
  response_body TEXT,
  response_time_ms INT,
  error_message TEXT,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_webhook_deliveries_webhook ON public.webhook_deliveries (webhook_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_status ON public.webhook_deliveries (status) WHERE status NOT IN ('success');
CREATE INDEX idx_webhook_deliveries_retry ON public.webhook_deliveries (next_retry_at) WHERE next_retry_at IS NOT NULL AND status = 'retrying';

-- Eventos de webhook (registro de eventos disparados)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  source_type TEXT,
  source_id UUID,
  payload JSONB NOT NULL,
  triggered_webhooks INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_webhook_events_tenant ON public.webhook_events (tenant_id, created_at DESC);
CREATE INDEX idx_webhook_events_name ON public.webhook_events (event_name);

-- RLS
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhooks_tenant_isolation ON public.webhooks
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY webhooks_global_admin ON public.webhooks
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY webhook_deliveries_tenant_isolation ON public.webhook_deliveries
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY webhook_deliveries_global_admin ON public.webhook_deliveries
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY webhook_events_tenant_isolation ON public.webhook_events
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY webhook_events_global_admin ON public.webhook_events
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.webhook_deliveries TO app_login;
GRANT SELECT, INSERT, UPDATE ON public.webhook_deliveries TO app_runtime;
GRANT SELECT, INSERT ON public.webhook_events TO app_login;
GRANT SELECT, INSERT ON public.webhook_events TO app_runtime;

-- Triggers
CREATE TRIGGER set_updated_at_webhooks BEFORE UPDATE ON public.webhooks
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Funcao para gerar secret HMAC
CREATE OR REPLACE FUNCTION public.generate_webhook_secret()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bytes BYTEA;
BEGIN
  v_bytes := gen_random_bytes(32);
  RETURN 'whsec_' || encode(v_bytes, 'hex');
END;
$$;
