-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Notification & Alerting system — canais, regras de roteamento e log

CREATE TABLE IF NOT EXISTS public.notification_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('slack','email','webhook','teams','telegram','discord','pagerduty')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_notif_channels_tenant ON public.notification_channels (tenant_id, is_active);

-- Regras de roteamento: qual evento dispara qual canal
CREATE TABLE IF NOT EXISTS public.notification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  event_source TEXT NOT NULL CHECK (event_source IN (
    'ssl.expiring_soon','ssl.expired','ssl.revoked',
    'backup.completed','backup.failed','backup.corrupted',
    'k8s.pod_crash','k8s.node_down','k8s.event_warning',
    'firewall.applied','firewall.failed',
    'script.executed','script.failed','script.approval_needed',
    'monitoring.cpu_high','monitoring.disk_high','monitoring.memory_high','monitoring.service_down',
    'custom'
  )),
  event_category TEXT NOT NULL CHECK (event_category IN ('security','backup','k8s','firewall','script','monitoring','custom')),
  severity_filter TEXT NOT NULL DEFAULT 'all' CHECK (severity_filter IN ('all','info','warning','critical')),
  channel_ids UUID[] NOT NULL DEFAULT '{}',
  template_subject TEXT,
  template_body TEXT,
  cooldown_minutes INT NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_notif_rules_tenant ON public.notification_rules (tenant_id, is_active);
CREATE INDEX idx_notif_rules_source ON public.notification_rules (event_source, is_active);

-- Log de notificações enviadas
CREATE TABLE IF NOT EXISTS public.notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.notification_rules(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES public.notification_channels(id) ON DELETE SET NULL,
  event_source TEXT NOT NULL,
  event_category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  subject TEXT,
  body TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('sent','failed','pending','rate_limited')),
  error_message TEXT,
  response_data JSONB,
  sent_at TIMESTAMPTZ,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_notif_log_tenant ON public.notification_log (tenant_id, created_at DESC);
CREATE INDEX idx_notif_log_rule ON public.notification_log (rule_id, created_at DESC);
CREATE INDEX idx_notif_log_channel ON public.notification_log (channel_id, created_at DESC);
CREATE INDEX idx_notif_log_status ON public.notification_log (status);

-- RLS
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_channels_tenant_isolation ON public.notification_channels
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY notif_channels_global_admin ON public.notification_channels
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY notif_rules_tenant_isolation ON public.notification_rules
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY notif_rules_global_admin ON public.notification_rules
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY notif_log_tenant_isolation ON public.notification_log
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY notif_log_global_admin ON public.notification_log
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_channels TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_channels TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_rules TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_rules TO app_runtime;
GRANT SELECT, INSERT ON public.notification_log TO app_login;
GRANT SELECT, INSERT ON public.notification_log TO app_runtime;

-- Triggers para updated_at
CREATE TRIGGER set_updated_at_notif_channels BEFORE UPDATE ON public.notification_channels
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER set_updated_at_notif_rules BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Funcao para verificar cooldown de regra
CREATE OR REPLACE FUNCTION public.check_rule_cooldown(p_rule_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule public.notification_rules;
BEGIN
  SELECT * INTO v_rule FROM public.notification_rules WHERE id = p_rule_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_rule.last_triggered_at IS NULL THEN RETURN true; END IF;

  RETURN v_rule.last_triggered_at < timezone('utc'::text, now()) - (v_rule.cooldown_minutes || ' minutes')::INTERVAL;
END;
$$;
