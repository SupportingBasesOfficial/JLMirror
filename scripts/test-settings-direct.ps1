# Testa diretamente no backend com o token do cookie
$BASE = "http://localhost:3001/api/v1"

# Login direto no backend
$body = '{"email":"admin@jlmirror.com","password":"Jlm@2026"}'
$loginRes = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/auth/login" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 10
$loginData = $loginRes.Content | ConvertFrom-Json
$token = $loginData.access_token

Write-Host "Token obtido: $($token.Substring(0, 30))..."

# Testa /settings/modules diretamente no backend
Write-Host ""
Write-Host "Testando /settings/modules no backend..."
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/settings/modules" -Method Get -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 10
    Write-Host "Status: $($res.StatusCode)"
    Write-Host "Body: $($res.Content)"
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
