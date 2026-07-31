import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  // Verifica encoding do banco
  const enc = await pool.query("SHOW server_encoding");
  console.log("Server encoding:", enc.rows[0]);

  const enc2 = await pool.query("SHOW client_encoding");
  console.log("Client encoding:", enc2.rows[0]);

  // Verifica dados reais
  const res = await pool.query(
    "SELECT key, name, description FROM public.feature_flags WHERE key LIKE 'module_%' ORDER BY key LIMIT 10"
  );
  for (const row of res.rows) {
    console.log(`${row.key}: name="${row.name}" desc="${row.description}"`);
  }

  // Verifica se os bytes estao corretos
  const res2 = await pool.query(
    "SELECT key, name, octet_length(name) as len, encode(name::bytea, 'hex') as hex FROM public.feature_flags WHERE key = 'module_auth'"
  );
  console.log("\nHex do name:", res2.rows[0]);

  await pool.end();
}

main().catch(console.error);
