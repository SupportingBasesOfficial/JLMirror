import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await pool.query(
    "INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
    ["20260731160000_fix_module_encoding.sql"]
  );
  console.log("Migration registrada em schema_migrations");
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
