-- === Migration: 007_onboarding_functions ===
-- Função clone_schema() copia estrutura do tenant_template para novo schema
-- Função onboard_tenant_schema() orquestra o onboarding com validação anti-injection

CREATE OR REPLACE FUNCTION public.clone_schema(
  source_schema TEXT,
  dest_schema TEXT
) RETURNS void AS $$
DECLARE
  tbl RECORD;
  pol RECORD;
BEGIN
  -- Copia tabelas com INCLUDING ALL (índices, constraints, defaults, comments)
  FOR tbl IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = source_schema AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I.%I (LIKE %I.%I INCLUDING ALL)',
      dest_schema, tbl.table_name,
      source_schema, tbl.table_name
    );
  END LOOP;

  -- Copia policies de RLS (substitui schema_name no qual e with_check)
  FOR pol IN
    SELECT policyname, tablename, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = source_schema
  LOOP
    IF pol.with_check IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR %s USING (%s) WITH CHECK (%s)',
        pol.policyname,
        dest_schema,
        pol.tablename,
        pol.cmd,
        replace(pol.qual, source_schema, dest_schema),
        replace(pol.with_check, source_schema, dest_schema)
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR %s USING (%s)',
        pol.policyname,
        dest_schema,
        pol.tablename,
        pol.cmd,
        replace(pol.qual, source_schema, dest_schema)
      );
    END IF;
  END LOOP;

  -- Habilita RLS nas novas tabelas
  FOR tbl IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = source_schema AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', dest_schema, tbl.table_name);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.onboard_tenant_schema(p_slug TEXT)
RETURNS void AS $$
BEGIN
  -- Validação anti-injection: slug deve conter apenas [a-z0-9-]
  IF p_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Slug inválido: deve conter apenas [a-z0-9-]';
  END IF;

  -- Cria schema do tenant usando format(%I) para quote seguro
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', 'tenant_' || p_slug);

  -- Copia estrutura do tenant_template
  EXECUTE format(
    'SELECT public.clone_schema(%L, %L)',
    'tenant_template',
    'tenant_' || p_slug
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.clone_schema(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onboard_tenant_schema(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.clone_schema(TEXT, TEXT) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.onboard_tenant_schema(TEXT) TO app_runtime;
