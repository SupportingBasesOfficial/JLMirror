-- === Migration: Workflow Builder por Servidor ===
-- Workflows são sequências de steps (scripts, comandos, verificações) vinculados a um servidor específico.
-- Nada executa automaticamente — um responsável dispara manualmente.
-- Cada execução é logada com output, exit code e duração por step.

CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Dispositivo alvo (do Zabbix ou asset inventory)
  device_id UUID,
  device_hostname VARCHAR(255) NOT NULL,
  -- Metadados do workflow
  name VARCHAR(200) NOT NULL,
  description TEXT,
  -- Categoria para organização
  category VARCHAR(50) NOT NULL DEFAULT 'general' CHECK (category IN (
    'general', 'remediation', 'diagnostic', 'maintenance', 'deployment', 'security', 'backup', 'custom'
  )),
  -- Tags para busca e filtro
  tags TEXT[] NOT NULL DEFAULT '{}',
  -- Se é um template (pode ser clonado para outros servidores)
  is_template BOOLEAN NOT NULL DEFAULT false,
  -- Versão do workflow (incrementa a cada modificação)
  version INT NOT NULL DEFAULT 1,
  -- Status do workflow
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Criado por
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_workflows_tenant ON public.workflows(tenant_id);
CREATE INDEX idx_workflows_device ON public.workflows(device_id);
CREATE INDEX idx_workflows_hostname ON public.workflows(device_hostname);
CREATE INDEX idx_workflows_template ON public.workflows(is_template) WHERE is_template = true;
CREATE INDEX idx_workflows_active ON public.workflows(is_active) WHERE is_active = true;
CREATE INDEX idx_workflows_category ON public.workflows(category);

CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Ordem de execução dentro do workflow
  step_order INT NOT NULL DEFAULT 0,
  -- Nome do step
  name VARCHAR(200) NOT NULL,
  -- Descrição do que o step faz
  description TEXT,
  -- Tipo do step
  step_type VARCHAR(50) NOT NULL CHECK (step_type IN (
    'script', 'command', 'ssh_command', 'http_request', 'condition', 'approval', 'delay', 'notification'
  )),
  -- Conteúdo do step:
  --   script: código do script (PowerShell, Bash, Python)
  --   command: comando shell
  --   ssh_command: comando SSH
  --   http_request: JSON com url, method, headers, body
  --   condition: expressão de condição (ex: "$prev_exit_code == 0")
  --   approval: texto com instruções para aprovação manual
  --   delay: segundos de espera
  --   notification: JSON com channel, subject, body
  content TEXT NOT NULL,
  -- Linguagem do script (quando step_type = 'script')
  language VARCHAR(20) DEFAULT 'bash' CHECK (language IN ('bash', 'powershell', 'python', 'javascript')),
  -- Condição para executar o step (expressão avaliada antes)
  -- Se vazia, executa sempre. Se preenchida, só executa se a condição for verdadeira.
  condition_expression TEXT,
  -- Se o step falha, o workflow para ou continua
  on_failure VARCHAR(20) NOT NULL DEFAULT 'stop' CHECK (on_failure IN ('stop', 'continue', 'retry')),
  -- Número de tentativas em caso de retry
  retry_count INT NOT NULL DEFAULT 0,
  -- Delay entre retries em segundos
  retry_delay_seconds INT NOT NULL DEFAULT 5,
  -- Timeout em segundos (0 = sem timeout)
  timeout_seconds INT NOT NULL DEFAULT 300,
  -- Variáveis de saída (nomes das variáveis que este step produz)
  output_variables TEXT[] NOT NULL DEFAULT '{}',
  -- Se requer aprovação humana antes de executar
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  -- Criado em
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(workflow_id, step_order)
);

CREATE INDEX idx_workflow_steps_workflow ON public.workflow_steps(workflow_id, step_order);

CREATE TABLE IF NOT EXISTS public.workflow_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Quem disparou a execução
  triggered_by UUID REFERENCES public.users(id),
  triggered_by_name VARCHAR(255),
  -- Status da execução
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled', 'timeout', 'awaiting_approval'
  )),
  -- Step atual em execução
  current_step INT NOT NULL DEFAULT 0,
  -- Total de steps
  total_steps INT NOT NULL DEFAULT 0,
  -- Variáveis de contexto (input + output de steps anteriores)
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  -- Motivo do disparo (descrição livre)
  trigger_reason TEXT,
  -- Erro geral (se houver)
  error_message TEXT,
  -- IP de quem disparou
  triggered_from_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_workflow_executions_workflow ON public.workflow_executions(workflow_id, created_at DESC);
CREATE INDEX idx_workflow_executions_tenant ON public.workflow_executions(tenant_id, created_at DESC);
CREATE INDEX idx_workflow_executions_status ON public.workflow_executions(status) WHERE status IN ('pending', 'running', 'awaiting_approval');

CREATE TABLE IF NOT EXISTS public.workflow_step_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES public.workflow_executions(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  step_name VARCHAR(200) NOT NULL,
  step_type VARCHAR(50) NOT NULL,
  -- Status do step
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'skipped', 'timeout', 'awaiting_approval', 'approved', 'rejected'
  )),
  -- Output do step (stdout, response, etc.)
  output TEXT,
  -- Exit code
  exit_code INT,
  -- Erro (se houver)
  error_message TEXT,
  -- Tentativas
  attempt INT NOT NULL DEFAULT 0,
  -- Variáveis produzidas
  output_variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  -- Quem aprovou (se requires_approval)
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_workflow_step_executions_execution ON public.workflow_step_executions(execution_id, step_order);
CREATE INDEX idx_workflow_step_executions_status ON public.workflow_step_executions(status) WHERE status IN ('pending', 'running', 'awaiting_approval');

-- RLS
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_step_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflows_tenant_isolation ON public.workflows
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY workflows_global_admin ON public.workflows
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY workflow_steps_tenant_isolation ON public.workflow_steps
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY workflow_steps_global_admin ON public.workflow_steps
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY workflow_executions_tenant_isolation ON public.workflow_executions
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY workflow_executions_global_admin ON public.workflow_executions
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY workflow_step_executions_tenant_isolation ON public.workflow_step_executions
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY workflow_step_executions_global_admin ON public.workflow_step_executions
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_steps TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_steps TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_executions TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_executions TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_executions TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_executions TO app_runtime;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_workflow_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_workflow_updated_at();
