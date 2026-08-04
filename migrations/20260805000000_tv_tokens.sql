-- Migration: TV mode device tokens
-- Cria tabela para tokens de dispositivos TV (display publico em telas)
-- Permite que TVs acessem dados do tenant sem autenticacao de usuario

CREATE TABLE IF NOT EXISTS public.tv_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    rotation_interval_seconds INTEGER NOT NULL DEFAULT 30,
    panels TEXT[] NOT NULL DEFAULT ARRAY['devices', 'alerts', 'sla'],
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

-- Indice para busca rapida por tenant
CREATE INDEX IF NOT EXISTS idx_tv_tokens_tenant_id ON public.tv_tokens(tenant_id) WHERE is_active = true;

-- RLS: apenas usuarios do tenant podem gerenciar tokens
ALTER TABLE public.tv_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY tv_tokens_tenant_select ON public.tv_tokens
    FOR SELECT USING (
        tenant_id::text IN (
            SELECT tenant_id::text FROM public.tenant_users WHERE user_id = current_setting('app.user_id', true)::text
        )
    );

CREATE POLICY tv_tokens_tenant_insert ON public.tv_tokens
    FOR INSERT WITH CHECK (
        tenant_id::text IN (
            SELECT tenant_id::text FROM public.tenant_users WHERE user_id = current_setting('app.user_id', true)::text
        )
    );

CREATE POLICY tv_tokens_tenant_update ON public.tv_tokens
    FOR UPDATE USING (
        tenant_id::text IN (
            SELECT tenant_id::text FROM public.tenant_users WHERE user_id = current_setting('app.user_id', true)::text
        )
    );

CREATE POLICY tv_tokens_tenant_delete ON public.tv_tokens
    FOR DELETE USING (
        tenant_id::text IN (
            SELECT tenant_id::text FROM public.tenant_users WHERE user_id = current_setting('app.user_id', true)::text
        )
    );

-- Permissao para gerenciar tokens TV
INSERT INTO public.permissions (key, description, category) VALUES
    ('tv:tokens:manage', 'Gerenciar tokens de TV/display', 'tv'),
    ('tv:tokens:read', 'Visualizar tokens de TV/display', 'tv')
ON CONFLICT (key) DO NOTHING;
