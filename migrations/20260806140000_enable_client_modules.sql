-- Ativa client_enabled para todos os módulos que já têm client_visible = true
-- Isso permite que clientes (tenant users) vejam e usem os módulos liberados
UPDATE public.feature_flags
SET client_enabled = true, updated_at = NOW()
WHERE key LIKE 'module_%' AND tenant_id IS NULL AND client_visible = true;
