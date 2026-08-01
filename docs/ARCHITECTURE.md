# Arquitetura JLMIRROR

Documento que define os pilares arquiteturais do JLMIRROR — Portal de Monitoramento Multi-tenant.

---

## 1. Visão Geral

O JLMIRROR usa arquitetura separada Frontend + API Service:

- **Frontend (Next.js 15)** — Vercel ou Docker. Server Components, BFF proxy, middleware de auth.
- **API Service (Hono 4)** — Container long-running. Rotas REST, JWT auth, multi-tenant.
- **PostgreSQL 16** — Banco relacional com RLS, schemas por tenant, SECURITY DEFINER.
- **Redis 7** — Cache, revogação de tokens, circuit breaker, pub/sub.

O frontend não conhece PostgreSQL. A API não conhece React. Auth é centralizada na API.

---

## 2. Princípio DNA e Cérebro

**DNA (Código):** O mínimo viável para execução. Código que não precisa ser deletado para começar.

**Cérebro (Documentação/Guias):** A inteligência para lidar com complexidade. A complexidade não é imposta, é disponibilizada sob demanda.

---

## 3. Camada de Dados: Resiliência e Agnosticismo

### 3.1 Result Pattern

Toda operação de I/O retorna `Result<T>` — nunca throws não tratados.

```typescript
type Result<T> = { data: T; error: null } | { data: null; error: AppError };
```

Força o desenvolvedor a tratar o erro no momento da chamada, evitando telas brancas.

### 3.2 Camada de Adaptação

Componentes UI não fazem queries. Server Components usam `api-client.ts` que retorna `Result<T>`.

### 3.3 Pool Persistente + PgBouncer

A API Service usa `pg.Pool` com `max: 50` (configurável via `DB_POOL_MAX`) e `statement_timeout: 30s`. Sem restrições serverless. O pool vive pelo tempo de vida do container.

Em produção, **PgBouncer** (transaction pooling) fica entre a API e o PostgreSQL:
- API -> PgBouncer (porta 6432) com `DB_POOL_MAX=10`
- PgBouncer -> PostgreSQL com `DEFAULT_POOL_SIZE=20`, `MAX_CLIENT_CONN=200`
- Reduz conexões reais ao PG de 200 para 20, suportando 200 clientes simultâneos

---

## 4. Auth: JWT RS256 + Refresh Rotation

### 4.1 Password Hashing

`argon2` (OWASP recommended, memory-hard). Sem bcrypt, sem scrypt.

### 4.2 JWT

- Algoritmo: RS256 (RSA-2048)
- Access token TTL: 15 minutos
- Refresh token TTL: 30 dias
- Refresh rotation: a cada refresh, o token antigo é invalidado e um novo é gerado
- Revogação: `jti` do JWT é armazenado no Redis com TTL igual ao tempo restante

### 4.3 BFF Pattern

O browser nunca fala com a API diretamente. O Next.js Route Handler (`/api/proxy/[...path]`) atua como BFF:

1. Lê cookie `access_token` (HttpOnly)
2. Adiciona header `Authorization: Bearer ${token}`
3. Proxy para `${API_URL}/api/v1/${path}`
4. Se 401: tenta refresh automático (uma vez)

---

## 5. Multi-tenancy: RLS + Sharding

### 5.1 RLS (Row Level Security)

Toda tabela tem RLS habilitado. O contexto do tenant é setado via:

```sql
SET LOCAL app.current_tenant_id = 'uuid-do-tenant';
```

O middleware `tenant-context` na API executa este SET antes de cada query tenant-scoped.

### 5.2 Sharding (Multi-cluster)

O `MultiClusterRouter` gerencia connection pools para múltiplos clusters PostgreSQL:

- **Cluster 0** — Metadata global (tenants, tenant_routes, tenant_users, users)
- **Shard 1..N** — Dados por tenant (schemas `tenant_*`)

O router usa `tenant_routes` para mapear `tenant_id → connection_string`. Circuit breaker via Redis protege contra shards indisponíveis.

### 5.3 Onboarding Split (2 Fases)

1. **Fase 1 (Admin global):** Cria tenant, cria schema `tenant_${slug}`, copia template
2. **Fase 2 (Admin tenant):** Cria admin user no schema do tenant

---

## 6. Design System: Dumb Components

Componentes em `@repo/ui` são **dumb** — sem requisições HTTP internas, orientados a Props. Usam Tailwind CSS + shadcn/ui.

Sem lógica de negócio. Sem chamadas à API. Sem estado global. Apenas apresentação.

---

## 7. Segurança

### 7.1 RLS Obrigatório

Toda tabela com RLS. Sem exceção. Policies baseadas em `app.current_tenant_id`.

### 7.2 CSP

Content-Security-Policy configurada no `next.config.mjs`:

- `default-src 'self'`
- `connect-src 'self'`
- `frame-ancestors 'none'`

### 7.3 Headers de Segurança

X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

### 7.4 Variáveis de Ambiente

Validadas em build-time via `@t3-oss/env-nextjs` + Zod. Se faltar, o app não sobe.

### 7.5 ESLint com SAST

`eslint-plugin-security` ativo. Sem `eval`, sem `child_process` sem sanitização.

---

## 8. Observabilidade

### 8.1 Sentry

- Frontend: `@sentry/nextjs` (client + server)
- API: `@sentry/node` (server)

### 8.2 OpenTelemetry

- Frontend: `@vercel/otel` instrumentation
- API: OpenTelemetry SDK com traces HTTP + DB

### 8.3 Logs Estruturados

`pino` com logs JSON. Redação automática de PII (email, senha, token).

### 8.4 Prometheus Metrics

Endpoint `/api/v1/metrics` expõe métricas no formato Prometheus via `prom-client`:

- **Processo**: GC, CPU, memória, event loop (coletadas automaticamente)
- **HTTP**: `jlmirror_http_request_duration_seconds` (histogram por method/route/status)
- **Zabbix**: `jlmirror_zabbix_api_duration_seconds`, `jlmirror_zabbix_api_errors_total`
- **Pool PG**: `jlmirror_db_pool_size` (total/idle/waiting)
- **WebSocket**: `jlmirror_ws_connections`
- **Filas BullMQ**: `jlmirror_queue_jobs_active` por queue

Worker `metrics-collector` coleta métricas internas a cada 60s e escreve em `system_metrics` (TimescaleDB hypertable com compression 7d e retention 90d).

---

## 9. Validation: Zod como Fonte de Verdade

Schemas Zod em `@repo/shared-validation` são a **única fonte de verdade** para DTOs:

- Tipos TypeScript inferidos: `type LoginInput = z.infer<typeof loginInputSchema>`
- Validação em runtime: `loginInputSchema.parse(body)`
- Sem tipos manuais. Sem `any`.

---

## 10. OAuth/LDAP (Engatilhado)

### OAuth

Interface `OAuthProvider` definida em `@repo/auth/providers/oauth.interface.ts`. Route stub em `/api/v1/auth/oauth/callback` retorna 501.

Para ativar: implementar a interface, usar `arctic` library, adicionar rota de redirect.

### LDAP

Interface `LDAPProvider` definida em `@repo/auth/providers/ldap.interface.ts`. Route stub em `/api/v1/auth/ldap/bind` retorna 501.

Para ativar: implementar a interface, usar `ldapjs` library.

---

## 11. Decisões Arquiteturais (ADRs)

### ADR-001: Separação Frontend + API Service

**Contexto:** Serverless (Vercel functions) tem limite de 10s para funções stateful e não suporta pools persistentes.

**Decisão:** Separar frontend (Vercel) de API service (container long-running).

**Consequência:** Maior complexidade de deploy, mas pools persistentes, prepared statements, WebSocket, e sem cold starts na API.

### ADR-002: PostgreSQL puro sem Supabase

**Contexto:** Supabase impõe lock-in em auth, storage e realtime. Auth.users não é controlável.

**Decisão:** PostgreSQL puro com auth própria (argon2 + JWT RS256).

**Consequência:** Mais código para manter, mas controle total do schema, sem lock-in, sem custo de Supabase.

### ADR-003: Hono como API Framework

**Contexto:** Express é antigo. Fastify é rápido mas não é Web Standards. Hono é TypeScript-first, ultra-leve, Web Standards.

**Decisão:** Hono 4 com @hono/node-server.

**Consequência:** Menor ecossistema de middleware que Express, mas API mais limpa e types mais fortes.

### ADR-004: Raw pg + Zod sem Kysely

**Contexto:** Kysely adiciona uma camada de query builder e codegen. pg + Zod é mais direto.

**Decisão:** Usar `pg` (node-postgres) com queries SQL + Zod para validação de tipos.

**Consequência:** SQL escrito manualmente, mas sem codegen, sem query builder, menos dependências.

### ADR-005: BFF Pattern sem CORS

**Contexto:** Frontend em :3000 e API em :3001 causaria problemas de CORS para o browser.

**Decisão:** Next.js Route Handler proxiea chamadas cliente → API. Browser só vê :3000.

**Consequência:** Uma camada extra no frontend, mas zero CORS, cookies HttpOnly funcionam, e refresh automático no server.

### ADR-006: ioredis TCP sem Upstash REST

**Contexto:** Upstash REST é serverless-friendly mas adiciona latência e limita pub/sub.

**Decisão:** ioredis TCP direto. Container long-running suporta conexões persistentes.

**Consequência:** Não funciona em serverless puro, mas a API é container, então sem problema.

### ADR-007: jsonwebtoken sem jose

**Contexto:** `jose` é Web Crypto API. `jsonwebtoken` é Node.js crypto nativo.

**Decisão:** `jsonwebtoken` — API é Node.js container, não edge.

**Consequência:** Não funciona em edge runtime, mas a API não roda em edge.

---

## 12. Escala e Robustez

### 12.1 Cache de Responses Zabbix (Redis)

Middleware de cache para todos os GETs da API Zabbix:
- **Listagens** (hosts, graphs, items): TTL 10s
- **History/data**: TTL 5s
- **Ping**: sem cache
- Invalidação automática em mutações (POST/PUT/DELETE) via `cacheDelByPrefix`
- Elimina thundering herd quando múltiplos usuários do mesmo tenant acessam simultaneamente

### 12.2 Downsampling de History

`downsamplePoints()` reduz N pontos para máximo 500 por série usando bucketing com avg/min/max:
- Algoritmo LTTB simplificado — mantém fidelidade visual
- Aplicado em `/graphs/:graphid/data`, `/history`, `/history-batch`
- Reduz payload de 14k+ pontos para 500 sem perda visual significativa

### 12.3 Particionamento e Retention

Tabelas de alta escrita particionadas por RANGE(created_at):
- `system_logs`: retenção 6 meses
- `trace_spans`: retenção 1 mês
- `capacity_metrics`: retenção 12 meses

Worker `partition-manager` roda diariamente:
- Cria partições futuras (3 meses lookahead)
- Droppa partições antigas automaticamente (DROP TABLE CASCADE)

### 12.4 TimescaleDB

`system_metrics` como hypertable com:
- Chunk interval: 1 dia
- Compression policy: dados > 7 dias (90% redução de espaço)
- Retention policy: dados > 90 dias
- Fallback graceful se extensão não estiver disponível

### 12.5 Sync Paralelo de Tenants

`syncAllTenants` processa tenants em paralelo com `Promise.allSettled` em chunks de 10:
- 100 tenants: ~20s em vez de ~200s (serial)
- Falhas isoladas por tenant (não aborta o batch)
- Log de resumo com total processado e falhas

### 12.6 Lock de Migrations (Multi-réplica)

`pg_try_advisory_lock(42001)` antes de executar migrations:
- Se outra réplica já tem o lock, pula migrations silenciosamente
- Lock liberado no `finally` após migrar ou em erro
- Previne race condition quando múltiplas réplicas iniciam simultaneamente

### 12.7 Rate Limit por Tenant

`rateLimitTenant` (100 req/min por tenant, distribuído via Redis):
- Limita total de requests por tenant independente de quantos usuários/IPs
- Protege API Zabbix de sobrecarga por tenant
- Aplicado em todas as rotas `/api/v1/zabbix/*`

### 12.8 WebSocket Multi-réplica

Notificações via Redis Pub/Sub com `PSUBSCRIBE` (pattern matching):
- Cada instância mantém apenas conexões TCP locais
- `pushNotificationToUser` e `pushNotificationToTenant` publicam no Redis
- A instância que retém a conexão TCP entrega o frame
- Sem double delivery — toda entrega passa pelo Redis

### 12.9 Circuit Breaker Zabbix

Circuit breaker distribuído via Redis no `BlindedZabbixClient`:
- **CLOSED**: funcionamento normal
- **OPEN** (5 falhas consecutivas): rejeita chamadas imediatamente, evita timeout de 30s por request
- **HALF_OPEN** (após 30s): permite 3 chamadas de teste
- **CLOSED** (sucesso em half_open): retoma funcionamento normal
- Erros de negócio (json.error) não contam como falha de circuito
- Estado compartilhado entre réplicas via Redis

### 12.10 Health Checks

- `/health/live` — processo vivo (sem dependências)
- `/health/ready` — DB conectado (para Kubernetes readiness probe)
- `/health` — status completo (DB, Redis, queues, pubsub, Zabbix config)

---

## 13. Decisões Arquiteturais Adicionais (ADRs)

### ADR-008: PgBouncer Transaction Pooling

**Contexto:** Pool de 50 conexões da API pode saturar PostgreSQL sob alta carga com múltiplas réplicas.

**Decisão:** PgBouncer em transaction pooling entre API e PostgreSQL.

**Consequência:** 200 client connections servidas com apenas 20 server connections. Statement timeout 30s evita queries lentas.

### ADR-009: prom-client para Métricas

**Contexto:** Métricas manuais não incluem GC, event loop, CPU. Histogramas precisam de buckets configurados.

**Decisão:** `prom-client` com registry customizado + `collectDefaultMetrics`.

**Consequência:** Métricas de processo automáticas + histogramas com buckets adequados para latência HTTP e Zabbix.

### ADR-010: TimescaleDB para Métricas Internas

**Contexto:** Métricas internas do sistema (pool, memória, filas) precisam de alta frequência de escrita com query eficiente.

**Decisão:** TimescaleDB hypertable com compression e retention automáticas.

**Consequência:** Ingestão de alta frequência sem particionamento manual. Compression reduz 90% do espaço. Fallback graceful se extensão não disponível.

### ADR-011: Circuit Breaker via Redis

**Contexto:** Se Zabbix cair, toda API trava 30s por request (timeout). Cascata de falhas.

**Decisão:** Circuit breaker distribuído via Redis no BlindedZabbixClient.

**Consequência:** Após 5 falhas, circuito abre e rejeita instantaneamente. Após 30s, half-open testa recuperação. Estado compartilhado entre réplicas.
