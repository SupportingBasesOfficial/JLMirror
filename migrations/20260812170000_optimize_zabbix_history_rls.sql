-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: 20260812170000_optimize_zabbix_history_rls ===
-- Correção e otimização de Row-Level Security (RLS) para a hypertable zabbix_history_cache
-- Corrige o cast lento de string (::text) para comparação nativa indexada por UUID (::uuid)
-- Injeta a cláusula WITH CHECK para mitigar vulnerabilidades de injeção cross-tenant na gravação assíncrona

BEGIN;

-- 1. Remove a política antiga vulnerável e ineficiente
DROP POLICY IF EXISTS zabbix_history_tenant_isolation ON public.zabbix_history_cache;

-- 2. Cria a política blindada para a role administrativa corporativa e runtime global
CREATE POLICY zabbix_history_global_admin ON public.zabbix_history_cache
  FOR ALL 
  TO app_runtime, global_admin_role
  USING (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['global_admin_role', 'app_runtime']));

-- 3. Cria a política de isolamento indestrutível por Tenant baseada em UUID nativo
CREATE POLICY zabbix_history_tenant_isolation ON public.zabbix_history_cache
  FOR ALL
  TO app_login
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- 4. Garante a aplicação intransigente do RLS na tabela e todos os seus chunks/partições temporais
ALTER TABLE public.zabbix_history_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zabbix_history_cache FORCE ROW LEVEL SECURITY;

COMMIT;
