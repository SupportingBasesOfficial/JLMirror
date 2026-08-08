-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Tenant Hierarchy — parent_tenant_id + tenant_type
-- Permite distinguir o tenant proprietario (owner), gestores (manager/MSP)
-- e tenants clientes (client) gerenciados por cada um deles.

-- 1. Adiciona colunas na tabela tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS parent_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tenant_type VARCHAR(20) NOT NULL DEFAULT 'client'
    CHECK (tenant_type IN ('owner', 'manager', 'client'));

-- 2. Cria indice para consultas de hierarquia
CREATE INDEX IF NOT EXISTS idx_tenants_parent ON public.tenants(parent_tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_type ON public.tenants(tenant_type);

-- 3. Marca o primeiro tenant (Tenant Demo) como owner
-- JL Informatica é o tenant proprietario do sistema
UPDATE public.tenants
SET tenant_type = 'owner', parent_tenant_id = NULL
WHERE id = '7953c8d4-66ba-4833-a47b-6a46790cd5e9';

-- 4. Marca todos os outros tenants existentes como client do owner
-- Tenants criados anteriormente sem parent ficam associados ao owner
UPDATE public.tenants
SET tenant_type = 'client', parent_tenant_id = '7953c8d4-66ba-4833-a47b-6a46790cd5e9'
WHERE id != '7953c8d4-66ba-4833-a47b-6a46790cd5e9'
  AND parent_tenant_id IS NULL;

-- 5. RLS: tenant_type e parent_tenant_id ja sao cobertos pela policy existente
-- b2b_global_admin_tenants que da acesso total ao global_admin_role
