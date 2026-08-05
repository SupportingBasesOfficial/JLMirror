import { config as loadEnv } from "dotenv";
loadEnv();
import { pool, closePool } from "./index.js";

async function main() {
  const tables = [
    "capacity_metrics_202608",
    "system_logs_202608",
    "trace_spans_202608",
  ];
  for (const t of tables) {
    const r = await pool().query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = 'tenant_id'",
      [t],
    );
    console.warn(`${t} has tenant_id: ${r.rows.length > 0}`);
  }
  await closePool();
}
main().catch(console.error);
