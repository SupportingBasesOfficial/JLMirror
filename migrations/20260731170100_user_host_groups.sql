-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Tabela de atrelamento entre usuarios do sistema e host groups do Zabbix
-- Permite que cada usuario tenha acesso apenas aos host groups atribuidos
CREATE TABLE IF NOT EXISTS public.user_host_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  zabbix_host_group_id TEXT NOT NULL,
  zabbix_host_group_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, user_id, zabbix_host_group_id)
);

CREATE INDEX idx_user_host_groups_tenant ON public.user_host_groups (tenant_id);
CREATE INDEX idx_user_host_groups_user ON public.user_host_groups (user_id);

-- RLS
ALTER TABLE public.user_host_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_host_groups_tenant_isolation ON public.user_host_groups
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY user_host_groups_global_admin ON public.user_host_groups
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_host_groups TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_host_groups TO app_runtime;
