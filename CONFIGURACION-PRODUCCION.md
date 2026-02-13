# Configuración para Producción

## 🌐 Configuración del Dominio

### Variables de Entorno Necesarias:

```env
# Dominio de producción
BASE_URL=https://consultavehicular.services
PUBLIC_BASE_URL=https://consultavehicular.services
PORT=8080

# Proxy de 2Captcha para MTC
MTC_PROXY_URL=http://uae12c98557ca05dd-zone-custom:uae12c98557ca05dd@na.proxy.2captcha.com:2334

# API Key de 2Captcha
CAPTCHA_API_KEY=dd23c370d7192bfb0d8cb37188918abe

# Configuración de Izipay (ya configurada)
IZIPAY_SITE_ID=tu_site_id
IZIPAY_CTX_MODE=PRODUCTION
IZIPAY_PROD_KEY=tu_prod_key
IZIPAY_TEST_KEY=tu_test_key
```

## 🔧 Formato del Proxy

El proxy de 2Captcha debe estar en el formato:
```
http://username:password@host:port
```

Para tu caso:
```
http://uae12c98557ca05dd-zone-custom:uae12c98557ca05dd@na.proxy.2captcha.com:2334
```

## ✅ Verificación

1. El proxy se usará automáticamente en todas las consultas MTC
2. El sistema intentará hasta obtener código 200 e información
3. Se probará con la placa v2r075
