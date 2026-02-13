# 📋 CONTENIDO EXACTO PARA PEGAR EN nano .env

## 🎯 Para Modo TEST - Copiar y Pegar Directo

### Paso 1: Abrir .env
```bash
cd /opt/Consulta-vehicular
nano .env
```

### Paso 2: Pegar este contenido EXACTO

**⚠️ IMPORTANTE:** Reemplaza `tu_site_id_aqui` y `tu_test_key_aqui` con tus valores reales de Izipay.

```
NODE_ENV=production
PORT=3000
BASE_URL=https://consultavehicular.services
PUBLIC_BASE_URL=https://consultavehicular.services
BASE_PATH=
IZIPAY_SITE_ID=tu_site_id_aqui
IZIPAY_CTX_MODE=TEST
IZIPAY_TEST_KEY=tu_test_key_aqui
IZIPAY_PROD_KEY=
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
PRICE_CENTS=500
CURRENCY_NUM=604
```

### Paso 3: Editar valores de Izipay

**Busca estas líneas y reemplázalas:**

```env
IZIPAY_SITE_ID=tu_site_id_aqui          → Cambia por tu Site ID real
IZIPAY_TEST_KEY=tu_test_key_aqui       → Cambia por tu Test Key real
```

**Ejemplo:**
```env
IZIPAY_SITE_ID=12345678
IZIPAY_TEST_KEY=abcdefghijklmnopqrstuvwxyz1234567890
```

### Paso 4: Guardar

- `Ctrl+O` (guardar)
- `Enter` (confirmar)
- `Ctrl+X` (salir)

### Paso 5: Reiniciar

```bash
pm2 restart consulta-vehicular
pm2 save
pm2 logs consulta-vehicular --lines 40
```

---

## ✅ Verificar que está correcto

```bash
# Verificar BASE_URL
grep BASE_URL .env
# Debe mostrar: BASE_URL=https://consultavehicular.services

# Verificar modo TEST
grep IZIPAY_CTX_MODE .env
# Debe mostrar: IZIPAY_CTX_MODE=TEST

# Verificar que Site ID y Test Key están configurados
grep IZIPAY_SITE_ID .env
grep IZIPAY_TEST_KEY .env
```

---

## 🧪 Probar el Pago

1. Abre: `https://consultavehicular.services/comprar`
2. Completa el formulario
3. En Izipay (modo TEST), usa:
   - Tarjeta: `4111111111111111`
   - Fecha: `12/25` (cualquier fecha futura)
   - CVV: `123` (cualquier 3 dígitos)
4. Debe redirigir a `pago-ok.html` y luego a `result.html`

---

**✅ ¡Listo para probar!**
