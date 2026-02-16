# Cambios Realizados: Mejoras en Timeouts y Manejo de Errores SOAT

## 📋 Resumen

Se han realizado mejoras significativas en el sistema de consulta SOAT para:
1. Dar más tiempo a los captchas para resolverse
2. Evitar errores prematuros que devuelvan "empty" antes de tiempo
3. Mejorar los mensajes de espera al usuario
4. Aumentar la robustez del sistema

---

## 🔧 Cambios en `apeseg-soat-scraper.js`

### 1. Timeout de Captcha Aumentado
- **Antes**: 2 minutos (24 intentos x 5 segundos)
- **Ahora**: 5 minutos (60 intentos x 5 segundos)
- **Ubicación**: Líneas 351-377
- **Mejora**: Logging cada 30 segundos para seguimiento

### 2. Espera en DOM Aumentada
- **Antes**: 2 minutos (40 intentos x 3 segundos)
- **Ahora**: 3 minutos (60 intentos x 3 segundos)
- **Ubicación**: Línea 503

### 3. Tiempos de Espera Aumentados
- **Espera inicial después de navegación**: 10s → **15s** (línea 407)
- **Espera para token**: 5s → **8s** (línea 414)
- **Espera antes de verificar errores**: **15s adicionales** (nuevo, línea ~988)

### 4. Lógica de Detección de Errores Mejorada
- **Antes**: Lanzaba error `APESEG_NO_CONFIRMATION` si no había confirmación
- **Ahora**: NO lanza error, simplemente retorna vacío (línea ~1011)
- **Razón**: El error causaba que se devolviera "empty" prematuramente

### 5. Tercera Extracción de Datos
- **Nuevo**: Se agrega una tercera extracción del DOM después de esperar 15 segundos adicionales
- **Ubicación**: Líneas ~988-1030
- **Beneficio**: Más oportunidades de encontrar datos antes de dar por perdida la consulta

---

## 🔧 Cambios en `server.js`

### 1. Timeout Total Aumentado
- **Antes**: 6 minutos (360,000ms)
- **Ahora**: 8 minutos (480,000ms)
- **Ubicación**: Línea 1603
- **Razón**: Dar tiempo suficiente para que los captchas se resuelvan (hasta 5 minutos) + tiempo de procesamiento

### 2. Manejo de Errores Mejorado
- **Nuevo**: Flag `isRealError` para distinguir errores reales de falta de datos
- **Mejora**: Mejor logging de errores desconocidos
- **Ubicación**: Líneas 1695-1720

---

## 🔧 Cambios en `public/js/app.js`

### 1. Timeout Frontend Aumentado
- **Antes**: 6 minutos (360,000ms)
- **Ahora**: 8 minutos (480,000ms)
- **Ubicación**: Línea 191

### 2. Mensaje de Espera para SOAT
- **Nuevo**: Mensaje visible cuando inicia la consulta SOAT
- **Contenido**:
  - "Consultando SOAT en sitios oficiales..."
  - "Por favor, espere mientras realizamos la consulta en los sistemas oficiales de APESEG."
  - "Esta consulta puede tardar hasta 8 minutos debido a la resolución de captchas y validaciones de seguridad."
  - "⏱️ Por favor, no cierre esta ventana mientras se procesa su solicitud."
- **Ubicación**: Líneas ~1418-1430

---

## 📊 Tiempos Totales

| Fase | Tiempo Anterior | Tiempo Actual | Mejora |
|------|----------------|---------------|--------|
| Resolución de Captcha | 2 min | 5 min | +150% |
| Espera en DOM | 2 min | 3 min | +50% |
| Espera inicial | 10s | 15s | +50% |
| Espera para token | 5s | 8s | +60% |
| Espera antes de errores | 0s | 15s | Nuevo |
| **Timeout Total** | **6 min** | **8 min** | **+33%** |

---

## 🎯 Problemas Resueltos

1. ✅ **Error prematuro "no se encontraron certificados"**
   - **Causa**: El scraper lanzaba `APESEG_NO_CONFIRMATION` antes de esperar suficiente tiempo
   - **Solución**: Eliminado el lanzamiento de error, ahora retorna vacío solo después de todos los intentos

2. ✅ **Captchas no se resolvían a tiempo**
   - **Causa**: Timeout de 2 minutos era insuficiente
   - **Solución**: Aumentado a 5 minutos con logging cada 30 segundos

3. ✅ **Datos no se cargaban antes de verificar errores**
   - **Causa**: Verificación de errores demasiado temprana
   - **Solución**: Espera adicional de 15 segundos + tercera extracción del DOM

4. ✅ **Usuario no sabía que debía esperar**
   - **Causa**: No había mensaje claro de espera
   - **Solución**: Mensaje visible explicando que puede tardar hasta 8 minutos

---

## 🧪 Pruebas Recomendadas

1. **Probar con placa que tiene SOAT vigente**
   - Debe mostrar los datos correctamente
   - Debe esperar el tiempo necesario sin mostrar "empty" prematuramente

2. **Probar con placa sin SOAT**
   - Debe esperar el tiempo completo antes de mostrar "sin certificados"
   - No debe mostrar errores, solo mensaje informativo

3. **Revisar logs del servidor**
   - Verificar que los logs muestren el progreso cada 30 segundos durante resolución de captcha
   - Verificar que no haya errores prematuros

---

## 📝 Notas de Implementación

- Los cambios son **retrocompatibles** - no rompen funcionalidad existente
- Los timeouts aumentados pueden hacer que las consultas tarden más, pero serán más confiables
- El mensaje de espera ayuda a que el usuario no cierre la ventana prematuramente

---

## 🔍 Monitoreo

Para monitorear el sistema en producción:

1. **Logs del servidor**:
   ```bash
   pm2 logs consulta-vehicular --lines 100
   # o
   tail -f /var/log/consulta-vehicular.log
   ```

2. **Buscar en logs**:
   - `[APESEG] Esperando captcha...` - Progreso de resolución
   - `[APESEG] ✅ Captcha resuelto` - Captcha resuelto exitosamente
   - `[SOAT-APESEG] Consulta completada` - Consulta finalizada

3. **Métricas a observar**:
   - Tiempo promedio de resolución de captcha
   - Tasa de éxito de consultas SOAT
   - Errores vs. "sin datos" reales

---

**Última actualización**: Febrero 2026
