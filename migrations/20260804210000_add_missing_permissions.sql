-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Adiciona permissões faltantes no RBAC e atribui aos roles de tenant
-- Muitas rotas usam requirePermission() com chaves que não existiam no seed original

-- ============================================================
-- 1. NOVAS PERMISSOES
-- ============================================================

INSERT INTO public.permissions (key, description, category) VALUES
  -- Dashboard
  ('dashboard:read', 'Visualizar dashboard geral', 'dashboard'),
  -- Assets
  ('assets:read', 'Visualizar ativos do inventário', 'assets'),
  ('assets:write', 'Criar e editar ativos do inventário', 'assets'),
  -- Devices
  ('devices:read', 'Visualizar dispositivos monitorados', 'devices'),
  -- Tickets / ITSM
  ('tickets:read', 'Visualizar tickets de suporte', 'tickets'),
  ('tickets:write', 'Criar e editar tickets de suporte', 'tickets'),
  -- Compliance
  ('compliance:read', 'Visualizar auditorias de conformidade', 'compliance'),
  ('compliance:write', 'Executar auditorias de conformidade', 'compliance'),
  -- SSL
  ('ssl:read', 'Visualizar certificados SSL', 'ssl'),
  ('ssl:write', 'Gerenciar certificados SSL', 'ssl'),
  -- Backups
  ('backups:read', 'Visualizar snapshots de backup', 'backups'),
  ('backups:write', 'Gerenciar backups', 'backups'),
  -- Firewall
  ('firewall:read', 'Visualizar regras de firewall', 'security'),
  ('firewall:write', 'Modificar regras de firewall', 'security'),
  -- Changes
  ('changes:read', 'Visualizar mudanças programadas', 'changes'),
  ('changes:write', 'Criar e aprovar mudanças', 'changes'),
  -- Scripts
  ('scripts:read', 'Visualizar scripts de automação', 'automation'),
  ('scripts:write', 'Criar e editar scripts de automação', 'automation'),
  -- Notifications
  ('notifications:read', 'Visualizar canais e regras de notificação', 'notifications'),
  ('notifications:write', 'Gerenciar canais e regras de notificação', 'notifications'),
  -- API Keys
  ('api_keys:read', 'Visualizar chaves de API', 'security'),
  ('api_keys:write', 'Criar e revogar chaves de API', 'security'),
  -- Billing
  ('billing:read', 'Visualizar assinaturas e faturas', 'billing'),
  ('billing:write', 'Gerenciar assinaturas e pagamentos', 'billing'),
  -- Admin tenants
  ('admin:tenants:read', 'Listar e visualizar tenants', 'admin'),
  ('admin:tenants:write', 'Criar e editar tenants', 'admin'),
  -- Capacity
  ('capacity:read', 'Visualizar planejamento de capacidade', 'capacity'),
  -- Knowledge Base
  ('kb:read', 'Visualizar base de conhecimento', 'kb'),
  ('kb:write', 'Editar base de conhecimento', 'kb'),
  -- Webhooks
  ('webhooks:read', 'Visualizar webhooks', 'integrations'),
  ('webhooks:write', 'Gerenciar webhooks', 'integrations'),
  -- Tasks
  ('tasks:read', 'Visualizar tarefas agendadas', 'automation'),
  ('tasks:write', 'Gerenciar tarefas agendadas', 'automation'),
  -- Data Transfer
  ('data_transfer:read', 'Visualizar exportações de dados', 'data'),
  ('data_transfer:write', 'Executar exportações e importações', 'data'),
  -- LGPD
  ('lgpd:read', 'Visualizar registros de LGPD', 'compliance'),
  ('lgpd:write', 'Gerenciar registros de LGPD', 'compliance'),
  -- Patches
  ('patches:read', 'Visualizar patches e atualizações', 'security'),
  ('patches:write', 'Gerenciar patches e atualizações', 'security'),
  -- Security Audit
  ('security_audit:read', 'Visualizar auditorias de segurança', 'security'),
  -- Correlation
  ('correlation:read', 'Visualizar correlação de eventos', 'observability'),
  -- Workflows
  ('workflows:read', 'Visualizar fluxos de trabalho', 'automation'),
  ('workflows:write', 'Gerenciar fluxos de trabalho', 'automation'),
  -- ChatOps
  ('chatops:read', 'Visualizar integrações de chat', 'integrations'),
  ('chatops:write', 'Gerenciar integrações de chat', 'integrations'),
  -- Status Page
  ('status_page:read', 'Visualizar página de status', 'observability'),
  ('status_page:write', 'Gerenciar página de status', 'observability'),
  -- Drift
  ('drift:read', 'Visualizar config drift', 'observability'),
  -- ITSM
  ('itsm:read', 'Visualizar gerenciamento de serviços de TI', 'itsm'),
  ('itsm:write', 'Gerenciar serviços de TI', 'itsm'),
  -- Discovery
  ('discovery:read', 'Visualizar descoberta automática', 'automation'),
  -- Anomaly
  ('anomaly:read', 'Visualizar detecção de anomalias', 'ai'),
  -- Prediction
  ('prediction:read', 'Visualizar análises preditivas', 'ai'),
  -- FinOps
  ('finops:read', 'Visualizar análise financeira de TI', 'finops'),
  -- Marketplace
  ('marketplace:read', 'Visualizar marketplace de integrações', 'marketplace'),
  -- Executive Dashboard
  ('executive_dashboard:read', 'Visualizar dashboard executivo', 'dashboard'),
  -- Reports
  ('reports:read', 'Visualizar relatórios', 'reports'),
  -- SLA
  ('sla:read', 'Visualizar SLAs', 'sla'),
  ('sla:write', 'Gerenciar SLAs', 'sla'),
  -- System Health
  ('system_health:read', 'Visualizar saúde do sistema', 'observability'),
  -- Scheduled Reports
  ('scheduled_reports:read', 'Visualizar relatórios agendados', 'reports'),
  ('scheduled_reports:write', 'Gerenciar relatórios agendados', 'reports')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. ATRIBUIR PERMISSOES AOS ROLES DE TENANT
-- ============================================================

-- tenant:admin — todas as permissões de tenant (exceto admin:tenants)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'tenant:admin' AND p.key IN (
  'dashboard:read',
  'assets:read', 'assets:write',
  'devices:read',
  'tickets:read', 'tickets:write',
  'compliance:read', 'compliance:write',
  'ssl:read', 'ssl:write',
  'backups:read', 'backups:write',
  'firewall:read', 'firewall:write',
  'changes:read', 'changes:write',
  'scripts:read', 'scripts:write',
  'notifications:read', 'notifications:write',
  'api_keys:read', 'api_keys:write',
  'billing:read', 'billing:write',
  'capacity:read',
  'kb:read', 'kb:write',
  'webhooks:read', 'webhooks:write',
  'tasks:read', 'tasks:write',
  'data_transfer:read', 'data_transfer:write',
  'lgpd:read', 'lgpd:write',
  'patches:read', 'patches:write',
  'security_audit:read',
  'correlation:read',
  'workflows:read', 'workflows:write',
  'chatops:read', 'chatops:write',
  'status_page:read', 'status_page:write',
  'drift:read',
  'itsm:read', 'itsm:write',
  'discovery:read',
  'anomaly:read',
  'prediction:read',
  'finops:read',
  'marketplace:read',
  'executive_dashboard:read',
  'reports:read',
  'sla:read', 'sla:write',
  'system_health:read',
  'scheduled_reports:read', 'scheduled_reports:write'
)
ON CONFLICT DO NOTHING;

-- tenant:operator — leitura + escrita operacional (sem gestão de usuários nem billing)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'tenant:operator' AND p.key IN (
  'dashboard:read',
  'assets:read', 'assets:write',
  'devices:read',
  'tickets:read', 'tickets:write',
  'compliance:read',
  'ssl:read',
  'backups:read', 'backups:write',
  'firewall:read', 'firewall:write',
  'changes:read', 'changes:write',
  'scripts:read', 'scripts:write',
  'notifications:read', 'notifications:write',
  'api_keys:read',
  'capacity:read',
  'kb:read', 'kb:write',
  'webhooks:read', 'webhooks:write',
  'tasks:read', 'tasks:write',
  'data_transfer:read',
  'lgpd:read',
  'patches:read', 'patches:write',
  'security_audit:read',
  'correlation:read',
  'workflows:read', 'workflows:write',
  'chatops:read', 'chatops:write',
  'status_page:read', 'status_page:write',
  'drift:read',
  'itsm:read', 'itsm:write',
  'discovery:read',
  'anomaly:read',
  'prediction:read',
  'finops:read',
  'marketplace:read',
  'executive_dashboard:read',
  'reports:read',
  'sla:read',
  'system_health:read',
  'scheduled_reports:read'
)
ON CONFLICT DO NOTHING;

-- tenant:viewer — apenas leitura
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'tenant:viewer' AND p.key IN (
  'dashboard:read',
  'assets:read',
  'devices:read',
  'tickets:read',
  'compliance:read',
  'ssl:read',
  'backups:read',
  'firewall:read',
  'changes:read',
  'scripts:read',
  'notifications:read',
  'api_keys:read',
  'capacity:read',
  'kb:read',
  'webhooks:read',
  'tasks:read',
  'data_transfer:read',
  'lgpd:read',
  'patches:read',
  'security_audit:read',
  'correlation:read',
  'workflows:read',
  'chatops:read',
  'status_page:read',
  'drift:read',
  'itsm:read',
  'discovery:read',
  'anomaly:read',
  'prediction:read',
  'finops:read',
  'marketplace:read',
  'executive_dashboard:read',
  'reports:read',
  'sla:read',
  'system_health:read',
  'scheduled_reports:read'
)
ON CONFLICT DO NOTHING;

-- global:admin já tem *:* que cobre tudo
