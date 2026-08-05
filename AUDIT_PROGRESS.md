# AUDIT PROGRESS — JLMIRROR — Auditoria Sistêmica Completa

> Arquivo de controle. Atualizado incrementalmente. Se o trabalho for interrompido, retomar a partir da seção "PENDENTE".

## OBJETIVO

Auditoria profunda e correção sistemática (sem workarounds) de:

- Backend (apps/api): rotas, permissões RBAC, módulos (feature flags), duplicações
- Frontend (apps/web): chamadas de API vs rotas reais, sidebar admin/cliente, código duplicado
- Banco (migrations): RLS policies, colunas ausentes, inconsistências

## METODOLOGIA

1. Extrair TODAS as chaves de permissão usadas em `requirePermission()` no backend
2. Extrair TODAS as chaves de módulo usadas em `requireModule()` no backend
3. Comparar com o que está seedado no banco (`public.permissions`, `public.feature_flags`)
4. Extrair TODAS as chamadas de API no frontend (`useApi`, `apiFetch`) e comparar com rotas reais do backend (`apps/api/src/index.ts` + arquivos de rotas)
5. Auditar RLS: tabelas sem RLS habilitado, tabelas com RLS mas sem policies
6. Buscar funções/rotas duplicadas
7. Corrigir tudo na raiz, sem downstream workarounds
8. Lint + check-types + testes + commit/push incremental

## STATUS GERAL: EM ANDAMENTO

---

## JÁ CORRIGIDO (sessões anteriores, commits já no main)

- `apps/web/app/(admin)/assets/page.tsx`: URL `/api/assets/stats` → `/api/assets/stats/overview` (commit 6a5546e)
- `migrations/20260804210000_add_missing_permissions.sql`: +60 permissões faltantes no RBAC seed (assets, devices, tickets, compliance, etc) atribuídas a tenant:admin/operator/viewer (commit 6a5546e)
- `apps/api/src/middleware/require-module.ts`: `isModuleEnabled` agora considera `client_enabled=true` (não só `default_value`) — corrige 403 quando cliente ativa módulo (commit 2b1567b)

## CORRIGIDO NESTA SESSÃO

### BUG CRÍTICO: Vazamento cross-tenant em feature_flags de módulos

- **Causa raiz**: `apps/api/src/routes/settings.ts` — as 3 rotas PUT de módulos
  (`/modules/:key`, `/modules/:key/visibility`, `/modules/:key/client`) sempre
  faziam UPDATE na linha GLOBAL (`tenant_id IS NULL`) de `public.feature_flags`
  em vez de criar um override isolado por tenant. Qualquer tenant que alterasse
  um módulo afetava TODOS os outros tenants do sistema (confirmado: 2 tenants
  reais no banco — "Tenant Demo" e "AçoPeças" — compartilhavam o mesmo estado).
- **Fix**: implementado padrão copy-on-write (INSERT ... ON CONFLICT DO NOTHING
  clonando o template global, depois UPDATE escopado a `tenant_id = $tenantId`)
  nas 3 rotas. `GET /modules` corrigido com `DISTINCT ON (key) ... ORDER BY key,
tenant_id NULLS LAST` para não duplicar linhas quando o override existir.
- **Migration de dados**: `migrations/20260804220000_fix_tenant_flag_isolation.sql`
  — backfill de override por tenant preservando estado atual (sem regressão) +
  reset do template global (`client_enabled=false`) para tenants futuros começarem limpos.
- **Status**: aplicado no banco, tsc/eslint OK. Pendente commit.

## PENDENTE (ordem de execução)

- [ ] 1. Auditoria de permissões: comparar TODAS as chaves `requirePermission()` no código vs seed no banco (parcialmente feito — 99 permissions seedadas, tenant:admin/operator/viewer parecem bem cobertos; falta verificar rotas menos comuns)
- [ ] 2. Auditoria de módulos: comparar TODAS as chaves `requireModule()` no código vs feature_flags seedados (53 module_* flags existem — falta cruzar com todos os requireModule() no index.ts)
- [ ] 3. Auditoria de rotas frontend vs backend (mismatches de URL como o caso assets/stats) — PRIORIDADE ALTA, provável fonte de mais bugs
- [ ] 4. Auditoria RLS: tabelas sem RLS (achado: capacity_metrics_2026XX, system_logs_2026XX, trace_spans_2026XX — partições sem RLS, verificar se herdam da tabela mãe) / tabelas com RLS mas SEM policies (query rodou mas output foi cortado — REFAZER)
- [ ] 5. Duplicação de funções/rotas
- [ ] 6. Sidebar admin (admin-sidebar.tsx) vs client-sidebar.tsx — links mortos, módulos sem rota
- [ ] 7. Aplicar correções + migration se necessário
- [ ] 8. pnpm lint && pnpm check-types && pnpm test:run
- [ ] 9. git add -A && commit && push (incremental, a cada categoria fechada)

## ACHADOS (issues encontrados, preencher com file:line)

## DECISÕES TÉCNICAS

- Correções devem ser na causa raiz (schema/permissões/middleware), nunca workaround pontual em uma rota isolada.
- Toda mudança de schema → nova migration em `./migrations/`.
