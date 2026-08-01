-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Data Export & Import — exportações, importações, templates

CREATE TABLE IF NOT EXISTS public.data_export_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  source_table TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','json','xlsx','sql')),
  columns JSONB DEFAULT '[]'::jsonb,
  filters JSONB DEFAULT '{}'::jsonb,
  include_headers BOOLEAN NOT NULL DEFAULT true,
  delimiter TEXT NOT NULL DEFAULT ',',
  encoding TEXT NOT NULL DEFAULT 'utf-8',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_export_templates_tenant ON public.data_export_templates (tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.data_exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.data_export_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  source_table TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','json','xlsx','sql')),
  columns JSONB DEFAULT '[]'::jsonb,
  filters JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  file_path TEXT,
  file_size_bytes BIGINT,
  row_count INT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_data_exports_tenant ON public.data_exports (tenant_id, created_at DESC);
CREATE INDEX idx_data_exports_status ON public.data_exports (status) WHERE status IN ('pending','processing');
CREATE INDEX idx_data_exports_template ON public.data_exports (template_id);

CREATE TABLE IF NOT EXISTS public.data_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_table TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','json','sql')),
  file_path TEXT,
  file_size_bytes BIGINT,
  column_mapping JSONB DEFAULT '{}'::jsonb,
  options JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','partial','cancelled')),
  total_rows INT NOT NULL DEFAULT 0,
  successful_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  skipped_rows INT NOT NULL DEFAULT 0,
  error_log TEXT,
  error_summary JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_data_imports_tenant ON public.data_imports (tenant_id, created_at DESC);
CREATE INDEX idx_data_imports_status ON public.data_imports (status) WHERE status IN ('pending','processing');

-- RLS
ALTER TABLE public.data_export_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY export_templates_tenant_isolation ON public.data_export_templates
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY export_templates_global_admin ON public.data_export_templates
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY data_exports_tenant_isolation ON public.data_exports
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY data_exports_global_admin ON public.data_exports
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY data_imports_tenant_isolation ON public.data_imports
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY data_imports_global_admin ON public.data_imports
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_export_templates TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_export_templates TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_exports TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_exports TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_imports TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_imports TO app_runtime;

-- Triggers
CREATE TRIGGER set_updated_at_export_templates BEFORE UPDATE ON public.data_export_templates
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Tabelas permitidas para export/import (whitelist de seguranca)
CREATE TABLE IF NOT EXISTS public.data_transfer_whitelist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL UNIQUE,
  allowed_export BOOLEAN NOT NULL DEFAULT true,
  allowed_import BOOLEAN NOT NULL DEFAULT true,
  max_export_rows INT NOT NULL DEFAULT 100000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.data_transfer_whitelist (table_name, allowed_export, allowed_import, max_export_rows) VALUES
  ('devices', true, true, 100000),
  ('assets', true, true, 100000),
  ('ticket_categories', true, true, 10000),
  ('tickets', true, false, 100000),
  ('kb_categories', true, true, 10000),
  ('kb_articles', true, false, 50000),
  ('api_keys', false, false, 0),
  ('users', false, false, 0),
  ('audit_logs', true, false, 500000),
  ('compliance_policies', true, true, 10000),
  ('notifications', true, false, 100000)
ON CONFLICT (table_name) DO NOTHING;

ALTER TABLE public.data_transfer_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY data_transfer_whitelist_all ON public.data_transfer_whitelist FOR ALL USING (true);
GRANT SELECT ON public.data_transfer_whitelist TO app_login;
GRANT SELECT ON public.data_transfer_whitelist TO app_runtime;
