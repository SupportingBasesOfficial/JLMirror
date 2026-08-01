-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: 002_auth_tables ===
-- Tabelas de autenticação global (Cluster 0)
-- users NÃO tem tenant_id — o mapeamento é em tenant_users

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_expires ON public.sessions(expires_at);

-- RLS: users e sessions são tabelas globais de auth
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- app_login precisa ler users para autenticar
CREATE POLICY users_login_select ON public.users
  FOR SELECT TO app_login USING (is_active = true);

-- app_login precisa manipular sessions
CREATE POLICY sessions_login_insert ON public.sessions
  FOR INSERT TO app_login WITH CHECK (true);
CREATE POLICY sessions_login_select ON public.sessions
  FOR SELECT TO app_login USING (true);
CREATE POLICY sessions_login_delete ON public.sessions
  FOR DELETE TO app_login USING (true);

-- Triggers de timestamp
CREATE TRIGGER set_timestamp_users
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER set_timestamp_sessions
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
