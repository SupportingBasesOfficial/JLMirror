-- ============================================================================
-- Generates the raw data for FINAL_DATABASE_DICTIONARY.md directly from the
-- LIVE, validated schema (source of truth = what was actually applied and
-- stress-tested, not the .sql file as text).
-- ============================================================================
\pset format unaligned
\pset tuples_only on
\pset fieldsep ''

-- ----------------------------------------------------------------------------
-- PART 1: Table summary (schema, table, column count, RLS enabled?)
-- ----------------------------------------------------------------------------
\o /tmp/dict_01_table_summary.txt
SELECT
  '| ' || t.table_schema || '.' || t.table_name || ' | ' ||
  (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) || ' | ' ||
  (SELECT c2.relrowsecurity::text FROM pg_class c2 JOIN pg_namespace n2 ON c2.relnamespace = n2.oid
     WHERE n2.nspname = t.table_schema AND c2.relname = t.table_name) || ' |'
FROM information_schema.tables t
WHERE t.table_schema IN ('public','tenant_template') AND t.table_type = 'BASE TABLE'
ORDER BY t.table_schema, t.table_name;
\o

-- ----------------------------------------------------------------------------
-- PART 2: Full column-level dictionary per table (the core deliverable)
-- ----------------------------------------------------------------------------
\o /tmp/dict_02_columns.txt
SELECT
  '### `' || c.table_schema || '.' || c.table_name || E'`\n\n' ||
  '| Column | Type | Nullable | Default |' || E'\n' ||
  '|---|---|---|---|' || E'\n' ||
  string_agg(
    '| ' || c.column_name || ' | ' ||
    CASE
      WHEN c.data_type = 'character varying' THEN 'VARCHAR(' || c.character_maximum_length || ')'
      WHEN c.data_type = 'numeric' AND c.numeric_precision IS NOT NULL THEN 'NUMERIC(' || c.numeric_precision || ',' || COALESCE(c.numeric_scale,0) || ')'
      WHEN c.data_type = 'timestamp with time zone' THEN 'TIMESTAMPTZ'
      WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
      WHEN c.data_type = 'ARRAY' THEN c.udt_name || '[]'
      ELSE upper(c.data_type)
    END || ' | ' ||
    CASE WHEN c.is_nullable = 'NO' THEN 'NOT NULL' ELSE 'nullable' END || ' | ' ||
    COALESCE(c.column_default, '') || ' |',
    E'\n' ORDER BY c.ordinal_position
  ) AS md_block
FROM information_schema.columns c
WHERE c.table_schema IN ('public','tenant_template')
GROUP BY c.table_schema, c.table_name
ORDER BY c.table_schema, c.table_name;
\o

-- ----------------------------------------------------------------------------
-- PART 3: Constraints (PK, FK, UNIQUE, CHECK) per table
-- ----------------------------------------------------------------------------
\o /tmp/dict_03_constraints.txt
SELECT
  tc.table_schema || '.' || tc.table_name || '||' ||
  tc.constraint_type || '||' ||
  tc.constraint_name || '||' ||
  COALESCE(string_agg(DISTINCT kcu.column_name, ', '), '') || '||' ||
  COALESCE(ccu.table_schema || '.' || ccu.table_name, '') || '||' ||
  COALESCE(rc.update_rule, '') || '/' || COALESCE(rc.delete_rule, '')
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name AND tc.constraint_type = 'FOREIGN KEY'
LEFT JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name AND tc.constraint_type = 'FOREIGN KEY'
WHERE tc.table_schema IN ('public','tenant_template')
GROUP BY tc.table_schema, tc.table_name, tc.constraint_type, tc.constraint_name, ccu.table_schema, ccu.table_name, rc.update_rule, rc.delete_rule
ORDER BY tc.table_schema, tc.table_name, tc.constraint_type;
\o

-- ----------------------------------------------------------------------------
-- PART 4: Indexes per table
-- ----------------------------------------------------------------------------
\o /tmp/dict_04_indexes.txt
SELECT schemaname || '.' || tablename || '||' || indexname || '||' || indexdef
FROM pg_indexes
WHERE schemaname IN ('public','tenant_template')
ORDER BY schemaname, tablename, indexname;
\o

-- ----------------------------------------------------------------------------
-- PART 5: RLS Policies per table
-- ----------------------------------------------------------------------------
\o /tmp/dict_05_policies.txt
SELECT schemaname || '.' || tablename || '||' || policyname || '||' || cmd || '||' || roles::text || '||' || COALESCE(qual,'')
FROM pg_policies
WHERE schemaname IN ('public','tenant_template')
ORDER BY schemaname, tablename, policyname;
\o

-- ----------------------------------------------------------------------------
-- PART 6: Tables WITH RLS enabled (vs without) — security coverage check
-- ----------------------------------------------------------------------------
\o /tmp/dict_06_rls_coverage.txt
SELECT n.nspname || '.' || c.relname || '||' || c.relrowsecurity::text || '||' || c.relforcerowsecurity::text
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname IN ('public','tenant_template') AND c.relkind = 'r'
ORDER BY n.nspname, c.relname;
\o

-- ----------------------------------------------------------------------------
-- PART 7: Functions (RPCs)
-- ----------------------------------------------------------------------------
\o /tmp/dict_07_functions.txt
SELECT n.nspname || '.' || p.proname || '||' || pg_get_function_arguments(p.oid) || '||' || pg_get_function_result(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prokind = 'f'
ORDER BY p.proname;
\o

-- ----------------------------------------------------------------------------
-- PART 8: Views
-- ----------------------------------------------------------------------------
\o /tmp/dict_08_views.txt
SELECT table_schema || '.' || table_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;
\o

-- ----------------------------------------------------------------------------
-- PART 9: Hypertables
-- ----------------------------------------------------------------------------
\o /tmp/dict_09_hypertables.txt
SELECT hypertable_name || '||' || num_dimensions::text || '||' || num_chunks::text
FROM timescaledb_information.hypertables;
\o

-- ----------------------------------------------------------------------------
-- PART 10: Partitioned tables
-- ----------------------------------------------------------------------------
\o /tmp/dict_10_partitioned.txt
SELECT parent.relname || '||' || string_agg(child.relname, ', ')
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
GROUP BY parent.relname
ORDER BY parent.relname;
\o
