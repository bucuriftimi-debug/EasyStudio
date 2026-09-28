# A picture for the Store screenshots of EasyStudio Video: a sunset over mountains and a lake,
# drawn here (only .NET System.Drawing), so the screenshots show nothing made by others.
# Output: .cache\shots-media\sunset.png (1920 x 1080).
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root '.cache\shots-media'
New-Item -ItemType Directory -Force $out | Out-Null
$W = 1920; $H = 1080; $horizon = 700
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
function C([int]$a, [int]$r, [int]$gg, [int]$b) { [System.Drawing.Color]::FromArgb($a, $r, $gg, $b) }

# Sky: deep violet at the top, pink, then warm orange at the horizon.
$sky = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 0, $horizon), (C 255 36 18 84), (C 255 255 170 90)
$blend = New-Object System.Drawing.Drawing2D.ColorBlend 4
$blend.Colors = @((C 255 30 16 76), (C 255 120 40 140), (C 255 240 96 120), (C 255 255 184 100))
$blend.Positions = @(0.0, 0.45, 0.78, 1.0)
$sky.InterpolationColors = $blend
$g.FillRectangle($sky, 0, 0, $W, $horizon)

# Sun with a soft glow.
$sx = 1180; $sy = 560
foreach ($i in 8..1) {
  $r = 90 + $i * 38
  $glow = New-Object System.Drawing.SolidBrush (C ([int](10 + (8 - $i) * 3)) 255 220 150)
  $g.FillEllipse($glow, $sx - $r, $sy - $r, 2 * $r, 2 * $r)
}
$g.FillEllipse((New-Object System.Drawing.SolidBrush (C 255 255 236 190)), $sx - 95, $sy - 95, 190, 190)

# A few stars in the dark part of the sky.
$rnd = New-Object System.Random 7
foreach ($i in 1..70) {
  $x = $rnd.Next(0, $W); $y = $rnd.Next(0, 260); $s = $rnd.Next(2, 5)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (C ($rnd.Next(90, 200)) 255 255 255)), $x, $y, $s, $s)
}

# Mountains: three ridges, the far ones lighter.
function Ridge([int]$base, [int[]]$peaks, $color) {
  $pts = New-Object System.Collections.Generic.List[System.Drawing.Point]
  $pts.Add((New-Object System.Drawing.Point 0, $horizon))
  $step = $W / ($peaks.Count - 1)
  for ($i = 0; $i -lt $peaks.Count; $i++) { $pts.Add((New-Object System.Drawing.Point ([int]($i * $step)), ($base - $peaks[$i]))) }
  $pts.Add((New-Object System.Drawing.Point $W, $horizon))
  $g.FillPolygon((New-Object System.Drawing.SolidBrush $color), $pts.ToArray())
}
Ridge $horizon @(120, 210, 150, 260, 190, 300, 170, 230, 140, 200, 110) (C 255 150 70 130)
Ridge $horizon @(60, 140, 90, 190, 120, 80, 210, 130, 170, 90, 150) (C 255 92 40 104)
Ridge $horizon @(20, 70, 40, 110, 60, 30, 90, 50, 120, 60, 30) (C 255 52 24 72)

# Lake: the sky mirrored and darker, with light streaks under the sun.
$lake = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, $horizon), (New-Object System.Drawing.Point 0, $H), (C 255 150 70 120), (C 255 24 12 52)
$g.FillRectangle($lake, 0, $horizon, $W, $H - $horizon)
foreach ($i in 0..13) {
  $y = $horizon + 14 + $i * 26
  $w = 260 - $i * 14
  $g.FillRectangle((New-Object System.Drawing.SolidBrush (C ([int](150 - $i * 9)) 255 214 150)), $sx - $w / 2 + $rnd.Next(-30, 30), $y, $w, 5)
}

$bmp.Save((Join-Path $out 'sunset.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Join-Path $out 'sunset.png'
