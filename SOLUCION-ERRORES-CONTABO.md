# Solución de Errores: ERR_CONNECTION_REFUSED en Contabo

## Problema
El frontend muestra errores `ERR_CONNECTION_REFUSED` en `:3000/api/*` cuando se despliega en Contabo.

## Causas Posibles

### 1. El servidor Node.js no está corriendo
El servidor debe estar ejecutándose con PM2 en el puerto 3000.

**Verificar:**
```bash
# Conectarse al servidor VPS
ssh root@tu-ip-contabo

# Verificar si PM2 está corriendo
pm2 list

# Verificar si el proceso está activo
pm2 status

# Ver logs del servidor
pm2 logs server
```

**Si no está corriendo, iniciarlo:**
```bash
cd /ruta/a/tu/proyecto
pm2 start server.js --name server
pm2 save
pm2 startup
```

### 2. Nginx no está configurado correctamente
Nginx debe hacer proxy de las peticiones al puerto 3000.

**Verificar configuración de Nginx:**
```bash
# Ver configuración actual
cat /etc/nginx/sites-available/tu-dominio

# Debe tener algo como esto:
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

**Si no está configurado, crear/editar:**
```bash
sudo nano /etc/nginx/sites-available/tu-dominio
```

**Probar y recargar Nginx:**
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Firewall bloqueando el puerto 3000
El firewall debe permitir conexiones al puerto 3000 (aunque normalmente solo Nginx debería acceder).

**Verificar UFW:**
```bash
sudo ufw status
```

**Si el puerto 3000 está bloqueado (no debería ser necesario abrirlo si usas Nginx):**
```bash
# Solo si es necesario (normalmente NO se necesita)
sudo ufw allow 3000/tcp
```

### 4. El servidor está escuchando en la IP incorrecta
El servidor debe escuchar en `0.0.0.0` o `localhost`, no en una IP específica.

**Verificar en server.js:**
```javascript
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor activo en http://0.0.0.0:${PORT}`);
});
```

O simplemente:
```javascript
app.listen(PORT, () => {
  console.log(`✅ Servidor activo en http://localhost:${PORT}`);
});
```

### 5. Variables de entorno no configuradas
Verificar que el archivo `.env` existe y tiene todas las variables necesarias.

**Verificar:**
```bash
cd /ruta/a/tu/proyecto
cat .env
```

**Si falta, crear:**
```bash
nano .env
```

**Variables mínimas necesarias:**
```env
PORT=3000
FACTILIZA_TOKEN=Bearer tu-token
MCW_API_USER=88791260
MCW_API_PASSWORD=tu_password_api
MCW_PUBLIC_KEY=tu_public_key
MCW_HMAC_KEY=tu_hmac_key
MCW_RETURN_OK=https://tu-dominio.com/pago-ok
MCW_RETURN_KO=https://tu-dominio.com/pago-error
MCW_IPN_URL=https://tu-dominio.com/api/payments/mcw/ipn
PUBLIC_BASE_URL=https://tu-dominio.com
```

### 6. El frontend está usando URLs absolutas con puerto
El frontend NO debe usar URLs con `:3000`. Debe usar rutas relativas como `/api/soat`.

**Verificar en el código:**
- ✅ Correcto: `fetch('/api/soat', ...)`
- ❌ Incorrecto: `fetch('http://tu-dominio.com:3000/api/soat', ...)`
- ❌ Incorrecto: `fetch('localhost:3000/api/soat', ...)`

## Solución Paso a Paso

### Paso 1: Verificar que el servidor está corriendo
```bash
pm2 list
pm2 logs server --lines 50
```

Si no está corriendo:
```bash
cd /ruta/a/tu/proyecto
pm2 start server.js --name server
pm2 save
```

### Paso 2: Verificar Nginx
```bash
sudo nginx -t
sudo systemctl status nginx
```

Si hay errores, revisar la configuración:
```bash
sudo nano /etc/nginx/sites-available/tu-dominio
```

### Paso 3: Verificar que el servidor responde localmente
```bash
curl http://localhost:3000/api/health
```

Debería responder con `{"message":"Servidor operativo"}`.

### Paso 4: Verificar que Nginx hace proxy correctamente
```bash
curl http://localhost/api/health
```

Debería responder igual que el paso anterior.

### Paso 5: Verificar desde el navegador
Abrir `https://tu-dominio.com/api/health` en el navegador. Debe responder con JSON.

## Comandos de Diagnóstico Rápido

```bash
# 1. Verificar PM2
pm2 list && pm2 logs server --lines 20

# 2. Verificar Nginx
sudo systemctl status nginx && sudo nginx -t

# 3. Verificar puerto 3000
netstat -tulpn | grep 3000
# O
ss -tulpn | grep 3000

# 4. Probar servidor localmente
curl http://localhost:3000/api/health

# 5. Ver logs de Nginx
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

## Notas Importantes

1. **NO abrir el puerto 3000 en el firewall** - Solo Nginx debe acceder a él.
2. **Usar HTTPS** - Configurar SSL con Certbot para producción.
3. **Rutas relativas** - El frontend debe usar `/api/*`, no `http://dominio.com:3000/api/*`.
4. **PM2 debe iniciarse automáticamente** - Usar `pm2 startup` y `pm2 save`.

## Si el Problema Persiste

1. Verificar logs completos:
   ```bash
   pm2 logs server --lines 100
   sudo tail -100 /var/log/nginx/error.log
   ```

2. Verificar que el código está actualizado:
   ```bash
   cd /ruta/a/tu/proyecto
   git pull
   npm install
   pm2 restart server
   ```

3. Verificar que no hay procesos duplicados:
   ```bash
   ps aux | grep node
   pm2 delete all
   pm2 start server.js --name server
   ```
