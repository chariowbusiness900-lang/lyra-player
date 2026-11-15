# Génère les icônes de Lyra (PNG + ICO multi-tailles) — style Fluent, coins arrondis.
# Utilisé localement et par GitHub Actions avant chaque build.
#Requires -Version 5.1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot            # lyra/
$iconsDir = Join-Path $root "src-tauri\icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

function New-BaseBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Fond : dégradé sombre neutre (carte "Fluent")
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 0x2A, 0x2E, 0x38),
        [System.Drawing.Color]::FromArgb(255, 0x18, 0x1A, 0x21),
        55.0)

    # Rectangle arrondi (rayon ~ Win11 : 12,5 %)
    $radius = [int]($size * 0.225)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($brush, $path)

    # Note de musique blanche centrée
    $fontSize = [float]($size * 0.62)
    $font = New-Object System.Drawing.Font("Segoe UI Symbol", $fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $white = [System.Drawing.Brushes]::White
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF(0, ($size * 0.02), $size, $size)
    $g.DrawString([char]0x266A, $font, $white, $textRect, $sf)

    $g.Dispose()
    return $bmp
}

# Génère les PNG aux tailles requises
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngPaths = @()
foreach ($s in $sizes) {
    $base = New-BaseBitmap 256
    $scaled = New-Object System.Drawing.Bitmap($s, $s)
    $g = [System.Drawing.Graphics]::FromImage($scaled)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($base, 0, 0, $s, $s)
    $g.Dispose()
    $p = Join-Path $iconsDir ("icon-{0}.png" -f $s)
    $scaled.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
    $scaled.Dispose(); $base.Dispose()
    $pngPaths += $p
}

# Assemble le .ico (entrées PNG, supportées depuis Windows Vista)
$icoPath = Join-Path $iconsDir "icon.ico"
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([uint16]0)   # réservé
$bw.Write([uint16]1)   # type = ICO
$bw.Write([uint16]$sizes.Count)

$offset = 6 + (16 * $sizes.Count)
foreach ($s in $sizes) {
    $bytes = [System.IO.File]::ReadAllBytes($pngPaths[$sizes.IndexOf($s)])
    $w = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([byte]$w)      # largeur (0 = 256)
    $bw.Write([byte]$w)      # hauteur
    $bw.Write([byte]0)       # palette
    $bw.Write([byte]0)       # réservé
    $bw.Write([uint16]1)     # plans
    $bw.Write([uint16]32)    # bits/pixel
    $bw.Write([uint32]$bytes.Length)
    $bw.Write([uint32]$offset)
    $offset += $bytes.Length
}
foreach ($p in $pngPaths) {
    $bw.Write([System.IO.File]::ReadAllBytes($p))
}
$bw.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$bw.Dispose(); $ms.Dispose()

# Icône 256 px pour le bundle
Copy-Item (Join-Path $iconsDir "icon-256.png") (Join-Path $iconsDir "icon.png") -Force

Write-Host "Icônes générées dans $iconsDir"
