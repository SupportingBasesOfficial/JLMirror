-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Contracts + Hour Bank + Work Logs — gestao completa de contratos de suporte

-- ===================================================================
-- 1. CONTRATOS (um tenant pode ter N contratos simultaneos)
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.tenant_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Identificacao
  contract_number TEXT,
  name TEXT NOT NULL,
  contract_type TEXT NOT NULL CHECK (contract_type IN (
    'monthly_support',
    'project_fixed',
    'project_lump_sum',
    'hour_bank',
    'on_demand'
  )),

  -- Franquia de horas
  contracted_hours INT NOT NULL DEFAULT 0,
  period_type TEXT NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('monthly','quarterly','yearly','total')),

  -- Ciclo de faturamento
  billing_day INT NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),

  -- Regras de acumulo de horas
  carry_over_rule TEXT NOT NULL DEFAULT 'none' CHECK (carry_over_rule IN (
    'none',
    'unlimited',
    'limited',
    'expire'
  )),
  carry_over_limit_hours INT,
  carry_over_expire_days INT,

  -- Excedente (overtime)
  overtime_enabled BOOLEAN NOT NULL DEFAULT false,
  overtime_rate NUMERIC(10,2),

  -- Valores diferenciados por tipo de trabalho
  rate_diagnosis NUMERIC(10,2),
  rate_fix NUMERIC(10,2),
  rate_monitoring NUMERIC(10,2),
  rate_meeting NUMERIC(10,2),
  rate_research NUMERIC(10,2),
  rate_default NUMERIC(10,2),

  -- Vigencia
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Configuracoes adicionais
  auto_close_tickets_on_expire BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_tenant_contracts_tenant ON public.tenant_contracts (tenant_id, is_active);
CREATE INDEX idx_tenant_contracts_active ON public.tenant_contracts (is_active, end_date) WHERE is_active = true;

-- RLS
ALTER TABLE public.tenant_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_contracts_tenant_isolation ON public.tenant_contracts
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_contracts_global_admin ON public.tenant_contracts
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_contracts TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_contracts TO app_runtime;

CREATE TRIGGER set_updated_at_tenant_contracts BEFORE UPDATE ON public.tenant_contracts
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ===================================================================
-- 2. FECHAMENTO MENSAL (snapshot do periodo)
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.hour_bank_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.tenant_contracts(id) ON DELETE CASCADE,

  -- Periodo
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Horas
  contracted_hours INT NOT NULL DEFAULT 0,
  carried_over_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  used_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  remaining_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  overtime_hours NUMERIC(6,2) NOT NULL DEFAULT 0,

  -- Expiracao
  expired_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,

  -- Faturamento
  overtime_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  billed BOOLEAN NOT NULL DEFAULT false,
  billed_at TIMESTAMPTZ,
  invoice_id TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','billed','expired')),
  closed_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_hour_bank_periods_contract ON public.hour_bank_periods (contract_id, period_end DESC);
CREATE INDEX idx_hour_bank_periods_tenant ON public.hour_bank_periods (tenant_id, period_end DESC);
CREATE INDEX idx_hour_bank_periods_status ON public.hour_bank_periods (status) WHERE status = 'open';

ALTER TABLE public.hour_bank_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY hour_bank_periods_tenant_isolation ON public.hour_bank_periods
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY hour_bank_periods_global_admin ON public.hour_bank_periods
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE ON public.hour_bank_periods TO app_login;
GRANT SELECT, INSERT, UPDATE ON public.hour_bank_periods TO app_runtime;

-- ===================================================================
-- 3. WORK LOGS (timesheet por ticket)
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.ticket_work_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.tenant_contracts(id) ON DELETE SET NULL,

  -- Quem trabalhou
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,

  -- Tempo
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  minutes_worked INT NOT NULL,
  pause_minutes INT NOT NULL DEFAULT 0,
  pause_reason TEXT,

  -- O que fez
  description TEXT NOT NULL,
  work_type TEXT NOT NULL CHECK (work_type IN (
    'diagnosis', 'fix', 'monitoring', 'meeting',
    'research', 'travel', 'other'
  )),

  -- Faturamento
  billable BOOLEAN NOT NULL DEFAULT true,
  rate_applied NUMERIC(10,2),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- RAT (Relatorio de Atendimento Tecnico)
  rat_number TEXT,
  rat_signed BOOLEAN NOT NULL DEFAULT false,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_ticket_work_logs_ticket ON public.ticket_work_logs (ticket_id, started_at DESC);
CREATE INDEX idx_ticket_work_logs_tenant ON public.ticket_work_logs (tenant_id, created_at DESC);
CREATE INDEX idx_ticket_work_logs_contract ON public.ticket_work_logs (contract_id, started_at DESC) WHERE contract_id IS NOT NULL;
CREATE INDEX idx_ticket_work_logs_user ON public.ticket_work_logs (user_id, started_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_ticket_work_logs_billable ON public.ticket_work_logs (billable, started_at DESC) WHERE billable = true;

ALTER TABLE public.ticket_work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_work_logs_tenant_isolation ON public.ticket_work_logs
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ticket_work_logs_global_admin ON public.ticket_work_logs
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_work_logs TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_work_logs TO app_runtime;

-- ===================================================================
-- 4. RPC: Fechamento mensal de hour bank
-- ===================================================================
CREATE OR REPLACE FUNCTION public.close_hour_bank_period(
  p_contract_id UUID,
  p_period_end DATE
)
RETURNS public.hour_bank_periods
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contract public.tenant_contracts;
  v_period public.hour_bank_periods;
  v_prev_remaining NUMERIC(6,2) := 0;
  v_prev_closed_at TIMESTAMPTZ;
  v_total_used NUMERIC(6,2);
  v_carried NUMERIC(6,2) := 0;
  v_expired NUMERIC(6,2) := 0;
  v_overtime NUMERIC(6,2) := 0;
  v_overtime_amount NUMERIC(12,2) := 0;
  v_period_start DATE;
  v_rate NUMERIC(10,2);
BEGIN
  SELECT * INTO v_contract FROM public.tenant_contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato nao encontrado: %', p_contract_id;
  END IF;

  -- Busca periodo anterior para carry over
  SELECT remaining_hours, closed_at INTO v_prev_remaining, v_prev_closed_at
  FROM public.hour_bank_periods
  WHERE contract_id = p_contract_id
    AND status IN ('closed','billed')
  ORDER BY period_end DESC LIMIT 1;

  -- Calcula periodo
  v_period_start := (DATE_TRUNC('month', p_period_end) - INTERVAL '1 month')::DATE;

  -- Soma horas usadas no periodo (apenas billable)
  SELECT COALESCE(SUM(minutes_worked), 0) / 60.0 INTO v_total_used
  FROM public.ticket_work_logs
  WHERE contract_id = p_contract_id
    AND billable = true
    AND started_at >= v_period_start
    AND started_at < p_period_end;

  -- Aplica regra de carry over
  CASE v_contract.carry_over_rule
    WHEN 'none' THEN
      v_carried := 0;
    WHEN 'unlimited' THEN
      v_carried := GREATEST(v_prev_remaining, 0);
    WHEN 'limited' THEN
      v_carried := LEAST(GREATEST(v_prev_remaining, 0), COALESCE(v_contract.carry_over_limit_hours, 0));
    WHEN 'expire' THEN
      IF v_prev_remaining > 0 AND v_prev_closed_at IS NOT NULL THEN
        IF now() > (v_prev_closed_at + (COALESCE(v_contract.carry_over_expire_days, 0) || ' days')::INTERVAL) THEN
          v_carried := 0;
          v_expired := v_prev_remaining;
        ELSE
          v_carried := v_prev_remaining;
        END IF;
      END IF;
  END CASE;

  -- Calcula overtime
  v_overtime := GREATEST(v_total_used - (v_contract.contracted_hours + v_carried), 0);

  IF v_contract.overtime_enabled AND v_overtime > 0 THEN
    v_rate := COALESCE(v_contract.rate_default, v_contract.overtime_rate, 0);
    v_overtime_amount := v_overtime * v_rate;
  END IF;

  -- Cria registro de fechamento
  INSERT INTO public.hour_bank_periods (
    tenant_id, contract_id, period_start, period_end,
    contracted_hours, carried_over_hours, used_hours,
    remaining_hours, overtime_hours, expired_hours,
    overtime_amount, status, closed_at
  ) VALUES (
    v_contract.tenant_id, p_contract_id, v_period_start, p_period_end,
    v_contract.contracted_hours, v_carried, v_total_used,
    GREATEST(v_contract.contracted_hours + v_carried - v_total_used, 0),
    v_overtime, v_expired, v_overtime_amount,
    'closed', now()
  ) RETURNING * INTO v_period;

  RETURN v_period;
END;
$$;

-- ===================================================================
-- 5. RPC: Resumo do hour bank (periodo atual)
-- ===================================================================
CREATE OR REPLACE FUNCTION public.get_hour_bank_summary(
  p_contract_id UUID
)
RETURNS TABLE (
  contract_id UUID,
  contract_name TEXT,
  contracted_hours INT,
  used_hours NUMERIC,
  remaining_hours NUMERIC,
  carried_over_hours NUMERIC,
  overtime_hours NUMERIC,
  period_start DATE,
  period_end DATE,
  period_status TEXT,
  next_billing_date DATE,
  used_by_type JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contract public.tenant_contracts;
  v_period_start DATE;
  v_period_end DATE;
  v_used NUMERIC(6,2);
  v_carried NUMERIC(6,2) := 0;
  v_billing_date DATE;
BEGIN
  SELECT * INTO v_contract FROM public.tenant_contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Periodo atual
  v_period_start := DATE_TRUNC('month', now())::DATE;
  v_period_end := (DATE_TRUNC('month', now()) + INTERVAL '1 month')::DATE;

  -- Carry over do periodo anterior
  SELECT remaining_hours INTO v_carried
  FROM public.hour_bank_periods
  WHERE contract_id = p_contract_id
    AND status IN ('closed','billed')
  ORDER BY period_end DESC LIMIT 1;

  -- Horas usadas no periodo atual
  SELECT COALESCE(SUM(minutes_worked), 0) / 60.0 INTO v_used
  FROM public.ticket_work_logs
  WHERE contract_id = p_contract_id
    AND billable = true
    AND started_at >= v_period_start;

  -- Proximo billing date
  v_billing_date := MAKE_DATE(
    EXTRACT(YEAR FROM now())::INT,
    EXTRACT(MONTH FROM now())::INT,
    LEAST(v_contract.billing_day, 28)
  );

  RETURN QUERY
  SELECT
    v_contract.id,
    v_contract.name,
    v_contract.contracted_hours,
    v_used,
    GREATEST(v_contract.contracted_hours + v_carried - v_used, 0),
    v_carried,
    GREATEST(v_used - (v_contract.contracted_hours + v_carried), 0),
    v_period_start,
    v_period_end,
    'open',
    v_billing_date,
    COALESCE((
      SELECT jsonb_object_agg(work_type, total_minutes)
      FROM (
        SELECT work_type, SUM(minutes_worked) as total_minutes
        FROM public.ticket_work_logs
        WHERE contract_id = p_contract_id
          AND billable = true
          AND started_at >= v_period_start
        GROUP BY work_type
      ) t
    ), '{}'::jsonb);
END;
$$;
