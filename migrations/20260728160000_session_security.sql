-- === Migration: Session Security com Device Fingerprinting ===
-- Adiciona campos de fingerprint, IP e User-Agent na tabela sessions
-- Cria tabela de dispositivos confiáveis para permitir múltiplos dispositivos

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS device_label TEXT;

-- Cria índice para buscar sessões por fingerprint
CREATE INDEX IF NOT EXISTS idx_sessions_device_fingerprint ON public.sessions(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id_active ON public.sessions(user_id);

-- Cria tabela de dispositivos confiáveis do usuário
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_label TEXT,
  ip_address INET,
  user_agent TEXT,
  trusted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, device_fingerprint)
);

CREATE INDEX idx_trusted_devices_user_id ON public.trusted_devices(user_id);

-- RLS para trusted_devices
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY trusted_devices_login_select ON public.trusted_devices
  FOR SELECT TO app_login USING (true);

CREATE POLICY trusted_devices_login_insert ON public.trusted_devices
  FOR INSERT TO app_login WITH CHECK (true);

CREATE POLICY trusted_devices_login_update ON public.trusted_devices
  FOR UPDATE TO app_login USING (true) WITH CHECK (true);

CREATE POLICY trusted_devices_login_delete ON public.trusted_devices
  FOR DELETE TO app_login USING (true);

-- app_runtime herda global_admin_role que tem acesso total
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trusted_devices TO app_runtime;
