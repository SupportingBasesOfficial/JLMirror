# Testa API Zabbix diretamente com curl.exe
$tmpFile = [System.IO.Path]::GetTempFileName()
$jsonBody = '{"jsonrpc":"2.0","method":"apiinfo.version","params":{},"id":1}'
Set-Content -Path $tmpFile -Value $jsonBody -NoNewline

Write-Host "=== Test 1: apiinfo.version (no auth) ==="
& curl.exe --noproxy "*" -s -X POST -H "Content-Type: application/json-rpc" -d "@$tmpFile" "https://zabbix.jlinformatica.com.br/api_jsonrpc.php"
Write-Host ""

Write-Host "=== Test 2: apiinfo.version with application/json ==="
& curl.exe --noproxy "*" -s -X POST -H "Content-Type: application/json" -d "@$tmpFile" "https://zabbix.jlinformatica.com.br/api_jsonrpc.php"
Write-Host ""

# Test user.login
$loginBody = '{"jsonrpc":"2.0","method":"user.login","params":{"username":"Admin","password":"zabbix"},"id":2}'
Set-Content -Path $tmpFile -Value $loginBody -NoNewline

Write-Host "=== Test 3: user.login ==="
& curl.exe --noproxy "*" -s -X POST -H "Content-Type: application/json-rpc" -d "@$tmpFile" "https://zabbix.jlinformatica.com.br/api_jsonrpc.php"
Write-Host ""

Remove-Item $tmpFile -Force
