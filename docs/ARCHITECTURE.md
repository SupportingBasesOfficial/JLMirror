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

### 3.3 Pool Persistente

A API Service usa `pg.Pool` com `max: 20` e `prepare: true`. Sem restrições serverless. O pool vive pelo tempo de vida do container.

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
