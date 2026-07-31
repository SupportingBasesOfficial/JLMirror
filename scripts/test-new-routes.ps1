# Testa as novas rotas de users CRUD, user-groups e user-host-groups
$BACKEND = "http://localhost:3001/api/v1"

# Login
$body = '{"email":"admin@jlmirror.com","password":"Jlm@2026"}'
$loginRes = Invoke-WebRequest -UseBasicParsing -Uri "$BACKEND/auth/login" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 10
$loginData = $loginRes.Content | ConvertFrom-Json
$token = $loginData.access_token
$headers = @{ Authorization = "Bearer $token" }

function TestRoute($method, $path, $body = $null) {
    $uri = "$BACKEND$path"
    try {
        if ($body) {
            $res = Invoke-WebRequest -UseBasicParsing -Uri $uri -Method $method -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 15
        } else {
            $res = Invoke-WebRequest -UseBasicParsing -Uri $uri -Method $method -Headers $headers -TimeoutSec 15
        }
        $trunc = $res.Content.Substring(0, [Math]::Min(150, $res.Content.Length))
        Write-Host "[OK $($res.StatusCode)] $path => $trunc"
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $errBody = ""
        try { $stream = $_.Exception.Response.GetResponseStream(); $reader = New-Object System.IO.StreamReader($stream); $errBody = $reader.ReadToEnd() } catch {}
        $trunc = $errBody.Substring(0, [Math]::Min(150, $errBody.Length))
        Write-Host "[ERR $status] $path => $trunc"
    }
}

Write-Host "=== ZABBIX USERS CRUD ==="
TestRoute "GET" "/zabbix/users"

Write-Host "`n=== ZABBIX USER GROUPS ==="
TestRoute "GET" "/zabbix/user-groups"

Write-Host "`n=== USER HOST GROUPS (empty) ==="
TestRoute "GET" "/zabbix/user-host-groups"

# Atribui um host group ao usuario admin
$adminUserId = $loginData.user.id
$tenantId = $loginData.tenants[0].tenant_id
Write-Host "`nAdmin user_id: $adminUserId"
Write-Host "Tenant: $tenantId"

$assignBody = "{`"user_id`":`"$adminUserId`",`"zabbix_host_group_id`":`"35`",`"zabbix_host_group_name`":`"JLTECNOLOGIA/NOC/SERVIDORES`"}"
Write-Host "`n=== ASSIGN USER TO HOST GROUP ==="
TestRoute "POST" "/zabbix/user-host-groups" $assignBody

Write-Host "`n=== GET USER HOST GROUPS (after assign) ==="
TestRoute "GET" "/zabbix/user-host-groups"

Write-Host "`n=== GET USER HOST GROUPS by user ==="
TestRoute "GET" "/zabbix/user-host-groups?user_id=$adminUserId"

Write-Host "`n=== GET USERS BY GROUP 35 ==="
TestRoute "GET" "/zabbix/user-host-groups/by-group/35"

Write-Host "`n=== Teste completo ==="
