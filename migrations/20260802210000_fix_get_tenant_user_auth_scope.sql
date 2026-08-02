-- Migration: corrige get_tenant_user_auth para retornar scope
-- Causa raiz: a funcao retornava apenas (tenant_id, role) sem scope.
-- O auth.ts lia rows[0].scope que era undefined, sempre defaulting para "tenant".
-- Isso fazia o JWT do admin ter scope="tenant" em vez de "global",
-- mostrando ClientSidebar para usuarios JL staff.
--
-- Solucao: derivar scope do prefixo do role (global:* -> global, tenant:* -> tenant)

-- Precisa DROP primeiro porque os OUT parameters mudaram
DROP FUNCTION IF EXISTS public.get_tenant_user_auth(uuid);

CREATE OR REPLACE FUNCTION public.get_tenant_user_auth(p_user_id uuid)
RETURNS TABLE(tenant_id uuid, role character varying, scope character varying)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    tu.tenant_id,
    tu.role::VARCHAR,
    CASE
      WHEN tu.role LIKE 'global:%' THEN 'global'::VARCHAR
      ELSE 'tenant'::VARCHAR
    END AS scope
  FROM public.tenant_users tu
  WHERE tu.user_id = p_user_id;
END;
$function$;

-- Concede acesso para app_runtime
GRANT EXECUTE ON FUNCTION public.get_tenant_user_auth(uuid) TO app_runtime;
