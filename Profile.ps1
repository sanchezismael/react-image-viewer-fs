# PowerShell Profile - Auto-setup Node.js PATH
# Este script se ejecuta automáticamente al abrir cualquier nueva terminal PowerShell

# Buscar Node.js y agregarlo al PATH si existe
$nodePaths = @(
    "C:\Program Files\nodejs",
    "C:\Program Files (x86)\nodejs",
    "$env:LOCALAPPDATA\Programs\nodejs"
)

$nodeInPath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeInPath) {
    foreach ($path in $nodePaths) {
        if (Test-Path (Join-Path $path 'node.exe')) {
            $env:Path = "$path;$env:Path"
            break
        }
    }
}

# Opcional: Mensaje de bienvenida (puedes comentar esta línea si no lo quieres)
# Write-Host "✓ Node.js ready" -ForegroundColor Green
