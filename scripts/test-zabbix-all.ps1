# Teste completo das rotas Zabbix
$BASE = "http://localhost:3001/api/v1"

# 1. Login
$body = @{ email = "admin@jlmirror.com"; password = "Jlm@2026" } | ConvertTo-Json -Compress
$loginRes = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/auth/login" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 10
$loginData = $loginRes.Content | ConvertFrom-Json
$token = $loginData.access_token
Write-Host "Token obtido: $($token.Substring(0, 20))..."
Write-Host ""

$headers = @{ Authorization = "Bearer $token" }

# Lista de rotas GET para testar
$getRoutes = @(
    "/zabbix/ping",
    "/zabbix/version",
    "/zabbix/devices",
    "/zabbix/triggers",
    "/zabbix/problems",
    "/zabbix/events",
    "/zabbix/templates",
    "/zabbix/maintenances",
    "/zabbix/services",
    "/zabbix/slas",
    "/zabbix/graphs",
    "/zabbix/users",
    "/zabbix/actions",
    "/zabbix/proxies",
    "/zabbix/discovery-rules",
    "/zabbix/reports",
    "/zabbix/host-groups",
    "/zabbix/history-batch",
    "/zabbix/key-items",
    "/zabbix/history"
)

foreach ($route in $getRoutes) {
    $url = "$BASE$route"
    # Adiciona query params para rotas que precisam
    if ($route -eq "/zabbix/key-items") { $url += "?key=system.cpu" }
    if ($route -eq "/zabbix/history") { $url += "?item_id=1&from=1&to=9999999999" }
    if ($route -eq "/zabbix/history-batch") { $url += "?item_ids=1" }
    
    try {
        $res = Invoke-WebRequest -UseBasicParsing -Uri $url -Method Get -Headers $headers -TimeoutSec 15
        $body = $res.Content
        if ($body.Length -gt 200) { $body = $body.Substring(0, 200) + "..." }
        Write-Host "[OK $($res.StatusCode)] $route => $body"
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $body = ""
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $body = $reader.ReadToEnd()
            if ($body.Length -gt 200) { $body = $body.Substring(0, 200) + "..." }
        } catch {}
        Write-Host "[ERR $status] $route => $body"
    }
}

# Testar rota POST /zabbix/sync
Write-Host ""
Write-Host "Testando POST /zabbix/sync..."
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/zabbix/sync" -Method Post -Headers $headers -TimeoutSec 30
    Write-Host "[OK $($res.StatusCode)] /zabbix/sync => $($res.Content)"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body = ""
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
    } catch {}
    Write-Host "[ERR $status] /zabbix/sync => $body"
}

# Testar GET /zabbix/devices/:hostId/items (com hostId ficticio)
Write-Host ""
Write-Host "Testando GET /zabbix/devices/10084/items..."
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/zabbix/devices/10084/items" -Method Get -Headers $headers -TimeoutSec 15
    Write-Host "[OK $($res.StatusCode)] /zabbix/devices/10084/items => $($res.Content.Substring(0, [Math]::Min(200, $res.Content.Length)))"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body = ""
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
    } catch {}
    Write-Host "[ERR $status] /zabbix/devices/10084/items => $body"
}

# Testar GET /zabbix/devices/:hostId (com hostId ficticio)
Write-Host ""
Write-Host "Testando GET /zabbix/devices/10084..."
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/zabbix/devices/10084" -Method Get -Headers $headers -TimeoutSec 15
    Write-Host "[OK $($res.StatusCode)] /zabbix/devices/10084 => $($res.Content.Substring(0, [Math]::Min(200, $res.Content.Length)))"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body = ""
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
    } catch {}
    Write-Host "[ERR $status] /zabbix/devices/10084 => $body"
}

# Testar GET/PUT /zabbix/devices/:hostId/prefs
Write-Host ""
Write-Host "Testando GET /zabbix/devices/10084/prefs..."
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/zabbix/devices/10084/prefs" -Method Get -Headers $headers -TimeoutSec 15
    Write-Host "[OK $($res.StatusCode)] GET /zabbix/devices/10084/prefs => $($res.Content)"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body = ""
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
    } catch {}
    Write-Host "[ERR $status] GET /zabbix/devices/10084/prefs => $body"
}

Write-Host ""
Write-Host "Testando PUT /zabbix/devices/10084/prefs..."
$putBody = @{ device_type = "server"; visible_categories = @(); collapsed_categories = @(); hidden_metrics = @(); pinned_metrics = @() } | ConvertTo-Json -Compress
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/zabbix/devices/10084/prefs" -Method Put -Headers $headers -ContentType "application/json" -Body $putBody -TimeoutSec 15
    Write-Host "[OK $($res.StatusCode)] PUT /zabbix/devices/10084/prefs => $($res.Content)"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body = ""
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
    } catch {}
    Write-Host "[ERR $status] PUT /zabbix/devices/10084/prefs => $body"
}

Write-Host ""
Write-Host "=== Teste completo ==="
