-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: System Health & Diagnostics — health checks, incidentes, snapshots de métricas

CREATE TABLE IF NOT EXISTS public.system_health_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('database','redis','api','zabbix','smtp','dns','webhook','external_api','filesystem','queue','custom')),
  endpoint TEXT,
  check_interval_seconds INT NOT NULL DEFAULT 60,
  timeout_seconds INT NOT NULL DEFAULT 10,
  expected_status_code INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_check_at TIMESTAMPTZ,
  last_status TEXT CHECK (last_status IN ('healthy','degraded','down','unknown')),
  last_response_time_ms INT,
  last_error TEXT,
  consecutive_failures INT NOT NULL DEFAULT 0,
  consecutive_successes INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_health_checks_tenant ON public.system_health_checks (tenant_id, is_active);
CREATE INDEX idx_health_checks_status ON public.system_health_checks (last_status) WHERE last_status != 'healthy';

-- Incidentes
CREATE TABLE IF NOT EXISTS public.system_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  incident_number TEXT NOT NULL,
  health_check_id UUID REFERENCES public.system_health_checks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','major','critical','maintenance')),
  status TEXT NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating','identified','monitoring','resolved','scheduled')),
  affected_services JSONB DEFAULT '[]'::jsonb,
  root_cause TEXT,
  resolution_notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  identified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  duration_mins INT,
  impact TEXT CHECK (impact IN ('none','minor','moderate','significant','severe')),
  is_scheduled BOOLEAN NOT NULL DEFAULT false,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, incident_number)
);

CREATE INDEX idx_incidents_tenant ON public.system_incidents (tenant_id, started_at DESC);
CREATE INDEX idx_incidents_status ON public.system_incidents (status, severity);
CREATE INDEX idx_incidents_active ON public.system_incidents (tenant_id) WHERE status NOT IN ('resolved');

-- Snapshots de métricas do sistema
CREATE TABLE IF NOT EXISTS public.system_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('cpu','memory','disk','network','database','redis','api','queue','custom')),
  value DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL DEFAULT 'percent',
  labels JSONB DEFAULT '{}'::jsonb,
  threshold_warning DOUBLE PRECISION,
  threshold_critical DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy','warning','critical')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_metric_snapshots_tenant ON public.system_metric_snapshots (tenant_id, captured_at DESC);
CREATE INDEX idx_metric_snapshots_name ON public.system_metric_snapshots (metric_name, captured_at DESC);
CREATE INDEX idx_metric_snapshots_status ON public.system_metric_snapshots (status) WHERE status != 'healthy';

-- RLS
ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_metric_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY health_checks_tenant_isolation ON public.system_health_checks
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY health_checks_global_admin ON public.system_health_checks
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY incidents_tenant_isolation ON public.system_incidents
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY incidents_global_admin ON public.system_incidents
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY metric_snapshots_tenant_isolation ON public.system_metric_snapshots
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY metric_snapshots_global_admin ON public.system_metric_snapshots
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_health_checks TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_health_checks TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_incidents TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_incidents TO app_runtime;
GRANT SELECT, INSERT ON public.system_metric_snapshots TO app_login;
GRANT SELECT, INSERT ON public.system_metric_snapshots TO app_runtime;

-- Triggers
CREATE TRIGGER set_updated_at_health_checks BEFORE UPDATE ON public.system_health_checks
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER set_updated_at_incidents BEFORE UPDATE ON public.system_incidents
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Funcao para gerar numero de incidente
CREATE OR REPLACE FUNCTION public.generate_incident_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
  v_number TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.system_incidents
  WHERE tenant_id = p_tenant_id
    AND created_at >= date_trunc('year', timezone('utc'::text, now()));

  v_number := 'INC-' || EXTRACT(YEAR FROM timezone('utc'::text, now()))::TEXT || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN v_number;
END;
$$;

-- View: status atual do sistema
CREATE OR REPLACE VIEW public.system_status_overview AS
SELECT
  hc.tenant_id,
  COUNT(*) FILTER (WHERE hc.last_status = 'healthy' AND hc.is_active = true) as healthy_services,
  COUNT(*) FILTER (WHERE hc.last_status = 'degraded' AND hc.is_active = true) as degraded_services,
  COUNT(*) FILTER (WHERE hc.last_status = 'down' AND hc.is_active = true) as down_services,
  COUNT(*) FILTER (WHERE hc.last_status = 'unknown' AND hc.is_active = true) as unknown_services,
  COUNT(*) FILTER (WHERE hc.is_active = true) as total_services,
  (SELECT COUNT(*) FROM public.system_incidents si WHERE si.tenant_id = hc.tenant_id AND si.status NOT IN ('resolved')) as active_incidents
FROM public.system_health_checks hc
GROUP BY hc.tenant_id;

-- Retention: snapshots por 30 dias
CREATE OR REPLACE FUNCTION public.cleanup_old_metric_snapshots()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.system_metric_snapshots
  WHERE captured_at < timezone('utc'::text, now()) - INTERVAL '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
