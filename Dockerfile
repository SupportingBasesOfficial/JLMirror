# syntax=docker/dockerfile:1
# Dockerfile multi-stage para o apps/web (Next.js) JLMIRROR

# --- Estágio de dependências ---
FROM node:22-alpine AS deps
RUN apk add --no-cache dumb-init && corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/ui/package.json ./packages/ui/
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
COPY packages/cache/package.json ./packages/cache/
COPY packages/shared-validation/package.json ./packages/shared-validation/
COPY packages/zabbix/package.json ./packages/zabbix/
COPY packages/tailwind-config/package.json ./packages/tailwind-config/
COPY packages/telemetry/package.json ./packages/telemetry/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/logger/package.json ./packages/logger/
COPY packages/secrets/package.json ./packages/secrets/

RUN pnpm install --frozen-lockfile

# --- Estágio de build ---
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/

COPY . .

# Build do apps/web (standalone output para Docker)
ENV BUILD_STANDALONE=true
RUN pnpm --filter @jlmirror/web build

# --- Estágio de produção ---
FROM node:22-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/.next/standalone/server.js"]
