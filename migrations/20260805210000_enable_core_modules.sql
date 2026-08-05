-- Ativa todos os modulos core por default (default_value = true)
-- Modulos que estavam com default_value=false E client_enabled=false causavam 403 MODULE_DISABLED
-- para todos os tenants. Estes sao modulos core da plataforma e devem estar ativos por default.
-- O admin pode desativar por tenant via /settings/modules quando necessario.

UPDATE public.feature_flags
SET default_value = to_jsonb(true)
WHERE key IN (
  'module_audit',
  'module_client_portal',
  'module_escalation',
  'module_executions',
  'module_firewall',
  'module_k8s',
  'module_lgpd',
  'module_monitoring',
  'module_patches',
  'module_scripts',
  'module_security_audit'
)
AND tenant_id IS NULL;
