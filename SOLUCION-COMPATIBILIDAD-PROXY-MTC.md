# Solución de Compatibilidad Proxy MTC

## ✅ Cambios Implementados

### 1. Cambio Automático de Puerto
- **Puerto 2333 (SOCKS5)** → Cambia automáticamente a **2334 (HTTP)**
- HTTP es más compatible con Playwright/Chromium que SOCKS5

### 2. Configuración Dual del Proxy
- Proxy configurado en **`launchOptions`** (nivel del navegador)
- Proxy configurado en **`contextOptions`** (nivel del contexto)
- Esto asegura que el proxy se aplique en todos los niveles

### 3. Argumentos Adicionales de Chromium
```javascript
--proxy-server=http://HOST:PORT
--proxy-bypass-list=<-loopback>
--ignore-certificate-errors
--ignore-ssl-errors
--ignoreHTTPSErrors: true (en contexto)
```

### 4. Estrategia de Navegación Mejorada
- Múltiples intentos con diferentes `waitUntil`:
  - `domcontentloaded`
  - `networkidle`
  - `load`
  - `commit`

## ⚠️ Problema Persistente

**Error**: `ERR_TUNNEL_CONNECTION_FAILED`

### Análisis
Este error indica que:
1. ✅ El proxy se configura correctamente
2. ✅ Playwright intenta conectarse al proxy
3. ❌ No se puede establecer el túnel HTTPS a través del proxy HTTP

### Causa Raíz
**Incompatibilidad fundamental** entre:
- Playwright/Chromium
- Proxies 2Captcha con autenticación HTTP Basic
- Conexiones HTTPS (túnel CONNECT)

## 🔧 Soluciones Adicionales Recomendadas

### Opción 1: Contactar a 2Captcha Support
**Pregunta sugerida:**
```
Hola,

Estoy usando Playwright/Chromium con sus proxies para hacer scraping de sitios HTTPS.

Configuración:
- Host: na.proxy.2captcha.com
- Puerto: 2334 (HTTP)
- Autenticación: Basic Auth

Problema:
- Error: ERR_TUNNEL_CONNECTION_FAILED
- Playwright no puede establecer túnel HTTPS a través del proxy

¿Hay alguna configuración especial para Playwright?
¿Recomiendan algún puerto o protocolo específico?
¿Hay headers adicionales necesarios?
```

### Opción 2: Usar Puppeteer en lugar de Playwright
Puppeteer puede tener mejor soporte para proxies HTTP autenticados.

### Opción 3: Proxy Intermedio (socks5-to-http)
Usar un proxy local que convierta SOCKS5 a HTTP para Playwright.

### Opción 4: Probar sin Proxy (Verificar Scraper)
Temporalmente deshabilitar el proxy para verificar que el scraper funciona correctamente.

## 📊 Estado Actual

- ✅ Configuración de proxy mejorada
- ✅ Cambio automático de puerto (2333 → 2334)
- ✅ Argumentos Chromium optimizados
- ✅ Estrategia de navegación mejorada
- ❌ Error de túnel HTTPS persiste

## 🎯 Próximos Pasos

1. **Probar en el servidor** (puede haber diferencias de red)
2. **Contactar a 2Captcha** para soporte específico
3. **Considerar Puppeteer** como alternativa
4. **Verificar que el scraper funciona sin proxy** (para aislar el problema)
