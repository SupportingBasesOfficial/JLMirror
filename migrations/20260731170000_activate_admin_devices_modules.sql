-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Ativa modulos fundamentais para gestao de hosts e usuarios
UPDATE public.feature_flags SET default_value = 'true'::jsonb WHERE key = 'module_admin';
UPDATE public.feature_flags SET default_value = 'true'::jsonb WHERE key = 'module_devices';
