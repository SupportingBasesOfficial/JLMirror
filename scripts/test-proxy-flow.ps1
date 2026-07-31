# Testa o fluxo completo: login -> pegar cookies -> usar proxy com cookies
$BASE = "http://localhost:3000"

$body = '{"email":"admin@jlmirror.com","password":"Jlm@2026"}'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# 1. Login
$res = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/auth/login" -Method Post -ContentType "application/json" -Body $body -WebSession $session -TimeoutSec 10
Write-Host "Login: $($res.StatusCode)"

# Mostra cookies
foreach ($cookie in $session.Cookies.GetCookies($BASE)) {
    Write-Host "Cookie: $($cookie.Name) = $($cookie.Value.Substring(0, [Math]::Min(20, $cookie.Value.Length)))..."
}

# 2. Testa /api/v1/settings/modules via proxy
Write-Host ""
Write-Host "Testando /api/v1/settings/modules via proxy..."
try {
    $res2 = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/settings/modules" -Method Get -WebSession $session -TimeoutSec 10
    Write-Host "Status: $($res2.StatusCode)"
    Write-Host "Body: $($res2.Content.Substring(0, [Math]::Min(200, $res2.Content.Length)))"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body = ""
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
    } catch {}
    Write-Host "Status: $status"
    Write-Host "Body: $body"
}

# 3. Testa /api/v1/zabbix/ping via proxy (rota dedicada)
Write-Host ""
Write-Host "Testando /api/zabbix/ping via proxy dedicado..."
try {
    $res3 = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/zabbix/ping" -Method Get -WebSession $session -TimeoutSec 10
    Write-Host "Status: $($res3.StatusCode)"
    Write-Host "Body: $($res3.Content)"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Write-Host "Status: $status"
}

# 4. Testa /api/v1/zabbix/devices via proxy generico
Write-Host ""
Write-Host "Testando /api/v1/zabbix/devices via proxy generico..."
try {
    $res4 = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/zabbix/devices" -Method Get -WebSession $session -TimeoutSec 10
    Write-Host "Status: $($res4.StatusCode)"
    Write-Host "Body: $($res4.Content.Substring(0, [Math]::Min(200, $res4.Content.Length)))"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body = ""
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
    } catch {}
    Write-Host "Status: $status"
    Write-Host "Body: $body"
}
