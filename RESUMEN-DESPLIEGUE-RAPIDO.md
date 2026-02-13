# 🚀 Resumen Rápido: Desplegar Actualización en Servidor

## ⚡ Pasos Rápidos (5 minutos)

### 1️⃣ Conectarse al servidor
```bash
ssh root@217.216.87.255
```

### 2️⃣ Ir al directorio del proyecto
```bash
cd /var/www/app
# O si está en otro lugar:
# cd /opt/Consulta-vehicular
```

### 3️⃣ Actualizar código desde GitHub
```bash
git pull origin main
```

### 4️⃣ Actualizar variables de entorno
```bash
nano .env
```

**IMPORTANTE:** Asegúrate de que estas variables estén configuradas:

```env
BASE_URL=https://consultavehicular.services
PUBLIC_BASE_URL=https://consultavehicular.services
PORT=3000

# Izipay (Pasarela de Pagos)
IZIPAY_SITE_ID=tu_site_id
IZIPAY_CTX_MODE=PRODUCTION
IZIPAY_PROD_KEY=tu_production_key

# O MiCuentaWeb
MCW_RETURN_OK=https://consultavehicular.services/pago-ok
MCW_RETURN_KO=https://consultavehicular.services/pago-error
MCW_IPN_URL=https://consultavehicular.services/api/payments/mcw/ipn
```

**💾 Guardar:** `Ctrl+O`, `Enter`, `Ctrl+X`

### 5️⃣ Instalar dependencias (si hay cambios)
```bash
npm install --production
```

### 6️⃣ Reiniciar aplicación
```bash
pm2 restart consulta-vehicular
# O si no existe:
pm2 start server.js --name "consulta-vehicular" --cwd /var/www/app
pm2 save
```

### 7️⃣ Verificar que funciona
```bash
# Ver logs
pm2 logs consulta-vehicular --lines 20

# Verificar que responde
curl http://localhost:3000/api/health
```

---

## ✅ Verificar Pasarela de Pagos

### 1. Probar flujo completo:
1. Abre: `https://consultavehicular.services/comprar`
2. Completa el formulario y haz clic en "Pagar"
3. Completa el pago en Izipay
4. **Debe redirigir a:** `https://consultavehicular.services/pago-ok?orderId=...`
5. Espera confirmación (máximo 2 minutos)
6. **Debe redirigir automáticamente a:** `https://consultavehicular.services/result.html?token=...`

### 2. Ver logs en tiempo real:
```bash
pm2 logs consulta-vehicular --lines 0
```

**Busca estos mensajes:**
- ✅ `[IZIPAY] init -> orderId=...` - Pago iniciado
- ✅ `[IZIPAY] return pago-ok` - Retorno de Izipay
- ✅ `[IZIPAY] ipn -> orderId=... status=PAID` - Pago confirmado
- ✅ `[IZIPAY] Acceso activado` - Token generado

---

## 🐛 Si algo no funciona

### El pago no redirige a result.html:
```bash
# Verificar BASE_URL
grep BASE_URL .env

# Verificar logs de IPN
pm2 logs consulta-vehicular | grep IPN

# Verificar que pago-ok.html existe
ls -la public/pago-ok.html
```

### El servidor no inicia:
```bash
# Ver errores
pm2 logs consulta-vehicular --err

# Probar manualmente
cd /var/www/app
node server.js
```

---

## 📋 Checklist Final

- [ ] Código actualizado (`git pull`)
- [ ] Variables de entorno actualizadas (`.env`)
- [ ] `BASE_URL=https://consultavehicular.services`
- [ ] Aplicación reiniciada (`pm2 restart`)
- [ ] Servidor responde (`curl localhost:3000/api/health`)
- [ ] Pago redirige a `pago-ok.html`
- [ ] IPN confirma el pago
- [ ] Redirección a `result.html` funciona

---

**✅ ¡Listo! Tu aplicación está actualizada y lista para recibir pagos.**
