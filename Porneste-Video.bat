@echo off
rem Porneste EasyStudio Video (versiunea construita). Totul ramane pe E:.
cd /d "%~dp0"
set "electron_config_cache=%~dp0.cache\electron"
set "TEMP=%~dp0.cache\tmp"
set "TMP=%~dp0.cache\tmp"
if not exist "apps\video\out\main\index.js" (
  echo Construiesc aplicatia prima data...
  call npm run video:build
)
start "" "node_modules\electron\dist\electron.exe" "apps\video"
