-- Ativa modulos fundamentais para gestao de hosts e usuarios
UPDATE public.feature_flags SET default_value = 'true'::jsonb WHERE key = 'module_admin';
UPDATE public.feature_flags SET default_value = 'true'::jsonb WHERE key = 'module_devices';
