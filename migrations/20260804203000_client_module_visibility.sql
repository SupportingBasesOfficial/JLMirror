-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: client_module_visibility ===
-- Adiciona duas camadas de controle de módulos:
-- 1. client_visible: admin define se o módulo aparece para o cliente poder ativar
-- 2. client_enabled: cliente ativa/desativa módulos que o admin liberou
--
-- Fluxo:
--   Admin ativa módulo para si → default_value = true
--   Admin libera módulo para cliente → client_visible = true
--   Cliente ativa módulo liberado → client_enabled = true
--   Sidebar do cliente mostra módulo se: client_visible AND client_enabled

ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS client_visible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_enabled BOOLEAN NOT NULL DEFAULT false;

-- Índice para buscar módulos visíveis ao cliente
CREATE INDEX IF NOT EXISTS idx_feature_flags_client_visible
  ON public.feature_flags (client_visible) WHERE client_visible = true;

-- Módulos que fazem sentido para o cliente poder ativar/desativar
-- (não inclui módulos administrativos como admin, rbac, feature_flags, audit)
UPDATE public.feature_flags SET client_visible = true
WHERE key IN (
  'module_tickets',
  'module_kb',
  'module_ssl',
  'module_backup',
  'module_notifications',
  'module_assets',
  'module_capacity',
  'module_compliance',
  'module_tasks',
  'module_webhooks',
  'module_api_keys',
  'module_reports',
  'module_sla',
  'module_system_health',
  'module_data_transfer',
  'module_discovery',
  'module_status_page',
  'module_push',
  'module_chatops',
  'module_marketplace',
  'module_changes',
  'module_itsm',
  'module_drift',
  'module_anomaly',
  'module_predictions',
  'module_finops',
  'module_logs',
  'module_traces',
  'module_executive_dashboard',
  'module_workflows',
  'module_correlation',
  'module_apm'
);

-- Módulos core que o cliente sempre vê (não precisam de toggle)
-- auth, dashboard, zabbix, profile, settings, mfa — já estão default_value = true
-- e não precisam de client_visible porque não têm flagKey na sidebar
