# Script para revisar el servidor - Ejecutar manualmente e ingresar contraseña cuando se pida
# Contraseña: tg4VBxwU7SCG

$server = "217.216.87.255"
$user = "root"
$remotePath = "/root/Consulta-vehicular"

Write-Host "=== Revisando servidor $server ===" -ForegroundColor Cyan
Write-Host "NOTA: Se te pedirá la contraseña: tg4VBxwU7SCG" -ForegroundColor Yellow
Write-Host ""

# 1. Verificar conexión y directorio
Write-Host "1. Verificando conexión..." -ForegroundColor Green
ssh -o StrictHostKeyChecking=no ${user}@${server} "cd $remotePath && pwd && echo '---' && ls -la | head -10"

Write-Host "`n2. Verificando estado Docker..." -ForegroundColor Green
ssh -o StrictHostKeyChecking=no ${user}@${server} "docker ps | grep consulta-vehicular"

Write-Host "`n3. Verificando logs recientes (últimas 100 líneas)..." -ForegroundColor Green
ssh -o StrictHostKeyChecking=no ${user}@${server} "docker logs --tail 100 consulta-vehicular 2>&1"

Write-Host "`n4. Verificando errores en logs..." -ForegroundColor Green
ssh -o StrictHostKeyChecking=no ${user}@${server} "docker logs --tail 200 consulta-vehicular 2>&1 | grep -i 'error\|failed\|exception' | tail -20"

Write-Host "`n5. Verificando archivos .env..." -ForegroundColor Green
ssh -o StrictHostKeyChecking=no ${user}@${server} "cd $remotePath && test -f .env && echo 'Archivo .env existe' && grep -E 'CAPTCHA_API_KEY|MERCADOPAGO' .env | head -5 || echo 'Archivo .env NO existe'"

Write-Host "`n6. Verificando procesos Node..." -ForegroundColor Green
ssh -o StrictHostKeyChecking=no ${user}@${server} "ps aux | grep -E 'node|puppeteer|chrome' | grep -v grep | head -10"

Write-Host "`n=== Revisión completada ===" -ForegroundColor Cyan
