# Correcciones Realizadas Basadas en Logs del Servidor

## 📋 Problemas Identificados y Solucionados

### 1. ✅ **SBS - Siniestralidad SOAT: Timeout de 300 segundos**
   - **Problema**: Los logs muestran que SBS SÍ encuentra 5 pólizas exitosamente, pero el timeout de 300 segundos (5 minutos) mata la consulta antes de que termine.
   - **Solución**: Aumentado el timeout de **300 segundos a 600 segundos (10 minutos)**.
   - **Archivo**: `server.js` línea 2465
   - **Frontend**: También aumentado en `public/js/app.js` línea 191

### 2. ✅ **Callao: Selector de Input Incorrecto**
   - **Problema**: El scraper busca `input[type="text"]` que encuentra el input de DNI en lugar del input de placa.
   - **Error en logs**: `locator.waitFor: Timeout 60000ms exceeded. 103 × locator resolved to hidden <input id="dni"...`
   - **Solución**: Mejorado el selector para:
     1. Primero buscar selectores específicos de placa (`input#placa`, `input[name*="placa"]`, etc.)
     2. Si no se encuentra, buscar en formulario pero **excluir inputs que contengan "dni" o "documento"**
     3. Solo usar inputs que contengan "placa" o no tengan identificadores de DNI
   - **Archivo**: `callao-papeletas-scraper.js` líneas 134-170

### 3. ✅ **Piura: Timeout en page.goto**
   - **Problema**: `page.goto: Timeout 60000ms exceeded` al navegar a la página.
   - **Solución**: 
     - Cambiado `waitUntil: 'networkidle'` a `'domcontentloaded'` (más rápido y confiable)
     - Aumentado timeout de 60s a **120s (2 minutos)**
   - **Archivo**: `piura-scraper.js` línea 131-134

### 4. ⚠️ **SOAT (APESEG): No aparece en logs**
   - **Observación**: No se ven logs de `[SOAT-APESEG]` en el output del servidor.
   - **Posibles causas**:
     1. El endpoint no se está llamando
     2. Está fallando muy rápido (antes de los logs)
     3. Hay un error silencioso
   - **Recomendación**: Verificar logs completos del servidor para ver si hay errores de SOAT.

### 5. ⚠️ **Puno: Timeout**
   - **Problema**: Muestra "Servicio temporalmente no disponible" con timeout.
   - **Recomendación**: Revisar el scraper de Puno y aumentar timeouts si es necesario.

---

## 🔧 Cambios Realizados

### Archivos Modificados:

1. **`server.js`**
   - Línea 2465: Timeout SBS aumentado de 300s a 600s
   - También corregido en línea 5226 (SUNARP) para consistencia

2. **`callao-papeletas-scraper.js`**
   - Líneas 134-170: Selector mejorado para excluir inputs de DNI
   - Ahora busca específicamente inputs de placa y filtra DNI

3. **`piura-scraper.js`**
   - Líneas 131-134: Timeout aumentado y `waitUntil` optimizado

4. **`public/js/app.js`**
   - Línea 191: Timeout frontend de SBS aumentado de 300s a 600s

---

## 📊 Resultados Esperados

Después de estas correcciones:

1. **SBS - Siniestralidad SOAT**: 
   - ✅ Debería completar la consulta exitosamente
   - ✅ Debería mostrar las 5 pólizas encontradas
   - ✅ No debería mostrar "Servicio temporalmente no disponible"

2. **Callao**:
   - ✅ Debería encontrar el input de placa correctamente
   - ✅ No debería confundirse con el input de DNI
   - ✅ Debería completar la consulta

3. **Piura**:
   - ✅ Debería navegar exitosamente a la página
   - ✅ No debería fallar con timeout en page.goto

---

## 🧪 Pruebas Recomendadas

1. **Reiniciar el contenedor Docker en el servidor**:
   ```bash
   docker restart consulta-vehicular
   ```
   
   **O reconstruir y desplegar** (si hay cambios en el código):
   ```bash
   cd /opt/Consulta-vehicular
   git pull origin main
   docker build -t consulta-vehicular:latest .
   docker rm -f consulta-vehicular
   docker run -d --name consulta-vehicular --env-file .env -p 127.0.0.1:8080:3000 consulta-vehicular:latest
   ```

2. **Probar con la placa V2R075** (la misma que usaste en los logs):
   - Verificar que SBS muestre las 5 pólizas
   - Verificar que Callao no falle con el error de DNI
   - Verificar que Piura navegue correctamente

3. **Monitorear logs en tiempo real**:
   ```bash
   docker logs -f consulta-vehicular --tail 200
   ```

4. **Buscar específicamente logs de SOAT**:
   ```bash
   docker logs consulta-vehicular 2>&1 | grep -i "SOAT-APESEG"
   ```

5. **Entrar al contenedor para debugging**:
   ```bash
   docker exec -it consulta-vehicular sh
   ```

---

## 🔍 Verificación de SOAT

Si SOAT sigue sin funcionar, verificar:

1. **Logs completos de SOAT**:
   ```bash
   docker logs consulta-vehicular 2>&1 | grep -A 20 "SOAT-APESEG"
   ```

2. **Verificar que el endpoint se está llamando**:
   - Revisar logs del frontend en el navegador (F12 > Network)
   - Verificar que `/api/soat` se está llamando

3. **Verificar configuración**:
   ```bash
   docker exec consulta-vehicular env | grep CAPTCHA_API_KEY
   ```

4. **Probar SOAT directamente**:
   ```bash
   curl -X POST http://localhost:3000/api/soat \
     -H "Content-Type: application/json" \
     -d '{"placa":"V2R075"}'
   ```

---

## 📝 Notas Adicionales

- Los timeouts aumentados pueden hacer que las consultas tarden más, pero serán más confiables
- El selector mejorado de Callao es más robusto pero puede ser ligeramente más lento
- Si SOAT sigue fallando, puede ser necesario revisar los logs completos del scraper APESEG

---

**Última actualización**: Febrero 2026
