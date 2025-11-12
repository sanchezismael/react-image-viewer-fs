@echo off
echo ================================================
echo   React Image Viewer - Starting Application
echo ================================================
echo.
echo Backend will run on: http://localhost:3001
echo Frontend will run on: http://localhost:3000
echo.
echo Press Ctrl+C to stop the application
echo ================================================
echo.

REM Get current directory and convert to WSL path
set "CURRENT_DIR=%~dp0"
set "CURRENT_DIR=%CURRENT_DIR:\=/%"
set "CURRENT_DIR=%CURRENT_DIR:C:/=/mnt/c/%"
set "CURRENT_DIR=%CURRENT_DIR:::=%"

REM Remove trailing slash if present
if "%CURRENT_DIR:~-1%"=="/" set "CURRENT_DIR=%CURRENT_DIR:~0,-1%"

wsl bash -c "cd '%CURRENT_DIR%' && npm run dev"
