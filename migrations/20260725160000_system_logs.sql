-- Migration: Tabela de logs centralizados com busca avançada e regex
-- Suporta logs de API, dispositivos, scripts, automações, etc.

CREATE TABLE IF NOT EXISTS public.system_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('trace','debug','info','warn','error','fatal')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  trace_id TEXT,
  span_id TEXT,
  host TEXT,
  service TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Extensão para busca trigram (regex e fuzzy) — deve ser criada antes dos índices
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indices para busca eficiente
CREATE INDEX idx_system_logs_tenant_created ON public.system_logs (tenant_id, created_at DESC);
CREATE INDEX idx_system_logs_level ON public.system_logs (level);
CREATE INDEX idx_system_logs_source ON public.system_logs (source);
CREATE INDEX idx_system_logs_service ON public.system_logs (service);
CREATE INDEX idx_system_logs_trace ON public.system_logs (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX idx_system_logs_tags ON public.system_logs USING GIN (tags);
CREATE INDEX idx_system_logs_metadata ON public.system_logs USING GIN (metadata);
CREATE INDEX idx_system_logs_message_trgm ON public.system_logs USING GIN (message gin_trgm_ops);

-- RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_logs_tenant_isolation ON public.system_logs
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY system_logs_global_admin ON public.system_logs
  FOR ALL
  USING (
    current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime')
  );

-- Permissões
GRANT SELECT, INSERT ON public.system_logs TO app_login;
GRANT SELECT, INSERT ON public.system_logs TO app_runtime;

-- Função para buscar logs com filtros avançados
CREATE OR REPLACE FUNCTION public.search_system_logs(
  p_tenant_id UUID DEFAULT NULL,
  p_level TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_service TEXT DEFAULT NULL,
  p_message_pattern TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_trace_id TEXT DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  source TEXT,
  level TEXT,
  message TEXT,
  metadata JSONB,
  tags TEXT[],
  trace_id TEXT,
  span_id TEXT,
  host TEXT,
  service TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.id, sl.tenant_id, sl.source, sl.level, sl.message,
    sl.metadata, sl.tags, sl.trace_id, sl.span_id, sl.host, sl.service,
    sl.created_at
  FROM public.system_logs sl
  WHERE
    (p_tenant_id IS NULL OR sl.tenant_id = p_tenant_id)
    AND (p_level IS NULL OR sl.level = p_level)
    AND (p_source IS NULL OR sl.source = p_source)
    AND (p_service IS NULL OR sl.service = p_service)
    AND (p_message_pattern IS NULL OR sl.message ~ p_message_pattern)
    AND (p_tags IS NULL OR sl.tags @> p_tags)
    AND (p_trace_id IS NULL OR sl.trace_id = p_trace_id)
    AND (p_from IS NULL OR sl.created_at >= p_from)
    AND (p_to IS NULL OR sl.created_at <= p_to)
  ORDER BY sl.created_at DESC
  LIMIT LEAST(p_limit, 500)
  OFFSET p_offset;
END;
$$;

-- Função para estatísticas de logs
CREATE OR REPLACE FUNCTION public.system_logs_stats(
  p_tenant_id UUID DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  level TEXT,
  count BIGINT,
  last_occurrence TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.level,
    COUNT(*)::bigint AS count,
    MAX(sl.created_at) AS last_occurrence
  FROM public.system_logs sl
  WHERE
    (p_tenant_id IS NULL OR sl.tenant_id = p_tenant_id)
    AND (p_from IS NULL OR sl.created_at >= p_from)
    AND (p_to IS NULL OR sl.created_at <= p_to)
  GROUP BY sl.level
  ORDER BY
    CASE sl.level
      WHEN 'fatal' THEN 1
      WHEN 'error' THEN 2
      WHEN 'warn' THEN 3
      WHEN 'info' THEN 4
      WHEN 'debug' THEN 5
      WHEN 'trace' THEN 6
    END;
END;
$$;

-- Função para top sources com mais logs
CREATE OR REPLACE FUNCTION public.system_logs_top_sources(
  p_tenant_id UUID DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  source TEXT,
  count BIGINT,
  last_occurrence TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.source,
    COUNT(*)::bigint AS count,
    MAX(sl.created_at) AS last_occurrence
  FROM public.system_logs sl
  WHERE
    (p_tenant_id IS NULL OR sl.tenant_id = p_tenant_id)
    AND (p_from IS NULL OR sl.created_at >= p_from)
    AND (p_to IS NULL OR sl.created_at <= p_to)
  GROUP BY sl.source
  ORDER BY count DESC
  LIMIT LEAST(p_limit, 50);
END;
$$;
