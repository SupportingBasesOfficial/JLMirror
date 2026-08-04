-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: drop_tenant_schema ===
-- Função para remover completamente o schema de um tenant
-- Usada durante a exclusão de tenants — remove todas as tabelas, índices e o schema

CREATE OR REPLACE FUNCTION public.drop_tenant_schema(p_slug TEXT)
RETURNS void AS $$
DECLARE
  tbl RECORD;
BEGIN
  -- Validação anti-injection: slug deve conter apenas [a-z0-9-]
  IF p_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Slug inválido: deve conter apenas [a-z0-9-]';
  END IF;

  -- Remove todas as tabelas do schema (CASCADE remove índices, constraints, etc)
  FOR tbl IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'tenant_' || p_slug AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', 'tenant_' || p_slug, tbl.table_name);
  END LOOP;

  -- Remove o schema
  EXECUTE format('DROP SCHEMA IF EXISTS %I', 'tenant_' || p_slug);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.drop_tenant_schema(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drop_tenant_schema(TEXT) TO app_runtime;
