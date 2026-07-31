$BASE = "http://localhost:3001"
$loginBody = "{`"email`":`"admin@jlmirror.com`",`"password`":`"Jlm@2026`"}"
$resp = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody
$loginData = $resp.Content | ConvertFrom-Json
$token = $loginData.access_token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "=== ZABBIX TEST ===" -ForegroundColor "Cyan"

# Test /api/v1/zabbix/test
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/zabbix/test" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /zabbix/test -> $($r.StatusCode)" -ForegroundColor "Green"
    Write-Host "  Body: $($r.Content)" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /zabbix/test -> $status" -ForegroundColor "Red"
}

# Test /api/v1/zabbix/test2
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/zabbix/test2" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /zabbix/test2 -> $($r.StatusCode)" -ForegroundColor "Green"
    Write-Host "  Body: $($r.Content)" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /zabbix/test2 -> $status" -ForegroundColor "Red"
}

# Test /api/v1/zabbix/test3
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/zabbix/test3" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /zabbix/test3 -> $($r.StatusCode)" -ForegroundColor "Green"
    Write-Host "  Body: $($r.Content)" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /zabbix/test3 -> $status" -ForegroundColor "Red"
}

# Test /api/v1/zabbix/ping
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/zabbix/ping" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /zabbix/ping -> $($r.StatusCode)" -ForegroundColor "Green"
    Write-Host "  Body: $($r.Content)" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /zabbix/ping -> $status" -ForegroundColor $(if ($status -eq 503) { "Yellow" } else { "Red" })
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        Write-Host "  Body: $body" -ForegroundColor $(if ($body) { "DarkGray" } else { "Yellow" })
    } catch {
        Write-Host "  No body" -ForegroundColor "Yellow"
    }
}

# Test /api/v1/zabbix/devices
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/zabbix/devices" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /zabbix/devices -> $($r.StatusCode)" -ForegroundColor "Green"
    Write-Host "  Body: $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /zabbix/devices -> $status" -ForegroundColor "Red"
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "  Body: $($reader.ReadToEnd())" -ForegroundColor "Yellow"
    } catch {
        Write-Host "  No body" -ForegroundColor "Yellow"
    }
}

# Test /api/v1/zabbix/triggers
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/zabbix/triggers" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /zabbix/triggers -> $($r.StatusCode)" -ForegroundColor "Green"
    Write-Host "  Body: $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /zabbix/triggers -> $status" -ForegroundColor "Red"
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "  Body: $($reader.ReadToEnd())" -ForegroundColor "Yellow"
    } catch {
        Write-Host "  No body" -ForegroundColor "Yellow"
    }
}

# Test /api/v1/zabbix/version
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/zabbix/version" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /zabbix/version -> $($r.StatusCode)" -ForegroundColor "Green"
    Write-Host "  Body: $($r.Content)" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /zabbix/version -> $status" -ForegroundColor "Red"
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "  Body: $($reader.ReadToEnd())" -ForegroundColor "Yellow"
    } catch {
        Write-Host "  No body" -ForegroundColor "Yellow"
    }
}
