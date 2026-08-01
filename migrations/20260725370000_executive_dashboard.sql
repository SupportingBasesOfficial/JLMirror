-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Executive Dashboard Cache — KPIs agregados cross-feature

CREATE TABLE IF NOT EXISTS public.executive_dashboard_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_value JSONB NOT NULL,
  metric_category TEXT NOT NULL CHECK (metric_category IN ('availability','performance','security','tickets','compliance','capacity','infrastructure','business')),
  period TEXT NOT NULL DEFAULT 'current' CHECK (period IN ('current','daily','weekly','monthly')),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, metric_key, period)
);

CREATE INDEX idx_exec_dashboard_tenant ON public.executive_dashboard_cache (tenant_id, metric_category);
CREATE INDEX idx_exec_dashboard_key ON public.executive_dashboard_cache (tenant_id, metric_key, period);

ALTER TABLE public.executive_dashboard_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY exec_dashboard_tenant_isolation ON public.executive_dashboard_cache
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY exec_dashboard_global_admin ON public.executive_dashboard_cache
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.executive_dashboard_cache TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.executive_dashboard_cache TO app_runtime;
