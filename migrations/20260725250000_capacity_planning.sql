-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Capacity Planning & Reports — métricas, thresholds, relatórios, previsões

CREATE TABLE IF NOT EXISTS public.capacity_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_name TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('cpu','memory','disk','network','storage','database','cluster','service')),
  resource_id TEXT,
  metric_name TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  metric_unit TEXT NOT NULL,
  max_capacity DOUBLE PRECISION,
  utilization_pct DOUBLE PRECISION,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_capacity_metrics_tenant ON public.capacity_metrics (tenant_id, collected_at DESC);
CREATE INDEX idx_capacity_metrics_resource ON public.capacity_metrics (resource_type, resource_name, collected_at DESC);
CREATE INDEX idx_capacity_metrics_metric ON public.capacity_metrics (metric_name, collected_at DESC);

-- Thresholds de alerta por recurso
CREATE TABLE IF NOT EXISTS public.capacity_thresholds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('cpu','memory','disk','network','storage','database','cluster','service')),
  resource_name TEXT NOT NULL,
  warning_pct DOUBLE PRECISION NOT NULL DEFAULT 70,
  critical_pct DOUBLE PRECISION NOT NULL DEFAULT 90,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, resource_type, resource_name)
);

CREATE INDEX idx_capacity_thresholds_tenant ON public.capacity_thresholds (tenant_id, is_active);

-- Relatórios programados
CREATE TABLE IF NOT EXISTS public.capacity_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('capacity_summary','trend_analysis','forecast','utilization_breakdown','custom')),
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','completed','failed','scheduled')),
  file_path TEXT,
  file_size_bytes BIGINT,
  summary JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  generated_by UUID REFERENCES public.users(id),
  generated_at TIMESTAMPTZ,
  is_scheduled BOOLEAN NOT NULL DEFAULT false,
  cron_expression TEXT,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_capacity_reports_tenant ON public.capacity_reports (tenant_id, created_at DESC);
CREATE INDEX idx_capacity_reports_status ON public.capacity_reports (status);

-- Previsões de capacidade (linear regression simplificada)
CREATE TABLE IF NOT EXISTS public.capacity_forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  forecast_method TEXT NOT NULL DEFAULT 'linear' CHECK (forecast_method IN ('linear','exponential','moving_average')),
  current_value DOUBLE PRECISION NOT NULL,
  predicted_value_7d DOUBLE PRECISION,
  predicted_value_30d DOUBLE PRECISION,
  predicted_value_90d DOUBLE PRECISION,
  slope DOUBLE PRECISION,
  r_squared DOUBLE PRECISION,
  days_until_capacity INT,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low','medium','high')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_capacity_forecasts_tenant ON public.capacity_forecasts (tenant_id, generated_at DESC);
CREATE INDEX idx_capacity_forecasts_resource ON public.capacity_forecasts (resource_type, resource_name);

-- RLS
ALTER TABLE public.capacity_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY capacity_metrics_tenant_isolation ON public.capacity_metrics
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY capacity_metrics_global_admin ON public.capacity_metrics
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY capacity_thresholds_tenant_isolation ON public.capacity_thresholds
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY capacity_thresholds_global_admin ON public.capacity_thresholds
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY capacity_reports_tenant_isolation ON public.capacity_reports
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY capacity_reports_global_admin ON public.capacity_reports
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY capacity_forecasts_tenant_isolation ON public.capacity_forecasts
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY capacity_forecasts_global_admin ON public.capacity_forecasts
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_metrics TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_metrics TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_thresholds TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_thresholds TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_reports TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_reports TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_forecasts TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_forecasts TO app_runtime;

-- Triggers
CREATE TRIGGER set_updated_at_capacity_thresholds BEFORE UPDATE ON public.capacity_thresholds
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER set_updated_at_capacity_reports BEFORE UPDATE ON public.capacity_reports
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Funcao para calcular regressao linear e previsao
CREATE OR REPLACE FUNCTION public.calculate_linear_forecast(
  p_tenant_id UUID,
  p_resource_type TEXT,
  p_resource_name TEXT,
  p_metric_name TEXT,
  p_days INT DEFAULT 90
)
RETURNS TABLE (
  current_value DOUBLE PRECISION,
  predicted_7d DOUBLE PRECISION,
  predicted_30d DOUBLE PRECISION,
  predicted_90d DOUBLE PRECISION,
  slope DOUBLE PRECISION,
  r_squared DOUBLE PRECISION,
  days_until_capacity INT,
  confidence TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
  v_sum_x DOUBLE PRECISION := 0;
  v_sum_y DOUBLE PRECISION := 0;
  v_sum_xy DOUBLE PRECISION := 0;
  v_sum_x2 DOUBLE PRECISION := 0;
  v_mean_x DOUBLE PRECISION;
  v_mean_y DOUBLE PRECISION;
  v_slope DOUBLE PRECISION;
  v_intercept DOUBLE PRECISION;
  v_current DOUBLE PRECISION;
  v_max_capacity DOUBLE PRECISION;
  v_ss_tot DOUBLE PRECISION := 0;
  v_ss_res DOUBLE PRECISION := 0;
  v_r2 DOUBLE PRECISION;
  v_days_left INT;
  v_conf TEXT := 'low';
  v_row RECORD;
  v_i INT := 0;
BEGIN
  -- Conta pontos de dados dos ultimos 30 dias
  SELECT COUNT(*) INTO v_count
  FROM public.capacity_metrics
  WHERE tenant_id = p_tenant_id
    AND resource_type = p_resource_type
    AND resource_name = p_resource_name
    AND metric_name = p_metric_name
    AND collected_at > timezone('utc'::text, now()) - INTERVAL '30 days';

  IF v_count < 5 THEN
    -- Dados insuficientes para previsao
    SELECT metric_value INTO v_current
    FROM public.capacity_metrics
    WHERE tenant_id = p_tenant_id
      AND resource_type = p_resource_type
      AND resource_name = p_resource_name
      AND metric_name = p_metric_name
    ORDER BY collected_at DESC LIMIT 1;

    RETURN QUERY SELECT
      COALESCE(v_current, 0),
      NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION,
      0, 0, NULL::INT, 'low';
    RETURN;
  END IF;

  -- Calcula regressao linear: y = slope * x + intercept
  FOR v_row IN
    SELECT metric_value, EXTRACT(EPOCH FROM (collected_at - timezone('utc'::text, now() - INTERVAL '30 days'))) / 86400 AS x
    FROM public.capacity_metrics
    WHERE tenant_id = p_tenant_id
      AND resource_type = p_resource_type
      AND resource_name = p_resource_name
      AND metric_name = p_metric_name
      AND collected_at > timezone('utc'::text, now()) - INTERVAL '30 days'
    ORDER BY collected_at
  LOOP
    v_i := v_i + 1;
    v_sum_x := v_sum_x + v_row.x;
    v_sum_y := v_sum_y + v_row.metric_value;
    v_sum_xy := v_sum_xy + v_row.x * v_row.metric_value;
    v_sum_x2 := v_sum_x2 + v_row.x * v_row.x;
  END LOOP;

  v_mean_x := v_sum_x / v_i;
  v_mean_y := v_sum_y / v_i;
  v_slope := (v_i * v_sum_xy - v_sum_x * v_sum_y) / NULLIF(v_i * v_sum_x2 - v_sum_x * v_sum_x, 0);
  v_intercept := v_mean_y - v_slope * v_mean_x;

  -- Valor atual (ultimo ponto)
  SELECT metric_value INTO v_current
  FROM public.capacity_metrics
  WHERE tenant_id = p_tenant_id
    AND resource_type = p_resource_type
    AND resource_name = p_resource_name
    AND metric_name = p_metric_name
  ORDER BY collected_at DESC LIMIT 1;

  -- Max capacity
  SELECT max_capacity INTO v_max_capacity
  FROM public.capacity_metrics
  WHERE tenant_id = p_tenant_id
    AND resource_type = p_resource_type
    AND resource_name = p_resource_name
    AND metric_name = p_metric_name
    AND max_capacity IS NOT NULL
  ORDER BY collected_at DESC LIMIT 1;

  -- R-squared
  FOR v_row IN
    SELECT metric_value, EXTRACT(EPOCH FROM (collected_at - timezone('utc'::text, now() - INTERVAL '30 days'))) / 86400 AS x
    FROM public.capacity_metrics
    WHERE tenant_id = p_tenant_id
      AND resource_type = p_resource_type
      AND resource_name = p_resource_name
      AND metric_name = p_metric_name
      AND collected_at > timezone('utc'::text, now()) - INTERVAL '30 days'
    ORDER BY collected_at
  LOOP
    v_ss_tot := v_ss_tot + POWER(v_row.metric_value - v_mean_y, 2);
    v_ss_res := v_ss_res + POWER(v_row.metric_value - (v_slope * v_row.x + v_intercept), 2);
  END LOOP;

  v_r2 := 1 - (v_ss_res / NULLIF(v_ss_tot, 0));
  IF v_r2 IS NULL THEN v_r2 := 0; END IF;

  -- Confianca baseada em R-squared
  IF v_r2 >= 0.8 THEN v_conf := 'high';
  ELSIF v_r2 >= 0.5 THEN v_conf := 'medium';
  ELSE v_conf := 'low'; END IF;

  -- Dias ate capacidade maxima
  IF v_slope > 0 AND v_max_capacity IS NOT NULL AND v_max_capacity > v_current THEN
    v_days_left := FLOOR((v_max_capacity - v_current) / v_slope);
  ELSE
    v_days_left := NULL;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_current, 0),
    CASE WHEN v_slope > 0 THEN v_current + v_slope * 7 ELSE NULL END,
    CASE WHEN v_slope > 0 THEN v_current + v_slope * 30 ELSE NULL END,
    CASE WHEN v_slope > 0 THEN v_current + v_slope * 90 ELSE NULL END,
    v_slope,
    v_r2,
    v_days_left,
    v_conf;
END;
$$;
