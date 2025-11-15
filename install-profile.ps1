# Script para instalar el profile de PowerShell automáticamente
# Ejecutar: .\install-profile.ps1

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   Instalando PowerShell Profile" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$profilePath = $PROFILE
$profileDir = Split-Path -Parent $profilePath

Write-Host "[INFO] Ubicacion del profile: $profilePath" -ForegroundColor Yellow

# Crear directorio si no existe
if (-not (Test-Path $profileDir)) {
    Write-Host "[...] Creando directorio del profile..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

# Leer el contenido del Profile.ps1 del proyecto
$sourceProfile = Join-Path $PSScriptRoot "Profile.ps1"
if (-not (Test-Path $sourceProfile)) {
    Write-Host "[ERROR] No se encuentra Profile.ps1 en el proyecto" -ForegroundColor Red
    Read-Host "Pulsa Enter para salir"
    exit 1
}

$profileContent = Get-Content $sourceProfile -Raw

# Verificar si ya está instalado
if (Test-Path $profilePath) {
    $existingContent = Get-Content $profilePath -Raw -ErrorAction SilentlyContinue
    if ($existingContent -like "*Auto-setup Node.js PATH*") {
        Write-Host "[INFO] El profile ya contiene la configuracion de Node.js" -ForegroundColor Yellow
        Write-Host ""
        $overwrite = Read-Host "¿Deseas reinstalarlo de todos modos? (s/n)"
        if ($overwrite -ne 's' -and $overwrite -ne 'S') {
            Write-Host "[OK] No se realizaron cambios" -ForegroundColor Green
            Read-Host "Pulsa Enter para salir"
            exit 0
        }
    }
}

# Escribir el profile
try {
    # Backup del profile existente
    if (Test-Path $profilePath) {
        $backupPath = "$profilePath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Write-Host "[...] Creando backup: $backupPath" -ForegroundColor Yellow
        Copy-Item $profilePath $backupPath
    }

    # Instalar nuevo profile
    Write-Host "[...] Instalando nuevo profile..." -ForegroundColor Yellow
    
    if (Test-Path $profilePath) {
        # Agregar al final si ya existe
        "`n# --- Node.js Auto-setup (from react-image-viewer) ---`n" | Add-Content $profilePath
        $profileContent | Add-Content $profilePath
    } else {
        # Crear nuevo
        $profileContent | Set-Content $profilePath
    }

    Write-Host "[OK] Profile instalado correctamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "IMPORTANTE:" -ForegroundColor Yellow
    Write-Host "  1. Cierra esta terminal" -ForegroundColor White
    Write-Host "  2. Abre una NUEVA terminal PowerShell" -ForegroundColor White
    Write-Host "  3. Ejecuta: node --version" -ForegroundColor White
    Write-Host ""
    Write-Host "A partir de ahora, Node.js estara disponible automaticamente" -ForegroundColor Green
    Write-Host "en cada nueva terminal que abras." -ForegroundColor Green

} catch {
    Write-Host "[ERROR] No se pudo instalar el profile" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Intenta ejecutar este script como administrador:" -ForegroundColor Yellow
    Write-Host "  1. Click derecho en PowerShell -> Ejecutar como administrador" -ForegroundColor White
    Write-Host "  2. Ejecuta: cd '$PWD'" -ForegroundColor White
    Write-Host "  3. Ejecuta: .\install-profile.ps1" -ForegroundColor White
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Read-Host "Pulsa Enter para cerrar"
