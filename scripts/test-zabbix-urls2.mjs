// Testa varias URLs possiveis do Zabbix
const urls = [
  "https://zabbix.jlinformatica.com.br/api_jsonrpc.php",
  "https://zabbix.jllinformatica.com.br/api_jsonrpc.php",
  "https://zabbix.jlinformatica.ccom.br/api_jsonrpc.php",
  "https://zabbix.jllinformatica.ccom.br/api_jsonrpc.php",
  "https://zabbix.jlinformatica.com.br/zabbix/api_jsonrpc.php",
];

const body = JSON.stringify({
  jsonrpc: "2.0",
  method: "apiinfo.version",
  params: [],
  id: 1
});

for (const url of urls) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json-rpc" },
      body
    });
    const text = await res.text();
    console.log(`[${res.status}] ${url}`);
    console.log(`  => ${text.substring(0, 200)}`);
  } catch (e) {
    console.log(`[ERR] ${url}`);
    console.log(`  => ${e.message}`);
  }
  console.log("");
}
