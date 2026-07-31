# Extrai token do backend direto e testa proxy
$BACKEND = "http://localhost:3001/api/v1"
$FRONTEND = "http://localhost:3000"

# 1. Login direto no backend
$loginBody = '{"email":"admin@jlmirror.com","password":"Jlm@2026"}'
$loginRes = & curl.exe --noproxy "*" -s -X POST -H "Content-Type: application/json" -d $loginBody "$BACKEND/auth/login"
$loginData = $loginRes | ConvertFrom-Json
$token = $loginData.access_token
Write-Host "Token: $($token.Substring(0, 30))..."

# 2. Testa via proxy do frontend com cookie
Write-Host "`n=== /api/v1/settings/modules via proxy (cookie) ==="
& curl.exe --noproxy "*" -s -w "`nHTTP %{http_code}" -H "Cookie: access_token=$token; refresh_token=$($loginData.refresh_token)" "$FRONTEND/api/v1/settings/modules"

# 3. Testa via proxy do frontend com zabbix/devices
Write-Host "`n`n=== /api/v1/zabbix/devices via proxy (cookie) ==="
& curl.exe --noproxy "*" -s -w "`nHTTP %{http_code}" -H "Cookie: access_token=$token; refresh_token=$($loginData.refresh_token)" "$FRONTEND/api/v1/zabbix/devices"

# 4. Testa direto no backend com Authorization
Write-Host "`n`n=== /api/v1/settings/modules direto backend ==="
& curl.exe --noproxy "*" -s -w "`nHTTP %{http_code}" -H "Authorization: Bearer $token" "$BACKEND/settings/modules"
