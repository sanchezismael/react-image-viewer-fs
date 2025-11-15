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
	$nodePaths = @(
		"C:\Program Files\nodejs",
		"C:\Program Files (x86)\nodejs",
		"$env:LOCALAPPDATA\Programs\nodejs",
		"$env:ProgramFiles\nodejs"
	)

	$nodeFound = $null
	foreach ($path in $nodePaths) {
		if (Test-Path (Join-Path $path 'node.exe')) {
			$nodeFound = $path
			$env:Path = "$path;$env:Path"
			break
		}
	}

	if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
		Write-Host ""
		Write-Host "[ERROR] Node.js no esta disponible." -ForegroundColor Red
		Write-Host ""
		Write-Host "Opciones para solucionar:" -ForegroundColor Yellow
		Write-Host "  1. Instala Node.js LTS:" -ForegroundColor White
		Write-Host "     winget install OpenJS.NodeJS.LTS" -ForegroundColor Cyan
		Write-Host ""
		Write-Host "  2. O ejecuta (como ADMINISTRADOR):" -ForegroundColor White
		Write-Host "     .\setup-node-path.ps1" -ForegroundColor Cyan
		Write-Host ""
		Write-Host "  3. Luego cierra TODAS las terminales y abre una nueva" -ForegroundColor White
		Write-Host ""
		Read-Host "Pulsa Enter para salir"
		exit 1
	}

	Write-Host "[OK] Node.js detectado: $(node --version)" -ForegroundColor Green
	Write-Host "[OK] npm detectado: $(npm --version)" -ForegroundColor Green
	Write-Host ""
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
