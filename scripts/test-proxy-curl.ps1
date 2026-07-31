# Testa com curl passando cookies
$BASE = "http://localhost:3000"

# 1. Login e captura cookies
$loginBody = '{"email":"admin@jlmirror.com","password":"Jlm@2026"}'
$loginRes = & curl.exe --noproxy "*" -s -c - -X POST -H "Content-Type: application/json" -d $loginBody "$BASE/api/auth/login"
Write-Host "Login response: $($loginRes.Substring(0, [Math]::Min(100, $loginRes.Length)))"

# Extrai cookies do output do curl (-c -)
# Usa arquivo temporario para cookies
$cookieFile = [System.IO.Path]::GetTempFileName()
& curl.exe --noproxy "*" -s -c $cookieFile -X POST -H "Content-Type: application/json" -d $loginBody "$BASE/api/auth/login" | Out-Null

# Le o cookie file
$cookieContent = Get-Content $cookieFile -Raw
Write-Host "`nCookie file content:"
Write-Host $cookieContent

# 2. Testa /api/v1/settings/modules com cookies
Write-Host "`n=== /api/v1/settings/modules ==="
& curl.exe --noproxy "*" -s -b $cookieFile -w "`nHTTP %{http_code}" "$BASE/api/v1/settings/modules"

# 3. Testa /api/v1/zabbix/devices com cookies
Write-Host "`n`n=== /api/v1/zabbix/devices ==="
& curl.exe --noproxy "*" -s -b $cookieFile -w "`nHTTP %{http_code}" "$BASE/api/v1/zabbix/devices"

Remove-Item $cookieFile -Force
