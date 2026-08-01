-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Asset Inventory — inventário de ativos de rede, hardware, software, licenças

CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_tag TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'server','vm','container','network_switch','router','firewall','load_balancer',
    'workstation','laptop','mobile','printer','storage','appliance','iot','other'
  )),
  category TEXT NOT NULL CHECK (category IN ('hardware','software','network','virtual','license','service')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active','inactive','maintenance','retired','lost','stolen','disposed'
  )),
  criticality TEXT NOT NULL DEFAULT 'low' CHECK (criticality IN ('low','medium','high','critical')),
  hostname TEXT,
  ip_address TEXT,
  mac_address TEXT,
  serial_number TEXT,
  manufacturer TEXT,
  model TEXT,
  os_type TEXT,
  os_version TEXT,
  location TEXT,
  rack TEXT,
  rack_position TEXT,
  purchase_date DATE,
  purchase_cost NUMERIC(12,2),
  warranty_expiry DATE,
  vendor TEXT,
  assigned_to TEXT,
  department TEXT,
  notes TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  parent_asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, asset_tag)
);

CREATE INDEX idx_assets_tenant ON public.assets (tenant_id, status);
CREATE INDEX idx_assets_type ON public.assets (asset_type, category);
CREATE INDEX idx_assets_hostname ON public.assets (hostname);
CREATE INDEX idx_assets_ip ON public.assets (ip_address);
CREATE INDEX idx_assets_parent ON public.assets (parent_asset_id);
CREATE INDEX idx_assets_criticality ON public.assets (criticality, status);
CREATE INDEX idx_assets_tags ON public.assets USING GIN (tags);

-- Licenças de software associadas a ativos
CREATE TABLE IF NOT EXISTS public.asset_licenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  license_key TEXT,
  software_name TEXT NOT NULL,
  vendor TEXT,
  license_type TEXT NOT NULL CHECK (license_type IN ('perpetual','subscription','oem','volume','concurrent','open_source','trial')),
  seats_total INT NOT NULL DEFAULT 1,
  seats_used INT NOT NULL DEFAULT 0,
  purchase_date DATE,
  expiry_date DATE,
  renewal_date DATE,
  cost NUMERIC(12,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_asset_licenses_tenant ON public.asset_licenses (tenant_id, is_active);
CREATE INDEX idx_asset_licenses_asset ON public.asset_licenses (asset_id);
CREATE INDEX idx_asset_licenses_expiry ON public.asset_licenses (expiry_date) WHERE is_active = true;

-- Histórico de mudanças de ativos
CREATE TABLE IF NOT EXISTS public.asset_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('created','updated','status_changed','assigned','unassigned','license_added','license_removed','retired','disposed')),
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_asset_changes_asset ON public.asset_changes (asset_id, created_at DESC);
CREATE INDEX idx_asset_changes_tenant ON public.asset_changes (tenant_id, created_at DESC);

-- RLS
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY assets_tenant_isolation ON public.assets
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY assets_global_admin ON public.assets
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY asset_licenses_tenant_isolation ON public.asset_licenses
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY asset_licenses_global_admin ON public.asset_licenses
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY asset_changes_tenant_isolation ON public.asset_changes
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY asset_changes_global_admin ON public.asset_changes
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_licenses TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_licenses TO app_runtime;
GRANT SELECT, INSERT ON public.asset_changes TO app_login;
GRANT SELECT, INSERT ON public.asset_changes TO app_runtime;

-- Triggers
CREATE TRIGGER set_updated_at_assets BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER set_updated_at_asset_licenses BEFORE UPDATE ON public.asset_licenses
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Funcao para registrar mudanca de ativo
CREATE OR REPLACE FUNCTION public.log_asset_change(
  p_asset_id UUID,
  p_change_type TEXT,
  p_field_name TEXT DEFAULT NULL,
  p_old_value TEXT DEFAULT NULL,
  p_new_value TEXT DEFAULT NULL,
  p_changed_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.assets WHERE id = p_asset_id;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.asset_changes (tenant_id, asset_id, change_type, field_name, old_value, new_value, changed_by)
  VALUES (v_tenant_id, p_asset_id, p_change_type, p_field_name, p_old_value, p_new_value, p_changed_by);
END;
$$;

-- View para dashboard: ativos com licencas expirando
CREATE OR REPLACE VIEW public.assets_with_license_alerts AS
SELECT
  a.id as asset_id,
  a.name as asset_name,
  a.asset_tag,
  a.hostname,
  l.id as license_id,
  l.software_name,
  l.expiry_date,
  l.renewal_date,
  CASE
    WHEN l.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN l.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'valid'
  END AS license_status,
  (l.expiry_date - CURRENT_DATE)::INT AS days_until_expiry
FROM public.assets a
JOIN public.asset_licenses l ON a.id = l.asset_id
WHERE l.is_active = true AND a.status = 'active' AND a.tenant_id = current_setting('app.current_tenant_id', true)::uuid;
