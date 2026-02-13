# 🚀 Guía de Despliegue y Actualización en Servidor

## 📋 Información del Servidor
- **IP:** 217.216.87.255
- **Usuario:** root
- **Dominio:** consultavehicular.services
- **Repositorio:** https://github.com/carlos-zeballos/Consulta-vehicular.git

---

## 🔄 PASO 1: CONECTARSE AL SERVIDOR

Desde Windows PowerShell:

```powershell
ssh root@217.216.87.255
```

---

## 📥 PASO 2: ACTUALIZAR CÓDIGO DESDE GITHUB

```bash
# Ir al directorio del proyecto
cd /var/www/app
# O si está en otro lugar:
# cd /opt/Consulta-vehicular

# Actualizar código
git fetch origin
git pull origin main

# Verificar que se actualizó
git log --oneline -5
```

**✅ Validación:** Debe mostrar el último commit: "Ajustar todos los endpoints para devolver 200 con ok: true incluso sin datos"

---

## 🔧 PASO 3: ACTUALIZAR VARIABLES DE ENTORNO (.env)

### Opción A: Editar manualmente

```bash
cd /var/www/app
nano .env
```

### Opción B: Usar el script de actualización

```bash
cd /var/www/app
# Copiar el script si no existe
# (o crearlo manualmente con los valores correctos)

# Editar .env
nano .env
```

### 📝 Variables CRÍTICAS para la Pasarela de Pagos:

```env
# ============================================
# CONFIGURACIÓN BÁSICA
# ============================================
NODE_ENV=production
PORT=3000
BASE_URL=https://consultavehicular.services
PUBLIC_BASE_URL=https://consultavehicular.services

# ============================================
# IZIPAY / MICUENTAWEB (Pasarela de Pagos)
# ============================================
IZIPAY_SITE_ID=tu_site_id
IZIPAY_CTX_MODE=PRODUCTION
IZIPAY_TEST_KEY=tu_test_key
IZIPAY_PROD_KEY=tu_production_key

# ============================================
# MICUENTAWEB (Alternativa)
# ============================================
MCW_API_USER=88791260
MCW_API_PASSWORD=tu_password_api
MCW_PUBLIC_KEY=tu_public_key
MCW_HMAC_KEY=tu_hmac_key
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

**💾 Guardar:** `Ctrl+O`, luego `Enter`, luego `Ctrl+X`

**✅ Validación:** Verificar que las variables están correctas:
```bash
cat .env | grep -E "BASE_URL|IZIPAY|MCW_RETURN" | head -10
```

---

## 📦 PASO 4: INSTALAR/ACTUALIZAR DEPENDENCIAS

```bash
cd /var/www/app
npm install --production
```

**✅ Validación:** Debe completar sin errores críticos.

---

## 🔄 PASO 5: REINICIAR LA APLICACIÓN

### Si usas PM2 (Recomendado):

```bash
cd /var/www/app

# Reiniciar aplicación
pm2 restart consulta-vehicular

# O si no existe, iniciarla:
pm2 start server.js --name "consulta-vehicular" --cwd /var/www/app

# Guardar configuración
pm2 save

# Ver estado
pm2 status

# Ver logs
pm2 logs consulta-vehicular --lines 50
```

### Si usas Docker:

```bash
cd /var/www/app
docker compose restart
# O
docker compose up -d --build
```

---

## ✅ PASO 6: VERIFICAR QUE FUNCIONA

### 6.1 Verificar que el servidor responde:

```bash
# Desde el servidor
curl http://localhost:3000/api/health
# O
curl https://consultavehicular.services/api/health
```

**✅ Debe devolver:** `{"ok":true}` o similar

### 6.2 Verificar logs:

```bash
# PM2
pm2 logs consulta-vehicular --lines 100

# Docker
docker compose logs --tail=100
```

**✅ Debe mostrar:** "Servidor activo en..." sin errores críticos

---

## 🧪 PASO 7: PROBAR LA PASARELA DE PAGOS

### 7.1 Verificar configuración de Izipay:

```bash
# Verificar que BASE_URL está configurado correctamente
grep BASE_URL .env

# Debe mostrar:
# BASE_URL=https://consultavehicular.services
```

### 7.2 Probar flujo de pago:

1. **Abrir en navegador:**
   ```
   https://consultavehicular.services/comprar
   ```

2. **Completar formulario de pago:**
   - Ingresar email
   - Hacer clic en "Pagar"

3. **Verificar redirección:**
   - Debe redirigir a la pasarela de Izipay
   - Completar pago de prueba

4. **Verificar retorno:**
   - Después del pago, debe redirigir a:
     ```
     https://consultavehicular.services/pago-ok?orderId=IZI-XXXXX-XXXXX
     ```

5. **Verificar confirmación:**
   - La página debe mostrar "Procesando confirmación..."
   - Debe verificar el estado cada 2 segundos
   - Cuando el IPN confirme, debe mostrar "Pago confirmado. Acceso activado."

6. **Verificar redirección final:**
   - Debe redirigir automáticamente a:
     ```
     https://consultavehicular.services/result.html?token=XXXXX
     ```

### 7.3 Verificar logs durante el pago:

```bash
# En otra terminal SSH, ver logs en tiempo real
pm2 logs consulta-vehicular --lines 0
```

**Buscar en los logs:**
- `[IZIPAY] init -> orderId=...` - Inicio del pago
- `[IZIPAY] return pago-ok` - Retorno de Izipay
- `[IZIPAY] ipn -> orderId=... status=PAID` - Confirmación IPN
- `[IZIPAY] Acceso activado` - Activación de acceso

---

## 🔍 PASO 8: VERIFICAR CONFIGURACIÓN DE NGINX

```bash
# Verificar configuración
nginx -t

# Ver configuración actual
cat /etc/nginx/sites-available/consulta-vehicular

# Recargar si es necesario
systemctl reload nginx
```

**✅ Debe incluir:**
- Proxy para `/api/`
- Proxy para `/pago-ok`
- Proxy para `/result.html`
- Configuración SSL si usa HTTPS

---

## 🐛 SOLUCIÓN DE PROBLEMAS

### Problema: El pago no redirige a result.html

**Solución 1: Verificar BASE_URL**
```bash
grep BASE_URL .env
# Debe ser: BASE_URL=https://consultavehicular.services
```

**Solución 2: Verificar logs de IPN**
```bash
pm2 logs consulta-vehicular | grep IPN
# Debe mostrar confirmaciones de IPN
```

**Solución 3: Verificar que el IPN está configurado**
```bash
# En Izipay Back Office, verificar que la URL de IPN es:
# https://consultavehicular.services/api/izipay/ipn
```

### Problema: Error 404 en pago-ok.html

**Solución:**
```bash
# Verificar que el archivo existe
ls -la /var/www/app/public/pago-ok.html

# Verificar configuración de Nginx
nginx -t
systemctl reload nginx
```

### Problema: El servidor no inicia

**Solución:**
```bash
# Ver errores
pm2 logs consulta-vehicular --err

# Probar inicio manual
cd /var/www/app
node server.js
# Revisar errores en la salida
```

---

## 📋 CHECKLIST DE VERIFICACIÓN

- [ ] ✅ Código actualizado desde GitHub
- [ ] ✅ Variables de entorno configuradas (.env)
- [ ] ✅ BASE_URL configurado correctamente
- [ ] ✅ Credenciales de Izipay configuradas
- [ ] ✅ Dependencias instaladas
- [ ] ✅ Aplicación reiniciada (PM2 o Docker)
- [ ] ✅ Servidor responde en /api/health
- [ ] ✅ Nginx configurado correctamente
- [ ] ✅ SSL funcionando (si aplica)
- [ ] ✅ Pago redirige a pago-ok.html
- [ ] ✅ IPN confirma el pago
- [ ] ✅ Redirección a result.html funciona
- [ ] ✅ Token de acceso funciona

---

## 🔄 COMANDOS RÁPIDOS DE MANTENIMIENTO

```bash
# Ver estado
pm2 status

# Ver logs
pm2 logs consulta-vehicular

# Reiniciar
pm2 restart consulta-vehicular

# Ver uso de recursos
pm2 monit

# Actualizar código
cd /var/www/app && git pull origin main && pm2 restart consulta-vehicular
```

---

## 📞 SOPORTE

Si tienes problemas:
1. Revisa los logs: `pm2 logs consulta-vehicular`
2. Verifica .env: `cat .env | grep -v "^#" | grep -v "^$"`
3. Verifica Nginx: `nginx -t && systemctl status nginx`
4. Verifica que el servidor responde: `curl http://localhost:3000/api/health`

---

**✅ ¡Despliegue completado! Tu aplicación está actualizada y lista para recibir pagos.**
