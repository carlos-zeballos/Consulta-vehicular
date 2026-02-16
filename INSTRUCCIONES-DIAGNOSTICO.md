# Instrucciones para Diagnosticar el Servidor

## 🔧 Correcciones Realizadas

### 1. **Manejo de Arrays Vacíos Interceptados**
- **Problema**: Cuando se interceptaba un array vacío `[]`, el código seguía intentando extraer del DOM
- **Solución**: Ahora retorna vacío inmediatamente si se intercepta un array vacío
- **Archivo**: `apeseg-soat-scraper.js` (líneas ~560 y ~1026)

### 2. **Timeouts Aumentados** (ya realizados anteriormente)
- Captcha: 5 minutos
- Espera en DOM: 3 minutos
- Timeout total: 8 minutos

### 3. **Eliminación de Error Prematuro**
- Ya no se lanza `APESEG_NO_CONFIRMATION` que causaba "empty" prematuro

---

## 📋 Cómo Ejecutar el Diagnóstico

### Opción 1: Script Automático (Recomendado)

1. Abre PowerShell en el directorio del proyecto:
   ```powershell
   cd "C:\PROYECTOS ZEBWARE\clon de repositorio vehicular\Consulta-vehicular"
   ```

2. Ejecuta el script de diagnóstico:
   ```powershell
   .\diagnostico-servidor.ps1
   ```

3. Cuando se te pida la contraseña SSH, ingresa: `tg4VBxwU7SCG`

### Opción 2: Comandos Manuales

Si prefieres ejecutar comandos manualmente, copia y pega estos comandos uno por uno:

```bash
# 1. Conectarse al servidor
ssh root@217.216.87.255

# 2. Una vez conectado, ejecutar:
cd /opt/Consulta-vehicular

# 3. Ver estado del contenedor Docker
docker ps | grep consulta-vehicular

# 4. Ver logs recientes
docker logs --tail 100 consulta-vehicular

# 5. Ver errores específicos
docker logs --tail 500 consulta-vehicular 2>&1 | grep -i "error\|failed\|exception" | tail -30

# 6. Verificar configuración (dentro del contenedor)
docker exec consulta-vehicular env | grep -E "CAPTCHA_API_KEY|MERCADOPAGO"

# 7. Ver procesos Node dentro del contenedor
docker exec consulta-vehicular ps aux | grep -E "node|puppeteer|chrome" | grep -v grep

# 8. Ver archivos de debug SOAT dentro del contenedor
docker exec consulta-vehicular ls -la /app/apeseg-debug-*.png /app/apeseg-debug-*.html 2>/dev/null | tail -5

# 9. Entrar al contenedor
docker exec -it consulta-vehicular sh

# 10. Ver logs en tiempo real (Ctrl+C para salir)
docker logs -f consulta-vehicular --tail 200
```

---

## 🔍 Qué Buscar en los Logs

### Errores Comunes:

1. **`CAPTCHA_API_KEY no configurada`**
   - **Solución**: Verificar que el archivo `.env` tenga `CAPTCHA_API_KEY=dd23c370d7192bfb0d8cb37188918abe`

2. **`Timeout esperando resolución del captcha`**
   - **Causa**: El captcha tarda más de 5 minutos
   - **Solución**: Ya aumentado a 5 minutos, pero puede necesitar más tiempo

3. **`APESEG_TRANSIENT_ERROR`**
   - **Causa**: APESEG bloqueó temporalmente la consulta
   - **Solución**: Esperar unos minutos y reintentar

4. **`Error al iniciar el navegador`**
   - **Causa**: Puppeteer no está instalado o hay problemas con Chrome
   - **Solución**: `npm install puppeteer` o verificar instalación de Chrome

5. **`No se encontraron certificados SOAT`**
   - **Puede ser normal**: La placa realmente no tiene SOAT
   - **O puede ser error**: Si aparece muy rápido (< 30 segundos), es probablemente un error

---

## 🚀 Después del Diagnóstico

### Si encuentras errores:

1. **Copia los logs completos** del error
2. **Identifica el tipo de error** (usando la lista arriba)
3. **Aplica la solución correspondiente**

### Si todo parece estar bien pero sigue fallando:

1. **Reinicia el contenedor Docker**:
   ```bash
   docker restart consulta-vehicular
   ```

2. **O reconstruye y despliega** (si hay cambios en el código):
   ```bash
   cd /opt/Consulta-vehicular
   git pull origin main
   docker build -t consulta-vehicular:latest .
   docker rm -f consulta-vehicular
   docker run -d --name consulta-vehicular --env-file .env -p 127.0.0.1:8080:3000 consulta-vehicular:latest
   ```

3. **Prueba con una placa conocida** que tenga SOAT vigente

4. **Monitorea los logs en tiempo real**:
   ```bash
   docker logs -f consulta-vehicular --tail 200
   ```

---

## 📝 Archivos Creados

1. **`diagnostico-servidor.ps1`** - Script automático de diagnóstico
2. **`revisar-servidor.ps1`** - Script alternativo
3. **`comandos-servidor-manual.txt`** - Lista de comandos manuales
4. **`CAMBIOS-SOAT-TIMEOUTS.md`** - Documentación de cambios anteriores

---

## ⚠️ Notas Importantes

- El script pedirá la contraseña SSH cada vez que se conecte
- Si tienes problemas con SSH, puedes usar `plink` (PuTTY) en su lugar
- Los logs pueden ser largos, usa `tail -50` para ver solo las últimas líneas
- Si el contenedor no está corriendo, inícialo con:
  ```bash
  cd /opt/Consulta-vehicular
  docker run -d --name consulta-vehicular --env-file .env -p 127.0.0.1:8080:3000 consulta-vehicular:latest
  ```

---

**Última actualización**: Febrero 2026
