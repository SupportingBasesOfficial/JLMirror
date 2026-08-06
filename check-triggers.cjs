const http = require("http");

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  const login = await fetchJson("http://localhost:3001/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@jlmirror.com", password: "admin123" }),
  });
  const token = login.access_token;

  const data = await fetchJson("http://localhost:3001/api/v1/zabbix/triggers", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const active0 = data.data.filter((t) => t.value === "1" && t.lastchange === "0");
  console.log(`Active with lastchange=0: ${active0.length}`);
  if (active0.length > 0) {
    const t = active0[0];
    console.log("Example:", JSON.stringify({
      triggerid: t.triggerid,
      description: t.description,
      lastchange: t.lastchange,
      lastEvent: t.lastEvent,
      lastEventIsArray: Array.isArray(t.lastEvent),
    }, null, 2));
  }

  const activeOk = data.data.filter((t) => t.value === "1" && t.lastchange !== "0");
  console.log(`\nActive with lastchange!=0: ${activeOk.length}`);
  if (activeOk.length > 0) {
    const t = activeOk[0];
    console.log("Example:", JSON.stringify({
      triggerid: t.triggerid,
      description: t.description,
      lastchange: t.lastchange,
      lastEvent: t.lastEvent,
    }, null, 2));
  }
}

main().catch(console.error);
