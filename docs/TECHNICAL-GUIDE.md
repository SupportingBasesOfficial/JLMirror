# Documentação Técnica Unificada — JLMIRROR

> Referência técnica completa para desenvolvedores frontend e backend.
> Gerada a partir de análise direta do código-fonte.

---

## 1. Arquitetura Geral

### 1.1 Stack

| Camada      | Tecnologia                 | Versão |
| ----------- | -------------------------- | ------ |
| Frontend    | Next.js (App Router)       | 15     |
| API         | Hono                       | 4      |
| Banco       | PostgreSQL                 | 16     |
| Cache/Filas | Redis                      | 7      |
| Auth        | JWT RS256 + argon2         | —      |
| Validação   | Zod                        | —      |
| ORM         | pg (node-postgres) raw SQL | —      |
| Metrics     | prom-client (Prometheus)   | —      |
| Tracing     | OpenTelemetry              | —      |
| Errors      | Sentry                     | —      |
| Logs        | pino (JSON estruturado)    | —      |
| UI          | Tailwind CSS + shadcn/ui   | —      |
| WebSocket   | ws + Redis Pub/Sub         | —      |
| Filas       | BullMQ                     | —      |

### 1.2 Monorepo

Estrutura de packages e apps:

```
JLMIRROR/
├── apps/
│   ├── api/          → @jlmirror/api (Hono 4, porta 3001)
│   └── web/          → @jlmirror/web (Next.js 15, porta 3000)
├── packages/
│   ├── auth/         → @repo/auth (JWT RS256, argon2, permissões)
│   ├── cache/        → @repo/cache (Redis ioredis, pub/sub)
│   ├── db/           → @repo/db (pg.Pool, Result<T>, migrations)
│   ├── eslint-config/→ @repo/eslint-config
│   ├── logger/       → @repo/logger (pino)
│   ├── secrets/      → @repo/secrets (registry com rotação)
│   ├── shared-validation/ → @repo/shared-validation (Zod schemas)
│   ├── tailwind-config/ → @repo/tailwind-config
│   ├── telemetry/    → @repo/telemetry (OpenTelemetry)
│   ├── typescript-config/ → @repo/typescript-config
│   ├── ui/           → @repo/ui (componentes dumb, shadcn/ui)
│   └── zabbix/       → @repo/zabbix (BlindedZabbixClient, circuit breaker)
```

### 1.3 BFF Pattern (Backend-for-Frontend)

O browser **nunca** fala com a API diretamente. Tudo passa por Next.js:

#### Proxy Catch-All (`apps/web/app/api/[...path]/route.ts`)

```
Browser → POST /api/zabbix/devices
           ↓
  Next.js Route Handler (catch-all)
           ↓
  Insere "v1/" se não existir: /api/v1/zabbix/devices
           ↓
  Lê cookie access_token → header Authorization: Bearer <token>
           ↓
  fetch(http://localhost:3001/api/v1/zabbix/devices)
           ↓
  Strip set-cookie do backend (backend não seta cookies)
           ↓
  Retorna JSON + headers para o browser
```

**Comportamento do proxy:**

- Se `access_token` ausente mas `refresh_token` existe → chama `tryRefreshToken()` antes da request
- Se resposta for `401` e tem `refresh_token` → renova e refaz request (GET/DELETE)
- Para POST/PUT com 401 → retorna `TOKEN_REFRESHED` para o client refazer
- Repassa `x-forwarded-for` e `user-agent` para rate limiting da API
- `strip` de `set-cookie`, `content-encoding`, `content-length` do backend

#### Rotas Dedicadas de Auth (não passam pelo catch-all)

| Rota Next.js                | Backend                    | Função                         |
| --------------------------- | -------------------------- | ------------------------------ |
| `POST /api/auth/login`      | `POST /api/v1/auth/login`  | Login + setar cookies          |
| `POST /api/auth/logout`     | `POST /api/v1/auth/revoke` | Revogar + deletar cookies      |
| `POST /api/auth/mfa-verify` | `POST /api/v1/mfa/verify`  | Verificar TOTP + setar cookies |

Estas rotas são dedicadas porque precisam **setar cookies httpOnly** na resposta — o proxy catch-all faz strip de `set-cookie` do backend.

### 1.4 Middlewares Globais (API)

Ordem exata de execução em `apps/api/src/index.ts:151-161`:

```
1. securityHeaders     → X-Frame-Options, X-Content-Type-Options, etc.
2. corsMiddleware      → CORS headers
3. compressionMiddleware → gzip/deflate
4. requestLogger       → pino HTTP log
5. errorHandler        → catch de erros não tratados
6. tracingMiddleware() → OpenTelemetry span por request
7. logIngestionMiddleware → ingest de logs de aplicação
8. bodySizeLimit()     → rejeita bodies muito grandes
9. requestTimeout(30_000) → 30s máximo por request
10. rateLimitApi       → rate limit global
```

Adicional: `rateLimitAuth` aplicado em `/api/v1/auth/*` (limites mais restritos).

### 1.5 Middlewares de Autenticação e Isolamento

Aplicados em **protectedPaths** (lista de rotas protegidas):

```typescript
// apps/api/src/index.ts:172-218
const protectedPaths = [
  "/api/v1/devices",
  "/api/v1/mfa",
  "/api/v1/audit",
  "/api/v1/rbac",
  "/api/v1/users",
  "/api/v1/logs",
  "/api/v1/traces",
  "/api/v1/scripts",
  "/api/v1/executions",
  "/api/v1/firewall",
  "/api/v1/k8s",
  "/api/v1/ssl",
  "/api/v1/backups",
  "/api/v1/notifications",
  "/api/v1/assets",
  "/api/v1/capacity",
  "/api/v1/compliance",
  "/api/v1/tickets",
  "/api/v1/kb",
  "/api/v1/system-health",
  "/api/v1/api-keys",
  "/api/v1/webhooks",
  "/api/v1/tasks",
  "/api/v1/data-transfer",
  "/api/v1/feature-flags",
  "/api/v1/profile",
  "/api/v1/settings",
  "/api/v1/dashboard/executive",
  "/api/v1/reports",
  "/api/v1/changes",
  "/api/v1/admin",
  "/api/v1/dashboard",
  "/api/v1/dashboard/overview",
  "/api/v1/sla",
  "/api/v1/apm",
  "/api/v1/client-portal",
];

for (const p of protectedPaths) {
  app.use(p, jwtAuth); // Verifica JWT RS256
  app.use(p, tenantContext); // SET LOCAL app.current_tenant_id
  app.use(p, auditMiddleware); // Log de auditoria
  app.use(p + "/*", jwtAuth);
  app.use(p + "/*", tenantContext);
  app.use(p + "/*", auditMiddleware);
}
```

**⚠️ NOTA:** `/api/v1/drift` NÃO está em `protectedPaths` — não recebe `jwtAuth` + `tenantContext` + `auditMiddleware` globais. Possível brecha de segurança.

### 1.6 Feature Flag Gating (requireModule)

30+ módulos são protegidos por feature flags. Se a flag estiver desligada, o módulo retorna `403`:

```typescript
// Exemplo do padrão:
app.use("/api/v1/devices/*", requireModule("module_devices"));
app.route("/api/v1/devices", devicesRoute);

app.use("/api/v1/logs/*", requireModule("module_logs"));
app.route("/api/v1/logs", logsRoute);
// ... 30+ módulos no mesmo padrão
```

Módulos **sem** requireModule (sempre ativos): `zabbix`, `mfa`, `rbac`, `users`, `feature-flags`, `profile`, `settings`, `dashboard`, `ws`.

### 1.7 Permissões (requirePermission)

Middleware que verifica permissões do usuário via RPC no PostgreSQL:

```typescript
// apps/api/src/middleware/require-permission.ts
// Busca permissões via: SELECT * FROM public.get_user_permissions($1)
// Cache via getPermissionChecker() com fetcher do DB
// Retorna 403 FORBIDDEN se não tiver a permissão
```

Uso típico: `requirePermission("tickets:write")`, `requirePermission("admin:tenants:read")`, etc.

### 1.8 Workers em Background

Iniciados no `bootstrap()` após o servidor HTTP:

| Worker                   | Arquivo                     | Função                                         |
| ------------------------ | --------------------------- | ---------------------------------------------- |
| `startTaskScheduler`     | `lib/task-scheduler.ts`     | Executa scheduled tasks (cron) via BullMQ      |
| `startAlertingEngine`    | `lib/alerting-engine.ts`    | Avalia regras de alerta e dispara notificações |
| `startDeviceSync`        | `lib/device-sync.ts`        | Sincroniza dispositivos com Zabbix em paralelo |
| `startPartitionManager`  | `lib/partition-manager.ts`  | Cria/dropa partições de tabelas (diário)       |
| `startCorrelationEngine` | `lib/correlation-engine.ts` | Correlaciona eventos de saúde                  |
| `startMetricsCollector`  | `lib/metrics-collector.ts`  | Coleta métricas internas a cada 60s            |

### 1.9 WebSocket

```
Cliente → ws://localhost:3001/ws?token=<access_token>
              ↓
  Valida token JWT (query param)
              ↓
  Registra conexão em localConnections (Map<key, Set<ws>>)
  onde key = userId ou tenantId
              ↓
  Redis Pub/Sub: PSUBSCRIBE para receber notificações
  de outras instâncias (multi-réplica)
```

- `pushNotificationToUser(userId, payload)` → publica no Redis
- `pushNotificationToTenant(tenantId, payload)` → publica no Redis
- A instância que retém a conexão TCP entrega o frame
- Sem double delivery — toda entrega passa pelo Redis
- Endpoint de health: `GET /ws/health` → `{ status: "ok" }`

### 1.10 Observabilidade

| Sistema       | Escopo         | Detalhe                                                                                                        |
| ------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| Sentry        | Frontend + API | `@sentry/nextjs` (client+server) + `@sentry/node` (API). Captura exceções não tratadas com contexto HTTP.      |
| OpenTelemetry | Frontend + API | `@vercel/otel` no frontend. SDK customizado na API com traces HTTP + DB.                                       |
| pino          | API            | Logs JSON estruturados. Redação automática de PII (email, senha, token).                                       |
| Prometheus    | API            | Endpoint `/api/v1/metrics` (text/plain). Métricas: HTTP duration, Zabbix API, pool PG, WS connections, BullMQ. |
| TimescaleDB   | API            | `system_metrics` hypertable. Compression 7d, retention 90d. Fallback graceful.                                 |

### 1.11 Startup Sequence

```
bootstrap()
  1. validateEnv()           → valida variáveis com Zod
  2. waitForDatabase()       → aguarda PostgreSQL estar acessível
  3. setupGracefulShutdown() → SIGTERM/SIGINT handlers
  4. serve({ port: 3001 })   → inicia Hono HTTP server
  5. setupWebSocket(server)  → hook WS no server HTTP
  6. startTaskScheduler()    → workers BullMQ
  7. startAlertingEngine()
  8. startDeviceSync()
  9. startPartitionManager()
  10. startCorrelationEngine()
  11. startMetricsCollector()
```

### 1.12 Decodificação de Chaves JWT

As chaves RSA são armazenadas em base64 no `.env` (porque `.env` não suporta multi-line):

```typescript
// apps/api/src/index.ts:108-118
function decodeBase64Key(encoded: string | undefined): string | undefined {
  if (!encoded) return undefined;
  if (encoded.includes("BEGIN ")) return encoded; // já é PEM
  return Buffer.from(encoded, "base64").toString("utf-8");
}
process.env.JWT_PRIVATE_KEY = decodeBase64Key(process.env.JWT_PRIVATE_KEY);
process.env.JWT_PUBLIC_KEY = decodeBase64Key(process.env.JWT_PUBLIC_KEY);
```

---

## 2. Fluxo de Autenticação

### 2.1 Visão Geral

O sistema usa **JWT RS256** com **access token** (15min) + **refresh token** (30d). Tokens são armazenados em **cookies httpOnly** setados pelo Next.js (não pelo backend). O backend retorna tokens no JSON body; a rota Next.js extrai e seta como cookies.

```
┌─────────┐     POST /api/auth/login      ┌──────────┐     POST /api/v1/auth/login     ┌─────────┐
│ Browser │ ──────────────────────────→   │ Next.js  │ ────────────────────────────→   │  API    │
│         │   { email, password,          │ Route    │   { email, password,            │ Hono    │
│         │     device_fingerprint,       │ Handler  │     device_fingerprint,         │         │
│         │     device_label }            │          │     device_label }              │         │
│         │                               │          │                                 │         │
│         │                               │          │   ← { access_token,             │         │
│         │                               │          │       refresh_token,            │         │
│         │                               │          │       user, scope, tenants }    │         │
│         │   ← Set-Cookie: access_token  │          │                                 │         │
│         │     Set-Cookie: refresh_token │          │                                 │         │
│         │     { user, tenants,          │          │                                 │         │
│         │       must_change_password }  │          │                                 │         │
└─────────┘                               └──────────┘                                 └─────────┘
```

### 2.2 Login — Dados Enviados pelo Frontend

**Rota Next.js:** `POST /api/auth/login` (`apps/web/app/api/auth/login/route.ts`)
**Rota Backend:** `POST /api/v1/auth/login` (`apps/api/src/routes/auth.ts:30`)

Body JSON enviado pelo browser:

```json
{
  "email": "admin@jlmirror.com",
  "password": "admin123",
  "device_fingerprint": "a1b2c3d4e5f6...",
  "device_label": "Chrome on Windows"
}
```

Validação Zod (`loginInputSchema`):

| Campo                | Tipo   | Obrigatório | Regras                |
| -------------------- | ------ | ----------- | --------------------- |
| `email`              | string | ✅          | Deve ser email válido |
| `password`           | string | ✅          | Mínimo 1 caractere    |
| `device_fingerprint` | string | ❌          | —                     |
| `device_label`       | string | ❌          | —                     |

### 2.3 Login — Processamento no Backend

```
1. Valida body com loginInputSchema (Zod)
   → Se inválido: 400 VALIDATION_ERROR

2. Busca usuário: SELECT * FROM public.users WHERE email = $1
   → Se não existe: 401 INVALID_CREDENTIALS

3. Verifica is_active
   → Se inativo: 403 USER_INACTIVE

4. Verifica senha: argon2.verify(user.password_hash, body.password)
   → Se errada: 401 INVALID_CREDENTIALS

5. Busca tenants: SELECT * FROM public.get_tenant_user_auth($1)
   → Retorna: (tenant_id, role, scope)
   → Se vazio: 403 NO_TENANT_ACCESS

6. Deriva roles = tenants.map(t => t.role)
   Deriva primaryTenantId = tenants[0].tenant_id
   Deriva userScope = tenants[0].scope ?? "tenant"
   Deriva tenantIds = tenants.map(t => t.tenant_id)

7. Verifica MFA: SELECT is_enabled FROM public.user_mfa_totp WHERE user_id = $1
   → Se habilitado: retorna MFA challenge (passo 8a)
   → Se não: gera tokens JWT (passo 8b)

8a. MFA Challenge:
   - Gera challenge_token = crypto.randomUUID()
   - Expira em 5 minutos
   - INSERT INTO public.mfa_challenges (user_id, method, challenge_token, expires_at)
   - Retorna: { mfa_required: true, mfa_method: "totp", challenge_token, user: { id, email, full_name } }

8b. Gera tokens JWT:
   - signAccessToken({ sub, tenant_id, roles, scope, tenant_ids })
   - signRefreshToken({ sub, tenant_id, roles, scope, tenant_ids })
   - verifyToken(refreshToken) → extrai jti
   - storeRefreshJti(jti) → armazena no Redis com TTL

9. Cria sessão no PostgreSQL:
   - Hash do refresh_token (SHA-256) antes de armazenar
   - INSERT INTO public.sessions (user_id, refresh_token_hash, expires_at, device_fingerprint, ip_address, user_agent)
   - Expira em 30 dias

10. Registra/atualiza dispositivo confiável (se device_fingerprint presente):
    - INSERT INTO public.trusted_devices ... ON CONFLICT DO UPDATE

11. Retorna JSON:
```

### 2.4 Login — Resposta de Sucesso (sem MFA)

Backend retorna para a rota Next.js:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@jlmirror.com",
    "full_name": "Admin",
    "is_active": true,
    "must_change_password": false
  },
  "scope": "global",
  "tenants": [
    {
      "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
      "role": "global:admin",
      "scope": "global"
    }
  ]
}
```

Rota Next.js seta cookies e retorna para o browser:

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@jlmirror.com",
    "full_name": "Admin",
    "is_active": true,
    "must_change_password": false
  },
  "tenants": [
    {
      "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
      "role": "global:admin",
      "scope": "global"
    }
  ],
  "must_change_password": false
}
```

Cookies setados:

| Cookie          | Valor       | httpOnly | secure    | sameSite | path | maxAge        |
| --------------- | ----------- | -------- | --------- | -------- | ---- | ------------- |
| `access_token`  | JWT access  | ✅       | prod only | lax      | /    | 900 (15min)   |
| `refresh_token` | JWT refresh | ✅       | prod only | lax      | /    | 2592000 (30d) |

**⚠️ BUG CONHECIDO:** A rota Next.js (`apps/web/app/api/auth/login/route.ts:50-54`) **não inclui `scope`** no JSON retornado para o browser. O frontend lê `data.scope` para decidir redirecionamento (`/admin` vs `/dashboard`), mas sempre recebe `undefined` → sempre redireciona para `/dashboard`.

### 2.5 Login — Resposta de Erro

| Cenário               | HTTP | Body                                                                                                    |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| Credenciais inválidas | 401  | `{ error: { code: "INVALID_CREDENTIALS", message: "Email ou senha inválidos" } }`                       |
| Usuário inativo       | 403  | `{ error: { code: "USER_INACTIVE", message: "Usuário inativo" } }`                                      |
| Sem tenant            | 403  | `{ error: { code: "NO_TENANT_ACCESS", message: "Usuário não possui acesso a nenhum tenant" } }`         |
| Validação Zod         | 400  | `{ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }`                                   |
| Backend offline       | 502  | `{ error: { code: "SERVER_ERROR", message: "Não foi possível conectar ao servidor de autenticação" } }` |
| Erro interno          | 500  | `{ error: { code: "INTERNAL_ERROR", message: "..." } }`                                                 |

### 2.6 MFA Challenge — Fluxo Completo

```
Login (senha OK + MFA habilitado)
  → { mfa_required: true, challenge_token: "uuid", user: { id, email, full_name } }

Frontend mostra form de código TOTP
  → POST /api/auth/mfa-verify
  → Body: { challenge_token: "uuid", code: "123456" }
  → Rota Next.js repassa para POST /api/v1/mfa/verify

Backend (apps/api/src/routes/mfa.ts:147):
  1. Valida mfaVerifySchema: { challenge_token: string min 1, code: string min 6 max 6 }
  2. Busca challenge no DB: SELECT * FROM public.mfa_challenges WHERE challenge_token = $1
  3. Verifica se não expirou (5 min)
  4. Busca secret TOTP: SELECT secret FROM public.user_mfa_totp WHERE user_id = $1
  5. Verifica código: verifyTotpCode(code, secret)
     → Se falha: tenta verifyRecoveryCode(code, recoveryCodes)
     → Se ambos falham: 401 INVALID_CODE
  6. Gera access_token + refresh_token (mesmo fluxo do login)
  7. Marca challenge como verificado
  8. Retorna: { access_token, refresh_token, user, scope, tenants }

Rota Next.js seta cookies (mesmo padrão do login)
  → Retorna: { user, tenants, must_change_password }
  → ⚠️ Mesmo bug: não inclui `scope`
```

### 2.7 Estrutura do JWT (RS256)

Payload do token (`packages/auth/src/index.ts`):

```typescript
{
  sub: "550e8400-e29b-41d4-a716-446655440000",  // user_id
  tenant_id: "660e8400-e29b-41d4-a716-446655440000",  // tenant primário
  roles: ["global:admin"],  // roles em todos os tenants
  scope: "global",  // "global" | "tenant"
  tenant_ids: ["660e8400-...", "770e8400-..."],  // todos os tenants do usuário
  type: "access",  // "access" | "refresh"
  jti: "unique-token-id",  // para revogação no Redis
  iat: 1722632400,  // issued at
  exp: 1722633300,  // expiration (15min para access, 30d para refresh)
  iss: "jlmirror-api",  // issuer
  aud: "jlmirror-web"   // audience
}
```

- **Algoritmo:** RS256 (RSA-2048)
- **Chave privada:** `JWT_PRIVATE_KEY` (base64 → PEM, decodificada no startup)
- **Chave pública:** `JWT_PUBLIC_KEY` (base64 → PEM)
- **Access token TTL:** 15 minutos (900s)
- **Refresh token TTL:** 30 dias (2592000s)
- **Revogação:** `jti` do refresh token armazenado no Redis com TTL igual ao tempo restante

### 2.8 Validação do JWT no Backend (`apps/api/src/middleware/jwt-auth.ts`)

```
1. Extrai Bearer token do header Authorization
2. verifyToken(token) com chave pública RSA
   → Se inválido: 401 INVALID_TOKEN
3. Verifica type === "access"
   → Se não: 401 INVALID_TOKEN_TYPE
4. Seta user no contexto Hono:
   c.set("user", {
     sub,           // user_id
     tenant_id,     // tenant primário
     roles,         // array de roles
     scope,         // "global" | "tenant" (fallback "tenant" se undefined)
     tenantIds      // array de tenant_ids
   })
```

### 2.9 Isolamento de Tenant (`apps/api/src/middleware/tenant-context.ts`)

```
1. Extrai tenant_id do JWT (c.get("user").tenant_id)
2. runWithTenant(tenant_id) → AsyncLocalStorage
3. Dentro do contexto:
   - Antes de cada query: SET LOCAL app.current_tenant_id = 'uuid'
   - PostgreSQL RLS filtra automaticamente por tenant
4. Queries em public.* (tabelas globais) não são filtradas
```

### 2.10 Refresh Token — Renovação Automática

O proxy Next.js faz auto-refresh transparente:

#### Cenário 1: Request sem access_token (expirou)

```
Browser → GET /api/zabbix/devices (cookie access_token expirado)
  ↓
Proxy lê cookie access_token → ausente ou vazio
  ↓
Proxy lê cookie refresh_token → presente
  ↓
tryRefreshToken():
  POST http://localhost:3001/api/v1/auth/refresh
  Body: { refresh_token: <valor_do_cookie> }
  ↓
Backend valida refresh token, verifica jti no Redis
  → Retorna: { access_token: "novo_jwt", refresh_token: "novo_refresh" }
  ↓
Proxy usa novo access_token para a request original
  ↓
Proxy seta novo cookie access_token na resposta
```

#### Cenário 2: Request retorna 401

```
Browser → GET /api/zabbix/devices
  ↓
Proxy faz request com access_token atual
  ↓
Backend retorna 401 (token expirado ou inválido)
  ↓
Proxy verifica se tem refresh_token
  ↓
tryRefreshToken() → obtém novo access_token
  ↓
Para GET/DELETE: refaz request com novo token
Para POST/PUT: retorna 401 + header X-Token-Refreshed: true
  → Client refaz a request (cookie já atualizado)
  ↓
Proxy seta novo cookie access_token na resposta
```

### 2.11 Endpoint de Refresh (`POST /api/v1/auth/refresh`)

**Parâmetros:** Body `{ refresh_token: string }` — validado por `refreshTokenSchema`

**Processamento:**

1. Verifica assinatura RS256 do refresh token
2. Verifica `type === "refresh"`
3. Verifica se `jti` está no Redis (não revogado)
4. Gera novo access_token + novo refresh_token (rotation)
5. Revoga jti antigo, armazena novo jti
6. Atualiza sessão no PostgreSQL

**Sucesso:** `200` → `{ access_token, refresh_token }`

**Erros:**

| Cenário        | HTTP | Code                 |
| -------------- | ---- | -------------------- |
| Token inválido | 401  | `INVALID_TOKEN`      |
| Token revogado | 401  | `TOKEN_REVOKED`      |
| Tipo errado    | 401  | `INVALID_TOKEN_TYPE` |

### 2.12 Logout

**Rota Next.js:** `POST /api/auth/logout` (`apps/web/app/api/auth/logout/route.ts`)

```
1. Lê cookie refresh_token
2. POST http://localhost:3001/api/v1/auth/revoke
   Body: { refresh_token: <valor> }
   → Backend revoga jti no Redis
   → Erros de revogação são ignorados (cookies serão limpos independente)
3. Deleta cookie access_token
4. Deleta cookie refresh_token
5. Retorna: { revoked: true }
```

### 2.13 Change Password (`POST /api/v1/auth/change-password`)

**Auth:** Requer JWT (jwtAuth)

**Parâmetros:** Body validado por `changePasswordSchema`:

| Campo              | Tipo   | Obrigatório | Regras             |
| ------------------ | ------ | ----------- | ------------------ |
| `current_password` | string | ✅          | Mínimo 1 char      |
| `new_password`     | string | ✅          | **Mínimo 8 chars** |

**Processamento:**

1. Verifica `current_password` com argon2
2. Hash da nova senha com argon2
3. Atualiza `password_hash` em `public.users`
4. Marca `must_change_password = false`
5. Registra em `user_security_log`

### 2.14 Sessões e Dispositivos

| Endpoint                           | Método | Função                                                                                   |
| ---------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `/api/v1/auth/sessions`            | GET    | Lista sessões ativas (id, device_fingerprint, ip, user_agent, last_activity, expires_at) |
| `/api/v1/auth/sessions/:sessionId` | DELETE | Revoga sessão específica                                                                 |
| `/api/v1/auth/sessions`            | DELETE | Revoga todas as sessões                                                                  |
| `/api/v1/auth/devices`             | GET    | Lista dispositivos confiáveis (id, fingerprint, label, ip, user_agent, last_seen)        |
| `/api/v1/auth/devices/:deviceId`   | DELETE | Remove dispositivo confiável                                                             |

### 2.15 Endpoint `/auth/me` (`GET /api/v1/auth/me`)

Retorna dados do usuário logado + tenants. Usado pelo frontend para:

- Determinar `scope` (global vs tenant) → qual sidebar renderizar
- Listar tenants acessíveis
- Verificar `must_change_password`

**Resposta:**

```json
{
  "user": {
    "id": "uuid",
    "email": "admin@jlmirror.com",
    "full_name": "Admin",
    "is_active": true,
    "must_change_password": false
  },
  "scope": "global",
  "tenants": [
    { "tenant_id": "uuid", "role": "global:admin", "scope": "global" }
  ]
}
```

### 2.16 Função DB: `get_tenant_user_auth`

```sql
CREATE OR REPLACE FUNCTION public.get_tenant_user_auth(p_user_id uuid)
RETURNS TABLE(tenant_id uuid, role character varying, scope character varying)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT tu.tenant_id, tu.role::VARCHAR,
    CASE WHEN tu.role LIKE 'global:%' THEN 'global' ELSE 'tenant' END AS scope
  FROM public.tenant_users tu
  WHERE tu.user_id = p_user_id;
END;
$function$;
```

**Importante:** O `scope` é derivado do prefixo do `role`. Roles com prefixo `global:` → scope `global`. Demais → scope `tenant`. Esta função foi corrigida pela migration `20260802210000_fix_get_tenant_user_auth_scope.sql` para retornar `scope` (antes retornava apenas `tenant_id` e `role`).

### 2.17 Middleware Edge do Next.js (`apps/web/middleware.ts`)

Executa em edge runtime antes de qualquer página:

```
1. Verifica cookie access_token
   → Se ausente: redirect /auth/login (exceto rotas públicas)

2. Para rotas /admin/*:
   - Decodifica JWT (sem verificar assinatura — só lê payload)
   - Lê scope do payload
   - Se scope !== "global": redirect /dashboard
   - Bloqueio precoce evita flash de conteúdo admin

3. Proteção CSRF:
   - POST/PUT/DELETE/PATCH sem header Origin válido → 403
```

### 2.18 OAuth e LDAP (Engatilhados)

| Endpoint                      | Método | Status                                            |
| ----------------------------- | ------ | ------------------------------------------------- |
| `/api/v1/auth/oauth/google`   | GET    | Stub — redireciona para Google (não implementado) |
| `/api/v1/auth/oauth/callback` | POST   | Stub — retorna 501                                |
| `/api/v1/auth/ldap/bind`      | POST   | Stub — retorna 501                                |

Interfaces definidas em `@repo/auth/providers/` mas não implementadas.

### 2.19 Diagrama Completo do Fluxo

```
                    ┌──────────────────────────────────────────────────────────┐
                    │                     BROWSER                              │
                    │  Cookie: access_token (15min, httpOnly)                  │
                    │  Cookie: refresh_token (30d, httpOnly)                  │
                    └──────┬───────────────────────────────────┬──────────────┘
                           │                                   │
            POST /api/auth/login                    GET /api/v1/zabbix/devices
            { email, password,                      (cookie access_token)
             device_fingerprint,                              │
             device_label }                                   │
                           │                                   │
                    ┌──────▼──────────┐               ┌───────▼──────────┐
                    │  Next.js Route  │               │  Next.js Proxy   │
                    │  /api/auth/login│               │  /api/[...path]  │
                    │                 │               │                  │
                    │  fetch backend  │               │  Lê cookie       │
                    │  set cookies    │               │  → Bearer header │
                    │  return JSON    │               │  fetch backend   │
                    └──────┬──────────┘               │  strip set-cookie │
                           │                          │  return JSON     │
                    ┌──────▼──────────┐               └───────┬──────────┘
                    │  API Hono       │                       │
                    │  /api/v1/auth/  │               ┌───────▼──────────┐
                    │  login          │               │  API Hono        │
                    │                 │               │  /api/v1/zabbix/ │
                    │  Zod validate   │               │  devices         │
                    │  argon2 verify  │               │                  │
                    │  get_tenant_    │               │  jwtAuth         │
                    │  user_auth()    │               │  tenantContext   │
                    │  MFA check      │               │  requirePermission│
                    │  signAccessToken│               │  query DB        │
                    │  signRefreshToken│              │  return JSON     │
                    │  storeRefreshJti│               └──────────────────┘
                    │  create session │
                    │  return JSON    │
                    │  { access_token,│
                    │    refresh_token,│
                    │    user, scope, │
                    │    tenants }    │
                    └─────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                          AUTO-REFRESH FLOW                               │
  │                                                                         │
  │  Request → access_token expirado → 401                                  │
  │  Proxy lê refresh_token do cookie                                       │
  │  POST /api/v1/auth/refresh { refresh_token }                            │
  │  ← { access_token (novo), refresh_token (novo) }                        │
  │  Proxy seta novo cookie access_token                                    │
  │  Refaz request original com novo token                                  │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Catálogo de APIs

### 3.1 Convenções

**Base URL Backend:** `http://localhost:3001/api/v1/`
**Base URL Frontend (proxy):** `http://localhost:3000/api/` (proxy insere `v1/` automaticamente)

**Headers comuns:**

| Header            | Valor                   | Quando                                                             |
| ----------------- | ----------------------- | ------------------------------------------------------------------ |
| `Authorization`   | `Bearer <access_token>` | Todas as rotas protegidas (injetado pelo proxy a partir do cookie) |
| `Content-Type`    | `application/json`      | POST/PUT/PATCH                                                     |
| `Origin`          | URL do frontend         | POST/PUT/DELETE/PATCH (validação CSRF no middleware edge)          |
| `x-forwarded-for` | IP do cliente           | Repassado pelo proxy para rate limiting                            |
| `user-agent`      | Browser UA              | Repassado pelo proxy para sessões                                  |

**Padrão de erro universal:**

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensagem em português",
    "correlation_id": "uuid (apenas em 500)"
  }
}
```

**Middlewares por categoria:**

| Categoria               | Middlewares aplicados                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Pública                 | securityHeaders → CORS → compression → logger → errorHandler → tracing → logIngestion → bodySizeLimit → requestTimeout → rateLimitApi |
| Auth pública            | + rateLimitAuth (mais restrito)                                                                                                       |
| Protegida               | + jwtAuth → tenantContext → auditMiddleware                                                                                           |
| Protegida com módulo    | + requireModule("module_xxx")                                                                                                         |
| Protegida com permissão | + requirePermission("xxx:yyy:zzz")                                                                                                    |

---

### 3.2 Auth (`/api/v1/auth`) — Público + rateLimitAuth

#### POST /auth/login

**O que faz:** Autentica usuário com email/senha. Se MFA habilitado, retorna challenge. Senão, retorna tokens JWT.

**Request Body** (`loginInputSchema`):

```json
{
  "email": "admin@jlmirror.com", // string, obrigatório, formato email
  "password": "admin123", // string, obrigatório, min 1 char
  "device_fingerprint": "abc123", // string, opcional
  "device_label": "Chrome Windows" // string, opcional
}
```

**Resposta Sucesso (sem MFA)** — `200`:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@jlmirror.com",
    "full_name": "Admin",
    "is_active": true,
    "must_change_password": false
  },
  "scope": "global",
  "tenants": [
    { "tenant_id": "uuid", "role": "global:admin", "scope": "global" }
  ]
}
```

**Resposta Sucesso (com MFA)** — `200`:

```json
{
  "mfa_required": true,
  "mfa_method": "totp",
  "challenge_token": "a1b2c3d4-e5f6-...",
  "user": { "id": "uuid", "email": "admin@jlmirror.com", "full_name": "Admin" }
}
```

**Respostas de Erro:**

| Status | Code                  | Cenário                               |
| ------ | --------------------- | ------------------------------------- |
| 400    | `VALIDATION_ERROR`    | Email inválido ou senha vazia         |
| 401    | `INVALID_CREDENTIALS` | Email não existe ou senha incorreta   |
| 403    | `USER_INACTIVE`       | `is_active = false`                   |
| 403    | `NO_TENANT_ACCESS`    | Usuário sem tenants em `tenant_users` |
| 500    | `INTERNAL_ERROR`      | Erro inesperado                       |

**⚠️ Validações ocultas para o frontend:**

- `email` deve passar validação de formato email do Zod
- `password` mínimo 1 caractere (não confundir com min 8 do change-password)
- `device_fingerprint` é usado para registrar dispositivo confiável e associar à sessão
- Rate limit auth aplicado (limites mais restritos que rotas normais)
- O frontend nunca recebe `access_token` nem `refresh_token` no JSON — a rota Next.js os extrai e seta como cookies httpOnly

---

#### POST /auth/refresh

**O que faz:** Renova access token usando refresh token. Implementa rotation (token antigo é revogado).

**Request Body** (`refreshTokenSchema`):

```json
{
  "refresh_token": "eyJhbGciOiJSUzI1NiIs..." // string, obrigatório, min 1 char
}
```

**Resposta Sucesso** — `200`:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs..."
}
```

**Respostas de Erro:**

| Status | Code                 | Cenário                                         |
| ------ | -------------------- | ----------------------------------------------- |
| 401    | `INVALID_TOKEN`      | Token inválido, expirado ou assinatura inválida |
| 401    | `TOKEN_REVOKED`      | `jti` não encontrado no Redis (foi revogado)    |
| 401    | `INVALID_TOKEN_TYPE` | Token não é do tipo "refresh"                   |

---

#### POST /auth/logout

**O que faz:** Revoga refresh token do usuário autenticado. Requer JWT.

**Auth:** `jwtAuth`

**Resposta Sucesso** — `200`:

```json
{ "revoked": true }
```

---

#### POST /auth/revoke

**O que faz:** Revoca token por JTI. Usado pelo logout do frontend (não requer JWT, usa o refresh_token no body).

**Request Body** (`refreshTokenSchema`):

```json
{ "refresh_token": "eyJhbGciOiJSUzI1NiIs..." }
```

**Resposta Sucesso** — `200`:

```json
{ "revoked": true }
```

---

#### GET /auth/me

**O que faz:** Retorna dados do usuário logado + tenants + scope. Usado pelo frontend para determinar sidebar e redirecionamento.

**Auth:** `jwtAuth`

**Resposta Sucesso** — `200`:

```json
{
  "user": {
    "id": "uuid",
    "email": "admin@jlmirror.com",
    "full_name": "Admin",
    "is_active": true,
    "must_change_password": false
  },
  "scope": "global",
  "tenants": [
    { "tenant_id": "uuid", "role": "global:admin", "scope": "global" }
  ]
}
```

**Respostas de Erro:**

| Status | Code             | Cenário                     |
| ------ | ---------------- | --------------------------- |
| 401    | `UNAUTHORIZED`   | Sem token ou token inválido |
| 404    | `USER_NOT_FOUND` | Usuário não existe no DB    |

---

#### GET /auth/sessions

**O que faz:** Lista sessões ativas do usuário.

**Auth:** `jwtAuth`

**Resposta Sucesso** — `200`:

```json
{
  "sessions": [
    {
      "id": "uuid",
      "device_fingerprint": "abc123",
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0...",
      "last_activity": "2026-08-02T20:00:00Z",
      "expires_at": "2026-09-01T20:00:00Z"
    }
  ]
}
```

---

#### DELETE /auth/sessions/:sessionId

**Auth:** `jwtAuth`

**Resposta Sucesso** — `200`: `{ "revoked": true }`

---

#### DELETE /auth/sessions

**O que faz:** Revoga todas as sessões do usuário.

**Auth:** `jwtAuth`

**Resposta Sucesso** — `200`: `{ "revoked": true }`

---

#### GET /auth/devices

**O que faz:** Lista dispositivos confiáveis cadastrados.

**Auth:** `jwtAuth`

**Resposta Sucesso** — `200`:

```json
{
  "devices": [
    {
      "id": "uuid",
      "device_fingerprint": "abc123",
      "device_label": "Chrome Windows",
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0...",
      "last_seen_at": "2026-08-02T20:00:00Z"
    }
  ]
}
```

---

#### DELETE /auth/devices/:deviceId

**Auth:** `jwtAuth`

**Resposta Sucesso** — `200`: `{ "revoked": true }`

---

#### POST /auth/change-password

**O que faz:** Altera senha do usuário autenticado.

**Auth:** `jwtAuth`

**Request Body** (`changePasswordSchema`):

```json
{
  "current_password": "old12345", // string, obrigatório, min 1 char
  "new_password": "new12345" // string, obrigatório, MIN 8 CHARS
}
```

**Resposta Sucesso** — `200`: `{ "changed": true }`

**⚠️ Validação oculta:** `new_password` mínimo 8 caracteres. O frontend deve validar isso antes de enviar para evitar 400.

---

### 3.3 MFA (`/api/v1/mfa`) — jwtAuth + tenantContext + permissões self:mfa

#### POST /mfa/setup

**O que faz:** Inicia setup TOTP. Gera secret e QR code.

**Auth:** `jwtAuth` + `tenantContext` + `requirePermission("self:mfa:write")`

**Resposta Sucesso** — `200`:

```json
{
  "secret": "JBSWY3DPEHPK3PXP...",
  "otpauth_url": "otpauth://totp/JLMIRROR:admin@jlmirror.com?secret=...",
  "qr_code_data_url": "data:image/png;base64,iVBOR..."
}
```

---

#### POST /mfa/setup/verify

**O que faz:** Confirma setup TOTP com o primeiro código de 6 dígitos.

**Auth:** `jwtAuth` + `tenantContext` + `requirePermission("self:mfa:write")`

**Request Body** (`mfaSetupVerifySchema`):

```json
{
  "secret": "JBSWY3DPEHPK3PXP...", // string, obrigatório, min 1 char
  "code": "123456" // string, obrigatório, EXATAMENTE 6 CHARS
}
```

**Resposta Sucesso** — `200`:

```json
{
  "verified": true,
  "recovery_codes": ["abc123", "def456", "ghi789", ...]
}
```

**⚠️ Validação oculta:** `code` deve ter exatamente 6 caracteres. O frontend deve usar `maxLength={6}` e `pattern="[0-9]"` no input.

---

#### POST /mfa/verify

**O que faz:** Verifica código TOTP durante login (segundo fator). **Público — não requer JWT.**

**Request Body** (`mfaVerifySchema`):

```json
{
  "challenge_token": "a1b2c3d4-e5f6-...", // string, obrigatório, min 1 char
  "code": "123456" // string, obrigatório, EXATAMENTE 6 CHARS
}
```

**Resposta Sucesso** — `200`:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "...",
    "full_name": "...",
    "is_active": true,
    "must_change_password": false
  },
  "scope": "global",
  "tenants": [
    { "tenant_id": "uuid", "role": "global:admin", "scope": "global" }
  ]
}
```

**Respostas de Erro:**

| Status | Code                  | Cenário                                       |
| ------ | --------------------- | --------------------------------------------- |
| 400    | `VALIDATION_ERROR`    | Code não tem 6 chars ou challenge_token vazio |
| 401    | `INVALID_CODE`        | Código TOTP incorreto e não é recovery code   |
| 401    | `CHALLENGE_EXPIRED`   | Challenge token expirado (5 min)              |
| 404    | `CHALLENGE_NOT_FOUND` | Challenge token não existe no DB              |

**⚠️ Validações ocultas:**

- `challenge_token` expira em 5 minutos
- Código pode ser TOTP (6 dígitos) OU recovery code (string alfanumérica)
- Após verificação bem-sucedida, o challenge é marcado como usado (não pode reusar)

---

#### POST /mfa/disable

**O que faz:** Desativa MFA TOTP para o usuário.

**Auth:** `jwtAuth` + `tenantContext` + `requirePermission("self:mfa:write")`

**Resposta Sucesso** — `200`: `{ "disabled": true }`

---

#### GET /mfa/status

**O que faz:** Retorna status do MFA do usuário.

**Auth:** `jwtAuth` + `tenantContext` + `requirePermission("self:mfa:read")`

**Resposta Sucesso** — `200`:

```json
{
  "enabled": true,
  "recovery_codes_remaining": 5
}
```

---

### 3.4 Profile (`/api/v1/profile`) — jwtAuth + tenantContext

#### GET /profile

**O que faz:** Busca perfil do usuário. Cria automaticamente se não existir (upsert).

**Permissão:** `self:profile:read`

**Resposta Sucesso** — `200`:

```json
{
  "profile": {
    "id": "uuid",
    "user_id": "uuid",
    "display_name": "Admin",
    "bio": "",
    "phone": "+55 11 99999-9999",
    "location": "São Paulo, BR",
    "timezone": "America/Sao_Paulo",
    "locale": "pt-BR",
    "avatar_url": null,
    "avatar_initials": "AD",
    "avatar_color": "#3B82F6",
    "job_title": "Administrador",
    "department": "TI",
    "skills": ["Linux", "Docker", "Kubernetes"],
    "social_links": { "github": "https://github.com/...", "linkedin": "..." },
    "notification_email": true,
    "notification_push": false,
    "notification_sms": false,
    "notification_digest_frequency": "daily",
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "07:00",
    "theme": "dark",
    "density": "comfortable",
    "sidebar_collapsed": false,
    "email": "admin@jlmirror.com",
    "name": "Admin",
    "role": "global:admin"
  }
}
```

---

#### PUT /profile

**O que faz:** Atualiza perfil do usuário.

**Permissão:** `self:profile:write`

**Request Body esperado pelo backend** (campos lidos em `profile.ts:87-107`):

```json
{
  "display_name": "Admin", // string, opcional
  "bio": "Descrição", // string, opcional
  "phone": "+55 11 ...", // string, opcional
  "location": "São Paulo", // string, opcional
  "timezone": "America/Sao_Paulo", // string, opcional
  "locale": "pt-BR", // string, opcional
  "job_title": "Administrador", // string, opcional
  "department": "TI", // string, opcional
  "skills": ["Linux", "Docker"], // string[], opcional
  "social_links": { "github": "..." } // Record, opcional
}
```

**⚠️ DISCREPÂNCIA CRÍTICA:** O `updateProfileSchema` em `@repo/shared-validation` aceita apenas `{ full_name?, email? }`. O Zod remove todos os outros campos. **O perfil nunca é atualizado** — retorna `{ updated: true }` mas nada foi gravado. Ver seção 4.8 para detalhes.

**Resposta Sucesso** — `200`: `{ "updated": true }`

**Resposta Erro** — `400`: `{ "error": { "code": "VALIDATION_ERROR", "message": "Dados inválidos" } }`

---

#### PUT /profile/avatar

**O que faz:** Atualiza avatar do usuário.

**Permissão:** `self:profile:write`

**Request Body esperado pelo backend** (`profile.ts:141-153`):

```json
{
  "avatar_url": "https://...", // string URL, opcional
  "avatar_initials": "AD", // string, opcional
  "avatar_color": "#3B82F6" // string, opcional
}
```

**⚠️ DISCREPÂNCIA CRÍTICA:** O `updateAvatarSchema` exige `{ avatar_url: string.url() }` como obrigatório. Se enviar `{ avatar_initials, avatar_color }` sem `avatar_url`, retorna 400. Ver seção 4.8.

**Resposta Sucesso** — `200`: `{ "updated": true }`

---

#### GET /profile/preferences

**Permissão:** `self:profile:read`

**Resposta Sucesso** — `200`:

```json
{
  "preferences": {
    "notification_email": true,
    "notification_push": false,
    "notification_sms": false,
    "notification_digest_frequency": "daily",
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "07:00",
    "theme": "dark",
    "density": "comfortable",
    "sidebar_collapsed": false,
    "dashboard_layout": {}
  }
}
```

---

#### PUT /profile/preferences

**Permissão:** `self:profile:write`

**Request Body esperado pelo backend** (`profile.ts:203-208`):

```json
{
  "notification_email": true, // boolean
  "notification_push": false, // boolean
  "notification_sms": false, // boolean
  "notification_digest_frequency": "daily", // string
  "quiet_hours_start": "22:00", // string
  "quiet_hours_end": "07:00", // string
  "theme": "dark", // string
  "density": "comfortable", // string
  "sidebar_collapsed": false, // boolean
  "dashboard_layout": {} // Record (JSON)
}
```

**⚠️ DISCREPÂNCIA CRÍTICA:** O `updatePreferencesSchema` exige `{ preferences: Record<string, unknown> }` (wrapper). O backend lê campos planos. Ver seção 4.8.

**Resposta Sucesso** — `200`: `{ "updated": true }`

---

#### GET /profile/sessions

**Permissão:** `self:profile:read`

**Resposta Sucesso** — `200`:

```json
{
  "sessions": [
    {
      "id": "uuid",
      "device_type": "desktop",
      "device_name": "Chrome on Windows",
      "ip_address": "192.168.1.100",
      "location": "São Paulo, BR",
      "is_active": true,
      "last_activity": "2026-08-02T20:00:00Z",
      "expires_at": "2026-09-01T20:00:00Z",
      "created_at": "2026-08-02T20:00:00Z"
    }
  ]
}
```

---

#### DELETE /profile/sessions/:sessionId

**Permissão:** `self:profile:write`

**Resposta Sucesso** — `200`: `{ "revoked": true }`

---

#### DELETE /profile/sessions

**Permissão:** `self:profile:write`

**Resposta Sucesso** — `200`: `{ "revoked": true }`

---

#### GET /profile/security/log

**O que faz:** Retorna log de eventos de segurança do usuário.

**Permissão:** `self:profile:read`

**Query Params:**

| Param   | Tipo   | Default | Limites |
| ------- | ------ | ------- | ------- |
| `limit` | number | 20      | max 100 |

**Resposta Sucesso** — `200`:

```json
{
  "events": [
    {
      "id": "uuid",
      "event_type": "profile_update",
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0...",
      "metadata": { "fields": ["display_name", "bio"] },
      "created_at": "2026-08-02T20:00:00Z"
    }
  ]
}
```

---

### 3.5 Admin (`/api/v1/admin`) — jwtAuth + tenantContext + requireModule("module_admin")

#### GET /admin/tenants

**Permissão:** `admin:tenants:read`

**Resposta Sucesso** — `200`:

```json
{
  "tenants": [
    {
      "id": "uuid",
      "name": "Empresa ABC",
      "slug": "empresa-abc",
      "status": "active",
      "created_at": "2026-01-01T00:00:00Z",
      "cluster_id": 0,
      "cluster_host": "localhost",
      "schema_name": "tenant_empresa_abc",
      "route_status": "active",
      "user_count": 15
    }
  ]
}
```

---

#### GET /admin/tenants/:tenantId

**Permissão:** `admin:tenants:read`

**Resposta Sucesso** — `200`:

```json
{
  "tenant": { "id": "uuid", "name": "...", "slug": "...", "status": "active", ... },
  "users": [ { "user_id": "uuid", "role": "tenant:admin", "email": "...", "full_name": "...", "is_active": true } ],
  "contacts": [ { "id": "uuid", "name": "...", "email": "...", "phone": "...", "is_primary": true } ]
}
```

**Erro:** `404 NOT_FOUND` se tenant não existe

---

#### POST /admin/tenants

**Permissão:** `admin:tenants:write`

**Request Body:**

```json
{
  "name": "Empresa ABC", // string, obrigatório
  "slug": "empresa-abc", // string, obrigatório
  "plan": "pro", // string, opcional
  "cluster_id": 0, // number, opcional
  "cluster_host": "localhost", // string, opcional
  "cluster_database_name": "jlmirror", // string, opcional
  "cluster_port": 5432, // number, opcional
  "schema_name": "tenant_empresa_abc", // string, opcional
  "is_enterprise": false, // boolean, opcional
  "zabbix_host_group_id": "123", // string, opcional
  "zabbix_api_url": "http://...", // string, opcional
  "zabbix_api_token": "..." // string, opcional
}
```

**Resposta Sucesso** — `201`: `{ "tenant": { "id": "uuid", ... } }`

---

#### PUT /admin/tenants/:tenantId

**Permissão:** `admin:tenants:write`

**Resposta Sucesso** — `200`: `{ "updated": true }`

---

#### POST /admin/tenants/:tenantId/suspend

**Permissão:** `admin:tenants:write`

**Resposta Sucesso** — `200`: `{ "suspended": true }`

---

#### POST /admin/tenants/:tenantId/activate

**Permissão:** `admin:tenants:write`

**Resposta Sucesso** — `200`: `{ "activated": true }`

---

#### GET /admin/tenants/:tenantId/users

**Permissão:** `admin:tenants:read`

**Resposta Sucesso** — `200`: `{ "users": [{ "user_id": "uuid", "role": "...", "email": "...", "full_name": "...", "is_active": true }] }`

---

#### POST /admin/tenants/:tenantId/users

**O que faz:** Associa usuário existente a um tenant.

**Permissão:** `admin:tenants:write`

**Request Body:** `{ "user_id": "uuid", "role": "tenant:admin" }`

---

#### POST /admin/tenants/:tenantId/users/create

**O que faz:** Cria novo usuário e associa ao tenant.

**Permissão:** `admin:tenants:write`

**Request Body** (`adminCreateUserSchema`):

```json
{
  "email": "user@empresa.com", // string email, obrigatório
  "full_name": "João Silva", // string, obrigatório, min 1
  "password": "senha123", // string, obrigatório, MIN 8 CHARS
  "tenant_id": "uuid", // string UUID, obrigatório
  "role": "tenant:admin" // string, obrigatório, min 1
}
```

---

#### DELETE /admin/tenants/:tenantId/users/:userId

**Permissão:** `admin:tenants:write`

**Resposta Sucesso** — `200`: `{ "removed": true }`

---

#### GET /admin/tenants/:tenantId/contacts

**Permissão:** `admin:tenants:read`

---

#### POST /admin/tenants/:tenantId/contacts

**Permissão:** `admin:tenants:write`

**Request Body** (`createClientContactSchema`):

```json
{
  "name": "João Silva", // string, obrigatório, min 1
  "email": "joao@empresa.com", // string email, obrigatório
  "phone": "+55 11 ...", // string, opcional
  "company_id": "uuid", // string UUID, opcional
  "role": "Gerente de TI", // string, opcional
  "department": "TI", // string, opcional
  "is_primary": false, // boolean, opcional, default false
  "notes": "..." // string, opcional
}
```

---

#### PUT /admin/tenants/:tenantId/contacts/:contactId

**Permissão:** `admin:tenants:write`

**Request Body** (`updateClientContactSchema`): todos os campos opcionais.

---

#### DELETE /admin/tenants/:tenantId/contacts/:contactId

**Permissão:** `admin:tenants:write`

---

#### GET /admin/tenants/:tenantId/company

**Permissão:** `admin:tenants:read`

---

#### PUT /admin/tenants/:tenantId/company

**Permissão:** `admin:tenants:write`

**Request Body** (`upsertClientCompanySchema`):

```json
{
  "name": "Empresa ABC", // string, obrigatório, min 1
  "cnpj": "12.345.678/0001-90", // string, opcional
  "industry": "Tecnologia", // string, opcional
  "website": "https://...", // string URL, opcional
  "address": "Rua ..., 123", // string, opcional
  "phone": "+55 11 ..." // string, opcional
}
```

---

#### GET /admin/clients

**Permissão:** `admin:tenants:read`

---

#### GET /admin/stats/overview

**Permissão:** `admin:tenants:read`

**Resposta Sucesso** — `200`:

```json
{
  "total_tenants": 50,
  "active_tenants": 45,
  "suspended_tenants": 5,
  "total_users": 320
}
```

---

### 3.6 Dashboard (`/api/v1/dashboard`) — jwtAuth + tenantContext

#### GET /dashboard

**O que faz:** Retorna KPIs, charts e eventos recentes do tenant.

**Cache:** 30s (Redis)

**Resposta Sucesso** — `200`:

```json
{
  "kpis": { "devices_total": 120, "devices_online": 110, "alerts_active": 5, "incidents_open": 2 },
  "charts": { "cpu_history": [...], "memory_history": [...] },
  "recent_events": [...]
}
```

---

#### GET /dashboard/overview

**O que faz:** Visão geral consolidada do tenant.

**Cache:** 30s

---

#### GET /dashboard/navigation

**O que faz:** Retorna estrutura de navegação dinâmica baseada em feature flags do tenant.

**Resposta Sucesso** — `200`:

```json
{
  "sections": [
    {
      "title": "Monitoramento",
      "items": [
        {
          "label": "Dispositivos",
          "href": "/devices",
          "flagKey": "module_devices",
          "enabled": true
        }
      ]
    }
  ]
}
```

---

### 3.7 Settings (`/api/v1/settings`) — jwtAuth + tenantContext

#### GET /settings

**Permissão:** `settings:read`

**Resposta Sucesso** — `200`:

```json
{
  "settings": {
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_user": "noreply@jlmirror.com",
    "smtp_from": "JLMIRROR <noreply@jlmirror.com>"
  }
}
```

---

#### PUT /settings

**Permissão:** `settings:write`

**Request Body** (`updateTenantSettingsSchema`):

```json
{
  "settings": { "smtp_host": "smtp.gmail.com", "smtp_port": 587 }
}
```

---

#### POST /settings/test-smtp

**Permissão:** `settings:write`

**Request Body** (`testSmtpSchema`):

```json
{
  "smtp_host": "smtp.gmail.com", // string, obrigatório, min 1
  "smtp_port": 587, // number int, obrigatório, 1-65535
  "smtp_user": "noreply@...", // string, opcional
  "smtp_pass": "password", // string, opcional
  "smtp_from": "noreply@...", // string email, obrigatório
  "smtp_to": "admin@..." // string email, obrigatório
}
```

**⚠️ Validações ocultas:** `smtp_port` deve ser inteiro entre 1 e 65535. `smtp_from` e `smtp_to` devem ser emails válidos.

---

#### GET /settings/usage

**Permissão:** `settings:read`

---

#### GET /settings/modules

**Permissão:** `settings:read`

**Resposta Sucesso** — `200`:

```json
{
  "modules": [
    { "key": "module_devices", "name": "Dispositivos", "enabled": true },
    { "key": "module_audit", "name": "Auditoria", "enabled": false }
  ]
}
```

---

#### PUT /settings/modules/:key

**Permissão:** `settings:write`

**O que faz:** Ativa/desativa módulo (feature flag) do tenant.

**Request Body:** `{ "enabled": true }`

---

### 3.8 Users (`/api/v1/users`) — jwtAuth + tenantContext

#### GET /users

**Permissão:** `tenant:users:read`

**Resposta Sucesso** — `200`:

```json
{
  "users": [
    {
      "user_id": "uuid",
      "role": "tenant:admin",
      "email": "user@empresa.com",
      "full_name": "João Silva",
      "is_active": true
    }
  ]
}
```

---

#### GET /users/all

**O que faz:** Lista todos os usuários sem filtro de tenant.

**⚠️ Sem `requirePermission` explícita** — apenas jwtAuth + tenantContext. Possível problema de segurança.

---

#### POST /users

**Permissão:** `tenant:users:write`

---

#### PUT /users/:userId/role

**Permissão:** `tenant:users:write`

**Request Body:** `{ "role": "tenant:admin" }`

---

#### PUT /users/:userId/status

**Permissão:** `tenant:users:write`

**Request Body:** `{ "is_active": false }`

---

#### DELETE /users/:userId

**Permissão:** `tenant:users:delete`

---

#### GET /users/roles

**Resposta Sucesso** — `200`: `{ "roles": [...] }`

---

#### POST /users/custom-roles

**Permissão:** `tenant:settings:write`

**Request Body** (`createRoleSchema`):

```json
{
  "name": "Operador", // string, obrigatório, min 1
  "description": "Operador de TI", // string, opcional
  "permissions": ["tickets:read"] // string[], opcional, default []
}
```

---

### 3.9 Zabbix (`/api/v1/zabbix`) — jwtAuth + tenantContext (sem requireModule)

O módulo Zabbix é o mais extenso, com ~50 endpoints. Sempre ativo (sem requireModule). Rate limit por tenant (100 req/min).

#### GET /zabbix/ping

**O que faz:** Testa conectividade com a API Zabbix do tenant.

**Resposta Sucesso** — `200`:

```json
{ "ok": true, "latency_ms": 45 }
```

**Resposta Erro** — `502`: `{ "error": { "code": "ZABBIX_UNREACHABLE", "message": "..." } }`

---

#### GET /zabbix/devices

**Query Params:**

| Param      | Tipo                     | Descrição                     |
| ---------- | ------------------------ | ----------------------------- |
| `groupids` | string (comma-separated) | Filtrar por group IDs         |
| `search`   | string                   | Busca por nome                |
| `page`     | number                   | Paginação (default 1)         |
| `limit`    | number                   | Itens por página (default 50) |

**Resposta Sucesso** — `200`:

```json
{
  "devices": [
    {
      "hostid": "10084",
      "host": "server-01",
      "name": "Server 01",
      "status": 0,
      "available": 1
    }
  ]
}
```

**Cache:** 10s (Redis)

---

#### GET /zabbix/devices/:hostId

**Resposta Sucesso** — `200`: `{ "device": { "hostid": "...", "host": "...", ... } }`

---

#### POST /zabbix/sync

**O que faz:** Sincroniza dispositivos do Zabbix com o banco local.

**Resposta Sucesso** — `200`: `{ "synced": 120, "created": 5, "updated": 3, "deleted": 0 }`

---

#### GET /zabbix/devices/:hostId/items

**Resposta Sucesso** — `200`: `{ "items": [{ "itemid": "...", "name": "CPU usage", "key_": "system.cpu.util", "lastvalue": "12.5", "units": "%" }] }`

---

#### GET /zabbix/history

**Query Params:**

| Param    | Tipo             | Obrigatório |
| -------- | ---------------- | ----------- |
| `itemid` | string           | ✅          |
| `from`   | string \| number | ✅          |
| `till`   | string \| number | ✅          |
| `limit`  | number           | ❌          |

**Cache:** 5s. **Downsampling:** max 500 pontos por série (LTTB simplificado).

---

#### GET /zabbix/triggers

**Resposta Sucesso** — `200`: `{ "triggers": [{ "triggerid": "...", "description": "...", "priority": 4, "value": 1 }] }`

**Cache:** 10s

---

#### GET /zabbix/problems

**Query Params:** `device_id`, `acknowledged` (boolean), `recent` (boolean), `severity_min` (number)

---

#### GET /zabbix/events

**Query Params:** `device_id`, `from`, `to`, `value` (int)

---

#### POST /zabbix/acknowledge

**Request Body** (`zabbixAcknowledgeSchema`):

```json
{
  "eventids": ["1", "2", "3"], // string[], obrigatório, min 1 item
  "message": "Reconhecido por...", // string, opcional, default ""
  "action": 1 // number int, opcional, default 1
}
```

---

#### GET /zabbix/graphs

#### GET /zabbix/graphs/:graphid/data

**Query Params:** `from`, `till`

**Downsampling:** max 500 pontos. **Cache:** 5s.

---

#### GET /zabbix/key-items

#### GET /zabbix/devices/:hostId/prefs

#### PUT /zabbix/devices/:hostId/prefs

**Request Body** (`zabbixDashboardPrefsSchema`):

```json
{
  "device_type": "server", // string, default "auto"
  "visible_categories": ["cpu", "mem"], // string[], default []
  "collapsed_categories": ["disk"], // string[], default []
  "hidden_metrics": ["vm.memory.size"], // string[], default []
  "pinned_metrics": ["system.cpu.util"] // string[], default []
}
```

---

#### GET /zabbix/templates

#### GET /zabbix/maintenances

#### POST /zabbix/maintenances

**Request Body** (`zabbixCreateMaintenanceSchema`):

```json
{
  "name": "Manutenção programada", // string, obrigatório, min 1
  "description": "...", // string, opcional
  "maintenance_type": 0, // number int, default 0
  "active_since": 1722632400, // number int (timestamp), obrigatório
  "active_till": 1722636000, // number int (timestamp), obrigatório
  "hostids": ["10084"], // string[], obrigatório, min 1
  "timeperiods": [
    {
      // array, obrigatório, min 1
      "timeperiod_type": 0, // number int, default 0
      "start_date": 1722632400, // number int, obrigatório
      "period": 3600 // number int, default 3600
    }
  ]
}
```

#### DELETE /zabbix/maintenances/:id

#### GET /zabbix/services

#### GET /zabbix/slas

#### GET /zabbix/users

#### GET /zabbix/actions

#### GET /zabbix/proxies

#### GET /zabbix/discovery-rules

#### GET /zabbix/reports

#### GET /zabbix/host-groups

#### POST /zabbix/host-groups

**Request Body** (`zabbixCreateHostGroupSchema`): `{ "name": "Servers" }` — string, obrigatório, min 1

#### PUT /zabbix/host-groups/:id

#### DELETE /zabbix/host-groups/:id

#### POST /zabbix/hosts

**Request Body** (`zabbixCreateHostSchema`):

```json
{
  "host": "server-01", // string, obrigatório, min 1
  "name": "Server 01", // string, obrigatório, min 1
  "groupids": ["1"], // string[], obrigatório, min 1
  "interfaces": [
    {
      // array, obrigatório, min 1
      "type": 1, // number int, default 1
      "ip": "192.168.1.1", // string, obrigatório, min 1
      "dns": "server-01.local", // string, opcional
      "port": "10050", // string, default "10050"
      "main": 1, // number int, default 1
      "useip": 1 // number int, default 1
    }
  ],
  "templateids": ["10001"] // string[], opcional
}
```

#### PUT /zabbix/hosts/:id

#### DELETE /zabbix/hosts/:id

#### POST /zabbix/items

**Request Body** (`zabbixCreateItemSchema`):

```json
{
  "hostid": "10084", // string, obrigatório, min 1
  "name": "CPU usage", // string, obrigatório, min 1
  "key_": "system.cpu.util", // string, obrigatório, min 1
  "type": 0, // number int, obrigatório
  "value_type": 0, // number int, obrigatório
  "units": "%", // string, opcional
  "history": "90d", // string, default "90d"
  "trends": "365d" // string, default "365d"
}
```

#### PUT /zabbix/items/:id

#### DELETE /zabbix/items/:id

#### POST /zabbix/triggers

**Request Body** (`zabbixCreateTriggerSchema`):

```json
{
  "description": "CPU alta", // string, obrigatório, min 1
  "expression": "{host:key.last()}>90", // string, obrigatório, min 1
  "priority": 4 // number int, 0-5, default 1
}
```

#### PUT /zabbix/triggers/:id

#### DELETE /zabbix/triggers/:id

#### POST /zabbix/users

**Request Body** (`zabbixCreateUserSchema`):

```json
{
  "username": "admin", // string, obrigatório, min 1
  "name": "Admin", // string, opcional
  "surname": "Silva", // string, opcional
  "roleid": "1", // string, obrigatório, min 1
  "passwd": "password", // string, opcional
  "usrgrps": ["1"] // string[], opcional
}
```

#### PUT /zabbix/users/:id

#### DELETE /zabbix/users/:id

#### GET /zabbix/user-groups

#### POST /zabbix/user-groups

#### PUT /zabbix/user-groups/:id

#### DELETE /zabbix/user-groups/:id

#### GET /zabbix/user-host-groups

#### POST /zabbix/user-host-groups

**Request Body** (`assignUserHostGroupSchema`):

```json
{
  "user_id": "uuid", // string UUID, obrigatório
  "zabbix_host_group_id": "1", // string, obrigatório, min 1
  "zabbix_host_group_name": "Servers" // string, opcional
}
```

#### DELETE /zabbix/user-host-groups/:id

#### GET /zabbix/user-host-groups/by-group/:groupId

#### GET /zabbix/history-batch

#### GET /zabbix/overview

#### GET /zabbix/version

---

### 3.10 Tabela Resumida — Demais Módulos

Todos os módulos abaixo seguem o padrão: `jwtAuth` + `tenantContext` + `requireModule("module_xxx")`. Endpoints CRUD seguem `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id` salvo onde indicado.

| Módulo              | Prefixo                | Feature Flag                 | Endpoints                                                                                                               | Arquivo                                      |
| ------------------- | ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Audit               | `/audit`               | `module_audit`               | GET /logs, GET /stats                                                                                                   | `apps/api/src/routes/audit.ts`               |
| Logs                | `/logs`                | `module_logs`                | POST /ingest, POST /ingest/batch, GET /search, GET /stats, GET /levels                                                  | `apps/api/src/routes/logs.ts`                |
| Traces              | `/traces`              | `module_traces`              | GET /search, GET /stats, GET /:traceId                                                                                  | `apps/api/src/routes/traces.ts`              |
| Scripts             | `/scripts`             | `module_scripts`             | CRUD + POST /:id/execute, GET /:id/executions                                                                           | `apps/api/src/routes/scripts.ts`             |
| Executions          | `/executions`          | `module_executions`          | GET /, GET /pending, GET /:id, POST /:id/approve, POST /:id/run, POST /:id/cancel                                       | `apps/api/src/routes/executions.ts`          |
| Firewall            | `/firewall`            | `module_firewall`            | CRUD /rules, POST /dry-run, POST /apply, GET /changes, GET /hosts                                                       | `apps/api/src/routes/firewall.ts`            |
| K8s                 | `/k8s`                 | `module_k8s`                 | CRUD /clusters, GET /:clusterId/resources/:type, POST sync, GET /events, GET /overview                                  | `apps/api/src/routes/k8s.ts`                 |
| SSL                 | `/ssl`                 | `module_ssl`                 | CRUD /certificates, POST /check/:id, POST /check-all, GET /alerts, POST /acknowledge, GET /stats                        | `apps/api/src/routes/ssl.ts`                 |
| Backup              | `/backups`             | `module_backup`              | CRUD /jobs, POST /run, POST /verify, GET /snapshots, POST /restore, GET /restores, GET /stats                           | `apps/api/src/routes/backup.ts`              |
| Notifications       | `/notifications`       | `module_notifications`       | CRUD /channels, POST /test, CRUD /rules, POST /send, GET /log, GET /stats                                               | `apps/api/src/routes/notifications.ts`       |
| Assets              | `/assets`              | `module_assets`              | CRUD, CRUD /:id/licenses, GET /stats/overview                                                                           | `apps/api/src/routes/assets.ts`              |
| Capacity            | `/capacity`            | `module_capacity`            | GET/POST /metrics, POST /batch, CRUD /thresholds, GET /forecast                                                         | `apps/api/src/routes/capacity.ts`            |
| Compliance          | `/compliance`          | `module_compliance`          | CRUD /policies, CRUD /scans, GET/PUT /violations, GET /stats                                                            | `apps/api/src/routes/compliance.ts`          |
| Tickets             | `/tickets`             | `module_tickets`             | CRUD /categories, CRUD /, CRUD /:id/comments, GET /stats/overview                                                       | `apps/api/src/routes/tickets.ts`             |
| KB                  | `/kb`                  | `module_kb`                  | CRUD /categories, CRUD /articles, GET /stats                                                                            | `apps/api/src/routes/kb.ts`                  |
| System Health       | `/system-health`       | `module_system_health`       | CRUD /checks, POST /run, CRUD /incidents, GET/POST /metrics, GET /diagnostics, GET /score, GET /stats                   | `apps/api/src/routes/system-health.ts`       |
| API Keys            | `/api-keys`            | `module_api_keys`            | CRUD, POST /:id/rotate, GET /:id/usage, GET /stats/overview                                                             | `apps/api/src/routes/api-keys.ts`            |
| Webhooks            | `/webhooks`            | `module_webhooks`            | CRUD, POST /test, POST /trigger, GET /:id/deliveries, POST /retry, GET /stats, POST /verify/:id                         | `apps/api/src/routes/webhooks.ts`            |
| Tasks               | `/tasks`               | `module_tasks`               | CRUD, POST /:id/run, GET /:id/runs, GET /stats/overview                                                                 | `apps/api/src/routes/tasks.ts`               |
| Data Transfer       | `/data-transfer`       | `module_data_transfer`       | GET /whitelist, CRUD /templates, CRUD /exports, CRUD /imports, POST /run, GET /stats                                    | `apps/api/src/routes/data-transfer.ts`       |
| LGPD                | `/lgpd`                | `module_lgpd`                | GET /requests, POST /export, POST /delete, GET /:id                                                                     | `apps/api/src/routes/lgpd.ts`                |
| Escalation          | `/escalation`          | `module_escalation`          | CRUD /policies, POST /trigger, POST /:id/resolve, GET /instances                                                        | `apps/api/src/routes/escalation.ts`          |
| Patches             | `/patches`             | `module_patches`             | GET/POST /, POST /approve, /reject, /install, GET /summary, CRUD /deployments, POST /scans                              | `apps/api/src/routes/patches.ts`             |
| Security Audit      | `/security-audit`      | `module_security_audit`      | CRUD /rules, POST /scan, GET /findings, POST /remediate, POST /false-positive, GET /scans, GET /summary                 | `apps/api/src/routes/security-audit.ts`      |
| Correlation         | `/correlation`         | `module_correlation`         | CRUD /rules, GET /groups, POST /acknowledge, /resolve, /suppress, GET /stats                                            | `apps/api/src/routes/correlation.ts`         |
| Workflows           | `/workflows`           | `module_workflows`           | CRUD, POST /clone, POST /execute, GET /executions, POST /cancel, POST /approve, POST /reject, GET /devices/list         | `apps/api/src/routes/workflows.ts`           |
| Push                | `/push`                | `module_push`                | GET /vapid-public-key, POST /subscribe, POST /unsubscribe, GET /subscriptions, DELETE /:id, POST /test, POST /broadcast | `apps/api/src/routes/push.ts`                |
| Client Portal       | `/client-portal`       | `module_client_portal`       | CRUD /users, GET /overview, GET /services, GET /incidents                                                               | `apps/api/src/routes/client-portal.ts`       |
| ChatOps             | `/chatops`             | `module_chatops`             | POST /webhook/slack, POST /webhook/teams, GET/PUT /config, GET /history, GET /stats                                     | `apps/api/src/routes/chatops.ts`             |
| Status Page         | `/status-page`         | `module_status_page`         | GET /:slug (público), GET/PUT /admin/config                                                                             | `apps/api/src/routes/status-page.ts`         |
| Drift               | `/drift`               | `module_drift`               | CRUD /baselines, POST /scan, GET /detections                                                                            | `apps/api/src/routes/drift.ts`               |
| ITSM                | `/itsm`                | `module_itsm`                | CRUD /connectors, POST /test, POST /create-ticket, GET /sync-log, GET /stats                                            | `apps/api/src/routes/itsm.ts`                |
| Discovery           | `/discovery`           | `module_discovery`           | CRUD /sessions, POST /run, GET /devices, POST /import, GET /links, GET /topology                                        | `apps/api/src/routes/discovery.ts`           |
| Anomaly             | `/anomaly`             | `module_anomaly`             | GET /detections, POST /analyze, PUT /acknowledge, /resolve, /false-positive, GET/PUT /config, GET /stats                | `apps/api/src/routes/anomaly.ts`             |
| Predictions         | `/predictions`         | `module_predictions`         | GET /, POST /analyze, PUT /:id/acknowledge, /mitigate, /occurred, /false-positive, GET/PUT /config, GET /stats          | `apps/api/src/routes/predictions.ts`         |
| FinOps              | `/finops`              | `module_finops`              | GET/POST /costs, GET /summary, GET/POST /optimizations, PUT /:id/status, GET/PUT /budgets, GET /stats                   | `apps/api/src/routes/finops.ts`              |
| Marketplace         | `/marketplace`         | `module_marketplace`         | GET /apps, GET /apps/:slug, GET /installs, POST /install, PUT /configure, /activate, /disable, DELETE, GET /stats       | `apps/api/src/routes/marketplace.ts`         |
| Feature Flags       | `/feature-flags`       | — (sempre ativo)             | CRUD, POST /evaluate, CRUD /overrides, GET /:id/events, GET /stats/overview                                             | `apps/api/src/routes/feature-flags.ts`       |
| Executive Dashboard | `/dashboard/executive` | `module_executive_dashboard` | GET /overview, /trends, /alerts, /summary                                                                               | `apps/api/src/routes/executive-dashboard.ts` |
| Reports             | `/reports`             | `module_reports`             | CRUD, POST /run, GET /deliveries, GET /stats, GET/PUT /branding, GET/PUT /delivery-config                               | `apps/api/src/routes/reports.ts`             |
| Changes             | `/changes`             | `module_changes`             | CRUD, POST /approve, /reject, /implement, /complete, /rollback, CRUD /tasks, GET /calendar/month, GET /stats            | `apps/api/src/routes/changes.ts`             |
| SLA                 | `/sla`                 | `module_sla`                 | CRUD /services, GET /report, CRUD /incidents, CRUD /maintenance, GET /dashboard                                         | `apps/api/src/routes/sla.ts`                 |
| APM                 | `/apm`                 | `module_apm`                 | GET /overview, GET /throughput                                                                                          | `apps/api/src/routes/apm.ts`                 |
| RBAC                | `/rbac`                | — (sempre ativo)             | GET /permissions, GET /roles, GET /roles/:id/permissions, POST /roles, PUT /roles/:id/permissions                       | `apps/api/src/routes/rbac.ts`                |
| Health              | `/health`              | — (público)                  | GET /, GET /live, GET /ready                                                                                            | `apps/api/src/routes/health.ts`              |
| Metrics             | `/metrics`             | — (público)                  | GET / (Prometheus format)                                                                                               | `apps/api/src/routes/metrics.ts`             |
| Docs                | `/docs`                | — (público)                  | GET / (Scalar), GET /ui (Swagger)                                                                                       | `apps/api/src/routes/docs.ts`                |
| WebSocket           | `/ws`                  | — (sempre ativo)             | GET /health, WS /?token=                                                                                                | `apps/api/src/routes/ws.ts`                  |

---

## 4. Regras de Negócio Críticas

### 4.1 Row Level Security (RLS)

#### Mecanismo

Toda tabela tenant-scoped tem RLS habilitado no PostgreSQL. O isolamento funciona assim:

```
1. Middleware tenantContext extrai tenant_id do JWT
2. runWithTenant(tenant_id) → AsyncLocalStorage armazena o tenant_id
3. Antes de cada query, executa: SET LOCAL app.current_tenant_id = 'uuid'
4. PostgreSQL RLS policies filtram automaticamente:
   - SELECT: WHERE tenant_id = current_setting('app.current_tenant_id')
   - INSERT: WITH CHECK (tenant_id = current_setting('app.current_tenant_id'))
   - UPDATE/DELETE: USING (tenant_id = current_setting('app.current_tenant_id'))
```

#### Tabelas globais (não filtradas por RLS)

Tabelas em `public.*` não têm RLS (são globais):

- `public.users` — usuários globais
- `public.tenants` — catálogo de tenants
- `public.tenant_users` — associação usuário ↔ tenant
- `public.tenant_routes` — mapeamento tenant → cluster
- `public.sessions` — sessões de autenticação
- `public.trusted_devices` — dispositivos confiáveis
- `public.user_mfa_totp` — secrets TOTP
- `public.mfa_challenges` — challenges MFA
- `public.schema_migrations` — controle de migrations

#### O que o frontend precisa saber

- O `tenant_id` **não** é enviado pelo frontend em nenhuma request — é extraído do JWT pelo backend
- O frontend **não deve** tentar filtrar dados por tenant — o RLS faz isso automaticamente
- Ao criar registros, o `tenant_id` é injetado automaticamente pelo contexto do RLS
- Um usuário com `scope: "global"` (admin) pode ver dados de qualquer tenant porque o middleware `tenantContext` usa o `tenant_id` do JWT, que é o tenant primário do admin

### 4.2 Permissões (RBAC)

#### Mecanismo

```
1. requirePermission("tickets:write") é chamado como middleware
2. Busca permissões do usuário: SELECT * FROM public.get_user_permissions($1)
3. getPermissionChecker(userId, roles, fetcher) constrói um checker
4. checker("tickets:write") verifica se a permissão existe
5. Se não: 403 FORBIDDEN { error: { code: "FORBIDDEN", message: "Permissão necessária: tickets:write" } }
```

#### Estrutura de permissões

Formato: `modulo:recurso:acao`

Exemplos:

- `admin:tenants:read` — ler tenants
- `admin:tenants:write` — criar/editar tenants
- `tenant:users:read` — listar usuários do tenant
- `tenant:users:write` — editar usuários
- `tenant:users:delete` — deletar usuários
- `self:profile:read` — ler próprio perfil
- `self:profile:write` — editar próprio perfil
- `self:mfa:read` — ver status MFA
- `self:mfa:write` — configurar/desativar MFA
- `settings:read` — ler configurações do tenant
- `settings:write` — editar configurações do tenant
- `feature_flags:read` / `feature_flags:write`
- `zabbix:devices:read`

#### Bypass em testes

```typescript
// apps/api/src/middleware/require-permission.ts:25-28
if (process.env.NODE_ENV === "test") {
  await next();
  return;
}
```

Em ambiente de teste, **todas as permissões são bypassadas**. O frontend não precisa se preocupar com isso.

#### O que o frontend precisa saber

- O frontend **não deve** tentar validar permissões — apenas o backend tem autoridade
- O frontend pode **esconder** UI elements baseado em `scope` e `roles` do JWT (UX), mas o backend sempre revalida
- Se uma request retornar `403 FORBIDDEN`, o frontend deve mostrar mensagem amigável
- O campo `roles` no JWT contém todas as roles do usuário em todos os tenants (ex: `["global:admin", "tenant:operator"]`)

### 4.3 Feature Flags

#### Mecanismo

```
1. requireModule("module_devices") é chamado antes da rota
2. Verifica no DB se a feature flag "module_devices" está ativa para o tenant
3. Se desligada: 403 { error: { code: "MODULE_DISABLED", message: "Módulo não habilitado" } }
4. Se ligada: prossegue para a rota
```

#### Módulos sempre ativos (sem requireModule)

| Módulo        | Razão                                      |
| ------------- | ------------------------------------------ |
| Zabbix        | Núcleo do produto — monitoramento é a base |
| MFA           | Segurança — sempre disponível              |
| RBAC          | Segurança — sempre disponível              |
| Users         | Gestão básica — sempre disponível          |
| Feature Flags | Meta — gerenciar as próprias flags         |
| Profile       | Self-service — sempre disponível           |
| Settings      | Configuração básica — sempre disponível    |
| Dashboard     | Visão geral — sempre disponível            |
| WebSocket     | Realtime — sempre disponível               |

#### O que o frontend precisa saber

- Antes de navegar para uma rota de módulo opcional, o frontend deve verificar se o módulo está ativo
- `GET /api/v1/settings/modules` retorna a lista de módulos e seus status
- `GET /api/v1/dashboard/navigation` retorna apenas itens de navegação de módulos ativos
- Se uma request retornar `403 MODULE_DISABLED`, o frontend deve esconder/redirecionar
- O middleware edge do Next.js pode fazer bloqueio precoce se tiver a lista de flags no cookie

### 4.4 Rate Limiting

| Tipo              | Escopo                  | Limite                   | Aplicação                  |
| ----------------- | ----------------------- | ------------------------ | -------------------------- |
| `rateLimitApi`    | Global (todas as rotas) | Configurável via env     | Todas as rotas `/api/v1/*` |
| `rateLimitAuth`   | Rotas de auth           | Mais restrito que global | `/api/v1/auth/*`           |
| `rateLimitTenant` | Por tenant              | 100 req/min              | `/api/v1/zabbix/*`         |

#### Rate limit por tenant (Zabbix)

- Conta total de requests por tenant, independente de quantos usuários/IPs
- Distribuído via Redis (funciona com múltiplas réplicas)
- Protege API Zabbix de sobrecarga por um único tenant
- O frontend deve implementar retry com backoff exponencial se receber `429 TOO_MANY_REQUESTS`

#### O que o frontend precisa saber

- Se receber `429`, deve mostrar "Muitas requisições, tente novamente em X segundos"
- Não deve fazer polling agressivo sem intervalo mínimo
- Debounce em inputs de busca (mínimo 300ms)
- Cache de responses no client (SWR com `dedupingInterval`)

### 4.5 Cache (Redis)

#### Cache de responses Zabbix

| Tipo de endpoint                 | TTL           | Invalidez                                                   |
| -------------------------------- | ------------- | ----------------------------------------------------------- |
| Listagens (hosts, graphs, items) | 10s           | Mutações (POST/PUT/DELETE) invalidam via `cacheDelByPrefix` |
| History/data                     | 5s            | —                                                           |
| Ping                             | 0 (sem cache) | —                                                           |

#### Cache de permissões

- `getPermissionChecker(userId, roles, fetcher)` cacheia permissões em memória
- TTL: enquanto a request estiver sendo processada
- Não há invalidação ativa — cada request busca permissões frescas do DB

#### O que o frontend precisa saber

- GETs podem retornar dados com até 10s de atraso (cache Zabbix)
- Após uma mutação (POST/PUT/DELETE), o backend invalida o cache automaticamente
- O frontend não precisa fazer invalidação manual
- SWR com `refreshInterval` deve respeitar o TTL do backend (não fazer refresh mais frequente que 10s para listagens)

### 4.6 Circuit Breaker (Zabbix)

#### Estados

```
CLOSED (normal)
  ↓ 5 falhas consecutivas
OPEN (rejeita imediatamente, sem timeout de 30s)
  ↓ 30 segundos
HALF_OPEN (permite 3 chamadas de teste)
  ↓ sucesso em half_open
CLOSED (retoma normal)
  ↓ falha em half_open
OPEN (volta a rejeitar)
```

#### Regras

- Apenas falhas de conexão/timeout contam como falha de circuito
- Erros de negócio (Zabbix retorna `json.error`) **não** contam como falha
- Estado compartilhado entre réplicas via Redis
- Quando OPEN, retorna `502 ZABBIX_UNREACHABLE` imediatamente

#### O que o frontend precisa saber

- Se receber `502 ZABBIX_UNREACHABLE`, o Zabbix pode estar temporariamente indisponível
- Não deve fazer retry imediato — o circuito precisa de 30s para tentar half-open
- Mostrar mensagem "Servidor de monitoramento temporariamente indisponível"

### 4.7 Particionamento e TimescaleDB

#### Particionamento (RANGE por created_at)

| Tabela             | Retenção | Worker                       |
| ------------------ | -------- | ---------------------------- |
| `system_logs`      | 6 meses  | `partition-manager` (diário) |
| `trace_spans`      | 1 mês    | `partition-manager`          |
| `capacity_metrics` | 12 meses | `partition-manager`          |

O worker `partition-manager` roda diariamente:

- Cria partições futuras (3 meses lookahead)
- Droppa partições antigas automaticamente (`DROP TABLE CASCADE`)

#### TimescaleDB (system_metrics)

| Configuração       | Valor                               |
| ------------------ | ----------------------------------- |
| Chunk interval     | 1 dia                               |
| Compression policy | dados > 7 dias (90% redução)        |
| Retention policy   | dados > 90 dias                     |
| Fallback           | Graceful se extensão não disponível |

O worker `metrics-collector` coleta métricas internas a cada 60s e escreve em `system_metrics`.

#### O que o frontend precisa saber

- Dados de logs/traces têm retenção limitada — não assumir que dados antigos estarão disponíveis
- Queries com `from` muito antigo podem retornar vazio (partição foi droppada)
- O frontend deve limitar date pickers para o período de retenção relevante

### 4.8 Discrepâncias Críticas (Conflitos de Código)

#### DISCREPÂNCIA #1: `updateProfileSchema` não aceita os campos que o backend lê

**Arquivos envolvidos:**

- `packages/shared-validation/src/index.ts:53-56` — schema Zod
- `apps/api/src/routes/profile.ts:73-123` — rota backend

**O que acontece:**

```typescript
// Schema define (linha 53-56):
export const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

// Backend lê (linha 87-107):
const fieldMap = {
  display_name: "display_name",
  bio: "bio",
  phone: "phone",
  location: "location",
  timezone: "timezone",
  locale: "locale",
  job_title: "job_title",
  department: "department",
};
// Também lê: skills, social_links
```

**Impacto:** O Zod faz strip de `display_name`, `bio`, `phone`, etc. (não estão no schema). `parsed.data` só contém `full_name` e `email` (se enviados). O `fieldMap` itera sobre as chaves, mas todas são `undefined` em `parsed.data`. **O perfil nunca é atualizado** — retorna `{ updated: true }` mas nada foi gravado no DB.

**Como tratar:** O frontend deve saber que PUT /profile atualmente **não funciona** para os campos `display_name`, `bio`, `phone`, `location`, `timezone`, `job_title`, `department`, `skills`, `social_links`. A correção requer atualizar o `updateProfileSchema` para incluir todos os campos que o backend lê.

---

#### DISCREPÂNCIA #2: `updateAvatarSchema` exige `avatar_url` mas backend lê `avatar_initials`/`avatar_color`

**Arquivos envolvidos:**

- `packages/shared-validation/src/index.ts:64-66` — schema Zod
- `apps/api/src/routes/profile.ts:127-170` — rota backend

**O que acontece:**

```typescript
// Schema define (linha 64-66):
export const updateAvatarSchema = z.object({
  avatar_url: z.string().url(),  // OBRIGATÓRIO
});

// Backend lê (linha 141-153):
if (data.avatar_url !== undefined) { ... }
if (data.avatar_initials !== undefined) { ... }  // Zod removeu este campo
if (data.avatar_color !== undefined) { ... }     // Zod removeu este campo
```

**Impacto:** Se o frontend enviar `{ avatar_initials: "AD", avatar_color: "#3B82F6" }` sem `avatar_url`, o Zod rejeita com 400 (avatar_url é obrigatório). Se enviar `avatar_url` junto, `avatar_initials` e `avatar_color` são removidos pelo Zod strip. **O avatar por iniciais/cor nunca é atualizado.**

**Como tratar:** O frontend deve saber que PUT /profile/avatar atualmente **só funciona** para `avatar_url` (URL de imagem). Para usar iniciais/cor, é necessário corrigir o schema.

---

#### DISCREPÂNCIA #3: `updatePreferencesSchema` exige wrapper mas backend lê campos planos

**Arquivos envolvidos:**

- `packages/shared-validation/src/index.ts:59-61` — schema Zod
- `apps/api/src/routes/profile.ts:189-236` — rota backend

**O que acontece:**

```typescript
// Schema define (linha 59-61):
export const updatePreferencesSchema = z.object({
  preferences: z.record(z.unknown()), // wrapper obrigatório
});

// Backend lê (linha 203-208):
const fieldMap = {
  notification_email: "notification_email",
  notification_push: "notification_push",
  // ... campos planos
};
// Itera sobre data[key] — mas data = { preferences: {...} }, não { notification_email: ... }
```

**Impacto:** Se o frontend enviar campos planos (`{ notification_email: true, theme: "dark" }`), o Zod rejeita com 400 (espera `{ preferences: {...} }`). Se enviar `{ preferences: { notification_email: true } }`, o Zod aceita, mas o backend lê `data.notification_email` que é `undefined` (está dentro de `data.preferences`). **As preferências nunca são atualizadas.**

**Como tratar:** O frontend deve saber que PUT /profile/preferences atualmente **não funciona**. A correção requer alinhar o schema com o formato que o backend espera (campos planos).

---

#### DISCREPÂNCIA #4: `scope` ausente no retorno das rotas auth do frontend

**Arquivos envolvidos:**

- `apps/web/app/api/auth/login/route.ts:50-54` — rota Next.js de login
- `apps/web/app/api/auth/mfa-verify/route.ts:26-30` — rota Next.js de MFA verify

**O que acontece:**

```typescript
// Login route (linha 50-54):
const response = NextResponse.json({
  user: typedData.user,
  tenants: typedData.tenants,
  must_change_password: typedData.must_change_password ?? false,
  // scope NÃO é incluído
});

// MFA verify route (linha 26-30):
const response = NextResponse.json({
  user: typedData.user,
  tenants: typedData.tenants,
  must_change_password: typedData.must_change_password ?? false,
  // scope NÃO é incluído
});
```

**Impacto:** O frontend lê `data.scope` para decidir redirecionamento pós-login (`/admin` para `global`, `/dashboard` para `tenant`). Como `scope` é sempre `undefined`, o redirecionamento cai no fallback e **admins sempre vão para `/dashboard`** em vez de `/admin`.

**Como tratar:** O frontend deve obter `scope` de `GET /api/v1/auth/me` após o login (que retorna `scope` corretamente). Ou corrigir as rotas Next.js para incluir `scope` no JSON de resposta.

---

#### DISCREPÂNCIA #5: `/api/v1/drift` não está em `protectedPaths`

**Arquivos envolvidos:**

- `apps/api/src/index.ts:172-209` — lista `protectedPaths`
- `apps/api/src/index.ts:325-326` — montagem da rota drift

**O que acontece:**

```typescript
// protectedPaths (linha 172-209) — drift NÃO está listado
const protectedPaths = [
  "/api/v1/devices",
  "/api/v1/mfa",
  "/api/v1/audit",
  // ... 35 paths, mas SEM "/api/v1/drift"
];

// Mas drift é montado com requireModule (linha 325-326):
app.use("/api/v1/drift/*", requireModule("module_drift"));
app.route("/api/v1/drift", driftRoute);
```

**Impacto:** A rota `/api/v1/drift` **não recebe** `jwtAuth` + `tenantContext` + `auditMiddleware` globais. O `requireModule` verifica a feature flag, mas não há verificação de JWT nem isolamento de tenant. **Possível brecha de segurança** — qualquer request (mesmo sem token) pode acessar se a feature flag estiver ativa.

**Como tratar:** Adicionar `"/api/v1/drift"` ao array `protectedPaths`. O frontend deve tratar drift como módulo protegido (requer autenticação).

---

#### DISCREPÂNCIA #6: `GET /users/all` sem `requirePermission` explícita

**Arquivos envolvidos:**

- `apps/api/src/routes/users.ts` — rota `GET /all`

**O que acontece:** A rota `GET /api/v1/users/all` tem apenas `jwtAuth` + `tenantContext`, mas **sem** `requirePermission("tenant:users:read")`. Todas as outras rotas de users têm permissão explícita.

**Impacto:** Qualquer usuário autenticado pode listar todos os usuários (sem filtro de tenant), independente de ter a permissão `tenant:users:read`.

**Como tratar:** O frontend não deve depender disso — pode ser corrigido a qualquer momento adicionando `requirePermission`.

---

#### Resumo das Discrepâncias

| #   | Problema                                           | Severidade | Impacto no Frontend                     |
| --- | -------------------------------------------------- | ---------- | --------------------------------------- |
| 1   | `updateProfileSchema` não aceita campos do backend | 🔴 Alta    | PUT /profile não atualiza nada          |
| 2   | `updateAvatarSchema` exige avatar_url              | 🔴 Alta    | PUT /profile/avatar só funciona com URL |
| 3   | `updatePreferencesSchema` exige wrapper            | 🔴 Alta    | PUT /profile/preferences não funciona   |
| 4   | `scope` ausente no login/mfa-verify                | 🟡 Média   | Admins não redirecionam para /admin     |
| 5   | Drift fora de protectedPaths                       | 🔴 Alta    | Brecha de segurança                     |
| 6   | /users/all sem permissão                           | 🟡 Média   | Qualquer user lista todos os usuários   |

---

> **Fim do documento.** Para detalhes arquiteturais de alto nível (ADRs, princípios DNA/Cérebro, PgBouncer, etc.), consulte `docs/ARCHITECTURE.md`.

---

# Apêndice: Correções Aplicadas (2026-08-02)

## Resumo

Todas as 16 discrepâncias identificadas na análise profunda foram corrigidas na raiz, sem workarounds. Cada correção foi commitada e testada individualmente (101 testes passando em todos os commits).

## P0 — Correções Críticas

### D12 — Refresh token em texto plano (OAuth/LDAP) → CORRIGIDO

- **Arquivo**: `apps/api/src/routes/auth.ts` (OAuth callback + LDAP bind)
- **Causa raiz**: OAuth e LDAP armazenavam o refresh token diretamente em `refresh_token_hash` sem aplicar hash SHA256, ao contrário do login normal que hasheava corretamente.
- **Solução**: Extraído helper `generateAndStoreTokens()` em `@repo/auth` que centraliza assinatura de tokens + armazenamento de jti no Redis + hash SHA256 do refresh token. Todos os 4 fluxos (login, refresh, OAuth, LDAP) agora usam o mesmo helper, garantindo consistência total.

### D15 — `PUT /users/:userId/status` sem isolamento de tenant → CORRIGIDO

- **Arquivo**: `apps/api/src/routes/users.ts`
- **Causa raiz**: Query `UPDATE public.users SET is_active = $1 WHERE id = $2` não filtrava por tenant, permitindo que admin de tenant A desativasse usuário de tenant B.
- **Solução**: Adicionada subquery `AND id IN (SELECT user_id FROM public.tenant_users WHERE tenant_id = $3)` + verificação de `rowCount === 0` retornando 404.

## P1 — Correções Altas

### D1, D2 — `scope` não retornado no BFF (login + mfa-verify) → CORRIGIDO

- **Arquivos**: `apps/web/app/api/auth/login/route.ts`, `apps/web/app/api/auth/mfa-verify/route.ts`
- **Causa raiz**: O BFF Next.js não repassava o campo `scope` retornado pelo backend na resposta ao frontend.
- **Solução**: Adicionado `scope: typedData.scope` na resposta JSON de ambas as rotas.

### D7, D8, D9 — Schemas Zod de profile incompletos → CORRIGIDO

- **Arquivo**: `packages/shared-validation/src/index.ts`
- **Causa raiz**: `updateProfileSchema` só tinha `full_name` e `email`; `updateAvatarSchema` só tinha `avatar_url`; `updatePreferencesSchema` era `z.record(z.unknown())` (aceitava qualquer coisa).
- **Solução**:
  - `updateProfileSchema` expandido com: `display_name`, `bio`, `phone`, `location`, `timezone`, `locale`, `job_title`, `department`, `skills`, `social_links`
  - `updateAvatarSchema` expandido com: `avatar_initials`, `avatar_color` (todos opcionais)
  - `updatePreferencesSchema` substituído por schema tipado com: `notification_email`, `notification_push`, `notification_sms`, `notification_digest_frequency` (enum), `quiet_hours_start/end`, `theme` (enum), `density` (enum), `sidebar_collapsed`, `dashboard_layout`

### D10, D11 — Rotas `/users` sem validação Zod → CORRIGIDO

- **Arquivos**: `apps/api/src/routes/users.ts`, `packages/shared-validation/src/index.ts`
- **Causa raiz**: `POST /users` fazia validação manual (`if (!email || !password || !role)`) aceitando senhas de 1 caractere. `POST /users/custom-roles` aceitava `key` sem validação de schema.
- **Solução**: Criados `createTenantUserSchema` (valida `password: min(8)`, `email`, `role`, `scope`) e `createCustomRoleSchema` (valida `key`, `description`, `permissions`). Rotas agora usam `safeParse()` em vez de validação manual.

### D13, D14 — OAuth/LDAP não retornavam `scope` nos tenants → CORRIGIDO

- **Arquivo**: `apps/api/src/routes/auth.ts`
- **Causa raiz**: Responses do OAuth callback e LDAP bind não incluíam `scope` no corpo nem nos items de `tenants`.
- **Solução**: Adicionado `scope: userScope` no response e `scope: r.scope` em cada item de tenants, alinhando com o contrato do login normal.

### D16 — `requireModule` não cobria rota raiz → CORRIGIDO

- **Arquivo**: `apps/api/src/index.ts`
- **Causa raiz**: `requireModule` era registrado apenas em `/api/v1/X/*` mas não em `/api/v1/X` (sem barra), permitindo bypass de feature flag na rota raiz.
- **Solução**: Adicionado `app.use("/api/v1/X", requireModule(...))` para todos os 36 módulos, cobrindo tanto a rota raiz quanto sub-rotas.

### D5, A3 — `protectedPaths` manual e desatualizado → CORRIGIDO

- **Arquivo**: `apps/api/src/index.ts`
- **Causa raiz**: Lista manual de 27 paths que faltavam 16 módulos (lgpd, escalation, patches, security-audit, correlation, workflows, push, chatops, status-page, drift, itsm, discovery, anomaly, predictions, finops, marketplace).
- **Solução**: Substituído por middleware global `app.use("/api/v1/*", jwtAuth)` + `tenantContext` + `auditMiddleware`. Rotas públicas (health, metrics, docs, auth) são montadas antes do middleware global e portanto não são afetadas.

## P2 — Correções Médias

### S3 — `tenantContext` permitia execução sem tenant → CORRIGIDO

- **Arquivo**: `apps/api/src/middleware/tenant-context.ts`
- **Causa raiz**: Se `user.tenant_id` fosse null/undefined, o middleware chamava `next()` sem `runWithTenant()`, desativando RLS silenciosamente.
- **Solução**: Middleware agora retorna 403 se `tenant_id` estiver ausente, exceto para usuários com `scope: "global"` (que operam em tabelas `public.*` sem RLS).

### S2 — Bypass de permissões via `NODE_ENV === "test"` → CORRIGIDO

- **Arquivo**: `apps/api/src/middleware/require-permission.ts`
- **Causa raiz**: Checar `NODE_ENV === "test"` para bypass de permissões é inseguro — se `NODE_ENV` for mal configurado em produção, o sistema fica sem autorização.
- **Solução**: Substituído por flag explícita `BYPASS_PERMISSIONS=true`, configurada apenas no `vitest.setup.ts`.

### A2 — Duplicação de geração de tokens em 4 fluxos → CORRIGIDO

- **Arquivo**: `packages/auth/src/index.ts` + todas as rotas que geram tokens
- **Causa raiz**: Código de `signAccessToken` + `signRefreshToken` + `storeRefreshJti` + hash era duplicado em login, refresh, OAuth e LDAP.
- **Solução**: Helper `generateAndStoreTokens()` centraliza toda a lógica. Todos os 4 fluxos agora chamam o mesmo helper.

### D4 — Fallbacks `?? "tenant"` redundantes → CORRIGIDO

- **Arquivos**: `apps/api/src/routes/auth.ts`, `apps/api/src/routes/mfa.ts`
- **Causa raiz**: Após a migration corrigir `get_tenant_user_auth` para retornar `scope`, os fallbacks `?? "tenant"` nas rotas eram redundantes e mascaravam erros.
- **Solução**: Removidos fallbacks em login, OAuth e LDAP. MFA verify agora retorna 403 se scope estiver ausente. O fallback permanece apenas em `jwtAuth` (última linha de defesa) e no refresh token (compatibilidade retroativa com tokens emitidos antes da correção).

## Correções Adicionais

### `generateTotpSetup` — Return type incorreto → CORRIGIDO

- **Arquivo**: `packages/auth/src/index.ts`
- **Causa raiz**: Retornava `otpauthUrl` mas `mfa.ts` acessava `qr_code_uri`. Não gerava `recovery_codes`.
- **Solução**: Corrigido para retornar `qr_code_uri` e `recovery_codes` (10 códigos hex de 16 chars).

### `verifyRecoveryCode` — Assinatura invertida → CORRIGIDO

- **Arquivo**: `packages/auth/src/index.ts`
- **Causa raiz**: Recebia `(hashedCode: string, inputCode: string)` mas era chamado com `(inputCode, hashedCodes[])`.
- **Solução**: Corrigido para `verifyRecoveryCode(inputCode: string, hashedCodes: string[]): boolean`.

## Commits (em ordem cronológica)

| Commit    | Descrição                                                            |
| --------- | -------------------------------------------------------------------- |
| `b346848` | `fix(auth): add token helper, fix totp setup and recovery code`      |
| `4efc7f4` | `fix(auth): use token helper, hash refresh in oauth/ldap, add scope` |
| `4ec70b3` | `fix(bff): return scope in login and mfa-verify responses`           |
| `edb763e` | `fix(users): use zod schemas and enforce tenant isolation`           |
| `9319677` | `fix(validation): expand profile schemas to match route fields`      |
| `769c063` | `fix(tests): update preferences schema tests for new flat structure` |
| `c152c6c` | `fix(api): global auth middleware and requireModule root coverage`   |
| `873bfac` | `fix(security): enforce tenant_id and explicit bypass flag`          |
| `1d370f3` | `fix(auth): remove redundant scope fallbacks`                        |
