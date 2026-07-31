import { config as loadEnv } from "dotenv";
loadEnv();

const BASE = "http://localhost:3001/api/v1";

async function main() {
  // Login
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@jlmirror.com", password: "Jlm@2026" }),
  });
  const loginData = await loginRes.json();
  const token = loginData.access_token;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  function test(method, path, body) {
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    return fetch(`${BASE}${path}`, opts).then(async r => {
      const text = await r.text();
      const trunc = text.substring(0, 120);
      console.log(`[${r.status}] ${method} ${path} => ${trunc}`);
      return { status: r.status, data: text };
    });
  }

  console.log("=== ZABBIX USERS CRUD ===");
  await test("GET", "/zabbix/users");

  console.log("\n=== ZABBIX USER GROUPS ===");
  await test("GET", "/zabbix/user-groups");

  console.log("\n=== USER HOST GROUPS (empty) ===");
  await test("GET", "/zabbix/user-host-groups");

  const adminUserId = loginData.user.id;
  console.log(`\nAdmin user_id: ${adminUserId}`);

  console.log("\n=== ASSIGN USER TO HOST GROUP ===");
  const assignRes = await test("POST", "/zabbix/user-host-groups", {
    user_id: adminUserId,
    zabbix_host_group_id: "35",
    zabbix_host_group_name: "JLTECNOLOGIA/NOC/SERVIDORES",
  });
  const assignData = JSON.parse(assignRes.data);
  const assignmentId = assignData.id;

  console.log("\n=== GET USER HOST GROUPS (after assign) ===");
  await test("GET", "/zabbix/user-host-groups");

  console.log("\n=== GET BY USER ===");
  await test("GET", `/zabbix/user-host-groups?user_id=${adminUserId}`);

  console.log("\n=== GET BY GROUP 35 ===");
  await test("GET", "/zabbix/user-host-groups/by-group/35");

  console.log("\n=== DELETE ASSIGNMENT ===");
  if (assignmentId) {
    await test("DELETE", `/zabbix/user-host-groups/${assignmentId}`);
  }

  console.log("\n=== GET AFTER DELETE ===");
  await test("GET", "/zabbix/user-host-groups");

  console.log("\n=== DONE ===");
}

main().catch(console.error);
