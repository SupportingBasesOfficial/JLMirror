# Atualiza todas as paginas que usam useApi para incluir progress no destructuring
# e passar progress={progress} para LoadingState

$webDir = "apps\web\app"

# Encontra todos os .tsx que usam useApi
$files = Get-ChildItem -Path $webDir -Recurse -Filter "*.tsx" | Select-String -Pattern "useApi" | Select-Object -ExpandProperty Path -Unique

$changed = 0
foreach ($file in $files) {
    $content = Get-Content $file -Raw
    $original = $content

    # 1. Adiciona progress ao destructuring do useApi
    # Padrao: const { data, error, isLoading, mutate } = useApi
    # Variacoes: data pode ter outros nomes como mData, thData, etc
    $content = [regex]::Replace(
        $content,
        'const\s*\{\s*([^}]+)\s*isLoading\s*,\s*mutate\s*\}\s*=\s*useApi',
        'const { $1isLoading, progress, mutate } = useApi'
    )

    # 2. Adiciona progress={progress} ao LoadingState (apenas se ainda nao tem)
    $content = [regex]::Replace(
        $content,
        '<LoadingState\s+label="([^"]+)"\s*/>',
        '<LoadingState label="$1" progress={progress} />'
    )

    # Tambem trata LoadingState sem self-closing
    $content = [regex]::Replace(
        $content,
        '<LoadingState\s+label="([^"]+)"\s*>',
        '<LoadingState label="$1" progress={progress}>'
    )

    if ($content -ne $original) {
        Set-Content $file -Value $content -NoNewline
        $changed++
        Write-Host "Updated: $file"
    }
}

Write-Host "`nTotal: $changed files updated"
