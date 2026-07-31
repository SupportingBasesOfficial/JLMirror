# Extrai versao do Zabbix do HTML e testa mais URLs
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "https://zabbix.jlinformatica.com.br/" -Method Get -TimeoutSec 15
    $content = $res.Content
    
    # Procura por versao
    if ($content -match "Zabbix (\d+\.\d+\.\d+)") {
        Write-Host "Versao Zabbix: $($Matches[1])"
    }
    if ($content -match "version.*?(\d+\.\d+\.\d+)") {
        Write-Host "Version match: $($Matches[1])"
    }
    
    # Procura por links de API
    $apiLinks = [regex]::Matches($content, 'href="([^"]*api[^"]*)"')
    foreach ($match in $apiLinks) {
        Write-Host "API link encontrado: $($match.Groups[1].Value)"
    }
    
    # Procura por zabbix.php references
    $phpLinks = [regex]::Matches($content, '(zabbix\.php[^"\s]*)')
    foreach ($match in $phpLinks) {
        Write-Host "PHP link: $($match.Groups[1].Value)"
    }
    
    # Mostra title
    if ($content -match "<title>(.*?)</title>") {
        Write-Host "Title: $($Matches[1])"
    }
    
    # Mostra primeiros 2000 chars
    Write-Host ""
    Write-Host "=== Primeiros 2000 chars ==="
    if ($content.Length -gt 2000) { $content = $content.Substring(0, 2000) }
    Write-Host $content
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
