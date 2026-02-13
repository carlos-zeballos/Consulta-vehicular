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
# MICUENTAWEB / IZIPAY (Pagos)
# ============================================

MCW_API_USER=88791260
MCW_API_PASSWORD=tu_password_api
MCW_PUBLIC_KEY=tu_public_key
MCW_HMAC_KEY=tu_hmac_key
MCW_RETURN_OK=https://tu-dominio.com/pago-ok
MCW_RETURN_KO=https://tu-dominio.com/pago-error
MCW_IPN_URL=https://tu-dominio.com/api/payments/mcw/ipn
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
$mcwApiUser = Read-Host "MCW_API_USER"
$mcwApiPassword = Read-Host "MCW_API_PASSWORD"
$mcwPublicKey = Read-Host "MCW_PUBLIC_KEY"
$mcwHmacKey = Read-Host "MCW_HMAC_KEY"
$mcwReturnOk = Read-Host "MCW_RETURN_OK"
$mcwReturnKo = Read-Host "MCW_RETURN_KO"
$mcwIpnUrl = Read-Host "MCW_IPN_URL"

$envContent = $envContent -replace "Bearer tu_token_aqui", $factiliza
$envContent = $envContent -replace "tu_api_key_de_2captcha", $captcha
$envContent = $envContent -replace "88791260", $mcwApiUser
$envContent = $envContent -replace "tu_password_api", $mcwApiPassword
$envContent = $envContent -replace "tu_public_key", $mcwPublicKey
$envContent = $envContent -replace "tu_hmac_key", $mcwHmacKey
$envContent = $envContent -replace "https://tu-dominio.com/pago-ok", $mcwReturnOk
$envContent = $envContent -replace "https://tu-dominio.com/pago-error", $mcwReturnKo
$envContent = $envContent -replace "https://tu-dominio.com/api/payments/mcw/ipn", $mcwIpnUrl

$envContent | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline

Write-Host "`n✅ Archivo .env creado exitosamente!`n" -ForegroundColor Green
