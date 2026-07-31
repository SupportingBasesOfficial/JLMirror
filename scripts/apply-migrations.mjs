import { config as loadEnv } from "dotenv";
import pg from "pg";
import { readFileSync } from "fs";

loadEnv();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const files = [
    "../../migrations/20260731170000_activate_admin_devices_modules.sql",
    "../../migrations/20260731170100_user_host_groups.sql",
  ];

  for (const file of files) {
    const sql = readFileSync(file, "utf-8");
    const filename = file.split("/").pop();
    console.log(`Aplicando ${filename}...`);
    await pool.query(sql);
    await pool.query(
      "INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
      [filename]
    );
    console.log(`  OK`);
  }

  // Verifica modulos ativos
  const res = await pool.query(
    "SELECT key, name, default_value FROM public.feature_flags WHERE key IN ('module_admin', 'module_devices') ORDER BY key"
  );
  for (const row of res.rows) {
    console.log(`${row.key}: ${row.name} = ${row.default_value}`);
  }

  // Verifica tabela
  const res2 = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_host_groups' ORDER BY ordinal_position"
  );
  console.log("\nuser_host_groups columns:");
  for (const row of res2.rows) {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
