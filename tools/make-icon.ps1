# Genereaza iconita aplicatiei (PNG 512x512) fara programe externe - doar .NET (System.Drawing).
# -Kind video: buton de play in loc de obiectiv (EasyStudio Video).
param([string]$Out = "$PSScriptRoot\..\apps\photo\build\icon.png", [string]$Kind = "photo")
Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

# Patrat cu colturi rotunjite
$r = 112
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $r, $r, 180, 90)
$path.AddArc($size - $r, 0, $r, $r, 270, 90)
$path.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
$path.AddArc(0, $size - $r, $r, $r, 90, 90)
$path.CloseFigure()

$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point $size, $size), ([System.Drawing.Color]::FromArgb(255, 123, 107, 255)), ([System.Drawing.Color]::FromArgb(255, 255, 184, 107))
$blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
$blend.Colors = @([System.Drawing.Color]::FromArgb(255, 107, 212, 255), [System.Drawing.Color]::FromArgb(255, 123, 107, 255), [System.Drawing.Color]::FromArgb(255, 255, 107, 181))
$blend.Positions = @(0.0, 0.5, 1.0)
$brush.InterpolationColors = $blend
$g.FillPath($brush, $path)

$dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 22, 23, 27))
if ($Kind -eq "video") {
  # Buton de play: cerc inchis cu triunghi alb
  $d = 230
  $g.FillEllipse($dark, ($size - $d) / 2, ($size - $d) / 2, $d, $d)
  $pts = [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF 222, 186), (New-Object System.Drawing.PointF 222, 326), (New-Object System.Drawing.PointF 336, 256))
  $g.FillPolygon([System.Drawing.Brushes]::White, $pts)
} else {
  # Cercul din mijloc (ca un obiectiv)
  $d = 190
  $g.FillEllipse($dark, ($size - $d) / 2, ($size - $d) / 2, $d, $d)
  $light = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 255, 255, 255))
  $g.FillEllipse($light, 290, 170, 44, 44)
}

$g.Dispose()
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "Icon: $Out"
