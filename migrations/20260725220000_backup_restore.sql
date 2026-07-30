-- Migration: Backup & Restore management — agendamento, snapshots, verificação de integridade

CREATE TABLE IF NOT EXISTS public.backup_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  target_host TEXT NOT NULL,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('full','incremental','differential','snapshot')),
  source_path TEXT NOT NULL,
  destination_type TEXT NOT NULL CHECK (destination_type IN ('local','s3','sftp','nfs','azure_blob','gcs')),
  destination_path TEXT NOT NULL,
  retention_count INT NOT NULL DEFAULT 7,
  retention_days INT NOT NULL DEFAULT 30,
  compression TEXT NOT NULL DEFAULT 'gzip' CHECK (compression IN ('none','gzip','zstd','bzip2','lz4')),
  encryption BOOLEAN NOT NULL DEFAULT true,
  encryption_key_id TEXT,
  is_scheduled BOOLEAN NOT NULL DEFAULT false,
  cron_expression TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_backup_jobs_tenant ON public.backup_jobs (tenant_id, is_active);
CREATE INDEX idx_backup_jobs_next_run ON public.backup_jobs (next_run_at) WHERE is_scheduled = true AND is_active = true;

-- Snapshots (cada execução de backup gera um snapshot)
CREATE TABLE IF NOT EXISTS public.backup_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.backup_jobs(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('full','incremental','differential','snapshot')),
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','verifying','verified','corrupted','expired')),
  file_path TEXT,
  file_size_bytes BIGINT,
  compressed_size_bytes BIGINT,
  checksum_sha256 TEXT,
  checksum_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  parent_snapshot_id UUID REFERENCES public.backup_snapshots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_backup_snapshots_job ON public.backup_snapshots (job_id, created_at DESC);
CREATE INDEX idx_backup_snapshots_tenant ON public.backup_snapshots (tenant_id, created_at DESC);
CREATE INDEX idx_backup_snapshots_status ON public.backup_snapshots (status);

-- Restaurações
CREATE TABLE IF NOT EXISTS public.backup_restores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_id UUID NOT NULL REFERENCES public.backup_snapshots(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_host TEXT NOT NULL,
  target_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','verifying')),
  overwrite_existing BOOLEAN NOT NULL DEFAULT false,
  checksum_verified BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  error_message TEXT,
  restored_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_backup_restores_tenant ON public.backup_restores (tenant_id, created_at DESC);
CREATE INDEX idx_backup_restores_snapshot ON public.backup_restores (snapshot_id, created_at DESC);

-- RLS
ALTER TABLE public.backup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_restores ENABLE ROW LEVEL SECURITY;

CREATE POLICY backup_jobs_tenant_isolation ON public.backup_jobs
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY backup_jobs_global_admin ON public.backup_jobs
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY backup_snapshots_tenant_isolation ON public.backup_snapshots
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY backup_snapshots_global_admin ON public.backup_snapshots
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY backup_restores_tenant_isolation ON public.backup_restores
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY backup_restores_global_admin ON public.backup_restores
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_jobs TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_jobs TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.backup_snapshots TO app_login;
GRANT SELECT, INSERT, UPDATE ON public.backup_snapshots TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.backup_restores TO app_login;
GRANT SELECT, INSERT, UPDATE ON public.backup_restores TO app_runtime;

-- Trigger para updated_at
CREATE TRIGGER set_updated_at_backup_jobs BEFORE UPDATE ON public.backup_jobs
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Funcao para calcular proximo run baseado em cron (simplificado: assume intervalo em horas)
CREATE OR REPLACE FUNCTION public.calculate_next_run(p_cron TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_interval_hours INT;
BEGIN
  -- Simplificado: extrai horas de cron como "*/N * * * *" ou "0 */N * * *"
  -- MVP: assume cron simples. Enterprise: usar pg_cron ou parser real.
  v_interval_hours := 24; -- default diario

  IF p_cron LIKE '*/% * * * *' THEN
    v_interval_hours := 1;
  ELSIF p_cron LIKE '0 */% * * *' THEN
    v_interval_hours := SUBSTRING(p_cron FROM '0 \*/(\d+)')::INT;
  END IF;

  RETURN timezone('utc'::text, now()) + (v_interval_hours || ' hours')::INTERVAL;
END;
$$;

-- Funcao para limpar snapshots expirados baseado em retencao
CREATE OR REPLACE FUNCTION public.cleanup_expired_snapshots(p_job_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job public.backup_jobs;
  v_deleted INT;
BEGIN
  SELECT * INTO v_job FROM public.backup_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Marca como expired snapshots que excedem retention_days ou retention_count
  UPDATE public.backup_snapshots
  SET status = 'expired'
  WHERE job_id = p_job_id
    AND status IN ('completed', 'verified')
    AND (
      created_at < timezone('utc'::text, now()) - (v_job.retention_days || ' days')::INTERVAL
      OR id NOT IN (
        SELECT id FROM public.backup_snapshots
        WHERE job_id = p_job_id AND status IN ('completed', 'verified')
        ORDER BY created_at DESC
        LIMIT v_job.retention_count
      )
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
