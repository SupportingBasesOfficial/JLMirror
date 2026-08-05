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

## STATUS GERAL: COMPLETA

---

## JÁ CORRIGIDO (sessões anteriores, commits já no main)

- `apps/web/app/(admin)/assets/page.tsx`: URL `/api/assets/stats` → `/api/assets/stats/overview` (commit 6a5546e) — **REVERTIDO**: padronizado para `/api/assets/stats` (commit 55ea5a1)
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
- **Status**: aplicado no banco, tsc/eslint OK, commitado e pushed (commit 2b1567b).

### MISMATCH DE ENDPOINTS: /stats vs /stats/overview

- **Problema**: 10 rotas backend usavam `/stats/overview` enquanto o frontend chamava `/stats`. 8 mismatches diretos (frontend chamava `/stats`, backend só tinha `/stats/overview`) + 2 casos onde ambos usavam `/stats/overview` (admin, assets).
- **Rotas backend corrigidas** (10): `api-keys`, `webhooks`, `tasks`, `tickets`, `changes`, `data-transfer`, `feature-flags`, `reports`, `admin`, `assets` — todas de `/stats/overview` para `/stats`.
- **Rotas frontend corrigidas** (2): `admin/page.tsx` e `assets/page.tsx` — de `/api/.../stats/overview` para `/api/.../stats`.
- **Convenção**: agora TODOS os endpoints de stats são `/stats` (consistente em todos os 28 módulos).
- **Status**: tsc + eslint + 215 testes passam. Commitado e pushed (commit 55ea5a1).

### MISMATCH DE ENDPOINTS: não-stats (firewall, backups, feature-flags)

- **Problema**: 3 mismatches adicionais encontrados na auditoria sistemática de todas as chamadas `fetch` e `useApi` do frontend vs todas as rotas do backend.
- **Firewall** (`firewall/page.tsx`): frontend chamava `GET /api/firewall`, `POST /api/firewall`, `DELETE /api/firewall/:id` — backend só tem `/api/v1/firewall/rules`, `/api/v1/firewall/rules/:id`. Corrigido para `/api/firewall/rules` e `/api/firewall/rules/:id`.
- **Backups** (`backups/page.tsx:226`): frontend chamava `POST /api/backups/restores` (plural) — backend só tem `POST /api/v1/backups/restore` (singular). Corrigido.
- **Feature-flags** (`feature-flags/page.tsx:188`): frontend chamava `POST /api/feature-flags/${id}/overrides` — backend só tem `POST /api/v1/feature-flags/overrides` (flag_id já vem no body). Corrigido.
- **Módulos verificados sem mismatch**: predictions, itsm, kb, changes, sla, push, ssl, scripts, tickets, backup (demais rotas), dashboard, zabbix, data-transfer, notifications, reports, tasks, executions, mfa, auth, audit, logs, traces, apm, marketplace, finops, anomaly, drift, discovery, k8s, compliance, correlation, workflows, assets, admin, settings, profile, rbac, users, webhooks, api-keys, system-health, capacity, escalation, patches, security-audit, chatops, status-page, client-portal, lgpd, billing, branding, tv, docs, health, metrics.
- **Status**: tsc + 215 testes passam. Commitado e pushed (commit 76344cd).

## PENDENTE (ordem de execução)

- [x] 1. Auditoria de permissões — COMPLETA:
  - 86 chaves `requirePermission()` extraídas do código (routes + index.ts)
  - 122 permissões seedadas nas migrations (4 arquivos de seed)
  - 0 permissões faltantes no banco (todas as 86 do código estão seedadas)
  - 36 permissões no banco não referenciadas no código (aliases, features futuras, permissões granulares de Zabbix — não causam problemas)
- [x] 2. Auditoria de módulos — COMPLETA:
  - 44 chaves `requireModule()` extraídas do código (apps/api/src)
  - 53 feature_flags seedados nas migrations
  - 0 módulos faltantes no banco (todas as 44 do código estão seedados)
  - 9 feature_flags no banco não referenciados por requireModule() (módulos base como auth, dashboard, monitoring, profile, settings, zabbix — controlados via sidebar/permissões, não requireModule)
- [x] 3. Auditoria de rotas frontend vs backend (mismatches de URL) — Stats endpoints corrigidos (commit 55ea5a1). Mismatches não-stats corrigidos: firewall, backups/restore, feature-flags/overrides (commit 76344cd). Auditoria completa — todos os 58 useApi calls e todos os fetch calls verificados contra as 931 rotas backend.
- [x] 4. Auditoria RLS — COMPLETA (commit 63970d0):
  - 126 tabelas non-partition auditadas: 124 com RLS + policies, 2 sem RLS (pgmigrations, schema_migrations — tabelas de controle, OK)
  - 0 tabelas com RLS sem policies
  - 0 tabelas com tenant_id sem RLS
  - 15 tabelas com tenant_id mas policies fracas (USING: true → vazamento cross-tenant) — CORRIGIDAS com migration `20260805120000_fix_rls_weak_policies_and_partitions.sql`:
    - 12 tabelas tenant-scoped: alert_escalation_instances, alert_escalation_policies, audit_log, client_companies, client_contacts, lgpd_requests, patch_deployment_jobs, patch_scans, patches, security_audit_findings, security_audit_rules, security_audit_scans — substituídas policies `USING: true` por `global_admin + tenant_isolation`
    - 3 tabelas global admin: sso_providers, tenant_routes, tenant_users — restritas a `global_admin_role`/`app_runtime` (sem tenant_isolation pois são B2B)
  - 12 partições sem RLS — CORRIGIDAS: capacity_metrics_202607-10, system_logs_202607-10, trace_spans_202607-10 — RLS habilitado + policy tenant_isolation
  - Pós-migration: 0 partições sem RLS, 0 tabelas com policies fracas (exceto 3 globais intencionais)
- [x] 5. Duplicação de funções/rotas — COMPLETA (commit 981d096):
  - 278 rotas backend verificadas: 0 rotas duplicadas (mesmo method+path no mesmo arquivo)
  - 143 funções exportadas verificadas: 0 duplicadas across files
  - 225 consts exportados verificados: 0 duplicados across files
  - 1 duplicação local encontrada e corrigida: `safeCount` em `health-score.ts` era cópia local da função exportada em `query-helpers.ts` — substituída por import
- [x] 6. Sidebar admin vs client-sidebar — COMPLETA (commit b0aa6de):
  - 71 links verificados (admin sidebar + client sidebar) contra page.tsx no Next.js app router
  - 1 link morto encontrado e corrigido: `/status` no client-sidebar apontava para rota sem `page.tsx` (só existia `/status/[slug]`) — criado `app/status/page.tsx` que lista páginas de status do tenant via API
  - 0 links mortos restantes
- [x] 7. Aplicar correções + migration se necessário — Nenhuma correção adicional necessária. Todas as correções foram aplicadas incrementalmente nos itens 3-6.
- [x] 8. pnpm lint && pnpm check-types && pnpm test:run — Tudo passa: lint 2/2 OK, check-types 2/2 OK, 215/215 testes OK
- [x] 9. git add -A && commit && push — Commitado e pushed incrementalmente em cada item

## ACHADOS (issues encontrados, preencher com file:line)

### Teste Runtime (item extra — validação em execução)

**Bug 1: `/users` retornava 500 QUERY_ERROR**

- Causa: Query em `users.ts` selecionava `tu.scope` de `tenant_users`, mas esta coluna não existe. `scope` é calculado dinamicamente pela função `get_tenant_user_auth`.
- Correção: Substituir `tu.scope` por `CASE WHEN tu.role LIKE 'global:%' THEN 'global' ELSE 'tenant' END AS scope` em ambas queries (`/users` e `/users/all`).
- Arquivos: `apps/api/src/routes/users.ts:31, 76`

**Bug 2: Route shadowing — `/stats` capturado por `/:id` em 5 route files**

- Causa: Em Hono, a ordem de registro das rotas importa. `GET /:id` registrado antes de `GET /stats` faz com que `stats` seja tratado como `id`.
- Correção: Mover handlers `GET /stats` para antes dos handlers `GET /:id` em:
  - `apps/api/src/routes/tickets.ts` (/:id na linha 225, /stats na 573 → movido)
  - `apps/api/src/routes/changes.ts` (/:changeId na linha 56, /stats na 602 → movido)
  - `apps/api/src/routes/api-keys.ts` (/:id/usage na linha 287, /stats na 304 → movido)
  - `apps/api/src/routes/assets.ts` (/:id na linha 76, /stats na 463 → movido)
  - `apps/api/src/routes/tasks.ts` (/:id/runs na linha 516, /stats na 543 → movido)

**Não-bugs (comportamento esperado):**

- 404s em rotas sem `GET /` root (backup, notifications, compliance, kb, capacity, sla, apm, anomaly, finops, marketplace, discovery, drift, itsm, chatops, billing, correlation, mfa, logs) — estas rotas só têm sub-rotas (`/jobs`, `/channels`, `/policies`, etc.)
- 403 MODULE_DISABLED em firewall, scripts, audit, client-portal, escalation, patches, security-audit — feature flags desativadas para o tenant
- RLS cross-tenant: admin (global:admin) vê `/admin/tenants`, tenant user recebe 403 — isolamento funcionando corretamente

## DECISÕES TÉCNICAS

- Correções devem ser na causa raiz (schema/permissões/middleware), nunca workaround pontual em uma rota isolada.
- Toda mudança de schema → nova migration em `./migrations/`.
