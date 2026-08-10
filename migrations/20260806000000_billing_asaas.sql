-- Migration: Billing Asaas — assinaturas, faturas e pagamentos
-- Integracao com Asaas API para PIX, boleto e cartao

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    asaas_subscription_id TEXT UNIQUE,
    asaas_customer_id TEXT,
    plan VARCHAR(50) NOT NULL DEFAULT 'starter',
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
    amount_cents INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    payment_method VARCHAR(20),
    next_due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    cancelled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.billing_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.billing_subscriptions(id) ON DELETE CASCADE,
    asaas_payment_id TEXT UNIQUE,
    invoice_number TEXT,
    amount_cents INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    payment_method VARCHAR(20),
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    pix_qr_code TEXT,
    pix_copy_paste TEXT,
    boleto_url TEXT,
    boleto_barcode TEXT,
    invoice_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_tenant ON public.billing_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant ON public.billing_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON public.billing_invoices(status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_asaas_id ON public.billing_invoices(asaas_payment_id);

-- RLS
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_sub_tenant ON public.billing_subscriptions
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY billing_sub_global ON public.billing_subscriptions
    FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY billing_inv_tenant ON public.billing_invoices
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY billing_inv_global ON public.billing_invoices
    FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_subscriptions TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_subscriptions TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_invoices TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_invoices TO app_runtime;

CREATE TRIGGER set_updated_at_billing_sub BEFORE UPDATE ON public.billing_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER set_updated_at_billing_inv BEFORE UPDATE ON public.billing_invoices
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Permissoes de billing
INSERT INTO public.permissions (key, description, category) VALUES
    ('billing:read', 'Visualizar faturas e assinaturas', 'billing'),
    ('billing:write', 'Gerenciar faturas e assinaturas', 'billing'),
    ('billing:manage', 'Administracao completa de billing', 'billing')
ON CONFLICT (key) DO NOTHING;
