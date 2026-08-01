-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Feature Flags & A/B Testing — flags persistentes, rollouts, segmentação, métricas

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  flag_type TEXT NOT NULL DEFAULT 'boolean' CHECK (flag_type IN ('boolean','percentage','variant','kill_switch')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_value JSONB NOT NULL DEFAULT 'false'::jsonb,
  rollout_percentage INT NOT NULL DEFAULT 100 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  variants JSONB DEFAULT '[]'::jsonb,
  target_segments JSONB DEFAULT '[]'::jsonb,
  excluded_tenant_ids JSONB DEFAULT '[]'::jsonb,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  total_evaluations BIGINT NOT NULL DEFAULT 0,
  true_evaluations BIGINT NOT NULL DEFAULT 0,
  false_evaluations BIGINT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, key)
);

CREATE INDEX idx_feature_flags_tenant ON public.feature_flags (tenant_id, is_active);
CREATE INDEX idx_feature_flags_key ON public.feature_flags (key);

-- Overrides por tenant ou usuario
CREATE TABLE IF NOT EXISTS public.feature_flag_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('tenant','user','segment')),
  target_id TEXT NOT NULL,
  value JSONB NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(flag_id, target_type, target_id)
);

CREATE INDEX idx_flag_overrides_flag ON public.feature_flag_overrides (flag_id);
CREATE INDEX idx_flag_overrides_target ON public.feature_flag_overrides (target_type, target_id);

-- Log de avaliacoes (para métricas de adoção)
CREATE TABLE IF NOT EXISTS public.feature_flag_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,
  user_id UUID,
  evaluated_value JSONB NOT NULL,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_flag_events_flag ON public.feature_flag_events (flag_id, created_at DESC);
CREATE INDEX idx_flag_events_tenant ON public.feature_flag_events (tenant_id, created_at DESC);
CREATE INDEX idx_flag_events_key_time ON public.feature_flag_events (flag_key, created_at DESC);

-- RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY feature_flags_tenant_isolation ON public.feature_flags
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY feature_flags_global_admin ON public.feature_flags
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY flag_overrides_tenant_isolation ON public.feature_flag_overrides
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY flag_overrides_global_admin ON public.feature_flag_overrides
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY flag_events_tenant_isolation ON public.feature_flag_events
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY flag_events_global_admin ON public.feature_flag_events
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flag_overrides TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flag_overrides TO app_runtime;
GRANT SELECT, INSERT ON public.feature_flag_events TO app_login;
GRANT SELECT, INSERT ON public.feature_flag_events TO app_runtime;

-- Triggers
CREATE TRIGGER set_updated_at_feature_flags BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Seed de flags iniciais
INSERT INTO public.feature_flags (tenant_id, key, name, description, flag_type, default_value, rollout_percentage, target_segments)
SELECT NULL, 'new_dashboard', 'New Dashboard', 'Habilita o novo dashboard com graficos interativos', 'boolean', 'false'::jsonb, 100, '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'new_dashboard');

INSERT INTO public.feature_flags (tenant_id, key, name, description, flag_type, default_value, rollout_percentage, target_segments)
SELECT NULL, 'beta_api', 'Beta API', 'Habilita endpoints experimentais da API', 'boolean', 'false'::jsonb, 50, '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'beta_api');

INSERT INTO public.feature_flags (tenant_id, key, name, description, flag_type, default_value, rollout_percentage, target_segments)
SELECT NULL, 'enable_ppr', 'React Compiler (PPR)', 'Habilita React Compiler e Partial Prerendering', 'boolean', 'false'::jsonb, 100, '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'enable_ppr');
