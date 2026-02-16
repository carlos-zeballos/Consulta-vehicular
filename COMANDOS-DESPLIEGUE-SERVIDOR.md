# Comandos de Despliegue en el Servidor

## 🚀 Despliegue Rápido (Un Solo Comando)

```bash
ssh root@217.216.87.255 "cd /opt/Consulta-vehicular && git pull origin main && docker build -t consulta-vehicular:latest . && docker rm -f consulta-vehicular && docker run -d --name consulta-vehicular --env-file .env -p 127.0.0.1:8080:3000 consulta-vehicular:latest"
```

**Contraseña SSH**: `tg4VBxwU7SCG`

---

## 📋 Despliegue Paso a Paso

### 1. Conectarse al servidor
```bash
ssh root@217.216.87.255
```
**Contraseña**: `tg4VBxwU7SCG`

### 2. Ir al directorio del proyecto
```bash
cd /opt/Consulta-vehicular
```

### 3. Actualizar código desde GitHub
```bash
git pull origin main
```

### 4. Construir nueva imagen Docker
```bash
docker build -t consulta-vehicular:latest .
```

### 5. Detener y eliminar contenedor anterior
```bash
docker rm -f consulta-vehicular
```

### 6. Crear y ejecutar nuevo contenedor
```bash
docker run -d \
  --name consulta-vehicular \
  --env-file .env \
  -p 127.0.0.1:8080:3000 \
  consulta-vehicular:latest
```

---

## ✅ Verificación Post-Despliegue

### Verificar que el contenedor está corriendo
```bash
docker ps | grep consulta-vehicular
```

### Ver logs en tiempo real
```bash
docker logs -f consulta-vehicular --tail 200
```

### Verificar que responde
```bash
curl http://127.0.0.1:8080
```

### Verificar variables de entorno
```bash
docker exec consulta-vehicular env | grep -E "CAPTCHA_API_KEY|MERCADOPAGO|PORT"
```

---

## 🔧 Troubleshooting

### Si el contenedor no inicia
```bash
# Ver logs de error
docker logs consulta-vehicular

# Verificar que el puerto no esté en uso
ss -tulpn | grep 8080
```

### Si hay problemas con el build
```bash
# Limpiar imágenes antiguas
docker system prune -f

# Reconstruir desde cero
docker build --no-cache -t consulta-vehicular:latest .
```

### Si necesitas entrar al contenedor
```bash
docker exec -it consulta-vehicular sh
```

---

## 📝 Notas Importantes

- **Mapeo de puertos**: `127.0.0.1:8080:3000`
  - `127.0.0.1:8080` = Solo accesible desde localhost (Nginx)
  - `3000` = Puerto interno de la app dentro del contenedor

- **Variables de entorno**: Se cargan desde `.env` en `/opt/Consulta-vehicular/.env`

- **Nginx**: Hace proxy_pass a `http://127.0.0.1:8080`

---

**Última actualización**: Febrero 2026
