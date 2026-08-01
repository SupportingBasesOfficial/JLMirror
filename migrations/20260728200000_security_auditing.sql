-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: Security Auditing Automatizado ===
-- Cria tabelas para regras de auditoria de segurança automatizadas
-- Permite scan de conformidade, detecção de vulnerabilidades e findings

CREATE TABLE IF NOT EXISTS public.security_audit_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL CHECK (category IN ('access_control', 'encryption', 'compliance', 'vulnerability', 'configuration', 'network', 'data_protection')),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  check_type VARCHAR(50) NOT NULL CHECK (check_type IN ('sql_query', 'config_check', 'ssl_check', 'password_policy', 'rls_check', 'session_check', 'custom')),
  check_query TEXT,
  check_config JSONB,
  expected_result VARCHAR(100),
  remediation TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_audit_rules_tenant ON public.security_audit_rules(tenant_id);
CREATE INDEX idx_audit_rules_category ON public.security_audit_rules(category);
CREATE INDEX idx_audit_rules_active ON public.security_audit_rules(is_active);

CREATE TABLE IF NOT EXISTS public.security_audit_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  rule_id UUID NOT NULL REFERENCES public.security_audit_rules(id) ON DELETE CASCADE,
  scan_id UUID,
  status VARCHAR(20) NOT NULL CHECK (status IN ('open', 'acknowledged', 'remediated', 'false_positive', 'ignored')),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  finding_data JSONB,
  affected_resource VARCHAR(500),
  remediation_notes TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_audit_findings_tenant ON public.security_audit_findings(tenant_id);
CREATE INDEX idx_audit_findings_status ON public.security_audit_findings(status);
CREATE INDEX idx_audit_findings_severity ON public.security_audit_findings(severity);
CREATE INDEX idx_audit_findings_rule ON public.security_audit_findings(rule_id);

CREATE TABLE IF NOT EXISTS public.security_audit_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  total_rules INT NOT NULL DEFAULT 0,
  executed_rules INT NOT NULL DEFAULT 0,
  total_findings INT NOT NULL DEFAULT 0,
  critical_findings INT NOT NULL DEFAULT 0,
  high_findings INT NOT NULL DEFAULT 0,
  medium_findings INT NOT NULL DEFAULT 0,
  low_findings INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_audit_scans_tenant ON public.security_audit_scans(tenant_id);

-- RLS
ALTER TABLE public.security_audit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_rules_login_select ON public.security_audit_rules FOR SELECT TO app_login USING (true);
CREATE POLICY audit_rules_login_insert ON public.security_audit_rules FOR INSERT TO app_login WITH CHECK (true);
CREATE POLICY audit_rules_login_update ON public.security_audit_rules FOR UPDATE TO app_login USING (true) WITH CHECK (true);
CREATE POLICY audit_rules_login_delete ON public.security_audit_rules FOR DELETE TO app_login USING (true);

CREATE POLICY audit_findings_login_select ON public.security_audit_findings FOR SELECT TO app_login USING (true);
CREATE POLICY audit_findings_login_insert ON public.security_audit_findings FOR INSERT TO app_login WITH CHECK (true);
CREATE POLICY audit_findings_login_update ON public.security_audit_findings FOR UPDATE TO app_login USING (true) WITH CHECK (true);
CREATE POLICY audit_findings_login_delete ON public.security_audit_findings FOR DELETE TO app_login USING (true);

CREATE POLICY audit_scans_login_select ON public.security_audit_scans FOR SELECT TO app_login USING (true);
CREATE POLICY audit_scans_login_insert ON public.security_audit_scans FOR INSERT TO app_login WITH CHECK (true);
CREATE POLICY audit_scans_login_update ON public.security_audit_scans FOR UPDATE TO app_login USING (true) WITH CHECK (true);
CREATE POLICY audit_scans_login_delete ON public.security_audit_scans FOR DELETE TO app_login USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_audit_rules TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_audit_findings TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_audit_scans TO app_runtime;

-- Trigger
CREATE OR REPLACE FUNCTION public.set_audit_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_rules_updated_at BEFORE UPDATE ON public.security_audit_rules FOR EACH ROW EXECUTE FUNCTION public.set_audit_rules_updated_at();

-- Seed: regras padrão de auditoria
INSERT INTO public.security_audit_rules (tenant_id, name, description, category, severity, check_type, check_query, expected_result, remediation, is_active) VALUES
(NULL, 'RLS habilitado em todas as tabelas', 'Verifica se RLS está ativo em tabelas críticas', 'access_control', 'high', 'rls_check',
 'SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nname = ''public'') AND relkind = ''r'' AND relrowsecurity = false AND relname IN (''users'', ''sessions'', ''tenant_users'')',
 '0 rows', 'Habilitar RLS com ALTER TABLE ... ENABLE ROW LEVEL SECURITY', true),
(NULL, 'Senhas com hash Argon2', 'Verifica se todos os usuários têm hash de senha válido', 'access_control', 'medium', 'sql_query',
 'SELECT COUNT(*) FROM public.users WHERE password_hash IS NULL OR password_hash = '''' OR length(password_hash) < 60',
 '0', 'Garantir que todos os usuários tenham senha com hash Argon2', true),
(NULL, 'Sessões expiradas ativas', 'Verifica se há sessões expiradas não limpas', 'access_control', 'medium', 'sql_query',
 'SELECT COUNT(*) FROM public.sessions WHERE expires_at < timezone(''utc''::text, now())',
 '0', 'Implementar job de limpeza de sessões expiradas', true),
(NULL, 'Certificados SSL expirando', 'Verifica certificados SSL que expiram em 30 dias', 'encryption', 'high', 'ssl_check',
 NULL, '0', 'Renovar certificados SSL antes do vencimento', true),
(NULL, 'Usuários sem MFA', 'Verifica usuários ativos sem MFA habilitado', 'access_control', 'medium', 'sql_query',
 'SELECT COUNT(*) FROM public.users u WHERE u.is_active = true AND NOT EXISTS (SELECT 1 FROM public.user_mfa_totp t WHERE t.user_id = u.id) AND NOT EXISTS (SELECT 1 FROM public.user_webauthn_credentials w WHERE w.user_id = u.id)',
 '0', 'Recomendar habilitação de MFA para todos os usuários ativos', true)
ON CONFLICT DO NOTHING;
