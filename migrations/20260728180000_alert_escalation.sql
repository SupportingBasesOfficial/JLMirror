-- === Migration: Alerting com Multi-Tier Escalation ===
-- Cria tabelas para políticas de escalonamento de alertas
-- Permite configurar tiers que escalonam alertas não resolvidos após tempo definido

CREATE TABLE IF NOT EXISTS public.alert_escalation_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  event_source VARCHAR(100) NOT NULL,
  severity_filter VARCHAR(20) NOT NULL DEFAULT 'critical',
  repeat_count INT NOT NULL DEFAULT 3,
  repeat_interval_minutes INT NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_escalation_policies_tenant ON public.alert_escalation_policies(tenant_id);
CREATE INDEX idx_escalation_policies_event ON public.alert_escalation_policies(event_source);

CREATE TABLE IF NOT EXISTS public.alert_escalation_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES public.alert_escalation_policies(id) ON DELETE CASCADE,
  tier INT NOT NULL CHECK (tier >= 1 AND tier <= 10),
  delay_minutes INT NOT NULL DEFAULT 0,
  channel_ids UUID[] NOT NULL DEFAULT '{}',
  template_subject VARCHAR(500),
  template_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(policy_id, tier)
);

CREATE INDEX idx_escalation_steps_policy ON public.alert_escalation_steps(policy_id);

CREATE TABLE IF NOT EXISTS public.alert_escalation_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  policy_id UUID NOT NULL REFERENCES public.alert_escalation_policies(id) ON DELETE CASCADE,
  alert_subject VARCHAR(500) NOT NULL,
  alert_body TEXT NOT NULL,
  alert_severity VARCHAR(20) NOT NULL DEFAULT 'critical',
  alert_source VARCHAR(100) NOT NULL,
  alert_payload JSONB,
  current_tier INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'escalated', 'resolved', 'cancelled')),
  next_escalation_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_escalation_instances_tenant ON public.alert_escalation_instances(tenant_id);
CREATE INDEX idx_escalation_instances_status ON public.alert_escalation_instances(status);
CREATE INDEX idx_escalation_instances_next_escalation ON public.alert_escalation_instances(next_escalation_at) WHERE status = 'active';

-- RLS
ALTER TABLE public.alert_escalation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_escalation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_escalation_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY escalation_policies_login_select ON public.alert_escalation_policies FOR SELECT TO app_login USING (true);
CREATE POLICY escalation_policies_login_insert ON public.alert_escalation_policies FOR INSERT TO app_login WITH CHECK (true);
CREATE POLICY escalation_policies_login_update ON public.alert_escalation_policies FOR UPDATE TO app_login USING (true) WITH CHECK (true);
CREATE POLICY escalation_policies_login_delete ON public.alert_escalation_policies FOR DELETE TO app_login USING (true);

CREATE POLICY escalation_steps_login_select ON public.alert_escalation_steps FOR SELECT TO app_login USING (true);
CREATE POLICY escalation_steps_login_insert ON public.alert_escalation_steps FOR INSERT TO app_login WITH CHECK (true);
CREATE POLICY escalation_steps_login_update ON public.alert_escalation_steps FOR UPDATE TO app_login USING (true) WITH CHECK (true);
CREATE POLICY escalation_steps_login_delete ON public.alert_escalation_steps FOR DELETE TO app_login USING (true);

CREATE POLICY escalation_instances_login_select ON public.alert_escalation_instances FOR SELECT TO app_login USING (true);
CREATE POLICY escalation_instances_login_insert ON public.alert_escalation_instances FOR INSERT TO app_login WITH CHECK (true);
CREATE POLICY escalation_instances_login_update ON public.alert_escalation_instances FOR UPDATE TO app_login USING (true) WITH CHECK (true);
CREATE POLICY escalation_instances_login_delete ON public.alert_escalation_instances FOR DELETE TO app_login USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_escalation_policies TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_escalation_steps TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_escalation_instances TO app_runtime;
