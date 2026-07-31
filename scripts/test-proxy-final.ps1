# Testa proxy com Invoke-WebRequest e session
$FRONTEND = "http://localhost:3000"
$BACKEND = "http://localhost:3001/api/v1"

# 1. Login direto no backend
$body = '{"email":"admin@jlmirror.com","password":"Jlm@2026"}'
$loginRes = Invoke-WebRequest -UseBasicParsing -Uri "$BACKEND/auth/login" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 10
$loginData = $loginRes.Content | ConvertFrom-Json
$token = $loginData.access_token
Write-Host "Backend token: $($token.Substring(0, 30))..."

# 2. Testa via proxy do frontend passando cookie manualmente
Write-Host "`n=== /api/v1/settings/modules via proxy (cookie manual) ==="
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$FRONTEND/api/v1/settings/modules" -Method Get -Headers @{ Cookie = "access_token=$token; refresh_token=$($loginData.refresh_token)" } -TimeoutSec 10
    Write-Host "Status: $($res.StatusCode)"
    Write-Host "Body: $($res.Content.Substring(0, [Math]::Min(200, $res.Content.Length)))"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body = ""
    try { $stream = $_.Exception.Response.GetResponseStream(); $reader = New-Object System.IO.StreamReader($stream); $body = $reader.ReadToEnd() } catch {}
    Write-Host "Status: $status Body: $body"
}

# 3. Testa /api/v1/zabbix/devices via proxy
Write-Host "`n=== /api/v1/zabbix/devices via proxy (cookie manual) ==="
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$FRONTEND/api/v1/zabbix/devices" -Method Get -Headers @{ Cookie = "access_token=$token; refresh_token=$($loginData.refresh_token)" } -TimeoutSec 10
    Write-Host "Status: $($res.StatusCode)"
    Write-Host "Body: $($res.Content.Substring(0, [Math]::Min(200, $res.Content.Length)))"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body = ""
    try { $stream = $_.Exception.Response.GetResponseStream(); $reader = New-Object System.IO.StreamReader($stream); $body = $reader.ReadToEnd() } catch {}
    Write-Host "Status: $status Body: $body"
}
