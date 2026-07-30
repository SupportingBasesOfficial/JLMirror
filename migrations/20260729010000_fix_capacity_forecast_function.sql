-- Migration: Corrige funcao calculate_linear_forecast para usar colunas do schema particionado
-- A migration 20260728000000_partitioning.sql recriou capacity_metrics com colunas diferentes
-- mas nao atualizou a funcao que as referencia

CREATE OR REPLACE FUNCTION public.calculate_linear_forecast(
  p_tenant_id UUID,
  p_resource_type TEXT,
  p_resource_name TEXT,
  p_metric_name TEXT
)
RETURNS TABLE(
  current_value DOUBLE PRECISION,
  predicted_7d DOUBLE PRECISION,
  predicted_30d DOUBLE PRECISION,
  predicted_90d DOUBLE PRECISION,
  slope DOUBLE PRECISION,
  r_squared DOUBLE PRECISION,
  days_until_capacity INTEGER,
  confidence TEXT
) AS $$
DECLARE
  v_count INTEGER;
  v_current DOUBLE PRECISION;
  v_max_capacity DOUBLE PRECISION;
  v_slope DOUBLE PRECISION;
  v_intercept DOUBLE PRECISION;
  v_r_squared DOUBLE PRECISION;
  v_row RECORD;
  v_sum_x DOUBLE PRECISION := 0;
  v_sum_y DOUBLE PRECISION := 0;
  v_sum_xy DOUBLE PRECISION := 0;
  v_sum_x2 DOUBLE PRECISION := 0;
  v_n INTEGER := 0;
  v_mean_x DOUBLE PRECISION;
  v_mean_y DOUBLE PRECISION;
  v_predicted_7d DOUBLE PRECISION;
  v_predicted_30d DOUBLE PRECISION;
  v_predicted_90d DOUBLE PRECISION;
  v_days_until INTEGER;
  v_conf TEXT := 'low';
BEGIN
  -- Conta pontos de dados dos ultimos 30 dias
  SELECT COUNT(*) INTO v_count
  FROM public.capacity_metrics
  WHERE tenant_id = p_tenant_id
    AND labels->>'resource_type' = p_resource_type
    AND resource_name = p_resource_name
    AND metric_type = p_metric_name
    AND recorded_at > timezone('utc'::text, now()) - INTERVAL '30 days';

  IF v_count < 5 THEN
    -- Dados insuficientes para previsao
    SELECT value INTO v_current
    FROM public.capacity_metrics
    WHERE tenant_id = p_tenant_id
      AND labels->>'resource_type' = p_resource_type
      AND resource_name = p_resource_name
      AND metric_type = p_metric_name
    ORDER BY recorded_at DESC LIMIT 1;

    RETURN QUERY SELECT COALESCE(v_current, 0::DOUBLE PRECISION), NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION, 0::DOUBLE PRECISION, 0::DOUBLE PRECISION, NULL::INTEGER, 'low'::TEXT;
    RETURN;
  END IF;

  -- Calcula regressao linear: y = slope * x + intercept
  FOR v_row IN
    SELECT value, EXTRACT(EPOCH FROM (recorded_at - timezone('utc'::text, now() - INTERVAL '30 days'))) / 86400 AS x
    FROM public.capacity_metrics
    WHERE tenant_id = p_tenant_id
      AND labels->>'resource_type' = p_resource_type
      AND resource_name = p_resource_name
      AND metric_type = p_metric_name
      AND recorded_at > timezone('utc'::text, now()) - INTERVAL '30 days'
    ORDER BY recorded_at ASC
  LOOP
    v_n := v_n + 1;
    v_sum_x := v_sum_x + v_row.x;
    v_sum_y := v_sum_y + v_row.value;
    v_sum_xy := v_sum_xy + (v_row.x * v_row.value);
    v_sum_x2 := v_sum_x2 + (v_row.x * v_row.x);
  END LOOP;

  v_mean_x := v_sum_x / v_n;
  v_mean_y := v_sum_y / v_n;

  -- slope = (n*sum_xy - sum_x*sum_y) / (n*sum_x2 - sum_x^2)
  v_slope := (v_n * v_sum_xy - v_sum_x * v_sum_y) / NULLIF(v_n * v_sum_x2 - v_sum_x * v_sum_x, 0);
  -- intercept = mean_y - slope * mean_x
  v_intercept := v_mean_y - COALESCE(v_slope, 0) * v_mean_x;

  -- Valor atual (ultimo ponto)
  SELECT value INTO v_current
  FROM public.capacity_metrics
  WHERE tenant_id = p_tenant_id
    AND labels->>'resource_type' = p_resource_type
    AND resource_name = p_resource_name
    AND metric_type = p_metric_name
  ORDER BY recorded_at DESC LIMIT 1;

  -- Max capacity (de labels)
  SELECT (labels->>'max_capacity')::DOUBLE PRECISION INTO v_max_capacity
  FROM public.capacity_metrics
  WHERE tenant_id = p_tenant_id
    AND labels->>'resource_type' = p_resource_type
    AND resource_name = p_resource_name
    AND metric_type = p_metric_name
    AND labels->>'max_capacity' IS NOT NULL
  ORDER BY recorded_at DESC LIMIT 1;

  -- R-squared
  v_r_squared := 0;
  BEGIN
    FOR v_row IN
      SELECT value, EXTRACT(EPOCH FROM (recorded_at - timezone('utc'::text, now() - INTERVAL '30 days'))) / 86400 AS x
      FROM public.capacity_metrics
      WHERE tenant_id = p_tenant_id
        AND labels->>'resource_type' = p_resource_type
        AND resource_name = p_resource_name
        AND metric_type = p_metric_name
        AND recorded_at > timezone('utc'::text, now()) - INTERVAL '30 days'
    LOOP
      v_r_squared := v_r_squared + POWER(v_row.value - (v_intercept + COALESCE(v_slope, 0) * v_row.x), 2);
    END LOOP;
    v_r_squared := 1 - (v_r_squared / NULLIF(v_n * POWER(v_stddev_samp(v_row.value), 2), 0));
  EXCEPTION WHEN OTHERS THEN
    v_r_squared := 0;
  END;

  -- Predicoes
  v_predicted_7d := v_intercept + COALESCE(v_slope, 0) * (EXTRACT(EPOCH FROM INTERVAL '37 days') / 86400);
  v_predicted_30d := v_intercept + COALESCE(v_slope, 0) * (EXTRACT(EPOCH FROM INTERVAL '60 days') / 86400);
  v_predicted_90d := v_intercept + COALESCE(v_slope, 0) * (EXTRACT(EPOCH FROM INTERVAL '120 days') / 86400);

  -- Dias ate capacidade
  v_days_until := NULL;
  IF v_max_capacity IS NOT NULL AND COALESCE(v_slope, 0) > 0 THEN
    v_days_until := FLOOR((v_max_capacity - v_intercept) / v_slope - EXTRACT(EPOCH FROM (now() - timezone('utc'::text, now() - INTERVAL '30 days'))) / 86400);
  END IF;

  -- Confianca
  IF v_r_squared >= 0.8 THEN
    v_conf := 'high';
  ELSIF v_r_squared >= 0.5 THEN
    v_conf := 'medium';
  ELSE
    v_conf := 'low';
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_current, 0::DOUBLE PRECISION),
    v_predicted_7d,
    v_predicted_30d,
    v_predicted_90d,
    COALESCE(v_slope, 0::DOUBLE PRECISION),
    COALESCE(v_r_squared, 0::DOUBLE PRECISION),
    v_days_until,
    v_conf::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.calculate_linear_forecast(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_linear_forecast(UUID, TEXT, TEXT, TEXT) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.calculate_linear_forecast(UUID, TEXT, TEXT, TEXT) TO app_login;
