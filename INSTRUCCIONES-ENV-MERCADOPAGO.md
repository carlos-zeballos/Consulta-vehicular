# Instrucciones: Configurar .env para Producción (Solo Mercado Pago)

## 📋 Variables Obligatorias

### 1. **Configuración Básica**
```env
PORT=3000
NODE_ENV=production
BASE_URL=https://consultavehicular.services
PUBLIC_BASE_URL=https://consultavehicular.services
```

### 2. **Mercado Pago (OBLIGATORIO)**
```env
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxxxxxxxx
MERCADOPAGO_PUBLIC_KEY=APP_USR-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxxxxxxxx
PRICE_CENTS=1500
CURRENCY_NUM=604
```

**Cómo obtener las credenciales:**
1. Ve a https://www.mercadopago.com.pe/developers/panel/credentials
2. Selecciona tu aplicación de producción
3. Copia el **Access Token** → `MERCADOPAGO_ACCESS_TOKEN`
4. Copia la **Public Key** → `MERCADOPAGO_PUBLIC_KEY`

### 3. **2Captcha (OBLIGATORIO para scrapers)**
```env
CAPTCHA_API_KEY=tu_api_key_de_2captcha
```

**Cómo obtener:**
1. Ve a https://2captcha.com/?from=1234567
2. Crea una cuenta o inicia sesión
3. Ve a "Settings" → "API Key"
4. Copia tu API Key → `CAPTCHA_API_KEY`

---

## 📋 Variables Opcionales

### MTC Proxy (Solo si usas proxy para MTC)
```env
MTC_PROXY_HOST=na.proxy.2captcha.com
MTC_PROXY_PORT=2334
MTC_PROXY_USER=tu_usuario_proxy
MTC_PROXY_PASS=tu_password_proxy
```

### Cupones
```env
COUPON_ADMIN_CODE=ADMIN-XXXX-ROOT
COUPONS_PUBLIC_CODES=PROMO-ABCDE:5,PROMO-FGHIJ:10
COUPON_HASH_SALT=cambia_esto_en_produccion_por_algo_seguro
```

---

## ❌ Variables que NO debes incluir

**NO incluyas estas variables** (son de Izipay/MiCuentaWeb):
- `MCW_API_USER`
- `MCW_API_PASSWORD`
- `MCW_PUBLIC_KEY`
- `MCW_HMAC_KEY`
- `MCW_RETURN_OK`
- `MCW_RETURN_KO`
- `MCW_IPN_URL`
- `IZIPAY_SITE_ID`
- `IZIPAY_CTX_MODE`
- `IZIPAY_TEST_KEY`
- `IZIPAY_PROD_KEY`

---

## 📝 Ejemplo Completo Mínimo

```env
# Configuración Básica
PORT=3000
NODE_ENV=production
BASE_URL=https://consultavehicular.services
PUBLIC_BASE_URL=https://consultavehicular.services

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxxxxxxxx
MERCADOPAGO_PUBLIC_KEY=APP_USR-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxxxxxxxx
PRICE_CENTS=1500
CURRENCY_NUM=604

# 2Captcha
CAPTCHA_API_KEY=dd23c370d7192bfb0d8cb37188918abe
```

---

## ✅ Verificación

Después de configurar el `.env`, verifica que todo esté correcto:

```bash
# En el servidor
cd /opt/Consulta-vehicular
docker exec consulta-vehicular env | grep -E "MERCADOPAGO|CAPTCHA|BASE_URL|PORT|NODE_ENV"
```

Deberías ver:
- ✅ `MERCADOPAGO_ACCESS_TOKEN` (con valor)
- ✅ `MERCADOPAGO_PUBLIC_KEY` (con valor)
- ✅ `CAPTCHA_API_KEY` (con valor)
- ✅ `BASE_URL` (tu dominio)
- ✅ `PORT=3000`
- ✅ `NODE_ENV=production`

---

## 🔒 Seguridad

- **NUNCA** compartas tu `.env` en repositorios públicos
- **NUNCA** expongas tu `MERCADOPAGO_ACCESS_TOKEN` en el frontend
- **NUNCA** expongas tu `CAPTCHA_API_KEY` en el frontend
- Mantén tu `.env` con permisos restrictivos: `chmod 600 .env`

---

**Última actualización**: Febrero 2026
