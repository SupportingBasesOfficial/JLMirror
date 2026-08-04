-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: fix_missing_permissions ===
-- Adiciona todas as permissões que as rotas exigem mas não existiam no seed RBAC
-- Mapeia para tenant:admin (tudo), tenant:operator (read + write operacional),
-- tenant:viewer (read apenas) e roles JL staff

-- ============================================================
-- 1. PERMISSÕES FALTANTES
-- ============================================================

INSERT INTO public.permissions (key, description, category) VALUES
  -- Profile (auto-serviço do próprio usuário)
  ('self:profile:read', 'Ver próprio perfil', 'self'),
  ('self:profile:write', 'Editar próprio perfil', 'self'),
  ('self:mfa:read', 'Ver configurações de MFA', 'self'),
  ('self:mfa:write', 'Gerenciar MFA do próprio usuário', 'self'),

  -- Dashboard
  ('dashboard:read', 'Acessar dashboards do tenant', 'dashboard'),
  ('dashboard:executive:read', 'Acessar executive dashboard', 'dashboard'),

  -- SLA
  ('sla:read', 'Ler SLAs e incidentes', 'sla'),
  ('sla:write', 'Criar/editar SLAs e incidentes', 'sla'),

  -- SSL
  ('ssl:read', 'Ver certificados SSL', 'ssl'),
  ('ssl:write', 'Gerenciar certificados SSL', 'ssl'),

  -- Tasks
  ('tasks:read', 'Ver tarefas agendadas', 'tasks'),
  ('tasks:write', 'Criar/editar tarefas agendadas', 'tasks'),

  -- Tickets
  ('tickets:read', 'Ver tickets', 'tickets'),
  ('tickets:write', 'Criar/editar tickets', 'tickets'),

  -- Webhooks
  ('webhooks:read', 'Ver webhooks', 'webhooks'),
  ('webhooks:write', 'Criar/editar webhooks', 'webhooks'),

  -- API Keys
  ('api_keys:read', 'Ver API keys', 'api_keys'),
  ('api_keys:write', 'Criar/editar API keys', 'api_keys'),

  -- Assets / Workflows
  ('assets:read', 'Ver assets e workflows', 'assets'),
  ('assets:write', 'Criar/editar assets e workflows', 'assets'),

  -- Scripts
  ('scripts:read', 'Ver scripts', 'scripts'),
  ('scripts:write', 'Criar/editar scripts', 'scripts'),
  ('scripts:approve', 'Aprovar execução de scripts', 'scripts'),

  -- Compliance / Security Audit
  ('compliance:read', 'Ver auditoria de compliance', 'compliance'),
  ('compliance:write', 'Executar auditorias de compliance', 'compliance'),

  -- System Health
  ('health:read', 'Ver system health', 'health'),
  ('health:write', 'Gerenciar system health checks', 'health'),

  -- Status Page
  ('status_page:manage', 'Gerenciar status page', 'status_page'),

  -- TV
  ('tv:tokens:read', 'Ver tokens de TV', 'tv'),
  ('tv:tokens:manage', 'Gerenciar tokens de TV', 'tv'),

  -- Changes
  ('changes:read', 'Ver mudanças', 'changes'),
  ('changes:write', 'Criar/editar mudanças', 'changes'),
  ('changes:approve', 'Aprovar mudanças', 'changes'),

  -- KB
  ('kb:read', 'Ver base de conhecimento', 'kb'),
  ('kb:write', 'Editar base de conhecimento', 'kb'),

  -- Notifications
  ('notifications:read', 'Ver notificações', 'notifications'),
  ('notifications:write', 'Gerenciar notificações', 'notifications'),

  -- Reports
  ('reports:read', 'Ver relatórios', 'reports'),
  ('reports:write', 'Gerar relatórios', 'reports'),

  -- Feature Flags
  ('feature_flags:read', 'Ver feature flags', 'feature_flags'),
  ('feature_flags:write', 'Gerenciar feature flags', 'feature_flags'),

  -- Discovery
  ('discovery:read', 'Ver auto-discovery', 'discovery'),
  ('discovery:write', 'Executar auto-discovery', 'discovery'),

  -- Data Transfer
  ('data_transfer:read', 'Ver data transfers', 'data_transfer'),
  ('data_transfer:write', 'Executar data transfers', 'data_transfer'),

  -- Backup
  ('backup:read', 'Ver backups', 'backup'),
  ('backup:write', 'Gerenciar backups', 'backup'),

  -- Billing / FinOps
  ('billing:read', 'Ver billing', 'billing'),
  ('billing:write', 'Gerenciar billing', 'billing'),
  ('finops:read', 'Ver FinOps', 'finops'),
  ('finops:write', 'Gerenciar FinOps', 'finops'),

  -- Capacity
  ('capacity:read', 'Ver capacity planning', 'capacity'),
  ('capacity:write', 'Gerenciar capacity planning', 'capacity'),

  -- Anomaly / Prediction
  ('anomaly:read', 'Ver detecção de anomalias', 'ai'),
  ('anomaly:write', 'Configurar detecção de anomalias', 'ai'),
  ('prediction:read', 'Ver predições', 'ai'),
  ('prediction:write', 'Configurar predições', 'ai'),

  -- Drift
  ('drift:read', 'Ver config drift', 'drift'),
  ('drift:write', 'Gerenciar config drift', 'drift'),

  -- ChatOps
  ('chatops:read', 'Ver ChatOps', 'chatops'),
  ('chatops:manage', 'Gerenciar ChatOps', 'chatops'),

  -- ITSM
  ('itsm:read', 'Ver ITSM connectors', 'itsm'),
  ('itsm:write', 'Gerenciar ITSM connectors', 'itsm'),

  -- Marketplace
  ('marketplace:read', 'Ver marketplace', 'marketplace'),
  ('marketplace:write', 'Gerenciar marketplace', 'marketplace'),

  -- Client Portal
  ('client_portal:manage', 'Gerenciar client portal', 'client_portal'),

  -- Traces (alias para tracing)
  ('traces:read', 'Ver traces distribuídos', 'traces'),

  -- Global users
  ('global:users:read', 'Listar usuários globais', 'admin')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. MAPEAR PERMISSÕES PARA ROLES
-- ============================================================

-- tenant:admin recebe tudo (exceto admin:* e global:* que são JL staff)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'tenant:admin' AND p.key IN (
  'self:profile:read', 'self:profile:write', 'self:mfa:read', 'self:mfa:write',
  'dashboard:read', 'dashboard:executive:read',
  'sla:read', 'sla:write',
  'ssl:read', 'ssl:write',
  'tasks:read', 'tasks:write',
  'tickets:read', 'tickets:write',
  'webhooks:read', 'webhooks:write',
  'api_keys:read', 'api_keys:write',
  'assets:read', 'assets:write',
  'scripts:read', 'scripts:write', 'scripts:approve',
  'compliance:read', 'compliance:write',
  'health:read', 'health:write',
  'status_page:manage',
  'tv:tokens:read', 'tv:tokens:manage',
  'changes:read', 'changes:write', 'changes:approve',
  'kb:read', 'kb:write',
  'notifications:read', 'notifications:write',
  'reports:read', 'reports:write',
  'feature_flags:read', 'feature_flags:write',
  'discovery:read', 'discovery:write',
  'data_transfer:read', 'data_transfer:write',
  'backup:read', 'backup:write',
  'billing:read', 'billing:write',
  'finops:read', 'finops:write',
  'capacity:read', 'capacity:write',
  'anomaly:read', 'anomaly:write',
  'prediction:read', 'prediction:write',
  'drift:read', 'drift:write',
  'chatops:read', 'chatops:manage',
  'itsm:read', 'itsm:write',
  'marketplace:read', 'marketplace:write',
  'client_portal:manage',
  'traces:read'
)
ON CONFLICT DO NOTHING;

-- tenant:operator recebe read + write operacional (sem gestão de usuários/settings)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'tenant:operator' AND p.key IN (
  'self:profile:read', 'self:profile:write', 'self:mfa:read', 'self:mfa:write',
  'dashboard:read',
  'sla:read',
  'ssl:read',
  'tasks:read', 'tasks:write',
  'tickets:read', 'tickets:write',
  'webhooks:read',
  'api_keys:read',
  'assets:read', 'assets:write',
  'scripts:read',
  'compliance:read',
  'health:read',
  'tv:tokens:read',
  'changes:read',
  'kb:read', 'kb:write',
  'notifications:read',
  'reports:read',
  'discovery:read',
  'backup:read',
  'capacity:read',
  'anomaly:read',
  'prediction:read',
  'drift:read',
  'chatops:read',
  'itsm:read',
  'marketplace:read',
  'traces:read'
)
ON CONFLICT DO NOTHING;

-- tenant:viewer recebe apenas read
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'tenant:viewer' AND p.key IN (
  'self:profile:read', 'self:profile:write', 'self:mfa:read', 'self:mfa:write',
  'dashboard:read',
  'sla:read',
  'ssl:read',
  'tasks:read',
  'tickets:read',
  'webhooks:read',
  'api_keys:read',
  'assets:read',
  'scripts:read',
  'compliance:read',
  'health:read',
  'tv:tokens:read',
  'changes:read',
  'kb:read',
  'notifications:read',
  'reports:read',
  'discovery:read',
  'backup:read',
  'capacity:read',
  'anomaly:read',
  'prediction:read',
  'drift:read',
  'chatops:read',
  'itsm:read',
  'marketplace:read',
  'traces:read'
)
ON CONFLICT DO NOTHING;

-- jl:engineer recebe tudo operacional
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:engineer' AND p.key IN (
  'self:profile:read', 'self:profile:write', 'self:mfa:read', 'self:mfa:write',
  'dashboard:read', 'dashboard:executive:read',
  'sla:read', 'sla:write',
  'ssl:read', 'ssl:write',
  'tasks:read', 'tasks:write',
  'tickets:read', 'tickets:write',
  'webhooks:read', 'webhooks:write',
  'api_keys:read', 'api_keys:write',
  'assets:read', 'assets:write',
  'scripts:read', 'scripts:write', 'scripts:approve',
  'compliance:read', 'compliance:write',
  'health:read', 'health:write',
  'status_page:manage',
  'tv:tokens:read', 'tv:tokens:manage',
  'changes:read', 'changes:write', 'changes:approve',
  'kb:read', 'kb:write',
  'notifications:read', 'notifications:write',
  'reports:read', 'reports:write',
  'feature_flags:read', 'feature_flags:write',
  'discovery:read', 'discovery:write',
  'data_transfer:read', 'data_transfer:write',
  'backup:read', 'backup:write',
  'billing:read',
  'finops:read',
  'capacity:read', 'capacity:write',
  'anomaly:read', 'anomaly:write',
  'prediction:read', 'prediction:write',
  'drift:read', 'drift:write',
  'chatops:read', 'chatops:manage',
  'itsm:read', 'itsm:write',
  'marketplace:read', 'marketplace:write',
  'client_portal:manage',
  'traces:read',
  'global:users:read'
)
ON CONFLICT DO NOTHING;

-- jl:technician recebe read + write operacional
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:technician' AND p.key IN (
  'self:profile:read', 'self:profile:write', 'self:mfa:read', 'self:mfa:write',
  'dashboard:read',
  'sla:read',
  'ssl:read',
  'tasks:read', 'tasks:write',
  'tickets:read', 'tickets:write',
  'webhooks:read',
  'api_keys:read',
  'assets:read', 'assets:write',
  'scripts:read',
  'compliance:read',
  'health:read',
  'tv:tokens:read',
  'changes:read',
  'kb:read', 'kb:write',
  'notifications:read',
  'reports:read',
  'discovery:read',
  'backup:read',
  'capacity:read',
  'anomaly:read',
  'prediction:read',
  'drift:read',
  'chatops:read',
  'itsm:read',
  'marketplace:read',
  'traces:read'
)
ON CONFLICT DO NOTHING;

-- jl:manager recebe read + gestão
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:manager' AND p.key IN (
  'self:profile:read', 'self:profile:write', 'self:mfa:read', 'self:mfa:write',
  'dashboard:read', 'dashboard:executive:read',
  'sla:read', 'sla:write',
  'ssl:read',
  'tasks:read',
  'tickets:read', 'tickets:write',
  'webhooks:read',
  'api_keys:read',
  'assets:read',
  'scripts:read',
  'compliance:read', 'compliance:write',
  'health:read',
  'tv:tokens:read',
  'changes:read', 'changes:approve',
  'kb:read',
  'notifications:read', 'notifications:write',
  'reports:read', 'reports:write',
  'feature_flags:read',
  'discovery:read',
  'backup:read',
  'billing:read', 'billing:write',
  'finops:read', 'finops:write',
  'capacity:read',
  'anomaly:read',
  'prediction:read',
  'drift:read',
  'chatops:read',
  'itsm:read',
  'marketplace:read',
  'traces:read',
  'global:users:read'
)
ON CONFLICT DO NOTHING;

-- jl:finance recebe read financeiro
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:finance' AND p.key IN (
  'self:profile:read', 'self:profile:write', 'self:mfa:read', 'self:mfa:write',
  'dashboard:read',
  'billing:read', 'billing:write',
  'finops:read', 'finops:write',
  'reports:read',
  'capacity:read'
)
ON CONFLICT DO NOTHING;

-- jl:viewer recebe read geral
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'jl:viewer' AND p.key IN (
  'self:profile:read', 'self:profile:write', 'self:mfa:read', 'self:mfa:write',
  'dashboard:read', 'dashboard:executive:read',
  'sla:read', 'ssl:read', 'tasks:read', 'tickets:read',
  'webhooks:read', 'api_keys:read', 'assets:read',
  'scripts:read', 'compliance:read', 'health:read',
  'tv:tokens:read', 'changes:read', 'kb:read',
  'notifications:read', 'reports:read',
  'discovery:read', 'backup:read',
  'capacity:read', 'anomaly:read', 'prediction:read',
  'drift:read', 'chatops:read', 'itsm:read',
  'marketplace:read', 'traces:read',
  'global:users:read'
)
ON CONFLICT DO NOTHING;
