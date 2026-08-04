-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: fix_permission_keys ===
-- Adiciona permissões que faltavam no seed RBAC
-- As rotas usam zabbix:read e settings:read mas só existiam
-- zabbix:devices:read e tenant:settings:read no banco

-- Permissões genéricas de domínio (usadas pelos middlewares das rotas)
INSERT INTO public.permissions (key, description, category) VALUES
  ('zabbix:read', 'Acesso de leitura ao módulo Zabbix', 'zabbix'),
  ('zabbix:write', 'Acesso de escrita ao módulo Zabbix', 'zabbix'),
  ('settings:read', 'Ler configurações do tenant', 'settings'),
  ('settings:write', 'Alterar configurações do tenant', 'settings')
ON CONFLICT (key) DO NOTHING;

-- Mapeia zabbix:read e zabbix:write para tenant:admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'tenant:admin' AND p.key IN (
  'zabbix:read', 'zabbix:write', 'settings:read', 'settings:write'
)
ON CONFLICT DO NOTHING;

-- Mapeia zabbix:read e settings:read para tenant:operator
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'tenant:operator' AND p.key IN (
  'zabbix:read', 'settings:read'
)
ON CONFLICT DO NOTHING;

-- Mapeia zabbix:read e settings:read para tenant:viewer
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'tenant:viewer' AND p.key IN (
  'zabbix:read', 'settings:read'
)
ON CONFLICT DO NOTHING;

-- Mapeia para roles JL staff (exceto jl:finance e jl:viewer que só precisam read)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:engineer' AND p.key IN (
  'zabbix:read', 'zabbix:write', 'settings:read', 'settings:write'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:technician' AND p.key IN (
  'zabbix:read', 'settings:read'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:manager' AND p.key IN (
  'zabbix:read', 'settings:read', 'settings:write'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:viewer' AND p.key IN (
  'zabbix:read', 'settings:read'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:finance' AND p.key IN (
  'zabbix:read', 'settings:read'
)
ON CONFLICT DO NOTHING;
