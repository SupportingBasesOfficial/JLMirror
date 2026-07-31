# Remove progress={progress} de LoadingState em arquivos onde progress nao esta no escopo do useApi

$webDir = "C:\Projects\JLMIRROR\apps\web\app"

$files = Get-ChildItem -Path $webDir -Recurse -Filter "*.tsx"

$changed = 0
foreach ($file in $files) {
    $filePath = $file.FullName
    $content = [System.IO.File]::ReadAllText($filePath)
    if ($content -notmatch 'progress') { continue }

    # Verifica se o arquivo tem "progress" no destructuring do useApi (nao no JSX)
    $hasProgressVar = $content -match '=\s*useApi.*\{[^}]*\bprogress\b[^}]*\}' -or $content -match '\bprogress\b\s*[,}].*useApi'

    if (-not $hasProgressVar) {
        $newContent = $content -replace ' progress=\{progress\}', ''
        if ($newContent -ne $content) {
            [System.IO.File]::WriteAllText($filePath, $newContent)
            $changed++
            Write-Host "Fixed: $filePath"
        }
    }
}

Write-Host "`nTotal: $changed files fixed"
