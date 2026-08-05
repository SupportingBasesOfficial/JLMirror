-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: fix_tenant_flag_isolation ===
-- BUG CRITICO: as rotas PUT /settings/modules/:key, /:key/visibility e /:key/client
-- estavam sempre escrevendo na linha GLOBAL (tenant_id IS NULL) de public.feature_flags
-- em vez de criar um override isolado por tenant. Resultado: quando QUALQUER tenant
-- alterava um modulo (ativar/desativar, liberar visibilidade, ativar para cliente),
-- a mudanca vazava para TODOS os outros tenants do sistema, pois todos liam a mesma
-- linha compartilhada (tenant_id IS NULL) na ausencia de um override proprio.
--
-- Esta migration:
-- 1. Faz backfill de uma linha isolada por tenant para cada modulo, copiando o valor
--    ATUAL da linha global — preserva o comportamento em produção para tenants existentes
--    (nenhuma regressão visível no momento da migração).
-- 2. Reseta a linha global (template) para os valores originais de fabrica
--    (client_enabled = false para todos, conforme seed original em
--    20260730210000_module_feature_flags.sql), garantindo que tenants futuros
--    comecem limpos e nao herdem o estado poluído por outros tenants.
--
-- O codigo em apps/api/src/routes/settings.ts foi corrigido para usar copy-on-write
-- (UPSERT isolado por tenant) daqui para frente — ver commit correspondente.

-- 1. Backfill: cria overrides por tenant preservando o estado atual
INSERT INTO public.feature_flags (
  tenant_id, key, name, description, flag_type, is_active, default_value,
  rollout_percentage, variants, target_segments, excluded_tenant_ids,
  client_visible, client_enabled
)
SELECT
  t.id, gf.key, gf.name, gf.description, gf.flag_type, gf.is_active, gf.default_value,
  gf.rollout_percentage, gf.variants, gf.target_segments, gf.excluded_tenant_ids,
  gf.client_visible, gf.client_enabled
FROM public.tenants t
CROSS JOIN (
  SELECT * FROM public.feature_flags WHERE tenant_id IS NULL AND key LIKE 'module_%'
) gf
ON CONFLICT (tenant_id, key) DO NOTHING;

-- 2. Reset do template global para os valores de fabrica (client_enabled = false)
-- client_visible é mantido pois reflete uma decisão de produto válida globalmente
-- (quais módulos PODEM ser liberados), apenas client_enabled (ativação real) é resetado
UPDATE public.feature_flags
SET client_enabled = false, updated_at = timezone('utc'::text, now())
WHERE tenant_id IS NULL AND key LIKE 'module_%' AND client_enabled = true;
