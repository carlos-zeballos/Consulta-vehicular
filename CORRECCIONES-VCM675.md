# Correcciones para Placa VCM675 - Mostrar Datos Obligatoriamente

## 📋 Objetivo

Asegurar que la placa **VCM675** muestre datos **obligatoriamente** cuando existan en:
1. ✅ **SOAT** (APESEG)
2. ✅ **SBS - Siniestralidad SOAT**
3. ✅ **Certificado de Lunas Polarizadas**
4. ✅ **PLACAS.PE**

Los demás endpoints no deben dar error pero tampoco información si no hay registros.

---

## 🔧 Cambios Realizados

### 1. **Timeouts Consistentes entre Local y Servidor**

#### Frontend (`public/js/app.js`):
- **SOAT**: 480s (8 minutos)
- **SBS (Siniestro)**: 600s (10 minutos)
- **Certificado Vehiculo**: 300s (5 minutos) - **NUEVO**
- **PLACAS.PE**: 300s (5 minutos) - **NUEVO**
- **Otros complejos**: 300s (5 minutos)

#### Backend (`server.js`):
- **SOAT**: 480s (8 minutos) - Ya configurado
- **SBS**: 600s (10 minutos) - Ya corregido
- **Certificado Vehiculo**: 300s (5 minutos) - **AGREGADO**
- **PLACAS.PE**: 300s (5 minutos) - **AGREGADO**

### 2. **Verificación Obligatoria de Datos**

#### Certificado de Vehiculo (`server.js` línea ~4559):
- **Antes**: Solo verificaba `marca || modelo || nro_certificado`
- **Ahora**: Verifica **TODOS** los campos posibles:
  ```javascript
  const hasData = data.marca || data.modelo || data.nro_certificado || 
                  data.numero_certificado || data.serie || data.motor || 
                  data.color || data.anio || data.categoria || data.fecha_emision;
  ```
- **Resultado**: Si hay **cualquier** dato, se muestra obligatoriamente con `status: "success"`

#### PLACAS.PE (`server.js` línea ~3129):
- **Antes**: Solo verificaba `resultado.success` y `resultado.encontrado`
- **Ahora**: Verifica **TODOS** los campos posibles:
  ```javascript
  const hasData = resultado.brand || resultado.model || resultado.ownerCompleteName || 
                  resultado.serialNumber || resultado.statusDescription || 
                  resultado.deliveryPoint || resultado.plateNew || 
                  resultado.startDate || resultado.insertDate;
  ```
- **Resultado**: Si hay **cualquier** dato, se muestra obligatoriamente con `status: "success"`

#### SBS - Siniestralidad (`server.js` línea ~2480):
- **Agregado**: Log obligatorio cuando hay pólizas encontradas
- **Resultado**: Si hay pólizas, se muestran obligatoriamente

### 3. **Timeouts Agregados**

#### Certificado de Vehiculo:
```javascript
const resultado = await Promise.race([
  scraper.consultarPlaca(placa, 2),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout: La consulta tardó más de 300 segundos")), 300000)
  )
]);
```

#### PLACAS.PE:
```javascript
const resultado = await Promise.race([
  scraper.consultarPlaca(placa, 2),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout: La consulta tardó más de 300 segundos")), 300000)
  )
]);
```

---

## ✅ Garantías Implementadas

1. **SOAT**: 
   - Timeout: 8 minutos (480s)
   - Si hay pólizas, se muestran obligatoriamente
   - Log detallado de resultados

2. **SBS - Siniestralidad**:
   - Timeout: 10 minutos (600s)
   - Si hay pólizas, se muestran obligatoriamente
   - Log obligatorio cuando hay datos

3. **Certificado de Lunas Polarizadas**:
   - Timeout: 5 minutos (300s)
   - Verifica **TODOS** los campos posibles
   - Si hay **cualquier** dato, se muestra con `status: "success"`

4. **PLACAS.PE**:
   - Timeout: 5 minutos (300s)
   - Verifica **TODOS** los campos posibles
   - Si hay **cualquier** dato, se muestra con `status: "success"`

---

## 🧪 Pruebas con VCM675

### Endpoints que DEBEN mostrar datos:
1. ✅ `/api/soat` - Debe mostrar pólizas SOAT si existen
2. ✅ `/api/siniestro` - Debe mostrar pólizas SBS si existen
3. ✅ `/api/certificado-vehiculo` - Debe mostrar certificado si existe
4. ✅ `/api/placas-pe` - Debe mostrar información de placa si existe

### Endpoints que NO deben dar error pero pueden estar vacíos:
- `/api/sutran` - Sin infracciones (OK)
- `/api/sat` - Sin capturas (OK)
- `/api/arequipa` - Sin papeletas (OK)
- `/api/piura` - Sin multas (OK)
- etc.

---

## 📝 Logs de Verificación

Cuando hay datos, se verán estos logs:

```
[CERT-VEHICULO] Datos encontrados - OBLIGATORIO mostrar: true
[PLACAS.PE] Datos encontrados - OBLIGATORIO mostrar: true
[SINIESTRO] Pólizas encontradas - OBLIGATORIO mostrar: X
[SOAT-APESEG] Resultado: success=true, polizas=X
```

---

## 🚀 Despliegue

Los cambios son compatibles con Docker y funcionan igual en local y servidor:

```bash
# En el servidor
cd /opt/Consulta-vehicular
git pull origin main
docker build -t consulta-vehicular:latest .
docker rm -f consulta-vehicular
docker run -d --name consulta-vehicular --env-file .env -p 127.0.0.1:8080:3000 consulta-vehicular:latest
```

---

**Última actualización**: Febrero 2026
