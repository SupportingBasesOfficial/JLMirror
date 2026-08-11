# Governança de Código — JLMIRROR

> Documento obrigatório para todo desenvolvedor que trabalha no JLMIRROR.
> Define as camadas de proteção e quem é o juiz supremo.

---

## Princípio Fundamental

**Hooks locais são deterrente. CI é o juiz supremo.**

Nenhum guardrail que roda na máquina do dev é confiável. Husky, lint-staged, `.zero-error` hooks — tudo é bypassável com `git commit --no-verify`, editando `.husky/`, ou deletando `.zero-error/`. **O único juiz que não tem bypass é o servidor** (GitHub branch protection + CI required checks).

---

## Camadas de Proteção (Defesa em Profundidade)

```
[1] Editor (LSP/ESLint inline)     → avisa, mas não impede
[2] Husky pre-commit (lint+types)  → trava local     ← bypassável: --no-verify
[3] Husky pre-push (test:run)      → trava local     ← bypassável: --no-verify
[4] Branch Protection (GitHub)     → IMPOSSÍVEL bypassar  ← O JUIZ SUPREMO
[5] CI Workflow (ci.yml)           → falha = não mergeia
[6] Zero-Error Workflow            → 14 validators + integrity
[7] CODEOWNERS review              → humano aprova
[8] CD + health gates              → deploy só após tudo passar
[9] Runtime (RLS, RBAC, Zod)       → última linha de defesa
```

- **Camadas [1]-[3]:** Deterrente. Travam o dev honesto e o preguiçoso. Não travam o mal-intencionado.
- **Camadas [4]-[9]:** Impositivas. Travam até o mal-intencionado. Não tem bypass.

---

## Branch Protection (Pendente — requer GitHub Pro)

> **Status:** O comando para ativar branch protection está pronto em `.zero-error/BRANCH-PROTECTION.md`,
> mas o repositório é privado e o GitHub exige plano Pro para habilitar branch protection em repos privados.
>
> **Para ativar:** Faça upgrade para GitHub Pro OU torne o repositório público.
> Depois execute:
>
> ```bash
> gh api repos/SupportingBasesOfficial/JLMirror/branches/main/protection --method PUT --input .devin_branch_protection.json
> ```
>
> **Configuração desejada:**
>
> | Regra                             | Valor                              | Efeito                                         |
> | --------------------------------- | ---------------------------------- | ---------------------------------------------- |
> | `required_status_checks.strict`   | `true`                             | Branch precisa estar atualizada antes do merge |
> | `required_status_checks.contexts` | `CI`, `AI Black Box v2 Validation` | Ambos os workflows devem passar                |
> | `enforce_admins`                  | `true`                             | Admin também é travado — sem bypass            |
> | `required_pull_request_reviews`   | 1 review obrigatório               | Ninguém mergeia sem review                     |
> | `required_linear_history`         | `true`                             | Proíbe merge commits sujos                     |
> | `allow_force_pushes`              | `false`                            | Proíbe force push                              |
> | `allow_deletions`                 | `false`                            | Proíbe deletar a branch                        |
>
> **Sem branch protection, o CI é deterrente, não impositivo.** Push direto na main ainda é possível.
> Tudo o mais neste documento já está ativo e funcional.

---

## CODEOWNERS

O arquivo `.github/CODEOWNERS` define quem é dono de cada área. Mudanças em áreas críticas exigem review explícito do owner:

- `/apps/api/src/routes/` — rotas da API
- `/apps/api/src/middleware/` — middlewares
- `/apps/api/src/lib/` — bibliotecas
- `/migrations/` — migrations do banco
- `/packages/` — packages compartilhados
- `/.zero-error/` — framework de validação
- `/.github/` — CI/CD
- `/.husky/` — git hooks
- `/docs/` — documentação

---

## Hooks Locais (Deterrente)

### pre-commit

```sh
pnpm lint-staged    # ESLint --max-warnings 0 + Prettier
pnpm check-types    # tsc --noEmit
```

### pre-push

```sh
pnpm test:run       # Vitest (3001 testes)
```

### commit-msg

```sh
pnpm commitlint     # Conventional commits
```

**Bypass:** `git commit --no-verify` pula todos os hooks. Mas o CI vai pegar.

---

## CI Workflows

### ci.yml (Workflow CI)

1. **Lint** — `pnpm lint` (ESLint com `--max-warnings 0`)
2. **Check Types** — `pnpm check-types` (tsc --noEmit com `noUncheckedIndexedAccess`)
3. **Test** — `pnpm test:run` (Vitest, 3001+ testes)
4. **Build** — `pnpm build` (Turborepo)
5. **Docker Build** — Build images API e Web
6. **E2E Tests** — Playwright com PostgreSQL + Redis services
7. **Security Audit** — pnpm audit, Snyk SAST, Trivy, SonarCloud

### zero-error.yml (AI Black Box v2)

14 validators em CI mode ("supreme judge"):

- type-check, lint, doctrine-check, test
- security-scan, contract-check, anchor-check, tech-debt-check
- **architecture-contract** (verifica que rotas tem jwtAuth+tenantContext, migrations tem RLS)
- property-tests, impact-analysis, schema-sync-check, api-compat-check
- perf-budget-check, mutation-test

---

## Regras ESLint (Error, não Warn)

| Regra                                | Nível   | Por que                                |
| ------------------------------------ | ------- | -------------------------------------- |
| `@typescript-eslint/no-explicit-any` | `error` | Perde tipagem, esconde bugs            |
| `@typescript-eslint/no-unused-vars`  | `error` | Código morto                           |
| `no-console`                         | `warn`  | Permite `console.warn`/`console.error` |

**Não há override `off` em next.js ou node.js.** A regra vale para todo o monorepo.

---

## TypeScript Estrito

| Flag                       | Valor  | Efeito                            |
| -------------------------- | ------ | --------------------------------- |
| `strict`                   | `true` | Modo estrito completo             |
| `noImplicitAny`            | `true` | Proíbe `any` implícito            |
| `strictNullChecks`         | `true` | `null`/`undefined` são distintos  |
| `noUncheckedIndexedAccess` | `true` | `arr[0]` retorna `T \| undefined` |

---

## Dependabot

Mantém dependências atualizadas automaticamente:

- Schedule: semanal (segunda-feira)
- Agrupa minor/patch para não floodar PRs
- Limite: 5 PRs abertos por área
- **Não auto-merge** — precisa passar CI + zero-error + review

---

## O que NÃO é travado (para não criar fricção)

- ❌ `console.warn` / `console.error` — são úteis
- ❌ 100% coverage de testes — irreal, trava dev
- ❌ WIP commits — dev precisa commitar trabalho em progresso
- ❌ `noUnusedLocals` / `noUnusedParameters` — gera muito ruído

---

## Mudanças em Áreas Críticas

Toda mudança em `.zero-error/`, `.github/`, `.husky/`, `migrations/` exige:

1. **Code owner review obrigatório** (CODEOWNERS)
2. **CI + zero-error passando** (branch protection)
3. **PR com descrição clara** do porquê da mudança

Ninguém — nem admin — pode push direto na `main` sem passar por essas camadas.

---

## Runtime Guards (Última Linha)

Mesmo que código passe no CI, o runtime ainda protege:

| Guard                         | O que faz                                |
| ----------------------------- | ---------------------------------------- |
| RLS (PostgreSQL)              | Isola dados por tenant no nível do banco |
| RBAC (requirePermission)      | Verifica permissão por endpoint          |
| Feature Flags (requireModule) | Bloqueia módulos desativados             |
| Zod (validate)                | Valida input de toda request             |
| Circuit Breaker               | Protege contra cascata de falhas         |
| Rate Limiting                 | Previne abuso por IP/user                |
| JWT + Revogação               | Auth com verificação no Redis            |
