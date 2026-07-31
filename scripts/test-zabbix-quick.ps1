$BASE = "http://localhost:3001/api/v1"

# Login
$body = '{"email":"admin@jlmirror.com","password":"Jlm@2026"}'
$loginRes = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/auth/login" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 10
$loginData = $loginRes.Content | ConvertFrom-Json
$token = $loginData.access_token

$tmpFile = [System.IO.Path]::GetTempFileName()
$headers = @{ Authorization = "Bearer $token" }

# Testar ping
Write-Host "=== /zabbix/ping ==="
& curl.exe --noproxy "*" -s -H "Authorization: Bearer $token" "$BASE/zabbix/ping"
Write-Host ""

# Testar version
Write-Host "=== /zabbix/version ==="
& curl.exe --noproxy "*" -s -H "Authorization: Bearer $token" "$BASE/zabbix/version"
Write-Host ""

# Testar devices
Write-Host "=== /zabbix/devices ==="
& curl.exe --noproxy "*" -s -H "Authorization: Bearer $token" "$BASE/zabbix/devices" 2>&1 | Out-File -FilePath $tmpFile -Encoding utf8
$content = Get-Content $tmpFile -Raw
if ($content.Length -gt 500) { $content = $content.Substring(0, 500) + "..." }
Write-Host $content
Write-Host ""

# Testar host-groups
Write-Host "=== /zabbix/host-groups ==="
& curl.exe --noproxy "*" -s -H "Authorization: Bearer $token" "$BASE/zabbix/host-groups" 2>&1 | Out-File -FilePath $tmpFile -Encoding utf8
$content = Get-Content $tmpFile -Raw
if ($content.Length -gt 500) { $content = $content.Substring(0, 500) + "..." }
Write-Host $content
Write-Host ""

# Testar problems
Write-Host "=== /zabbix/problems ==="
& curl.exe --noproxy "*" -s -H "Authorization: Bearer $token" "$BASE/zabbix/problems" 2>&1 | Out-File -FilePath $tmpFile -Encoding utf8
$content = Get-Content $tmpFile -Raw
if ($content.Length -gt 500) { $content = $content.Substring(0, 500) + "..." }
Write-Host $content
Write-Host ""

Remove-Item $tmpFile -Force
