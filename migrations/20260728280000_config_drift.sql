-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: Config Drift Detection ===
-- Detecta mudancas de configuracao de dispositivos vs baseline
-- Armazena baselines e eventos de drift

CREATE TABLE IF NOT EXISTS public.config_baselines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  -- Nome identificador do baseline
  name VARCHAR(200) NOT NULL,
  -- Configuracao baseline (JSON)
  config_snapshot JSONB NOT NULL,
  -- Metadados da captura
  config_hash VARCHAR(64) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  captured_by UUID REFERENCES public.users(id),
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(device_id, name)
);

CREATE INDEX idx_config_baselines_tenant ON public.config_baselines(tenant_id);
CREATE INDEX idx_config_baselines_device ON public.config_baselines(device_id);

CREATE TABLE IF NOT EXISTS public.config_drift_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  baseline_id UUID NOT NULL REFERENCES public.config_baselines(id) ON DELETE CASCADE,
  -- Tipo de drift
  drift_type VARCHAR(50) NOT NULL CHECK (drift_type IN ('added', 'removed', 'modified')),
  -- O que mudou
  config_path TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  -- Severity
  severity VARCHAR(20) NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  resolved_by UUID REFERENCES public.users(id),
  resolved_at TIMESTAMPTZ,
  -- Metadados
  detected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_config_drift_events_tenant ON public.config_drift_events(tenant_id);
CREATE INDEX idx_config_drift_events_device ON public.config_drift_events(device_id);
CREATE INDEX idx_config_drift_events_status ON public.config_drift_events(status);
CREATE INDEX idx_config_drift_events_detected ON public.config_drift_events(detected_at DESC);

-- RLS
ALTER TABLE public.config_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_drift_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY config_baselines_tenant_isolation ON public.config_baselines
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY config_baselines_global_admin ON public.config_baselines
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY config_drift_events_tenant_isolation ON public.config_drift_events
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY config_drift_events_global_admin ON public.config_drift_events
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.config_baselines TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.config_baselines TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.config_drift_events TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.config_drift_events TO app_runtime;

-- Trigger de updated_at para baselines
CREATE OR REPLACE FUNCTION public.set_config_baselines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_config_baselines_updated_at
  BEFORE UPDATE ON public.config_baselines
  FOR EACH ROW EXECUTE FUNCTION public.set_config_baselines_updated_at();
