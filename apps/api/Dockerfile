# syntax=docker/dockerfile:1
# Dockerfile multi-stage para a API JLMIRROR
# Estágio 1: deps — instala dependências
# Estágio 2: builder — compila TypeScript
# Estágio 3: runner — imagem mínima de produção

FROM node:22-alpine AS deps
RUN apk add --no-cache dumb-init && corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/cache/package.json ./packages/cache/
COPY packages/auth/package.json ./packages/auth/
COPY packages/shared-validation/package.json ./packages/shared-validation/
COPY packages/multi-cluster-router/package.json ./packages/multi-cluster-router/
COPY packages/zabbix/package.json ./packages/zabbix/
COPY packages/logger/package.json ./packages/logger/
COPY packages/telemetry/package.json ./packages/telemetry/
COPY packages/secrets/package.json ./packages/secrets/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/

RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .

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
  CMD wget --quiet --tries=1 --spider http://localhost:3001/api/v1/health/live || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
