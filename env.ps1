# Rulează `. .\env.ps1` înainte de npm install / build.
# Mută pe E: tot ce npm, Electron și electron-builder ar scrie implicit pe C:.
$root = $PSScriptRoot
$env:npm_config_cache = "$root\.cache\npm"
$env:electron_config_cache = "$root\.cache\electron"
$env:ELECTRON_CACHE = "$root\.cache\electron"
$env:ELECTRON_BUILDER_CACHE = "$root\.cache\electron-builder"
$env:TEMP = "$root\.cache\tmp"
$env:TMP = "$root\.cache\tmp"
