# 📝 Instrucciones para Configurar .env en Modo TEST

## 🎯 Para Hacer Pruebas de Pago

### Paso 1: Editar .env en el servidor

```bash
cd /opt/Consulta-vehicular
nano .env
```

### Paso 2: Pegar estas líneas (PRIMERAS 27 LÍNEAS)

**⚠️ IMPORTANTE:** Reemplaza los valores que dicen `tu_..._aqui` con tus valores reales de Izipay.

```env
# ============================================
# CONFIGURACIÓN BÁSICA
# ============================================
NODE_ENV=production
PORT=3000
BASE_URL=https://consultavehicular.services
PUBLIC_BASE_URL=https://consultavehicular.services
BASE_PATH=

# ============================================
# IZIPAY / MICUENTAWEB - MODO TEST
# ============================================
IZIPAY_SITE_ID=tu_site_id_aqui
IZIPAY_CTX_MODE=TEST
IZIPAY_TEST_KEY=tu_test_key_aqui
IZIPAY_PROD_KEY=

# ============================================
# MICUENTAWEB (Alternativa - opcional)
# ============================================
MCW_API_USER=88791260
MCW_API_PASSWORD=tu_password_api_aqui
MCW_PUBLIC_KEY=tu_public_key_aqui
MCW_HMAC_KEY=tu_hmac_key_aqui
MCW_RETURN_OK=https://consultavehicular.services/pago-ok
MCW_RETURN_KO=https://consultavehicular.services/pago-error
MCW_IPN_URL=https://consultavehicular.services/api/payments/mcw/ipn

# ============================================
# 2CAPTCHA
# ============================================
CAPTCHA_API_KEY=dd23c370d7192bfb0d8cb37188918abe

# ============================================
# PROXY MTC (2Captcha)
# ============================================
MTC_PROXY_HOST=na.proxy.2captcha.com
MTC_PROXY_PORT=2334
MTC_PROXY_USER=uae12c98557ca05dd-zone-custom-region-pe-session-dDCuqxdzZ-sessTime-3
MTC_PROXY_PASS=uae12c98557ca05dd
MTC_PROXY_URL=http://uae12c98557ca05dd-zone-custom-region-pe-session-dDCuqxdzZ-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334
MTC_PROXY_ROTATION_ENABLED=false

# ============================================
# PRECIO Y MONEDA
# ============================================
PRICE_CENTS=500
CURRENCY_NUM=604

# ============================================
# CUPONES (Opcional)
# ============================================
COUPON_ADMIN_CODE=ADMIN-XXXX-ROOT
COUPONS_PUBLIC_CODES=
COUPON_HASH_SALT=cambia_esto_en_produccion
```

### Paso 3: Reemplazar valores de Izipay

**Debes cambiar estos valores con tus credenciales reales:**

1. `IZIPAY_SITE_ID=tu_site_id_aqui` → Tu Site ID de Izipay
2. `IZIPAY_TEST_KEY=tu_test_key_aqui` → Tu Test Key de Izipay (del Back Office en modo TEST)

**Ejemplo:**
```env
IZIPAY_SITE_ID=12345678
IZIPAY_TEST_KEY=abcdefghijklmnopqrstuvwxyz1234567890
```

### Paso 4: Guardar y salir

- Presiona `Ctrl+O` (guardar)
- Presiona `Enter` (confirmar)
- Presiona `Ctrl+X` (salir)

### Paso 5: Reiniciar aplicación

```bash
pm2 restart consulta-vehicular
pm2 save
pm2 logs consulta-vehicular --lines 40
```

### Paso 6: Verificar configuración

```bash
# Verificar que BASE_URL está correcto
grep BASE_URL .env

# Verificar que está en modo TEST
grep IZIPAY_CTX_MODE .env

# Debe mostrar: IZIPAY_CTX_MODE=TEST
```

---

## ✅ Checklist antes de probar

- [ ] ✅ `BASE_URL=https://consultavehicular.services`
- [ ] ✅ `IZIPAY_CTX_MODE=TEST`
- [ ] ✅ `IZIPAY_SITE_ID` tiene tu Site ID real
- [ ] ✅ `IZIPAY_TEST_KEY` tiene tu Test Key real
- [ ] ✅ Aplicación reiniciada (`pm2 restart`)
- [ ] ✅ Servidor responde (`curl localhost:3000/api/health`)

---

## 🧪 Cómo Probar el Pago en Modo TEST

1. **Abrir:** `https://consultavehicular.services/comprar`

2. **Completar formulario:**
   - Ingresar email
   - Hacer clic en "Pagar"

3. **En Izipay (modo TEST):**
   - Usar tarjeta de prueba: `4111111111111111`
   - Fecha: cualquier fecha futura (ej: 12/25)
   - CVV: cualquier 3 dígitos (ej: 123)
   - Nombre: cualquier nombre

4. **Verificar redirección:**
   - Debe redirigir a: `https://consultavehicular.services/pago-ok?orderId=...`
   - Debe mostrar "Procesando confirmación..."

5. **Esperar confirmación:**
   - El sistema verifica cada 2 segundos
   - Cuando el IPN confirme, debe mostrar "Pago confirmado. Acceso activado."

6. **Verificar redirección final:**
   - Debe redirigir automáticamente a: `https://consultavehicular.services/result.html?token=...`

---

## 🔍 Ver Logs en Tiempo Real

```bash
pm2 logs consulta-vehicular --lines 0
```

**Busca estos mensajes:**
- ✅ `[IZIPAY] init -> orderId=...` - Pago iniciado
- ✅ `[IZIPAY] return pago-ok` - Retorno de Izipay
- ✅ `[IZIPAY] ipn -> orderId=... status=PAID` - Pago confirmado
- ✅ `[IZIPAY] Acceso activado` - Token generado

---

## ⚠️ IMPORTANTE

- **En modo TEST:** Usa tarjetas de prueba de Izipay
- **En modo PRODUCTION:** Cambia `IZIPAY_CTX_MODE=PRODUCTION` y usa `IZIPAY_PROD_KEY`
- **El IPN debe estar configurado en Izipay Back Office:**
  - URL: `https://consultavehicular.services/api/izipay/ipn`

---

**✅ ¡Listo para probar!**
