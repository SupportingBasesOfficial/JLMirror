-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Change Management — RFC, approvals, impact assessment, rollback

CREATE TABLE IF NOT EXISTS public.change_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rfc_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('standard','normal','emergency')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','approved','rejected','scheduled','in_progress','implemented','failed','rolled_back','cancelled')),
  requested_by UUID NOT NULL REFERENCES public.users(id),
  assigned_to UUID REFERENCES public.users(id),
  -- Planejamento
  planned_start_at TIMESTAMPTZ,
  planned_end_at TIMESTAMPTZ,
  actual_start_at TIMESTAMPTZ,
  actual_end_at TIMESTAMPTZ,
  -- Impacto
  affected_systems JSONB DEFAULT '[]'::jsonb,
  affected_services JSONB DEFAULT '[]'::jsonb,
  impact_assessment TEXT,
  -- Rollback
  rollback_plan TEXT,
  rollback_status TEXT CHECK (rollback_status IN ('not_needed','planned','executed','failed')),
  -- Aprovacao
  approval_required BOOLEAN NOT NULL DEFAULT true,
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  approval_comment TEXT,
  -- Resultado
  implementation_notes TEXT,
  post_implementation_review TEXT,
  -- Metadata
  related_ticket_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, rfc_number)
);

CREATE INDEX idx_change_requests_tenant ON public.change_requests (tenant_id, status);
CREATE INDEX idx_change_requests_status ON public.change_requests (status, priority);
CREATE INDEX idx_change_requests_dates ON public.change_requests (planned_start_at, planned_end_at);
CREATE INDEX idx_change_requests_requested_by ON public.change_requests (requested_by);

CREATE TABLE IF NOT EXISTS public.change_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  change_id UUID NOT NULL REFERENCES public.change_requests(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES public.users(id),
  approver_role TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  comment TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_change_approvals_change ON public.change_approvals (change_id, status);
CREATE INDEX idx_change_approvals_approver ON public.change_approvals (approver_id, status);

CREATE TABLE IF NOT EXISTS public.change_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  change_id UUID NOT NULL REFERENCES public.change_requests(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  task_order INT NOT NULL DEFAULT 0,
  task_type TEXT NOT NULL DEFAULT 'implementation' CHECK (task_type IN ('pre_check','implementation','post_check','rollback')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','skipped','failed')),
  assigned_to UUID REFERENCES public.users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_change_tasks_change ON public.change_tasks (change_id, task_order);

-- RLS
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY change_requests_tenant_isolation ON public.change_requests
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY change_requests_global_admin ON public.change_requests
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY change_approvals_tenant_isolation ON public.change_approvals
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY change_approvals_global_admin ON public.change_approvals
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY change_tasks_tenant_isolation ON public.change_tasks
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY change_tasks_global_admin ON public.change_tasks
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_requests TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_requests TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_approvals TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_approvals TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_tasks TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_tasks TO app_runtime;

CREATE TRIGGER set_updated_at_change_requests BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Sequence para RFC numbers
CREATE SEQUENCE IF NOT EXISTS public.change_rfc_seq START 1;
