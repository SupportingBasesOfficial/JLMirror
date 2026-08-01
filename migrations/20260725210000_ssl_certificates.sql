-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: SSL/TLS certificate management — monitoramento de expiração com alertas

CREATE TABLE IF NOT EXISTS public.ssl_certificates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  port INT NOT NULL DEFAULT 443,
  protocol TEXT NOT NULL DEFAULT 'https' CHECK (protocol IN ('https','imaps','smtps','ldaps','ftps','pop3s')),
  issuer TEXT,
  subject TEXT,
  serial_number TEXT,
  fingerprint_sha256 TEXT,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  signature_algorithm TEXT,
  key_algorithm TEXT,
  key_size INT,
  san_domains JSONB DEFAULT '[]'::jsonb,
  is_auto_renewed BOOLEAN NOT NULL DEFAULT false,
  ca_provider TEXT,
  alert_days_before INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, hostname, port)
);

CREATE INDEX idx_ssl_certs_tenant ON public.ssl_certificates (tenant_id, is_active);
CREATE INDEX idx_ssl_certs_expiry ON public.ssl_certificates (valid_to);
CREATE INDEX idx_ssl_certs_hostname ON public.ssl_certificates (hostname);

-- Histórico de verificações
CREATE TABLE IF NOT EXISTS public.ssl_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cert_id UUID NOT NULL REFERENCES public.ssl_certificates(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  status TEXT NOT NULL CHECK (status IN ('valid','expiring_soon','expired','error','revoked')),
  days_until_expiry INT,
  error_message TEXT,
  fingerprint_sha256 TEXT,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  issuer TEXT,
  subject TEXT
);

CREATE INDEX idx_ssl_checks_cert ON public.ssl_checks (cert_id, checked_at DESC);
CREATE INDEX idx_ssl_checks_tenant ON public.ssl_checks (tenant_id, checked_at DESC);
CREATE INDEX idx_ssl_checks_status ON public.ssl_checks (status);

-- Alertas de certificados
CREATE TABLE IF NOT EXISTS public.ssl_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cert_id UUID NOT NULL REFERENCES public.ssl_certificates(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('expiring_soon','expired','renewed','revoked','changed')),
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  message TEXT NOT NULL,
  days_until_expiry INT,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID REFERENCES public.users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_ssl_alerts_tenant ON public.ssl_alerts (tenant_id, created_at DESC);
CREATE INDEX idx_ssl_alerts_cert ON public.ssl_alerts (cert_id, created_at DESC);
CREATE INDEX idx_ssl_alerts_unacked ON public.ssl_alerts (tenant_id, acknowledged) WHERE acknowledged = false;

-- RLS
ALTER TABLE public.ssl_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssl_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssl_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY ssl_certs_tenant_isolation ON public.ssl_certificates
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ssl_certs_global_admin ON public.ssl_certificates
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY ssl_checks_tenant_isolation ON public.ssl_checks
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ssl_checks_global_admin ON public.ssl_checks
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY ssl_alerts_tenant_isolation ON public.ssl_alerts
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ssl_alerts_global_admin ON public.ssl_alerts
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ssl_certificates TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ssl_certificates TO app_runtime;
GRANT SELECT, INSERT ON public.ssl_checks TO app_login;
GRANT SELECT, INSERT ON public.ssl_checks TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.ssl_alerts TO app_login;
GRANT SELECT, INSERT, UPDATE ON public.ssl_alerts TO app_runtime;

-- Trigger para updated_at
CREATE TRIGGER set_updated_at_ssl_certs BEFORE UPDATE ON public.ssl_certificates
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Funcao para determinar status do certificado
CREATE OR REPLACE FUNCTION public.get_cert_status(p_valid_to TIMESTAMPTZ, p_alert_days INT DEFAULT 30)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_days INT;
BEGIN
  v_days := EXTRACT(EPOCH FROM (p_valid_to - timezone('utc'::text, now())))::INT / 86400;
  IF v_days < 0 THEN
    RETURN 'expired';
  ELSIF v_days <= p_alert_days THEN
    RETURN 'expiring_soon';
  ELSE
    RETURN 'valid';
  END IF;
END;
$$;

-- Funcao para gerar alertas automaticos
CREATE OR REPLACE FUNCTION public.generate_ssl_alert(p_cert_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cert public.ssl_certificates;
  v_days INT;
  v_alert_type TEXT;
  v_severity TEXT;
  v_message TEXT;
  v_alert_id UUID;
  v_existing_count INT;
BEGIN
  SELECT * INTO v_cert FROM public.ssl_certificates WHERE id = p_cert_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_days := EXTRACT(EPOCH FROM (v_cert.valid_to - timezone('utc'::text, now())))::INT / 86400;

  IF v_days < 0 THEN
    v_alert_type := 'expired';
    v_severity := 'critical';
    v_message := 'Certificado para ' || v_cert.hostname || ':' || v_cert.port || ' expirou há ' || ABS(v_days) || ' dia(s)';
  ELSIF v_days <= v_cert.alert_days_before THEN
    v_alert_type := 'expiring_soon';
    v_severity := CASE WHEN v_days <= 7 THEN 'critical' ELSE 'warning' END;
    v_message := 'Certificado para ' || v_cert.hostname || ':' || v_cert.port || ' expira em ' || v_days || ' dia(s)';
  ELSE
    RETURN NULL;
  END IF;

  -- Evita duplicatas: apenas cria se não houver alerta não reconhecido do mesmo tipo
  SELECT COUNT(*) INTO v_existing_count
  FROM public.ssl_alerts
  WHERE cert_id = p_cert_id
    AND alert_type = v_alert_type
    AND acknowledged = false
    AND created_at > timezone('utc'::text, now()) - INTERVAL '24 hours';

  IF v_existing_count = 0 THEN
    INSERT INTO public.ssl_alerts (cert_id, tenant_id, alert_type, severity, message, days_until_expiry)
    VALUES (p_cert_id, v_cert.tenant_id, v_alert_type, v_severity, v_message, v_days)
    RETURNING id INTO v_alert_id;
  END IF;

  RETURN v_alert_id;
END;
$$;

-- View para dashboard: certificados com status calculado
CREATE OR REPLACE VIEW public.ssl_certificates_with_status AS
SELECT
  c.*,
  CASE
    WHEN c.valid_to < timezone('utc'::text, now()) THEN 'expired'
    WHEN c.valid_to <= timezone('utc'::text, now()) + (c.alert_days_before || ' days')::INTERVAL THEN 'expiring_soon'
    ELSE 'valid'
  END AS status,
  (EXTRACT(EPOCH FROM (c.valid_to - timezone('utc'::text, now())))::INT / 86400) AS days_until_expiry
FROM public.ssl_certificates c
WHERE c.is_active = true;
