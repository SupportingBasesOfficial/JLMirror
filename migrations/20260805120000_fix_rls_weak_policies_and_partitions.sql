-- Migration: Corrige RLS em 15 tabelas com policies fracas (USING: true) e 12 partições sem RLS
-- Problema 1: 15 tabelas com tenant_id mas policies sem isolamento (USING: true = vazamento cross-tenant)
-- Problema 2: 12 partições (capacity_metrics, system_logs, trace_spans) sem RLS habilitado

-- ============================================================
-- PARTE 1: Corrigir 12 tabelas tenant-scoped com policies fracas
-- Padrão: dropar policies antigas + criar global_admin + tenant_isolation
-- ============================================================

-- 1. alert_escalation_instances
DROP POLICY IF EXISTS escalation_instances_login_delete ON public.alert_escalation_instances;
DROP POLICY IF EXISTS escalation_instances_login_insert ON public.alert_escalation_instances;
DROP POLICY IF EXISTS escalation_instances_login_select ON public.alert_escalation_instances;
DROP POLICY IF EXISTS escalation_instances_login_update ON public.alert_escalation_instances;
CREATE POLICY escalation_instances_global_admin ON public.alert_escalation_instances
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));
CREATE POLICY escalation_instances_tenant_isolation ON public.alert_escalation_instances
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 2. alert_escalation_policies
DROP POLICY IF EXISTS escalation_policies_login_delete ON public.alert_escalation_policies;
DROP POLICY IF EXISTS escalation_policies_login_insert ON public.alert_escalation_policies;
DROP POLICY IF EXISTS escalation_policies_login_select ON public.alert_escalation_policies;
DROP POLICY IF EXISTS escalation_policies_login_update ON public.alert_escalation_policies;
CREATE POLICY escalation_policies_global_admin ON public.alert_escalation_policies
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));
CREATE POLICY escalation_policies_tenant_isolation ON public.alert_escalation_policies
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 3. audit_log
DROP POLICY IF EXISTS global_admin_audit_all ON public.audit_log;
CREATE POLICY audit_log_global_admin ON public.audit_log
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));
CREATE POLICY audit_log_tenant_isolation ON public.audit_log
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 4. client_companies
DROP POLICY IF EXISTS client_companies_tenant_delete ON public.client_companies;
DROP POLICY IF EXISTS client_companies_tenant_insert ON public.client_companies;
DROP POLICY IF EXISTS client_companies_tenant_select ON public.client_companies;
DROP POLICY IF EXISTS client_companies_tenant_update ON public.client_companies;
CREATE POLICY client_companies_global_admin ON public.client_companies
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));
CREATE POLICY client_companies_tenant_isolation ON public.client_companies
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 5. client_contacts
DROP POLICY IF EXISTS client_contacts_tenant_delete ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_tenant_insert ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_tenant_select ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_tenant_update ON public.client_contacts;
CREATE POLICY client_contacts_global_admin ON public.client_contacts
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));
CREATE POLICY client_contacts_tenant_isolation ON public.client_contacts
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 6. lgpd_requests
DROP POLICY IF EXISTS lgpd_requests_login_delete ON public.lgpd_requests;
DROP POLICY IF EXISTS lgpd_requests_login_insert ON public.lgpd_requests;
DROP POLICY IF EXISTS lgpd_requests_login_select ON public.lgpd_requests;
DROP POLICY IF EXISTS lgpd_requests_login_update ON public.lgpd_requests;
CREATE POLICY lgpd_requests_global_admin ON public.lgpd_requests
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));
CREATE POLICY lgpd_requests_tenant_isolation ON public.lgpd_requests
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 7. patch_deployment_jobs
DROP POLICY IF EXISTS patch_deployments_login_delete ON public.patch_deployment_jobs;
DROP POLICY IF EXISTS patch_deployments_login_insert ON public.patch_deployment_jobs;
DROP POLICY IF EXISTS patch_deployments_login_select ON public.patch_deployment_jobs;
DROP POLICY IF EXISTS patch_deployments_login_update ON public.patch_deployment_jobs;
CREATE POLICY patch_deployments_global_admin ON public.patch_deployment_jobs
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));
CREATE POLICY patch_deployments_tenant_isolation ON public.patch_deployment_jobs
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 8. patch_scans
DROP POLICY IF EXISTS patch_scans_login_delete ON public.patch_scans;
DROP POLICY IF EXISTS patch_scans_login_insert ON public.patch_scans;
DROP POLICY IF EXISTS patch_scans_login_select ON public.patch_scans;
DROP POLICY IF EXISTS patch_scans_login_update ON public.patch_scans;
CREATE POLICY patch_scans_global_admin ON public.patch_scans
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));
CREATE POLICY patch_scans_tenant_isolation ON public.patch_scans
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 9. patches
DROP POLICY IF EXISTS patches_login_delete ON public.patches;
DROP POLICY IF EXISTS patches_login_insert ON public.patches;
DROP POLICY IF EXISTS patches_login_select ON public.patches;
DROP POLICY IF EXISTS patches_login_update ON public.patches;
CREATE POLICY patches_global_admin ON public.patches
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));
CREATE POLICY patches_tenant_isolation ON public.patches
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 10. security_audit_findings
DROP POLICY IF EXISTS audit_findings_login_delete ON public.security_audit_findings;
DROP POLICY IF EXISTS audit_findings_login_insert ON public.security_audit_findings;
DROP POLICY IF EXISTS audit_findings_login_select ON public.security_audit_findings;
DROP POLICY IF EXISTS audit_findings_login_update ON public.security_audit_findings;
CREATE POLICY audit_findings_global_admin ON public.security_audit_findings
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));
CREATE POLICY audit_findings_tenant_isolation ON public.security_audit_findings
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 11. security_audit_rules
DROP POLICY IF EXISTS audit_rules_login_delete ON public.security_audit_rules;
DROP POLICY IF EXISTS audit_rules_login_insert ON public.security_audit_rules;
DROP POLICY IF EXISTS audit_rules_login_select ON public.security_audit_rules;
DROP POLICY IF EXISTS audit_rules_login_update ON public.security_audit_rules;
CREATE POLICY audit_rules_global_admin ON public.security_audit_rules
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));
CREATE POLICY audit_rules_tenant_isolation ON public.security_audit_rules
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 12. security_audit_scans
DROP POLICY IF EXISTS audit_scans_login_delete ON public.security_audit_scans;
DROP POLICY IF EXISTS audit_scans_login_insert ON public.security_audit_scans;
DROP POLICY IF EXISTS audit_scans_login_select ON public.security_audit_scans;
DROP POLICY IF EXISTS audit_scans_login_update ON public.security_audit_scans;
CREATE POLICY audit_scans_global_admin ON public.security_audit_scans
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));
CREATE POLICY audit_scans_tenant_isolation ON public.security_audit_scans
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ============================================================
-- PARTE 2: Corrigir 3 tabelas globais com policies fracas
-- Estas sao tabelas B2B/global admin — restringir a global_admin apenas
-- ============================================================

-- 13. sso_providers
DROP POLICY IF EXISTS global_admin_sso_all ON public.sso_providers;
CREATE POLICY sso_providers_global_admin ON public.sso_providers
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));

-- 14. tenant_routes
DROP POLICY IF EXISTS b2b_global_admin_routes ON public.tenant_routes;
CREATE POLICY tenant_routes_global_admin ON public.tenant_routes
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));

-- 15. tenant_users
DROP POLICY IF EXISTS b2b_global_admin_users ON public.tenant_users;
CREATE POLICY tenant_users_global_admin ON public.tenant_users
  FOR ALL USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));

-- ============================================================
-- PARTE 3: Habilitar RLS nas 12 partições (capacity_metrics, system_logs, trace_spans)
-- Partições herdam colunas da tabela mãe, incluindo tenant_id
-- ============================================================

-- capacity_metrics partitions
ALTER TABLE public.capacity_metrics_202607 ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_metrics_202607_tenant_isolation ON public.capacity_metrics_202607
  FOR ALL USING ((tenant_id)::text = current_setting('app.current_tenant_id', true));

ALTER TABLE public.capacity_metrics_202608 ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_metrics_202608_tenant_isolation ON public.capacity_metrics_202608
  FOR ALL USING ((tenant_id)::text = current_setting('app.current_tenant_id', true));

ALTER TABLE public.capacity_metrics_202609 ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_metrics_202609_tenant_isolation ON public.capacity_metrics_202609
  FOR ALL USING ((tenant_id)::text = current_setting('app.current_tenant_id', true));

ALTER TABLE public.capacity_metrics_202610 ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_metrics_202610_tenant_isolation ON public.capacity_metrics_202610
  FOR ALL USING ((tenant_id)::text = current_setting('app.current_tenant_id', true));

-- system_logs partitions
ALTER TABLE public.system_logs_202607 ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_logs_202607_tenant_isolation ON public.system_logs_202607
  FOR ALL USING ((tenant_id)::text = current_setting('app.current_tenant_id', true));

ALTER TABLE public.system_logs_202608 ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_logs_202608_tenant_isolation ON public.system_logs_202608
  FOR ALL USING ((tenant_id)::text = current_setting('app.current_tenant_id', true));

ALTER TABLE public.system_logs_202609 ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_logs_202609_tenant_isolation ON public.system_logs_202609
  FOR ALL USING ((tenant_id)::text = current_setting('app.current_tenant_id', true));

ALTER TABLE public.system_logs_202610 ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_logs_202610_tenant_isolation ON public.system_logs_202610
  FOR ALL USING ((tenant_id)::text = current_setting('app.current_tenant_id', true));

-- trace_spans partitions
ALTER TABLE public.trace_spans_202607 ENABLE ROW LEVEL SECURITY;
CREATE POLICY trace_spans_202607_tenant_isolation ON public.trace_spans_202607
  FOR ALL USING ((tenant_id)::text = current_setting('app.current_tenant_id', true));

ALTER TABLE public.trace_spans_202608 ENABLE ROW LEVEL SECURITY;
CREATE POLICY trace_spans_202608_tenant_isolation ON public.trace_spans_202608
  FOR ALL USING ((tenant_id)::text = current_setting('app.current_tenant_id', true));

ALTER TABLE public.trace_spans_202609 ENABLE ROW LEVEL SECURITY;
CREATE POLICY trace_spans_202609_tenant_isolation ON public.trace_spans_202609
  FOR ALL USING ((tenant_id)::text = current_setting('app.current_tenant_id', true));

ALTER TABLE public.trace_spans_202610 ENABLE ROW LEVEL SECURITY;
CREATE POLICY trace_spans_202610_tenant_isolation ON public.trace_spans_202610
  FOR ALL USING ((tenant_id)::text = current_setting('app.current_tenant_id', true));
