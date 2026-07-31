# Testa login e verifica se cookies estao sendo setados
$BASE = "http://localhost:3000"

$body = '{"email":"admin@jlmirror.com","password":"Jlm@2026"}'

# Usa session para manter cookies
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$res = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/auth/login" -Method Post -ContentType "application/json" -Body $body -WebSession $session -TimeoutSec 10

Write-Host "Login status: $($res.StatusCode)"
Write-Host "Login body: $($res.Content.Substring(0, [Math]::Min(200, $res.Content.Length)))"
Write-Host ""
Write-Host "Cookies:"
foreach ($cookie in $session.Cookies.GetCookies($BASE)) {
    Write-Host "  $($cookie.Name): $($cookie.Value.Substring(0, [Math]::Min(30, $cookie.Value.Length)))..."
}

# Testa /api/v1/settings/modules com os cookies da sessao
Write-Host ""
Write-Host "Testando /api/v1/settings/modules..."
try {
    $res2 = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/settings/modules" -Method Get -WebSession $session -TimeoutSec 10
    Write-Host "Status: $($res2.StatusCode)"
    Write-Host "Body: $($res2.Content)"
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
