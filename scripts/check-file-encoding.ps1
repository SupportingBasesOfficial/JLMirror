$bytes = [System.IO.File]::ReadAllBytes("migrations\20260730210000_module_feature_flags.sql")
$hex = ($bytes[0..99] | ForEach-Object { '{0:X2}' -f $_ }) -join ' '
Write-Host $hex
# Procura por c3a7 (ç em UTF-8) ou e7 (ç em Latin-1)
$text = [System.IO.File]::ReadAllText("migrations\20260730210000_module_feature_flags.sql", [System.Text.Encoding]::UTF8)
$idx = $text.IndexOf("Autentica")
if ($idx -ge 0) {
    Write-Host "`nTexto na posicao $idx :"
    Write-Host $text.Substring($idx, 20)
}
