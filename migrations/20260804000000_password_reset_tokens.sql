-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: password_reset_tokens ===
-- Tokens de recuperacao de senha (fluxo "esqueci minha senha")
-- Token bruto NUNCA e armazenado — apenas o hash SHA-256

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_expires ON public.password_reset_tokens(expires_at);

-- RLS: tabela global de auth — mesmo padrao de public.sessions
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- app_login precisa manipular tokens de reset (fluxo nao autenticado)
CREATE POLICY password_reset_tokens_login_insert ON public.password_reset_tokens
  FOR INSERT TO app_login WITH CHECK (true);
CREATE POLICY password_reset_tokens_login_select ON public.password_reset_tokens
  FOR SELECT TO app_login USING (true);
CREATE POLICY password_reset_tokens_login_update ON public.password_reset_tokens
  FOR UPDATE TO app_login USING (true);
CREATE POLICY password_reset_tokens_login_delete ON public.password_reset_tokens
  FOR DELETE TO app_login USING (true);
