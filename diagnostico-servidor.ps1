# Script de diagnóstico del servidor
# Ejecutar: .\diagnostico-servidor.ps1
# Se pedirá la contraseña: tg4VBxwU7SCG

$ErrorActionPreference = "Continue"
$server = "217.216.87.255"
$user = "root"
$remotePath = "/root/Consulta-vehicular"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  DIAGNÓSTICO DEL SERVIDOR" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "NOTA: Se te pedirá la contraseña SSH" -ForegroundColor Yellow
Write-Host "Contraseña: tg4VBxwU7SCG`n" -ForegroundColor Yellow

# Función para ejecutar comandos SSH
function Invoke-SSH {
    param([string]$Command, [string]$Description)
    Write-Host "`n[$Description]" -ForegroundColor Green
    Write-Host "Comando: $Command" -ForegroundColor Gray
    ssh -o StrictHostKeyChecking=no "${user}@${server}" $Command
}

try {
    # 1. Verificar conexión
    Invoke-SSH "cd $remotePath && pwd" "1. Verificando conexión"
    
    # 2. Estado Docker
    Invoke-SSH "docker ps | grep consulta-vehicular" "2. Estado del contenedor Docker"
    
    # 3. Logs recientes
    Invoke-SSH "docker logs --tail 50 consulta-vehicular 2>&1" "3. Logs recientes (últimas 50 líneas)"
    
    # 4. Errores en logs
    Invoke-SSH "docker logs --tail 200 consulta-vehicular 2>&1 | grep -iE 'error|failed|exception|timeout' | tail -30" "4. Errores en logs (últimos 30)"
    
    # 5. Verificar .env
    Invoke-SSH "cd $remotePath && test -f .env && (echo 'Archivo .env existe:' && grep -E 'CAPTCHA_API_KEY|MERCADOPAGO' .env | head -3) || echo 'Archivo .env NO existe'" "5. Verificando archivo .env"
    
    # 6. Procesos Node
    Invoke-SSH "ps aux | grep -E 'node|puppeteer|chrome' | grep -v grep | head -5" "6. Procesos Node/Puppeteer"
    
    # 7. Archivos de debug SOAT
    Invoke-SSH "cd $remotePath && ls -lah apeseg-debug-*.png apeseg-debug-*.html 2>/dev/null | tail -5 || echo 'No hay archivos de debug'" "7. Archivos de debug SOAT"
    
    # 8. Espacio en disco
    Invoke-SSH "df -h | grep -E 'Filesystem|/dev/'" "8. Espacio en disco"
    
    # 9. Memoria
    Invoke-SSH "free -h" "9. Memoria disponible"
    
    # 10. Verificar detalles del contenedor
    Invoke-SSH "docker inspect consulta-vehicular 2>&1 | grep -E 'Status|State|StartedAt|Image' | head -10" "10. Estado detallado del contenedor"
    
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  DIAGNÓSTICO COMPLETADO" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan
    
} catch {
    Write-Host "`nError durante el diagnóstico: $_" -ForegroundColor Red
}

Write-Host "`nPara ver logs en tiempo real, ejecuta:" -ForegroundColor Yellow
Write-Host "ssh ${user}@${server} 'docker logs -f consulta-vehicular --tail 200'" -ForegroundColor White
