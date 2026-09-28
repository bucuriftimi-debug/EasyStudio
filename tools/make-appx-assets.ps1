# Tile and taskbar images of the Microsoft Store package (MSIX / AppX), made from the app icons
# (only .NET System.Drawing). Without them electron-builder puts the default Electron logo on the
# tiles, which the Store refuses (policy 10.1.1.11). Output: apps\<app>\build\appx\ (electron-builder
# picks the folder up by itself; makepri chooses the right size for each screen scale).
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent

function Save-Asset($icon, [string]$file, [int]$w, [int]$h, [double]$iconShare) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.CompositingQuality = 'HighQuality'
  $s = [int][Math]::Round([Math]::Min($w, $h) * $iconShare)
  $attr = New-Object System.Drawing.Imaging.ImageAttributes
  $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
  $dest = New-Object System.Drawing.Rectangle ([int](($w - $s) / 2)), ([int](($h - $s) / 2)), $s, $s
  $g.DrawImage($icon, $dest, 0, 0, $icon.Width, $icon.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

$scales = @(100, 125, 150, 200, 400)
foreach ($app in @('photo', 'video')) {
  $out = Join-Path $root "apps\$app\build\appx"
  if (Test-Path $out) { Remove-Item (Join-Path $out '*.png') }
  New-Item -ItemType Directory -Force $out | Out-Null
  $icon = [System.Drawing.Image]::FromFile((Join-Path $root "apps\$app\build\icon.png"))
  foreach ($sc in $scales) {
    $k = $sc / 100
    $px = { param($n) [int][Math]::Round($n * $k) }
    Save-Asset $icon (Join-Path $out "StoreLogo.scale-$sc.png") (& $px 50) (& $px 50) 1.0
    Save-Asset $icon (Join-Path $out "Square44x44Logo.scale-$sc.png") (& $px 44) (& $px 44) 0.875
    Save-Asset $icon (Join-Path $out "SmallTile.scale-$sc.png") (& $px 71) (& $px 71) 0.6
    Save-Asset $icon (Join-Path $out "Square150x150Logo.scale-$sc.png") (& $px 150) (& $px 150) 0.6
    Save-Asset $icon (Join-Path $out "Wide310x150Logo.scale-$sc.png") (& $px 310) (& $px 150) 0.6
    Save-Asset $icon (Join-Path $out "LargeTile.scale-$sc.png") (& $px 310) (& $px 310) 0.5
  }
  # Taskbar, Start list, title bar and File Explorer use these exact sizes, without a plate.
  foreach ($t in @(16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256)) {
    Save-Asset $icon (Join-Path $out "Square44x44Logo.targetsize-$t.png") $t $t 0.875
    Save-Asset $icon (Join-Path $out "Square44x44Logo.targetsize-${t}_altform-unplated.png") $t $t 0.875
    Save-Asset $icon (Join-Path $out "Square44x44Logo.targetsize-${t}_altform-lightunplated.png") $t $t 0.875
  }
  $icon.Dispose()
  "$app : $((Get-ChildItem $out).Count) files"
}
