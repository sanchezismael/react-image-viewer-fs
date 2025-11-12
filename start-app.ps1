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

# Get current script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Convert Windows path to WSL path
$wslPath = $scriptDir -replace '\\', '/' -replace '^([A-Z]):', '/mnt/$1' -replace ':', ''
$wslPath = $wslPath.ToLower()

# Launch application
wsl bash -c "cd '$wslPath' && npm run dev"
