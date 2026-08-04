-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- TimescaleDB — hypertable para metricas internas do JLMIRROR
-- Permite ingestao de alta frequencia com auto-particionamento e compressao automatica
-- Se TimescaleDB nao estiver disponivel, a table funciona como table normal

-- Habilita extensao (ignora erro se nao estiver instalada)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Tabela de metricas internas do sistema (latencia, throughput, pool stats, etc)
CREATE TABLE IF NOT EXISTS public.system_metrics (
  id BIGSERIAL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  labels JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, recorded_at)
);

-- Converte para hypertable se TimescaleDB estiver disponivel
-- chunk_interval de 1 dia — ideal para metricas com alta frequencia de escrita
DO $$
BEGIN
  BEGIN
    PERFORM create_hypertable(
      'public.system_metrics',
      'recorded_at',
      chunk_time_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
    RAISE NOTICE 'TimescaleDB hypertable criado para system_metrics';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TimescaleDB nao disponivel — system_metrics funciona como table normal (%)', SQLERRM;
  END;
END $$;

-- Indice para queries por metric_name + tenant_id + tempo
CREATE INDEX IF NOT EXISTS idx_system_metrics_name_tenant_time
  ON public.system_metrics (metric_name, tenant_id, recorded_at DESC);

-- Indice GIN para labels JSONB
CREATE INDEX IF NOT EXISTS idx_system_metrics_labels_gin
  ON public.system_metrics USING GIN (labels);

-- RLS para isolamento por tenant
ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_metrics FORCE ROW LEVEL SECURITY;

CREATE POLICY system_metrics_tenant_isolation ON public.system_metrics
  USING (tenant_id::text = current_setting('app.current_tenant_id', true) OR tenant_id IS NULL);

-- Compression policy — comprima dados mais antigos que 7 dias (90% reducao de espaco)
DO $$
BEGIN
  BEGIN
    PERFORM add_compression_policy('public.system_metrics', INTERVAL '7 days');
    RAISE NOTICE 'TimescaleDB compression policy adicionada (7 dias)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TimescaleDB compression nao disponivel (%)', SQLERRM;
  END;
END $$;

-- Retention policy — droppa dados mais antigos que 90 dias
DO $$
BEGIN
  BEGIN
    PERFORM add_retention_policy('public.system_metrics', INTERVAL '90 days');
    RAISE NOTICE 'TimescaleDB retention policy adicionada (90 dias)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TimescaleDB retention nao disponivel (%)', SQLERRM;
  END;
END $$;
