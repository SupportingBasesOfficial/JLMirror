-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Automação de scripts — execução remota com approval workflow
-- Suporta scripts versionados, execuções com status tracking e aprovação dupla

CREATE TABLE IF NOT EXISTS public.scripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  language TEXT NOT NULL DEFAULT 'bash' CHECK (language IN ('bash','python','powershell','node')),
  content TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  timeout_seconds INT NOT NULL DEFAULT 300 CHECK (timeout_seconds > 0 AND timeout_seconds <= 3600),
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  max_concurrent_executions INT NOT NULL DEFAULT 1 CHECK (max_concurrent_executions > 0 AND max_concurrent_executions <= 10),
  allowed_hosts TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES public.users(id),
  updated_by UUID REFERENCES public.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_scripts_tenant ON public.scripts (tenant_id, created_at DESC);
CREATE INDEX idx_scripts_active ON public.scripts (is_active, tenant_id);
CREATE INDEX idx_scripts_tags ON public.scripts USING GIN (tags);

-- Histórico de versões (append-only)
CREATE TABLE IF NOT EXISTS public.script_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  version INT NOT NULL,
  content TEXT NOT NULL,
  changed_by UUID REFERENCES public.users(id),
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(script_id, version)
);

CREATE INDEX idx_script_versions_script ON public.script_versions (script_id, version DESC);

-- Execuções de scripts
CREATE TABLE IF NOT EXISTS public.script_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','running','completed','failed','timeout','cancelled','rejected')),
  target_host TEXT NOT NULL,
  initiated_by UUID REFERENCES public.users(id),
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  exit_code INT,
  stdout TEXT,
  stderr TEXT,
  duration_ms INT,
  trace_id TEXT,
  timeout_seconds INT NOT NULL DEFAULT 300,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_executions_tenant ON public.script_executions (tenant_id, created_at DESC);
CREATE INDEX idx_executions_script ON public.script_executions (script_id, created_at DESC);
CREATE INDEX idx_executions_status ON public.script_executions (status);
CREATE INDEX idx_executions_initiated_by ON public.script_executions (initiated_by, created_at DESC);
CREATE INDEX idx_executions_pending ON public.script_executions (status, created_at) WHERE status = 'pending';

-- Aprovações
CREATE TABLE IF NOT EXISTS public.execution_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES public.script_executions(id) ON DELETE CASCADE,
  approver_id UUID REFERENCES public.users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_approvals_execution ON public.execution_approvals (execution_id, created_at DESC);

-- RLS
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY scripts_tenant_isolation ON public.scripts
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY scripts_global_admin ON public.scripts
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY script_versions_tenant_isolation ON public.script_versions
  FOR ALL USING (
    script_id IN (SELECT id FROM public.scripts WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  );

CREATE POLICY script_versions_global_admin ON public.script_versions
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY executions_tenant_isolation ON public.script_executions
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY executions_global_admin ON public.script_executions
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY approvals_tenant_isolation ON public.execution_approvals
  FOR ALL USING (
    execution_id IN (SELECT id FROM public.script_executions WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  );

CREATE POLICY approvals_global_admin ON public.execution_approvals
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissões
GRANT SELECT, INSERT, UPDATE ON public.scripts TO app_login;
GRANT SELECT, INSERT, UPDATE ON public.scripts TO app_runtime;
GRANT SELECT, INSERT ON public.script_versions TO app_login;
GRANT SELECT, INSERT ON public.script_versions TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.script_executions TO app_login;
GRANT SELECT, INSERT, UPDATE ON public.script_executions TO app_runtime;
GRANT SELECT, INSERT ON public.execution_approvals TO app_login;
GRANT SELECT, INSERT ON public.execution_approvals TO app_runtime;

-- Trigger para updated_at
CREATE TRIGGER set_updated_at_scripts BEFORE UPDATE ON public.scripts
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Função para criar execução com approval automático se não necessário
CREATE OR REPLACE FUNCTION public.create_script_execution(
  p_script_id UUID,
  p_target_host TEXT,
  p_initiated_by UUID,
  p_tenant_id UUID
)
RETURNS TABLE (
  id UUID,
  status TEXT,
  requires_approval BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_script public.scripts%ROWTYPE;
  v_execution_id UUID;
BEGIN
  SELECT * INTO v_script FROM public.scripts WHERE id = p_script_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Script não encontrado ou inativo';
  END IF;

  -- Verifica hosts permitidos
  IF array_length(v_script.allowed_hosts, 1) > 0 AND NOT (v_script.allowed_hosts @> ARRAY[p_target_host]::TEXT[]) THEN
    RAISE EXCEPTION 'Host não permitido para este script';
  END IF;

  -- Verifica execuções concorrentes
  IF (
    SELECT COUNT(*) FROM public.script_executions
    WHERE script_id = p_script_id AND status IN ('pending','approved','running')
  ) >= v_script.max_concurrent_executions THEN
    RAISE EXCEPTION 'Número máximo de execuções concorrentes atingido';
  END IF;

  v_execution_id := uuid_generate_v4();

  INSERT INTO public.script_executions (
    id, script_id, tenant_id, version, status, target_host,
    initiated_by, timeout_seconds, trace_id
  )
  VALUES (
    v_execution_id, p_script_id, p_tenant_id, v_script.version,
    CASE WHEN v_script.requires_approval THEN 'pending' ELSE 'approved' END,
    p_target_host, p_initiated_by, v_script.timeout_seconds, NULL
  )
  RETURNING id INTO v_execution_id;

  -- Se não requer aprovação, marca como aprovada automaticamente
  IF NOT v_script.requires_approval THEN
    UPDATE public.script_executions
    SET status = 'approved', approved_by = p_initiated_by, approved_at = timezone('utc'::text, now())
    WHERE id = v_execution_id;
  END IF;

  RETURN QUERY
  SELECT v_execution_id AS id,
         CASE WHEN v_script.requires_approval THEN 'pending'::text ELSE 'approved'::text END AS status,
         v_script.requires_approval AS requires_approval;
END;
$$;

-- Função para aprovar execução
CREATE OR REPLACE FUNCTION public.approve_execution(
  p_execution_id UUID,
  p_approver_id UUID,
  p_decision TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_execution public.script_executions%ROWTYPE;
BEGIN
  SELECT * INTO v_execution FROM public.script_executions WHERE id = p_execution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Execução não encontrada';
  END IF;

  IF v_execution.status != 'pending' THEN
    RAISE EXCEPTION 'Execução não está pendente (status: %)', v_execution.status;
  END IF;

  IF v_execution.initiated_by = p_approver_id THEN
    RAISE EXCEPTION 'Não é possível aprovar própria execução';
  END IF;

  -- Registra aprovação
  INSERT INTO public.execution_approvals (execution_id, approver_id, decision, comment)
  VALUES (p_execution_id, p_approver_id, p_decision, p_comment);

  -- Atualiza status
  IF p_decision = 'approved' THEN
    UPDATE public.script_executions
    SET status = 'approved', approved_by = p_approver_id, approved_at = timezone('utc'::text, now())
    WHERE id = p_execution_id;
  ELSE
    UPDATE public.script_executions
    SET status = 'rejected', approved_by = p_approver_id, approved_at = timezone('utc'::text, now())
    WHERE id = p_execution_id;
  END IF;

  RETURN QUERY
  SELECT p_execution_id AS id,
         CASE WHEN p_decision = 'approved' THEN 'approved'::text ELSE 'rejected'::text END AS status;
END;
$$;
