-- Migration: Corrige funcao search_system_logs para usar colunas do schema particionado
-- A migration 20260728000000_partitioning.sql recriou system_logs com colunas diferentes
-- metadata->payload, trace_id->correlation_id, tags/span_id/host/service removidos

DROP FUNCTION IF EXISTS public.search_system_logs(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) CASCADE;

CREATE FUNCTION public.search_system_logs(
  p_tenant_id UUID,
  p_level TEXT,
  p_source TEXT,
  p_service TEXT,
  p_message_pattern TEXT,
  p_tags TEXT[],
  p_trace_id TEXT,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  tenant_id UUID,
  source TEXT,
  level TEXT,
  message TEXT,
  payload JSONB,
  correlation_id TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.id, sl.tenant_id, sl.source, sl.level, sl.message,
    sl.payload, sl.correlation_id, sl.created_at
  FROM public.system_logs sl
  WHERE
    (p_tenant_id IS NULL OR sl.tenant_id = p_tenant_id)
    AND (p_level IS NULL OR sl.level = p_level)
    AND (p_source IS NULL OR sl.source = p_source)
    AND (p_service IS NULL OR sl.payload->>'service' = p_service)
    AND (p_message_pattern IS NULL OR sl.message ~ p_message_pattern)
    AND (p_tags IS NULL OR sl.payload ?| p_tags)
    AND (p_trace_id IS NULL OR sl.correlation_id = p_trace_id)
    AND (p_from IS NULL OR sl.created_at >= p_from)
    AND (p_to IS NULL OR sl.created_at <= p_to)
  ORDER BY sl.created_at DESC
  LIMIT LEAST(p_limit, 500)
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.search_system_logs(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_system_logs(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.search_system_logs(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO app_login;
