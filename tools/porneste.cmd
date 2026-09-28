@echo off
rem Porneste EasyStudio Photo sau Video din codul sursa, pe orice PC cu Windows 10 / 11:
rem  - daca PC-ul nu are Node.js (sau are unul prea vechi), descarca o copie portabila in .cache\node
rem    (nu instaleaza nimic in Windows si nu cere drepturi de administrator);
rem  - prima data descarca bibliotecile (node_modules) si construieste aplicatia;
rem  - cache-urile si fisierele temporare raman in folderul proiectului.
rem Folosire: tools\porneste.cmd photo   sau   tools\porneste.cmd video
rem (fisierul trebuie sa aiba capete de linie Windows, CRLF: vezi .gitattributes)
setlocal
set "APP=%~1"
if "%APP%"=="" set "APP=photo"
cd /d "%~dp0.."
set "ROOT=%CD%"
set "NODE_VERSION=24.18.0"
set "npm_config_cache=%ROOT%\.cache\npm"
set "npm_config_update_notifier=false"
set "electron_config_cache=%ROOT%\.cache\electron"
set "ELECTRON_CACHE=%ROOT%\.cache\electron"
set "ELECTRON_BUILDER_CACHE=%ROOT%\.cache\electron-builder"
set "TEMP=%ROOT%\.cache\tmp"
set "TMP=%ROOT%\.cache\tmp"
if not exist "%TEMP%\" mkdir "%TEMP%"
set "ELECTRON=%ROOT%\node_modules\electron\dist\electron.exe"
title EasyStudio %APP%

if not exist "%ELECTRON%" goto install
if not exist "apps\%APP%\out\main\index.js" goto build
goto run

:install
call :node
if errorlevel 1 goto fail_node
rem node_modules\.easystudio-ok: bibliotecile s-au descarcat complet (o descarcare intrerupta se reia).
if exist "node_modules\.easystudio-ok" goto electron
echo.
echo Descarc bibliotecile aplicatiei. Se intampla doar prima data si poate dura 5-15 minute,
echo in functie de internet. Nu inchide fereastra.
echo.
call npm ci --no-audit --no-fund
if errorlevel 1 goto fail_install
echo ok> "node_modules\.easystudio-ok"

:electron
rem Electron nu se mai descarca singur la instalare (npm nou nu ruleaza scripturile de instalare),
rem asa ca il descarc aici, in cache-ul din folderul proiectului.
if exist "%ELECTRON%" goto build
echo.
echo Descarc Electron, motorul aplicatiei (cam 120 MB)...
node "node_modules\electron\install.js"
if errorlevel 1 goto fail_install
if not exist "%ELECTRON%" goto fail_install

:build
call :node
if errorlevel 1 goto fail_node
echo.
echo Construiesc EasyStudio %APP% (doar prima data, cam un minut)...
call npm run %APP%:build
if errorlevel 1 goto fail_build
if not exist "apps\%APP%\out\main\index.js" goto fail_build

:run
start "" "%ELECTRON%" "apps\%APP%"
exit /b 0

rem ---------------------------------------------------------------------------------------------
rem Pune in PATH un Node.js de cel putin versiunea 22: cel de pe PC, sau copia portabila din .cache\node.
:node
where node >nul 2>nul
if errorlevel 1 goto node_portable
where npm >nul 2>nul
if errorlevel 1 goto node_portable
node -e "process.exit(Number(process.versions.node.split('.')[0]) < 22 ? 1 : 0)"
if errorlevel 1 goto node_portable
exit /b 0

:node_portable
set "NODE_DIR=%ROOT%\.cache\node"
if exist "%NODE_DIR%\node.exe" goto node_path
set "NODE_ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "NODE_ARCH=arm64"
set "NODE_NAME=node-v%NODE_VERSION%-win-%NODE_ARCH%"
echo.
echo Node.js lipseste de pe acest PC (sau e prea vechi). Descarc o copie portabila, cam 35 MB,
echo in folderul proiectului (.cache\node). Nu se instaleaza nimic in Windows.
curl.exe -fL --retry 3 -o "%TEMP%\%NODE_NAME%.zip" "https://nodejs.org/dist/v%NODE_VERSION%/%NODE_NAME%.zip"
if errorlevel 1 exit /b 1
curl.exe -fsSL --retry 3 -o "%TEMP%\node-SHASUMS256.txt" "https://nodejs.org/dist/v%NODE_VERSION%/SHASUMS256.txt"
if errorlevel 1 exit /b 1
rem Verific ca fisierul descarcat este exact cel publicat de nodejs.org (SHA-256).
set "WANT="
set "GOT="
for /f "tokens=1" %%h in ('findstr /c:"%NODE_NAME%.zip" "%TEMP%\node-SHASUMS256.txt"') do set "WANT=%%h"
for /f "skip=1 tokens=*" %%h in ('certutil -hashfile "%TEMP%\%NODE_NAME%.zip" SHA256') do if not defined GOT set "GOT=%%h"
if defined GOT set "GOT=%GOT: =%"
if not defined WANT exit /b 1
if /i not "%GOT%"=="%WANT%" echo Fisierul descarcat nu se potriveste cu cel de pe nodejs.org.
if /i not "%GOT%"=="%WANT%" exit /b 1
if exist "%TEMP%\%NODE_NAME%\" rmdir /s /q "%TEMP%\%NODE_NAME%"
tar -xf "%TEMP%\%NODE_NAME%.zip" -C "%TEMP%"
if errorlevel 1 exit /b 1
move "%TEMP%\%NODE_NAME%" "%NODE_DIR%" >nul
if errorlevel 1 exit /b 1
del "%TEMP%\%NODE_NAME%.zip" "%TEMP%\node-SHASUMS256.txt" >nul 2>nul

:node_path
set "PATH=%NODE_DIR%;%PATH%"
exit /b 0

rem ---------------------------------------------------------------------------------------------
:fail_node
echo.
echo EROARE: nu am putut descarca Node.js de pe nodejs.org.
echo Verifica internetul (unele retele de scoala blocheaza descarcarile) si porneste din nou.
goto fail

:fail_install
echo.
echo EROARE: descarcarea bibliotecilor nu a reusit (vezi mesajele de mai sus).
echo Verifica internetul si spatiul liber pe disc (trebuie cam 2 GB), apoi porneste din nou.
goto fail

:fail_build
echo.
echo EROARE: construirea aplicatiei nu a reusit (vezi mesajele de mai sus).
goto fail

:fail
echo.
pause
exit /b 1
