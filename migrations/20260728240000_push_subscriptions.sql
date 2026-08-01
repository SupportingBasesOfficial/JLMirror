-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: PWA Push Notifications ===
-- Inscricoes Web Push por usuario (Web Push API + VAPID)

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Endpoint da inscricao (URL unica do push service do browser)
  endpoint TEXT NOT NULL,
  -- Chaves de criptografia do Web Push
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  -- Metadados
  user_agent TEXT,
  device_type VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  -- Unico por endpoint + user_id (evita duplicatas)
  UNIQUE(endpoint, user_id)
);

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_tenant ON public.push_subscriptions(tenant_id);
CREATE INDEX idx_push_subscriptions_active ON public.push_subscriptions(is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_tenant_isolation ON public.push_subscriptions
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY push_subscriptions_global_admin ON public.push_subscriptions
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));
CREATE POLICY push_subscriptions_self ON public.push_subscriptions
  FOR SELECT USING (user_id::text = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO app_runtime;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_push_subscriptions_updated_at();
