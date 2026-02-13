# 📋 Archivo .env para Izipay - Copiar y Pegar

## 🎯 Instrucciones

1. **Conectarse al servidor:**
   ```bash
   ssh root@217.216.87.255
   ```

2. **Ir al directorio del proyecto:**
   ```bash
   cd /opt/Consulta-vehicular
   ```

3. **Hacer backup del .env actual (si existe):**
   ```bash
   cp .env .env.backup
   ```

4. **Editar el archivo .env:**
   ```bash
   nano .env
   ```

5. **Pegar el contenido completo de abajo**

6. **Reemplazar los valores:**
   - `tu_site_id_aqui` → Tu Site ID de Izipay
   - `tu_test_key_aqui` → Tu llave de TEST de Izipay
   - `tu_prod_key_aqui` → Tu llave de PRODUCTION de Izipay

7. **Guardar:**
   - Presiona `Ctrl + O` (guardar)
   - Presiona `Enter` (confirmar)
   - Presiona `Ctrl + X` (salir)

8. **Reiniciar la aplicación:**
   ```bash
   pkill -f "node.*server.js"
   nohup node server.js > server.log 2>&1 &
   ```

---

## 📄 CONTENIDO COMPLETO DEL .env

Copia y pega esto en `nano .env`:

```env
# ============================================
# CONFIGURACIÓN BÁSICA DEL SERVIDOR
# ============================================
NODE_ENV=production
PORT=3000
BASE_URL=https://consultavehicular.services
PUBLIC_BASE_URL=https://consultavehicular.services
BASE_PATH=

# ============================================
# IZIPAY / MICUENTAWEB - CONFIGURACIÓN
# ============================================
IZIPAY_SITE_ID=tu_site_id_aqui
IZIPAY_CTX_MODE=TEST
IZIPAY_TEST_KEY=tu_test_key_aqui
IZIPAY_PROD_KEY=tu_prod_key_aqui

# ============================================
# MICUENTAWEB (MCW) - OPCIONAL
# ============================================
MCW_API_USER=88791260
MCW_API_PASSWORD=tu_password_api_aqui
MCW_PUBLIC_KEY=tu_public_key_aqui
MCW_HMAC_KEY=tu_hmac_key_aqui
MCW_RETURN_OK=https://consultavehicular.services/pago-ok
MCW_RETURN_KO=https://consultavehicular.services/pago-error
MCW_IPN_URL=https://consultavehicular.services/api/payments/mcw/ipn

# ============================================
# PRECIO Y MONEDA
# ============================================
PRICE_CENTS=1500
CURRENCY_NUM=604

# ============================================
# 2CAPTCHA - PARA SCRAPING
# ============================================
CAPTCHA_API_KEY=dd23c370d7192bfb0d8cb37188918abe

# ============================================
# PROXY MTC (2Captcha) - PARA SCRAPING MTC
# ============================================
MTC_PROXY_HOST=na.proxy.2captcha.com
MTC_PROXY_PORT=2334
MTC_PROXY_USER=uae12c98557ca05dd-zone-custom-region-pe-session-dDCuqxdzZ-sessTime-3
MTC_PROXY_PASS=uae12c98557ca05dd
MTC_PROXY_URL=http://uae12c98557ca05dd-zone-custom-region-pe-session-dDCuqxdzZ-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334
MTC_PROXY_ROTATION_ENABLED=false

# ============================================
# CUPONES - OPCIONAL
# ============================================
COUPON_ADMIN_CODE=ADMIN-XXXX-ROOT
COUPONS_PUBLIC_CODES=
COUPON_HASH_SALT=cambia_esto_en_produccion
```

---

## ✅ Valores que DEBES reemplazar

1. **`tu_site_id_aqui`** → Tu Site ID de Izipay (lo encuentras en el Back Office)
2. **`tu_test_key_aqui`** → Tu llave de TEST (Back Office > Configuración > Llaves)
3. **`tu_prod_key_aqui`** → Tu llave de PRODUCTION (solo cuando pases a producción)
4. **`tu_password_api_aqui`** → Si usas MCW API (opcional)
5. **`tu_public_key_aqui`** → Si usas MCW API (opcional)
6. **`tu_hmac_key_aqui`** → Si usas MCW API (opcional)

---

## 🔧 Configuración del IPN en Izipay

**IMPORTANTE:** Debes configurar el IPN en el Back Office de Izipay:

1. Entra a tu Back Office de Izipay
2. Ve a **Configuración** > **Reglas de notificación**
3. Crea una regla con:
   - **URL:** `https://consultavehicular.services/api/izipay/ipn`
   - **Método:** POST
   - **Eventos:** Todos los eventos de pago

---

## 📝 Notas

- **Modo TEST:** Usa `IZIPAY_CTX_MODE=TEST` y `IZIPAY_TEST_KEY`
- **Modo PRODUCTION:** Cambia a `IZIPAY_CTX_MODE=PRODUCTION` y usa `IZIPAY_PROD_KEY`
- El puerto 3000 es interno, Nginx lo expone al exterior
- `BASE_URL` debe coincidir exactamente con tu dominio

---

**✅ Después de configurar, reinicia la aplicación y prueba el flujo de pago.**
