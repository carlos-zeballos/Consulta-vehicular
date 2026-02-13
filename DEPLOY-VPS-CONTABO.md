# 🚀 Guía de Despliegue en VPS Contabo - Producción

## 📋 INFORMACIÓN DEL SERVIDOR
- **IP:** 217.216.87.255
- **Usuario:** root
- **Puerto SSH:** 22
- **Repositorio:** https://github.com/carlos-zeballos/Consulta-vehicular.git

---

## PASO 1: CONECTARSE POR SSH DESDE WINDOWS (PowerShell)

```powershell
ssh root@217.216.87.255
```

**✅ Validación:** Deberías ver el prompt del servidor Linux.

---

## PASO 2: ACTUALIZAR SISTEMA

```bash
# Actualizar lista de paquetes
apt update

# Actualizar sistema
apt upgrade -y

# Limpiar paquetes innecesarios
apt autoremove -y
apt autoclean
```

**✅ Validación:** Debe completar sin errores.

---

## PASO 3: INSTALAR HERRAMIENTAS BÁSICAS

```bash
apt install -y curl git ufw unzip build-essential software-properties-common
```

**✅ Validación:** Verificar instalación:
```bash
curl --version
git --version
ufw --version
```

---

## PASO 4: INSTALAR NODE.JS LTS (v20.x - Recomendado)

```bash
# Instalar Node.js 20.x LTS usando NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verificar instalación
node --version
npm --version
```

**✅ Validación:** Debe mostrar:
- `node` versión v20.x.x
- `npm` versión 10.x.x o superior

---

## PASO 5: INSTALAR PM2 GLOBALMENTE

```bash
npm install -g pm2
pm2 --version
```

**✅ Validación:** Debe mostrar la versión de PM2.

---

## PASO 6: CREAR CARPETA Y CLONAR PROYECTO

```bash
# Crear directorio
mkdir -p /var/www/app
cd /var/www/app

# Clonar repositorio
git clone https://github.com/carlos-zeballos/Consulta-vehicular.git .

# Verificar que se clonó correctamente
ls -la
```

**✅ Validación:** Debes ver archivos como `server.js`, `package.json`, etc.

---

## PASO 7: INSTALAR DEPENDENCIAS

```bash
cd /var/www/app/CONSULTA-VEHICULARES

# Instalar dependencias (esto puede tardar varios minutos)
npm install

# Si hay errores con playwright/puppeteer, instalar dependencias del sistema
apt install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0
```

**✅ Validación:** Debe completar sin errores críticos. Verificar:
```bash
ls node_modules | head -10
```

---

## PASO 8: CONFIGURAR ARCHIVO .ENV

```bash
cd /var/www/app/CONSULTA-VEHICULARES

# Crear archivo .env desde el ejemplo
cp env.example.txt .env

# Editar .env con nano
nano .env
```

**📝 Configuración mínima requerida en .env:**

```env
# Puerto del servidor
PORT=3000

# Entorno
NODE_ENV=production

# MiCuentaWeb / Izipay
MCW_API_USER=88791260
MCW_API_PASSWORD=tu_password_api
MCW_PUBLIC_KEY=tu_public_key
MCW_HMAC_KEY=tu_hmac_key
MCW_RETURN_OK=https://tu-dominio.com/pago-ok
MCW_RETURN_KO=https://tu-dominio.com/pago-error
MCW_IPN_URL=https://tu-dominio.com/api/payments/mcw/ipn

# 2Captcha (opcional pero recomendado)
CAPTCHA_API_KEY=tu_api_key_de_2captcha

# Factiliza (si lo usas)
FACTILIZA_TOKEN=Bearer tu_token_aqui

# URL Base Pública (IMPORTANTE: cambiar cuando tengas dominio)
PUBLIC_BASE_URL=http://217.216.87.255

# Cupones (opcional)
COUPON_ADMIN_CODE=ADMIN-XXXX-ROOT
COUPONS_PUBLIC_CODES=
COUPON_HASH_SALT=cambia_esto_en_produccion
```

**💾 Guardar:** `Ctrl+O`, luego `Enter`, luego `Ctrl+X`

**✅ Validación:** Verificar que el archivo existe:
```bash
cat .env | grep -v "^#" | grep -v "^$"
```

---

## PASO 9: PROBAR QUE EL SERVIDOR INICIA

```bash
cd /var/www/app/CONSULTA-VEHICULARES

# Probar inicio manual (Ctrl+C para detener)
node server.js
```

**✅ Validación:** Debe mostrar mensaje como "Servidor activo en http://localhost:3000"

**🛑 Detener:** `Ctrl+C`

---

## PASO 10: CONFIGURAR PM2 COMO SERVICIO

```bash
cd /var/www/app/CONSULTA-VEHICULARES

# Iniciar aplicación con PM2
pm2 start server.js --name "consulta-vehicular" --cwd /var/www/app/CONSULTA-VEHICULARES

# Guardar configuración para que persista en reinicios
pm2 save

# Configurar PM2 para iniciar al arrancar el sistema
pm2 startup systemd -u root --hp /root

# El comando anterior mostrará un comando, EJECUTARLO (será algo como):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root
```

**✅ Validación:**
```bash
# Ver estado
pm2 status

# Ver logs
pm2 logs consulta-vehicular --lines 50

# Verificar que está corriendo
pm2 list
```

---

## PASO 11: INSTALAR Y CONFIGURAR NGINX

```bash
# Instalar Nginx
apt install -y nginx

# Iniciar y habilitar Nginx
systemctl start nginx
systemctl enable nginx

# Verificar estado
systemctl status nginx
```

**✅ Validación:** Debe mostrar "active (running)"

---

## PASO 12: CONFIGURAR NGINX COMO REVERSE PROXY

```bash
# Crear configuración del sitio
nano /etc/nginx/sites-available/consulta-vehicular
```

**📝 Pegar esta configuración:**

```nginx
server {
    listen 80;
    server_name 217.216.87.255;

    # Tamaño máximo de archivos subidos
    client_max_body_size 50M;

    # Logs
    access_log /var/log/nginx/consulta-vehicular-access.log;
    error_log /var/log/nginx/consulta-vehicular-error.log;

    # Root del frontend
    root /var/www/app/CONSULTA-VEHICULARES/public;
    index index.html;

    # Servir archivos estáticos
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy para API
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }

    # Proxy para otros endpoints
    location /checkout {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy para result.html
    location /result.html {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**💾 Guardar:** `Ctrl+O`, `Enter`, `Ctrl+X`

```bash
# Crear enlace simbólico
ln -s /etc/nginx/sites-available/consulta-vehicular /etc/nginx/sites-enabled/

# Eliminar configuración por defecto (opcional)
rm /etc/nginx/sites-enabled/default

# Probar configuración
nginx -t

# Recargar Nginx
systemctl reload nginx
```

**✅ Validación:**
```bash
# Verificar que Nginx está corriendo
systemctl status nginx

# Verificar configuración
nginx -t
```

---

## PASO 13: CONFIGURAR FIREWALL UFW

```bash
# Habilitar UFW
ufw --force enable

# Permitir SSH (IMPORTANTE: hacerlo primero)
ufw allow 22/tcp

# Permitir HTTP y HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Ver estado
ufw status verbose
```

**✅ Validación:** Debe mostrar:
- 22/tcp ALLOW
- 80/tcp ALLOW
- 443/tcp ALLOW

---

## PASO 14: VERIFICAR QUE FUNCIONA POR IP

```bash
# Desde tu computadora Windows, abrir navegador y probar:
# http://217.216.87.255
```

**✅ Validación:** Debe cargar la página de inicio.

**🔍 Verificar desde el servidor:**
```bash
curl http://localhost:3000/api/health
curl http://localhost
```

---

## PASO 15: PREPARAR PARA DOMINIO

**📋 INSTRUCCIONES PARA EL PROGRAMADOR DEL DOMINIO:**

1. **Acceder al panel de DNS del dominio** (donde compraste el dominio)

2. **Configurar registros DNS:**
   ```
   Tipo: A
   Nombre: @ (o dejar vacío, según el panel)
   Valor: 217.216.87.255
   TTL: 3600 (o automático)
   
   Tipo: A
   Nombre: www
   Valor: 217.216.87.255
   TTL: 3600 (o automático)
   ```

3. **Esperar propagación DNS** (puede tardar de 5 minutos a 48 horas, normalmente 1-2 horas)

4. **Verificar que el dominio apunta correctamente:**
   ```powershell
   # Desde Windows PowerShell
   nslookup tudominio.com
   nslookup www.tudominio.com
   ```
   Ambos deben mostrar: `217.216.87.255`

---

## PASO 16: ACTUALIZAR .ENV CON DOMINIO

**⚠️ IMPORTANTE: Solo hacer esto DESPUÉS de que el dominio apunte al servidor**

```bash
cd /var/www/app/CONSULTA-VEHICULARES
nano .env
```

**📝 Actualizar:**
```env
PUBLIC_BASE_URL=https://tudominio.com
```

**💾 Guardar y reiniciar PM2:**
```bash
pm2 restart consulta-vehicular
```

---

## PASO 17: INSTALAR SSL CON CERTBOT (Let's Encrypt)

**⚠️ SOLO EJECUTAR CUANDO EL DOMINIO YA APUNTE AL SERVIDOR**

```bash
# Instalar Certbot
apt install -y certbot python3-certbot-nginx

# Obtener certificado SSL (reemplazar tudominio.com con tu dominio real)
certbot --nginx -d tudominio.com -d www.tudominio.com

# Seguir las instrucciones interactivas:
# - Email: tu email
# - Aceptar términos: Y
# - Compartir email: N (o Y si quieres)
# - Redirigir HTTP a HTTPS: 2 (redirigir)
```

**✅ Validación:**
```bash
# Verificar certificado
certbot certificates

# Probar renovación manual
certbot renew --dry-run
```

---

## PASO 18: CONFIGURAR RENOVACIÓN AUTOMÁTICA

```bash
# Certbot ya crea un timer automático, verificar:
systemctl status certbot.timer

# Si no está activo, habilitarlo:
systemctl enable certbot.timer
systemctl start certbot.timer
```

**✅ Validación:**
```bash
systemctl list-timers | grep certbot
```

---

## PASO 19: ACTUALIZAR NGINX PARA HTTPS

Certbot debería haber actualizado automáticamente `/etc/nginx/sites-available/consulta-vehicular`, pero verificar:

```bash
nano /etc/nginx/sites-available/consulta-vehicular
```

**📝 Debe tener algo como esto:**

```nginx
server {
    listen 80;
    server_name tudominio.com www.tudominio.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tudominio.com www.tudominio.com;

    ssl_certificate /etc/letsencrypt/live/tudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tudominio.com/privkey.pem;
    
    # Configuración SSL segura
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # ... resto de la configuración igual que antes ...
}
```

**💾 Guardar y recargar:**
```bash
nginx -t
systemctl reload nginx
```

---

## PASO 20: SEGURIDAD BÁSICA

### 20.1: Crear usuario sudo (recomendado)

```bash
# Crear nuevo usuario
adduser deploy

# Agregar a grupo sudo
usermod -aG sudo deploy

# Configurar SSH para el nuevo usuario
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null || echo "No hay keys SSH configuradas"
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys 2>/dev/null || true
```

### 20.2: Instalar Fail2Ban

```bash
apt install -y fail2ban

# Crear configuración local
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Editar configuración
nano /etc/fail2ban/jail.local
```

**📝 Buscar y configurar:**
```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
```

**💾 Guardar y reiniciar:**
```bash
systemctl restart fail2ban
systemctl enable fail2ban
```

**✅ Validación:**
```bash
fail2ban-client status
fail2ban-client status sshd
```

### 20.3: Deshabilitar login root por SSH (OPCIONAL pero recomendado)

**⚠️ IMPORTANTE: Solo hacer esto DESPUÉS de crear usuario sudo y verificar que puedes conectarte con él**

```bash
nano /etc/ssh/sshd_config
```

**📝 Buscar y cambiar:**
```
PermitRootLogin no
```

**💾 Guardar y reiniciar SSH:**
```bash
systemctl restart sshd
```

**✅ Validación:** Intentar conectarse con el nuevo usuario:
```bash
# Desde otra terminal (no cerrar la actual hasta verificar)
ssh deploy@217.216.87.255
```

---

## PASO 21: CONFIGURAR LOGS Y MONITOREO

```bash
# Ver logs de PM2
pm2 logs consulta-vehicular --lines 100

# Ver logs de Nginx
tail -f /var/log/nginx/consulta-vehicular-access.log
tail -f /var/log/nginx/consulta-vehicular-error.log

# Configurar rotación de logs de PM2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 📋 CHECKLIST FINAL

- [ ] ✅ Sistema actualizado
- [ ] ✅ Node.js 20.x instalado
- [ ] ✅ PM2 instalado y configurado
- [ ] ✅ Aplicación corriendo con PM2
- [ ] ✅ PM2 configurado para iniciar al arrancar
- [ ] ✅ Nginx instalado y configurado
- [ ] ✅ Firewall UFW configurado (puertos 22, 80, 443)
- [ ] ✅ Aplicación accesible por IP HTTP
- [ ] ✅ Dominio configurado en DNS (A records)
- [ ] ✅ SSL instalado con Certbot
- [ ] ✅ HTTPS funcionando
- [ ] ✅ Renovación automática SSL configurada
- [ ] ✅ Fail2Ban instalado y activo
- [ ] ✅ Usuario sudo creado (opcional)
- [ ] ✅ Logs configurados

---

## 🔧 COMANDOS ÚTILES DE MANTENIMIENTO

```bash
# Reiniciar aplicación
pm2 restart consulta-vehicular

# Ver estado de PM2
pm2 status

# Ver logs en tiempo real
pm2 logs consulta-vehicular

# Reiniciar Nginx
systemctl restart nginx

# Ver estado de servicios
systemctl status nginx
systemctl status pm2-root

# Ver uso de recursos
htop
# o
top

# Ver espacio en disco
df -h

# Ver memoria
free -h
```

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### La aplicación no inicia:
```bash
cd /var/www/app/CONSULTA-VEHICULARES
node server.js
# Revisar errores en la salida
```

### Nginx no funciona:
```bash
nginx -t
systemctl status nginx
tail -f /var/log/nginx/error.log
```

### PM2 no inicia al reiniciar:
```bash
pm2 startup systemd -u root --hp /root
# Ejecutar el comando que muestra
pm2 save
```

### Certificado SSL no se renueva:
```bash
certbot renew --dry-run
systemctl status certbot.timer
```

---

## 📞 SOPORTE

Si tienes problemas, revisa los logs:
- **PM2:** `pm2 logs consulta-vehicular`
- **Nginx:** `/var/log/nginx/consulta-vehicular-error.log`
- **Sistema:** `journalctl -xe`

---

**✅ ¡Despliegue completado! Tu aplicación está en producción.**
