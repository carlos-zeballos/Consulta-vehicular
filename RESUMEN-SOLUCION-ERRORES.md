# Resumen de Soluciones Aplicadas

## Problema 1: Error 405 en localhost para /api/soat y /api/vehiculo

### ✅ Solución Aplicada:
1. **Eliminados endpoints duplicados** - Había dos definiciones de `/api/soat` y `/api/vehiculo` que causaban conflictos.
2. **Aumentado timeout del endpoint de vehículo** - De 60s a 300s (5 minutos) para coincidir con la configuración anterior.

### ⚠️ Nota Importante:
El error 405 que aparece viene de la **API de Factiliza**, no del servidor. Esto significa:
- El servidor está funcionando correctamente
- La petición llega al servidor
- El servidor hace la petición a Factiliza
- **Factiliza responde con 405** (Method Not Allowed)

**Posibles causas:**
1. `FACTILIZA_TOKEN` no está configurado en el archivo `.env`
2. El token no es válido o ha expirado
3. La API de Factiliza cambió y ahora requiere otro método HTTP

**Solución:**
Verificar que el archivo `.env` tiene:
```env
FACTILIZA_TOKEN=Bearer tu_token_aqui
```

Si el token está configurado y sigue dando 405, contactar con Factiliza para verificar:
- Si el token es válido
- Si la API cambió de método HTTP
- Si hay algún problema con la cuenta

---

## Problema 2: ERR_CONNECTION_REFUSED en Contabo

### ✅ Solución Aplicada:
1. **Creado documento de diagnóstico** - `SOLUCION-ERRORES-CONTABO.md` con pasos detallados.

### 🔍 Diagnóstico:
El error `ERR_CONNECTION_REFUSED` en `:3000/api/*` indica que:
- El servidor Node.js no está corriendo en el puerto 3000
- O Nginx no está configurado correctamente para hacer proxy
- O el firewall está bloqueando las conexiones

### 📋 Pasos para Solucionar en Contabo:

#### 1. Verificar que PM2 está corriendo:
```bash
ssh root@tu-ip-contabo
pm2 list
pm2 logs server --lines 50
```

Si no está corriendo:
```bash
cd /ruta/a/tu/proyecto
pm2 start server.js --name server
pm2 save
```

#### 2. Verificar configuración de Nginx:
```bash
sudo cat /etc/nginx/sites-available/tu-dominio
```

Debe tener:
```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 3. Verificar que el servidor responde localmente:
```bash
curl http://localhost:3000/api/health
```

Debería responder: `{"message":"Servidor operativo"}`

#### 4. Recargar Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

#### 5. Verificar variables de entorno:
```bash
cd /ruta/a/tu/proyecto
cat .env
```

Debe tener al menos:
```env
PORT=3000
FACTILIZA_TOKEN=Bearer tu-token
PUBLIC_BASE_URL=https://tu-dominio.com
```

---

## Cambios Realizados en el Código

1. **Eliminados endpoints duplicados** (líneas 4363-4420):
   - `/api/soat` duplicado eliminado
   - `/api/vehiculo` duplicado eliminado
   - Mantenidos los endpoints originales (líneas 896 y 923)

2. **Aumentado timeout del endpoint de vehículo**:
   - De 60s a 300s (5 minutos)

3. **Creados documentos de ayuda**:
   - `SOLUCION-ERRORES-CONTABO.md` - Guía completa para diagnosticar problemas en Contabo
   - `RESUMEN-SOLUCION-ERRORES.md` - Este documento

---

## Próximos Pasos

1. **En localhost:**
   - Verificar que el archivo `.env` tiene `FACTILIZA_TOKEN` configurado
   - Si el token está configurado y sigue dando 405, verificar con Factiliza

2. **En Contabo:**
   - Seguir los pasos en `SOLUCION-ERRORES-CONTABO.md`
   - Verificar que PM2 está corriendo
   - Verificar que Nginx está configurado correctamente
   - Verificar que el servidor responde localmente

---

## Comandos de Diagnóstico Rápido

```bash
# Verificar PM2
pm2 list && pm2 logs server --lines 20

# Verificar Nginx
sudo systemctl status nginx && sudo nginx -t

# Verificar puerto 3000
netstat -tulpn | grep 3000

# Probar servidor localmente
curl http://localhost:3000/api/health

# Ver logs de Nginx
sudo tail -f /var/log/nginx/error.log
```
