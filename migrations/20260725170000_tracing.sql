-- Migration: Tracing distribuido — trace_spans para armazenar spans OpenTelemetry
-- Suporta visualizacao de timeline/Gantt por trace_id

CREATE TABLE IF NOT EXISTS public.trace_spans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  operation_name TEXT NOT NULL,
  service TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'internal' CHECK (kind IN ('server','client','producer','consumer','internal')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error','unset')),
  status_message TEXT,
  attributes JSONB DEFAULT '{}'::jsonb,
  events JSONB DEFAULT '[]'::jsonb,
  resource JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indices
CREATE INDEX idx_trace_spans_trace ON public.trace_spans (trace_id, start_time);
CREATE INDEX idx_trace_spans_tenant ON public.trace_spans (tenant_id, start_time DESC);
CREATE INDEX idx_trace_spans_service ON public.trace_spans (service, start_time DESC);
CREATE INDEX idx_trace_spans_status ON public.trace_spans (status) WHERE status = 'error';
CREATE INDEX idx_trace_spans_operation ON public.trace_spans (operation_name);
CREATE INDEX idx_trace_spans_attributes ON public.trace_spans USING GIN (attributes);

-- RLS
ALTER TABLE public.trace_spans ENABLE ROW LEVEL SECURITY;

CREATE POLICY trace_spans_tenant_isolation ON public.trace_spans
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY trace_spans_global_admin ON public.trace_spans
  FOR ALL
  USING (
    current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime')
  );

-- Permissoes
GRANT SELECT, INSERT ON public.trace_spans TO app_login;
GRANT SELECT, INSERT ON public.trace_spans TO app_runtime;

-- View agregada por trace (para listagem)
CREATE OR REPLACE VIEW public.trace_summary AS
SELECT
  trace_id,
  MIN(start_time) AS start_time,
  MAX(end_time) AS end_time,
  MAX(end_time) - MIN(start_time) AS total_duration,
  EXTRACT(EPOCH FROM (MAX(end_time) - MIN(start_time))) * 1000 AS total_duration_ms,
  COUNT(*) AS span_count,
  COUNT(*) FILTER (WHERE status = 'error') AS error_count,
  COUNT(DISTINCT service) AS service_count,
  (ARRAY_AGG(DISTINCT service))[1] AS primary_service,
  (ARRAY_AGG(DISTINCT operation_name))[1] AS root_operation,
  (MIN(tenant_id::text))::uuid AS tenant_id
FROM public.trace_spans
GROUP BY trace_id;

-- Permissao na view
GRANT SELECT ON public.trace_summary TO app_login;
GRANT SELECT ON public.trace_summary TO app_runtime;

-- Funcao para buscar traces com filtros
CREATE OR REPLACE FUNCTION public.search_traces(
  p_tenant_id UUID DEFAULT NULL,
  p_service TEXT DEFAULT NULL,
  p_operation TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_min_duration_ms INTEGER DEFAULT NULL,
  p_max_duration_ms INTEGER DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  trace_id TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  total_duration_ms DOUBLE PRECISION,
  span_count BIGINT,
  error_count BIGINT,
  service_count BIGINT,
  primary_service TEXT,
  root_operation TEXT,
  tenant_id UUID
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.trace_id::text,
    ts.start_time,
    ts.end_time,
    ts.total_duration_ms::double precision,
    ts.span_count::bigint,
    ts.error_count::bigint,
    ts.service_count::bigint,
    ts.primary_service::text,
    ts.root_operation::text,
    ts.tenant_id::uuid
  FROM public.trace_summary ts
  WHERE
    (p_tenant_id IS NULL OR ts.tenant_id = p_tenant_id)
    AND (p_service IS NULL OR ts.primary_service = p_service)
    AND (p_operation IS NULL OR ts.root_operation ILIKE '%' || p_operation || '%')
    AND (p_status IS NULL OR (p_status = 'error' AND ts.error_count > 0))
    AND (p_min_duration_ms IS NULL OR ts.total_duration_ms >= p_min_duration_ms)
    AND (p_max_duration_ms IS NULL OR ts.total_duration_ms <= p_max_duration_ms)
    AND (p_from IS NULL OR ts.start_time >= p_from)
    AND (p_to IS NULL OR ts.start_time <= p_to)
  ORDER BY ts.start_time DESC
  LIMIT LEAST(p_limit, 200)
  OFFSET p_offset;
END;
$$;

-- Funcao para estatisticas de traces
CREATE OR REPLACE FUNCTION public.traces_stats(
  p_tenant_id UUID DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  service TEXT,
  span_count BIGINT,
  error_count BIGINT,
  avg_duration_ms DOUBLE PRECISION,
  max_duration_ms DOUBLE PRECISION,
  last_occurrence TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.service,
    COUNT(*)::bigint AS span_count,
    COUNT(*) FILTER (WHERE ts.status = 'error')::bigint AS error_count,
    AVG(ts.duration_ms)::double precision AS avg_duration_ms,
    MAX(ts.duration_ms)::double precision AS max_duration_ms,
    MAX(ts.end_time) AS last_occurrence
  FROM public.trace_spans ts
  WHERE
    (p_tenant_id IS NULL OR ts.tenant_id = p_tenant_id)
    AND (p_from IS NULL OR ts.start_time >= p_from)
    AND (p_to IS NULL OR ts.start_time <= p_to)
  GROUP BY ts.service
  ORDER BY span_count DESC
  LIMIT 20;
END;
$$;
