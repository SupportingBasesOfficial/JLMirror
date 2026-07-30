-- === Migration: Client Portal ===
-- Portal do cliente com visão limitada (status, incidentes, SLA)
-- Ativavel por tenant via feature flag "client_portal_enabled"

CREATE TABLE IF NOT EXISTS public.client_portal_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Vinculo com usuario real (opcional — pode ser cliente externo sem conta no sistema)
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Dados do cliente
  email VARCHAR(255) NOT NULL,
  contact_name VARCHAR(200) NOT NULL,
  company_name VARCHAR(200),
  phone VARCHAR(50),
  -- Permissoes do portal
  can_view_incidents BOOLEAN NOT NULL DEFAULT true,
  can_view_sla BOOLEAN NOT NULL DEFAULT true,
  can_view_services BOOLEAN NOT NULL DEFAULT true,
  can_create_tickets BOOLEAN NOT NULL DEFAULT false,
  -- Token de acesso ao portal (JWT proprio do portal)
  portal_token TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_client_portal_users_tenant ON public.client_portal_users(tenant_id);
CREATE INDEX idx_client_portal_users_token ON public.client_portal_users(portal_token) WHERE portal_token IS NOT NULL;

-- RLS
ALTER TABLE public.client_portal_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_portal_users_tenant_isolation ON public.client_portal_users
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY client_portal_users_global_admin ON public.client_portal_users
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_users TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_users TO app_runtime;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_client_portal_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_portal_users_updated_at
  BEFORE UPDATE ON public.client_portal_users
  FOR EACH ROW EXECUTE FUNCTION public.set_client_portal_users_updated_at();
