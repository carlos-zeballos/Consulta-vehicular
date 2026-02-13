# 🚀 Comandos para Desplegar en el Servidor

## 📍 Situación Actual
Estás en el servidor (`/opt/Consulta-vehicular`) y tienes archivos sin trackear que son de prueba.

---

## ✅ PASO 1: Limpiar archivos de prueba (Recomendado)

### Opción A: Ignorarlos con .gitignore (RECOMENDADO)

```bash
cd /opt/Consulta-vehicular

# Agregar reglas al .gitignore
cat >> .gitignore << 'EOF'

# Archivos de prueba y temporales
smoke-*.js
smoke.out.txt
*.out.txt

# Scripts de proxy y pruebas MTC
mtc-*.txt
*_proxies.py
mtc_proxy_probe.py
probe_mtc_proxies.py
probed_mtc_proxies.py

# Archivos temporales
*.tmp
*.log
*.bak
EOF

# Agregar y commitear solo el .gitignore
git add .gitignore
git commit -m "chore: ignore local proxy/smoke test files"
git push origin main
```

**✅ Resultado:** Los archivos de prueba quedan ignorados y el repo queda limpio.

---

## 🔧 PASO 2: Verificar y Actualizar Variables de Entorno

```bash
cd /opt/Consulta-vehicular

# Verificar .env actual
cat .env | grep -E "BASE_URL|IZIPAY|MTC_PROXY" | head -10

# Editar .env si es necesario
nano .env
```

### 📝 Variables CRÍTICAS para verificar:

```env
# ============================================
# CONFIGURACIÓN BÁSICA
# ============================================
BASE_URL=https://consultavehicular.services
PUBLIC_BASE_URL=https://consultavehicular.services
PORT=3000
NODE_ENV=production

# ============================================
# IZIPAY - MODO TEST o PRODUCTION
# ============================================
# Para TEST:
IZIPAY_CTX_MODE=TEST
IZIPAY_TEST_KEY=tu_test_key

# Para PRODUCTION:
# IZIPAY_CTX_MODE=PRODUCTION
# IZIPAY_PROD_KEY=tu_production_key

IZIPAY_SITE_ID=tu_site_id

# ============================================
# PROXY MTC (2Captcha)
# ============================================
MTC_PROXY_HOST=na.proxy.2captcha.com
MTC_PROXY_PORT=2334
MTC_PROXY_USER=uae12c98557ca05dd-zone-custom-region-pe-session-dDCuqxdzZ-sessTime-3
MTC_PROXY_PASS=uae12c98557ca05dd
MTC_PROXY_URL=http://uae12c98557ca05dd-zone-custom-region-pe-session-dDCuqxdzZ-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334

# ============================================
# 2CAPTCHA
# ============================================
CAPTCHA_API_KEY=dd23c370d7192bfb0d8cb37188918abe
```

**💾 Guardar:** `Ctrl+O`, `Enter`, `Ctrl+X`

---

## 🔄 PASO 3: Actualizar Código y Reiniciar

```bash
cd /opt/Consulta-vehicular

# Actualizar código desde GitHub
git pull origin main

# Instalar dependencias si hay cambios
npm install --production

# Reiniciar aplicación
pm2 restart consulta-vehicular
pm2 save

# Ver logs para verificar
pm2 logs consulta-vehicular --lines 40
```

---

## ✅ PASO 4: Verificar que Todo Funciona

### 4.1 Verificar que el servidor responde:

```bash
# Desde el servidor
curl http://localhost:3000/api/health

# O desde fuera
curl https://consultavehicular.services/api/health
```

**✅ Debe devolver:** `{"ok":true}` o similar

### 4.2 Verificar configuración:

```bash
# Verificar BASE_URL
grep BASE_URL .env

# Verificar modo Izipay
grep IZIPAY_CTX_MODE .env

# Verificar proxy MTC
grep MTC_PROXY .env
```

---

## 🧪 PASO 5: Probar Pasarela de Pagos

### 5.1 Probar flujo completo:

1. **Abrir en navegador:**
   ```
   https://consultavehicular.services/comprar
   ```

2. **Completar formulario:**
   - Ingresar email
   - Hacer clic en "Pagar"

3. **Completar pago en Izipay:**
   - Usar tarjeta de prueba si estás en modo TEST
   - Completar el pago

4. **Verificar redirección:**
   - Debe redirigir a: `https://consultavehicular.services/pago-ok?orderId=...`
   - La página debe mostrar "Procesando confirmación..."

5. **Esperar confirmación:**
   - El sistema verifica cada 2 segundos
   - Cuando el IPN confirme, debe mostrar "Pago confirmado. Acceso activado."

6. **Verificar redirección final:**
   - Debe redirigir automáticamente a: `https://consultavehicular.services/result.html?token=...`

### 5.2 Ver logs en tiempo real:

```bash
# En otra terminal SSH
pm2 logs consulta-vehicular --lines 0
```

**Busca estos mensajes:**
- ✅ `[IZIPAY] init -> orderId=...` - Pago iniciado
- ✅ `[IZIPAY] return pago-ok` - Retorno de Izipay
- ✅ `[IZIPAY] ipn -> orderId=... status=PAID` - Pago confirmado
- ✅ `[IZIPAY] Acceso activado` - Token generado

---

## 🐛 Solución de Problemas

### Problema: El pago no redirige a result.html

**Solución:**
```bash
# 1. Verificar BASE_URL
grep BASE_URL .env
# Debe ser: BASE_URL=https://consultavehicular.services

# 2. Verificar logs de IPN
pm2 logs consulta-vehicular | grep IPN

# 3. Verificar que pago-ok.html existe
ls -la public/pago-ok.html

# 4. Verificar configuración de Izipay en Back Office
# La URL de IPN debe ser: https://consultavehicular.services/api/izipay/ipn
```

### Problema: Error 404 en pago-ok.html

**Solución:**
```bash
# Verificar Nginx
nginx -t
systemctl reload nginx

# Verificar que el archivo existe
ls -la public/pago-ok.html
```

### Problema: El servidor no inicia

**Solución:**
```bash
# Ver errores
pm2 logs consulta-vehicular --err

# Probar inicio manual
cd /opt/Consulta-vehicular
node server.js
# Revisar errores en la salida
```

---

## 📋 Checklist Final

- [ ] ✅ Archivos de prueba ignorados (`.gitignore` actualizado)
- [ ] ✅ Código actualizado (`git pull`)
- [ ] ✅ Variables de entorno actualizadas (`.env`)
- [ ] ✅ `BASE_URL=https://consultavehicular.services`
- [ ] ✅ `IZIPAY_CTX_MODE=TEST` (o `PRODUCTION`)
- [ ] ✅ Aplicación reiniciada (`pm2 restart`)
- [ ] ✅ Servidor responde (`curl localhost:3000/api/health`)
- [ ] ✅ Pago redirige a `pago-ok.html`
- [ ] ✅ IPN confirma el pago
- [ ] ✅ Redirección a `result.html` funciona

---

## 🎯 Resumen de Comandos Rápidos

```bash
# 1. Limpiar archivos de prueba
cd /opt/Consulta-vehicular
cat >> .gitignore << 'EOF'
smoke-*.js
smoke.out.txt
mtc-*.txt
*_proxies.py
EOF
git add .gitignore
git commit -m "chore: ignore test files"
git push origin main

# 2. Actualizar código
git pull origin main
npm install --production

# 3. Verificar .env
nano .env  # Asegúrate de que BASE_URL y IZIPAY estén correctos

# 4. Reiniciar
pm2 restart consulta-vehicular
pm2 save

# 5. Verificar
pm2 logs consulta-vehicular --lines 40
curl http://localhost:3000/api/health
```

---

**✅ ¡Listo! Tu aplicación está desplegada y lista para recibir pagos.**
