-- Ativa TODOS os modulos da plataforma por default (default_value = true)
-- Modulos que continuavam com default_value=false causavam 403 MODULE_DISABLED
-- para todos os tenants. Como o codigo (backend, frontend, banco) de todos os
-- modulos esta plenamente implementado, todos devem estar ativos por default.
-- O admin pode desativar por tenant via /settings/modules quando necessario.

UPDATE public.feature_flags
SET default_value = 'true'::jsonb
WHERE key IN (
  'module_devices',
  'module_ssl',
  'module_backup',
  'module_notifications',
  'module_assets',
  'module_capacity',
  'module_compliance',
  'module_tickets',
  'module_kb',
  'module_system_health',
  'module_api_keys',
  'module_webhooks',
  'module_tasks',
  'module_data_transfer',
  'module_correlation',
  'module_workflows',
  'module_push',
  'module_chatops',
  'module_status_page',
  'module_drift',
  'module_itsm',
  'module_discovery',
  'module_anomaly',
  'module_predictions',
  'module_finops',
  'module_marketplace',
  'module_reports',
  'module_changes',
  'module_admin',
  'module_sla',
  'module_apm',
  'module_logs',
  'module_traces',
  'module_executive_dashboard'
)
AND tenant_id IS NULL;
