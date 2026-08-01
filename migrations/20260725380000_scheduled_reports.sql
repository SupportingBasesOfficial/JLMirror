-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Scheduled Reports — templates, relatórios agendados, entregas

CREATE TABLE IF NOT EXISTS public.report_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL CHECK (report_type IN ('executive_summary','device_status','ticket_analysis','compliance_audit','capacity_forecast','backup_summary','security_overview','custom')),
  data_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  filters JSONB DEFAULT '{}'::jsonb,
  columns JSONB DEFAULT '[]'::jsonb,
  group_by TEXT,
  chart_type TEXT CHECK (chart_type IN ('table','bar','line','pie','gauge','mixed')),
  format TEXT NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf','csv','json','html','xlsx')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_report_templates_tenant ON public.report_templates (tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.report_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  schedule_cron TEXT NOT NULL DEFAULT '0 8 * * 1',
  schedule_description TEXT,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_method TEXT NOT NULL DEFAULT 'email' CHECK (delivery_method IN ('email','webhook','download','slack')),
  format TEXT NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf','csv','json','html','xlsx')),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  total_runs INT NOT NULL DEFAULT 0,
  successful_runs INT NOT NULL DEFAULT 0,
  failed_runs INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_scheduled_reports_tenant ON public.scheduled_reports (tenant_id, is_active);
CREATE INDEX idx_scheduled_reports_next_run ON public.scheduled_reports (next_run_at) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.report_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES public.scheduled_reports(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','delivering','completed','failed')),
  file_path TEXT,
  file_size_bytes BIGINT,
  file_format TEXT,
  row_count INT,
  duration_ms INT,
  recipients_sent JSONB DEFAULT '[]'::jsonb,
  delivery_method TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_report_deliveries_report ON public.report_deliveries (report_id, created_at DESC);
CREATE INDEX idx_report_deliveries_tenant ON public.report_deliveries (tenant_id, created_at DESC);

-- RLS
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_templates_tenant_isolation ON public.report_templates
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY report_templates_global_admin ON public.report_templates
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY scheduled_reports_tenant_isolation ON public.scheduled_reports
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY scheduled_reports_global_admin ON public.scheduled_reports
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY report_deliveries_tenant_isolation ON public.report_deliveries
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY report_deliveries_global_admin ON public.report_deliveries
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_templates TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_templates TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_reports TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_reports TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.report_deliveries TO app_login;
GRANT SELECT, INSERT, UPDATE ON public.report_deliveries TO app_runtime;

CREATE TRIGGER set_updated_at_report_templates BEFORE UPDATE ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at_scheduled_reports BEFORE UPDATE ON public.scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Seed templates iniciais
INSERT INTO public.report_templates (tenant_id, name, description, report_type, data_sources, columns, format, chart_type)
SELECT NULL, 'Resumo Executivo', 'Visão geral de KPIs, disponibilidade e alertas', 'executive_summary',
  '["devices","tickets","compliance","backups","ssl"]'::jsonb,
  '["uptime_pct","ticket_resolution_rate","compliance_score","backup_success_rate","total_alerts"]'::jsonb,
  'pdf', 'mixed'
WHERE NOT EXISTS (SELECT 1 FROM public.report_templates WHERE name = 'Resumo Executivo');

INSERT INTO public.report_templates (tenant_id, name, description, report_type, data_sources, columns, format, chart_type)
SELECT NULL, 'Status de Dispositivos', 'Relatório de status online/offline/warning de todos os dispositivos', 'device_status',
  '["devices"]'::jsonb,
  '["name","hostname","ip_address","status","last_seen"]'::jsonb,
  'pdf', 'table'
WHERE NOT EXISTS (SELECT 1 FROM public.report_templates WHERE name = 'Status de Dispositivos');

INSERT INTO public.report_templates (tenant_id, name, description, report_type, data_sources, columns, format, chart_type)
SELECT NULL, 'Análise de Tickets', 'Métricas de tickets: abertos, resolvidos, tempo médio de resolução', 'ticket_analysis',
  '["tickets"]'::jsonb,
  '["title","priority","status","created_at","resolved_at"]'::jsonb,
  'pdf', 'bar'
WHERE NOT EXISTS (SELECT 1 FROM public.report_templates WHERE name = 'Análise de Tickets');

INSERT INTO public.report_templates (tenant_id, name, description, report_type, data_sources, columns, format, chart_type)
SELECT NULL, 'Auditoria de Compliance', 'Status de controles de compliance e score', 'compliance_audit',
  '["compliance"]'::jsonb,
  '["control_name","framework","status","last_checked"]'::jsonb,
  'pdf', 'table'
WHERE NOT EXISTS (SELECT 1 FROM public.report_templates WHERE name = 'Auditoria de Compliance');

INSERT INTO public.report_templates (tenant_id, name, description, report_type, data_sources, columns, format, chart_type)
SELECT NULL, 'Resumo de Backups', 'Histórico de backups: sucesso, falhas, tamanho', 'backup_summary',
  '["backups"]'::jsonb,
  '["backup_name","status","size_bytes","created_at"]'::jsonb,
  'csv', 'table'
WHERE NOT EXISTS (SELECT 1 FROM public.report_templates WHERE name = 'Resumo de Backups');
