-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: AI Anomaly Detection ===
-- Deteccao estatistica de anomalias em metricas (Z-score, IQR, EWMA)

CREATE TABLE IF NOT EXISTS public.anomaly_detections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  -- Metrica analisada
  metric_name VARCHAR(200) NOT NULL,
  -- Algoritmo usado
  algorithm VARCHAR(20) NOT NULL CHECK (algorithm IN ('zscore', 'iqr', 'ewma', 'seasonal')),
  -- Valores
  observed_value DOUBLE PRECISION NOT NULL,
  expected_value DOUBLE PRECISION NOT NULL,
  deviation_score DOUBLE PRECISION NOT NULL,
  -- Thresholds
  threshold_low DOUBLE PRECISION,
  threshold_high DOUBLE PRECISION,
  -- Severity
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  -- Janela de analise
  window_size INT NOT NULL,
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
  acknowledged_by UUID REFERENCES public.users(id),
  acknowledged_at TIMESTAMPTZ,
  -- Metadados
  detected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_anomaly_detections_tenant ON public.anomaly_detections(tenant_id);
CREATE INDEX idx_anomaly_detections_device ON public.anomaly_detections(device_id);
CREATE INDEX idx_anomaly_detections_status ON public.anomaly_detections(status);
CREATE INDEX idx_anomaly_detections_detected ON public.anomaly_detections(detected_at DESC);

-- Configuracao de deteccao por tenant
CREATE TABLE IF NOT EXISTS public.anomaly_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Metrica a monitorar
  metric_name VARCHAR(200) NOT NULL,
  -- Algoritmo
  algorithm VARCHAR(20) NOT NULL DEFAULT 'zscore' CHECK (algorithm IN ('zscore', 'iqr', 'ewma', 'seasonal')),
  -- Parametros
  window_size INT NOT NULL DEFAULT 100,
  zscore_threshold DOUBLE PRECISION NOT NULL DEFAULT 3.0,
  iqr_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  ewma_alpha DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  -- Severity threshold
  warning_threshold DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  critical_threshold DOUBLE PRECISION NOT NULL DEFAULT 3.5,
  -- Metadados
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, metric_name, algorithm)
);

CREATE INDEX idx_anomaly_config_tenant ON public.anomaly_config(tenant_id);

-- RLS
ALTER TABLE public.anomaly_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomaly_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY anomaly_detections_tenant_isolation ON public.anomaly_detections
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY anomaly_detections_global_admin ON public.anomaly_detections
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY anomaly_config_tenant_isolation ON public.anomaly_config
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY anomaly_config_global_admin ON public.anomaly_config
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.anomaly_detections TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anomaly_detections TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anomaly_config TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anomaly_config TO app_runtime;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_anomaly_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_anomaly_config_updated_at
  BEFORE UPDATE ON public.anomaly_config
  FOR EACH ROW EXECUTE FUNCTION public.set_anomaly_config_updated_at();
