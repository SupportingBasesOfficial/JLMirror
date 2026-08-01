-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Particionamento declarativo de tabelas de alta escrita
-- Converte system_logs, trace_spans e capacity_metrics para PARTITION BY RANGE (created_at)
-- Cria partições mensais dinamicamente e configura autovacuum agressivo

-- ============================================================
-- system_logs — particionada por mês em created_at
-- ============================================================

-- Renomeia tabela original para preservar dados
ALTER TABLE IF EXISTS public.system_logs RENAME TO system_logs_old;

-- Cria tabela particionada
CREATE TABLE IF NOT EXISTS public.system_logs (
  id UUID DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('debug','info','warn','error','fatal')),
  message TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Cria partições para os próximos 3 meses + mês atual (antes do INSERT)
DO $$
DECLARE
  month_start DATE;
  month_end DATE;
  partition_name TEXT;
  i INTEGER;
BEGIN
  FOR i IN 0..3 LOOP
    month_start := DATE_TRUNC('month', CURRENT_DATE + (i || ' month')::INTERVAL)::DATE;
    month_end := (month_start + INTERVAL '1 month')::DATE;
    partition_name := 'system_logs_' || TO_CHAR(month_start, 'YYYYMM');
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.system_logs FOR VALUES FROM (%L) TO (%L)', partition_name, month_start, month_end);
  END LOOP;
END $$;

-- Migra dados da tabela antiga (mapeamento explicito — schema mudou)
INSERT INTO public.system_logs (id, tenant_id, source, level, message, payload, correlation_id, created_at)
SELECT id, tenant_id, source, level, message, metadata, trace_id, created_at
FROM public.system_logs_old
ON CONFLICT DO NOTHING;

-- Recria índices na tabela particionada
CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_created ON public.system_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_source ON public.system_logs (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs (level) WHERE level IN ('error', 'fatal');
CREATE INDEX IF NOT EXISTS idx_system_logs_correlation ON public.system_logs (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_logs_payload ON public.system_logs USING GIN (payload);

-- RLS na tabela particionada
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY system_logs_tenant_isolation ON public.system_logs
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Drop tabela antiga após migração bem-sucedida
DROP TABLE IF EXISTS public.system_logs_old CASCADE;

-- ============================================================
-- trace_spans — particionada por mês em created_at
-- ============================================================

ALTER TABLE IF EXISTS public.trace_spans RENAME TO trace_spans_old;

CREATE TABLE IF NOT EXISTS public.trace_spans (
  id UUID DEFAULT uuid_generate_v4(),
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

DO $$
DECLARE
  month_start DATE;
  month_end DATE;
  partition_name TEXT;
  i INTEGER;
BEGIN
  FOR i IN 0..3 LOOP
    month_start := DATE_TRUNC('month', CURRENT_DATE + (i || ' month')::INTERVAL)::DATE;
    month_end := (month_start + INTERVAL '1 month')::DATE;
    partition_name := 'trace_spans_' || TO_CHAR(month_start, 'YYYYMM');
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.trace_spans FOR VALUES FROM (%L) TO (%L)', partition_name, month_start, month_end);
  END LOOP;
END $$;

INSERT INTO public.trace_spans (id, trace_id, span_id, parent_span_id, tenant_id, operation_name, service, kind, start_time, end_time, duration_ms, status, status_message, attributes, events, resource, created_at)
SELECT id, trace_id, span_id, parent_span_id, tenant_id, operation_name, service, kind, start_time, end_time, duration_ms, status, status_message, attributes, events, resource, created_at
FROM public.trace_spans_old
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_trace_spans_trace ON public.trace_spans (trace_id, start_time);
CREATE INDEX IF NOT EXISTS idx_trace_spans_tenant ON public.trace_spans (tenant_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_trace_spans_service ON public.trace_spans (service, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_trace_spans_status ON public.trace_spans (status) WHERE status = 'error';
CREATE INDEX IF NOT EXISTS idx_trace_spans_operation ON public.trace_spans (operation_name);
CREATE INDEX IF NOT EXISTS idx_trace_spans_attributes ON public.trace_spans USING GIN (attributes);

ALTER TABLE public.trace_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trace_spans FORCE ROW LEVEL SECURITY;
CREATE POLICY trace_spans_tenant_isolation ON public.trace_spans
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

DROP TABLE IF EXISTS public.trace_spans_old CASCADE;

-- ============================================================
-- capacity_metrics — particionada por mês em created_at
-- ============================================================

ALTER TABLE IF EXISTS public.capacity_metrics RENAME TO capacity_metrics_old;

CREATE TABLE IF NOT EXISTS public.capacity_metrics (
  id UUID DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_name TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  unit TEXT,
  labels JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

DO $$
DECLARE
  month_start DATE;
  month_end DATE;
  partition_name TEXT;
  i INTEGER;
BEGIN
  FOR i IN 0..3 LOOP
    month_start := DATE_TRUNC('month', CURRENT_DATE + (i || ' month')::INTERVAL)::DATE;
    month_end := (month_start + INTERVAL '1 month')::DATE;
    partition_name := 'capacity_metrics_' || TO_CHAR(month_start, 'YYYYMM');
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.capacity_metrics FOR VALUES FROM (%L) TO (%L)', partition_name, month_start, month_end);
  END LOOP;
END $$;

INSERT INTO public.capacity_metrics (id, tenant_id, resource_name, metric_type, value, unit, labels, recorded_at, created_at)
SELECT id, tenant_id, resource_name, metric_name, metric_value, metric_unit, metadata, collected_at, collected_at
FROM public.capacity_metrics_old
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_capacity_metrics_tenant_created ON public.capacity_metrics (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capacity_metrics_resource ON public.capacity_metrics (resource_name, metric_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capacity_metrics_labels ON public.capacity_metrics USING GIN (labels);

ALTER TABLE public.capacity_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_metrics FORCE ROW LEVEL SECURITY;
CREATE POLICY capacity_metrics_tenant_isolation ON public.capacity_metrics
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

DROP TABLE IF EXISTS public.capacity_metrics_old CASCADE;
