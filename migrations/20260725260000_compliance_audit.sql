-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Compliance & Audit Trail — políticas, scans, violações, relatórios

CREATE TABLE IF NOT EXISTS public.compliance_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  framework TEXT NOT NULL CHECK (framework IN ('cis','nist','iso27001','pci_dss','hipaa','gdpr','lgpd','soc2','custom')),
  policy_category TEXT NOT NULL CHECK (policy_category IN ('access_control','encryption','logging','network_security','data_protection','vulnerability_management','incident_response','change_management','backup','other')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('manual','automated','scheduled')),
  rule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  check_interval_hours INT NOT NULL DEFAULT 24,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_scanned_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_compliance_policies_tenant ON public.compliance_policies (tenant_id, is_active);
CREATE INDEX idx_compliance_policies_framework ON public.compliance_policies (framework, is_active);

-- Scans executados
CREATE TABLE IF NOT EXISTS public.compliance_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.compliance_policies(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed')),
  total_checks INT NOT NULL DEFAULT 0,
  passed_checks INT NOT NULL DEFAULT 0,
  failed_checks INT NOT NULL DEFAULT 0,
  warning_checks INT NOT NULL DEFAULT 0,
  compliance_score DOUBLE PRECISION,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  error_message TEXT,
  triggered_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_compliance_scans_tenant ON public.compliance_scans (tenant_id, created_at DESC);
CREATE INDEX idx_compliance_scans_policy ON public.compliance_scans (policy_id, created_at DESC);

-- Violações encontradas
CREATE TABLE IF NOT EXISTS public.compliance_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES public.compliance_scans(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.compliance_policies(id) ON DELETE CASCADE,
  check_name TEXT NOT NULL,
  check_description TEXT,
  resource_type TEXT,
  resource_id TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','remediated','false_positive','wont_fix')),
  expected_value TEXT,
  actual_value TEXT,
  remediation_steps TEXT,
  acknowledged_by UUID REFERENCES public.users(id),
  acknowledged_at TIMESTAMPTZ,
  remediated_by UUID REFERENCES public.users(id),
  remediated_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_compliance_violations_tenant ON public.compliance_violations (tenant_id, created_at DESC);
CREATE INDEX idx_compliance_violations_policy ON public.compliance_violations (policy_id, status);
CREATE INDEX idx_compliance_violations_status ON public.compliance_violations (status, severity);
CREATE INDEX idx_compliance_violations_scan ON public.compliance_violations (scan_id);

-- RLS
ALTER TABLE public.compliance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_policies_tenant_isolation ON public.compliance_policies
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY compliance_policies_global_admin ON public.compliance_policies
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY compliance_scans_tenant_isolation ON public.compliance_scans
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY compliance_scans_global_admin ON public.compliance_scans
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY compliance_violations_tenant_isolation ON public.compliance_violations
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY compliance_violations_global_admin ON public.compliance_violations
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_policies TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_policies TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.compliance_scans TO app_login;
GRANT SELECT, INSERT, UPDATE ON public.compliance_scans TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.compliance_violations TO app_login;
GRANT SELECT, INSERT, UPDATE ON public.compliance_violations TO app_runtime;

-- Triggers
CREATE TRIGGER set_updated_at_compliance_policies BEFORE UPDATE ON public.compliance_policies
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- View: score de conformidade por framework
CREATE OR REPLACE VIEW public.compliance_score_by_framework AS
SELECT
  p.framework,
  COUNT(DISTINCT p.id) as policy_count,
  COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'open') as open_violations,
  COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'remediated') as remediated,
  AVG(s.compliance_score) FILTER (WHERE s.status = 'completed') as avg_score
FROM public.compliance_policies p
LEFT JOIN public.compliance_scans s ON p.id = s.policy_id
LEFT JOIN public.compliance_violations v ON p.id = v.policy_id
WHERE p.tenant_id = current_setting('app.current_tenant_id', true)::uuid
GROUP BY p.framework;
