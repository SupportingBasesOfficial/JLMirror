# Extrai token do body do login e usa no header
$BASE = "http://localhost:3000"

# 1. Login
$loginBody = '{"email":"admin@jlmirror.com","password":"Jlm@2026"}'
$loginRes = & curl.exe --noproxy "*" -s -X POST -H "Content-Type: application/json" -d $loginBody "$BASE/api/auth/login"
$loginData = $loginRes | ConvertFrom-Json
$token = $loginData.access_token
Write-Host "Token: $($token.Substring(0, 30))..."

# 2. Testa /api/v1/settings/modules com cookie manual
Write-Host "`n=== /api/v1/settings/modules (com cookie) ==="
& curl.exe --noproxy "*" -s -w "`nHTTP %{http_code}" -H "Cookie: access_token=$token" "$BASE/api/v1/settings/modules"

# 3. Testa /api/v1/zabbix/devices com cookie manual
Write-Host "`n`n=== /api/v1/zabbix/devices (com cookie) ==="
& curl.exe --noproxy "*" -s -w "`nHTTP %{http_code}" -H "Cookie: access_token=$token" "$BASE/api/v1/zabbix/devices"

# 4. Testa /api/v1/settings/modules com Authorization header direto
Write-Host "`n`n=== /api/v1/settings/modules (com Authorization) ==="
& curl.exe --noproxy "*" -s -w "`nHTTP %{http_code}" -H "Authorization: Bearer $token" "$BASE/api/v1/settings/modules"
