# Script para configurar .env
# Ejecutar: .\configurar-env.ps1

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "CONFIGURACION DE .ENV" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

$envContent = @"
# ============================================
# CONFIGURACION DE ENTORNO - CONSULTA VEHICULAR
# ============================================

# Puerto del servidor
PORT=3000

# Entorno
NODE_ENV=development

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

ACCESS_TOKEN=APP_USR-xxxxxxxxxxxxx
PUBLIC_KEY=APP_USR-xxxxxxxxxxxxx
"@

if (Test-Path ".env") {
    Write-Host "⚠️  El archivo .env ya existe" -ForegroundColor Yellow
    $respuesta = Read-Host "¿Deseas sobrescribirlo? (s/n)"
    if ($respuesta -ne "s") {
        Write-Host "Operación cancelada" -ForegroundColor Red
        exit
    }
}

Write-Host "`nPor favor, ingresa las siguientes credenciales:`n" -ForegroundColor Yellow

$factiliza = Read-Host "FACTILIZA_TOKEN (Bearer ...)"
$captcha = Read-Host "CAPTCHA_API_KEY"
$accessToken = Read-Host "ACCESS_TOKEN (MercadoPago)"
$publicKey = Read-Host "PUBLIC_KEY (MercadoPago)"

$envContent = $envContent -replace "Bearer tu_token_aqui", $factiliza
$envContent = $envContent -replace "tu_api_key_de_2captcha", $captcha
$envContent = $envContent -replace "APP_USR-xxxxxxxxxxxxx", $accessToken
$envContent = $envContent -replace "APP_USR-xxxxxxxxxxxxx", $publicKey

$envContent | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline

Write-Host "`n✅ Archivo .env creado exitosamente!`n" -ForegroundColor Green
