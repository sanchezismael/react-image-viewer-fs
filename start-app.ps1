# React Image Viewer Launcher
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   React Image Viewer - Starting Application" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend will run on: " -NoNewline
Write-Host "http://localhost:3001" -ForegroundColor Green
Write-Host "Frontend will run on: " -NoNewline
Write-Host "http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop the application" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Ensure Node.js is available in PATH
function Ensure-Node {
	if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
		$defaultPaths = @(
			"C:\\Program Files\\nodejs",
			"C:\\Program Files (x86)\\nodejs"
		)

		foreach ($path in $defaultPaths) {
			if (Test-Path (Join-Path $path 'node.exe')) {
				$env:Path = "$path;$env:Path"
				break
			}
		}
	}

	if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
		Write-Host "[ERROR] Node.js no está disponible en el PATH. Instala Node 18+ y vuelve a intentarlo." -ForegroundColor Red
		Read-Host "Pulsa Enter para salir"
		exit 1
	}
}

Ensure-Node

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Test-Path 'node_modules')) {
	Write-Host "Instalando dependencias (npm install)..." -ForegroundColor Yellow
	npm install
	if ($LASTEXITCODE -ne 0) {
		Write-Host "[ERROR] npm install falló. Revisa el mensaje anterior." -ForegroundColor Red
		Read-Host "Pulsa Enter para salir"
		exit 1
	}
}

Write-Host "Iniciando backend y frontend (npm run dev)..." -ForegroundColor Green
npm run dev
