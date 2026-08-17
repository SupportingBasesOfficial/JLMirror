// @ai-context: .zero-error/architecture-map.md#state-store
// Drizzle ORM instance — reuses the existing `pg` Pool from ./index.ts so
// there is a single connection pool for the whole process (no duplicate
// pools between the legacy `query()` helper and Drizzle).
//
// RLS INTEGRATION: withTenantDb() wraps a callback in a Drizzle transaction
// that sets `SET LOCAL app.current_tenant_id` so Row-Level Security policies
// are enforced on every query — mirroring what the legacy `query()` helper
// does, but for Drizzle query builder calls.
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { pool, getCurrentTenantId } from "./index";
import * as schema from "./schema";

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// Lazily instantiate so importing this module never opens a connection by
// itself — the underlying pool is only created on first real query, exactly
// like the existing `query()` helper in ./index.ts.
let _db: DrizzleDb | null = null;

export function getDb(): DrizzleDb {
  if (!_db) {
    _db = drizzle(pool(), {
      schema,
      logger: process.env.NODE_ENV === "development",
    });
  }
  return _db;
}

// Executa um bloco de queries Drizzle dentro de uma transacao que injeta
// `SET LOCAL app.current_tenant_id` para RLS. Le o tenant_id do
// AsyncLocalStorage (setado por runWithTenant no middleware tenantContext).
//
// Se nao houver tenant no contexto (rotas publicas, JL staff global),
// executa sem transacao — comportamento identico ao legacy query().
export async function withTenantDb<T>(
  fn: (db: DrizzleDb) => Promise<T>,
): Promise<T> {
  const tenantId = getCurrentTenantId();

  // Sem tenant no AsyncLocalStorage — executa direto sem RLS
  if (!tenantId) {
    return fn(getDb());
  }

  // Valida formato UUID antes de interpolar (SET LOCAL nao aceita $1)
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error("tenant_id inválido: deve ser um UUID");
  }

  // Transacao Drizzle com SET LOCAL para RLS. Mantemos o cast estrito
  // para DrizzleDb apenas no retorno seguro do callback do contexto transacional.
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`),
    );
    return fn(tx as unknown as DrizzleDb);
  });
}

export { schema };
