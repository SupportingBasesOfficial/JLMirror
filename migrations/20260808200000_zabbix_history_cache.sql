-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: zabbix_history_cache ===
-- Hypertable TimescaleDB para cache de history do Zabbix via connector streaming
-- Permite que o dashboard leia dados do TSDB em vez de bater na API do Zabbix
-- Se TimescaleDB nao estiver disponivel, funciona como tabela normal

-- Adiciona coluna para token do connector em tenant_routes
ALTER TABLE public.tenant_routes
  ADD COLUMN IF NOT EXISTS zabbix_connector_token TEXT;

-- Tabela de cache de history do Zabbix
CREATE TABLE IF NOT EXISTS public.zabbix_history_cache (
  id BIGSERIAL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  itemid TEXT NOT NULL,
  hostid TEXT NOT NULL,
  clock BIGINT NOT NULL,
  ns INTEGER NOT NULL DEFAULT 0,
  value TEXT NOT NULL,
  value_type SMALLINT NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, received_at)
);

-- Converte para hypertable se TimescaleDB estiver disponivel
DO $$
BEGIN
  BEGIN
    PERFORM create_hypertable(
      'public.zabbix_history_cache',
      'received_at',
      chunk_time_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
    RAISE NOTICE 'TimescaleDB hypertable criado para zabbix_history_cache';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TimescaleDB nao disponivel — zabbix_history_cache funciona como table normal (%)', SQLERRM;
  END;
END $$;

-- Indice para query por tenant + itemid + tempo (padrao de dashboard)
CREATE INDEX IF NOT EXISTS idx_zabbix_history_tenant_item_time
  ON public.zabbix_history_cache (tenant_id, itemid, clock DESC);

-- Indice para query por tenant + hostid (listar items de um host)
CREATE INDEX IF NOT EXISTS idx_zabbix_history_tenant_host
  ON public.zabbix_history_cache (tenant_id, hostid);

-- RLS para isolamento por tenant
ALTER TABLE public.zabbix_history_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zabbix_history_cache FORCE ROW LEVEL SECURITY;

CREATE POLICY zabbix_history_tenant_isolation ON public.zabbix_history_cache
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Compression policy — comprima dados mais antigos que 2 dias (90% reducao)
DO $$
BEGIN
  BEGIN
    PERFORM add_compression_policy('public.zabbix_history_cache', INTERVAL '2 days');
    RAISE NOTICE 'TimescaleDB compression policy adicionada (2 dias)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TimescaleDB compression nao disponivel (%)', SQLERRM;
  END;
END $$;

-- Retention policy — droppa dados mais antigos que 30 dias (history quente)
DO $$
BEGIN
  BEGIN
    PERFORM add_retention_policy('public.zabbix_history_cache', INTERVAL '30 days');
    RAISE NOTICE 'TimescaleDB retention policy adicionada (30 dias)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TimescaleDB retention nao disponivel (%)', SQLERRM;
  END;
END $$;

-- Grants para app_runtime
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zabbix_history_cache TO app_runtime;
