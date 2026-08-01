-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: FinOps / Cost Optimization ===
-- Rastreamento de custos de infraestrutura e otimizacao por tenant

CREATE TABLE IF NOT EXISTS public.cost_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Periodo de referencia
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- Categoria de custo
  category VARCHAR(50) NOT NULL CHECK (category IN ('compute', 'storage', 'network', 'database', 'licensing', 'cloud', 'other')),
  -- Recurso
  resource_name VARCHAR(200),
  resource_type VARCHAR(100),
  -- Valores
  cost_amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
  -- Detalhes
  usage_quantity DECIMAL(12, 3),
  usage_unit VARCHAR(50),
  -- Metadados
  source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'api')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, period_start, category, resource_name)
);

CREATE INDEX idx_cost_entries_tenant ON public.cost_entries(tenant_id);
CREATE INDEX idx_cost_entries_period ON public.cost_entries(period_start DESC);
CREATE INDEX idx_cost_entries_category ON public.cost_entries(category);

-- Otimizacoes identificadas
CREATE TABLE IF NOT EXISTS public.cost_optimizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Categoria
  category VARCHAR(50) NOT NULL,
  -- Recurso alvo
  resource_name VARCHAR(200),
  -- Descricao
  title VARCHAR(200) NOT NULL,
  description TEXT,
  -- Estimativa de economia
  estimated_savings_monthly DECIMAL(12, 2) NOT NULL,
  estimated_savings_annual DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
  -- Esforco
  effort VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (effort IN ('low', 'medium', 'high')),
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'identified' CHECK (status IN ('identified', 'approved', 'in_progress', 'implemented', 'rejected')),
  implemented_at TIMESTAMPTZ,
  actual_savings_monthly DECIMAL(12, 2),
  -- Metadados
  identified_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_cost_optimizations_tenant ON public.cost_optimizations(tenant_id);
CREATE INDEX idx_cost_optimizations_status ON public.cost_optimizations(status);

-- Orcamento por tenant
CREATE TABLE IF NOT EXISTS public.cost_budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Periodo
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  year INT NOT NULL,
  -- Categoria (NULL = orcamento geral)
  category VARCHAR(50),
  -- Valores
  budget_amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
  -- Alertas
  alert_threshold_pct INT NOT NULL DEFAULT 80 CHECK (alert_threshold_pct >= 50 AND alert_threshold_pct <= 100),
  -- Metadados
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, year, month, category)
);

CREATE INDEX idx_cost_budgets_tenant ON public.cost_budgets(tenant_id);

-- RLS
ALTER TABLE public.cost_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_optimizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY cost_entries_tenant_isolation ON public.cost_entries
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY cost_entries_global_admin ON public.cost_entries
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY cost_optimizations_tenant_isolation ON public.cost_optimizations
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY cost_optimizations_global_admin ON public.cost_optimizations
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY cost_budgets_tenant_isolation ON public.cost_budgets
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY cost_budgets_global_admin ON public.cost_budgets
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_entries TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_entries TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_optimizations TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_optimizations TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_budgets TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_budgets TO app_runtime;

-- Triggers de updated_at
CREATE OR REPLACE FUNCTION public.set_cost_optimizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cost_optimizations_updated_at
  BEFORE UPDATE ON public.cost_optimizations
  FOR EACH ROW EXECUTE FUNCTION public.set_cost_optimizations_updated_at();

CREATE OR REPLACE FUNCTION public.set_cost_budgets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cost_budgets_updated_at
  BEFORE UPDATE ON public.cost_budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_cost_budgets_updated_at();
