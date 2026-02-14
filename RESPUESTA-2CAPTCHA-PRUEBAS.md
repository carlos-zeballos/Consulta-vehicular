# Respuesta para 2Captcha - Resultados de Pruebas

## Pruebas Realizadas

He probado el proxy ISP Perú con el formato exacto que me indicaron:

### Configuración Usada:

```javascript
const proxyUrl = 'http://uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334';

const httpsAgent = new HttpsProxyAgent(proxyUrl, { 
  rejectUnauthorized: false 
});
const httpAgent = new HttpProxyAgent(proxyUrl);

await axios.get('https://SITIO', { 
  httpsAgent, 
  httpAgent 
});
```

### Resultados de las Pruebas:

He probado con **6 sitios HTTPS diferentes** (incluyendo MTC):

1. ❌ **Google** (https://www.google.com) - FALLA
   - Error: `Proxy connection ended before receiving CONNECT response`

2. ❌ **GitHub API** (https://api.github.com) - FALLA
   - Error: `Proxy connection ended before receiving CONNECT response`

3. ❌ **HTTPBin** (https://httpbin.org/ip) - FALLA
   - Error: `Proxy connection ended before receiving CONNECT response`

4. ❌ **IPify** (https://api.ipify.org?format=json) - FALLA
   - Error: `Proxy connection ended before receiving CONNECT response`

5. ❌ **Wikipedia** (https://es.wikipedia.org) - FALLA
   - Error: `Proxy connection ended before receiving CONNECT response`

6. ❌ **MTC** (https://rec.mtc.gob.pe/Citv/ArConsultaCitv) - FALLA
   - Error: `Proxy connection ended before receiving CONNECT response`

### Análisis:

**Resultado:** El proxy **FALLA con TODOS los sitios HTTPS**, no solo con MTC.

**Conclusión:** Esto indica que el problema **NO es específico del sitio MTC**, sino un problema general del proxy que no está respondiendo correctamente al método CONNECT para establecer túneles HTTPS.

### Información Adicional:

- **Node.js:** v24.11.0
- **Axios:** v1.13.2
- **https-proxy-agent:** v7.0.6
- **http-proxy-agent:** v7.0.2
- **Formato proxy:** `http://USERNAME:PASSWORD@na.proxy.2captcha.com:2334`
- **Puerto:** 2334 (HTTP, como indicaron)
- **sessTime:** Mantenido en 3 en el USERNAME

### Pregunta:

Dado que el proxy falla con **todos** los sitios HTTPS (no solo MTC), ¿hay alguna configuración adicional necesaria o es un problema del lado del servidor del proxy?

¿Debería probar desde el servidor VPS (IP: 217.216.87.255) en lugar de localmente?

Gracias.

---

## Versión Corta para Copiar/Pegar:

He probado el proxy ISP Perú con el formato exacto que me indicaron (`http://USERNAME:PASSWORD@na.proxy.2captcha.com:2334`) usando Axios con `HttpsProxyAgent` y `HttpProxyAgent`.

**Resultado:** El proxy **FALLA con TODOS los sitios HTTPS** que probé (Google, GitHub, HTTPBin, IPify, Wikipedia, y MTC), todos con el mismo error: `Proxy connection ended before receiving CONNECT response`.

**Conclusión:** El problema NO es específico de MTC, sino que el proxy no está respondiendo correctamente al método CONNECT para túneles HTTPS en general.

¿Hay alguna configuración adicional necesaria o es un problema del lado del servidor del proxy? ¿Debería probar desde el servidor VPS en lugar de localmente?

Gracias.
