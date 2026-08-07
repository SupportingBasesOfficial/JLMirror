# syntax=docker/dockerfile:1
# Dockerfile multi-stage para a API JLMIRROR
# Estágio 1: builder — instala deps, compila packages e API
# Estágio 2: runner — imagem mínima de produção

FROM node:22-alpine AS builder
RUN apk add --no-cache dumb-init && corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/cache/package.json ./packages/cache/
COPY packages/auth/package.json ./packages/auth/
COPY packages/shared-validation/package.json ./packages/shared-validation/
COPY packages/zabbix/package.json ./packages/zabbix/
COPY packages/logger/package.json ./packages/logger/
COPY packages/telemetry/package.json ./packages/telemetry/
COPY packages/secrets/package.json ./packages/secrets/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/

RUN pnpm install --frozen-lockfile

COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY packages/db/src ./packages/db/src
COPY packages/db/tsconfig.json ./packages/db/tsconfig.json
COPY packages/cache/src ./packages/cache/src
COPY packages/cache/tsconfig.json ./packages/cache/tsconfig.json
COPY packages/auth/src ./packages/auth/src
COPY packages/auth/tsconfig.json ./packages/auth/tsconfig.json
COPY packages/shared-validation/src ./packages/shared-validation/src
COPY packages/shared-validation/tsconfig.json ./packages/shared-validation/tsconfig.json
COPY packages/zabbix/src ./packages/zabbix/src
COPY packages/zabbix/tsconfig.json ./packages/zabbix/tsconfig.json
COPY packages/logger/src ./packages/logger/src
COPY packages/logger/tsconfig.json ./packages/logger/tsconfig.json
COPY packages/telemetry/src ./packages/telemetry/src
COPY packages/telemetry/tsconfig.json ./packages/telemetry/tsconfig.json
COPY packages/secrets/src ./packages/secrets/src
COPY packages/secrets/tsconfig.json ./packages/secrets/tsconfig.json
COPY packages/typescript-config/ ./packages/typescript-config/

# Compila packages primeiro (respeitando dependencias ^build do turbo)
RUN pnpm --filter @repo/db build && \
    pnpm --filter @repo/cache build && \
    pnpm --filter @repo/auth build && \
    pnpm --filter @repo/shared-validation build && \
    pnpm --filter @repo/zabbix build && \
    pnpm --filter @repo/logger build && \
    pnpm --filter @repo/telemetry build && \
    pnpm --filter @repo/secrets build

# Compila a API
RUN pnpm --filter @jlmirror/api build

# Deploy com apenas dependências de produção
RUN pnpm --filter @jlmirror/api deploy --prod /app/deployed

FROM node:22-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=3001

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 hono

COPY --from=builder /app/deployed/ ./

USER hono

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3001/api/v1/health/live || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
