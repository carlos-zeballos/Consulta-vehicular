# Mensaje para Soporte de 2Captcha

## Configuración Actual y Problema

Hola,

Estoy intentando usar su servicio de proxy residencial ISP de Perú para hacer scraping de un sitio web gubernamental (MTC - Ministerio de Transportes y Comunicaciones del Perú).

### Lenguaje de Programación y Librerías:

**Lenguaje:** Node.js (v18.19.1 y v24.11.0)

**Librerías que estoy usando:**

1. **Axios** (v1.13.2) - Para peticiones HTTP/HTTPS directas
   - Con `https-proxy-agent` (v7.0.6) y `http-proxy-agent` (v7.0.2)
   - Configuración:
     ```javascript
     const httpsAgent = new HttpsProxyAgent(proxyUrl, {
       rejectUnauthorized: false
     });
     const httpAgent = new HttpProxyAgent(proxyUrl);
     
     axios.get(url, {
       httpsAgent: httpsAgent,
       httpAgent: httpAgent
     });
     ```

2. **Playwright** (v1.57.0) - Navegador automatizado
   - Configuración:
     ```javascript
     const browser = await chromium.launch({
       proxy: {
         server: 'http://na.proxy.2captcha.com:2334',
         username: 'USERNAME',
         password: 'PASSWORD'
       }
     });
     ```

3. **Puppeteer** (v19.11.1) - Navegador automatizado alternativo
   - Configuración:
     ```javascript
     const browser = await puppeteer.launch({
       args: [`--proxy-server=http://na.proxy.2captcha.com:2334`]
     });
     await page.authenticate({
       username: 'USERNAME',
       password: 'PASSWORD'
     });
     ```

### Configuración del Proxy Actual:

- **Host:** `na.proxy.2captcha.com`
- **Puerto:** `2333` (SOCKS5) o `2334` (HTTP) - he probado ambos
- **Usuario:** `uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3`
- **Password:** `uae12c98557ca05dd`
- **Región:** Perú (PE)
- **ASN:** AS6147 (Telefónica del Perú S.A.A.)
- **Tipo:** ISP residencial con sesión

### Problemas Encontrados:

1. **Con Axios:**
   - Error: `Proxy connection ended before receiving CONNECT response`
   - Error: `Parse Error: Missing expected CR after response line`
   - El proxy cierra la conexión antes de responder al método CONNECT para HTTPS

2. **Con Playwright:**
   - Error: `net::ERR_TUNNEL_CONNECTION_FAILED`
   - Error: `net::ERR_CONNECTION_RESET`
   - El navegador no puede establecer el túnel HTTPS a través del proxy

3. **Con Puppeteer:**
   - Error: `Waiting for selector failed` (la página no carga)
   - Similar a Playwright, no puede conectarse a través del proxy

### Lo que SÍ funciona:

- ✅ Verificación de IP con HTTP simple (ip-api.com)
- ✅ El proxy acepta la conexión inicial
- ✅ La autenticación parece correcta (no hay errores de autenticación)

### Lo que NO funciona:

- ❌ Conexiones HTTPS a través del proxy
- ❌ El método CONNECT para túneles HTTPS
- ❌ Navegadores automatizados (Playwright/Puppeteer) con el proxy

### Sitio Web que estoy intentando acceder:

- **URL:** `https://rec.mtc.gob.pe/Citv/ArConsultaCitv`
- **Protocolo:** HTTPS
- **Requisitos:** Necesito mantener cookies de sesión y hacer múltiples peticiones

### Preguntas Específicas:

1. ¿Hay alguna configuración especial necesaria para Node.js/Axios con proxies ISP de Perú?
2. ¿El puerto 2334 (HTTP) o 2333 (SOCKS5) es el correcto para Node.js?
3. ¿Hay algún formato especial de URL o parámetros que deba usar?
4. ¿Los proxies ISP de Perú soportan el método CONNECT para túneles HTTPS?
5. ¿Hay alguna configuración específica para Playwright/Puppeteer con estos proxies?

### Información Adicional:

- Estoy usando el proxy desde una aplicación Node.js en un servidor VPS
- El servidor tiene IP: 217.216.87.255 (si es relevante)
- Necesito hacer scraping automatizado, por lo que necesito que funcione con navegadores automatizados o con Axios

Por favor, proporcióneme la configuración exacta que debo usar para que funcione correctamente con Node.js/Axios y/o Playwright/Puppeteer.

Gracias de antemano.

---

## Versión Corta (si prefieren):

Hola,

Estoy usando **Node.js** con las siguientes librerías:
- **Axios** (v1.13.2) con `https-proxy-agent` y `http-proxy-agent`
- **Playwright** (v1.57.0) 
- **Puppeteer** (v19.11.1)

**Proxy configurado:**
- Host: `na.proxy.2captcha.com`
- Puerto: 2334 (HTTP) o 2333 (SOCKS5)
- Usuario: `uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3`
- Región: Perú, ASN: AS6147

**Errores:**
- Axios: `Proxy connection ended before receiving CONNECT response`
- Playwright: `ERR_TUNNEL_CONNECTION_FAILED` / `ERR_CONNECTION_RESET`
- Puppeteer: No puede cargar páginas HTTPS

**Sitio objetivo:** `https://rec.mtc.gob.pe/Citv/ArConsultaCitv` (HTTPS)

¿Qué configuración específica necesito para Node.js con proxies ISP de Perú para evitar ERR_CONNECTION_RESET?

Gracias.
