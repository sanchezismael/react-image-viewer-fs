# Script para agregar Node.js al PATH del sistema de forma permanente
# Ejecutar con permisos de administrador: powershell -ExecutionPolicy Bypass -File setup-node-path.ps1

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   Configurando Node.js en el PATH del sistema" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Buscar Node.js en ubicaciones comunes
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
        Write-Host "[OK] Node.js encontrado en: $path" -ForegroundColor Green
        break
    }
}

if (-not $nodeFound) {
    Write-Host "[ERROR] No se encontro Node.js instalado." -ForegroundColor Red
    Write-Host ""
    Write-Host "Por favor, instala Node.js primero:" -ForegroundColor Yellow
    Write-Host "  winget install OpenJS.NodeJS.LTS" -ForegroundColor White
    Write-Host ""
    Write-Host "O descargalo desde: https://nodejs.org/" -ForegroundColor White
    Read-Host "Pulsa Enter para salir"
    exit 1
}

# Verificar si ya esta en el PATH del sistema
$currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($currentPath -like "*$nodeFound*") {
    Write-Host "[INFO] Node.js ya esta en el PATH del sistema" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Si aun no funciona 'npm' en nuevas terminales:" -ForegroundColor Yellow
    Write-Host "  1. Cierra TODAS las ventanas de PowerShell/CMD" -ForegroundColor White
    Write-Host "  2. Abre una nueva terminal" -ForegroundColor White
    Write-Host "  3. Ejecuta: node --version" -ForegroundColor White
} else {
    # Agregar al PATH del sistema (requiere admin)
    try {
        Write-Host "[...] Agregando Node.js al PATH del sistema..." -ForegroundColor Yellow
        
        $newPath = "$currentPath;$nodeFound"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "Machine")
        
        Write-Host "[OK] Node.js agregado al PATH del sistema correctamente" -ForegroundColor Green
        Write-Host ""
        Write-Host "IMPORTANTE:" -ForegroundColor Yellow
        Write-Host "  1. Cierra TODAS las ventanas de PowerShell/CMD abiertas" -ForegroundColor White
        Write-Host "  2. Abre una nueva terminal" -ForegroundColor White
        Write-Host "  3. Ejecuta: node --version" -ForegroundColor White
        Write-Host ""
        Write-Host "Esto aplica permanentemente para TODAS las nuevas terminales." -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] No se pudo modificar el PATH del sistema" -ForegroundColor Red
        Write-Host ""
        Write-Host "Necesitas ejecutar este script como ADMINISTRADOR:" -ForegroundColor Yellow
        Write-Host "  1. Click derecho en PowerShell -> Ejecutar como administrador" -ForegroundColor White
        Write-Host "  2. Ejecuta: cd '$PWD'" -ForegroundColor White
        Write-Host "  3. Ejecuta: .\setup-node-path.ps1" -ForegroundColor White
        Write-Host ""
        Write-Host "Error: $_" -ForegroundColor Red
    }
}

# Tambien agregarlo al PATH del usuario actual como respaldo
try {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notlike "*$nodeFound*") {
        Write-Host "[...] Agregando tambien al PATH del usuario..." -ForegroundColor Yellow
        $newUserPath = "$userPath;$nodeFound"
        [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
        Write-Host "[OK] Agregado al PATH del usuario" -ForegroundColor Green
    }
} catch {
    Write-Host "[WARN] No se pudo agregar al PATH del usuario (no critico)" -ForegroundColor Yellow
}

# Actualizar la sesion actual
$env:Path = "$env:Path;$nodeFound"

Write-Host ""
Write-Host "Verificando instalacion en la sesion actual..." -ForegroundColor Cyan
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Host "[OK] node $nodeVersion funciona en esta terminal" -ForegroundColor Green
}
if (Get-Command npm -ErrorAction SilentlyContinue) {
    $npmVersion = npm --version
    Write-Host "[OK] npm $npmVersion funciona en esta terminal" -ForegroundColor Green
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   Configuracion completada" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Read-Host "Pulsa Enter para cerrar"
