@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo   EchoLab - shadowing practice
echo   ------------------------------------------
echo   Local server: http://127.0.0.1:8777
echo   Press Ctrl+C to stop.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port 8777
if errorlevel 1 (
  echo.
  echo   [EchoLab] Failed to start. Try: python -m http.server 8777
  pause
)
