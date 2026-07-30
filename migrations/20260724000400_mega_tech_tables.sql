-- === Migration: 004_mega_tech_tables ===
-- Tabelas multi-tenant globais (Cluster 0)
-- tenants, tenant_routes, tenant_users

CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18) UNIQUE,
  contract_end_date TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TRIGGER tr_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

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
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'migrating')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_schema_name_format CHECK (schema_name ~ '^tenant_[a-f0-9]{8}$')
);

CREATE TRIGGER tr_tenant_routes_updated_at
  BEFORE UPDATE ON public.tenant_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TABLE IF NOT EXISTS public.tenant_users (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('global:admin', 'tenant:admin', 'tenant:operator', 'tenant:viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX idx_tenant_users_lookup ON public.tenant_users(user_id);

-- RLS: tabelas globais de metadata
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_routes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users FORCE ROW LEVEL SECURITY;

-- global_admin_role tem acesso total (app_runtime herda)
CREATE POLICY b2b_global_admin_tenants
  ON public.tenants FOR ALL TO global_admin_role
  USING (true) WITH CHECK (true);

CREATE POLICY b2b_global_admin_routes
  ON public.tenant_routes FOR ALL TO global_admin_role
  USING (true) WITH CHECK (true);

CREATE POLICY b2b_global_admin_users
  ON public.tenant_users FOR ALL TO global_admin_role
  USING (true) WITH CHECK (true);

-- Grants de DML para global_admin_role (app_runtime herda)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants, public.tenant_routes, public.tenant_users TO global_admin_role;
