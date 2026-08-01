-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: create_public_devices ===
-- Cria tabela public.devices com RLS para suportar JOINs cross-modulo
-- (drift, anomaly, predictions, discovery, settings, report-generator)
-- Reflete o schema do tenant_template.devices mas com colunas adicionais

CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  ip TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'server',
  device_type TEXT,
  vendor TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT true,
  zabbix_host_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_devices_tenant_id ON public.devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_hostname ON public.devices(hostname);
CREATE INDEX IF NOT EXISTS idx_devices_status ON public.devices(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_tenant_zabbix ON public.devices(tenant_id, zabbix_host_id) WHERE zabbix_host_id IS NOT NULL;

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY devices_tenant_isolation ON public.devices
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO jlmirror_app;
