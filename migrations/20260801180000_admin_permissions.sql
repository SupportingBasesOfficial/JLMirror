-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: admin_permissions ===
-- Adiciona permissões específicas de admin global que faltavam no seed RBAC

-- Permissões de administração global
INSERT INTO public.permissions (key, description, category) VALUES
  ('admin:tenants:read', 'Listar e visualizar tenants (admin global)', 'admin'),
  ('admin:tenants:write', 'Criar, editar, suspender e ativar tenants (admin global)', 'admin'),
  ('admin:users:read', 'Listar usuários globais (admin global)', 'admin'),
  ('admin:users:write', 'Gerenciar usuários globais (admin global)', 'admin')
ON CONFLICT (key) DO NOTHING;

-- global:admin já tem *:* que cobre tudo, mas garantimos mapeamento explícito
-- para clareza e para casos onde *:* seja removido no futuro
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'global:admin' AND p.key IN (
  'admin:tenants:read', 'admin:tenants:write',
  'admin:users:read', 'admin:users:write'
)
ON CONFLICT DO NOTHING;
