# Guía de Despliegue con Docker

## 📋 Configuración del Servidor

El servidor usa **Docker** (NO PM2) con la siguiente configuración:

- **Ubicación**: VPS Ubuntu
- **Contenedor**: `consulta-vehicular`
- **Proxy**: Nginx (puertos 80/443) → `http://127.0.0.1:8080`
- **Mapeo de puertos**: `127.0.0.1:8080:3000` (host:contenedor)
- **Puerto interno de la app**: `3000`
- **Directorio del proyecto**: `/opt/Consulta-vehicular`

---

## 🚀 Comandos de Despliegue

### Ver Estado del Contenedor
```bash
docker ps | grep consulta-vehicular
```

### Ver Logs
```bash
# Últimas 100 líneas
docker logs --tail 100 consulta-vehicular

# Logs en tiempo real
docker logs -f consulta-vehicular --tail 200

# Buscar errores
docker logs --tail 500 consulta-vehicular 2>&1 | grep -i "error\|failed\|exception" | tail -30
```

### Entrar al Contenedor
```bash
docker exec -it consulta-vehicular sh
```

### Reiniciar el Contenedor
```bash
docker restart consulta-vehicular
```

### Desplegar Nuevo Commit

```bash
# 1. Ir al directorio del proyecto
cd /opt/Consulta-vehicular

# 2. Actualizar código
git pull origin main

# 3. Construir nueva imagen
docker build -t consulta-vehicular:latest .

# 4. Detener y eliminar contenedor anterior
docker rm -f consulta-vehicular

# 5. Crear y ejecutar nuevo contenedor
docker run -d \
  --name consulta-vehicular \
  --env-file .env \
  -p 127.0.0.1:8080:3000 \
  consulta-vehicular:latest
```

### Verificar Variables de Entorno
```bash
# Ver variables dentro del contenedor
docker exec consulta-vehicular env | grep -E "CAPTCHA_API_KEY|MERCADOPAGO|PORT"

# Ver archivo .env en el host
cat /opt/Consulta-vehicular/.env | grep -E "CAPTCHA_API_KEY|MERCADOPAGO"
```

### Ver Archivos de Debug (dentro del contenedor)
```bash
docker exec consulta-vehicular ls -la /app/apeseg-debug-*.png /app/apeseg-debug-*.html 2>/dev/null
```

### Ver Procesos dentro del Contenedor
```bash
docker exec consulta-vehicular ps aux
```

---

## 🔧 Troubleshooting

### El contenedor no inicia
```bash
# Ver logs de error
docker logs consulta-vehicular

# Verificar que el puerto no esté en uso
ss -tulpn | grep 8080

# Verificar que el archivo .env existe
ls -la /opt/Consulta-vehicular/.env
```

### El contenedor se detiene inmediatamente
```bash
# Ver logs completos
docker logs consulta-vehicular

# Verificar configuración
docker inspect consulta-vehicular | grep -A 10 "Env"
```

### Verificar que Nginx está configurado correctamente
```bash
# Ver configuración de Nginx
cat /etc/nginx/sites-available/default | grep -A 5 "consulta-vehicular\|8080"

# Ver logs de Nginx
tail -f /var/log/nginx/error.log
```

### Reconstruir desde cero
```bash
cd /opt/Consulta-vehicular
docker stop consulta-vehicular
docker rm consulta-vehicular
docker rmi consulta-vehicular:latest
docker build -t consulta-vehicular:latest .
docker run -d --name consulta-vehicular --env-file .env -p 127.0.0.1:8080:3000 consulta-vehicular:latest
```

---

## 📝 Notas Importantes

1. **Mapeo de puertos**: `-p 127.0.0.1:8080:3000`
   - `127.0.0.1:8080` = Solo accesible desde localhost (Nginx)
   - `3000` = Puerto interno de la app dentro del contenedor

2. **Variables de entorno**: Se cargan desde `.env` en `/opt/Consulta-vehicular/.env`

3. **Logs**: Todos los logs se ven con `docker logs consulta-vehicular`

4. **NO usar PM2**: El servidor NO tiene PM2 instalado. Todo se maneja con Docker.

---

## 🔍 Verificación Post-Despliegue

```bash
# 1. Verificar que el contenedor está corriendo
docker ps | grep consulta-vehicular

# 2. Verificar que responde
curl http://127.0.0.1:8080

# 3. Ver logs recientes
docker logs --tail 50 consulta-vehicular

# 4. Verificar que Nginx puede acceder
curl http://localhost:8080
```

---

**Última actualización**: Febrero 2026
