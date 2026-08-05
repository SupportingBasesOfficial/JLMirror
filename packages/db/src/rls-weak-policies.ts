// Identifica tables com tenant_id mas policies fracas (USING: true sem isolamento)
import { config as loadEnv } from "dotenv";
loadEnv();
import { pool, closePool } from "./index.js";
import { writeFileSync } from "node:fs";

async function main() {
  // Tables que tem tenant_id mas cujas policies nao referenciam tenant_id
  const result = await pool().query(`
    WITH tables_with_tenant AS (
      SELECT t.table_name
      FROM information_schema.tables t
      JOIN pg_class c ON c.relname = t.table_name
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND n.nspname = 'public'
        AND t.table_name NOT LIKE '%_2026%'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns c2
          WHERE c2.table_schema = 'public'
            AND c2.table_name = t.table_name
            AND c2.column_name = 'tenant_id'
        )
    ),
    tables_with_weak_policies AS (
      SELECT DISTINCT c.relname AS table_name
      FROM pg_policy p
      JOIN pg_class c ON p.polrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND c.relname NOT LIKE '%_2026%'
        AND NOT EXISTS (
          SELECT 1 FROM pg_policy p2
          WHERE p2.polrelid = c.oid
            AND pg_get_expr(p2.polqual, p2.polrelid) LIKE '%tenant_id%'
        )
    )
    SELECT t.table_name
    FROM tables_with_tenant t
    JOIN tables_with_weak_policies w ON t.table_name = w.table_name
    ORDER BY t.table_name
  `);

  const lines: string[] = [];
  lines.push(
    `=== TABLES COM tenant_id MAS POLICIES SEM ISOLAMENTO (${result.rows.length}) ===`,
  );
  lines.push("");
  lines.push(
    "Estas tabelas tem coluna tenant_id mas NENHUMA policy referencia tenant_id",
  );
  lines.push("no USING expression — potencial vazamento cross-tenant.");
  lines.push("");

  for (const row of result.rows) {
    // Busca as policies desta tabela
    const polResult = await pool().query(
      `
      SELECT p.polname, p.polcmd, pg_get_expr(p.polqual, p.polrelid) as using_expr,
             pg_get_expr(p.polwithcheck, p.polrelid) as with_check
      FROM pg_policy p
      JOIN pg_class c ON p.polrelid = c.oid
      WHERE c.relname = $1
    `,
      [row.table_name],
    );

    lines.push(`  ${row.table_name}:`);
    for (const p of polResult.rows) {
      const cmd = p.polcmd === "*" ? "ALL" : p.polcmd;
      lines.push(
        `    - ${p.polname} [${cmd}] USING: ${p.using_expr ?? "N/A"}${p.with_check ? " WITH CHECK: " + p.with_check : ""}`,
      );
    }
    lines.push("");
  }

  writeFileSync("rls-weak-policies.txt", lines.join("\n"), "utf-8");
  console.warn(
    `Found ${result.rows.length} tables with weak policies. Written to rls-weak-policies.txt`,
  );
  await closePool();
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
