-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Error Reports — captura estruturada de erros frontend com auto-ticket

-- Tabela de relatorios de erro do frontend
CREATE TABLE IF NOT EXISTS public.error_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Erro estruturado
  error_message TEXT NOT NULL,
  error_stack TEXT,
  component_stack TEXT,
  error_type TEXT, -- ex: 'ReactErrorBoundary', 'ApiError', 'UnhandledRejection'

  -- Contexto do erro
  url TEXT,
  route TEXT,
  user_agent TEXT,
  browser_info JSONB DEFAULT '{}'::jsonb,

  -- Ultimo estado conhecido (input/action que gerou o erro)
  last_action JSONB DEFAULT '{}'::jsonb,
  input_data JSONB DEFAULT '{}'::jsonb,

  -- Severity
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('warning','error','fatal')),

  -- Root cause analysis (preenchido depois pela equipe JL)
  root_cause TEXT,
  resolution TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','wontfix')),

  -- Tracing
  trace_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_error_reports_tenant ON public.error_reports (tenant_id, created_at DESC);
CREATE INDEX idx_error_reports_status ON public.error_reports (status);
CREATE INDEX idx_error_reports_ticket ON public.error_reports (ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX idx_error_reports_trace ON public.error_reports (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX idx_error_reports_severity ON public.error_reports (severity, created_at DESC);

-- RLS
ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY error_reports_tenant_isolation ON public.error_reports
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY error_reports_global_admin ON public.error_reports
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE ON public.error_reports TO app_login;
GRANT SELECT, INSERT, UPDATE ON public.error_reports TO app_runtime;

-- Trigger updated_at
CREATE TRIGGER set_updated_at_error_reports BEFORE UPDATE ON public.error_reports
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
