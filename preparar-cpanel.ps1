# Script de preparación para cPanel
# Ejecutar: .\preparar-cpanel.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PREPARANDO PROYECTO PARA cPanel" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Crear carpeta de salida
$carpetaSalida = "proyecto-cpanel"
if (Test-Path $carpetaSalida) {
    Write-Host "Eliminando carpeta anterior..." -ForegroundColor Yellow
    Remove-Item -Path $carpetaSalida -Recurse -Force
}

Write-Host "Creando carpeta: $carpetaSalida" -ForegroundColor Green
New-Item -ItemType Directory -Path $carpetaSalida | Out-Null

# Archivos y carpetas a EXCLUIR
$excluir = @(
    "node_modules",
    ".git",
    ".env",
    ".env.local",
    "*.log",
    "test-*.js",
    "*-test.js",
    "*.test.js",
    "sbs-debug-*.html",
    "sbs-debug-*.png",
    "test-sbs-resultado.json",
    "*.tmp",
    ".DS_Store",
    "Thumbs.db",
    ".vscode",
    ".idea",
    "*.swp",
    "dist",
    "build",
    "proyecto-cpanel",
    "preparar-cpanel.ps1"
)

Write-Host "Copiando archivos..." -ForegroundColor Green

# Obtener todos los archivos y carpetas
$archivos = Get-ChildItem -Path . -Recurse -Force

$contador = 0
foreach ($archivo in $archivos) {
    $rutaRelativa = $archivo.FullName.Replace((Get-Location).Path + "\", "")
    $rutaDestino = Join-Path $carpetaSalida $rutaRelativa
    
    # Verificar si debe excluirse
    $excluirArchivo = $false
    foreach ($patron in $excluir) {
        if ($rutaRelativa -like $patron -or $rutaRelativa -like "*\$patron" -or $rutaRelativa -like "$patron\*") {
            $excluirArchivo = $true
            break
        }
    }
    
    # Excluir si está en node_modules o .git
    if ($rutaRelativa -like "node_modules\*" -or $rutaRelativa -like ".git\*") {
        $excluirArchivo = $true
    }
    
    if (-not $excluirArchivo) {
        try {
            if ($archivo.PSIsContainer) {
                # Es una carpeta
                if (-not (Test-Path $rutaDestino)) {
                    New-Item -ItemType Directory -Path $rutaDestino -Force | Out-Null
                }
            } else {
                # Es un archivo
                $carpetaDestino = Split-Path $rutaDestino -Parent
                if (-not (Test-Path $carpetaDestino)) {
                    New-Item -ItemType Directory -Path $carpetaDestino -Force | Out-Null
                }
                Copy-Item -Path $archivo.FullName -Destination $rutaDestino -Force
                $contador++
            }
        } catch {
            Write-Host "Error copiando: $rutaRelativa" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Archivos copiados: $contador" -ForegroundColor Green

# Crear archivo .env.example si no existe
$envExample = Join-Path $carpetaSalida ".env.example"
if (-not (Test-Path $envExample)) {
    Write-Host "Creando .env.example..." -ForegroundColor Yellow
    @"
# ============================================
# CONFIGURACIÓN DE ENTORNO - CONSULTA VEHICULAR
# Configurar estas variables en cPanel -> Setup Node.js App -> Environment Variables
# ============================================

# Puerto del servidor (cPanel lo asigna automáticamente)
PORT=3000

# Entorno
NODE_ENV=production

# ============================================
# TOKENS DE APIS EXTERNAS
# ============================================

# Factiliza - Consulta SOAT y datos del vehiculo
FACTILIZA_TOKEN=Bearer tu_token_aqui

# ============================================
# SERVICIOS DE CAPTCHA
# ============================================

# 2Captcha - Para resolver captchas
CAPTCHA_API_KEY=tu_api_key_de_2captcha

# ============================================
# MERCADO PAGO (Pagos)
# ============================================

# Token de acceso de PRODUCCIÓN (NO usar TEST-)
ACCESS_TOKEN=APP_USR-xxxxxxxxxxxxx-xxxxxxxxxxxxx-xxxxxxxxxxxxx-xxxxxxxxxxxxx

# ============================================
# CONFIGURACIÓN OPCIONAL
# ============================================

# Modo prueba (true = bypass de pago, false = usar MercadoPago)
# MODO_PRUEBA=false

# Ruta de Chrome/Chromium (cPanel generalmente lo detecta automáticamente)
# PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
"@ | Out-File -FilePath $envExample -Encoding UTF8
}

# Crear archivo README para cPanel
$readme = Join-Path $carpetaSalida "README-CPANEL.txt"
@"
========================================
INSTRUCCIONES PARA cPanel
========================================

1. SUBIR ARCHIVOS:
   - Comprimir esta carpeta en ZIP
   - Subir a cPanel File Manager
   - Descomprimir en public_html/ (o subdirectorio)

2. CONFIGURAR NODE.JS:
   - Ir a "Setup Node.js App"
   - Crear nueva aplicación
   - Node.js version: 18.x o superior
   - Application root: /home/tuusuario/public_html
   - Application startup file: server.js
   - Application mode: Production

3. INSTALAR DEPENDENCIAS:
   - En "Setup Node.js App", clic en "Run NPM Install"
   - Esperar a que termine (5-15 minutos)

4. CONFIGURAR VARIABLES DE ENTORNO:
   - En "Setup Node.js App" -> "Environment Variables"
   - Agregar todas las variables del archivo .env.example
   - IMPORTANTE: Usar tokens de PRODUCCIÓN (no TEST-)

5. INICIAR APLICACIÓN:
   - Clic en "Restart App" o "Start App"
   - Verificar logs para confirmar que inició correctamente

6. CONFIGURAR SSL:
   - Ir a "SSL/TLS Status"
   - Activar SSL para tu dominio

========================================
VER GUIA_CPANEL_DESPLIEGUE.md PARA MÁS DETALLES
========================================
"@ | Out-File -FilePath $readme -Encoding UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PREPARACIÓN COMPLETADA" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Carpeta lista: $carpetaSalida" -ForegroundColor Green
Write-Host ""
Write-Host "PRÓXIMOS PASOS:" -ForegroundColor Yellow
Write-Host "1. Revisar la carpeta '$carpetaSalida'" -ForegroundColor White
Write-Host "2. Comprimir en ZIP (clic derecho -> Enviar a -> Carpeta comprimida)" -ForegroundColor White
Write-Host "3. Subir el ZIP a cPanel File Manager" -ForegroundColor White
Write-Host "4. Descomprimir en public_html/" -ForegroundColor White
Write-Host "5. Seguir instrucciones en README-CPANEL.txt" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANTE:" -ForegroundColor Red
Write-Host "- NO subir la carpeta 'node_modules' (se instala en el servidor)" -ForegroundColor Yellow
Write-Host "- NO subir archivo '.env' (usar variables de entorno de cPanel)" -ForegroundColor Yellow
Write-Host "- Verificar que todos los archivos .js estén incluidos" -ForegroundColor Yellow
Write-Host ""
