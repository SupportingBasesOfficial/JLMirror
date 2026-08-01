-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: user_role_hierarchy ===
-- Evolui o modelo de roles para duas camadas hierárquicas:
-- 1. Camada global (JL staff): roles customizáveis com cross-tenant access
-- 2. Camada tenant (clientes): roles admin-defined, tenant-restricted
--
-- Mudanças:
-- - Remove CHECK constraint fixa de tenant_users.role
-- - Adiciona coluna scope (global | tenant) em tenant_users
-- - Cria tabela tenant_custom_roles para roles definidas por tenant:admin
-- - Cria tabela tenant_custom_role_permissions para mapear permissões
-- - Atualiza get_user_permissions() para considerar ambas as camadas
-- - Adiciona roles JL staff granulares no seed

-- ============================================================
-- 1. REMOVER CHECK CONSTRAINT de tenant_users.role
-- ============================================================

ALTER TABLE public.tenant_users DROP CONSTRAINT IF EXISTS tenant_users_role_check;

-- ============================================================
-- 2. ADICIONAR SCOPE em tenant_users
-- ============================================================

ALTER TABLE public.tenant_users
  ADD COLUMN IF NOT EXISTS scope VARCHAR(10) NOT NULL DEFAULT 'tenant'
  CHECK (scope IN ('global', 'tenant'));

-- Adiciona updated_at para auditoria de mudanças de role
ALTER TABLE public.tenant_users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- Trigger de timestamp
DROP TRIGGER IF EXISTS set_timestamp_tenant_users ON public.tenant_users;
CREATE TRIGGER set_timestamp_tenant_users
  BEFORE UPDATE ON public.tenant_users
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- ============================================================
-- 3. ROLES JL STAFF (camada global) — granulares e customizáveis
-- ============================================================

INSERT INTO public.roles (key, description, is_system) VALUES
  ('jl:superadmin', 'Super administrador JL — acesso total cross-tenant', true),
  ('jl:engineer', 'Engenheiro JL — operação e troubleshooting cross-tenant', true),
  ('jl:technician', 'Técnico JL — executa ações operacionais', true),
  ('jl:manager', 'Gerente JL — gestão e relatórios, sem execução técnica', true),
  ('jl:finance', 'Financeiro JL — acesso a FinOps e billing', true),
  ('jl:viewer', 'Visualizador JL — apenas leitura cross-tenant', true)
ON CONFLICT (key) DO NOTHING;

-- Permissões para jl:superadmin (curinga)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:superadmin' AND p.key = '*:*'
ON CONFLICT DO NOTHING;

-- Permissões para jl:engineer (operação completa, sem gestão de usuários)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:engineer' AND p.key IN (
  'zabbix:devices:read', 'zabbix:devices:write', 'zabbix:history:read',
  'zabbix:sync:execute', 'zabbix:triggers:read', 'zabbix:triggers:ack',
  'ssh:execute', 'scripts:execute',
  'k8s:read', 'k8s:write',
  'logs:read', 'logs:search', 'tracing:read',
  'iac:read', 'iac:apply',
  'firewall:read', 'firewall:write',
  'reports:generate', 'ai:predict'
)
ON CONFLICT DO NOTHING;

-- Permissões para jl:technician (execução operacional, sem gestão)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:technician' AND p.key IN (
  'zabbix:devices:read', 'zabbix:history:read',
  'zabbix:triggers:read', 'zabbix:triggers:ack',
  'ssh:execute', 'scripts:execute',
  'k8s:read', 'logs:read', 'tracing:read',
  'iac:read', 'firewall:read', 'reports:generate'
)
ON CONFLICT DO NOTHING;

-- Permissões para jl:manager (gestão e relatórios, sem execução técnica)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:manager' AND p.key IN (
  'zabbix:devices:read', 'zabbix:history:read', 'zabbix:triggers:read',
  'tenant:users:read', 'tenant:settings:read',
  'audit:read',
  'k8s:read', 'logs:read', 'tracing:read',
  'iac:read', 'firewall:read',
  'reports:generate', 'ai:predict'
)
ON CONFLICT DO NOTHING;

-- Permissões para jl:finance (FinOps e billing)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:finance' AND p.key IN (
  'zabbix:devices:read',
  'tenant:settings:read',
  'reports:generate'
)
ON CONFLICT DO NOTHING;

-- Permissões para jl:viewer (apenas leitura)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:viewer' AND p.key IN (
  'zabbix:devices:read', 'zabbix:history:read', 'zabbix:triggers:read',
  'k8s:read', 'logs:read', 'tracing:read',
  'iac:read', 'firewall:read'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. TABELA tenant_custom_roles — roles definidas por tenant:admin
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_custom_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, key)
);

CREATE INDEX idx_tenant_custom_roles_tenant ON public.tenant_custom_roles(tenant_id);

-- Trigger de timestamp
CREATE TRIGGER set_timestamp_tenant_custom_roles
  BEFORE UPDATE ON public.tenant_custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- ============================================================
-- 5. TABELA tenant_custom_role_permissions — permissões das roles custom
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_custom_role_permissions (
  role_id UUID NOT NULL REFERENCES public.tenant_custom_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- 6. RLS para tenant_custom_roles
-- ============================================================

ALTER TABLE public.tenant_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_custom_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_custom_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_custom_role_permissions FORCE ROW LEVEL SECURITY;

-- global_admin_role tem acesso total
CREATE POLICY global_admin_custom_roles_all ON public.tenant_custom_roles
  FOR ALL TO global_admin_role USING (true) WITH CHECK (true);
CREATE POLICY global_admin_custom_role_perms_all ON public.tenant_custom_role_permissions
  FOR ALL TO global_admin_role USING (true) WITH CHECK (true);

-- Tenant isolation: tenant_custom_roles só visível para o próprio tenant
CREATE POLICY tenant_isolation_custom_roles ON public.tenant_custom_roles
  FOR ALL TO app_runtime
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Tenant isolation: tenant_custom_role_permissions via join
CREATE POLICY tenant_isolation_custom_role_perms ON public.tenant_custom_role_permissions
  FOR ALL TO app_runtime
  USING (
    role_id IN (
      SELECT id FROM public.tenant_custom_roles
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    role_id IN (
      SELECT id FROM public.tenant_custom_roles
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.tenant_custom_roles, public.tenant_custom_role_permissions
TO global_admin_role;

-- ============================================================
-- 7. ATUALIZAR get_user_permissions() — considera ambas as camadas
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID)
RETURNS TABLE(permission_key TEXT) AS $$
  -- Camada 1: Permissões via roles do sistema (global + tenant)
  SELECT DISTINCT p.key
  FROM public.tenant_users tu
  JOIN public.roles r ON r.key = tu.role
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE tu.user_id = p_user_id

  UNION

  -- Curinga para global:admin e jl:superadmin
  SELECT '*:*' AS permission_key
  FROM public.tenant_users tu
  WHERE tu.user_id = p_user_id
    AND tu.role IN ('global:admin', 'jl:superadmin')

  UNION

  -- Camada 2: Permissões via roles customizadas do tenant
  SELECT DISTINCT p.key
  FROM public.tenant_users tu
  JOIN public.tenant_custom_roles tcr ON tcr.tenant_id = tu.tenant_id AND tcr.key = tu.role
  JOIN public.tenant_custom_role_permissions tcrp ON tcrp.role_id = tcr.id
  JOIN public.permissions p ON p.id = tcrp.permission_id
  WHERE tu.user_id = p_user_id AND tcr.is_active = true
  AND tu.scope = 'tenant';
$$ LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================
-- 8. ATUALIZAR get_tenant_user_auth — retorna scope também
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_tenant_user_auth(p_user_id UUID)
RETURNS TABLE(tenant_id UUID, role VARCHAR, scope VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT tu.tenant_id, tu.role::VARCHAR, tu.scope::VARCHAR
  FROM public.tenant_users tu
  WHERE tu.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_tenant_user_auth(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_user_auth(UUID) TO app_runtime;

-- ============================================================
-- 9. MIGRAR DADOS EXISTENTES — definir scope para roles atuais
-- ============================================================

-- global:admin → scope = 'global'
UPDATE public.tenant_users SET scope = 'global' WHERE role = 'global:admin';

-- tenant:* → scope = 'tenant' (já é o default, mas garante)
UPDATE public.tenant_users SET scope = 'tenant' WHERE role LIKE 'tenant:%';

-- jl:* → scope = 'global' (caso já existam)
UPDATE public.tenant_users SET scope = 'global' WHERE role LIKE 'jl:%';
