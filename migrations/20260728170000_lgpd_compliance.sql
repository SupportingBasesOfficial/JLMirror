-- === Migration: LGPD Compliance — Export e Delete de Dados Pessoais ===
-- Cria tabela para rastrear solicitações LGPD (Lei Geral de Proteção de Dados)
-- Permite exportar e anonimizar/deletar dados pessoais de usuários

CREATE TABLE IF NOT EXISTS public.lgpd_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id UUID,
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('export', 'delete', 'anonymize')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  requested_by UUID NOT NULL REFERENCES public.users(id),
  reason TEXT,
  export_data JSONB,
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_lgpd_requests_user_id ON public.lgpd_requests(user_id);
CREATE INDEX idx_lgpd_requests_status ON public.lgpd_requests(status);
CREATE INDEX idx_lgpd_requests_tenant_id ON public.lgpd_requests(tenant_id);

-- RLS para lgpd_requests
ALTER TABLE public.lgpd_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY lgpd_requests_login_select ON public.lgpd_requests
  FOR SELECT TO app_login USING (true);

CREATE POLICY lgpd_requests_login_insert ON public.lgpd_requests
  FOR INSERT TO app_login WITH CHECK (true);

CREATE POLICY lgpd_requests_login_update ON public.lgpd_requests
  FOR UPDATE TO app_login USING (true) WITH CHECK (true);

CREATE POLICY lgpd_requests_login_delete ON public.lgpd_requests
  FOR DELETE TO app_login USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lgpd_requests TO app_runtime;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_lgpd_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lgpd_requests_updated_at
  BEFORE UPDATE ON public.lgpd_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_lgpd_updated_at();
