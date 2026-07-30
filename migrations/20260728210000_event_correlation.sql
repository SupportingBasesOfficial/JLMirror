-- === Migration: Event Correlation Engine ===
-- Engine de correlação de eventos: agrupa alertas Zabbix por janela temporal,
-- host group, tags e severidade. Reduz alert fatigue e cria incidentes correlacionados.

CREATE TABLE IF NOT EXISTS public.event_correlation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  -- Janela temporal em segundos: eventos dentro desta janela são candidatos a agrupamento
  time_window_seconds INT NOT NULL DEFAULT 300 CHECK (time_window_seconds > 0),
  -- Estratégia de agrupamento:
  --   same_device: mesmo dispositivo
  --   same_host_group: mesmo host group do Zabbix
  --   same_tag: mesma tag do Zabbix (requer tag_key)
  --   same_severity: mesma severidade
  --   cross_device: qualquer dispositivo (correlação puramente temporal)
  grouping_strategy VARCHAR(50) NOT NULL DEFAULT 'same_host_group'
    CHECK (grouping_strategy IN ('same_device', 'same_host_group', 'same_tag', 'same_severity', 'cross_device')),
  -- Chave da tag Zabbix para correlação por tag (ex: 'service', 'environment')
  tag_key VARCHAR(100),
  -- Severidade mínima para considerar o evento na correlação
  min_severity VARCHAR(20) NOT NULL DEFAULT 'warning'
    CHECK (min_severity IN ('info', 'warning', 'critical')),
  -- Quando o grupo atinge este número de eventos, escala severidade
  escalation_threshold INT NOT NULL DEFAULT 3 CHECK (escalation_threshold > 1),
  -- Severidade escalada quando threshold é atingido
  escalated_severity VARCHAR(20) NOT NULL DEFAULT 'critical'
    CHECK (escalated_severity IN ('info', 'warning', 'critical')),
  -- Suprimir notificações individuais quando evento faz parte de grupo
  suppress_individual BOOLEAN NOT NULL DEFAULT true,
  -- Criar incidente automaticamente quando grupo é formado
  auto_create_incident BOOLEAN NOT NULL DEFAULT false,
  -- Enviar notificação consolidada do grupo (uma vez por grupo)
  send_group_notification BOOLEAN NOT NULL DEFAULT true,
  -- Channel IDs para notificação consolidada do grupo
  group_channel_ids UUID[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_correlation_rules_tenant ON public.event_correlation_rules(tenant_id);
CREATE INDEX idx_correlation_rules_active ON public.event_correlation_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_correlation_rules_strategy ON public.event_correlation_rules(grouping_strategy);

CREATE TABLE IF NOT EXISTS public.event_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.event_correlation_rules(id) ON DELETE CASCADE,
  -- Fingerprint único do grupo para dedup: hash de tenant + rule + grouping key
  group_fingerprint VARCHAR(500) NOT NULL,
  -- Severidade agregada (pode ser escalada da severidade individual)
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  -- Status do grupo
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'suppressed')),
  -- Título resumido do grupo
  title VARCHAR(500) NOT NULL,
  -- Número de eventos no grupo
  event_count INT NOT NULL DEFAULT 0,
  -- Dispositivos afetados (array de hostnames)
  affected_devices TEXT[] NOT NULL DEFAULT '{}',
  -- Host groups afetados
  affected_host_groups TEXT[] NOT NULL DEFAULT '{}',
  -- Tags comuns encontradas
  common_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Timestamp do primeiro evento
  first_event_at TIMESTAMPTZ NOT NULL,
  -- Timestamp do último evento
  last_event_at TIMESTAMPTZ NOT NULL,
  -- Quando foi resolvido
  resolved_at TIMESTAMPTZ,
  -- ID do incidente criado automaticamente (se auto_create_incident)
  incident_id UUID REFERENCES public.system_incidents(id) ON DELETE SET NULL,
  -- Se a notificação consolidada foi enviada
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  -- Metadados adicionais
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_by UUID REFERENCES public.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, group_fingerprint)
);

CREATE INDEX idx_event_groups_tenant ON public.event_groups(tenant_id, created_at DESC);
CREATE INDEX idx_event_groups_status ON public.event_groups(status) WHERE status != 'resolved';
CREATE INDEX idx_event_groups_rule ON public.event_groups(rule_id);
CREATE INDEX idx_event_groups_fingerprint ON public.event_groups(group_fingerprint);

CREATE TABLE IF NOT EXISTS public.event_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.event_groups(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- ID do evento no Zabbix
  zabbix_event_id VARCHAR(100) NOT NULL,
  -- Hostname do dispositivo
  device_hostname VARCHAR(255),
  -- ID do host no Zabbix
  zabbix_host_id VARCHAR(100),
  -- Nome do problema (trigger name)
  problem_name TEXT NOT NULL,
  -- Severidade individual do evento
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  -- Tags do Zabbix
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Timestamp do evento
  event_at TIMESTAMPTZ NOT NULL,
  -- Se o evento foi acknowledged no Zabbix
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  -- Se a notificação individual foi suprimida
  notification_suppressed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(group_id, zabbix_event_id)
);

CREATE INDEX idx_event_group_members_group ON public.event_group_members(group_id);
CREATE INDEX idx_event_group_members_tenant ON public.event_group_members(tenant_id);
CREATE INDEX idx_event_group_members_event ON public.event_group_members(zabbix_event_id);

-- RLS
ALTER TABLE public.event_correlation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY correlation_rules_tenant_isolation ON public.event_correlation_rules
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY correlation_rules_global_admin ON public.event_correlation_rules
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY event_groups_tenant_isolation ON public.event_groups
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY event_groups_global_admin ON public.event_groups
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY event_group_members_tenant_isolation ON public.event_group_members
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY event_group_members_global_admin ON public.event_group_members
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_correlation_rules TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_correlation_rules TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_groups TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_groups TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_group_members TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_group_members TO app_runtime;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_event_correlation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_correlation_rules_updated_at
  BEFORE UPDATE ON public.event_correlation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_event_correlation_updated_at();

CREATE TRIGGER trg_event_groups_updated_at
  BEFORE UPDATE ON public.event_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_event_correlation_updated_at();
