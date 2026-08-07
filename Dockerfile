# syntax=docker/dockerfile:1
# Dockerfile multi-stage para o apps/web (Next.js) JLMIRROR

# --- Estágio de build ---
FROM node:22-alpine AS builder
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

COPY apps/web/app ./apps/web/app
COPY apps/web/components ./apps/web/components
COPY apps/web/lib ./apps/web/lib
COPY apps/web/public ./apps/web/public
COPY apps/web/next.config.mjs ./apps/web/next.config.mjs
COPY apps/web/env.ts ./apps/web/env.ts
COPY apps/web/tsconfig.json ./apps/web/tsconfig.json
COPY apps/web/tailwind.config.ts ./apps/web/tailwind.config.ts
COPY apps/web/postcss.config.mjs ./apps/web/postcss.config.mjs
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY packages/db/src ./packages/db/src
COPY packages/db/tsconfig.json ./packages/db/tsconfig.json
COPY packages/cache/src ./packages/cache/src
COPY packages/cache/tsconfig.json ./packages/cache/tsconfig.json
COPY packages/auth/src ./packages/auth/src
COPY packages/shared-validation/src ./packages/shared-validation/src
COPY packages/zabbix/src ./packages/zabbix/src
COPY packages/logger/src ./packages/logger/src
COPY packages/logger/tsconfig.json ./packages/logger/tsconfig.json
COPY packages/telemetry/src ./packages/telemetry/src
COPY packages/secrets/src ./packages/secrets/src
COPY packages/ui/src ./packages/ui/src
COPY packages/tailwind-config/ ./packages/tailwind-config/
COPY packages/typescript-config/ ./packages/typescript-config/
COPY packages/shared-validation/tsconfig.json ./packages/shared-validation/tsconfig.json
COPY packages/zabbix/tsconfig.json ./packages/zabbix/tsconfig.json

# Compila packages que Next.js resolve via main (dist/)
RUN pnpm --filter @repo/db build && \
    pnpm --filter @repo/cache build && \
    pnpm --filter @repo/logger build && \
    pnpm --filter @repo/shared-validation build && \
    pnpm --filter @repo/zabbix build

# Build do apps/web (standalone output para Docker)
ENV BUILD_STANDALONE=true
ENV SKIP_ENV_VALIDATION=true
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
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]
