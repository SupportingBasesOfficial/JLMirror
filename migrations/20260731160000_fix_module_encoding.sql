-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Correcao de encoding dos nomes e descricoes dos modulos
-- Os dados foram inseridos com encoding errado, causando perda de acentos

UPDATE public.feature_flags SET name = 'Admin Global', description = 'Administração global de tenants' WHERE key = 'module_admin';
UPDATE public.feature_flags SET name = 'AI Anomaly', description = 'Detecção de anomalias com IA' WHERE key = 'module_anomaly';
UPDATE public.feature_flags SET name = 'API Keys', description = 'Chaves de API' WHERE key = 'module_api_keys';
UPDATE public.feature_flags SET name = 'APM', description = 'Application Performance Monitoring' WHERE key = 'module_apm';
UPDATE public.feature_flags SET name = 'Assets', description = 'Inventário de ativos' WHERE key = 'module_assets';
UPDATE public.feature_flags SET name = 'Auditoria', description = 'Logs de auditoria do sistema' WHERE key = 'module_audit';
UPDATE public.feature_flags SET name = 'Autenticação', description = 'Login, logout, refresh de tokens, troca de senha' WHERE key = 'module_auth';
UPDATE public.feature_flags SET name = 'Backups', description = 'Gestão de backups e restore' WHERE key = 'module_backup';
UPDATE public.feature_flags SET name = 'Capacity', description = 'Planejamento de capacidade' WHERE key = 'module_capacity';
UPDATE public.feature_flags SET name = 'Mudanças', description = 'Gestão de mudanças' WHERE key = 'module_changes';
UPDATE public.feature_flags SET name = 'ChatOps', description = 'Integração com chat' WHERE key = 'module_chatops';
UPDATE public.feature_flags SET name = 'Portal do Cliente', description = 'Portal de clientes' WHERE key = 'module_client_portal';
UPDATE public.feature_flags SET name = 'Compliance', description = 'Auditoria de conformidade' WHERE key = 'module_compliance';
UPDATE public.feature_flags SET name = 'Correlação', description = 'Correlação de eventos' WHERE key = 'module_correlation';
UPDATE public.feature_flags SET name = 'Data Transfer', description = 'Transferência e export de dados' WHERE key = 'module_data_transfer';
UPDATE public.feature_flags SET name = 'Config Drift', description = 'Detecção de drift de configuração' WHERE key = 'module_drift';
UPDATE public.feature_flags SET name = 'Dispositivos', description = 'Dispositivos de rede' WHERE key = 'module_devices';
UPDATE public.feature_flags SET name = 'Auto-Discovery', description = 'Descoberta automática de dispositivos' WHERE key = 'module_discovery';
UPDATE public.feature_flags SET name = 'Escalonamento', description = 'Escalonamento de alertas' WHERE key = 'module_escalation';
UPDATE public.feature_flags SET name = 'Execuções', description = 'Histórico de execuções de scripts' WHERE key = 'module_executions';
UPDATE public.feature_flags SET name = 'Executive Dashboard', description = 'Dashboard executivo' WHERE key = 'module_executive_dashboard';
UPDATE public.feature_flags SET name = 'Feature Flags', description = 'Gestão de feature flags do sistema' WHERE key = 'module_feature_flags';
UPDATE public.feature_flags SET name = 'FinOps', description = 'Gestão financeira de TI' WHERE key = 'module_finops';
UPDATE public.feature_flags SET name = 'Firewall', description = 'Regras de firewall' WHERE key = 'module_firewall';
UPDATE public.feature_flags SET name = 'Kubernetes', description = 'Monitoramento de clusters K8s' WHERE key = 'module_k8s';
UPDATE public.feature_flags SET name = 'Base de Conhecimento', description = 'KB — artigos e documentação' WHERE key = 'module_kb';
UPDATE public.feature_flags SET name = 'LGPD', description = 'Conformidade com LGPD' WHERE key = 'module_lgpd';
UPDATE public.feature_flags SET name = 'Logs', description = 'Busca e análise de logs' WHERE key = 'module_logs';
UPDATE public.feature_flags SET name = 'Marketplace', description = 'Marketplace de extensões' WHERE key = 'module_marketplace';
UPDATE public.feature_flags SET name = 'MFA', description = 'Autenticação multifator TOTP e recovery codes' WHERE key = 'module_mfa';
UPDATE public.feature_flags SET name = 'Monitoramento', description = 'Monitoramento geral' WHERE key = 'module_monitoring';
UPDATE public.feature_flags SET name = 'Notificações', description = 'Central de notificações' WHERE key = 'module_notifications';
UPDATE public.feature_flags SET name = 'Patch Management', description = 'Gestão de patches' WHERE key = 'module_patches';
UPDATE public.feature_flags SET name = 'Predictive Failure', description = 'Predição de falhas' WHERE key = 'module_predictions';
UPDATE public.feature_flags SET name = 'Perfil', description = 'Perfil do usuário e preferências' WHERE key = 'module_profile';
UPDATE public.feature_flags SET name = 'Push', description = 'Notificações push web' WHERE key = 'module_push';
UPDATE public.feature_flags SET name = 'RBAC', description = 'Gestão de roles e permissões' WHERE key = 'module_rbac';
UPDATE public.feature_flags SET name = 'Relatórios', description = 'Relatórios agendados' WHERE key = 'module_reports';
UPDATE public.feature_flags SET name = 'Configurações', description = 'Configurações do tenant e gestão de módulos' WHERE key = 'module_settings';
UPDATE public.feature_flags SET name = 'SLA', description = 'SLA e serviços de negócio' WHERE key = 'module_sla';
UPDATE public.feature_flags SET name = 'SSL', description = 'Certificados SSL/TLS' WHERE key = 'module_ssl';
UPDATE public.feature_flags SET name = 'Status Page', description = 'Página pública de status' WHERE key = 'module_status_page';
UPDATE public.feature_flags SET name = 'System Health', description = 'Saúde do sistema' WHERE key = 'module_system_health';
UPDATE public.feature_flags SET name = 'Tarefas Agendadas', description = 'Tarefas e cron jobs' WHERE key = 'module_tasks';
UPDATE public.feature_flags SET name = 'Tickets', description = 'Sistema de tickets e chamados' WHERE key = 'module_tickets';
UPDATE public.feature_flags SET name = 'Traces', description = 'Distributed tracing' WHERE key = 'module_traces';
UPDATE public.feature_flags SET name = 'Webhooks', description = 'Webhooks e entregas' WHERE key = 'module_webhooks';
UPDATE public.feature_flags SET name = 'Workflows', description = 'Construtor de workflows' WHERE key = 'module_workflows';
UPDATE public.feature_flags SET name = 'Zabbix', description = 'Integração Zabbix — hosts, problems, triggers, gráficos' WHERE key = 'module_zabbix';
UPDATE public.feature_flags SET name = 'Dashboard', description = 'Dashboard visual com KPIs e visão geral' WHERE key = 'module_dashboard';
UPDATE public.feature_flags SET name = 'Automação', description = 'Scripts e execuções automatizadas' WHERE key = 'module_scripts';
UPDATE public.feature_flags SET name = 'Auditoria de Segurança', description = 'Auditoria de segurança' WHERE key = 'module_security_audit';
