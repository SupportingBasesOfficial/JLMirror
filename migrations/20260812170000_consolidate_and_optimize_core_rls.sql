-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: 20260812170000_consolidate_and_optimize_core_rls ===
-- Saneamento e otimização de Row-Level Security (RLS) para partições históricas de alta volumetria
-- Remove o cast ineficiente de string (::text) que causava Sequential Scans massivos no PostgreSQL
-- Implementa a comparação direta e indexada por UUID nativo (::uuid) com proteção WITH CHECK

BEGIN;

-- ============================================================
-- 1. OTIMIZAÇÃO: capacity_metrics partitions
-- ============================================================
DROP POLICY IF EXISTS capacity_metrics_202607_tenant_isolation ON public.capacity_metrics_202607;
CREATE POLICY capacity_metrics_202607_tenant_isolation ON public.capacity_metrics_202607
  FOR ALL USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS capacity_metrics_202608_tenant_isolation ON public.capacity_metrics_202608;
CREATE POLICY capacity_metrics_202608_tenant_isolation ON public.capacity_metrics_202608
  FOR ALL USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS capacity_metrics_202609_tenant_isolation ON public.capacity_metrics_202609;
CREATE POLICY capacity_metrics_202609_tenant_isolation ON public.capacity_metrics_202609
  FOR ALL USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS capacity_metrics_202610_tenant_isolation ON public.capacity_metrics_202610;
CREATE POLICY capacity_metrics_202610_tenant_isolation ON public.capacity_metrics_202610
  FOR ALL USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);


-- ============================================================
-- 2. OTIMIZAÇÃO: system_logs partitions
-- ============================================================
DROP POLICY IF EXISTS system_logs_202607_tenant_isolation ON public.system_logs_202607;
CREATE POLICY system_logs_202607_tenant_isolation ON public.system_logs_202607
  FOR ALL USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS system_logs_202608_tenant_isolation ON public.system_logs_202608;
CREATE POLICY system_logs_202608_tenant_isolation ON public.system_logs_202608
  FOR ALL USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS system_logs_202609_tenant_isolation ON public.system_logs_202609;
CREATE POLICY system_logs_202609_tenant_isolation ON public.system_logs_202609
  FOR ALL USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS system_logs_202610_tenant_isolation ON public.system_logs_202610;
CREATE POLICY system_logs_202610_tenant_isolation ON public.system_logs_202610
  FOR ALL USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);


-- ============================================================
-- 3. OTIMIZAÇÃO: trace_spans partitions
-- ============================================================
DROP POLICY IF EXISTS trace_spans_202607_tenant_isolation ON public.trace_spans_202607;
CREATE POLICY trace_spans_202607_tenant_isolation ON public.trace_spans_202607
  FOR ALL USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS trace_spans_202608_tenant_isolation ON public.trace_spans_202608;
CREATE POLICY trace_spans_202608_tenant_isolation ON public.trace_spans_202608
  FOR ALL USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS trace_spans_202609_tenant_isolation ON public.trace_spans_202609;
CREATE POLICY trace_spans_202609_tenant_isolation ON public.trace_spans_202609
  FOR ALL USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS trace_spans_202610_tenant_isolation ON public.trace_spans_202610;
CREATE POLICY trace_spans_202610_tenant_isolation ON public.trace_spans_202610
  FOR ALL USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

COMMIT;
