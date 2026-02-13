# 🔧 Solución: El Servidor No Está Usando el Código Actualizado

## 🎯 Problema
El sitio `https://consultavehicular.services/` no está usando el código más reciente subido a GitHub.

---

## ✅ SOLUCIÓN PASO A PASO

### Paso 1: Conectarse al Servidor

```bash
ssh root@217.216.87.255
```

### Paso 2: Ir al Directorio del Proyecto

```bash
cd /opt/Consulta-vehicular
# O si está en otro lugar:
# cd /var/www/app
```

### Paso 3: Verificar Estado del Código

```bash
# Ver último commit local
git log --oneline -1

# Ver último commit en GitHub
git fetch origin
git log origin/main --oneline -1

# Comparar
git status
```

**Si dice "Your branch is behind 'origin/main'", necesitas actualizar.**

### Paso 4: Actualizar Código desde GitHub

```bash
# Asegurarse de estar en la rama main
git checkout main

# Actualizar código
git pull origin main

# Verificar que se actualizó
git log --oneline -1
```

**✅ Debe mostrar el último commit:** "Ajustar todos los endpoints para devolver 200 con ok: true incluso sin datos"

### Paso 5: Instalar Dependencias (si hay cambios)

```bash
npm install --production
```

### Paso 6: Reiniciar la Aplicación

```bash
# Reiniciar con PM2
pm2 restart consulta-vehicular

# Guardar configuración
pm2 save

# Ver estado
pm2 status
```

### Paso 7: Verificar que Funciona

```bash
# Ver logs
pm2 logs consulta-vehicular --lines 40

# Verificar que responde
curl http://localhost:3000/api/health

# Debe devolver: {"ok":true} o similar
```

### Paso 8: Verificar Variables de Entorno

```bash
# Verificar BASE_URL
grep BASE_URL .env

# Debe mostrar: BASE_URL=https://consultavehicular.services

# Verificar otras variables importantes
grep IZIPAY_CTX_MODE .env
grep PORT .env
```

---

## 🔍 VERIFICACIÓN ADICIONAL

### Verificar que el Código Está Actualizado

```bash
# Verificar que server.js tiene los cambios recientes
grep "ok: true" server.js | head -5

# Verificar que pago-ok.html existe y tiene la lógica de redirección
grep "result.html" public/pago-ok.html
```

### Verificar Nginx (si usa reverse proxy)

```bash
# Verificar configuración
nginx -t

# Recargar si es necesario
systemctl reload nginx

# Ver logs
tail -f /var/log/nginx/consulta-vehicular-error.log
```

---

## 🐛 Si Aún No Funciona

### Problema 1: PM2 no está corriendo

```bash
# Ver estado
pm2 status

# Si no está corriendo, iniciarlo
pm2 start server.js --name "consulta-vehicular" --cwd /opt/Consulta-vehicular
pm2 save
```

### Problema 2: El código se actualizó pero no se reinició

```bash
# Forzar reinicio completo
pm2 delete consulta-vehicular
pm2 start server.js --name "consulta-vehicular" --cwd /opt/Consulta-vehicular
pm2 save
```

### Problema 3: Hay errores en el código

```bash
# Probar inicio manual para ver errores
cd /opt/Consulta-vehicular
node server.js

# Revisar errores en la salida
# Presionar Ctrl+C para detener
```

### Problema 4: Cache del navegador

**Solución:** Limpiar cache del navegador o usar modo incógnito.

---

## 📋 COMANDOS RÁPIDOS (Todo en Uno)

```bash
cd /opt/Consulta-vehicular
git fetch origin
git pull origin main
npm install --production
pm2 restart consulta-vehicular
pm2 save
pm2 logs consulta-vehicular --lines 40
```

---

## ✅ CHECKLIST DE VERIFICACIÓN

- [ ] ✅ Código actualizado (`git pull origin main`)
- [ ] ✅ Último commit visible (`git log --oneline -1`)
- [ ] ✅ Dependencias instaladas (`npm install`)
- [ ] ✅ Aplicación reiniciada (`pm2 restart`)
- [ ] ✅ PM2 muestra estado "online"
- [ ] ✅ Servidor responde (`curl localhost:3000/api/health`)
- [ ] ✅ BASE_URL correcto en `.env`
- [ ] ✅ Nginx recargado (si aplica)

---

## 🔄 Script Automático

Puedes usar este script para verificar y actualizar automáticamente:

```bash
cd /opt/Consulta-vehicular
bash verificar-despliegue-servidor.sh
```

---

**✅ Después de estos pasos, el sitio debería estar usando el código actualizado.**
