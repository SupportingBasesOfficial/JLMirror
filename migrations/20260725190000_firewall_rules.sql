-- Migration: Firewall rules management — iptables/nftables com dry-run e diff
-- Suporta regras versionadas, aplicação com dry-run e visualização de diff

CREATE TABLE IF NOT EXISTS public.firewall_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  backend TEXT NOT NULL DEFAULT 'iptables' CHECK (backend IN ('iptables','nftables','ufw')),
  chain TEXT NOT NULL DEFAULT 'INPUT' CHECK (chain IN ('INPUT','OUTPUT','FORWARD','PREROUTING','POSTROUTING')),
  action TEXT NOT NULL CHECK (action IN ('ACCEPT','DROP','REJECT','LOG','DNAT','SNAT','MASQUERADE')),
  protocol TEXT CHECK (protocol IN ('tcp','udp','icmp','all') OR protocol IS NULL),
  source_ip TEXT,
  source_port TEXT,
  destination_ip TEXT,
  destination_port TEXT,
  interface_in TEXT,
  interface_out TEXT,
  state TEXT,
  priority INT NOT NULL DEFAULT 100,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_firewall_tenant_host ON public.firewall_rules (tenant_id, host, priority);
CREATE INDEX idx_firewall_enabled ON public.firewall_rules (is_enabled, tenant_id);

-- Histórico de versões de regras (append-only)
CREATE TABLE IF NOT EXISTS public.firewall_rule_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID NOT NULL REFERENCES public.firewall_rules(id) ON DELETE CASCADE,
  version INT NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES public.users(id),
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(rule_id, version)
);

CREATE INDEX idx_firewall_versions_rule ON public.firewall_rule_versions (rule_id, version DESC);

-- Mudanças aplicadas (audit trail de aplicações no host)
CREATE TABLE IF NOT EXISTS public.firewall_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('apply','dry_run','rollback')),
  status TEXT NOT NULL CHECK (status IN ('success','failed','partial')),
  rules_applied INT DEFAULT 0,
  rules_failed INT DEFAULT 0,
  diff_before JSONB,
  diff_after JSONB,
  stdout TEXT,
  stderr TEXT,
  duration_ms INT,
  applied_by UUID REFERENCES public.users(id),
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_firewall_changes_tenant ON public.firewall_changes (tenant_id, created_at DESC);
CREATE INDEX idx_firewall_changes_host ON public.firewall_changes (host, created_at DESC);

-- RLS
ALTER TABLE public.firewall_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firewall_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firewall_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY firewall_rules_tenant_isolation ON public.firewall_rules
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY firewall_rules_global_admin ON public.firewall_rules
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY firewall_versions_tenant_isolation ON public.firewall_rule_versions
  FOR ALL USING (
    rule_id IN (SELECT id FROM public.firewall_rules WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  );

CREATE POLICY firewall_versions_global_admin ON public.firewall_rule_versions
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY firewall_changes_tenant_isolation ON public.firewall_changes
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY firewall_changes_global_admin ON public.firewall_changes
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firewall_rules TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firewall_rules TO app_runtime;
GRANT SELECT, INSERT ON public.firewall_rule_versions TO app_login;
GRANT SELECT, INSERT ON public.firewall_rule_versions TO app_runtime;
GRANT SELECT, INSERT ON public.firewall_changes TO app_login;
GRANT SELECT, INSERT ON public.firewall_changes TO app_runtime;

-- Trigger para updated_at
CREATE TRIGGER set_updated_at_firewall BEFORE UPDATE ON public.firewall_rules
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Função para gerar comando iptables a partir de uma regra
CREATE OR REPLACE FUNCTION public.generate_iptables_command(
  p_chain TEXT, p_action TEXT, p_protocol TEXT, p_source_ip TEXT,
  p_source_port TEXT, p_destination_ip TEXT, p_destination_port TEXT,
  p_interface_in TEXT, p_interface_out TEXT, p_state TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cmd TEXT := 'iptables -A ';
BEGIN
  cmd := cmd || p_chain;

  IF p_protocol IS NOT NULL AND p_protocol != 'all' THEN
    cmd := cmd || ' -p ' || p_protocol;
  END IF;
  IF p_source_ip IS NOT NULL THEN
    cmd := cmd || ' -s ' || p_source_ip;
  END IF;
  IF p_source_port IS NOT NULL THEN
    cmd := cmd || ' --sport ' || p_source_port;
  END IF;
  IF p_destination_ip IS NOT NULL THEN
    cmd := cmd || ' -d ' || p_destination_ip;
  END IF;
  IF p_destination_port IS NOT NULL THEN
    cmd := cmd || ' --dport ' || p_destination_port;
  END IF;
  IF p_interface_in IS NOT NULL THEN
    cmd := cmd || ' -i ' || p_interface_in;
  END IF;
  IF p_interface_out IS NOT NULL THEN
    cmd := cmd || ' -o ' || p_interface_out;
  END IF;
  IF p_state IS NOT NULL THEN
    cmd := cmd || ' -m state --state ' || p_state;
  END IF;

  cmd := cmd || ' -j ' || p_action;

  RETURN cmd;
END;
$$;

-- Função para gerar comando nftables
CREATE OR REPLACE FUNCTION public.generate_nft_command(
  p_chain TEXT, p_action TEXT, p_protocol TEXT, p_source_ip TEXT,
  p_source_port TEXT, p_destination_ip TEXT, p_destination_port TEXT,
  p_interface_in TEXT, p_interface_out TEXT, p_state TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cmd TEXT := 'nft add rule inet filter ';
  parts TEXT[] := ARRAY[]::TEXT[];
BEGIN
  cmd := cmd || lower(p_chain);

  IF p_protocol IS NOT NULL AND p_protocol != 'all' THEN
    parts := array_append(parts, p_protocol);
  END IF;
  IF p_source_ip IS NOT NULL THEN
    parts := array_append(parts, 'ip saddr ' || p_source_ip);
  END IF;
  IF p_source_port IS NOT NULL THEN
    parts := array_append(parts, 'sport ' || p_source_port);
  END IF;
  IF p_destination_ip IS NOT NULL THEN
    parts := array_append(parts, 'ip daddr ' || p_destination_ip);
  END IF;
  IF p_destination_port IS NOT NULL THEN
    parts := array_append(parts, 'dport ' || p_destination_port);
  END IF;
  IF p_interface_in IS NOT NULL THEN
    parts := array_append(parts, 'iif ' || p_interface_in);
  END IF;
  IF p_interface_out IS NOT NULL THEN
    parts := array_append(parts, 'oif ' || p_interface_out);
  END IF;
  IF p_state IS NOT NULL THEN
    parts := array_append(parts, 'ct state ' || p_state);
  END IF;

  parts := array_append(parts, lower(p_action));

  IF array_length(parts, 1) > 0 THEN
    cmd := cmd || ' ' || array_to_string(parts, ' ');
  END IF;

  RETURN cmd;
END;
$$;
