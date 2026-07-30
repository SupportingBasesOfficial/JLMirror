# CONTRIBUTING.md — Como Contribuir

Obrigado por contribuir com o JLMIRROR! Este documento guia o processo.

---

## Pré-requisitos

- Node.js 22+ (veja `.nvmrc`)
- pnpm 9+ (`corepack enable`)
- GitHub Codespaces ou ambiente local equivalente

---

## Setup

```bash
git clone https://github.com/JLInformatica/jlmirror.git
cd jlmirror
pnpm install
```

---

## Fluxo de trabalho

### 1. Criar branch

```bash
git checkout -b feat/sua-feature
# ou: fix/seu-bug, docs/sua-doc, chore/sua-task
```

### 2. Desenvolver

- **Código em inglês** (variáveis, funções, classes, arquivos)
- **Comentários em português** (explicações de lógica)
- **Erros para usuário em português**
- **Sem `any`** — use tipos inferidos dos schemas Zod
- **Sem console.log** — use `@repo/logger`

### 3. Testar

```bash
pnpm lint          # ESLint
pnpm check-types   # TypeScript
pnpm test:run      # Vitest
pnpm build         # Next.js build
pnpm e2e           # Playwright (necessita dev server)
```

### 4. Commit

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: adiciona componente Input no @repo/ui
fix: corrige redirect do auth callback
docs: atualiza README com novo fluxo
chore: atualiza dependências
```

O `commitlint` valida a mensagem automaticamente.

### 5. PR

- Preencha o template de PR
- Garanta que todos os checks passam
- Solicite review

---

## Padrões

### Adicionar componente shadcn/ui

```bash
npx shadcn@latest add input
# Adicione o arquivo em packages/ui/src/
# Exporte em packages/ui/src/index.ts
# Adicione export em packages/ui/package.json
# Crie stories em packages/ui/src/component.stories.tsx
```

### Adicionar migration

```bash
# Crie arquivo em migrations/ com nomenclatura YYYYMMDDHHMMSS_name.sql
# Tabelas de tenant vão em tenant_template (clonado para tenant_{slug} no onboarding)
# Tabelas globais vão em public (Cluster 0)
# Habilite RLS em todas as tabelas
# Atualize docs/SCHEMA.md
# Rode: pnpm db:migrate
```

### Adicionar rota no apps/web

```bash
pnpm gen:page -- --name users
# Cria apps/web/app/users/page.tsx com template
```

---

## Estrutura do monorepo

```
apps/web/          → Next.js App Router (frontend)
apps/api/          → Hono API Service (backend)
packages/ui/       → Componentes shadcn/ui
packages/db/       → PostgreSQL pool + helpers
packages/auth/     → JWT + argon2 + refresh
packages/cache/    → Redis (ioredis TCP)
packages/shared-validation/ → Zod schemas (fonte de verdade)
packages/multi-cluster-router/ → Sharding router
packages/zabbix/   → BlindedZabbixClient
packages/logger/   → pino structured logging
packages/tailwind-config/  → CSS compartilhado
packages/typescript-config/ → tsconfigs
packages/eslint-config/    → ESLint flat config
```

---

## Não fazer

- Não commite sem `pnpm lint && pnpm check-types && pnpm test:run` passando
- Não adicione `any` em nenhum lugar
- Não misture idiomas no código (inglês) e comentários (português)
