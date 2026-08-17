# JLMIRROR — Migration Summary & Production Runbook

> **Branch:** `feature/complete-type-safe-refactor`
> **Status:** Complete — not yet merged into `main`
> **Date:** 2026-08-11
> **Scope:** Full-stack type-safe refactor across `packages/db`, `packages/shared-validation`, `apps/api`, and `apps/web`

---

## Executive Summary

This branch delivers a 4-phase architectural migration that replaces the raw
`pg` query layer with **Drizzle ORM**, introduces **compile-time type alignment**
between the database schema and the API validation layer (Zod), enforces
**Row-Level Security (RLS)** in background workers via `AsyncLocalStorage`,
integrates **TimescaleDB hypertables** for high-frequency metrics, and
centralizes all frontend API consumption through a **type-safe route registry**.

**Result:** 3,008 backend tests pass, 99 Next.js production routes compile with
zero TypeScript errors, and the historical `u.name` vs `u.full_name` bug is
eliminated at the type level.

---

## Phase 1 — Schema Blueprint & Validation (Live)

**Goal:** Define the ideal database schema and validate it against a real
TimescaleDB instance before touching production code.

**What was done:**

- Authored `refactor-blueprint/ideal_schema.sql` (125 KB) covering all 60+ tables
  with correct types, constraints, FKs, RLS policies, and partitioning strategies.
- Stood up an isolated test container (`docker-compose.db-test.yml`) using
  `timescale/timescaledb:latest-pg16` on port 5433 — fully isolated from the
  production stack.
- Executed 4 validation scripts:
  1. `01_onboarding_test.sql` — tenant onboarding + user creation
  2. `02_rls_isolation_test.sql` — cross-tenant leak detection
  3. `03_hypertable_partition_test.sql` — TimescaleDB chunk + partition behavior
  4. `04_generate_dictionary.sql` — auto-generated `FINAL_DATABASE_DICTIONARY.md`
- Produced `refactor-blueprint/database_diagram.md` with full Mermaid ERD.

**Validated against:** TimescaleDB 2.29.1 / PostgreSQL 16.14 (2026-08-11).

---

## Phase 2 — Drizzle ORM Schema & Type Bridge

**Goal:** Replace raw SQL strings with a Drizzle ORM schema that infers
TypeScript types at compile time, and bridge those types to the Zod validation
schemas consumed by the API.

**What was done:**

- Created `packages/db/src/schema/` with 7 modules:
  - `auth.ts` — users, sessions, trusted_devices, password_reset_tokens,
    user_mfa_totp, user_webauthn_credentials, mfa_challenges
  - `tenant.ts` — tenants, tenant_routes, tenant_users
  - `rbac.ts` — roles, permissions, role_permissions, attribute_policies,
    tenant_custom_roles, tenant_custom_role_permissions
  - `zabbix.ts` — devices, user_host_groups, zabbix_history_cache (hypertable)
  - `metrics.ts` — system_metrics (hypertable), capacity_metrics (partitioned)
  - `logs.ts` — system_logs (partitioned), trace_spans (partitioned)
  - `index.ts` — barrel export
- Created `packages/db/src/types.ts` — re-exports `InferSelectModel` /
  `InferInsertModel` for every table (Select / Insert / Update types).
- Created `packages/shared-validation/src/db-types.ts` — bridge module with
  compile-time type assertions that verify Zod-inferred types align with
  Drizzle Insert types (e.g. `AssertEmailAlignment`).
- Generated Drizzle migration: `packages/db/drizzle/0000_uneven_sinister_six.sql`.
- Configured `packages/db/drizzle.config.ts` for the monorepo.

**Key design decision:** API payloads use `snake_case` (existing REST contract);
Drizzle maps DB columns (`snake_case`) to TS properties (`camelCase`). The bridge
module provides helper types for mapping between the two shapes without runtime
overhead. All `@repo/db` imports in `shared-validation` are `import type` only —
no runtime dependency on `pg` or the connection pool, so the module is safe to
import from browser/edge bundles.

---

## Phase 3 — Backend Migration: Zabbix, Metrics & RLS in Workers

**Goal:** Migrate the Zabbix and Metrics domain repositories from raw `pg`
queries to Drizzle ORM, enforce RLS in BullMQ background workers, and refactor
the Zabbix API routes.

**What was done:**

- Mapped all Zabbix/Metrics domain tables to Drizzle schemas with correct
  TimescaleDB and partitioning semantics:
  - `zabbix_history_cache` — hypertable with `bigserial` id + composite PK
  - `system_metrics` — hypertable with `bigserial` id + composite PK
  - `capacity_metrics`, `system_logs`, `trace_spans` — monthly partitioned with
    composite PKs (partition column included, as required by PostgreSQL)
- Refactored 5 BullMQ workers to set tenant context via `runWithTenant()`:
  - `zabbix-write` — Zabbix history cache ingestion
  - `task-scheduler` — scheduled task execution
  - `alerting-engine` — alert evaluation
  - `device-sync` — Zabbix host synchronization
  - `correlation-engine` — event correlation
- Intentionally **not** wrapped:
  - `metrics-collector` — collects global process metrics (no tenant scope)
  - `partition-manager` — operates on schema-level DDL (no tenant scope)
- Refactored `zabbix/connector-stream` route to use Drizzle bulk inserts into
  `zabbix_history_cache` with RLS enforcement.
- Refactored `getHistoryFromCache` in `zabbix/history.ts` to use Drizzle.
- All schemas, workers, and routes compiled with zero TypeScript errors.
- Full test suite passed: **3,008 tests across 63 files**.

---

## Phase 4 — Frontend Integration & Type-Safe Consumption

**Goal:** Centralize all API URLs in a single registry, inject type-safety from
`@repo/shared-validation` into core UI components, and fix the historical
`u.name` vs `u.full_name` bug at the type level.

**What was done:**

- Created `apps/web/lib/api-routes.ts` — centralized route registry with:
  - Typed constants for auth, MFA, profile, dashboard, Zabbix, settings, users,
    system health, tickets, tasks, errors, branding, WebSocket
  - Template functions for dynamic segments
  - Co-located response types (`LoginResponse`, `AuthMeResponse`,
    `ProfileResponse`, `ModuleFlagsResponse`, `DashboardOverviewResponse`, etc.)
  - Re-exports of all Zod-inferred request payload types
- Created `apps/web/lib/use-auth.ts` — unified auth hook with typed
  `AuthMeResponse`, replacing duplicated interface definitions.
- Refactored 12 frontend files to use centralized routes + typed payloads:
  - `auth/login`, `auth/change-password`, `auth/forgot-password`,
    `auth/reset-password` — typed `LoginInput`, `MfaVerifyInput`,
    `ChangePasswordInput`, `ForgotPasswordInput`, `ResetPasswordInput`
  - `profile/page.tsx` — typed `UpdateProfileInput`, `UpdateAvatarInput`,
    `UpdatePreferencesInput`; **fixed `profile.name` → `profile.full_name`**
  - `dashboard/page.tsx`, `dashboard-overview-wrapper.tsx`,
    `device-sync-trigger.tsx`, `dashboard/devices/page.tsx` — centralized routes
  - `use-user-roles.ts`, `use-module-flags.ts`, `use-sidebar-badges.ts`,
    `user-scope-provider.tsx`, `error-boundary.tsx`, `api-client.ts`
- Added Drizzle-inferred types to `packages/db/src/types.ts` for Phase 3 tables.
- Next.js production build: **99 routes, zero errors**.

---

## Critical Bugs Fixed

### 1. TimescaleDB Compression vs RLS Conflict

**Problem:** The migration `20260801140000_timescaledb_system_metrics.sql`
enabled both RLS (`FORCE ROW LEVEL SECURITY`) and TimescaleDB compression
(`add_compression_policy`) on `system_metrics`. TimescaleDB compression
converts chunks to read-only columnar format, which conflicts with RLS
policy evaluation on compressed chunks — queries on compressed data bypass
RLS or fail with permission errors.

**Fix:** Compression was **dropped** from `system_metrics` in the Drizzle
schema (`packages/db/src/schema/metrics.ts` documents this decision). RLS
is retained for tenant isolation. Retention policy (90 days) is kept.
Compression can be re-enabled per-tenant in the future if RLS is applied
at the hypertable level via a different strategy (e.g. segmentby tenant_id).

**Migration reference:** `migrations/20260801140000_timescaledb_system_metrics.sql`

### 2. Missing TimescaleDB Extension in Production Image

**Problem:** The production `docker-compose.yml` uses `postgres:16-alpine`,
which does **not** include the TimescaleDB extension. The migration
`20260801140000_timescaledb_system_metrics.sql` runs
`CREATE EXTENSION IF NOT EXISTS timescaledb`, which silently fails (the
`EXCEPTION WHEN OTHERS` block catches it), and `system_metrics` falls back
to a regular table — losing hypertable partitioning and retention.

**Fix (required before deploy):** Update `docker-compose.yml` to use
`timescale/timescaledb:latest-pg16` instead of `postgres:16-alpine`.
See the Runbook below (Step 3).

### 3. RLS Weak Policies (Cross-Tenant Data Leak)

**Problem:** 15 tenant-scoped tables had RLS policies with `USING (true)`,
meaning any authenticated user could read/write data from **any tenant**.
Additionally, 12 partitioned tables (`capacity_metrics`, `system_logs`,
`trace_spans`) had RLS disabled entirely.

**Fix:** Migration `20260805120000_fix_rls_weak_policies_and_partitions.sql`
drops all weak policies and creates proper `global_admin` + `tenant_isolation`
policies on all 15 tables, and enables + forces RLS on all 12 partitioned
tables.

### 4. Historical `u.name` vs `u.full_name` Bug

**Problem:** The `users` table column is `full_name` (Drizzle maps to
`fullName` in TS). Multiple frontend files referenced `u.name` or
`profile.name`, which is `undefined` at runtime — causing the profile page
to display "User" instead of the actual name.

**Fix:** The `Profile` interface in `apps/web/app/(admin)/profile/page.tsx`
now correctly uses `full_name`. The display at line 422 reads
`profile.full_name ?? profile.display_name ?? "User"`. The `useUserRoles`
hook uses `data.user.full_name ?? data.user.email`. The typed
`AuthMeResponse` in `api-routes.ts` enforces `full_name: string | null`,
preventing regression at compile time.

---

## Production Deployment Runbook

> **Precondition:** This branch (`feature/complete-type-safe-refactor`) has
> been reviewed and approved. Do NOT merge into `main` until the steps below
> have been executed in a staging environment.

### Step 1 — Database Backup

```bash
# Backup the production database BEFORE applying any migration
docker exec jlmirror-postgres pg_dump -U postgres jlmirror > backup_pre_refactor_$(date +%Y%m%d%H%M%S).sql

# Verify backup is non-empty and valid
ls -lh backup_pre_refactor_*.sql
head -5 backup_pre_refactor_*.sql
```

### Step 2 — Update Production Docker Image (CRITICAL)

The production Postgres image MUST be changed to include TimescaleDB.
Edit `docker-compose.yml`:

```yaml
# BEFORE (BROKEN — no TimescaleDB):
postgres:
  image: postgres:16-alpine

# AFTER (FIXED):
postgres:
  image: timescale/timescaledb:latest-pg16
```

Then recreate the container:

```bash
docker compose pull postgres
docker compose down postgres
docker compose up -d postgres

# Verify TimescaleDB extension is available
docker exec jlmirror-postgres psql -U postgres -d jlmirror -c "SELECT * FROM pg_available_extensions WHERE name = 'timescaledb';"
```

> **Warning:** If you skip this step, `system_metrics` will silently fall back
> to a regular table and you will lose hypertable partitioning + retention.

### Step 3 — Apply Database Migrations

```bash
# Apply all pending migrations in order
pnpm db:migrate

# Verify migrations were applied
docker exec jlmirror-postgres psql -U postgres -d jlmirror -c \
  "SELECT version, name, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 10;"

# Verify RLS is enabled on all tenant-scoped tables
docker exec jlmirror-postgres psql -U postgres -d jlmirror -c \
  "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relrowsecurity = true ORDER BY relname;"

# Verify TimescaleDB hypertables
docker exec jlmirror-postgres psql -U postgres -d jlmirror -c \
  "SELECT hypertable_name, compression_enabled FROM timescaledb_information.hypertables;"
```

### Step 4 — Sync Redis (BullMQ Workers)

The refactored workers now use `runWithTenant()` which sets
`SET LOCAL app.current_tenant_id` via AsyncLocalStorage. Existing queued
jobs that were enqueued BEFORE the deploy will NOT have tenant context.

```bash
# Drain existing queues before deploying new worker code
# (optional but recommended — old jobs will fail RLS checks)
redis-cli -h <redis-host> -p <redis-host> KEYS "bull:*" | head -20

# If you want to drain:
redis-cli -h <redis-host> -p <redis-host> FLUSHDB
# OR selectively:
redis-cli -h <redis-host> -p <redis-host> DEL "bull:zabbix-write" "bull:task-scheduler" "bull:alerting-engine" "bull:device-sync" "bull:correlation-engine"
```

> **Note:** `FLUSHDB` clears ALL Redis data (including caches). Use selective
> `DEL` if you want to preserve cached data. After draining, restart workers
> so they pick up the new code with `runWithTenant()`.

### Step 5 — Update Environment Variables

Add the following to `.env` (production) if not already present:

```env
# TimescaleDB (already handled by migration, but document for clarity)
TIMESCALEDB_ENABLED=true

# RLS context — these are set at runtime by withTenantDb(), not env vars.
# Documenting for awareness: the app sets `SET LOCAL app.current_tenant_id`
# and `SET LOCAL app.current_role` via AsyncLocalStorage in BullMQ workers.

# No new env vars required for this refactor — all existing vars remain valid.
```

### Step 6 — Build & Deploy

```bash
# Build all packages
pnpm install --frozen-lockfile
pnpm build

# Verify backend compiles
cd apps/api && npx tsc --noEmit

# Verify frontend compiles
cd apps/web && npx next build

# Run backend test suite (should be 3008 tests, 63 files)
pnpm test

# Deploy
docker compose up -d --build
```

### Step 7 — Post-Deploy Verification

```bash
# 1. Check API health
curl -s https://api.jlinformatica.com.br/health | jq .

# 2. Check Zabbix connector stream (should use Drizzle + RLS)
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.jlinformatica.com.br/api/v1/zabbix/devices | jq '.devices | length'

# 3. Check dashboard overview (should use centralized route)
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.jlinformatica.com.br/api/v1/dashboard/overview | jq '.kpis.devices'

# 4. Check RLS isolation — login as tenant A, try to read tenant B data
# (should return empty array, not an error)

# 5. Check TimescaleDB hypertables are active
docker exec jlmirror-postgres psql -U postgres -d jlmirror -c \
  "SELECT hypertable_name FROM timescaledb_information.hypertables;"

# 6. Check BullMQ workers have tenant context
docker logs jlmirror-api --tail 50 | grep "runWithTenant"
```

### Step 8 — Rollback Plan (if needed)

```bash
# 1. Roll back the Docker image
# Edit docker-compose.yml back to postgres:16-alpine
# (only if TimescaleDB caused issues — RLS will still work)

# 2. Restore database from backup
docker exec -i jlmirror-postgres psql -U postgres -d jlmirror < backup_pre_refactor_YYYYMMDDHHMMSS.sql

# 3. Roll back the code
git checkout main
docker compose up -d --build
```

> **Caution:** Rolling back the database will lose any data written after the
> backup. If possible, prefer forward-fixing over rollback.

---

## Files Changed Summary

| Area                         | Files          | Key Changes                                          |
| ---------------------------- | -------------- | ---------------------------------------------------- |
| `packages/db`                | 12 new         | Drizzle schemas, types, config, migration            |
| `packages/shared-validation` | 2 new/modified | Type bridge, Zod schemas                             |
| `apps/api`                   | 18 modified    | Workers (RLS), routes (Drizzle), middleware          |
| `apps/web`                   | 15 modified    | api-routes.ts, use-auth.ts, pages, hooks             |
| `migrations`                 | 2 new          | TimescaleDB, RLS fix                                 |
| `refactor-blueprint`         | 11 new         | Schema, tests, diagrams, logs                        |
| Root                         | 4 new          | This file, docker-compose.db-test, dictionary, audit |

---

## Test Results

- **Backend:** 3,008 tests / 63 files — all passing
- **Frontend:** `tsc --noEmit` zero errors; `next build` 99 routes, zero errors
- **Database:** Validated live against TimescaleDB 2.29.1 / PostgreSQL 16.14

---

_Generated with [Devin](https://devin.ai) — 2026-08-11_
