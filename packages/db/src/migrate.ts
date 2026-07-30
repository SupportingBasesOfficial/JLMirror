import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pool } from "./index.js";

// Executa migrations SQL pendentes do diretorio ./migrations
// Controla via tabela public.schema_migrations
export async function runMigrations(): Promise<void> {
  const client = await pool().connect();

  try {
    // Cria tabela de controle se nao existir
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Busca migrations ja aplicadas
    const appliedResult = await client.query<{ filename: string }>(
      "SELECT filename FROM public.schema_migrations ORDER BY filename"
    );
    const applied = new Set(appliedResult.rows.map(r => r.filename));

    // Lista arquivos SQL do diretorio migrations
    const migrationsDir = resolve(process.cwd(), "migrations");
    let files: string[] = [];
    try {
      files = readdirSync(migrationsDir)
        .filter(f => f.endsWith(".sql"))
        .sort();
    } catch {
      // Diretorio de migrations nao encontrado — pula silenciosamente
      return;
    }

    // Executa migrations pendentes em ordem
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.schema_migrations (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
        console.warn(`[migrations] Aplicado: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Falha na migration ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    client.release();
  }
}
