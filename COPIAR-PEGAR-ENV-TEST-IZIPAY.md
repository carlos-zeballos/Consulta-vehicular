# 📋 Archivo .env para Izipay en MODO TEST

## ✅ Configuración lista para copiar y pegar

Este archivo está configurado para que Izipay corra **SOLO en modo TEST**.

---

## 📄 CONTENIDO COMPLETO - COPIAR Y PEGAR

```env
NODE_ENV=production
PORT=3000
BASE_URL=https://consultavehicular.services
PUBLIC_BASE_URL=https://consultavehicular.services
BASE_PATH=
IZIPAY_SITE_ID=tu_site_id_aqui
IZIPAY_CTX_MODE=TEST
IZIPAY_TEST_KEY=tu_test_key_aqui
IZIPAY_PROD_KEY=tu_prod_key_aqui
MCW_API_USER=88791260
MCW_API_PASSWORD=tu_password_api_aqui
MCW_PUBLIC_KEY=tu_public_key_aqui
MCW_HMAC_KEY=tu_hmac_key_aqui
MCW_RETURN_OK=https://consultavehicular.services/pago-ok
MCW_RETURN_KO=https://consultavehicular.services/pago-error
MCW_IPN_URL=https://consultavehicular.services/api/payments/mcw/ipn
CAPTCHA_API_KEY=dd23c370d7192bfb0d8cb37188918abe
MTC_PROXY_HOST=na.proxy.2captcha.com
MTC_PROXY_PORT=2334
MTC_PROXY_USER=uae12c98557ca05dd-zone-custom-region-pe-session-dDCuqxdzZ-sessTime-3
MTC_PROXY_PASS=uae12c98557ca05dd
MTC_PROXY_URL=http://uae12c98557ca05dd-zone-custom-region-pe-session-dDCuqxdzZ-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334
MTC_PROXY_ROTATION_ENABLED=false
PRICE_CENTS=1500
CURRENCY_NUM=604
COUPON_ADMIN_CODE=ADMIN-XXXX-ROOT
COUPONS_PUBLIC_CODES=
COUPON_HASH_SALT=cambia_esto_en_produccion
```

---

## 🔧 Cómo usar en el servidor

```bash
# 1. Ir al directorio
cd /opt/Consulta-vehicular

# 2. Hacer backup del .env actual
cp .env .env.backup

# 3. Editar .env
nano .env

# 4. Borrar todo el contenido (Ctrl+K varias veces o seleccionar todo y borrar)

# 5. Pegar el contenido completo de arriba (Ctrl+Shift+V)

# 6. Reemplazar los valores:
#    - tu_site_id_aqui → Tu Site ID real
#    - tu_test_key_aqui → Tu llave de TEST real
#    - tu_prod_key_aqui → Tu llave de PRODUCTION (aunque esté en TEST, déjala)
#    - tu_password_api_aqui → Si usas MCW API
#    - tu_public_key_aqui → Si usas MCW API
#    - tu_hmac_key_aqui → Si usas MCW API

# 7. Guardar: Ctrl+O, Enter, Ctrl+X

# 8. Verificar que IZIPAY_CTX_MODE=TEST
grep IZIPAY_CTX_MODE .env

# 9. Reiniciar aplicación
pkill -f "node.*server.js"
nohup node server.js > server.log 2>&1 &

# 10. Verificar logs
tail -f server.log
# Debe mostrar: [IZIPAY] Modo: TEST
```

---

## ✅ Verificación

Después de configurar, verifica que está en modo TEST:

```bash
# Verificar variable
grep IZIPAY_CTX_MODE .env
# Debe mostrar: IZIPAY_CTX_MODE=TEST

# Ver logs al iniciar
tail -20 server.log | grep IZIPAY
# Debe mostrar que está usando modo TEST
```

---

## ⚠️ IMPORTANTE

- **`IZIPAY_CTX_MODE=TEST`** → La aplicación usará solo la llave de TEST
- **`IZIPAY_TEST_KEY`** → Esta es la que se usará para procesar pagos
- **`IZIPAY_PROD_KEY`** → Se ignora en modo TEST, pero déjala configurada para cuando pases a producción

---

## 🔄 Para cambiar a PRODUCCIÓN más adelante

Cuando estés listo para producción:

1. Cambia `IZIPAY_CTX_MODE=TEST` a `IZIPAY_CTX_MODE=PRODUCTION`
2. Asegúrate de que `IZIPAY_PROD_KEY` tenga tu llave de producción
3. Reinicia la aplicación

---

**✅ Con esta configuración, Izipay correrá SOLO en modo TEST.**
