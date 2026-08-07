import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import argon2 from "argon2";
import { config as loadEnv } from "dotenv";

loadEnv();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const ZABBIX_API_URL =
  process.env.ZABBIX_API_URL ??
  "https://zabbix.jlinformatica.com.br/api_jsonrpc.php";

async function seed() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Cria tenant demo
    const tenantResult = await client.query(
      `INSERT INTO public.tenants (name, cnpj, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (cnpj) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ["Tenant Demo", "12.345.678/0001-90", "active"],
    );
    const tenantId = tenantResult.rows[0].id;

    // 2. Gera schema_name no formato tenant_{8 hex chars}
    const slugHex = randomBytes(4).toString("hex");
    const schemaName = `tenant_${slugHex}`;

    // 3. Token Zabbix fica vazio — admin configura via UI durante onboarding
    const tokenData = { encrypted: "", iv: "", tag: "" };

    // 4. Cria rota do tenant (Cluster 0 = local)
    await client.query(
      `INSERT INTO public.tenant_routes (
         tenant_id, cluster_id, cluster_host, cluster_database_name,
         cluster_port, schema_name, is_enterprise,
         zabbix_host_group_id, zabbix_api_url,
         zabbix_encrypted_token, zabbix_token_iv, zabbix_token_tag,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (tenant_id) DO UPDATE SET
         schema_name = EXCLUDED.schema_name,
         zabbix_api_url = EXCLUDED.zabbix_api_url`,
      [
        tenantId,
        "cluster0",
        "localhost",
        "jlmirror",
        5432,
        schemaName,
        false,
        "1",
        ZABBIX_API_URL,
        tokenData.encrypted,
        tokenData.iv,
        tokenData.tag,
        "active",
      ],
    );

    // 5. Cria schema do tenant via onboard_tenant_schema()
    await client.query("SELECT public.onboard_tenant_schema($1)", [slugHex]);

    // 6. Cria usuário admin global em public.users
    const passwordHash = await argon2.hash("admin123", {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const userResult = await client.query(
      `INSERT INTO public.users (email, password_hash, full_name, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         full_name = EXCLUDED.full_name,
         is_active = true
       RETURNING id`,
      ["admin@jlmirror.com", passwordHash, "Administrador Global", true],
    );
    const userId = userResult.rows[0].id;

    // 7. Mapeia user ↔ tenant com role global:admin
    await client.query(
      `INSERT INTO public.tenant_users (user_id, tenant_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role`,
      [userId, tenantId, "global:admin"],
    );

    // 8. Insere dispositivo demo no schema do tenant
    await client.query(
      `INSERT INTO ${schemaName}.devices (tenant_id, hostname, ip, type, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [tenantId, "srv-demo-01", "192.168.1.10", "server", "active"],
    );

    await client.query("COMMIT");
    console.warn("Seed concluído:");
    console.warn(`  Tenant: ${tenantId} (Tenant Demo)`);
    console.warn(`  Schema: ${schemaName}`);
    console.warn(`  User:   admin@jlmirror.com (global:admin)`);
    console.warn(`  Device: srv-demo-01 no schema ${schemaName}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro no seed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
