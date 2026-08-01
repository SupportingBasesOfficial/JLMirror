-- @ai-context: .zero-error/architecture-map.md#logic-core
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Scheduled Tasks & Cron Jobs — tarefas agendadas, execuções, logs

CREATE TABLE IF NOT EXISTS public.scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL CHECK (task_type IN ('http_request','database_query','script','shell_command','cleanup','report','custom')),
  cron_expression TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  max_execution_seconds INT NOT NULL DEFAULT 300,
  retry_on_failure BOOLEAN NOT NULL DEFAULT true,
  max_retries INT NOT NULL DEFAULT 3,
  retry_delay_seconds INT NOT NULL DEFAULT 60,
  notify_on_failure BOOLEAN NOT NULL DEFAULT true,
  notify_emails JSONB DEFAULT '[]'::jsonb,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success','failed','running','timeout','skipped')),
  last_run_duration_ms INT,
  next_run_at TIMESTAMPTZ,
  total_runs INT NOT NULL DEFAULT 0,
  successful_runs INT NOT NULL DEFAULT 0,
  failed_runs INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_scheduled_tasks_tenant ON public.scheduled_tasks (tenant_id, is_active);
CREATE INDEX idx_scheduled_tasks_next_run ON public.scheduled_tasks (next_run_at) WHERE is_active = true AND next_run_at IS NOT NULL;
CREATE INDEX idx_scheduled_tasks_type ON public.scheduled_tasks (task_type);

-- Log de execuções
CREATE TABLE IF NOT EXISTS public.scheduled_task_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.scheduled_tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed','timeout','skipped')),
  attempt_number INT NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  output TEXT,
  error_message TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'cron' CHECK (triggered_by IN ('cron','manual','retry')),
  response_status_code INT,
  triggered_by_user UUID REFERENCES public.users(id)
);

CREATE INDEX idx_scheduled_task_runs_task ON public.scheduled_task_runs (task_id, started_at DESC);
CREATE INDEX idx_scheduled_task_runs_status ON public.scheduled_task_runs (status) WHERE status IN ('running','failed','timeout');
CREATE INDEX idx_scheduled_task_runs_tenant ON public.scheduled_task_runs (tenant_id, started_at DESC);

-- RLS
ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_task_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheduled_tasks_tenant_isolation ON public.scheduled_tasks
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY scheduled_tasks_global_admin ON public.scheduled_tasks
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY scheduled_task_runs_tenant_isolation ON public.scheduled_task_runs
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY scheduled_task_runs_global_admin ON public.scheduled_task_runs
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_tasks TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_tasks TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.scheduled_task_runs TO app_login;
GRANT SELECT, INSERT, UPDATE ON public.scheduled_task_runs TO app_runtime;

-- Triggers
CREATE TRIGGER set_updated_at_scheduled_tasks BEFORE UPDATE ON public.scheduled_tasks
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Funcao para calcular proxima execucao baseada em cron expression (simplificada)
-- Suporta formatos: "*/N * * * *", "0 * * * *", "0 0 * * *", "*/5 */2 * * *"
CREATE OR REPLACE FUNCTION public.calculate_next_run(p_cron TEXT, p_timezone TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parts TEXT[];
  v_minute TEXT;
  v_hour TEXT;
  v_dom TEXT;
  v_month TEXT;
  v_dow TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_next TIMESTAMPTZ;
  v_interval INT;
BEGIN
  v_parts := string_to_array(trim(p_cron), ' ');
  IF array_length(v_parts, 1) < 5 THEN
    RETURN v_now + INTERVAL '1 hour';
  END IF;

  v_minute := v_parts[1];
  v_hour := v_parts[2];
  v_dom := v_parts[3];
  v_month := v_parts[4];
  v_dow := v_parts[5];

  -- Logica simplificada: se for "*/N * * * *", calcula proximo intervalo de N minutos
  IF v_minute ~ '^\*/\d+$' THEN
    v_interval := substring(v_minute from 3)::INT;
    v_next := date_trunc('minute', v_now) + (v_interval || ' minutes')::INTERVAL;
    WHILE v_next <= v_now LOOP
      v_next := v_next + (v_interval || ' minutes')::INTERVAL;
    END LOOP;
    RETURN v_next;
  END IF;

  -- "0 * * * *" = topo de cada hora
  IF v_minute = '0' AND v_hour = '*' AND v_dom = '*' AND v_month = '*' AND v_dow = '*' THEN
    RETURN date_trunc('hour', v_now) + INTERVAL '1 hour';
  END IF;

  -- "0 0 * * *" = meia-noite de cada dia
  IF v_minute = '0' AND v_hour = '0' AND v_dom = '*' AND v_month = '*' AND v_dow = '*' THEN
    RETURN date_trunc('day', v_now) + INTERVAL '1 day';
  END IF;

  -- "0 0 * * 0" = todo domingo meia-noite
  IF v_minute = '0' AND v_hour = '0' AND v_dom = '*' AND v_month = '*' AND v_dow = '0' THEN
    v_next := date_trunc('day', v_now) + INTERVAL '1 day';
    WHILE extract(dow FROM v_next) != 0 LOOP
      v_next := v_next + INTERVAL '1 day';
    END LOOP;
    RETURN v_next;
  END IF;

  -- "0 0 1 * *" = dia 1 de cada mes
  IF v_minute = '0' AND v_hour = '0' AND v_dom = '1' AND v_month = '*' AND v_dow = '*' THEN
    v_next := date_trunc('month', v_now) + INTERVAL '1 month';
    RETURN v_next;
  END IF;

  -- Fallback: 1 hora
  RETURN v_now + INTERVAL '1 hour';
END;
$$;
