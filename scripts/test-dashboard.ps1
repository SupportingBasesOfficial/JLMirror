$BASE = "http://localhost:3001"
$loginBody = "{`"email`":`"admin@jlmirror.com`",`"password`":`"Jlm@2026`"}"
$resp = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/api/v1/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody
$loginData = $resp.Content | ConvertFrom-Json
$token = $loginData.access_token

Write-Host "=== DASHBOARD ROUTES ===" -ForegroundColor "Cyan"

$endpoints = @(
    "/api/v1/dashboard",
    "/api/v1/dashboard/overview",
    "/api/v1/dashboard/navigation"
)

foreach ($ep in $endpoints) {
    $shortName = $ep -replace "/api/v1/dashboard", ""
    $url = "$BASE$ep"
    $authHeader = "Authorization: Bearer $token"
    $tmpFile = [System.IO.Path]::GetTempFileName()
    & curl.exe --noproxy localhost -s -o $tmpFile -w "HTTP_STATUS:%{http_code}" -H $authHeader $url 2>&1 | Tee-Object -Variable status | Out-Null
    $body = Get-Content $tmpFile -Raw
    Remove-Item $tmpFile -Force
    Write-Host "GET $shortName -> $status" -ForegroundColor "Cyan"
    $preview = $body.Substring(0, [Math]::Min(300, $body.Length))
    Write-Host "  $preview" -ForegroundColor "DarkGray"
    Write-Host ""
}
