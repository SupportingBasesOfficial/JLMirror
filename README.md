# JLMIRROR — Portal de Monitoramento Multi-tenant

> Monorepo Turborepo + Next.js 15 + Hono API + PostgreSQL + Redis.
> Arquitetura separada Frontend (Vercel) + API Service (container long-running).
> Auth 100% própria com JWT RS256, argon2, refresh rotation e revogação via Redis.

[![CI](https://github.com/JLInformatica/jlmirror/actions/workflows/ci.yml/badge.svg)](https://github.com/JLInformatica/jlmirror/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/Node-22-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9-orange.svg)](https://pnpm.io/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![Hono](https://img.shields.io/badge/Hono-4-orange.svg)](https://hono.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

---

## Stack

| Camada | Tecnologia | Papel |
|---|---|---|
| **Monorepo** | Turborepo | Orquestração com cache e paralelismo |
| **Frontend** | Next.js 15 (App Router) | SSR, Server Components, middleware de auth |
| **API** | Hono 4 + @hono/node-server | API Service em container long-running |
| **UI** | Tailwind v3 + shadcn/ui | Design system dumb components |
| **Database** | PostgreSQL 16 | SQL maduro, RLS, schemas, SECURITY DEFINER |
| **DB Driver** | pg (node-postgres) | Pool persistente, prepared statements |
| **Migrations** | node-pg-migrate | SQL migrations versionadas |
| **Cache** | Redis 7 + ioredis | Token revogação, circuit breaker, pub/sub |
| **Auth** | argon2 + jsonwebtoken (RS256) | Password hash + JWT + refresh rotation |
| **Validation** | Zod | Única fonte de verdade para DTOs e tipos |
| **Types** | TypeScript 5.9 | Tipagem end-to-end estrita, zero `any` |
| **Test** | Vitest + Playwright | Unit/integration + E2E |
| **Logger** | pino | Logs estruturados JSON |
| **Monitoring** | Sentry + OpenTelemetry | Error tracking + distributed tracing |
| **CI** | GitHub Actions | lint → types → build → test |
| **Deploy** | Vercel (frontend) + Container (API) | Auto-deploy frontend, API em cloud container |
| **Dev** | Docker Compose | PostgreSQL + Redis local (API e Web via `pnpm dev`) |
| **DX** | Husky + lint-staged + Commitlint | Pre-commit + pre-push guards |

---

## Protocolo de Boot

```bash
# 1. Instale dependências
pnpm install

# 2. Suba infra local (PostgreSQL + Redis)
pnpm docker:up

# 3. Gere chaves JWT + Zabbix e crie .env
node scripts/generate-keys.mjs
# O script cria .env automaticamente com chaves em base64

# 4. Aplique migrations
pnpm db:migrate

# 5. Crie o primeiro admin
pnpm db:seed

# 6. Rode tudo
pnpm dev
# Frontend: http://localhost:3000
# API: http://localhost:3001/api/v1/health
```

---

## Estrutura do Projeto

```
jlmirror/
├── apps/
│   ├── web/                       # Next.js 15 (frontend)
│   │   ├── app/
│   │   │   ├── (admin)/           # Rotas protegidas (dashboard)
│   │   │   ├── api/proxy/         # BFF proxy para API Service
│   │   │   ├── auth/login/        # Página de login
│   │   │   ├── layout.tsx         # Root layout
│   │   │   ├── middleware.ts      # JWT cookie check
│   │   │   └── ...
│   │   ├── lib/api-client.ts      # Server-side fetch helper
│   │   ├── env.ts                 # Env validation (t3-env + Zod)
│   │   └── ...
│   └── api/                       # Hono API Service (backend)
│       ├── src/
│       │   ├── index.ts           # Hono app + HTTP server + shutdown
│       │   ├── routes/            # auth, admin, tenants, zabbix, health
│       │   ├── middleware/        # jwt-auth, tenant-context, error-handler
│       │   └── lib/               # router-init
│       ├── Dockerfile
│       └── ...
├── packages/
│   ├── db/                        # PostgreSQL pool + Result<T> + migrate
│   ├── auth/                      # JWT + argon2 + refresh + revocation
│   ├── cache/                     # Redis (ioredis TCP)
│   ├── shared-validation/         # Zod schemas (única fonte de verdade)
│   ├── multi-cluster-router/      # Sharding router com circuit breaker
│   ├── zabbix/                    # BlindedZabbixClient
│   ├── ui/                        # shadcn/ui dumb components
│   ├── logger/                    # pino structured logging
│   ├── eslint-config/             # ESLint 9 flat config + SAST
│   ├── tailwind-config/           # Tailwind globals + config
│   └── typescript-config/         # tsconfigs base
├── migrations/                    # node-pg-migrate SQL files
├── scripts/                       # generate-keys, gen-page, gen-component
├── docker-compose.yml             # PostgreSQL 16 + Redis 7
├── docs/
│   ├── ARCHITECTURE.md            # Arquitetura + ADRs
│   └── SCHEMA.md                  # Diagrama Mermaid + tabelas
└── turbo.json
```

---

## Scripts

| Script | Descrição |
|---|---|
| `pnpm dev` | Dev server (frontend + API via turbo) |
| `pnpm build` | Build de produção |
| `pnpm lint` | ESLint em todo o monorepo |
| `pnpm check-types` | TypeScript em todo o monorepo |
| `pnpm test` | Vitest em modo watch |
| `pnpm test:run` | Vitest single run (CI) |
| `pnpm e2e` | Playwright E2E |
| `pnpm docker:up` | Sobe PostgreSQL + Redis |
| `pnpm docker:down` | Derruba containers |
| `pnpm db:migrate` | Aplica migrations |
| `pnpm db:seed` | Cria primeiro admin |
| `pnpm format` | Prettier em tudo |
| `pnpm clean` | Remove node_modules e builds |
| `pnpm gen:page` | Gera nova página Next.js |
| `pnpm gen:component` | Gera novo componente UI |

---

## Princípios

1. **Frontend não conhece PostgreSQL** — apenas fala com a API via HTTP
2. **API não conhece React** — apenas recebe e retorna JSON
3. **Auth centralizada na API** — JWT assinado, refresh rotacionado, revogação no Redis
4. **BFF pattern** — Next.js Route Handler proxiea chamadas cliente → API
5. **Zod como única fonte de verdade** — Tipos inferidos de schemas, sem tipos manuais
6. **Schema-per-tenant** — Cada tenant tem schema próprio (`tenant_{slug}`) clonado de `tenant_template`
7. **RLS obrigatório** — Toda tabela com Row Level Security, sem exceção
8. **Migrations versionadas** — Toda mudança de schema via `migrations/`
9. **Zero `any`** — TypeScript estrito com tipos inferidos de Zod
10. **Packages** — Código compartilhado vive em `packages/`, nunca duplicado em `apps/`
11. **Env seguro** — Variáveis validadas no build. Se faltar, o app não sobe

---

## Documentação

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Arquitetura + ADRs + guias
- [`docs/SCHEMA.md`](./docs/SCHEMA.md) — Banco de dados + diagrama Mermaid
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Como contribuir
- [`SECURITY.md`](./SECURITY.md) — Política de segurança
- [`.env.example`](./.env.example) — Variáveis de ambiente necessárias

---

## License

MIT © JL Informatica
