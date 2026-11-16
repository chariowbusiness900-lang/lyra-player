# Signe une liste de fichiers avec le certificat Lyra (signtool + horodatage).
param(
    [Parameter(Mandatory = $true)][string[]]$Files
)

if (-not $env:SIGNTOOL) { throw "SIGNTOOL absent" }
if (-not $env:PFX_PASSWORD) { throw "PFX_PASSWORD absent" }
$pfx = Join-Path $PWD "lyra.pfx"
if (-not (Test-Path $pfx)) { throw "lyra.pfx introuvable" }

$signed = 0
$failed = 0
$skipped = 0
foreach ($f in $Files) {
    if (-not (Test-Path $f)) { Write-Host "Absent, ignore : $f"; continue }
    $existing = Get-AuthenticodeSignature $f
    if ($existing.SignerCertificate -and $existing.Status -ne "HashMismatch") {
        Write-Host "Deja signe, ignore : $f"
        $skipped++
        continue
    }
    $ok = $false
    foreach ($ts in @("http://timestamp.digicert.com", "http://timestamp.sectigo.com", "")) {
        $signArgs = @("sign", "/f", $pfx, "/p", $env:PFX_PASSWORD, "/fd", "SHA256")
        if ($ts -ne "") { $signArgs += @("/td", "SHA256", "/tr", $ts) }
        $signArgs += $f
        & $env:SIGNTOOL @signArgs
        if ($LASTEXITCODE -eq 0) { $ok = $true; Write-Host "Signe : $f (horodatage : $ts)"; break }
        Write-Host "Echec de signature [$ts] (code $LASTEXITCODE), nouvel essai."
    }
    if ($ok) {
        $signed++
        $sig = Get-AuthenticodeSignature -FilePath $f
        $who = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "aucun" }
        Write-Host ("Signature : {0} / {1}" -f $sig.Status, $who)
    } else {
        $failed++
        Write-Host "::error::Signature impossible pour $f"
    }
}
Write-Host ("Fichiers signes : {0} / deja signes : {1} / echecs : {2}" -f $signed, $skipped, $failed)
if ($failed -gt 0) { exit 1 }
