-- === Migration: dashboard_prefs ===
-- Tabela de preferências de dashboard por usuário + dispositivo
-- Permite que admin/cliente escolha quais categorias de métricas são visíveis por padrão
-- RLS baseado em app.current_tenant_id

CREATE TABLE IF NOT EXISTS tenant_template.dashboard_prefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  zabbix_host_id TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'auto',
  visible_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  collapsed_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  hidden_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  pinned_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, zabbix_host_id)
);

CREATE INDEX idx_dashboard_prefs_user_host
  ON tenant_template.dashboard_prefs(user_id, zabbix_host_id);

CREATE TRIGGER set_timestamp_dashboard_prefs
  BEFORE UPDATE ON tenant_template.dashboard_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- RLS: isolamento por tenant
ALTER TABLE tenant_template.dashboard_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_template.dashboard_prefs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_dashboard_prefs ON tenant_template.dashboard_prefs
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
