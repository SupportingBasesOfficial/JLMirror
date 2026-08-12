-- ============================================================================
-- TEST 2: Row-Level Security (RLS) Multi-Tenant Isolation
--
-- Tenant A = 11111111-1111-1111-1111-111111111111 (Test Company LTDA)
-- Tenant B = 22222222-2222-2222-2222-222222222222 (Control Group Corp)
--
-- Strategy: run all assertions as the low-privilege `app_runtime` role
-- (the same role the API pool connects as), never as postgres superuser,
-- since RLS is bypassed for superusers/table owners by design.
-- ============================================================================
\echo '=== TEST 2: RLS ISOLATION ==='
\pset footer off

-- ----------------------------------------------------------------------------
-- 2.0 Seed mock data as postgres (bypasses RLS intentionally, this is setup)
-- ----------------------------------------------------------------------------
INSERT INTO public.devices (id, tenant_id, hostname, ip, zabbix_host_id)
VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'tenant-a-server-01', '10.0.1.10', 'zbx-a-1'),
  ('a0000000-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'tenant-a-server-02', '10.0.1.11', 'zbx-a-2'),
  ('b0000000-0000-0000-0000-00000000000a', '22222222-2222-2222-2222-222222222222', 'tenant-b-server-01', '10.0.2.10', 'zbx-b-1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tickets (id, tenant_id, ticket_number, subject, description, status)
VALUES
  ('c0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'TICKET-A-001', 'Tenant A secret ticket', 'Confidential info for tenant A only', 'open'),
  ('c0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'TICKET-B-001', 'Tenant B secret ticket', 'Confidential info for tenant B only', 'open')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.feature_flags (id, tenant_id, key, name, is_active)
VALUES
  ('d0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'module_sla', 'SLA Module (tenant A override)', true),
  ('d0000000-0000-0000-0000-00000000000b', NULL, 'module_zabbix', 'Zabbix Module (global default)', true)
ON CONFLICT (tenant_id, key) DO NOTHING;

\echo '--- Seed data inserted as postgres (superuser, bypasses RLS) ---'
SELECT tenant_id, count(*) FROM public.devices GROUP BY tenant_id ORDER BY tenant_id;

-- ----------------------------------------------------------------------------
-- 2.1 Grant app_runtime minimal privileges needed for the test session
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices, public.tickets, public.feature_flags TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices, public.tickets, public.feature_flags TO global_admin_role;

-- ----------------------------------------------------------------------------
-- 2.2 ASSERTION SET A: app_runtime scoped to Tenant A must see ONLY tenant A
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [A] SET ROLE app_runtime; tenant context = Tenant A ---'
SET ROLE app_runtime;
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

\echo '[A.1] SELECT devices — expect ONLY 2 rows (tenant A), 0 leaked from tenant B:'
SELECT id, tenant_id, hostname FROM public.devices ORDER BY hostname;

\echo '[A.2] SELECT tickets — expect ONLY 1 row (TICKET-A-001), tenant B ticket must NOT appear:'
SELECT id, ticket_number, subject FROM public.tickets ORDER BY ticket_number;

\echo '[A.3] Attempt direct read of tenant B device by known ID (IDOR probe) — expect 0 rows:'
SELECT * FROM public.devices WHERE id = 'b0000000-0000-0000-0000-00000000000a';

\echo '[A.4] Attempt UPDATE on tenant B device (should affect 0 rows, RLS blocks visibility):'
UPDATE public.devices SET hostname = 'HACKED-BY-TENANT-A' WHERE tenant_id = '22222222-2222-2222-2222-222222222222';

\echo '[A.5] Attempt DELETE on tenant B ticket (should affect 0 rows):'
DELETE FROM public.tickets WHERE tenant_id = '22222222-2222-2222-2222-222222222222';

\echo '[A.6] Attempt INSERT with a FORGED tenant_id = Tenant B (WITH CHECK must reject) — expect ERROR:'
DO $$
BEGIN
  BEGIN
    INSERT INTO public.devices (tenant_id, hostname, ip)
    VALUES ('22222222-2222-2222-2222-222222222222', 'forged-device', '10.0.2.99');
    RAISE NOTICE 'SECURITY FAILURE: forged cross-tenant INSERT succeeded!';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS: cross-tenant INSERT correctly rejected by RLS WITH CHECK (%)', SQLERRM;
  END;
END $$;

\echo '[A.7] Verify tenant B data is STILL fully intact after all attack attempts (as postgres, RLS bypassed):'
RESET ROLE;
SELECT id, tenant_id, hostname FROM public.devices WHERE tenant_id = '22222222-2222-2222-2222-222222222222' ORDER BY hostname;
SELECT id, ticket_number, subject FROM public.tickets WHERE tenant_id = '22222222-2222-2222-2222-222222222222';

-- ----------------------------------------------------------------------------
-- 2.3 ASSERTION SET B: app_runtime scoped to Tenant B must see ONLY tenant B
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [B] SET ROLE app_runtime; tenant context = Tenant B ---'
SET ROLE app_runtime;
SET app.current_tenant_id = '22222222-2222-2222-2222-222222222222';

\echo '[B.1] SELECT devices — expect ONLY 1 row (tenant B), tenant A devices must NOT appear:'
SELECT id, tenant_id, hostname FROM public.devices ORDER BY hostname;

\echo '[B.2] SELECT tickets — expect ONLY 1 row (TICKET-B-001):'
SELECT id, ticket_number, subject FROM public.tickets ORDER BY ticket_number;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- 2.4 ASSERTION SET C: no tenant context set (empty setting) → must see NOTHING
-- (except global/NULL-tenant rows where policy explicitly allows it)
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [C] SET ROLE app_runtime; NO tenant context set (simulates missing JWT/session bug) ---'
SET ROLE app_runtime;
RESET app.current_tenant_id;

\echo '[C.1] SELECT devices with no tenant context — asserting FAIL-CLOSED behavior:'
\echo '      (current_setting(...,true) returuns empty string; casting "" to uuid errors out.'
\echo '       This means an app bug that forgets to SET the tenant context CRASHES the query'
\echo '       instead of silently leaking or returning all rows — i.e. fail-closed, not fail-open.)'
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.devices;
    RAISE NOTICE 'UNEXPECTED: query succeeded with no tenant context set (should have errored)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS (fail-closed): query correctly errored without tenant context (%)', SQLERRM;
  END;
END $$;

\echo '[C.2] SELECT feature_flags with no tenant context — same fail-closed check (this table allows NULL tenant_id rows):'
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.feature_flags;
    RAISE NOTICE 'UNEXPECTED: query succeeded with no tenant context set';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS (fail-closed): query correctly errored without tenant context (%)', SQLERRM;
  END;
END $$;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- 2.5 ASSERTION SET D: global_admin_role must see ACROSS all tenants
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [D] SET ROLE global_admin_role — expect to see BOTH tenants (cross-tenant admin access) ---'
SET ROLE global_admin_role;

\echo '[D.1] SELECT devices — expect 3 rows total (2 from A + 1 from B):'
SELECT id, tenant_id, hostname FROM public.devices ORDER BY hostname;

\echo '[D.2] SELECT tickets — expect 2 rows total:'
SELECT id, ticket_number FROM public.tickets ORDER BY ticket_number;

RESET ROLE;

\echo ''
\echo '=== TEST 2 COMPLETE ==='
