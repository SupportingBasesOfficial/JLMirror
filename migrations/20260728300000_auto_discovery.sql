-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: Auto-Discovery de Topologia (SNMP/LLDP) ===
-- Descoberta automatica de dispositivos e topologia de rede via SNMP/LLDP

CREATE TABLE IF NOT EXISTS public.discovery_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Configuracao da sessao de discovery
  name VARCHAR(200) NOT NULL,
  -- Range de IPs para escanear (CIDR)
  ip_ranges TEXT[] NOT NULL,
  -- Configuracao SNMP
  snmp_communities TEXT[] NOT NULL DEFAULT '{"public"}'::text[],
  snmp_ports INT[] NOT NULL DEFAULT '{161}'::int[],
  snmp_timeout_ms INT NOT NULL DEFAULT 3000,
  snmp_retries INT NOT NULL DEFAULT 2,
  -- Protocolos habilitados
  use_snmp BOOLEAN NOT NULL DEFAULT true,
  use_lldp BOOLEAN NOT NULL DEFAULT true,
  use_arp BOOLEAN NOT NULL DEFAULT true,
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Resultados
  devices_found INT NOT NULL DEFAULT 0,
  links_found INT NOT NULL DEFAULT 0,
  error_message TEXT,
  -- Metadados
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_discovery_sessions_tenant ON public.discovery_sessions(tenant_id);
CREATE INDEX idx_discovery_sessions_status ON public.discovery_sessions(status);

-- Dispositivos descobertos
CREATE TABLE IF NOT EXISTS public.discovered_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.discovery_sessions(id) ON DELETE CASCADE,
  -- Dados do dispositivo
  ip_address INET NOT NULL,
  hostname VARCHAR(200),
  sys_descr TEXT,
  sys_object_id VARCHAR(200),
  sys_uptime BIGINT,
  sys_contact VARCHAR(200),
  sys_location VARCHAR(200),
  -- Tipo de dispositivo (router, switch, server, etc)
  device_type VARCHAR(50),
  vendor VARCHAR(100),
  model VARCHAR(100),
  -- Interfaces
  interfaces JSONB DEFAULT '[]'::jsonb,
  -- MAC address
  mac_address VARCHAR(20),
  -- Metodo de descoberta
  discovered_via VARCHAR(20) NOT NULL CHECK (discovered_via IN ('snmp', 'lldp', 'arp', 'icmp')),
  -- Vinculo com dispositivo cadastrado
  device_id UUID,
  -- Metadados
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(session_id, ip_address)
);

CREATE INDEX idx_discovered_devices_tenant ON public.discovered_devices(tenant_id);
CREATE INDEX idx_discovered_devices_session ON public.discovered_devices(session_id);
CREATE INDEX idx_discovered_devices_ip ON public.discovered_devices(ip_address);

-- Links de topologia (conexoes entre dispositivos)
CREATE TABLE IF NOT EXISTS public.discovered_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.discovery_sessions(id) ON DELETE CASCADE,
  -- Dispositivos conectados
  source_device_id UUID NOT NULL REFERENCES public.discovered_devices(id) ON DELETE CASCADE,
  target_device_id UUID NOT NULL REFERENCES public.discovered_devices(id) ON DELETE CASCADE,
  -- Interfaces
  source_interface VARCHAR(100),
  target_interface VARCHAR(100),
  -- Metodo de descoberta do link
  discovered_via VARCHAR(20) NOT NULL CHECK (discovered_via IN ('lldp', 'cdp', 'stp', 'mac_table')),
  -- Metadados
  link_speed VARCHAR(50),
  link_status VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(session_id, source_device_id, target_device_id, source_interface, target_interface)
);

CREATE INDEX idx_discovered_links_tenant ON public.discovered_links(tenant_id);
CREATE INDEX idx_discovered_links_session ON public.discovered_links(session_id);

-- RLS
ALTER TABLE public.discovery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovered_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovered_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY discovery_sessions_tenant_isolation ON public.discovery_sessions
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY discovery_sessions_global_admin ON public.discovery_sessions
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY discovered_devices_tenant_isolation ON public.discovered_devices
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY discovered_devices_global_admin ON public.discovered_devices
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY discovered_links_tenant_isolation ON public.discovered_links
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY discovered_links_global_admin ON public.discovered_links
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_sessions TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_sessions TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovered_devices TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovered_devices TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovered_links TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovered_links TO app_runtime;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_discovery_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_discovery_sessions_updated_at
  BEFORE UPDATE ON public.discovery_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_discovery_sessions_updated_at();
