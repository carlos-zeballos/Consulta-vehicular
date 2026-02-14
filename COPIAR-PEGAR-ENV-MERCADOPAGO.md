# Configuración .env para PRODUCCIÓN - Mercado Pago

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
# CONFIGURACIÓN PRODUCCIÓN - MERCADO PAGO
# ============================================

# Configuración Base
BASE_URL=https://consultavehicular.services
PORT=3000
NODE_ENV=production

# Mercado Pago - PRODUCCIÓN
MERCADOPAGO_ACCESS_TOKEN=APP_USR-5363845934405232-021315-75ce11ab2c0aeb3f00d8c63c1da02b90-3202899162
MERCADOPAGO_PUBLIC_KEY=APP_USR-3a773006-4d23-4f56-abaa-d0845043596c

# Precio
PRICE_CENTS=1500
CURRENCY_NUM=604

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

Deberías ver:
```
[MERCADOPAGO] ✅ Cliente inicializado correctamente
```

---

## Nota sobre Credenciales

Las credenciales de Mercado Pago configuradas son:
- **Access Token**: `APP_USR-5363845934405232-021315-75ce11ab2c0aeb3f00d8c63c1da02b90-3202899162`
- **Public Key**: `APP_USR-3a773006-4d23-4f56-abaa-d0845043596c`

Si necesitas actualizar estas credenciales, reemplázalas en el archivo `.env`.
