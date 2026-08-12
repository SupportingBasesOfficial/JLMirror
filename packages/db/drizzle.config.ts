// @ai-context: .zero-error/architecture-map.md#state-store
// Drizzle Kit configuration — used by `drizzle-kit generate`, `push`,
// `migrate` and `studio` commands.
//
// PHASE 1 SCOPE: only the core identity/tenant modules are mapped so far
// (tenants, auth/users, RBAC). The remaining ~85 tables from
// /refactor-blueprint/ideal_schema.sql will be added incrementally in
// later phases — see orm_and_types_blueprint.ts Section 13.
//
// Scripts (see package.json):
//   pnpm db:gen       — generate SQL migration from schema diff
//   pnpm db:types     — emit TypeScript types for select/insert/update
//   pnpm db:push      — push schema to dev DB (no migration files)
//   pnpm db:studio    — open Drizzle Studio
import { defineConfig } from "drizzle-kit";

const url =
  process.env.DATABASE_URL ??
  // fallback para o compose de testes (docker-compose.db-test.yml)
  "postgres://jlmirror:jlmirror@localhost:5432/jlmirror_test";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
  verbose: true,
  strict: true,
});
