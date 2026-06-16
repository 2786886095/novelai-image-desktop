@echo off
setlocal
cd /d "%~dp0"

set "APP_EXE=%~dp0release\Langbai-NovelAI-Studio.exe"
set "LEGACY_EXE=%~dp0release\NovelAI-Image-Desktop.exe"

if exist "%APP_EXE%" goto run_app
if exist "%LEGACY_EXE%" (
  set "APP_EXE=%LEGACY_EXE%"
  goto run_app
)

echo Portable exe not found:
echo %APP_EXE%
echo.
echo Please run npm run pack first.
pause
exit /b 1

:run_app
start "" "%APP_EXE%"
exit /b 0
