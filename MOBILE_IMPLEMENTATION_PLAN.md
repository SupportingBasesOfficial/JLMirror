# Plano de Implementação — App Mobile Nativo (React Native + Expo)

> **Branch proposta:** `feature/mobile-app`
> **Stack:** React Native + Expo (SDK 52) + TypeScript
> **Reuso:** 100% da API existente + schemas Zod do `@repo/shared-validation`
> **Prazo estimado:** 6 fases (MVP em 2 semanas, app completo em 6-8 semanas)

---

## Estado Atual (O que já existe e será reaproveitado)

### Backend (100% mobile-ready)

- **API REST** — Hono na porta 3001, 60+ módulos de rota, JWT RS256 stateless
- **WebSocket** — `ws://host:3001/ws?token=<jwt>` para alerts em tempo real (Redis Pub/Sub)
- **Auth** — login, refresh, logout, MFA TOTP, change-password, forgot/reset, OAuth Google
- **RBAC + RLS** — permissões granulares, isolamento multi-tenant no banco
- **API Keys** — tokens de longa duração para background sync
- **Push** — Web Push (VAPID) funcionando; precisa de Expo Notifications para nativo
- **Trusted Devices** — fingerprint + user-agent genérico, funciona com device_id nativo

### Pacotes compartilháveis (zero retrabalho)

- `@repo/shared-validation` — 2.337 linhas de schemas Zod + tipos inferidos
  - `LoginInput`, `MfaVerifyInput`, `ChangePasswordInput`, `UpdateProfileInput`
  - Schemas de Zabbix, tickets, dashboard, billing, etc.
  - **Pode ser importado diretamente pelo app Expo** (é TypeScript puro + Zod)
- `@repo/logger` — logger estruturado Pino (compatível com React Native)
- `@repo/telemetry` — OpenTelemetry traces (compatível com React Native)

### Frontend web (referência de UX, não reutilizável diretamente)

- 50+ páginas em `apps/web/app/(admin)/`
- `lib/api-routes.ts` — 483 linhas, registry centralizado de rotas + tipos de resposta
- `lib/use-auth.ts` — hook de auth unificado (referência de lógica)
- Componentes `@repo/ui` — usam `lucide-react` (web), precisam de equivalentes nativos

---

## Arquitetura do App Mobile

```
apps/mobile/                    ← Novo app Expo no monorepo
├── app/                        ← Expo Router (file-based, igual ao Next.js)
│   ├── (auth)/
│   │   ├── login.tsx           ← Tela de login
│   │   ├── mfa-verify.tsx      ← Verificação MFA TOTP
│   │   └── reset-password.tsx  ← Reset de senha
│   ├── (tabs)/
│   │   ├── _layout.tsx         ← Bottom tab navigator
│   │   ├── index.tsx           ← Dashboard (KPIs + gráficos)
│   │   ├── devices.tsx         ← Lista de dispositivos Zabbix
│   │   ├── alerts.tsx          ← Alertas em tempo real (WebSocket)
│   │   ├── tickets.tsx         ← Tickets de suporte
│   │   └── profile.tsx         ← Perfil + settings
│   ├── device/[id].tsx         ← Detalhe de dispositivo
│   ├── ticket/[id].tsx         ← Detalhe de ticket
│   └── _layout.tsx             ← Root layout (auth gate)
├── src/
│   ├── lib/
│   │   ├── api-client.ts       ← HTTP client com interceptors (auth, refresh, retry)
│   │   ├── api-routes.ts       ← Port do apps/web/lib/api-routes.ts (tipos shared)
│   │   ├── auth-context.tsx    ← Auth provider (token storage + refresh automático)
│   │   ├── ws-client.ts        ← WebSocket client com reconnect
│   │   └── secure-storage.ts   ← SecureStore (Keychain iOS / Keystore Android)
│   ├── hooks/
│   │   ├── use-auth.ts         ← Hook de auth (espelha apps/web/lib/use-auth.ts)
│   │   ├── use-dashboard.ts    ← SWR/TanStack Query para dashboard
│   │   ├── use-devices.ts      ← Lista de dispositivos
│   │   ├── use-alerts.ts       ← Alerts em tempo real via WS
│   │   └── use-push.ts         ← Expo Notifications (register + handlers)
│   ├── components/
│   │   ├── ui/                 ← Componentes atômicos nativos
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── badge.tsx
│   │   │   └── chart.tsx       ← Wrapper de victory-native ou react-native-gifted-charts
│   │   ├── device-card.tsx
│   │   ├── alert-item.tsx
│   │   └── kpi-card.tsx
│   └── theme/
│       ├── colors.ts           ← Port de apps/web/tailwind.config.ts
│       └── tokens.ts
├── app.config.ts               ← Expo config (plugins, permissions, EAS)
├── package.json
├── tsconfig.json               ← Estende @repo/typescript-config
└── .env                        ← EXPO_PUBLIC_API_URL, EXPO_PUBLIC_WS_URL
```

---

## Fases de Implementação

### Fase 0 — Setup do Projeto Expo (Dia 1)

**Objetivo:** Criar `apps/mobile` no monorepo, configurar toolchain, validar build.

**Tasks:**

1. `npx create-expo-app@latest apps/mobile --template tabs` (Expo SDK 52, Expo Router)
2. Configurar `apps/mobile/package.json` como workspace do pnpm
3. Adicionar `@repo/shared-validation` como dependency (import direto dos schemas Zod)
4. Configurar `tsconfig.json` estendendo `@repo/typescript-config`
5. Instalar dependências core:
   - `expo-secure-store` — armazenamento seguro de JWT
   - `expo-notifications` — push notifications nativas
   - `expo-router` — navegação file-based
   - `@tanstack/react-query` — data fetching + cache
   - `react-native-safe-area-context` — safe areas
   - `nativewind` — TailwindCSS para React Native (mesmo design system do web)
6. Configurar `app.config.ts` com:
   - Bundle identifier: `com.jlinformatica.jlmirror`
   - Permissions: `notifications`, `camera` (para QR MFA), `faceid` (biometria)
7. Validar: `npx expo start` abre Metro Bundler, app roda no Expo Go

**Entrega:** App Expo boilerplate rodando no emulador/dispositivo.

---

### Fase 1 — Auth + API Client (Dias 2-4)

**Objetivo:** Login funcional, JWT persistido, refresh automático, MFA TOTP.

**Tasks:**

1. **`src/lib/secure-storage.ts`** — wrapper sobre `expo-secure-store`:
   - `saveToken(key, value)` / `getToken(key)` / `deleteToken(key)`
   - Chaves: `access_token`, `refresh_token`, `user_data`

2. **`src/lib/api-client.ts`** — HTTP client baseado em `fetch` nativo:
   - Interceptor de request: injeta `Authorization: Bearer <access_token>`
   - Interceptor de response: se 401, tenta refresh automático (1x), depois logout
   - Base URL de `EXPO_PUBLIC_API_URL` (ex: `http://localhost:3001/api/v1`)
   - Tipos de resposta importados de `@repo/shared-validation`

3. **`src/lib/auth-context.tsx`** — React Context provider:
   - Estado: `{ user, tenants, isLoading, isAuthenticated }`
   - `login(email, password)` → POST `/auth/login` → salva tokens → seta user
   - `verifyMfa(code)` → POST `/mfa/verify` → salva tokens
   - `logout()` → POST `/auth/logout` → limpa tokens → reset state
   - `refreshSession()` → POST `/auth/refresh` → renova access_token
   - On app start: verifica se tem token salvo → GET `/auth/me` → hidrata state

4. **`src/lib/api-routes.ts`** — port de `apps/web/lib/api-routes.ts`:
   - Mesmas constantes e tipos de resposta
   - Adapta para usar `EXPO_PUBLIC_API_URL` como base (sem BFF proxy)

5. **`app/(auth)/login.tsx`** — tela de login:
   - Campos: email, password
   - Validação: `loginInputSchema.parse()` (importado de `@repo/shared-validation`)
   - On success: se MFA habilitado → navega para `/mfa-verify` com `challengeToken`
   - On error: exibe mensagem (INVALID_CREDENTIALS, USER_INACTIVE, etc.)

6. **`app/(auth)/mfa-verify.tsx`** — tela de MFA:
   - Campo: código TOTP de 6 dígitos
   - Validação: `mfaVerifySchema.parse()`
   - Suporte a biometria (FaceID/TouchID) como atalho opcional

7. **`app/_layout.tsx`** — root layout com auth gate:
   - Se `!isAuthenticated` → redirect para `/(auth)/login`
   - Se `isAuthenticated` → renderiza `/(tabs)/`

**Validação:**

- Login com `admin@jlmirror.com` / `admin123` funciona
- Token persiste após fechar e reabrir o app
- Refresh automático quando access_token expira (15 min)
- Logout limpa tudo

**Entrega:** App com login funcional, MFA, sessão persistente.

---

### Fase 2 — Dashboard + Bottom Tabs (Dias 5-7)

**Objetivo:** Dashboard com KPIs, navegação por tabs, gráficos nativos.

**Tasks:**

1. **`app/(tabs)/_layout.tsx`** — bottom tab navigator:
   - Tabs: Dashboard, Devices, Alerts, Tickets, Profile
   - Ícones: `@expo/vector-icons` (Ionicons ou MaterialIcons)
   - Badge no tab Alerts (contador de alertas não lidos)

2. **`src/hooks/use-dashboard.ts`** — TanStack Query:
   - `GET /dashboard/overview` → KPIs (devices, tickets, compliance, SSL, backups)
   - `refetchInterval: 30_000` (auto-refresh a cada 30s)
   - Tipos: `DashboardOverviewResponse` (de api-routes.ts)

3. **`app/(tabs)/index.tsx`** — dashboard:
   - KPI cards: dispositivos online, tickets abertos, compliance rate
   - Gráfico de linha: métricas do sistema (system_metrics hypertable)
   - Pull-to-refresh
   - Loading skeleton + error state

4. **`src/components/kpi-card.tsx`** — card de KPI reutilizável:
   - Props: `label`, `value`, `icon`, `color`, `onPress`
   - NativeWind para estilização (mesmas classes do web)

5. **`src/components/ui/chart.tsx`** — wrapper de gráfico:
   - Biblioteca: `react-native-gifted-charts` (LineChart, BarChart)
   - Props tipadas, tema escuro/claro

**Validação:**

- Dashboard carrega KPIs da API (27 devices, 0 tickets)
- Gráfico renderiza system_metrics
- Pull-to-refresh funciona
- Tabs navegam corretamente

**Entrega:** Dashboard funcional com dados reais da API.

---

### Fase 3 — Devices + Alerts em Tempo Real (Dias 8-11)

**Objetivo:** Lista de dispositivos Zabbix, detalhe, alerts via WebSocket.

**Tasks:**

1. **`src/hooks/use-devices.ts`** — TanStack Query:
   - `GET /devices` → lista paginada
   - `GET /devices/:id` → detalhe com histórico

2. **`app/(tabs)/devices.tsx`** — lista de dispositivos:
   - FlatList com `DeviceCard` (nome, status, host, último valor)
   - Filtro por status (online/offline/disabled)
   - Busca por nome
   - Pull-to-refresh + infinite scroll

3. **`app/device/[id].tsx`** — detalhe do dispositivo:
   - Gráfico de histórico (últimas 24h)
   - Lista de triggers ativos
   - Ações: acknowledge, silenciar

4. **`src/lib/ws-client.ts`** — WebSocket client:
   - Conecta em `ws://host:3001/ws?token=<access_token>`
   - Auto-reconnect com backoff exponencial (1s, 2s, 4s, 8s, max 30s)
   - Event emitter: `on('alert', cb)`, `on('dashboard_update', cb)`
   - Heartbeat ping/pong a cada 30s

5. **`src/hooks/use-alerts.ts`** — hook de alerts em tempo real:
   - Estado inicial: `GET /alerts` (lista atual)
   - WebSocket: `on('alert', alert => adiciona na lista)`
   - `useAlerts()` retorna `{ alerts, unreadCount, markAllRead }`

6. **`app/(tabs)/alerts.tsx`** — tela de alerts:
   - FlatList com `AlertItem` (severidade, host, mensagem, timestamp)
   - Badge no tab bar com `unreadCount`
   - Filtro por severidade (critical, warning, info)
   - Tap → detalhe do alerta → link para dispositivo

**Validação:**

- Lista de 27 dispositivos carrega
- Detalhe mostra gráfico de histórico
- WebSocket conecta e recebe alerts em tempo real
- Badge de alerts não lidos atualiza

**Entrega:** Devices + alerts em tempo real funcionando.

---

### Fase 4 — Tickets + Profile (Dias 12-14)

**Objetivo:** CRUD de tickets, perfil do usuário, change password.

**Tasks:**

1. **`src/hooks/use-tickets.ts`** — TanStack Query:
   - `GET /tickets` → lista paginada
   - `GET /tickets/:id` → detalhe com comentários
   - `POST /tickets` → criar novo
   - `POST /tickets/:id/comments` → adicionar comentário

2. **`app/(tabs)/tickets.tsx`** — lista de tickets:
   - FlatList com status badge (open, in_progress, resolved, closed)
   - Filtro por status + prioridade
   - FAB (Floating Action Button) para criar ticket

3. **`app/ticket/[id].tsx`** — detalhe do ticket:
   - Descrição, assignee, status, prioridade
   - Timeline de comentários
   - Input para adicionar comentário
   - Ações: mudar status, assign

4. **`app/(tabs)/profile.tsx`** — perfil:
   - Avatar, nome, email, role
   - Toggle MFA TOTP (setup/verify/disable)
   - Change password
   - Lista de sessões ativas (com revoke)
   - Logout

**Validação:**

- Criar ticket → aparece na lista
- Comentar em ticket → aparece na timeline
- Change password funciona
- Toggle MFA funciona
- Revoke session funciona
- Logout limpa tudo

**Entrega:** MVP completo — login, dashboard, devices, alerts, tickets, profile.

---

### Fase 5 — Push Notifications Nativas (Dias 15-18)

**Objetivo:** Push notifications via Expo Notifications (APNs + FCM).

**Tasks:**

1. **Configurar Expo Notifications:**
   - `npx expo install expo-notifications`
   - Configurar Firebase Cloud Messaging (Android) — `google-services.json`
   - Configurar APNs (iOS) — certificado ou Auth Key p8
   - `app.config.ts`: adicionar `plugins: ["expo-notifications"]`

2. **`src/hooks/use-push.ts`** — hook de push:
   - On app start: requisitar permissão (`Notifications.requestPermissionsAsync()`)
   - Registrar token: `Notifications.getExpoPushTokenAsync()` → POST `/push/subscribe`
   - Handler de notification received (foreground): mostrar in-app banner
   - Handler de notification tap (background): navegar para alerta/ticket
   - Categorías: alert_critical, alert_warning, ticket_update, system

3. **Backend: adaptar `push.ts` para Expo:**
   - Adicionar endpoint `POST /push/expo-subscribe` (recebe `ExpoPushToken`)
   - Adicionar `sendExpoPushNotification()` em `lib/web-push.ts`:
     - Usa `expo-server-sdk` (npm package)
     - Envia push para tokens Expo (APNs + FCM transparente)
   - Manter Web Push (VAPID) para PWA — ambos coexistem

4. **Backend: integrar Expo Push nos workers:**
   - `alerting-engine.ts`: quando alerta dispara → `sendExpoPushNotification()`
   - `notification-delivery.ts`: rota de entrega adiciona Expo como canal

**Validação:**

- App em background → push chega no dispositivo
- Tap no push → abre app no alerta/ticket correto
- Push em foreground → banner in-app
- Android e iOS ambos recebem

**Entrega:** Push notifications nativas funcionando em ambas as plataformas.

---

### Fase 6 — Deep Linking + OAuth Nativo + Build (Dias 19-22)

**Objetivo:** Universal Links, Sign in with Apple, build para lojas.

**Tasks:**

1. **Deep Linking (Universal Links + App Links):**
   - Configurar `app.config.ts` com `scheme: "jlmirror"`
   - iOS: `apple-app-site-association` em `apps/web/public/.well-known/`
   - Android: `assetlinks.json` em `apps/web/public/.well-known/`
   - Expo Router: `Linking.createURL()` para deep links internos
   - Handler: link `jlmirror://device/:id` → abre detalhe do dispositivo

2. **Sign in with Apple (requisito App Store):**
   - `npx expo install expo-apple-authentication`
   - `app.config.ts`: plugin `expo-apple-authentication`
   - Backend: adicionar `apple` provider em `external-auth.ts`
   - Fluxo: `AppleAuthentication.signInAsync()` → envia `identityToken` → backend valida → JWT

3. **Biometria (FaceID/TouchID):**
   - `npx expo install expo-local-authentication`
   - Login screen: toggle "Entrar com biometria"
   - Se habilitado: armazena refresh_token no SecureStore → desbloqueio com biometria

4. **Build EAS (Expo Application Services):**
   - `eas build:configure` → `eas.json` com profiles: dev, preview, production
   - `eas build --platform ios --profile preview` → build TestFlight
   - `eas build --platform android --profile preview` → build APK
   - Configurar `EXPO_PUBLIC_API_URL` por ambiente (dev=local, prod=api.jlinformatica.com.br)

5. **Submissão:**
   - App Store Connect: criar app, screenshots, descrição, privacy policy
   - Google Play Console: criar app, AAB, screenshots, privacy policy
   - `eas submit --platform ios` → envia para App Store Connect
   - `eas submit --platform android` → envia para Google Play

**Entrega:** App buildado e submetido para App Store + Google Play.

---

## Dependências Necessárias

### Novas (apps/mobile/package.json)

```json
{
  "dependencies": {
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-notifications": "~0.28.0",
    "expo-apple-authentication": "~7.1.0",
    "expo-local-authentication": "~15.0.0",
    "expo-constants": "~17.0.0",
    "expo-linking": "~7.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "19.0.0",
    "react-native": "0.76.0",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.0.0",
    "nativewind": "^4.1.0",
    "tailwindcss": "^3.4.0",
    "@tanstack/react-query": "^5.59.0",
    "react-native-gifted-charts": "^1.4.0",
    "@expo/vector-icons": "^14.0.0",
    "react-native-reanimated": "~3.16.0",
    "react-native-gesture-handler": "~2.20.0",
    "@repo/shared-validation": "workspace:*",
    "@repo/logger": "workspace:*"
  }
}
```

### Backend (modificações mínimas)

- `apps/api/package.json`: adicionar `expo-server-sdk` (^3.7.0)
- `apps/api/src/routes/push.ts`: adicionar endpoint `/push/expo-subscribe`
- `apps/api/src/lib/web-push.ts`: adicionar `sendExpoPushNotification()`
- `apps/api/src/lib/external-auth.ts`: adicionar `AppleAuthProvider`
- `apps/api/src/routes/auth.ts`: adicionar `POST /auth/oauth/apple`

### Web (modificações mínimas)

- `apps/web/public/.well-known/apple-app-site-association.json` — Universal Links
- `apps/web/public/.well-known/assetlinks.json` — Android App Links

---

## O Que NÃO Precisa Ser Feito (Já Está Pronto)

| Componente               | Status    | Por quê                                   |
| ------------------------ | --------- | ----------------------------------------- |
| API REST                 | ✅ Pronto | Hono + JWT, 60+ rotas, stateless          |
| WebSocket                | ✅ Pronto | Redis Pub/Sub, auto-reconnect no client   |
| Auth (login/MFA/refresh) | ✅ Pronto | JWT RS256, TOTP, refresh tokens           |
| RBAC + RLS               | ✅ Pronto | Permissões granulares, isolamento tenant  |
| Schemas Zod              | ✅ Pronto | 2.337 linhas em `@repo/shared-validation` |
| Tipos de resposta        | ✅ Pronto | `api-routes.ts` com 483 linhas de tipos   |
| API Keys                 | ✅ Pronto | Para background sync sem login            |
| Dashboard API            | ✅ Pronto | `/dashboard/overview` com KPIs            |
| Devices API              | ✅ Pronto | `/devices` com lista + detalhe            |
| Tickets API              | ✅ Pronto | CRUD completo + comentários               |
| Profile API              | ✅ Pronto | GET/PATCH profile, sessions, MFA          |

---

## Decisões Arquiteturais

### Por que Expo e não React Native CLI puro?

- **EAS Build** — build na nuvem sem precisar de Xcode/Android Studio local
- **Expo Router** — file-based routing idêntico ao Next.js (curva de aprendizado zero)
- **Expo Notifications** — abstrai APNs + FCM em uma API unificada
- **Expo SecureStore** — Keychain/Keystore sem código nativo
- **Over-the-air updates** — EAS Update para hotfixes sem passar pela loja
- **Trade-off:** bundle size ~50MB (inclui Expo Go runtime em dev; em produção é tree-shaken)

### Por que NativeWind e não StyleSheet?

- **Consistência visual** — mesmas classes TailwindCSS do web
- **Manutenção** — tema centralizado em `tailwind.config.ts` compartilhado
- **DX** — desenvolvedores do web não precisam aprender API nova
- **Trade-off:** pequeno overhead de runtime (parsing de classes)

### Por que TanStack Query e não SWR?

- **Cache mais granular** — invalidation por query key, optimistic updates
- **Mutations** — suporte nativo a `useMutation` (criar ticket, comentar)
- **Prefetch** — prefetch de detalhe do dispositivo ao hoverar lista
- **Trade-off:** bundle size ~14KB vs ~4KB do SWR

### Por que `@repo/shared-validation` direto e não gerar tipos?

- **Single source of truth** — schemas Zod são a fonte, tipos são inferidos
- **Runtime validation** — app valida payloads da API em runtime (não só compile-time)
- **Zero codegen** — não precisa de OpenAPI spec ou geradores
- **Trade-off:** Zod no bundle (~8KB), mas vale pela segurança

---

## Riscos e Mitigações

| Risco                                        | Probabilidade | Impacto | Mitigação                                                         |
| -------------------------------------------- | ------------- | ------- | ----------------------------------------------------------------- |
| Expo Go não suporta todos os módulos nativos | Média         | Médio   | Usar EAS Build para dev builds com módulos custom                 |
| App Store rejeita por Sign in with Apple     | Alta          | Alto    | Fase 6 implementa antes da submissão                              |
| WebSocket em background iOS (3 min limit)    | Alta          | Médio   | Usar push notifications para alerts críticos; WS só em foreground |
| Bundle size > 150MB (limite Android)         | Baixa         | Alto    | Hermes engine + ProGuard + R8 minification                        |
| API rate limit em mobile (3G/lento)          | Média         | Médio   | TanStack Query com `staleTime` agressivo + retry exponencial      |

---

## Métricas de Sucesso

| Métrica              | Meta         | Como medir                  |
| -------------------- | ------------ | --------------------------- |
| Login → Dashboard    | < 3s         | Performance monitor         |
| Dashboard KPIs load  | < 1.5s       | TanStack Query `isFetching` |
| WebSocket connect    | < 500ms      | ws-client.ts log            |
| Push delivery (APNs) | < 5s         | expo-server-sdk response    |
| App size (iOS IPA)   | < 50MB       | EAS Build output            |
| Crash-free sessions  | > 99.5%      | Sentry React Native         |
| Testes E2E (Detox)   | 80% coverage | Detox + CI                  |

---

_Gerado por Devin — 2026-08-12_
