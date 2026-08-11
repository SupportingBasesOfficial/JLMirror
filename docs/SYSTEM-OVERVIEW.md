# JLMIRROR — Documentação Completa do Sistema

> Documento auto-explicativo consolidado a partir de auditoria exaustiva do código-fonte.
> Última revisão: após ciclo de auditoria de segurança, harmonização frontend/backend e limpeza de débito técnico.

---

## 0. Visão Executiva

**JLMIRROR** é uma plataforma SaaS multi-tenant de monitoramento e observabilidade de TI de classe empresarial, voltada para MSPs (Managed Service Providers) e empresas que precisam de visibilidade unificada sobre sua infraestrutura.

- **Stack:** TypeScript 5.9 · Next.js 15 (App Router) · Hono 4 · PostgreSQL 16 · Redis 7
- **Monorepo:** Turborepo + pnpm 9 (apps + 11 packages `@repo/*`)
- **Multi-tenancy real:** Schemas por tenant + Row Level Security (RLS) no PostgreSQL
- **Zero lock-in:** PostgreSQL puro (sem Supabase), `pg` raw SQL (sem ORM proprietário), Hono (sem Express)
- **30+ módulos** ativáveis por feature flag (Zabbix, Tickets, SLA, Compliance/LGPD, Billing Asaas, FinOps, K8s, etc.)
- **Observabilidade:** Sentry + OpenTelemetry + Prometheus + pino JSON
- **Segurança:** JWT RS256, argon2, MFA TOTP, refresh rotation, circuit breaker, rate limiting sliding window

### Público-alvo

- MSPs / Provedores de serviços gerenciados
- Empresas de médio/grande porte com necessidades de compliance
- ISVs interessados em revenda white-label

### Modelo de negócio

SaaS multi-tenant com billing integrado (Asaas), white-label por tenant, marketplace de integrações e módulos ativáveis por feature flag.

---

## 1. Arquitetura

### 1.1 Decisões Arquiteturais (ADRs)

| ADR     | Decisão                            | Motivação                                                                                                                                                  |
| ------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-001 | Separação Frontend + API Service   | Serverless (Vercel) tem limite 10s e não suporta pools persistentes. API em container long-running permite WebSocket, prepared statements, sem cold starts |
| ADR-002 | PostgreSQL puro sem Supabase       | Evitar lock-in em auth/storage/realtime. Controle total do schema                                                                                          |
| ADR-003 | Hono como API Framework            | TypeScript-first, ultra-leve, Web Standards                                                                                                                |
| ADR-004 | Raw `pg` + Zod sem Kysely          | Sem codegen, SQL manual direto, menos dependências                                                                                                         |
| ADR-005 | BFF Pattern sem CORS               | Next.js Route Handler proxiea chamadas → zero CORS, cookies HttpOnly funcionam                                                                             |
| ADR-006 | ioredis TCP sem Upstash REST       | Latência menor, pub/sub completo                                                                                                                           |
| ADR-007 | jsonwebtoken sem jose              | Node.js crypto nativo, API não roda em edge                                                                                                                |
| ADR-008 | PgBouncer Transaction Pooling      | 200 client connections servidas com 20 server connections                                                                                                  |
| ADR-009 | prom-client para Métricas          | Métricas de processo automáticas (GC, event loop, CPU)                                                                                                     |
| ADR-010 | TimescaleDB para Métricas Internas | Ingestão de alta frequência com compression 90%                                                                                                            |
| ADR-011 | Circuit Breaker via Redis          | Após 5 falhas, circuito abre e rejeita instantaneamente                                                                                                    |

### 1.2 Conceitos Fundamentais

- **DNA vs Cérebro:** DNA = código mínimo viável para execução. Cérebro = documentação/inteligência disponibilizada sob demanda.
- **Result Pattern:** Toda operação de I/O retorna `Result<T>` — nunca throws não tratados. Força tratamento de erro no momento da chamada.
- **Anti-Lock-in:** Camada `@repo/db` permite trocar banco sem refatorar código.
- **BFF Pattern:** Frontend não conhece PostgreSQL. API não conhece React. Auth centralizada na API.
- **Feature Flag Gating:** 30+ módulos protegidos por `requireModule` middleware com cache 30s.
- **Dumb Components:** `@repo/ui` (shadcn/ui base) sem lógica de negócio.

### 1.3 Estrutura do Monorepo

```
JLMIRROR/
├── apps/
│   ├── api/          → @jlmirror/api (Hono 4, porta 3001)
│   └── web/          → @jlmirror/web (Next.js 15, porta 3000)
├── packages/
│   ├── auth/              → @repo/auth (JWT RS256, argon2, MFA, OAuth/LDAP)
│   ├── cache/             → @repo/cache (Redis ioredis, pub/sub, circuit breaker)
│   ├── db/                → @repo/db (pg.Pool, Result<T>, migrations, tenant context)
│   ├── eslint-config/     → @repo/eslint-config
│   ├── logger/            → @repo/logger (pino)
│   ├── secrets/           → @repo/secrets (registry com rotação dinâmica)
│   ├── shared-validation/ → @repo/shared-validation (Zod schemas)
│   ├── tailwind-config/   → @repo/tailwind-config
│   ├── telemetry/         → @repo/telemetry (OpenTelemetry W3C)
│   ├── typescript-config/ → @repo/typescript-config
│   ├── ui/                → @repo/ui (shadcn/ui base)
│   └── zabbix/            → @repo/zabbix (BlindedZabbixClient, AES-256-GCM)
├── migrations/       → 83 migrations SQL versionadas
├── docs/             → ARCHITECTURE.md, SCHEMA.md, TECHNICAL-GUIDE.md, SYSTEM-OVERVIEW.md
├── docker-compose.yml
├── Dockerfile        (Web)
├── apps/api/Dockerfile
├── turbo.json
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

### 1.4 Fluxo de Requisição

```
Browser → Next.js :3000
   ├── Páginas públicas (landing, status, auth) → SSR direto
   └── Páginas autenticadas → BFF Proxy (/api/[...path]/route.ts)
        ↓ repassa cookies HttpOnly
        API Hono :3001
         ├── securityHeaders → cors → compression → requestLogger
         ├── errorHandler → tracing → logIngestion → bodySizeLimit → requestTimeout
         ├── jwtAuth (verifica JWT + revogação Redis)
         ├── tenantContext (SET LOCAL app.current_tenant_id via AsyncLocalStorage)
         ├── auditMiddleware (POST/PUT/DELETE → system_logs com hash chaining)
         ├── requirePermission (RBAC via RPC get_user_permissions)
         └── requireModule (feature flag do módulo)
              ↓
         Route handler → @repo/db query → PostgreSQL (RLS)
              ↓
         Response → BFF → Browser
```

---

## 2. Backend (apps/api)

### 2.1 Ponto de Entrada (`apps/api/src/index.ts`)

**Bootstrap:**

1. `loadEnv()` — carrega .env
2. `Sentry.init()` — se SENTRY_DSN configurado (traces 10%, profiles 10%)
3. `initializeSecrets()` — registry de segredos com rotação
4. `decodeBase64Key()` — decodifica chaves JWT RS256 de base64 → PEM
5. `validateEnv()` — valida env vars obrigatórias
6. `waitForDatabase()` — aguarda DB com retry backoff
7. `setupGracefulShutdown()` — handlers SIGTERM/SIGINT
8. `serve()` — inicia HTTP na porta `API_PORT ?? 3001`
9. `setupWebSocket()` — hook WS no server HTTP

**Workers em background (BullMQ repeatable):**

| Worker              | Poll         | Função                                                              |
| ------------------- | ------------ | ------------------------------------------------------------------- |
| task-scheduler      | 30s          | Executa scheduled_tasks (HTTP, DB query, cleanup, scripts, reports) |
| alerting-engine     | 60s          | Poll Zabbix problems, dispara notificações                          |
| device-sync         | 5min         | Sincroniza hosts Zabbix → `public.devices`, auto-cria assets        |
| partition-manager   | diário 02:00 | Cria partições mensais futuras, droppa antigas (retention)          |
| correlation-engine  | 30s          | Correlaciona alertas Zabbix por janela temporal/host group/tags     |
| metrics-collector   | 60s          | Coleta métricas Node.js (memória, uptime) e pool PG                 |
| zabbix-write-worker | ad-hoc       | Processa writes Zabbix serializados via fila                        |

**Graceful shutdown:** para workers → fecha filas BullMQ → fecha Redis → fecha pool PG → fecha Sentry.

### 2.2 Middlewares Globais (ordem de execução)

| #   | Middleware             | Propósito                                                 | Configuração                        |
| --- | ---------------------- | --------------------------------------------------------- | ----------------------------------- |
| 1   | securityHeaders        | CSP, HSTS, X-Frame-Options DENY, nosniff, referrer-policy | HSTS apenas em production           |
| 2   | corsMiddleware         | CORS configurável por tenant                              | CORS_ALLOWED_ORIGINS env            |
| 3   | compressionMiddleware  | Gzip se body > 1024 bytes                                 | threshold 1024                      |
| 4   | requestLogger          | Gera correlation ID, loga requests com duração            | X-Request-Id header                 |
| 5   | errorHandler           | Trata erros JSON, retorna 400/500                         | NODE_ENV=production oculta detalhes |
| 6   | tracingMiddleware      | Injeta trace context W3C, registra spans                  | SERVICE_NAME=jlmirror-api           |
| 7   | logIngestionMiddleware | Loga requests em system_logs (amostragem 1/10)            | LOG_SAMPLE_RATE                     |
| 8   | bodySizeLimit          | Rejeita Content-Length > 10MB                             | DEFAULT_MAX_BODY_SIZE=10MB          |
| 9   | requestTimeout         | Aborta request após 30s                                   | AbortController                     |

### 2.3 Middlewares por Rota

| Middleware            | Propósito              | Lógica                                                                           |
| --------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| **jwtAuth**           | Autenticação JWT RS256 | Verifica Bearer token, checa revogação no Redis (jti), NODE_ENV=test bypass      |
| **tenantContext**     | Isolamento de tenant   | `SET LOCAL app.current_tenant_id` via AsyncLocalStorage (`runWithTenant`)        |
| **auditMiddleware**   | Auditoria de mutações  | Registra POST/PUT/DELETE/PATCH em system_logs com hash chaining SHA-256          |
| **requirePermission** | RBAC granular          | Verifica permissão via RPC `get_user_permissions`, wildcards `*:*`, `domain:*:*` |
| **requireModule**     | Feature flags          | Bloqueia se flag do módulo desativada, cache 30s                                 |
| **rateLimit**         | Rate limiting          | Sliding window Redis INCR+EXPIRE, fallback in-memory                             |
| **httpCache**         | Cache HTTP GET         | Redis com chave URL+query+tenant+user, TTL default 60s                           |
| **validate**          | Validação Zod          | Valida body/query/params, retorna 400 se falhar                                  |

### 2.4 Rate Limiting

| Tipo            | Limite   | Janela | Uso                |
| --------------- | -------- | ------ | ------------------ |
| rateLimitAuth   | 1000 req | 15min  | Login/refresh      |
| rateLimitApi    | 600 req  | 1min   | Rotas autenticadas |
| rateLimitWrite  | 30 req   | 1min   | Mutações           |
| rateLimitTenant | 100 req  | 1min   | Proteção Zabbix    |

Identificação: usuário autenticado usa `tenant:user_id`, anônimo usa `tenant:ip`.

### 2.5 Libs (`apps/api/src/lib/`)

| Lib                    | Propósito                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| alerting-engine        | Motor de alertas Zabbix (poll → match notification_rules → dispara)                                          |
| anomaly-detector       | Algoritmos estatísticos: Z-score, IQR, EWMA para detectar outliers                                           |
| asaas-client           | Cliente Asaas (cobrança PIX/boleto/cartão)                                                                   |
| audit                  | Wrapper para `write_audit_log` SQL function                                                                  |
| chatops-processor      | Interpreta comandos Slack/Teams (status, incidents, ack, resolve)                                            |
| correlation-engine     | Agrupa alertas por janela temporal, host group, tags, severidade                                             |
| device-sync            | Sincroniza hosts Zabbix → `public.devices`, auto-cria assets                                                 |
| downsample             | Reduz N pontos → maxPoints (bucketing avg/min/max, LTTB simplificado)                                        |
| dynamic-update         | Builder UPDATE dinâmico (SET clause + params)                                                                |
| external-auth          | Lookup/criação de usuário por email para OAuth/LDAP                                                          |
| failure-predictor      | Modelos: Linear Trend, Exponential, Moving Average, Threshold Proximity                                      |
| health-score           | Agrega 7 dimensões (uptime, backups, SSL, health checks, tickets, incidents, compliance) → score 0-100       |
| itsm-connector         | Framework agnóstico para Jira, FreshService, ServiceNow, Zendesk                                             |
| lifecycle              | Valida env, espera DB, roda migrations, graceful shutdown                                                    |
| metrics-collector      | Coleta métricas Node.js e pool PG → system_metrics                                                           |
| metrics                | Registry prom-client com histogramas HTTP, Zabbix, DB pool, WS, filas, circuit breaker                       |
| notification-delivery  | Centraliza envio: Slack, Discord, Telegram, Teams, Email (SMTP), Webhook, Web Push, WhatsApp (Evolution API) |
| pagination             | Parse page/limit/sort/order, constrói response paginada e ORDER BY seguro                                    |
| partition-manager      | Cria partições mensais futuras (lookahead 3 meses), droppa antigas                                           |
| password-reset         | Cria token, envia email, valida, consome, revoga sessões                                                     |
| query-helpers          | safeRows, safeCount, safeFirstRow para extrair dados de QueryResult                                          |
| queue                  | Abstração BullMQ com Redlock para repeatable jobs                                                            |
| report-generator       | Gera PDF (PDFKit) e CSV com branding customizável                                                            |
| safe-json              | Parse JSON com try/catch, retorna 400 se falhar                                                              |
| session                | Gestão de sessões com refresh token, trusted devices, revogação                                              |
| task-scheduler         | Executa scheduled_tasks (HTTP, DB query, cleanup, script, shell, report)                                     |
| web-push               | Web Push API com VAPID, gerencia subscriptions, desativa 410/404                                             |
| zabbix-write-processor | Serializa writes Zabbix via fila para evitar deadlocks                                                       |

### 2.6 Rotas — Visão Geral

**Rotas públicas (sem auth):** health, metrics, docs, auth, tv, branding, billing (webhook), status-page

**Rotas protegidas sempre ativas (sem requireModule):** zabbix, mfa, rbac, users, feature-flags, profile, settings, dashboard, ws, errors, sql-console, contracts

**Rotas protegidas com feature flags (35+):** devices, audit, logs, traces, scripts, executions, firewall, k8s, ssl, backup, notifications, assets, capacity, compliance, tickets, kb, system-health, api-keys, webhooks, tasks, data-transfer, lgpd, escalation, patches, security-audit, correlation, workflows, push, client-portal, chatops, status-page (admin), drift, itsm, discovery, anomaly, predictions, finops, marketplace, executive-dashboard, reports, changes, admin, sla, apm

### 2.7 Packages `@repo/*`

| Package                 | Função                                                                    | Dependências                                |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| @repo/auth              | JWT RS256, MFA TOTP, OAuth Google, LDAP, RBAC                             | jsonwebtoken, otplib, @repo/cache, @repo/db |
| @repo/cache             | Redis singleton, cache get/set/del, pub/sub, circuit breaker, cachedQuery | ioredis, @repo/db                           |
| @repo/db                | Pool PG, query tipada, tenant context (AsyncLocalStorage), migrations     | pg                                          |
| @repo/logger            | Logger estruturado (debug/info/warn/error), JSON em prod, colorido em dev | —                                           |
| @repo/secrets           | Registry de segredos em memória com rotação dinâmica                      | —                                           |
| @repo/shared-validation | Schemas Zod (única fonte de verdade para tipos)                           | zod                                         |
| @repo/telemetry         | Tracing W3C Trace Context (traceparent header)                            | —                                           |
| @repo/zabbix            | BlindedZabbixClient com criptografia AES-256-GCM do token                 | undici, @repo/cache                         |
| @repo/ui                | Design system (shadcn/ui base), componentes dumb                          | React, Tailwind                             |
| @repo/eslint-config     | Configs ESLint compartilhadas (base, next, node)                          | typescript-eslint                           |
| @repo/typescript-config | tsconfig base compartilhada                                               | —                                           |
| @repo/tailwind-config   | Config Tailwind compartilhada                                             | —                                           |

---

## 3. Frontend (apps/web)

### 3.1 Stack

- **Framework:** Next.js 15 (App Router) + React 19
- **Styling:** Tailwind CSS v3 + CSS Variables (dark mode first)
- **State:** React hooks + SWR (cache client-side, deduping 2s)
- **Realtime:** WebSocket customizado com reconexão automática (5s)
- **Charts:** Recharts
- **Icons:** Lucide React
- **UI:** @repo/ui (shadcn/ui base)
- **Auth:** Cookies HttpOnly (access_token 15min, refresh_token 7d) + BFF proxy
- **PWA:** manifest.json + service worker (sw.js) com auto-update

### 3.2 Design System

**Cores (CSS Variables):**

- Light: surface-0 `#f8fafc`, surface-1 `#ffffff`, text-primary `#0f172a`
- Dark: surface-0 `#0b1015`, surface-1 `#0d1218`, text-primary `#c9d4da`
- Brand: primary `#1ba898` (teal), secondary `#35d0c4`
- Status: ok `#3dd68c`, info `#5b9bd5`, warning `#f0c674`, error `#e5484d`, critical `#ff4444`

**Fontes:** Inter (UI) + JetBrains Mono (código/dados técnicos)

**Animações customizadas:** jlArrowUp/Down, jlTravel, jlFadeIn, jlBlink, jlRing, jlCorePulse, jlSignalBar, jlRadarSweep, jlShimmer

### 3.3 Layouts

**Root Layout (`app/layout.tsx`):**

```
ThemeProvider (next-themes)
  └── ErrorBoundary (captura erros React → /api/v1/errors/report)
       ├── Toaster (@repo/ui)
       ├── WebVitalsReporter
       ├── PwaInstallPrompt
       ├── ServiceWorkerRegister
       └── {children}
```

**Admin Layout (`app/(admin)/layout.tsx`):**

```
UserScopeProvider (busca scope global/tenant via /api/v1/auth/me)
  └── AdminGuard (bloqueia rotas admin-only para tenants)
       └── RealtimeWrapper (WebSocket + notificações)
            ├── ScopeAwareSidebar (AdminSidebar ou ClientSidebar)
            └── main
                 ├── TopBar (breadcrumb, clock, notificações, status WS)
                 └── {children}
```

### 3.4 BFF Proxy (`app/api/[...path]/route.ts`)

- Catch-all route que proxya todas as requisições para API interna
- Base URL: `API_INTERNAL_URL` (default http://localhost:3001)
- Adiciona prefixo `/api/v1/` se não presente
- Repassa cookies HttpOnly (access_token, refresh_token) e IP real (x-forwarded-for)
- **Token refresh automático:**
  1. Se sem access token mas com refresh → tenta renovar antes da request
  2. Se recebe 401 e tem refresh → renova → refaz request com novo token
  3. POST/PUT com body não pode re-streamar → retorna 401 com header `X-Token-Refreshed`
  4. Atualiza cookie access_token (15min)

**Mapeamento de paths:** `/api/v1/*` → direto · `/zabbix/*` → `/api/v1/zabbix/*` · `/admin/*` → `/api/v1/admin/*` · outros → `/api/v1/{path}`

### 3.5 Páginas Principais (80+)

| Rota                      | Tipo   | Funcionalidade                                       |
| ------------------------- | ------ | ---------------------------------------------------- |
| `/`                       | Client | Landing page corporativa com efeitos de cursor       |
| `/auth/login`             | Client | Login com MFA, device fingerprint, branding dinâmico |
| `/auth/forgot-password`   | Client | Recuperação de senha                                 |
| `/auth/reset-password`    | Client | Reset com token                                      |
| `/auth/change-password`   | Client | Troca obrigatória de senha                           |
| `/auth/oauth/callback`    | Client | Callback OAuth (Google)                              |
| `/dashboard`              | Server | Dashboard com devices, triggers, KPIs                |
| `/dashboard/devices`      | Client | Grid de dispositivos com busca e filtros             |
| `/dashboard/devices/[id]` | Server | Detalhes (CPU, RAM, rede, disco)                     |
| `/dashboard/alerts`       | Client | Lista de alertas/triggers ativos                     |
| `/admin`                  | Client | Admin global — gestão de tenants                     |
| `/admin/users`            | Client | Gestão de usuários                                   |
| `/admin/error-reports`    | Client | Relatórios de erro do ErrorBoundary                  |
| `/status/[slug]`          | Client | Página de status pública                             |
| `/tv`                     | Client | Modo TV para displays (token especial)               |
| `/offline`                | Client | Página offline (PWA)                                 |

**Páginas secundárias (todas em (admin) group):**

- **Monitoramento avançado:** executive-dashboard, system-health, health-score, apm, capacity, anomaly-detection, predictive-failure, correlation
- **Operações:** tickets, changes, knowledge-base, scheduled-tasks, notifications, chatops, config-drift, itsm, reports, workflows, escalation, contracts
- **Administração:** settings, settings/modules, settings/modules-client, profile, security/audit, security/mfa, sessions, api-keys, webhooks, feature-flags, logs, traces, data-transfer
- **Infraestrutura:** assets, backups, k8s, firewall, ssl, patches, auto-discovery
- **Segurança & Compliance:** compliance, lgpd, security-audit
- **Outros:** automation, automation/scripts, client-portal, white-label, status-page-admin, service-tree, sla-dashboard, marketplace, finops, push-settings

### 3.6 Componentes Principais

**Layout & Navegação:** theme-provider, error-boundary, realtime-wrapper, admin-guard, user-scope-provider, top-bar, scope-aware-sidebar, admin-sidebar, client-sidebar, sidebar-nav-items, logout-button

**PWA:** pwa-install-prompt, sw-register

**UI:** mega-loader, theme-toggle, realtime-toasts, zabbix-ping-indicator

**Device Grid & Search:** device-grid, device-search

**Device Detail:** device-detail-client, header, gauges, sparklines, chart-section, disk-network, items-table, services-processes

**Visualização:** gauge (SVG semicircular), metric-chart (Recharts), multi-sparkline, disk-sunburst

**UI Primitives:** card, card-header, status-badge, state-display, empty-state, loading-state, kpi-card, data-table

### 3.7 Hooks & Libs

| Hook                   | Propósito                                                            |
| ---------------------- | -------------------------------------------------------------------- |
| use-api                | SWR com cache, revalidação, progresso (0-100), retry (exceto 429)    |
| zabbix-fetch           | Fetch com timeout 15s, progresso real (Content-Length), retry em 401 |
| api-client             | Client API para SSR (serverApiGet) e client (apiGet, apiPost)        |
| use-websocket          | WebSocket com reconexão automática (5s)                              |
| realtime-provider      | Context provider para notificações WS e callbacks de write jobs      |
| use-zabbix-write       | Operações de write no Zabbix com callback WS                         |
| use-module-flags       | Feature flags de módulos, cache 60s                                  |
| use-tenant-branding    | Branding do tenant (cores, logo, CSS)                                |
| use-push-notifications | Notificações push                                                    |

**Utils:** device-fingerprint (canvas, timezone, resolução), sanitize-url (XSS prevention), classify-zabbix-host, feature-flags

### 3.8 PWA / Service Worker

**Manifest:** name "JLMIRROR — Portal de Monitoramento", standalone, theme_color `#0d9488`, shortcuts (Dashboard, Alertas, Workflows, Modo TV)

**Service Worker (`/sw.js`):**

- Registro apenas em produção ou se `localStorage.getItem("sw-dev-enabled")`
- Update check a cada 1 hora
- Auto-recarrega ao ativar nova versão

---

## 4. Banco de Dados

### 4.1 Visão Geral

- **SGBD:** PostgreSQL 16 + TimescaleDB (hypertables para métricas)
- **Driver:** `pg` (node-postgres) com `pg.Pool` (max 50) + PgBouncer (transaction pooling, 200 client / 20 server)
- **Migrations:** 83 arquivos SQL versionados (`node-pg-migrate`)
- **Multi-tenancy:** Schemas por tenant (`tenant_{slug}`) + RLS em toda tabela
- **Particionamento:** `system_logs`, `trace_spans`, `capacity_metrics` → PARTITION BY RANGE (created_at) mensais
- **TimescaleDB hypertables:** `system_metrics`, `zabbix_history_cache` (compression 90%, retention 90d)

### 4.2 Roles PostgreSQL

| Role              | Função                                                       |
| ----------------- | ------------------------------------------------------------ |
| app_runtime       | Executa funções SECURITY DEFINER                             |
| global_admin_role | Acesso total (JL staff)                                      |
| app_login         | Login de usuários (SELECT/INSERT/UPDATE/DELETE conforme RLS) |

### 4.3 Schema `public` (Global — Cluster 0)

**Autenticação:**

- `users` — usuários globais (email, password_hash argon2, is_active, must_change_password, phone, last_login_at)
- `sessions` — sessões com refresh_token_hash, device_fingerprint, ip_address, user_agent, device_label
- `password_reset_tokens` — tokens de reset de senha
- `trusted_devices` — dispositivos confiáveis do usuário

**Multi-tenancy:**

- `tenants` — metadados de clientes (name, cnpj, status, parent_tenant_id, tenant_type owner/manager/client)
- `tenant_routes` — roteamento de cluster + config Zabbix (cluster_id, cluster_host, schema_name, zabbix_*)
- `tenant_users` — mapeamento user ↔ tenant + role + scope (global/tenant)
- `tenant_custom_roles` — roles customizadas por tenant
- `tenant_custom_role_permissions` — permissões de roles custom
- `client_contacts` — contatos de clientes (CRM)
- `client_companies` — dados comerciais dos clientes

**RBAC:**

- `permissions` — catálogo de permissões (key UNIQUE, category)
- `roles` — catálogo de roles (key UNIQUE, is_system)
- `role_permissions` — mapeamento role ↔ permissões
- `user_mfa_totp` — MFA TOTP por usuário (secret, recovery_codes, is_enabled)
- `user_webauthn_credentials` — MFA WebAuthn/FIDO2
- `mfa_challenges` — desafios temporários MFA
- `attribute_policies` — políticas ABAC
- `sso_providers` / `sso_provider_configs` — provedores SSO por tenant

**Observabilidade (particionadas):**

- `system_logs` — logs centralizados (PARTITIONED por created_at, índices GIN/pg_trgm)
- `trace_spans` — spans OpenTelemetry (PARTITIONED)
- `system_metrics` — métricas internas (TimescaleDB hypertable)
- `zabbix_history_cache` — cache de history Zabbix (TimescaleDB hypertable)

**System Health:**

- `system_health_checks` — health checks
- `system_incidents` — incidentes de sistema
- `system_metric_snapshots` — snapshots de métricas

### 4.4 Tabelas Multi-Tenant (RLS por tenant)

**Automação & Scripts:** scripts, script_versions, script_executions, execution_approvals, scheduled_tasks, scheduled_task_runs, workflows, workflow_steps, workflow_executions, workflow_step_executions

**Firewall & Segurança:** firewall_rules, firewall_rule_versions, firewall_changes, security_audit_rules, security_audit_findings, security_audit_scans

**Kubernetes:** k8s_clusters, k8s_resources_cache, k8s_events

**SSL/TLS:** ssl_certificates, ssl_checks, ssl_alerts

**Backup:** backup_jobs, backup_snapshots, backup_restores

**Notificações:** notification_channels, notification_rules, notification_log, push_subscriptions

**Assets:** assets, asset_licenses, asset_changes

**Capacity (particionada):** capacity_metrics, capacity_thresholds, capacity_reports, capacity_forecasts

**Compliance:** compliance_policies, compliance_scans, compliance_violations

**Helpdesk:** ticket_categories, tickets, ticket_comments

**Knowledge Base:** kb_categories, kb_articles, kb_article_versions

**Feature Flags:** feature_flags, feature_flag_overrides, feature_flag_events

**User Profile:** user_profiles, user_sessions, user_security_log

**Tenant Settings:** tenant_settings (branding, SMTP, integrações, limites, segurança)

**Executive Dashboard:** executive_dashboard_cache

**Reports:** report_templates, scheduled_reports, report_deliveries, report_branding, report_delivery_config

**Change Management:** change_requests, change_approvals, change_tasks

**SLA & Services:** services, sla_records, service_incidents, maintenance_windows

**Config Drift:** config_baselines, config_drift_events

**Discovery:** discovery_sessions, discovered_devices, discovered_links

**Anomaly Detection:** anomaly_detections, anomaly_config

**Failure Predictions:** failure_predictions, prediction_config

**FinOps:** cost_entries, cost_optimizations, cost_budgets

**Marketplace:** marketplace_apps, marketplace_installs

**ITSM:** itsm_connectors, itsm_sync_log

**SQL Console:** sql_connections, sql_templates, sql_query_log

**Status Page:** status_pages

**Client Portal:** client_portal_users

**LGPD:** lgpd_requests

**ChatOps:** chatops_commands, chatops_config

**Billing (Asaas):** billing_subscriptions, billing_invoices

**TV Tokens:** tv_tokens

**Error Reports:** error_reports

**Contracts & Hour Bank:** tenant_contracts, hour_bank_periods, ticket_work_logs

**Public Devices:** `public.devices` (com RLS para JOINs cross-modulo)

**User Host Groups:** user_host_groups (usuário ↔ Zabbix host groups)

### 4.5 Funções SQL Principais

| Função                                                         | Propósito                                   |
| -------------------------------------------------------------- | ------------------------------------------- |
| `update_timestamp()`                                           | Trigger para updated_at automático          |
| `get_tenant_metadata()`                                        | Metadados do tenant                         |
| `get_tenant_zabbix_config()`                                   | Config Zabbix do tenant                     |
| `get_tenant_user_auth()`                                       | Auth do usuário no tenant (retorna scope)   |
| `set_tenant_context()`                                         | Define contexto do tenant                   |
| `clone_schema()`                                               | Clona schema template para novo tenant      |
| `onboard_tenant_schema()`                                      | Onboarding de novo tenant                   |
| `drop_tenant_schema()`                                         | Remove schema completo do tenant            |
| `get_user_permissions()`                                       | Permissões do usuário (RBAC hierárquico)    |
| `write_audit_log()`                                            | Registra log de auditoria com hash chaining |
| `search_system_logs()`                                         | Busca full-text em logs                     |
| `system_logs_stats()`                                          | Estatísticas de logs                        |
| `traces_stats()`                                               | Estatísticas de traces                      |
| `create_script_execution()`                                    | Cria execução de script                     |
| `approve_execution()`                                          | Aprova execução pendente                    |
| `generate_iptables_command()`                                  | Gera comando iptables                       |
| `generate_nft_command()`                                       | Gera comando nft                            |
| `get_cert_status()`                                            | Status de certificado SSL                   |
| `generate_ssl_alert()`                                         | Gera alerta de SSL                          |
| `calculate_next_run()`                                         | Próxima execução (backup/tasks)             |
| `cleanup_expired_snapshots()`                                  | Limpa snapshots expirados                   |
| `check_rule_cooldown()`                                        | Verifica cooldown de regra de notificação   |
| `log_asset_change()`                                           | Registra mudança em asset                   |
| `calculate_linear_forecast()`                                  | Previsão linear de capacidade               |
| `generate_ticket_number()`                                     | Número de ticket                            |
| `calculate_ticket_sla()`                                       | SLA do ticket                               |
| `generate_kb_slug()`                                           | Slug de artigo KB                           |
| `cleanup_old_metric_snapshots()`                               | Limpa snapshots antigos                     |
| `hash_api_key()`                                               | Hash de API key                             |
| `reset_api_key_counters()`                                     | Reset contadores API key                    |
| `generate_webhook_secret()`                                    | Secret de webhook                           |
| `calculate_uptime_percentage()`                                | % uptime para SLA                           |
| `cleanup_k8s_cache()`                                          | Limpa cache K8s                             |
| `close_hour_bank_period()`                                     | Fecha período de banco de horas             |
| `pause_work_log()` / `resume_work_log()` / `finish_work_log()` | Controle de timer de work log               |

### 4.6 Views

- `trace_summary` — resumo de traces
- `ssl_certificates_with_status` — certificados com status calculado
- `assets_with_license_alerts` — assets com alertas de licença
- `compliance_score_by_framework` — score de compliance por framework
- `system_status_overview` — visão geral de status do sistema

### 4.7 RLS (Row Level Security)

Toda tabela multi-tenant tem RLS habilitado com policies:

- **Tenant isolation:** `tenant_id = current_setting('app.current_tenant_id')::uuid`
- **Global admin:** `global_admin_role` tem ALL
- **Self policy:** tabelas como `push_subscriptions` permitem usuário ver apenas suas inscrições

O contexto do tenant é propagado via `SET LOCAL app.current_tenant_id` no middleware `tenantContext` usando `AsyncLocalStorage`.

---

## 5. Infraestrutura & DevOps

### 5.1 Docker Compose

| Serviço   | Imagem                      | Porta | Healthcheck              |
| --------- | --------------------------- | ----- | ------------------------ |
| postgres  | postgres:16-alpine          | 5432  | pg_isready               |
| pgbouncer | edoburu/pgbouncer:latest    | 6432  | pg_isready               |
| redis     | redis:7-alpine              | 6379  | redis-cli ping           |
| api       | build (apps/api/Dockerfile) | 3001  | wget /api/v1/health/live |
| web       | build (Dockerfile raiz)     | 3000  | wget /                   |

**Volumes:** postgres-data, redis-data
**Network:** jlmirror-net (bridge)

**PgBouncer:** transaction pooling, MAX_CLIENT_CONN 200, DEFAULT_POOL_SIZE 20, AUTH scram-sha-256

### 5.2 Dockerfiles

**Web (raiz):**

- Multi-stage: Builder (node:22-alpine + pnpm) → Runner
- Standalone output (Next.js bundle mínimo)
- dumb-init para gerenciamento de sinais
- Usuário não-root: nextjs (uid 1001)
- BUILD_STANDALONE=true, SKIP_ENV_VALIDATION=true

**API (apps/api):**

- Multi-stage: Builder → Runner
- pnpm deploy --prod (bundle mínimo com apenas deps de produção)
- dumb-init
- Usuário não-root: hono (uid 1001)
- NODE_ENV=production, API_PORT=3001

### 5.3 CI/CD (GitHub Actions)

**Workflow CI** (push/PR em main, develop):

1. **Lint** — pnpm lint
2. **Check Types** — pnpm check-types
3. **Test** — pnpm test:run + upload coverage
4. **Build** — pnpm build
5. **Docker Build** — Build images API e Web (cache GHA)
6. **E2E Tests** — Soba PostgreSQL+Redis, migrations, Playwright chromium
7. **Security Audit** — pnpm audit, Snyk SAST, Trivy filesystem, SonarCloud SAST

**Workflow CD** (após CI completar em main):

1. Build API e Web
2. Build Docker images (jlmirror-api:latest, jlmirror-web:latest)
3. Deploy via SSH: `git pull` → `docker compose pull` → `docker compose up -d --remove-orphans`
4. Health Gate API (10 tentativas em /api/v1/health/live)
5. Health Gate Web (10 tentativas em /)
6. **Rollback automático** se deploy falhar: `git revert --no-commit HEAD` → `docker compose up -d`

**Workflow Lighthouse** (PR para main): Lighthouse CI com continue-on-error

**Workflow Zero-Error** (AI Black Box v2): validadores customizados, semgrep, gitleaks

### 5.4 Monitoramento

**Sentry:**

- Backend: SENTRY_DSN, traces 10%, profiles 10%
- Frontend server: SENTRY_DSN, traces 10% (prod)
- Frontend client: NEXT_PUBLIC_SENTRY_DSN, traces 10%, session replays 10%, error replays 100%

**OpenTelemetry:**

- @repo/telemetry: W3C Trace Context (traceparent header)
- Middleware tracing: extrai/cria contexto, registra spans, propaga traceparent

**Prometheus (prom-client):**

- `jlmirror_http_request_duration_seconds` (histogram)
- `jlmirror_http_requests_total` (counter)
- `jlmirror_zabbix_api_duration_seconds` (histogram)
- `jlmirror_zabbix_api_errors_total` (counter)
- `jlmirror_db_pool_size` (gauge)
- `jlmirror_ws_connections` (gauge)
- `jlmirror_queue_jobs_active` (gauge)
- `jlmirror_zabbix_circuit_state` (gauge: 0=closed, 1=half_open, 2=open)
- Endpoint: GET /api/v1/metrics

**Logs (pino):**

- JSON estruturado em produção, colorido em dev
- LOG_LEVEL env (default info)
- Log ingestion middleware: amostragem 1/10 em system_logs

### 5.5 Segurança

**SAST/SCA:**

- Snyk (severity high, fail-on all, continue-on-error)
- SonarCloud (continue-on-error)
- Trivy filesystem (HIGH, CRITICAL)
- Gitleaks (secrets detection: Stripe, OpenAI, AWS, GitHub PAT, private keys, connection strings, bearer tokens)
- Semgrep (SAST customizável)

**Headers de Segurança:**

- CSP: default-src 'self', script-src 'self' 'unsafe-inline', frame-ancestors 'none'
- HSTS: max-age=63072000; includeSubDomains; preload (production only)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Cross-Origin-Opener-Policy: same-origin
- Cross-Origin-Resource-Policy: same-origin

**Git Hooks (Husky):**

- pre-commit: `pnpm lint-staged`
- pre-push: `pnpm test:run`
- commit-msg: `pnpm commitlint` (conventional commits, subject max 100 chars)

### 5.6 Variáveis de Ambiente Principais

| Categoria               | Variáveis                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Database                | POSTGRES_PASSWORD (obrigatório), DATABASE_URL, DATABASE_MASTER_URL, DATABASE_REPLICA_URL, DB_POOL_MAX (default 50)            |
| Redis                   | REDIS_URL                                                                                                                     |
| JWT                     | JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, JWT_ACCESS_TOKEN_TTL_MINUTES (15), JWT_REFRESH_TOKEN_TTL_DAYS (30), JWT_ISSUER, JWT_AUDIENCE |
| Zabbix                  | ZABBIX_ENCRYPTION_KEY_HEX (obrigatório), ENCRYPTION_KEY (obrigatório), ZABBIX_API_URL                                         |
| LDAP (opcional)         | LDAP_URL, LDAP_BIND_DN, LDAP_BIND_PASSWORD, LDAP_SEARCH_BASE                                                                  |
| OAuth Google (opcional) | GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI                                                 |
| SMTP (opcional)         | SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM                                                                         |
| CORS                    | CORS_ALLOWED_ORIGINS                                                                                                          |
| API                     | API_PORT (3001), API_URL, API_INTERNAL_URL                                                                                    |
| Frontend                | NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_WS_URL                                                                 |
| Sentry (opcional)       | SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN                                                                                            |
| Web Push                | VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT                                                                            |
| Segurança               | BYPASS_PERMISSIONS (true apenas em testes)                                                                                    |

### 5.7 Scripts Disponíveis (package.json)

| Script          | Comando                             | Propósito           |
| --------------- | ----------------------------------- | ------------------- |
| build           | turbo run build                     | Build de todos      |
| dev             | turbo run dev                       | Dev mode            |
| lint            | turbo run lint                      | Linting             |
| check-types     | turbo run check-types               | Type checking       |
| test            | vitest                              | Testes (watch)      |
| test:run        | vitest run                          | Testes (single run) |
| test:coverage   | vitest run --coverage               | Cobertura           |
| e2e             | playwright test                     | E2E                 |
| db:migrate      | tsx packages/db/src/migrate.ts up   | Migrations up       |
| db:migrate:down | tsx packages/db/src/migrate.ts down | Migrations down     |
| docker:up       | docker-compose up -d                | Sobe containers     |
| docker:down     | docker-compose down                 | Para containers     |

---

## 6. Features de Negócio

### 6.1 Monitoramento Zabbix

- Conector streaming em tempo real via WebSocket
- Sincronização paralela (100 tenants em ~20s)
- Cache de responses (TTL 5-10s)
- Circuit breaker distribuído via Redis (5 falhas → abre)
- Downsampling de history (14k+ pontos → 500 sem perda visual)
- Isolamento por host_group_id (proteção IDOR)
- Token Zabbix criptografado com AES-256-GCM
- Endpoints: `/api/v1/zabbix/{hosts,items,triggers,problems,history,graphs,rpc}`

### 6.2 Tickets/Helpdesk

- CRUD com prioridades, status, categorias
- Comentários e histórico
- Integração ITSM (Jira, FreshService, ServiceNow, Zendesk)
- SLA tracking por ticket
- Auto-escalonamento baseado em regras
- Portal do cliente para abertura

### 6.3 SLA e Serviços

- Árvore de serviços hierárquica
- SLA targets por serviço
- Janelas de manutenção planejadas
- Registro de incidentes
- Cálculo automático de uptime
- Dashboard de SLA com histórico

### 6.4 Compliance/LGPD

- Políticas (LGPD, ISO 27001, PCI-DSS, CIS, NIST, HIPAA, GDPR, SOC2)
- Scans automatizados
- Evidências de compliance
- Auditoria de segurança
- Solicitações LGPD (export/delete de dados)

### 6.5 Billing (Asaas)

- Criação de clientes no Asaas
- Assinaturas recorrentes (mensal, trimestral, anual)
- Pagamentos PIX, boleto, cartão
- Faturas e status
- Webhook para notificações de pagamento

### 6.6 Notificações Multi-Canal

- Email (SMTP/Nodemailer)
- Web Push (VAPID)
- Webhooks
- ChatOps (Slack/Teams)
- Telegram, Discord, PagerDuty
- WhatsApp (Evolution API)
- Regras de notificação baseadas em eventos com cooldown

### 6.7 Automação

- Scripts PowerShell/Bash/Python/Node
- Execução com timeout e limites de concorrência
- Aprovação de execução (opcional)
- Tarefas agendadas (cron via BullMQ)
- Workflows de automação multi-step

### 6.8 Segurança

- Firewall rules por tenant (iptables/nft)
- Aplicação via SSH remoto com validação de hostname (anti-SSRF)
- MFA TOTP com backup codes
- Trusted devices
- Session management com revogação
- Security audit rules + findings + scans

### 6.9 Outros Módulos

- **Discovery:** Auto-discovery de dispositivos (SNMP/LLDP), topologia de rede
- **Anomaly Detection:** Z-score, IQR, EWMA para detectar outliers
- **Predictive Failure:** Linear Trend, Exponential, Moving Average, Threshold Proximity
- **Capacity Planning:** Métricas, thresholds, forecasts, relatórios
- **Backup:** Jobs, snapshots, restore com checksum SHA256
- **API Keys:** Chaves por tenant com scopes, expiração, revogação
- **K8s Management:** Clusters, recursos, eventos, kubectl via API
- **ITSM:** Conectores Jira/FreshService/ServiceNow/Zendesk com field mapping
- **SQL Console:** Multi-banco (PostgreSQL, MySQL, SQL Server, Oracle), read-only
- **Data Transfer:** Export/import JSON/CSV com whitelist
- **White Label/Branding:** Logo, cores, CSS customizado por tenant
- **Status Page Pública:** Uptime, incidentes, SLA, manutenção
- **TV/Painéis:** Dashboard executivo, modo TV full-screen
- **Knowledge Base:** Artigos com categorias, tags, busca, versionamento
- **Correlação de Eventos:** Agrupamento por janela temporal, host group, tags
- **Drift Detection:** Baselines, scans, eventos de drift
- **FinOps:** Custos cloud, otimizações, orçamentos
- **Marketplace:** Catálogo de integrações (Zabbix, Slack, Jira, etc.)
- **ChatOps:** Slash commands Slack/Teams (status, devices, problemas)
- **Client Portal:** Portal self-service com visão limitada
- **Contracts & Hour Bank:** Contratos, períodos de banco de horas, work logs com timer
- **Change Management:** RFCs, aprovações, tarefas, rollback plan

### 6.10 Autenticação Externa (Engatilhado)

- **OAuth Google:** Interface definida, retorna 501. Implementação futura com `arctic`
- **LDAP:** Interface definida, retorna 501. Implementação futura com `ldapjs`

---

## 7. Integrações Externas

| Integração                 | Como funciona                                                        | Status               |
| -------------------------- | -------------------------------------------------------------------- | -------------------- |
| Zabbix                     | Conector streaming WS + API REST, token AES-256-GCM, circuit breaker | ✅ Ativo             |
| Asaas                      | Cliente REST API via fetch (PIX, boleto, cartão)                     | ✅ Ativo             |
| SMTP                       | Nodemailer com config por tenant                                     | ✅ Ativo             |
| Web Push                   | Web Push API com VAPID                                               | ✅ Ativo             |
| Slack/Teams                | Webhooks recebem slash commands, chatops-processor interpreta        | ✅ Ativo             |
| ITSM                       | Jira, FreshService, ServiceNow, Zendesk com field mapping            | ✅ Ativo             |
| Evolution API              | WhatsApp                                                             | ✅ Ativo             |
| Telegram/Discord/PagerDuty | Canais de notificação                                                | ✅ Ativo             |
| OAuth Google               | Interface definida                                                   | 🔧 Engatilhado (501) |
| LDAP                       | Interface definida                                                   | 🔧 Engatilhado (501) |

---

## 8. Testes

| Tipo             | Ferramenta          | Configuração                                     |
| ---------------- | ------------------- | ------------------------------------------------ |
| Unit/Integration | Vitest 4            | globals true, environment node, coverage v8      |
| E2E              | Playwright          | chromium, baseURL localhost:3000, retries 2 (CI) |
| Coverage         | @vitest/coverage-v8 | reporters text + json-summary                    |

**vitest.setup.ts:** Importa jest-dom matchers, define BYPASS_PERMISSIONS=true para testes.

**Playwright:** testDir ./e2e, fullyParallel, webServer inicia dev server no CI (timeout 120s).

**Status atual:** 3001 testes passando, TypeScript compilation OK, ESLint OK, Next.js build OK.

---

## 9. Auditoria Recente (Resumo)

Este ciclo de auditoria corrigiu:

**Segurança:**

- SQL injection em `SET LOCAL app.current_tenant_id` → validação UUID
- `BYPASS_PERMISSIONS=true` restrito a `NODE_ENV=test`
- Revogação de access token via Redis no `jwtAuth`
- Rate limiting usando `user.sub` para autenticados (não só IP)
- Error messages genericizadas em produção (anti-info-disclosure)

**WebSocket:**

- Removido endpoint `mark_read` não funcional
- Adicionado `/api/v1/auth/ws-token` para fornecer token WS (cookie HttpOnly)

**Harmonização Frontend/Backend:**

- Path MFA: `/api/auth/mfa-verify` → `/api/mfa/verify`
- Frontend interpreta `data` em respostas paginadas (não `tickets`/`webhooks`)
- `instrumentation.ts` corrigido (removido `@vercel/otel`)
- `is_active` → `is_enabled` em firewall rules
- `JWT_ISSUER`/`JWT_AUDIENCE` alinhados entre `.env` e `docker-compose.yml`

**Database Harmony:**

- SLA dashboard: `status='down'` → `major_outage` (CHECK constraints)
- Schemas Zod alinhados com CHECK constraints (severity, status enums)
- `downtime_seconds` adicionado ao INSERT de SLA incident
- `billing_invoices` status case sensitivity
- `data_transfer_whitelist`: `notifications` → `notification_log`

**Limpeza:**

- 13 arquivos temporários de auditoria removidos
- 2 diretórios mortos (`.changeset`, `.storybook`)
- `.cursorrules` duplicado removido
- `apps/web/netlify.toml` não utilizado removido
- 3 componentes frontend não utilizados removidos
- 23 scripts de debug removidos
- `.gitignore` atualizado

---

## 10. Diferenciais Competitivos

| Diferencial       | Descrição                                                       |
| ----------------- | --------------------------------------------------------------- |
| Zero Lock-in      | PostgreSQL puro, sem Supabase, sem query builders proprietários |
| Multi-tenant Real | Schemas por tenant, RLS, sharding multi-cluster                 |
| Escalabilidade    | PgBouncer, particionamento automático, TimescaleDB              |
| Resiliência       | Circuit breaker, retry com backoff, graceful degradation        |
| Auth Própria      | Controle total JWT RS256, argon2, refresh rotation              |
| RLS Obrigatório   | Isolamento de dados no nível do banco                           |
| Cache Inteligente | Cache de responses Zabbix, cache de config                      |
| Downsampling      | 14k+ pontos → 500 sem perda visual                              |
| Sync Paralela     | 100 tenants em ~20s                                             |
| Observabilidade   | OpenTelemetry + Prometheus + Sentry + pino JSON                 |
| DX                | Turborepo + TypeScript estrito + Vitest + Playwright + Husky    |

---

## 11. Roadmap

### Engatilhado (Pronto para Ativação)

- OAuth Google (interface definida, retorna 501)
- LDAP (interface definida, retorna 501)

### Módulos Completos e Ativos

Monitoramento Zabbix, Tickets/Helpdesk, SLA e Serviços, Compliance/LGPD, Billing/Asaas, Notificações, Automação, Segurança, Discovery, Anomaly Detection, Capacity Planning, Backup, API Keys, Multi-tenancy e RBAC, Portal do Cliente, Status Page, TV/Painéis, Knowledge Base, Correlação, Drift Detection, FinOps, K8s Management, ITSM, SQL Console, Data Transfer, White Label, ChatOps, Contracts & Hour Bank, Change Management, Marketplace.

---

## 12. Conclusão

O **JLMIRROR** é uma plataforma de monitoramento multi-tenant de classe empresarial com arquitetura moderna, escalável e segura. Oferece 30+ módulos integrados, desde monitoramento Zabbix até billing Asaas, passando por compliance LGPD, anomaly detection, FinOps e muito mais.

Com zero lock-in tecnológico, multi-tenancy real no nível do banco, e observabilidade completa, o JLMIRROR está pronto para escalar de MVP para Enterprise sem refatoração arquitetural.

A plataforma é ideal para MSPs, provedores de serviços gerenciados e empresas que necessitam de visibilidade completa sobre sua infraestrutura de TI, com a flexibilidade de white-label e marketplace de integrações.

---

> **Documentação complementar:**
>
> - `docs/ARCHITECTURE.md` — Decisões arquiteturais detalhadas (ADRs)
> - `docs/SCHEMA.md` — Diagrama Mermaid do schema e relacionamentos
> - `docs/TECHNICAL-GUIDE.md` — Referência técnica detalhada por arquivo
