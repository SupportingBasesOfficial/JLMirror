-- Libera módulos de conta para clientes: profile e auth
-- Clientes precisam acessar seu próprio perfil e gerenciar sessões
UPDATE public.feature_flags
SET client_visible = true, client_enabled = true, updated_at = NOW()
WHERE key IN ('module_profile', 'module_auth')
  AND tenant_id IS NULL;
