# Resultado de Prueba: Proxy MTC con ASN AS6147

## 📋 Configuración Probada

- **Host**: `na.proxy.2captcha.com`
- **Puerto**: `2333` (SOCKS5) y `2334` (HTTP)
- **Usuario**: `uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-JdPGgGF15-sessTime-3`
- **Password**: `uae12c98557ca05dd`
- **ASN**: AS6147 (Telefónica del Perú)
- **Región**: Perú (PE)
- **Placa de prueba**: `v2r075`

## ❌ Resultados

### Puerto 2333 (SOCKS5)
```
Error: net::ERR_CONNECTION_RESET
```
- El proxy se configura correctamente
- Playwright intenta conectarse
- MTC cierra la conexión activamente

### Puerto 2334 (HTTP)
```
Error: net::ERR_TUNNEL_CONNECTION_FAILED
```
- El proxy se configura correctamente
- Playwright no puede establecer el túnel HTTPS
- Falla antes de llegar a MTC

## 🔍 Análisis

### Lo que funciona:
✅ La configuración del proxy se lee correctamente desde `.env`
✅ Playwright puede parsear las credenciales
✅ El formato de configuración es correcto (`server`, `username`, `password` separados)

### Lo que NO funciona:
❌ Playwright no puede establecer conexión HTTPS a través del proxy
❌ MTC específicamente rechaza/bloquea la conexión
❌ Ambos puertos (2333 y 2334) fallan de diferentes maneras

## 💡 Posibles Causas

1. **Incompatibilidad Playwright/Chromium con proxy 2Captcha**
   - Playwright usa Chromium que puede tener problemas con proxies HTTP autenticados
   - El túnel HTTPS no se establece correctamente

2. **Detección anti-proxy de MTC**
   - MTC puede detectar que la conexión viene de un proxy
   - Cierra la conexión activamente (`ERR_CONNECTION_RESET`)

3. **Configuración del proxy 2Captcha**
   - El proxy puede requerir configuración especial para HTTPS
   - Puede necesitar headers adicionales o configuración específica

## 🛠️ Soluciones Sugeridas

### 1. Contactar a 2Captcha Support (RECOMENDADO)
**Pregunta sugerida:**
```
Hola,

Estoy intentando usar sus proxies con Playwright/Chromium para hacer scraping 
de un sitio HTTPS (rec.mtc.gob.pe). 

Configuración:
- Host: na.proxy.2captcha.com
- Puerto: 2333 (SOCKS5) o 2334 (HTTP)
- Autenticación: Basic Auth con username/password

Problema:
- Playwright no puede establecer conexión HTTPS a través del proxy
- Error: ERR_TUNNEL_CONNECTION_FAILED (puerto 2334) o ERR_CONNECTION_RESET (puerto 2333)
- El proxy funciona con Axios para HTTP, pero no con Playwright para HTTPS

¿Hay alguna configuración especial necesaria para Playwright/Chromium?
¿Recomiendan algún puerto o protocolo específico?
¿Hay headers adicionales que deba enviar?
```

### 2. Probar sin proxy (solo para verificar que el scraper funciona)
```bash
# Temporalmente comentar las variables de proxy en .env
# MTC_PROXY_HOST=
# MTC_PROXY_PORT=
# MTC_PROXY_USER=
# MTC_PROXY_PASS=
```

### 3. Usar Puppeteer en lugar de Playwright
Puppeteer puede tener mejor soporte para proxies HTTP autenticados.

### 4. Usar un proxy intermedio (socks5-to-http)
Configurar un proxy local que convierta SOCKS5 a HTTP para Playwright.

## 📊 Estadísticas de Pruebas

- **Intentos realizados**: 5 (3 con puerto 2333, 2 con puerto 2334)
- **Tiempo total**: ~35 segundos
- **Éxitos**: 0
- **Fallos**: 5

## ✅ Conclusión

La configuración del proxy está correcta desde el punto de vista del código, pero hay una incompatibilidad fundamental entre:
- Playwright/Chromium
- Proxies 2Captcha
- Sitio HTTPS (MTC)

**Recomendación**: Contactar a 2Captcha para obtener soporte específico para Playwright/Chromium con proxies HTTPS.
