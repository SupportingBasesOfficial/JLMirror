-- === Migration: 006_tenant_template ===
-- Schema template para novos tenants
-- clone_schema() copia este schema para tenant_{slug} durante onboarding
-- RLS em todas as tabelas usando current_setting('app.current_tenant_id', true)::uuid

CREATE SCHEMA IF NOT EXISTS tenant_template;

CREATE TABLE IF NOT EXISTS tenant_template.devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  hostname TEXT NOT NULL,
  ip TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'server',
  status TEXT NOT NULL DEFAULT 'active',
  zabbix_host_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS tenant_template.device_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES tenant_template.devices(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  zabbix_item_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS tenant_template.monitoring_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  device_id UUID NOT NULL REFERENCES tenant_template.devices(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_monitoring_data_device_metric_time
  ON tenant_template.monitoring_data(device_id, metric, timestamp DESC);
CREATE INDEX idx_monitoring_data_tenant
  ON tenant_template.monitoring_data(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_template.zabbix_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  api_url TEXT NOT NULL,
  api_token_encrypted TEXT NOT NULL,
  sync_interval_seconds INTEGER NOT NULL DEFAULT 300,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS tenant_template.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_audit_logs_tenant ON tenant_template.audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON tenant_template.audit_logs(user_id);

-- Triggers de timestamp
CREATE TRIGGER set_timestamp_devices
  BEFORE UPDATE ON tenant_template.devices
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER set_timestamp_zabbix_configs
  BEFORE UPDATE ON tenant_template.zabbix_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- RLS: defense in depth
-- current_setting('app.current_tenant_id', true) com missing_ok
-- Se não setado, retorna NULL → comparação é sempre falsa → bloqueia tudo
ALTER TABLE tenant_template.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_template.device_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_template.monitoring_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_template.zabbix_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_template.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_devices ON tenant_template.devices
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_device_metrics ON tenant_template.device_metrics
  USING (device_id IN (
    SELECT id FROM tenant_template.devices
    WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
  ));

CREATE POLICY tenant_isolation_monitoring ON tenant_template.monitoring_data
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_zabbix_configs ON tenant_template.zabbix_configs
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_audit_logs ON tenant_template.audit_logs
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
