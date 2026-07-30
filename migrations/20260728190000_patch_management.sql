-- === Migration: Patch Management ===
-- Rastreia patches de segurança e atualizações de software nos dispositivos do tenant
-- Permite scan de vulnerabilidades, aprovação e deploy de patches

CREATE TABLE IF NOT EXISTS public.patch_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  scan_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  total_devices INT NOT NULL DEFAULT 0,
  scanned_devices INT NOT NULL DEFAULT 0,
  total_patches INT NOT NULL DEFAULT 0,
  critical_patches INT NOT NULL DEFAULT 0,
  high_patches INT NOT NULL DEFAULT 0,
  medium_patches INT NOT NULL DEFAULT 0,
  low_patches INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_patch_scans_tenant ON public.patch_scans(tenant_id);
CREATE INDEX idx_patch_scans_date ON public.patch_scans(scan_date);

CREATE TABLE IF NOT EXISTS public.patches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  device_id UUID,
  device_hostname VARCHAR(255),
  kb_article VARCHAR(100),
  patch_name VARCHAR(500) NOT NULL,
  vendor VARCHAR(100) NOT NULL,
  product VARCHAR(200) NOT NULL,
  version VARCHAR(100),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  category VARCHAR(50) NOT NULL DEFAULT 'security' CHECK (category IN ('security', 'feature', 'bugfix', 'driver')),
  description TEXT,
  release_date TIMESTAMPTZ,
  installed_date TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'approved', 'installing', 'installed', 'failed', 'rejected', 'superseded')),
  requires_reboot BOOLEAN NOT NULL DEFAULT false,
  size_bytes BIGINT,
  error_message TEXT,
  scan_id UUID REFERENCES public.patch_scans(id) ON DELETE SET NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  installed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_patches_tenant ON public.patches(tenant_id);
CREATE INDEX idx_patches_device ON public.patches(device_id);
CREATE INDEX idx_patches_status ON public.patches(status);
CREATE INDEX idx_patches_severity ON public.patches(severity);

CREATE TABLE IF NOT EXISTS public.patch_deployment_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  patch_ids UUID[] NOT NULL DEFAULT '{}',
  target_device_ids UUID[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'running', 'completed', 'failed', 'cancelled')),
  total_patches INT NOT NULL DEFAULT 0,
  total_devices INT NOT NULL DEFAULT 0,
  successful_installs INT NOT NULL DEFAULT 0,
  failed_installs INT NOT NULL DEFAULT 0,
  requires_reboot BOOLEAN NOT NULL DEFAULT false,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_patch_deployments_tenant ON public.patch_deployment_jobs(tenant_id);
CREATE INDEX idx_patch_deployments_status ON public.patch_deployment_jobs(status);

-- RLS
ALTER TABLE public.patch_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patch_deployment_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY patch_scans_login_select ON public.patch_scans FOR SELECT TO app_login USING (true);
CREATE POLICY patch_scans_login_insert ON public.patch_scans FOR INSERT TO app_login WITH CHECK (true);
CREATE POLICY patch_scans_login_update ON public.patch_scans FOR UPDATE TO app_login USING (true) WITH CHECK (true);
CREATE POLICY patch_scans_login_delete ON public.patch_scans FOR DELETE TO app_login USING (true);

CREATE POLICY patches_login_select ON public.patches FOR SELECT TO app_login USING (true);
CREATE POLICY patches_login_insert ON public.patches FOR INSERT TO app_login WITH CHECK (true);
CREATE POLICY patches_login_update ON public.patches FOR UPDATE TO app_login USING (true) WITH CHECK (true);
CREATE POLICY patches_login_delete ON public.patches FOR DELETE TO app_login USING (true);

CREATE POLICY patch_deployments_login_select ON public.patch_deployment_jobs FOR SELECT TO app_login USING (true);
CREATE POLICY patch_deployments_login_insert ON public.patch_deployment_jobs FOR INSERT TO app_login WITH CHECK (true);
CREATE POLICY patch_deployments_login_update ON public.patch_deployment_jobs FOR UPDATE TO app_login USING (true) WITH CHECK (true);
CREATE POLICY patch_deployments_login_delete ON public.patch_deployment_jobs FOR DELETE TO app_login USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patch_scans TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patches TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patch_deployment_jobs TO app_runtime;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_patch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_patches_updated_at BEFORE UPDATE ON public.patches FOR EACH ROW EXECUTE FUNCTION public.set_patch_updated_at();
CREATE TRIGGER trg_patch_deployments_updated_at BEFORE UPDATE ON public.patch_deployment_jobs FOR EACH ROW EXECUTE FUNCTION public.set_patch_updated_at();
