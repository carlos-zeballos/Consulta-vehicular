# Script para probar el sistema en el servidor
# Ejecutar: .\test-servidor.ps1

$server = "217.216.87.255"
$user = "root"
$password = "tg4VBxwU7SCG"
$remotePath = "/root/Consulta-vehicular"

Write-Host "=== Conectando al servidor $server ===" -ForegroundColor Cyan

# Función para ejecutar comandos SSH
function Invoke-SSHCommand {
    param(
        [string]$Command
    )
    
    $fullCommand = "ssh -o StrictHostKeyChecking=no ${user}@${server} `"$Command`""
    Write-Host "Ejecutando: $Command" -ForegroundColor Yellow
    Invoke-Expression $fullCommand
}

# Verificar conexión
Write-Host "`n1. Verificando conexión..." -ForegroundColor Green
Invoke-SSHCommand "cd $remotePath && pwd"

# Verificar estado del servicio
Write-Host "`n2. Verificando estado del servicio..." -ForegroundColor Green
Invoke-SSHCommand "cd $remotePath && pm2 list"

# Ver logs recientes
Write-Host "`n3. Verificando logs recientes (últimas 50 líneas)..." -ForegroundColor Green
Invoke-SSHCommand "cd $remotePath && pm2 logs consulta-vehicular --lines 50 --nostream"

# Verificar archivos modificados
Write-Host "`n4. Verificando archivos del proyecto..." -ForegroundColor Green
Invoke-SSHCommand "cd $remotePath && ls -la *.js *.json | head -10"

# Verificar variables de entorno
Write-Host "`n5. Verificando configuración..." -ForegroundColor Green
Invoke-SSHCommand "cd $remotePath && test -f .env && echo 'Archivo .env existe' || echo 'Archivo .env NO existe'"

# Verificar procesos de Node
Write-Host "`n6. Verificando procesos Node..." -ForegroundColor Green
Invoke-SSHCommand "ps aux | grep node | grep -v grep | head -5"

Write-Host "`n=== Prueba completada ===" -ForegroundColor Cyan
