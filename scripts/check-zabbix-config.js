// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  // 1. Verifica se a function existe
  const funcRes = await pool.query(`
    SELECT proname FROM pg_proc WHERE proname = 'get_tenant_zabbix_config'
  `);
  console.log("Function exists:", funcRes.rows.length > 0);

  // 2. Busca tenant do admin via tenant_users
  const tenantRes = await pool.query(`
    SELECT tu.tenant_id as id FROM public.tenant_users tu
    JOIN public.users u ON u.id = tu.user_id
    WHERE u.email = 'admin@jlmirror.com'
    LIMIT 1
  `);
  console.log("Tenant:", JSON.stringify(tenantRes.rows[0]));

  // 3. Verifica se tenant_settings tem campos zabbix
  const colRes = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'tenant_settings' AND column_name LIKE 'zabbix%'
  `);
  console.log("Zabbix columns in tenant_settings:", JSON.stringify(colRes.rows));

  // 4. Tenta chamar a function
  const tenantId = tenantRes.rows[0]?.id;
  if (tenantId) {
    try {
      const configRes = await pool.query(`SELECT * FROM public.get_tenant_zabbix_config($1)`, [tenantId]);
      console.log("Config result:", JSON.stringify(configRes.rows[0]));
    } catch (e) {
      console.log("Function error:", e.message);
    }

    // 5. Busca diretamente na tenant_settings
    const settingsRes = await pool.query(`
      SELECT * FROM public.tenant_settings WHERE tenant_id = $1
    `, [tenantId]);
    console.log("Settings row keys:", Object.keys(settingsRes.rows[0] || {}));
  }

  // 6. Decrypt token e testa API Zabbix diretamente
  const crypto = await import('node:crypto');
  const configRes = await pool.query(`SELECT * FROM public.get_tenant_zabbix_config($1)`, [tenantRes.rows[0].id]);
  const config = configRes.rows[0];
  
  const keyHex = process.env.ZABBIX_ENCRYPTION_KEY_HEX;
  console.log("\nEncryption key set:", !!keyHex);
  
  if (keyHex && config.zabbix_encrypted_token) {
    try {
      const key = Buffer.from(keyHex, 'hex');
      const iv = Buffer.from(config.zabbix_token_iv, 'base64');
      const tag = Buffer.from(config.zabbix_token_tag, 'base64');
      const encrypted = Buffer.from(config.zabbix_encrypted_token, 'base64');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      console.log("Decrypted token (first 10 chars):", decrypted.substring(0, 10) + "...");
      console.log("Token length:", decrypted.length);
      
      // Testa chamada direta ao Zabbix com o token
      const apiBody = JSON.stringify({
        jsonrpc: "2.0",
        method: "host.get",
        params: { output: ["hostid", "host", "name"], limit: 1 },
        id: 1
      });
      
      // Testa URL original
      const urls = [
        config.zabbix_api_url,
        "https://zabbix.jlinformatica.com.br/zabbix/api_jsonrpc.php",
        "https://zabbix.jlinformatica.com.br/api_jsonrpc.php",
      ];
      
      for (const url of urls) {
        console.log(`\nTesting URL: ${url}`);
        try {
          const apiRes = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json-rpc",
              "Authorization": `Bearer ${decrypted}`
            },
            body: apiBody
          });
          const apiText = await apiRes.text();
          console.log(`  Status: ${apiRes.status}`);
          console.log(`  Response: ${apiText.substring(0, 300)}`);
        } catch (e) {
          console.log(`  Error: ${e.message}`);
        }
      }
    } catch (e) {
      console.log("Decrypt/API error:", e.message);
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
