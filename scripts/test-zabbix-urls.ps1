# Verifica diferentes URLs do Zabbix
$urls = @(
    "https://zabbix.jlinformatica.com.br/api_jsonrpc.php",
    "https://zabbix.jlinformatica.com.br/zabbix/api_jsonrpc.php",
    "https://zabbix.jlinformatica.com.br/",
    "https://zabbix.jlinformatica.com.br/zabbix.php"
)

$body = '{"jsonrpc":"2.0","method":"apiinfo.version","params":{},"id":1}'

foreach ($url in $urls) {
    Write-Host "Testando: $url"
    try {
        $res = Invoke-WebRequest -UseBasicParsing -Uri $url -Method Post -ContentType "application/json-rpc" -Body $body -TimeoutSec 15
        $content = $res.Content
        if ($content.Length -gt 300) { $content = $content.Substring(0, 300) + "..." }
        Write-Host "  Status: $($res.StatusCode)"
        Write-Host "  Body: $content"
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)"
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $body2 = $reader.ReadToEnd()
            if ($body2.Length -gt 300) { $body2 = $body2.Substring(0, 300) + "..." }
            Write-Host "  Body: $body2"
        } catch {}
    }
    Write-Host ""
}

# Tambem testa GET na raiz
Write-Host "Testando GET raiz..."
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "https://zabbix.jlinformatica.com.br/" -Method Get -TimeoutSec 15
    $content = $res.Content
    if ($content.Length -gt 500) { $content = $content.Substring(0, 500) + "..." }
    Write-Host "  Status: $($res.StatusCode)"
    Write-Host "  Body: $content"
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)"
}
