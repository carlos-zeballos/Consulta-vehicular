/**
 * MTC CITV ADAPTER CON PROXY - Consulta Revisión Técnica por PLACA
 * HTTP + Cookie Jar + Proxy 2Captcha
 */

const axios = require("axios").default;
const { CookieJar } = require("tough-cookie");
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');

const BASE_URL = "https://rec.mtc.gob.pe";

/**
 * Construir cliente HTTP con cookie jar y proxy (sin axios-cookiejar-support)
 */
function buildClient() {
  const jar = new CookieJar();
  
  // Configurar proxy
  const PROXY_HOST = process.env.MTC_PROXY_HOST || 'na.proxy.2captcha.com';
  const PROXY_PORT = process.env.MTC_PROXY_PORT || '2333';
  const PROXY_USER = process.env.MTC_PROXY_USER || 'uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3';
  const PROXY_PASS = process.env.MTC_PROXY_PASS || 'uae12c98557ca05dd';

  // Usar puerto 2334 (HTTP) si es 2333
  const port = PROXY_PORT === '2333' ? '2334' : PROXY_PORT;
  const proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${port}`;

  console.log(`[MTC-PROXY] Configurando proxy: ${PROXY_HOST}:${port}`);

  // Crear agentes de proxy
  const httpsAgent = new HttpsProxyAgent(proxyUrl, {
    rejectUnauthorized: false
  });
  const httpAgent = new HttpProxyAgent(proxyUrl);

  const client = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    httpAgent: httpAgent,
    httpsAgent: httpsAgent,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "DNT": "1"
    }
  });

  // Interceptor para manejar cookies manualmente
  let cookieString = '';
  
  client.interceptors.request.use(async (config) => {
    if (cookieString) {
      config.headers['Cookie'] = cookieString;
    }
    return config;
  });

  client.interceptors.response.use((response) => {
    // Guardar cookies de la respuesta
    const setCookieHeaders = response.headers['set-cookie'] || [];
    if (setCookieHeaders.length > 0) {
      jar.setCookieSync(setCookieHeaders.join('; '), BASE_URL);
      cookieString = jar.getCookiesSync(BASE_URL).map(c => `${c.key}=${c.value}`).join('; ');
    }
    return response;
  });

  return { client, jar };
}

/**
 * Obtener imagen de captcha
 */
async function getCitvCaptcha() {
  const { client } = buildClient();
  let retries = 0;
  const maxRetries = 1;

  while (retries <= maxRetries) {
    try {
      // PASO 1: GET formulario para obtener cookie de sesión
      console.log(`[MTC-PROXY] GET /Citv/ArConsultaCitv (intento ${retries + 1})`);
      await client.get("/Citv/ArConsultaCitv", {
        headers: {
          "Referer": `${BASE_URL}/Citv/ArConsultaCitv`
        }
      });

      // PASO 2: GET captcha
      console.log(`[MTC-PROXY] GET /CITV/refrescarCaptcha`);
      const captchaResponse = await client.get("/CITV/refrescarCaptcha", {
        headers: {
          "Referer": `${BASE_URL}/Citv/ArConsultaCitv`,
          "Accept": "*/*",
          "Content-Type": "application/json"
        }
      });

      if (captchaResponse.status === 403 || captchaResponse.status === 429) {
        throw new Error("BLOCKED_OR_RATE_LIMITED: El servicio bloquea consultas automatizadas");
      }

      const data = captchaResponse.data;
      if (!data || !data.orStatus || !data.orResult) {
        if (retries < maxRetries) {
          retries++;
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        throw new Error("CAPTCHA_ERROR: No se pudo obtener la imagen del captcha");
      }

      return {
        imageDataUrl: `data:image/png;base64,${data.orResult}`
      };

    } catch (error) {
      if (error.message.includes('BLOCKED_OR_RATE_LIMITED')) {
        throw error;
      }
      if (retries < maxRetries) {
        retries++;
        console.log(`[MTC-PROXY] Reintentando obtener captcha... (${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      if (error.response) {
        const status = error.response.status;
        if (status === 403 || status === 429) {
          throw new Error("BLOCKED_OR_RATE_LIMITED: El servicio bloquea consultas automatizadas");
        }
        throw new Error(`HTTP ${status}: ${error.message}`);
      }
      throw error;
    }
  }

  throw new Error("CAPTCHA_ERROR: No se pudo obtener captcha después de reintentos");
}

/**
 * Consultar CITV por placa
 */
async function consultCitvByPlaca(placa, captcha) {
  if (!placa || typeof placa !== 'string') {
    throw new Error("Placa requerida");
  }
  if (!captcha || typeof captcha !== 'string') {
    throw new Error("Captcha requerido");
  }

  const placaNormalizada = placa.trim().toUpperCase();
  const captchaNormalizado = captcha.trim();
  const { client } = buildClient();
  let retries = 0;
  const maxRetries = 1;

  while (retries <= maxRetries) {
    try {
      // PASO 1: GET formulario para obtener cookie de sesión
      console.log(`[MTC-PROXY] GET /Citv/ArConsultaCitv (intento ${retries + 1})`);
      await client.get("/Citv/ArConsultaCitv", {
        headers: {
          "Referer": `${BASE_URL}/Citv/ArConsultaCitv`
        }
      });

      // PASO 2: GET consulta con parámetros
      // Formato: "1|PLACA||CAPTCHA" para buscar por placa
      const pArr = `1|${placaNormalizada}||${captchaNormalizado}`;
      const encodedParams = encodeURIComponent(pArr);
      const consultUrl = `/CITV/JrCITVConsultarFiltro?pArrParametros=${encodedParams}`;

      console.log(`[MTC-PROXY] GET ${consultUrl}`);
      const consultResponse = await client.get(consultUrl, {
        headers: {
          "Referer": `${BASE_URL}/Citv/ArConsultaCitv`,
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "es-PE,es;q=0.9",
          "X-Requested-With": "XMLHttpRequest",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin"
        }
      });

      if (consultResponse.status === 403 || consultResponse.status === 429) {
        throw new Error("BLOCKED_OR_RATE_LIMITED: El servicio bloquea consultas automatizadas");
      }

      const data = consultResponse.data;

      // Verificar respuesta según reglas:
      if (!data || !data.orStatus) {
        if (data && data.orCodigo === "-1") {
          if (retries < maxRetries) {
            retries++;
            console.log(`[MTC-PROXY] Captcha inválido, reintentando... (${retries}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          throw new Error("CAPTCHA_INVALID: El captcha ingresado es inválido");
        }
        if (data && data.orCodigo === "-2") {
          throw new Error("MTC_SERVICE_ERROR: El servicio MTC no está disponible temporalmente");
        }
        throw new Error(`MTC_ERROR: ${data?.orCodigo || 'Error desconocido'}`);
      }

      // Parsear resultados
      let records = [];
      if (data.orResult && Array.isArray(data.orResult) && data.orResult.length > 0) {
        try {
          const jsonStr = data.orResult[0];
          if (typeof jsonStr === 'string') {
            records = JSON.parse(jsonStr);
          } else if (Array.isArray(jsonStr)) {
            records = jsonStr;
          }
          
          if (Array.isArray(records) && records.length === 0) {
            return {
              status: 'empty',
              records: []
            };
          }
        } catch (parseError) {
          console.error(`[MTC-PROXY] Error parseando JSON:`, parseError.message);
          throw new Error(`MTC_ERROR: Error parseando respuesta JSON - ${parseError.message}`);
        }
      }

      // Normalizar records
      const normalizedRecords = Array.isArray(records) ? records.map(record => ({
        placa: record.placa || placaNormalizada,
        nro_certificado: record.nro_certificado || record.certificado || '',
        vigencia_inicio: record.vigencia_inicio || record.fecha_inicio || '',
        vigencia_fin: record.vigencia_fin || record.fecha_fin || '',
        resultado: record.resultado || '',
        estado: record.estado || '',
        razon_social: record.razon_social || record.razonSocial || '',
        direccion: record.direccion || '',
        tipo_ambito: record.tipo_ambito || record.tipoAmbito || '',
        tipo_servicio: record.tipo_servicio || record.tipoServicio || '',
        tipo_documento: record.tipo_documento || record.tipoDocumento || '',
        observacion: record.observacion || ''
      })) : [];

      return {
        status: normalizedRecords.length > 0 ? 'success' : 'empty',
        records: normalizedRecords
      };

    } catch (error) {
      if (error.message.includes('BLOCKED_OR_RATE_LIMITED')) {
        throw error;
      }
      if (error.message.includes('CAPTCHA_INVALID') && retries < maxRetries) {
        retries++;
        console.log(`[MTC-PROXY] Reintentando consulta... (${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      if (error.response) {
        const status = error.response.status;
        if (status === 403 || status === 429) {
          throw new Error("BLOCKED_OR_RATE_LIMITED: El servicio bloquea consultas automatizadas");
        }
        throw new Error(`HTTP ${status}: ${error.message}`);
      }
      throw error;
    }
  }

  throw new Error("CAPTCHA_INVALID: Captcha inválido después de reintentos");
}

module.exports = {
  getCitvCaptcha,
  consultCitvByPlaca
};
