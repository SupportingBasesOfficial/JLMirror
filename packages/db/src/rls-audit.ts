// Auditoria RLS: tabelas sem RLS, tabelas com RLS sem policies, tabelas com tenant_id sem RLS
import { config as loadEnv } from "dotenv";
loadEnv();
import { pool, closePool } from "./index.js";
import { writeFileSync } from "node:fs";

async function main() {
  const lines: string[] = [];

  // 1. Todas as tabelas do schema public com status de RLS
  const rlsStatus = await pool().query(`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced,
      EXISTS (
        SELECT 1 FROM pg_policy p
        JOIN pg_class c2 ON p.polrelid = c2.oid
        WHERE c2.relname = c.relname
      ) AS has_policies
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE '%_2026%'
    ORDER BY c.relname
  `);

  lines.push("=== RLS STATUS (tabelas non-partition) ===");
  const noRls: string[] = [];
  const rlsNoPolicies: string[] = [];
  const rlsOk: string[] = [];

  for (const row of rlsStatus.rows) {
    const status = `rls=${row.rls_enabled}, forced=${row.rls_forced}, policies=${row.has_policies}`;
    if (!row.rls_enabled) {
      noRls.push(`  ${row.table_name}: ${status}`);
    } else if (!row.has_policies) {
      rlsNoPolicies.push(`  ${row.table_name}: ${status}`);
    } else {
      rlsOk.push(`  ${row.table_name}: ${status}`);
    }
  }

  lines.push(`\n--- SEM RLS (${noRls.length} tabelas) ---`);
  lines.push(...noRls);
  lines.push(
    `\n--- RLS ATIVO SEM POLICIES (${rlsNoPolicies.length} tabelas) ---`,
  );
  lines.push(...rlsNoPolicies);
  lines.push(`\n--- RLS OK (${rlsOk.length} tabelas) ---`);
  lines.push(...rlsOk);

  // 2. Tabelas com tenant_id mas sem RLS
  const tenantIdNoRls = await pool().query(`
    SELECT
      t.table_name,
      EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'tenant_id'
      ) AS has_tenant_id,
      c.relrowsecurity AS rls_enabled
    FROM information_schema.tables t
    JOIN pg_class c ON c.relname = t.table_name
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND n.nspname = 'public'
      AND t.table_name NOT LIKE '%_2026%'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns c2
        WHERE c2.table_schema = 'public' AND c2.table_name = t.table_name AND c2.column_name = 'tenant_id'
      )
      AND c.relrowsecurity = false
    ORDER BY t.table_name
  `);

  lines.push(
    `\n=== TABELAS COM tenant_id MAS SEM RLS (${tenantIdNoRls.rows.length}) ===`,
  );
  for (const row of tenantIdNoRls.rows) {
    lines.push(`  ${row.table_name}`);
  }

  // 3. Partições (tabelas _2026*) — verificar RLS
  const partitions = await pool().query(`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE '%_2026%'
    ORDER BY c.relname
  `);

  lines.push(
    `\n=== PARTIÇÕES (_2026*) — RLS STATUS (${partitions.rows.length} partições) ===`,
  );
  const partNoRls: string[] = [];
  const partRls: string[] = [];
  for (const row of partitions.rows) {
    if (row.rls_enabled) {
      partRls.push(
        `  ${row.table_name}: rls=${row.rls_enabled}, forced=${row.rls_forced}`,
      );
    } else {
      partNoRls.push(`  ${row.table_name}: rls=${row.rls_enabled}`);
    }
  }
  lines.push(`\n--- PARTIÇÕES SEM RLS (${partNoRls.length}) ---`);
  lines.push(...partNoRls);
  lines.push(`\n--- PARTIÇÕES COM RLS (${partRls.length}) ---`);
  lines.push(...partRls);

  // 4. Policies detalhadas por tabela
  const policies = await pool().query(`
    SELECT
      c.relname AS table_name,
      p.polname AS policy_name,
      p.polcmd AS command,
      p.polpermissive AS permissive,
      pg_get_expr(p.polqual, p.polrelid) AS using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expr
    FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    ORDER BY c.relname, p.polname
  `);

  lines.push(
    `\n=== POLICIES DETALHADAS (${policies.rows.length} policies) ===`,
  );
  let lastTable = "";
  for (const row of policies.rows) {
    if (row.table_name !== lastTable) {
      lines.push(`\n  ${row.table_name}:`);
      lastTable = row.table_name;
    }
    const cmd = row.command === "*" ? "ALL" : row.command;
    lines.push(
      `    - ${row.policy_name} [${cmd}] permissive=${row.permissive}`,
    );
    if (row.using_expr) lines.push(`      USING: ${row.using_expr}`);
    if (row.with_check_expr)
      lines.push(`      WITH CHECK: ${row.with_check_expr}`);
  }

  writeFileSync("rls-audit-output.txt", lines.join("\n"), "utf-8");
  console.warn(
    `Audit complete. ${lines.length} lines written to rls-audit-output.txt`,
  );
  await closePool();
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
