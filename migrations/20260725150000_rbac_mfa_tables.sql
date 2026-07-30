-- === Migration: rbac_mfa_tables ===
-- Tabelas para RBAC granular, MFA (TOTP + WebAuthn) e ABAC
-- Todas em public (globais, cluster 0)

-- ============================================================
-- 1. PERMISSOES GRANULARES (RBAC dinâmico via DB)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Tabela de roles dinâmicas (permite criar roles além das hardcoded)
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Mapeamento N:N de roles para permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Seed: roles do sistema
INSERT INTO public.roles (key, description, is_system) VALUES
  ('global:admin', 'Administrador global com acesso total', true),
  ('tenant:admin', 'Administrador do tenant', true),
  ('tenant:operator', 'Operador do tenant (executa ações mas não gerencia usuários)', true),
  ('tenant:viewer', 'Visualizador do tenant (apenas leitura)', true)
ON CONFLICT (key) DO NOTHING;

-- Seed: permissões do sistema
INSERT INTO public.permissions (key, description, category) VALUES
  ('zabbix:devices:read', 'Visualizar dispositivos do Zabbix', 'zabbix'),
  ('zabbix:devices:write', 'Editar configurações de dispositivos', 'zabbix'),
  ('zabbix:history:read', 'Ler histórico de métricas', 'zabbix'),
  ('zabbix:sync:execute', 'Executar sincronização com Zabbix', 'zabbix'),
  ('zabbix:triggers:read', 'Visualizar alertas/triggers', 'zabbix'),
  ('zabbix:triggers:ack', 'Reconhecer alertas', 'zabbix'),
  ('tenant:users:read', 'Listar usuários do tenant', 'tenant'),
  ('tenant:users:write', 'Criar/editar usuários do tenant', 'tenant'),
  ('tenant:users:delete', 'Remover usuários do tenant', 'tenant'),
  ('tenant:settings:read', 'Ver configurações do tenant', 'tenant'),
  ('tenant:settings:write', 'Alterar configurações do tenant', 'tenant'),
  ('audit:read', 'Ler logs de auditoria', 'audit'),
  ('mfa:manage', 'Gerenciar MFA de usuários', 'auth'),
  ('ssh:execute', 'Executar comandos SSH remotos', 'automation'),
  ('scripts:execute', 'Executar scripts remotos', 'automation'),
  ('k8s:read', 'Ler estado de clusters Kubernetes', 'automation'),
  ('k8s:write', 'Modificar recursos Kubernetes', 'automation'),
  ('logs:read', 'Ler logs centralizados', 'observability'),
  ('logs:search', 'Buscar logs com regex', 'observability'),
  ('tracing:read', 'Visualizar traces distribuídos', 'observability'),
  ('iac:read', 'Ver estado de infraestrutura como código', 'automation'),
  ('iac:apply', 'Aplicar mudanças de infraestrutura', 'automation'),
  ('firewall:read', 'Ver regras de firewall', 'security'),
  ('firewall:write', 'Modificar regras de firewall', 'security'),
  ('reports:generate', 'Gerar relatórios de saúde', 'ai'),
  ('ai:predict', 'Executar análise preditiva', 'ai'),
  ('*:*', 'Curinga — todas as permissões', 'system')
ON CONFLICT (key) DO NOTHING;

-- Mapear permissions para roles do sistema
-- global:admin recebe *:*
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'global:admin' AND p.key = '*:*'
ON CONFLICT DO NOTHING;

-- tenant:admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'tenant:admin' AND p.key IN (
  'zabbix:devices:read', 'zabbix:devices:write', 'zabbix:history:read',
  'zabbix:sync:execute', 'zabbix:triggers:read', 'zabbix:triggers:ack',
  'tenant:users:read', 'tenant:users:write', 'tenant:users:delete',
  'tenant:settings:read', 'tenant:settings:write',
  'audit:read', 'mfa:manage',
  'ssh:execute', 'scripts:execute',
  'k8s:read', 'k8s:write',
  'logs:read', 'logs:search', 'tracing:read',
  'iac:read', 'iac:apply',
  'firewall:read', 'firewall:write',
  'reports:generate', 'ai:predict'
)
ON CONFLICT DO NOTHING;

-- tenant:operator
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'tenant:operator' AND p.key IN (
  'zabbix:devices:read', 'zabbix:history:read',
  'zabbix:triggers:read', 'zabbix:triggers:ack',
  'ssh:execute', 'scripts:execute',
  'k8s:read', 'logs:read', 'logs:search', 'tracing:read',
  'iac:read', 'firewall:read', 'reports:generate'
)
ON CONFLICT DO NOTHING;

-- tenant:viewer
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'tenant:viewer' AND p.key IN (
  'zabbix:devices:read', 'zabbix:history:read',
  'zabbix:triggers:read',
  'k8s:read', 'logs:read', 'tracing:read',
  'iac:read', 'firewall:read'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. MFA — TOTP (Time-based One-Time Password)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_mfa_totp (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  recovery_codes JSONB NOT NULL DEFAULT '[]',
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id)
);

-- ============================================================
-- 3. MFA — WebAuthn (FIDO2)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key JSONB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_type VARCHAR(50),
  name VARCHAR(100),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_webauthn_user_id ON public.user_webauthn_credentials(user_id);

-- ============================================================
-- 4. MFA — desafios temporários (login flow)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mfa_challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method VARCHAR(20) NOT NULL CHECK (method IN ('totp', 'webauthn')),
  challenge_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_mfa_challenges_token ON public.mfa_challenges(challenge_token);
CREATE INDEX idx_mfa_challenges_expires ON public.mfa_challenges(expires_at);

-- ============================================================
-- 5. ABAC — Políticas baseadas em atributos
-- ============================================================

CREATE TABLE IF NOT EXISTS public.attribute_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_key VARCHAR(50) NOT NULL,
  permission_key TEXT NOT NULL,
  condition_type VARCHAR(50) NOT NULL CHECK (condition_type IN ('time_window', 'ip_range', 'location', 'device')),
  condition_value JSONB NOT NULL,
  effect VARCHAR(20) NOT NULL DEFAULT 'deny' CHECK (effect IN ('allow', 'deny')),
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================
-- 6. SSO — Provedores externos por tenant
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sso_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_type VARCHAR(20) NOT NULL CHECK (provider_type IN ('saml', 'ldap', 'oauth')),
  provider_name VARCHAR(100) NOT NULL,
  config JSONB NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_sso_providers_tenant ON public.sso_providers(tenant_id);

-- ============================================================
-- 7. AUDITORIA — Log imutável de ações
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id),
  tenant_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(200),
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_audit_user_id ON public.audit_log(user_id);
CREATE INDEX idx_audit_tenant_id ON public.audit_log(tenant_id);
CREATE INDEX idx_audit_action ON public.audit_log(action);
CREATE INDEX idx_audit_created_at ON public.audit_log(created_at);

-- Auditoria é append-only: não permite UPDATE nem DELETE
CREATE OR REPLACE FUNCTION public.prevent_audit_modify()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Tabela audit_log é append-only. Modificações não permitidas.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER tr_audit_no_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_modify();

CREATE TRIGGER tr_audit_no_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_modify();

-- ============================================================
-- RLS e Grants
-- ============================================================

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mfa_totp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribute_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sso_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- app_login precisa ler permissions/roles para montar o token
CREATE POLICY permissions_login_select ON public.permissions
  FOR SELECT TO app_login USING (true);
CREATE POLICY roles_login_select ON public.roles
  FOR SELECT TO app_login USING (true);
CREATE POLICY role_perms_login_select ON public.role_permissions
  FOR SELECT TO app_login USING (true);

-- app_login manipula MFA durante o fluxo de login
CREATE POLICY mfa_totp_login_select ON public.user_mfa_totp
  FOR SELECT TO app_login USING (true);
CREATE POLICY mfa_totp_login_update ON public.user_mfa_totp
  FOR UPDATE TO app_login USING (true);

CREATE POLICY mfa_challenges_login_all ON public.mfa_challenges
  FOR ALL TO app_login USING (true) WITH CHECK (true);

CREATE POLICY webauthn_login_select ON public.user_webauthn_credentials
  FOR SELECT TO app_login USING (true);
CREATE POLICY webauthn_login_update ON public.user_webauthn_credentials
  FOR UPDATE TO app_login USING (true);

-- global_admin_role tem acesso total
CREATE POLICY global_admin_rbac_all ON public.permissions
  FOR ALL TO global_admin_role USING (true) WITH CHECK (true);
CREATE POLICY global_admin_roles_all ON public.roles
  FOR ALL TO global_admin_role USING (true) WITH CHECK (true);
CREATE POLICY global_admin_role_perms_all ON public.role_permissions
  FOR ALL TO global_admin_role USING (true) WITH CHECK (true);
CREATE POLICY global_admin_mfa_all ON public.user_mfa_totp
  FOR ALL TO global_admin_role USING (true) WITH CHECK (true);
CREATE POLICY global_admin_webauthn_all ON public.user_webauthn_credentials
  FOR ALL TO global_admin_role USING (true) WITH CHECK (true);
CREATE POLICY global_admin_attr_policies_all ON public.attribute_policies
  FOR ALL TO global_admin_role USING (true) WITH CHECK (true);
CREATE POLICY global_admin_sso_all ON public.sso_providers
  FOR ALL TO global_admin_role USING (true) WITH CHECK (true);
CREATE POLICY global_admin_audit_all ON public.audit_log
  FOR ALL TO global_admin_role USING (true) WITH CHECK (true);

-- Grants
GRANT SELECT ON public.permissions, public.roles, public.role_permissions TO app_login;
GRANT SELECT, UPDATE ON public.user_mfa_totp TO app_login;
GRANT SELECT, UPDATE ON public.user_webauthn_credentials TO app_login;
GRANT INSERT, SELECT, UPDATE, DELETE ON public.mfa_challenges TO app_login;
GRANT INSERT ON public.audit_log TO app_login;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.permissions, public.roles, public.role_permissions,
  public.user_mfa_totp, public.user_webauthn_credentials,
  public.mfa_challenges, public.attribute_policies,
  public.sso_providers, public.audit_log
TO global_admin_role;

-- ============================================================
-- RPC: get_user_permissions — retorna todas as permissões de um usuário
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID)
RETURNS TABLE(permission_key TEXT) AS $$
  SELECT DISTINCT p.key
  FROM public.tenant_users tu
  JOIN public.roles r ON r.key = tu.role
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE tu.user_id = p_user_id
  UNION
  SELECT '*:*' AS permission_key
  FROM public.tenant_users tu
  WHERE tu.user_id = p_user_id AND tu.role = 'global:admin';
$$ LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================
-- RPC: write_audit_log — insere registro de auditoria
-- ============================================================

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_user_id UUID,
  p_tenant_id UUID,
  p_action VARCHAR,
  p_resource_type VARCHAR DEFAULT NULL,
  p_resource_id VARCHAR DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_log (user_id, tenant_id, action, resource_type, resource_id, details, ip_address, user_agent)
  VALUES (p_user_id, p_tenant_id, p_action, p_resource_type, p_resource_id, p_details, p_ip_address, p_user_agent)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO app_login, global_admin_role;
GRANT EXECUTE ON FUNCTION public.write_audit_log(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, INET, TEXT) TO app_login, global_admin_role;

-- Triggers de timestamp
CREATE TRIGGER set_timestamp_mfa_totp
  BEFORE UPDATE ON public.user_mfa_totp
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER set_timestamp_sso_providers
  BEFORE UPDATE ON public.sso_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
