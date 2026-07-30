-- Migration: Recria view trace_summary dropada pelo CASCADE do partitioning
-- A migration 20260728000000_partitioning.sql fez DROP TABLE ... CASCADE
-- que dropou a view trace_summary sem recriá-la

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

GRANT SELECT ON public.trace_summary TO app_login;
GRANT SELECT ON public.trace_summary TO app_runtime;
