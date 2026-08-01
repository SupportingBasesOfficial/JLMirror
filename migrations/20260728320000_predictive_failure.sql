-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: Predictive Failure ===
-- Predicao de falhas baseada em tendencias de metricas e degradacao historica

CREATE TABLE IF NOT EXISTS public.failure_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  -- Metrica analisada
  metric_name VARCHAR(200) NOT NULL,
  -- Modelo de predicao
  model_type VARCHAR(30) NOT NULL CHECK (model_type IN ('linear_trend', 'exponential', 'moving_average', 'threshold_proximity')),
  -- Resultado da predicao
  predicted_failure BOOLEAN NOT NULL DEFAULT false,
  failure_probability DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (failure_probability >= 0 AND failure_probability <= 1),
  -- Estimativa de quando a falha ocorrera
  estimated_failure_hours INT,
  estimated_failure_at TIMESTAMPTZ,
  -- Dados do modelo
  current_value DOUBLE PRECISION NOT NULL,
  predicted_value DOUBLE PRECISION NOT NULL,
  threshold_value DOUBLE PRECISION NOT NULL,
  trend_slope DOUBLE PRECISION,
  r_squared DOUBLE PRECISION,
  -- Severity
  severity VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'mitigated', 'occurred', 'false_positive')),
  acknowledged_by UUID REFERENCES public.users(id),
  acknowledged_at TIMESTAMPTZ,
  -- Metadados
  detected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_failure_predictions_tenant ON public.failure_predictions(tenant_id);
CREATE INDEX idx_failure_predictions_device ON public.failure_predictions(device_id);
CREATE INDEX idx_failure_predictions_status ON public.failure_predictions(status);
CREATE INDEX idx_failure_predictions_detected ON public.failure_predictions(detected_at DESC);

-- Configuracao de predicao por metrica
CREATE TABLE IF NOT EXISTS public.prediction_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_name VARCHAR(200) NOT NULL,
  -- Modelo
  model_type VARCHAR(30) NOT NULL DEFAULT 'linear_trend' CHECK (model_type IN ('linear_trend', 'exponential', 'moving_average', 'threshold_proximity')),
  -- Parametros
  window_size INT NOT NULL DEFAULT 168,
  threshold_value DOUBLE PRECISION NOT NULL,
  threshold_direction VARCHAR(10) NOT NULL DEFAULT 'above' CHECK (threshold_direction IN ('above', 'below')),
  prediction_horizon_hours INT NOT NULL DEFAULT 72,
  warning_probability DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  critical_probability DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  -- Metadados
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, metric_name, model_type)
);

CREATE INDEX idx_prediction_config_tenant ON public.prediction_config(tenant_id);

-- RLS
ALTER TABLE public.failure_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY failure_predictions_tenant_isolation ON public.failure_predictions
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY failure_predictions_global_admin ON public.failure_predictions
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY prediction_config_tenant_isolation ON public.prediction_config
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY prediction_config_global_admin ON public.prediction_config
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.failure_predictions TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.failure_predictions TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prediction_config TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prediction_config TO app_runtime;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_prediction_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prediction_config_updated_at
  BEFORE UPDATE ON public.prediction_config
  FOR EACH ROW EXECUTE FUNCTION public.set_prediction_config_updated_at();
