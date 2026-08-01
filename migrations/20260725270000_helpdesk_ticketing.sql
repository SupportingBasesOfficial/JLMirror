-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Helpdesk & Ticketing — categorias, tickets, comentários, anexos, SLA

CREATE TABLE IF NOT EXISTS public.ticket_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#1BA898',
  sla_response_hours INT NOT NULL DEFAULT 4,
  sla_resolution_hours INT NOT NULL DEFAULT 48,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_ticket_categories_tenant ON public.ticket_categories (tenant_id, is_active);

-- Tickets
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  category_id UUID REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_customer','resolved','closed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web','email','phone','api','chat','manual')),
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  requester_phone TEXT,
  assigned_to UUID REFERENCES public.users(id),
  assigned_name TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  sla_response_due TIMESTAMPTZ,
  sla_resolution_due TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  response_time_mins INT,
  resolution_time_mins INT,
  is_overdue BOOLEAN NOT NULL DEFAULT false,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  rating_comment TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, ticket_number)
);

CREATE INDEX idx_tickets_tenant ON public.tickets (tenant_id, created_at DESC);
CREATE INDEX idx_tickets_status ON public.tickets (status, priority);
CREATE INDEX idx_tickets_assigned ON public.tickets (assigned_to, status);
CREATE INDEX idx_tickets_category ON public.tickets (category_id);
CREATE INDEX idx_tickets_overdue ON public.tickets (is_overdue) WHERE is_overdue = true;
CREATE INDEX idx_tickets_sla ON public.tickets (sla_resolution_due) WHERE status NOT IN ('resolved','closed','cancelled');

-- Comentários
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.users(id),
  author_name TEXT NOT NULL,
  author_type TEXT NOT NULL DEFAULT 'agent' CHECK (author_type IN ('agent','requester','system')),
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_ticket_comments_ticket ON public.ticket_comments (ticket_id, created_at DESC);
CREATE INDEX idx_ticket_comments_tenant ON public.ticket_comments (tenant_id);

-- RLS
ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_categories_tenant_isolation ON public.ticket_categories
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ticket_categories_global_admin ON public.ticket_categories
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY tickets_tenant_isolation ON public.tickets
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tickets_global_admin ON public.tickets
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY ticket_comments_tenant_isolation ON public.ticket_comments
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ticket_comments_global_admin ON public.ticket_comments
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_categories TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_categories TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO app_runtime;
GRANT SELECT, INSERT, DELETE ON public.ticket_comments TO app_login;
GRANT SELECT, INSERT, DELETE ON public.ticket_comments TO app_runtime;

-- Triggers
CREATE TRIGGER set_updated_at_ticket_categories BEFORE UPDATE ON public.ticket_categories
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER set_updated_at_tickets BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Funcao para gerar numero do ticket
CREATE OR REPLACE FUNCTION public.generate_ticket_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
  v_number TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.tickets
  WHERE tenant_id = p_tenant_id
    AND created_at >= date_trunc('year', timezone('utc'::text, now()));

  v_number := 'TKT-' || EXTRACT(YEAR FROM timezone('utc'::text, now()))::TEXT || '-' || LPAD(v_count::TEXT, 5, '0');
  RETURN v_number;
END;
$$;

-- Funcao para calcular SLA baseado na categoria
CREATE OR REPLACE FUNCTION public.calculate_ticket_sla(
  p_category_id UUID,
  p_priority TEXT
)
RETURNS TABLE (
  sla_response_due TIMESTAMPTZ,
  sla_resolution_due TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response_hours INT := 4;
  v_resolution_hours INT := 48;
  v_priority_multiplier DOUBLE PRECISION := 1.0;
BEGIN
  -- Busca SLA da categoria
  SELECT sla_response_hours, sla_resolution_hours INTO v_response_hours, v_resolution_hours
  FROM public.ticket_categories WHERE id = p_category_id;

  -- Ajusta por prioridade
  IF p_priority = 'urgent' THEN v_priority_multiplier := 0.25;
  ELSIF p_priority = 'high' THEN v_priority_multiplier := 0.5;
  ELSIF p_priority = 'medium' THEN v_priority_multiplier := 1.0;
  ELSIF p_priority = 'low' THEN v_priority_multiplier := 2.0;
  END IF;

  RETURN QUERY SELECT
    timezone('utc'::text, now()) + (v_response_hours * v_priority_multiplier || ' hours')::INTERVAL,
    timezone('utc'::text, now()) + (v_resolution_hours * v_priority_multiplier || ' hours')::INTERVAL;
END;
$$;
