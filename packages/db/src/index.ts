// @ai-context: .zero-error/architecture-map.md#state-store
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

// Pool global — singleton lazy, inicializado apos loadEnv()
let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    const maxConnections = parseInt(process.env.DB_POOL_MAX ?? "50", 10);
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: maxConnections,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    _pool.on("error", (err) => {
      console.error("[db] Pool error:", err.message);
    });
  }
  return _pool;
}

// AsyncLocalStorage para propagar tenant_id via SET LOCAL app.current_tenant_id
const tenantStorage = new AsyncLocalStorage<string>();

export interface QueryResultTyped<
  T extends QueryResultRow = Record<string, unknown>,
> {
  data: QueryResult<T> | null;
  error: Error | null;
}

// Query generica com tipagem — sempre retorna { data, error } para tratamento consistente
export async function query<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<QueryResultTyped<T>> {
  const client = await getPool().connect();
  try {
    const tenantId = tenantStorage.getStore();
    if (tenantId) {
      // Valida que tenantId é um UUID antes de interpolar em SET LOCAL
      // (SET LOCAL não aceita parâmetros $1, mas validamos o formato)
      const UUID_REGEX =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_REGEX.test(tenantId)) {
        throw new Error("tenant_id inválido: deve ser um UUID");
      }
      // SET LOCAL requer transacao explicita e nao aceita parametros $1
      await client.query("BEGIN");
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      const data = await client.query<T>(text, params as never[]);
      await client.query("COMMIT");
      return { data, error: null };
    }
    const data = await client.query<T>(text, params as never[]);
    return { data, error: null };
  } catch (error) {
    // ROLLBACK se havia tenant (transacao aberta)
    if (tenantStorage.getStore()) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }
    return { data: null, error: error as Error };
  } finally {
    client.release();
  }
}

// Query no schema do tenant — prefixa o schema name nas queries
export async function tenantQuery<
  T extends QueryResultRow = Record<string, unknown>,
>(
  tenantId: string,
  text: string,
  params?: unknown[],
): Promise<QueryResultTyped<T>> {
  return runWithTenant(tenantId, () => query<T>(text, params));
}

// Busca o nome do schema do tenant no banco
export async function getTenantSchema(
  tenantId: string,
): Promise<{ data: string | null; error: Error | null }> {
  try {
    const result = await query<{ schema_name: string }>(
      "SELECT schema_name FROM public.tenants WHERE id = $1",
      [tenantId],
    );
    if (result.error || !result.data?.rows[0]) {
      return {
        data: null,
        error: result.error ?? new Error("Tenant not found"),
      };
    }
    return { data: result.data.rows[0].schema_name, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

// Envolve execucao em contexto de tenant via AsyncLocalStorage
export async function runWithTenant<T>(
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return tenantStorage.run(tenantId, fn);
}

// Fecha o pool — usado no graceful shutdown
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

export { getPool as pool };
