-- === Migration: 005_mega_tech_rpcs ===
-- Funções SECURITY DEFINER para acesso controlado aos metadados
-- Todas fixam search_path para evitar search_path injection

CREATE OR REPLACE FUNCTION public.get_tenant_metadata(p_tenant_id UUID)
RETURNS TABLE(
  tenant_id UUID,
  cluster_id TEXT,
  cluster_host TEXT,
  cluster_database_name TEXT,
  cluster_port INTEGER,
  schema_name TEXT,
  is_enterprise BOOLEAN,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT tr.tenant_id, tr.cluster_id::TEXT, tr.cluster_host::TEXT,
         tr.cluster_database_name::TEXT, tr.cluster_port, tr.schema_name::TEXT,
         tr.is_enterprise, tr.status::TEXT, tr.created_at, tr.updated_at
  FROM public.tenant_routes tr
  WHERE tr.tenant_id = p_tenant_id AND tr.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_tenant_zabbix_config(p_tenant_id UUID)
RETURNS TABLE(
  zabbix_host_group_id TEXT,
  zabbix_api_url TEXT,
  zabbix_encrypted_token TEXT,
  zabbix_token_iv TEXT,
  zabbix_token_tag TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT tr.zabbix_host_group_id, tr.zabbix_api_url,
         tr.zabbix_encrypted_token, tr.zabbix_token_iv, tr.zabbix_token_tag
  FROM public.tenant_routes tr
  WHERE tr.tenant_id = p_tenant_id AND tr.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_tenant_user_auth(p_user_id UUID)
RETURNS TABLE(tenant_id UUID, role VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT tu.tenant_id, tu.role::VARCHAR
  FROM public.tenant_users tu
  WHERE tu.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  EXECUTE format('SET LOCAL app.current_tenant_id = %L', p_tenant_id::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_tenant_metadata(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenant_zabbix_config(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenant_user_auth(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_tenant_context(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_tenant_metadata(UUID) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.get_tenant_zabbix_config(UUID) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.get_tenant_user_auth(UUID) TO app_runtime;
GRANT EXECUTE ON FUNCTION public.set_tenant_context(UUID) TO app_runtime;
