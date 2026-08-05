import { config as loadEnv } from "dotenv";
loadEnv();
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pool, closePool } from "./index.js";

async function main() {
  const client = await pool().connect();
  try {
    const sql = readFileSync(
      join(
        resolve(process.cwd(), "migrations"),
        "20260805120000_fix_rls_weak_policies_and_partitions.sql",
      ),
      "utf-8",
    );
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
        ["20260805120000_fix_rls_weak_policies_and_partitions.sql"],
      );
      await client.query("COMMIT");
      console.warn("Migration applied successfully");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Migration failed:", err);
      process.exit(1);
    }
  } finally {
    client.release();
    await closePool();
  }
}
main().catch(console.error);
