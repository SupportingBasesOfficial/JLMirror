-- Migration: SLA & Serviços — catálogo de serviços de negócio e SLA tracking

-- Tabela de serviços de negócio (ex: "Email Corporate", "VPN Site-to-Site")
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Tipo do serviço
  service_type TEXT NOT NULL DEFAULT 'business' CHECK (service_type IN ('business','infrastructure','application','network','security','custom')),
  -- Status atual do serviço
  status TEXT NOT NULL DEFAULT 'operational' CHECK (status IN ('operational','degraded','partial_outage','major_outage','maintenance','unknown')),
  -- Dispositivos associados a este serviço (referências lógicas por UUID)
  device_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Configuração de SLA
  sla_target_percentage NUMERIC(5,2) NOT NULL DEFAULT 99.90 CHECK (sla_target_percentage >= 0 AND sla_target_percentage <= 100),
  -- Janela de cobertura (ex: 24/7 ou 8h-18h seg-sex)
  coverage_hours TEXT NOT NULL DEFAULT '24/7',
  coverage_timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  coverage_days INT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}', -- 0=Dom, 6=Sab
  -- Prioridade do serviço
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  -- Integração com Zabbix (opcional)
  zabbix_service_id TEXT,
  -- Metadados
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_services_tenant ON public.services (tenant_id, is_active);
CREATE INDEX idx_services_status ON public.services (tenant_id, status);
CREATE INDEX idx_services_priority ON public.services (tenant_id, priority);

-- Tabela de registros de SLA (calculado periodicamente)
CREATE TABLE IF NOT EXISTS public.sla_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  -- Período de medição
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  -- Métricas calculadas
  uptime_seconds BIGINT NOT NULL DEFAULT 0,
  downtime_seconds BIGINT NOT NULL DEFAULT 0,
  uptime_percentage NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  -- Detalhes de incidentes
  incident_count INT NOT NULL DEFAULT 0,
  -- Status do SLA no período
  sla_met BOOLEAN NOT NULL DEFAULT true,
  -- Metadados
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_sla_records_service ON public.sla_records (service_id, period_start DESC);
CREATE INDEX idx_sla_records_tenant ON public.sla_records (tenant_id, period_start DESC);
CREATE INDEX idx_sla_records_sla_met ON public.sla_records (sla_met) WHERE sla_met = false;

-- Tabela de incidentes de serviço (downtime registrado)
CREATE TABLE IF NOT EXISTS public.service_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  -- Detalhes do incidente
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','major','critical','maintenance')),
  status TEXT NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating','identified','monitoring','resolved','scheduled')),
  -- Timeline
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  resolved_at TIMESTAMPTZ,
  downtime_seconds BIGINT,
  -- Causa raiz e resolução
  root_cause TEXT,
  resolution_notes TEXT,
  -- Dispositivos afetados
  affected_device_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Link com ticket se aplicável
  ticket_id UUID,
  -- Integração com Zabbix
  zabbix_event_id TEXT,
  -- Metadados
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_service_incidents_service ON public.service_incidents (service_id, status);
CREATE INDEX idx_service_incidents_tenant ON public.service_incidents (tenant_id, status);
CREATE INDEX idx_service_incidents_active ON public.service_incidents (tenant_id, started_at DESC) WHERE status NOT IN ('resolved','scheduled');

-- Tabela de janelas de manutenção locais (espelho do Zabbix ou standalone)
CREATE TABLE IF NOT EXISTS public.maintenance_windows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Dispositivos afetados
  device_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Período
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','completed','cancelled')),
  -- Tipo: data_collection (suprime alertas) ou maintenance (visível para usuários)
  maintenance_type TEXT NOT NULL DEFAULT 'data_collection' CHECK (maintenance_type IN ('data_collection','maintenance')),
  -- Integração com Zabbix
  zabbix_maintenance_id TEXT,
  -- Metadados
  created_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_maintenance_windows_tenant ON public.maintenance_windows (tenant_id, status);
CREATE INDEX idx_maintenance_windows_active ON public.maintenance_windows (tenant_id, start_at, end_at) WHERE status IN ('scheduled','active');

-- RLS
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_services ON public.services
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_sla_records ON public.sla_records
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_service_incidents ON public.service_incidents
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_maintenance_windows ON public.maintenance_windows
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Função para calcular uptime_percentage automaticamente
CREATE OR REPLACE FUNCTION public.calculate_uptime_percentage(
  p_uptime_seconds BIGINT,
  p_downtime_seconds BIGINT
)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  v_total := p_uptime_seconds + p_downtime_seconds;
  IF v_total = 0 THEN
    RETURN 100.00;
  END IF;
  RETURN ROUND((p_uptime_seconds::NUMERIC / v_total::NUMERIC) * 100.0, 2);
END;
$$;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_services_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_services_updated_at();

CREATE TRIGGER trigger_service_incidents_updated_at
  BEFORE UPDATE ON public.service_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_services_updated_at();

CREATE TRIGGER trigger_maintenance_windows_updated_at
  BEFORE UPDATE ON public.maintenance_windows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_services_updated_at();
