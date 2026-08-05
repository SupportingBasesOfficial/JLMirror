import { config as loadEnv } from "dotenv";
loadEnv();
import { pool, closePool } from "./index.js";

async function main() {
  const tables = [
    "alert_escalation_instances",
    "alert_escalation_policies",
    "audit_log",
    "client_companies",
    "client_contacts",
    "lgpd_requests",
    "patch_deployment_jobs",
    "patch_scans",
    "patches",
    "security_audit_findings",
    "security_audit_rules",
    "security_audit_scans",
    "sso_providers",
    "tenant_routes",
    "tenant_users",
  ];
  for (const t of tables) {
    const r = await pool().query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = 'tenant_id'",
      [t],
    );
    if (r.rows.length > 0) {
      console.warn(`${t}: tenant_id = ${r.rows[0].data_type}`);
    } else {
      console.warn(`${t}: NO tenant_id column`);
    }
  }
  await closePool();
}
main().catch(console.error);
