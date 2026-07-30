-- === Migration: CRM + Client Onboarding ===
-- Adiciona must_change_password em users para forçar troca de senha no primeiro acesso
-- Cria tabela client_contacts para CRM de clientes
-- Cria tabela client_companies para dados comerciais dos clientes

-- Adiciona flag must_change_password na tabela users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- Adiciona coluna phone e last_login_at em users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Cria tabela de contatos de clientes (CRM)
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

CREATE INDEX idx_client_contacts_tenant_id ON public.client_contacts(tenant_id);
CREATE INDEX idx_client_contacts_email ON public.client_contacts(email);

CREATE TRIGGER tr_client_contacts_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- RLS para client_contacts
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_contacts_tenant_select ON public.client_contacts
  FOR SELECT TO global_admin_role USING (true);

CREATE POLICY client_contacts_tenant_insert ON public.client_contacts
  FOR INSERT TO global_admin_role WITH CHECK (true);

CREATE POLICY client_contacts_tenant_update ON public.client_contacts
  FOR UPDATE TO global_admin_role USING (true) WITH CHECK (true);

CREATE POLICY client_contacts_tenant_delete ON public.client_contacts
  FOR DELETE TO global_admin_role USING (true);

-- Cria tabela de dados comerciais dos clientes
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

CREATE TRIGGER tr_client_companies_updated_at
  BEFORE UPDATE ON public.client_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- RLS para client_companies
ALTER TABLE public.client_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_companies_tenant_select ON public.client_companies
  FOR SELECT TO global_admin_role USING (true);

CREATE POLICY client_companies_tenant_insert ON public.client_companies
  FOR INSERT TO global_admin_role WITH CHECK (true);

CREATE POLICY client_companies_tenant_update ON public.client_companies
  FOR UPDATE TO global_admin_role USING (true) WITH CHECK (true);

CREATE POLICY client_companies_tenant_delete ON public.client_companies
  FOR DELETE TO global_admin_role USING (true);

-- Concede acesso a app_runtime para as novas tabelas
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_companies TO app_runtime;

-- Atualiza a policy de users para permitir que app_runtime leia must_change_password
-- app_login já tem SELECT em users WHERE is_active = true
-- app_runtime herda global_admin_role que tem acesso total
