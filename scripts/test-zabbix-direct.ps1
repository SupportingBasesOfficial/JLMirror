# Testa diretamente a API do Zabbix
$zabbixUrl = "https://zabbix.jlinformatica.com.br/api_jsonrpc.php"

# 1. apiinfo.version (sem auth)
$body = '{"jsonrpc":"2.0","method":"apiinfo.version","params":{},"id":1}'
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri $zabbixUrl -Method Post -ContentType "application/json-rpc" -Body $body -TimeoutSec 15
    Write-Host "apiinfo.version: $($res.Content)"
} catch {
    Write-Host "apiinfo.version ERROR: $($_.Exception.Message)"
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "Body: $($reader.ReadToEnd())"
    } catch {}
}

Write-Host ""

# 2. user.login
$loginBody = '{"jsonrpc":"2.0","method":"user.login","params":{"username":"Admin","password":"zabbix"},"id":2}'
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri $zabbixUrl -Method Post -ContentType "application/json-rpc" -Body $loginBody -TimeoutSec 15
    Write-Host "user.login: $($res.Content)"
    $loginResult = $res.Content | ConvertFrom-Json
    if ($loginResult.result) {
        $token = $loginResult.result
        Write-Host "Token: $token"
        
        # 3. host.get com token
        $hostBody = '{"jsonrpc":"2.0","method":"host.get","params":{"output":["hostid","host","name","status"],"selectInterfaces":["ip","type","port","dns"],"selectHostGroups":["groupid","name"]},"auth":"' + $token + '","id":3}'
        try {
            $res2 = Invoke-WebRequest -UseBasicParsing -Uri $zabbixUrl -Method Post -ContentType "application/json-rpc" -Body $hostBody -TimeoutSec 15
            $content = $res2.Content
            if ($content.Length -gt 500) { $content = $content.Substring(0, 500) + "..." }
            Write-Host "host.get: $content"
        } catch {
            Write-Host "host.get ERROR: $($_.Exception.Message)"
        }
    }
} catch {
    Write-Host "user.login ERROR: $($_.Exception.Message)"
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "Body: $($reader.ReadToEnd())"
    } catch {}
}
