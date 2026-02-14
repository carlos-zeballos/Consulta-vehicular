# Configuración .env para PRODUCCIÓN - Izipay

## Instrucciones

1. Conéctate al servidor VPS:
```bash
ssh root@217.216.87.255
```

2. Ve al directorio del proyecto:
```bash
cd /opt/Consulta-vehicular
```

3. Edita el archivo .env:
```bash
nano .env
```

4. **BORRA TODO** el contenido actual y pega exactamente esto:

---

## CONTENIDO PARA PEGAR EN .env

```
# ============================================
# CONFIGURACIÓN PRODUCCIÓN - IZIPAY
# ============================================

# Configuración Base
BASE_URL=https://consultavehicular.services
PORT=3000
NODE_ENV=production

# Izipay - PRODUCCIÓN
IZIPAY_SITE_ID=12345678
IZIPAY_CTX_MODE=PRODUCTION
IZIPAY_PROD_KEY=tu_clave_produccion_izipay_aqui
IZIPAY_TEST_KEY=tu_clave_test_izipay_aqui
MCW_HMAC_KEY=tu_hmac_key_produccion_aqui

# 2Captcha
CAPTCHA_API_KEY=dd23c370d7192bfb0d8cb37188918abe

# Proxy MTC (2Captcha) - Configuración actual
MTC_PROXY_HOST=na.proxy.2captcha.com
MTC_PROXY_PORT=2334
MTC_PROXY_USER=uae12c98557ca05dd-zone-custom-region-pe-asn-AS27843-session-X2RCP1LgE-sessTime-3
MTC_PROXY_PASS=uae12c98557ca05dd
MTC_PROXY_URL=http://uae12c98557ca05dd-zone-custom-region-pe-asn-AS27843-session-X2RCP1LgE-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334
```

---

## ⚠️ IMPORTANTE: Reemplazar Valores de Izipay

**ANTES de guardar**, reemplaza estos valores con tus credenciales REALES de producción:

1. **IZIPAY_SITE_ID**: Tu Site ID de producción de Izipay
2. **IZIPAY_PROD_KEY**: Tu clave de producción de Izipay
3. **MCW_HMAC_KEY**: Tu clave HMAC de producción
4. **IZIPAY_TEST_KEY**: Puedes dejarlo igual o actualizarlo

## Guardar y Salir

1. Presiona `Ctrl+O` para guardar
2. Presiona `Enter` para confirmar
3. Presiona `Ctrl+X` para salir

## Reiniciar el Servidor

Después de guardar el .env, reinicia el servidor:

```bash
# Si usas PM2:
pm2 restart consulta-vehicular
pm2 save

# Si usas systemd:
systemctl restart consulta-vehicular

# Si usas nohup:
pkill -f "node.*server.js"
cd /opt/Consulta-vehicular
nohup node server.js > server.log 2>&1 &
```

## Verificar que Funciona

```bash
# Ver logs
pm2 logs consulta-vehicular --lines 20

# O si usas nohup:
tail -f server.log
```

---

## Nota sobre IZIPAY_CTX_MODE

- **PRODUCTION**: Para pagos reales
- **TEST**: Para pruebas (no procesa pagos reales)

Asegúrate de usar **PRODUCTION** cuando estés listo para recibir pagos reales.
