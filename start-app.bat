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

setlocal enabledelayedexpansion

REM Ensure Node.js exists in PATH (try default install locations)
where node >nul 2>&1
if errorlevel 1 (
       for %%P in ("C:\Program Files\nodejs", "C:\Program Files (x86)\nodejs", "%LOCALAPPDATA%\Programs\nodejs") do (
               if exist %%~P\node.exe (
                       set "PATH=%%~P;!PATH!"
                       goto FOUND_NODE
               )
       )
       echo [ERROR] Node.js no se encuentra en el PATH.
       echo.
       echo Opciones para solucionar:
       echo   1. Instala Node.js LTS:
       echo      winget install OpenJS.NodeJS.LTS
       echo.
       echo   2. O ejecuta como ADMINISTRADOR:
       echo      setup-node-path.ps1
       echo.
       echo   3. Luego cierra TODAS las terminales y abre una nueva
       echo.
       endlocal
       pause
       exit /b 1
)
:FOUND_NODEwhere node >nul 2>&1
if errorlevel 1 (
	echo [ERROR] Node.js sigue sin estar disponible. Reabre la terminal o instala Node 18+.
	endlocal
	pause
	exit /b 1
)

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul

if not exist node_modules (
	echo Instalando dependencias (npm install)...
	call npm install
	if errorlevel 1 (
		echo [ERROR] npm install fall??. Revisa el mensaje anterior.
		popd >nul
		endlocal
		pause
		exit /b 1
	)
)

echo Iniciando backend y frontend (npm run dev)...
call npm run dev

popd >nul
endlocal
