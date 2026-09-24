# Microsoft Store logos for both apps, made from the app icons (only .NET System.Drawing):
# 1:1 box art 1080x1080, 9:16 poster art 720x1080 and the 300x300 tile icon.
# Output: .cache\store-logos\
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root '.cache\store-logos'
New-Item -ItemType Directory -Force $out | Out-Null

function New-Logo([string]$iconPath, [string]$name, [int]$w, [int]$h, [int]$iconSize, [bool]$withText, [string]$file) {
  $icon = [System.Drawing.Image]::FromFile($iconPath)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  # Dark background with a soft purple glow, like the apps.
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point $w, $h), ([System.Drawing.Color]::FromArgb(255, 22, 20, 40)), ([System.Drawing.Color]::FromArgb(255, 14, 15, 18))
  $g.FillRectangle($bg, 0, 0, $w, $h)
  $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $gs = [int]($iconSize * 1.9)
  $cy = if ($withText) { [int]($h * 0.42) } else { [int]($h / 2) }
  $glow.AddEllipse([int]($w / 2 - $gs / 2), [int]($cy - $gs / 2), $gs, $gs)
  $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow
  $pg.CenterColor = [System.Drawing.Color]::FromArgb(110, 123, 107, 255)
  $pg.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 123, 107, 255))
  $g.FillPath($pg, $glow)
  $g.DrawImage($icon, [int]($w / 2 - $iconSize / 2), [int]($cy - $iconSize / 2), $iconSize, $iconSize)
  if ($withText) {
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = 'Center'
    $font = New-Object System.Drawing.Font 'Segoe UI Semibold', ([float]($w * 0.075)), ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $rect = New-Object System.Drawing.RectangleF 0, ([float]($cy + $iconSize / 2 + $h * 0.06)), $w, ([float]($h * 0.2))
    $g.DrawString($name, $font, [System.Drawing.Brushes]::White, $rect, $fmt)
  }
  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $icon.Dispose()
}

foreach ($app in @('photo', 'video')) {
  $icon = Join-Path $root "apps\$app\build\icon.png"
  $name = if ($app -eq 'photo') { 'EasyStudio Photo' } else { 'EasyStudio Video' }
  New-Logo $icon $name 1080 1080 520 $true "$app-box-1080.png"
  New-Logo $icon $name 720 1080 400 $true "$app-poster-720x1080.png"
  New-Logo $icon $name 300 300 220 $false "$app-tile-300.png"
}
Get-ChildItem $out | Select-Object Name, Length
