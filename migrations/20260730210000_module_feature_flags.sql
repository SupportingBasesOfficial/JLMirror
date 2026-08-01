-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Seed de feature flags para controle de modulos do sistema
-- Modulos ativos (fase 1): auth, dashboard, zabbix, rbac, mfa, settings, profile, feature_flags
-- Todos os demais modulos comecam desativados (default_value = false)

-- Modulos ATIVOS
INSERT INTO public.feature_flags (tenant_id, key, name, description, flag_type, default_value, rollout_percentage, target_segments)
VALUES
  (NULL, 'module_auth', 'Autenticação', 'Login, logout, refresh de tokens, troca de senha', 'boolean', 'true'::jsonb, 100, '[]'),
  (NULL, 'module_dashboard', 'Dashboard', 'Dashboard visual com KPIs e visão geral', 'boolean', 'true'::jsonb, 100, '[]'),
  (NULL, 'module_zabbix', 'Zabbix', 'Integração Zabbix — hosts, problems, triggers, gráficos', 'boolean', 'true'::jsonb, 100, '[]'),
  (NULL, 'module_rbac', 'RBAC', 'Gestão de roles e permissões', 'boolean', 'true'::jsonb, 100, '[]'),
  (NULL, 'module_mfa', 'MFA', 'Autenticação multifator TOTP e recovery codes', 'boolean', 'true'::jsonb, 100, '[]'),
  (NULL, 'module_settings', 'Configurações', 'Configurações do tenant e gestão de módulos', 'boolean', 'true'::jsonb, 100, '[]'),
  (NULL, 'module_profile', 'Perfil', 'Perfil do usuário e preferências', 'boolean', 'true'::jsonb, 100, '[]'),
  (NULL, 'module_feature_flags', 'Feature Flags', 'Gestão de feature flags do sistema', 'boolean', 'true'::jsonb, 100, '[]')
ON CONFLICT DO NOTHING;

-- Modulos DESATIVADOS
INSERT INTO public.feature_flags (tenant_id, key, name, description, flag_type, default_value, rollout_percentage, target_segments)
VALUES
  (NULL, 'module_devices', 'Dispositivos', 'Dispositivos de rede', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_monitoring', 'Monitoramento', 'Monitoramento geral', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_scripts', 'Automação', 'Scripts e execuções automatizadas', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_executions', 'Execuções', 'Histórico de execuções de scripts', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_firewall', 'Firewall', 'Regras de firewall', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_k8s', 'Kubernetes', 'Monitoramento de clusters K8s', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_ssl', 'SSL', 'Certificados SSL/TLS', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_backup', 'Backups', 'Gestão de backups e restore', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_notifications', 'Notificações', 'Central de notificações', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_assets', 'Assets', 'Inventário de ativos', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_capacity', 'Capacity', 'Planejamento de capacidade', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_compliance', 'Compliance', 'Auditoria de conformidade', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_tickets', 'Tickets', 'Sistema de tickets e chamados', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_kb', 'Base de Conhecimento', 'KB — artigos e documentação', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_system_health', 'System Health', 'Saúde do sistema', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_api_keys', 'API Keys', 'Chaves de API', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_webhooks', 'Webhooks', 'Webhooks e entregas', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_tasks', 'Tarefas Agendadas', 'Tarefas e cron jobs', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_data_transfer', 'Data Transfer', 'Transferência e export de dados', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_lgpd', 'LGPD', 'Conformidade com LGPD', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_escalation', 'Escalonamento', 'Escalonamento de alertas', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_patches', 'Patch Management', 'Gestão de patches', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_security_audit', 'Auditoria de Segurança', 'Auditoria de segurança', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_correlation', 'Correlação', 'Correlação de eventos', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_workflows', 'Workflows', 'Construtor de workflows', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_push', 'Push', 'Notificações push web', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_client_portal', 'Portal do Cliente', 'Portal de clientes', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_chatops', 'ChatOps', 'Integração com chat', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_status_page', 'Status Page', 'Página pública de status', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_drift', 'Config Drift', 'Detecção de drift de configuração', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_itsm', 'ITSM', 'Conectores ITSM', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_discovery', 'Auto-Discovery', 'Descoberta automática de dispositivos', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_anomaly', 'AI Anomaly', 'Detecção de anomalias com IA', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_predictions', 'Predictive Failure', 'Predição de falhas', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_finops', 'FinOps', 'Gestão financeira de TI', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_marketplace', 'Marketplace', 'Marketplace de extensões', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_reports', 'Relatórios', 'Relatórios agendados', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_changes', 'Mudanças', 'Gestão de mudanças', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_admin', 'Admin Global', 'Administração global de tenants', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_sla', 'SLA', 'SLA e serviços de negócio', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_apm', 'APM', 'Application Performance Monitoring', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_logs', 'Logs', 'Busca e análise de logs', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_traces', 'Traces', 'Distributed tracing', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_executive_dashboard', 'Executive Dashboard', 'Dashboard executivo', 'boolean', 'false'::jsonb, 100, '[]'),
  (NULL, 'module_audit', 'Auditoria', 'Logs de auditoria do sistema', 'boolean', 'false'::jsonb, 100, '[]')
ON CONFLICT DO NOTHING;
