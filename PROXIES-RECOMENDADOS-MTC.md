# Proxies Recomendados para MTC (Ministerio de Transportes y Comunicaciones)

## 📋 Resumen

El sitio web de MTC (`rec.mtc.gob.pe`) implementa protecciones avanzadas (WAF/Cloudflare) que bloquean consultas automatizadas. Para realizar scraping exitoso, se requiere usar **proxies residenciales** de alta calidad que simulen tráfico de usuarios reales desde Perú.

---

## 🎯 Requisitos para Proxies MTC

### Características Necesarias:

1. **Tipo**: Proxies Residenciales (NO datacenter)
2. **Ubicación**: Perú (preferiblemente Lima o ciudades principales)
3. **Protocolo**: HTTP/HTTPS (puerto 80/443) o SOCKS5
4. **Rotación**: Sesiones persistentes o rotación automática
5. **Velocidad**: Baja latencia (< 200ms ideal)
6. **Antidetect**: Compatible con navegadores automatizados (Playwright/Puppeteer)

---

## 🏆 Proveedores Recomendados

### 1. **Bright Data (Luminati)** ⭐⭐⭐⭐⭐
- **URL**: https://brightdata.com
- **Precio**: Desde $500/mes (plan básico)
- **Características**:
  - ✅ Proxies residenciales de Perú
  - ✅ Rotación automática
  - ✅ API REST fácil de integrar
  - ✅ Soporte para Playwright/Puppeteer
  - ✅ Alta tasa de éxito (95%+)
- **Formato de conexión**:
  ```
  http://customer-USERNAME:PASSWORD@zproxy.lum-superproxy.io:22225
  ```
- **Ventajas**: Máxima confiabilidad, mejor soporte
- **Desventajas**: Precio alto, requiere aprobación

---

### 2. **Smartproxy** ⭐⭐⭐⭐
- **URL**: https://smartproxy.com
- **Precio**: Desde $75/mes (10GB)
- **Características**:
  - ✅ Proxies residenciales de Perú
  - ✅ Rotación por sesión
  - ✅ API REST
  - ✅ Soporte técnico 24/7
- **Formato de conexión**:
  ```
  http://USERNAME:PASSWORD@gate.smartproxy.com:10000
  ```
- **Ventajas**: Precio razonable, buena calidad
- **Desventajas**: Menos opciones de configuración que Bright Data

---

### 3. **Oxylabs** ⭐⭐⭐⭐
- **URL**: https://oxylabs.io
- **Precio**: Desde $300/mes
- **Características**:
  - ✅ Proxies residenciales de Perú
  - ✅ Rotación automática
  - ✅ API REST y SDKs
  - ✅ Alta tasa de éxito
- **Formato de conexión**:
  ```
  http://customer-USERNAME:PASSWORD@pr.oxylabs.io:7777
  ```
- **Ventajas**: Buena calidad, buen soporte
- **Desventajas**: Precio medio-alto

---

### 4. **IPRoyal** ⭐⭐⭐
- **URL**: https://iproyal.com
- **Precio**: Desde $1.75/GB (pay-as-you-go)
- **Características**:
  - ✅ Proxies residenciales de Perú
  - ✅ Rotación por sesión
  - ✅ API REST
  - ✅ Precio flexible
- **Formato de conexión**:
  ```
  http://USERNAME:PASSWORD@gate.iproyal.com:12321
  ```
- **Ventajas**: Precio bajo, pago por uso
- **Desventajas**: Menor tasa de éxito que opciones premium

---

### 5. **Proxy-Cheap** ⭐⭐⭐
- **URL**: https://proxy-cheap.com
- **Precio**: Desde $50/mes
- **Características**:
  - ✅ Proxies residenciales de Perú
  - ✅ Rotación automática
  - ✅ API REST
- **Formato de conexión**:
  ```
  http://USERNAME:PASSWORD@rotating-residential.proxy-cheap.com:8080
  ```
- **Ventajas**: Precio bajo
- **Desventajas**: Calidad variable, soporte limitado

---

### 6. **2Captcha Proxy** ⭐⭐ (Actual - No Funciona)
- **URL**: https://2captcha.com/proxy
- **Precio**: Desde $2.50/GB
- **Estado**: ❌ **NO RECOMENDADO** - Problemas conocidos:
  - ❌ `ERR_CONNECTION_RESET` con HTTPS
  - ❌ `403 Forbidden` desde VPS
  - ❌ Incompatibilidad con CONNECT method
  - ❌ Autenticación SOCKS5 no funciona
- **Nota**: Aunque es económico, la infraestructura actual no es compatible con MTC.

---

## 🔧 Configuración Recomendada

### Para Playwright:
```javascript
const browser = await playwright.chromium.launch({
  proxy: {
    server: 'http://gate.smartproxy.com:10000',
    username: 'USERNAME',
    password: 'PASSWORD'
  }
});
```

### Para Puppeteer:
```javascript
const browser = await puppeteer.launch({
  args: [
    '--proxy-server=http://gate.smartproxy.com:10000'
  ]
});

await page.authenticate({
  username: 'USERNAME',
  password: 'PASSWORD'
});
```

### Para Axios:
```javascript
const HttpsProxyAgent = require('https-proxy-agent');
const agent = new HttpsProxyAgent('http://USERNAME:PASSWORD@gate.smartproxy.com:10000');

const response = await axios.get('https://rec.mtc.gob.pe', {
  httpsAgent: agent
});
```

---

## 💡 Estrategias Adicionales

### 1. **Rotación de Proxies**
- Usar diferentes proxies para cada intento
- Evitar reutilizar la misma IP en corto tiempo

### 2. **Delays Aleatorios**
- Esperar 2-5 segundos entre requests
- Simular comportamiento humano

### 3. **Headers Realistas**
- User-Agent de navegadores reales
- Headers completos (Accept, Accept-Language, etc.)
- Cookies persistentes

### 4. **Sesiones Persistentes**
- Mantener la misma sesión durante toda la consulta
- No cambiar de proxy a mitad de proceso

---

## 📊 Comparativa Rápida

| Proveedor | Precio/mes | Calidad | Soporte | Recomendado |
|-----------|------------|---------|---------|-------------|
| Bright Data | $500+ | ⭐⭐⭐⭐⭐ | Excelente | ✅ Sí (si presupuesto permite) |
| Smartproxy | $75+ | ⭐⭐⭐⭐ | Bueno | ✅ Sí (mejor relación precio/calidad) |
| Oxylabs | $300+ | ⭐⭐⭐⭐ | Bueno | ✅ Sí |
| IPRoyal | $1.75/GB | ⭐⭐⭐ | Medio | ⚠️ Considerar |
| Proxy-Cheap | $50+ | ⭐⭐⭐ | Limitado | ⚠️ Solo si presupuesto muy limitado |
| 2Captcha | $2.50/GB | ⭐ | Pobre | ❌ No (problemas técnicos) |

---

## 🎯 Recomendación Final

**Para producción con alta confiabilidad:**
1. **Smartproxy** - Mejor relación precio/calidad
2. **Bright Data** - Si el presupuesto lo permite

**Para pruebas/desarrollo:**
1. **IPRoyal** (pay-as-you-go) - Para probar sin compromiso mensual

**Evitar:**
- ❌ 2Captcha Proxy (problemas técnicos conocidos)
- ❌ Proxies datacenter (bloqueados por MTC)

---

## 📝 Notas de Implementación

1. **Configurar en `.env`**:
   ```env
   MTC_PROXY_HOST=gate.smartproxy.com
   MTC_PROXY_PORT=10000
   MTC_PROXY_USER=tu_usuario
   MTC_PROXY_PASS=tu_password
   MTC_PROXY_URL=http://tu_usuario:tu_password@gate.smartproxy.com:10000
   ```

2. **Probar primero con una placa de prueba** antes de usar en producción

3. **Monitorear logs** para detectar bloqueos tempranos

4. **Implementar retry logic** con diferentes proxies si uno falla

---

## 🔗 Enlaces Útiles

- [Bright Data - Residential Proxies](https://brightdata.com/products/residential-proxies)
- [Smartproxy - Residential Proxies](https://smartproxy.com/residential-proxies)
- [Oxylabs - Residential Proxies](https://oxylabs.io/products/residential-proxies)
- [IPRoyal - Residential Proxies](https://iproyal.com/residential-proxies)

---

**Última actualización**: Febrero 2026
