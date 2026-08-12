-- ============================================================================
-- TEST 1: Tenant Onboarding via RPC (onboard_tenant_schema)
-- ============================================================================
\echo '=== TEST 1: TENANT ONBOARDING RPC ==='

-- Create two mock tenants (tenant A = test company, tenant B = control group)
INSERT INTO public.tenants (id, name, tenant_type, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Test Company LTDA', 'client', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Control Group Corp', 'client', 'active')
ON CONFLICT (id) DO NOTHING;

\echo '--- Tenants created ---'
SELECT id, name, tenant_type, status FROM public.tenants ORDER BY name;

-- Run the onboarding RPC for tenant A (slug used for schema name suffix)
\echo '--- Running onboard_tenant_schema(test_company) ---'
SELECT public.onboard_tenant_schema('test_company');

\echo '--- Running onboard_tenant_schema(control_grp) ---'
SELECT public.onboard_tenant_schema('control_grp');

-- Verify the new schemas exist
\echo '--- Schemas created by onboarding ---'
SELECT schema_name FROM information_schema.schemata
WHERE schema_name IN ('tenant_test_company', 'tenant_control_grp');

-- Verify tables were cloned from tenant_template
\echo '--- Tables cloned into tenant_test_company (expect 6, matching tenant_template) ---'
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'tenant_test_company' ORDER BY table_name;

\echo '--- Tables cloned into tenant_control_grp (expect 6, matching tenant_template) ---'
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'tenant_control_grp' ORDER BY table_name;

\echo '--- tenant_template reference tables (source of truth) ---'
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'tenant_template' ORDER BY table_name;

-- Structural diff: column-level comparison between template and cloned schema
\echo '--- Column count comparison: tenant_template vs tenant_test_company (expect equal per table) ---'
SELECT
  t.table_name,
  (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema='tenant_template' AND c.table_name=t.table_name) AS template_cols,
  (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema='tenant_test_company' AND c.table_name=t.table_name) AS cloned_cols
FROM (SELECT DISTINCT table_name FROM information_schema.tables WHERE table_schema='tenant_template') t
ORDER BY t.table_name;

\echo '=== TEST 1 COMPLETE ==='
