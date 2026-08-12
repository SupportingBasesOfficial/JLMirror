-- ============================================================================
-- TEST 3: TimescaleDB Hypertables + Monthly RANGE Partitioning
-- ============================================================================
\echo '=== TEST 3: HYPERTABLES & PARTITIONING ==='
\pset footer off

-- ----------------------------------------------------------------------------
-- 3.1 HYPERTABLE: system_metrics — insert mock data across 3 historical months
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [3.1] Inserting system_metrics across 3 months (June, July, August 2026) ---'
INSERT INTO public.system_metrics (tenant_id, metric_name, metric_value, recorded_at)
SELECT
  '11111111-1111-1111-1111-111111111111',
  'cpu_usage_pct',
  (random() * 100)::numeric(5,2),
  ts
FROM generate_series(
  '2026-06-01 00:00:00+00'::timestamptz,
  '2026-06-30 23:00:00+00'::timestamptz,
  interval '6 hours'
) AS ts;

INSERT INTO public.system_metrics (tenant_id, metric_name, metric_value, recorded_at)
SELECT
  '11111111-1111-1111-1111-111111111111',
  'cpu_usage_pct',
  (random() * 100)::numeric(5,2),
  ts
FROM generate_series(
  '2026-07-01 00:00:00+00'::timestamptz,
  '2026-07-31 23:00:00+00'::timestamptz,
  interval '6 hours'
) AS ts;

INSERT INTO public.system_metrics (tenant_id, metric_name, metric_value, recorded_at)
SELECT
  '11111111-1111-1111-1111-111111111111',
  'cpu_usage_pct',
  (random() * 100)::numeric(5,2),
  ts
FROM generate_series(
  '2026-08-01 00:00:00+00'::timestamptz,
  '2026-08-11 23:00:00+00'::timestamptz,
  interval '6 hours'
) AS ts;

\echo '--- Total rows inserted into system_metrics ---'
SELECT count(*) AS total_rows FROM public.system_metrics;

\echo '--- Chunks created by TimescaleDB (expect ~1 chunk per day given 1-day chunk_time_interval) ---'
SELECT
  hypertable_name,
  count(*) AS chunk_count,
  min(range_start) AS earliest_chunk,
  max(range_end) AS latest_chunk
FROM timescaledb_information.chunks
WHERE hypertable_name = 'system_metrics'
GROUP BY hypertable_name;

\echo '--- Sample of chunks spanning the 3 months (first 5 and last 5) ---'
SELECT chunk_name, range_start, range_end
FROM timescaledb_information.chunks
WHERE hypertable_name = 'system_metrics'
ORDER BY range_start
LIMIT 5;

SELECT chunk_name, range_start, range_end
FROM timescaledb_information.chunks
WHERE hypertable_name = 'system_metrics'
ORDER BY range_start DESC
LIMIT 5;

\echo '--- Verify data integrity per month (grouped by month, using hypertable transparently) ---'
SELECT date_trunc('month', recorded_at) AS month, count(*) AS row_count
FROM public.system_metrics
GROUP BY 1 ORDER BY 1;

\echo '--- Retention policy registered on system_metrics (expect 90 days) ---'
SELECT hypertable_name, config FROM timescaledb_information.jobs
WHERE hypertable_name = 'system_metrics' AND proc_name = 'policy_retention';

-- ----------------------------------------------------------------------------
-- 3.2 RANGE-PARTITIONED TABLE: system_logs — manual monthly partitions
-- (simulates the maintenance job responsible for creating partitions ahead
-- of time, as documented in ideal_schema.sql Section 10)
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [3.2] Creating monthly partitions for system_logs (Jun/Jul/Aug 2026) ---'
CREATE TABLE IF NOT EXISTS public.system_logs_202606 PARTITION OF public.system_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS public.system_logs_202607 PARTITION OF public.system_logs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS public.system_logs_202608 PARTITION OF public.system_logs
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

\echo '--- Partitions registered under system_logs ---'
SELECT
  child.relname AS partition_name,
  pg_get_expr(child.relpartbound, child.oid) AS partition_range
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
WHERE parent.relname = 'system_logs'
ORDER BY partition_name;

\echo '--- Inserting mock logs across the 3 months ---'
INSERT INTO public.system_logs (tenant_id, source, level, message, created_at)
SELECT
  '11111111-1111-1111-1111-111111111111',
  'api-test-suite',
  (ARRAY['info','warn','error'])[1 + floor(random()*3)::int],
  'Mock log entry for partition test',
  ts
FROM generate_series(
  '2026-06-05 12:00:00+00'::timestamptz,
  '2026-06-25 12:00:00+00'::timestamptz,
  interval '2 days'
) AS ts;

INSERT INTO public.system_logs (tenant_id, source, level, message, created_at)
SELECT
  '11111111-1111-1111-1111-111111111111',
  'api-test-suite',
  (ARRAY['info','warn','error'])[1 + floor(random()*3)::int],
  'Mock log entry for partition test',
  ts
FROM generate_series(
  '2026-07-05 12:00:00+00'::timestamptz,
  '2026-07-25 12:00:00+00'::timestamptz,
  interval '2 days'
) AS ts;

INSERT INTO public.system_logs (tenant_id, source, level, message, created_at)
SELECT
  '11111111-1111-1111-1111-111111111111',
  'api-test-suite',
  (ARRAY['info','warn','error'])[1 + floor(random()*3)::int],
  'Mock log entry for partition test',
  ts
FROM generate_series(
  '2026-08-01 12:00:00+00'::timestamptz,
  '2026-08-11 12:00:00+00'::timestamptz,
  interval '2 days'
) AS ts;

\echo '--- Total rows across all system_logs partitions (queried via parent table) ---'
SELECT count(*) AS total_rows FROM public.system_logs;

\echo '--- CRITICAL CHECK: rows physically land in the CORRECT monthly partition ---'
SELECT 'system_logs_202606' AS partition, count(*) AS row_count FROM public.system_logs_202606
UNION ALL
SELECT 'system_logs_202607', count(*) FROM public.system_logs_202607
UNION ALL
SELECT 'system_logs_202608', count(*) FROM public.system_logs_202608
ORDER BY partition;

\echo '--- Cross-check: does querying the parent with a month filter correctly prune to 1 partition? (EXPLAIN) ---'
EXPLAIN (COSTS OFF)
SELECT * FROM public.system_logs WHERE created_at >= '2026-07-01' AND created_at < '2026-08-01';

\echo '--- Attempt to insert a log for a month with NO partition yet (Sept 2026) — expect ERROR (no partition of relation found) ---'
DO $$
BEGIN
  BEGIN
    INSERT INTO public.system_logs (tenant_id, source, level, message, created_at)
    VALUES ('11111111-1111-1111-1111-111111111111', 'test', 'info', 'should fail, no partition', '2026-09-15 00:00:00+00');
    RAISE NOTICE 'UNEXPECTED: insert into unpartitioned month succeeded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS (expected): insert correctly rejected — no partition exists for Sept 2026 (%)', SQLERRM;
  END;
END $$;

\echo ''
\echo '=== TEST 3 COMPLETE ==='
