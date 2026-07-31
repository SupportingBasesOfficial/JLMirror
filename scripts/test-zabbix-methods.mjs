// Testa problem.get e user.get diretamente no Zabbix
import { config as loadEnv } from "dotenv";
import pg from "pg";
import crypto from "node:crypto";

loadEnv();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const tenantRes = await pool.query(`
    SELECT tu.tenant_id as id FROM public.tenant_users tu
    JOIN public.users u ON u.id = tu.user_id
    WHERE u.email = 'admin@jlmirror.com' LIMIT 1
  `);
  const tenantId = tenantRes.rows[0].id;
  
  const configRes = await pool.query(`SELECT * FROM public.get_tenant_zabbix_config($1)`, [tenantId]);
  const config = configRes.rows[0];
  
  const keyHex = process.env.ZABBIX_ENCRYPTION_KEY_HEX;
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(config.zabbix_token_iv, 'base64');
  const tag = Buffer.from(config.zabbix_token_tag, 'base64');
  const encrypted = Buffer.from(config.zabbix_encrypted_token, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let token = decipher.update(encrypted, undefined, 'utf8');
  token += decipher.final('utf8');
  
  const apiUrl = config.zabbix_api_url;
  const headers = { "Content-Type": "application/json-rpc", "Authorization": `Bearer ${token}` };
  
  // Test 1: problem.get sem severity_from
  console.log("=== problem.get (sem severity_from) ===");
  let body = JSON.stringify({ jsonrpc: "2.0", method: "problem.get", params: { output: "extend", sortfield: ["eventid"], sortorder: "DESC", selectHosts: ["hostid","host","name"] }, id: 1 });
  let res = await fetch(apiUrl, { method: "POST", headers, body });
  let text = await res.text();
  console.log(`Status: ${res.status}, Body: ${text.substring(0, 400)}`);
  
  // Test 2: problem.get com severity_from
  console.log("\n=== problem.get (com severity_from) ===");
  body = JSON.stringify({ jsonrpc: "2.0", method: "problem.get", params: { output: "extend", sortfield: ["eventid"], sortorder: "DESC", selectHosts: ["hostid","host","name"], severity_from: 3 }, id: 2 });
  res = await fetch(apiUrl, { method: "POST", headers, body });
  text = await res.text();
  console.log(`Status: ${res.status}, Body: ${text.substring(0, 400)}`);
  
  // Test 3: user.get com role
  console.log("\n=== user.get (com role) ===");
  body = JSON.stringify({ jsonrpc: "2.0", method: "user.get", params: { output: ["userid","username","name","surname","role"] }, id: 3 });
  res = await fetch(apiUrl, { method: "POST", headers, body });
  text = await res.text();
  console.log(`Status: ${res.status}, Body: ${text.substring(0, 400)}`);
  
  // Test 4: user.get sem role
  console.log("\n=== user.get (sem role) ===");
  body = JSON.stringify({ jsonrpc: "2.0", method: "user.get", params: { output: ["userid","username","name","surname"] }, id: 4 });
  res = await fetch(apiUrl, { method: "POST", headers, body });
  text = await res.text();
  console.log(`Status: ${res.status}, Body: ${text.substring(0, 400)}`);
  
  // Test 5: discoveryrule.get
  console.log("\n=== discoveryrule.get ===");
  body = JSON.stringify({ jsonrpc: "2.0", method: "discoveryrule.get", params: { output: ["ruleid","name","key_","hostid","status"] }, id: 5 });
  res = await fetch(apiUrl, { method: "POST", headers, body });
  text = await res.text();
  console.log(`Status: ${res.status}, Body: ${text.substring(0, 400)}`);
  
  // Test 6: report.get
  console.log("\n=== report.get ===");
  body = JSON.stringify({ jsonrpc: "2.0", method: "report.get", params: { output: "extend" }, id: 6 });
  res = await fetch(apiUrl, { method: "POST", headers, body });
  text = await res.text();
  console.log(`Status: ${res.status}, Body: ${text.substring(0, 400)}`);
  
  // Test 7: proxy.get
  console.log("\n=== proxy.get ===");
  body = JSON.stringify({ jsonrpc: "2.0", method: "proxy.get", params: { output: "extend" }, id: 7 });
  res = await fetch(apiUrl, { method: "POST", headers, body });
  text = await res.text();
  console.log(`Status: ${res.status}, Body: ${text.substring(0, 400)}`);
  
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
