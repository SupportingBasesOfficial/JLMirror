$BASE = "http://localhost:3001"

# Login
$loginBody = "{`"email`":`"admin@jlmirror.com`",`"password`":`"Jlm@2026`"}"
$resp = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody
$loginData = $resp.Content | ConvertFrom-Json
$token = $loginData.access_token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "=== DASHBOARD ===" -ForegroundColor "Cyan"

# Test /api/v1/dashboard/overview
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/dashboard/overview" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /dashboard/overview -> $($r.StatusCode)" -ForegroundColor "Green"
    Write-Host "  Body: $($r.Content.Substring(0, [Math]::Min(300, $r.Content.Length)))" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /dashboard/overview -> $status" -ForegroundColor $(if ($status -eq 200) { "Green" } else { "Red" })
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "  Body: $($reader.ReadToEnd())" -ForegroundColor "Yellow"
    } catch {
        Write-Host "  No body" -ForegroundColor "Yellow"
    }
}

# Test /api/v1/dashboard (raiz)
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/dashboard" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /dashboard -> $($r.StatusCode)" -ForegroundColor "Green"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /dashboard -> $status" -ForegroundColor $(if ($status -eq 200) { "Green" } else { "Red" })
}

# Test /api/v1/dashboard/navigation
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/dashboard/navigation" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /dashboard/navigation -> $($r.StatusCode)" -ForegroundColor "Green"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /dashboard/navigation -> $status" -ForegroundColor $(if ($status -eq 200) { "Green" } else { "Red" })
}

Write-Host "`n=== ZABBIX ===" -ForegroundColor "Cyan"

# Test /api/v1/zabbix/devices (o route define /devices, nao /hosts)
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/zabbix/devices" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /zabbix/devices -> $($r.StatusCode)" -ForegroundColor "Green"
    Write-Host "  Body: $($r.Content.Substring(0, [Math]::Min(300, $r.Content.Length)))" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /zabbix/devices -> $status" -ForegroundColor $(if ($status -eq 200) { "Green" } else { "Red" })
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "  Body: $($reader.ReadToEnd())" -ForegroundColor "Yellow"
    } catch {
        Write-Host "  No body" -ForegroundColor "Yellow"
    }
}

# Test /api/v1/zabbix/problems
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/zabbix/problems" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /zabbix/problems -> $($r.StatusCode)" -ForegroundColor "Green"
    Write-Host "  Body: $($r.Content.Substring(0, [Math]::Min(300, $r.Content.Length)))" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /zabbix/problems -> $status" -ForegroundColor $(if ($status -eq 200) { "Green" } else { "Red" })
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
    Write-Host "  Body: $($r.Content.Substring(0, [Math]::Min(300, $r.Content.Length)))" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /zabbix/triggers -> $status" -ForegroundColor $(if ($status -eq 200) { "Green" } else { "Red" })
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "  Body: $($reader.ReadToEnd())" -ForegroundColor "Yellow"
    } catch {
        Write-Host "  No body" -ForegroundColor "Yellow"
    }
}

# Test /api/v1/zabbix/ping
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/zabbix/ping" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "GET /zabbix/ping -> $($r.StatusCode)" -ForegroundColor "Green"
    Write-Host "  Body: $($r.Content.Substring(0, [Math]::Min(300, $r.Content.Length)))" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /zabbix/ping -> $status" -ForegroundColor $(if ($status -eq 200) { "Green" } else { "Red" })
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
    Write-Host "  Body: $($r.Content.Substring(0, [Math]::Min(300, $r.Content.Length)))" -ForegroundColor "DarkGray"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "GET /zabbix/version -> $status" -ForegroundColor $(if ($status -eq 200) { "Green" } else { "Red" })
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "  Body: $($reader.ReadToEnd())" -ForegroundColor "Yellow"
    } catch {
        Write-Host "  No body" -ForegroundColor "Yellow"
    }
}
