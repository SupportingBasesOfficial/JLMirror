import { config as loadEnv } from "dotenv";
import pg from "pg";
import { readFileSync } from "fs";

loadEnv();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const sql = readFileSync("../../migrations/20260731160000_fix_module_encoding.sql", "utf-8");
  console.log("Executando migration de correcao de encoding...");
  await pool.query(sql);
  console.log("Migration aplicada com sucesso!");

  // Verifica
  const res = await pool.query(
    "SELECT key, name, description FROM public.feature_flags WHERE key LIKE 'module_%' ORDER BY key LIMIT 10"
  );
  for (const row of res.rows) {
    console.log(`${row.key}: name="${row.name}" desc="${row.description}"`);
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
