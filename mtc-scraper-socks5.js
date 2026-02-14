/**
 * MTC Scraper usando SOCKS5 (puerto 2333)
 * Solución 1: SOCKS5 maneja HTTPS sin necesidad de CONNECT
 */

const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');

class MTCAxiosSocks5Scraper {
  constructor(captchaApiKey) {
    this.baseURL = 'https://rec.mtc.gob.pe/Citv/ArConsultaCitv';
    this.captchaApiKey = captchaApiKey;
    this.cookieJar = new CookieJar();
    this.setupProxy();
  }

  /**
   * Configurar proxy SOCKS5
   */
  setupProxy() {
    const PROXY_HOST = process.env.MTC_PROXY_HOST || 'na.proxy.2captcha.com';
    const PROXY_PORT = process.env.MTC_PROXY_PORT || '2333';
    const PROXY_USER = process.env.MTC_PROXY_USER || 'uae12c98557ca05dd-zone-custom-region-pe-asn-AS27843-session-X2RCP1LgE-sessTime-3';
    const PROXY_PASS = process.env.MTC_PROXY_PASS || 'uae12c98557ca05dd';

    // Formato SOCKS5: socks5://USER:PASS@HOST:PORT
    const proxyUrl = `socks5://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
    
    this.httpsAgent = new SocksProxyAgent(proxyUrl, {
      keepAlive: true,
      timeout: 30000
    });

    console.log(`🔐 Proxy SOCKS5 configurado: ${PROXY_HOST}:${PROXY_PORT}`);
    return this.httpsAgent;
  }

  /**
   * Obtener cookies como string
   */
  getCookieString() {
    return new Promise((resolve) => {
      this.cookieJar.getCookies(this.baseURL, (err, cookies) => {
        if (err || !cookies || cookies.length === 0) {
          resolve('');
          return;
        }
        const cookieString = cookies.map(c => `${c.key}=${c.value}`).join('; ');
        resolve(cookieString);
      });
    });
  }

  /**
   * Guardar cookies desde headers
   */
  async setCookiesFromResponse(response) {
    const setCookieHeaders = response.headers['set-cookie'] || [];
    for (const cookieHeader of setCookieHeaders) {
      try {
        await new Promise((resolve, reject) => {
          this.cookieJar.setCookie(cookieHeader, this.baseURL, { ignoreError: true }, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch (e) {
        // Ignorar errores de cookies
      }
    }
  }

  /**
   * Crear cliente axios con SOCKS5
   */
  createAxiosClient() {
    return axios.create({
      timeout: 30000,
      httpsAgent: this.httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
  }

  /**
   * Obtener página inicial y extraer ViewState
   */
  async getInitialPage(client) {
    console.log('🌐 Obteniendo página inicial...');
    
    try {
      const cookieString = await this.getCookieString();
      const headers = cookieString ? { 'Cookie': cookieString } : {};

      const response = await client.get(this.baseURL, { headers });
      await this.setCookiesFromResponse(response);
      
      if (response.status !== 200) {
        throw new Error(`Error HTTP ${response.status}`);
      }

      const html = response.data;
      if (html.toLowerCase().includes('cloudflare') || 
          html.toLowerCase().includes('checking your browser')) {
        throw new Error('MTC_BLOCKED: Acceso bloqueado por WAF/Cloudflare');
      }

      const $ = cheerio.load(html);
      const viewState = $('#__VIEWSTATE').attr('value') || '';
      const eventValidation = $('#__EVENTVALIDATION').attr('value') || '';
      const viewStateGenerator = $('#__VIEWSTATEGENERATOR').attr('value') || '';
      const captchaImg = $('#imgCaptcha').attr('src') || '';
      
      let captchaUrl = '';
      if (captchaImg) {
        if (captchaImg.startsWith('http')) {
          captchaUrl = captchaImg;
        } else if (captchaImg.startsWith('/')) {
          captchaUrl = `https://rec.mtc.gob.pe${captchaImg}`;
        } else {
          captchaUrl = `${this.baseURL}/${captchaImg}`;
        }
      }

      console.log('✅ Página inicial obtenida');
      return { html, viewState, eventValidation, viewStateGenerator, captchaUrl, $ };
    } catch (error) {
      console.error('❌ Error obteniendo página inicial:', error.message);
      throw error;
    }
  }

  /**
   * Obtener imagen del CAPTCHA
   */
  async getCaptchaImage(client, captchaUrl) {
    console.log('📸 Obteniendo imagen del CAPTCHA...');
    
    try {
      const cookieString = await this.getCookieString();
      const headers = { 'Referer': this.baseURL };
      if (cookieString) {
        headers['Cookie'] = cookieString;
      }

      const response = await client.get(captchaUrl, {
        responseType: 'arraybuffer',
        headers
      });

      await this.setCookiesFromResponse(response);
      const base64 = Buffer.from(response.data).toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      console.log('✅ Imagen CAPTCHA obtenida');
      return { base64, dataUrl };
    } catch (error) {
      console.error('❌ Error obteniendo CAPTCHA:', error.message);
      throw error;
    }
  }

  /**
   * Resolver CAPTCHA con 2Captcha (usando SOCKS5 también)
   */
  async solveCaptcha(base64Data) {
    if (!this.captchaApiKey) {
      throw new Error('API Key de 2Captcha no configurada');
    }

    console.log('🤖 Enviando CAPTCHA a 2Captcha a través del proxy SOCKS5...');

    // Usar el mismo proxy SOCKS5 para 2Captcha
    const captchaClient = axios.create({
      httpsAgent: this.httpsAgent,
      timeout: 30000
    });

    const formData = new URLSearchParams();
    formData.append('key', this.captchaApiKey);
    formData.append('method', 'base64');
    formData.append('body', base64Data);
    formData.append('numeric', '4');
    formData.append('min_len', '4');
    formData.append('max_len', '6');
    formData.append('json', '1');

    try {
      const inResponse = await captchaClient.post('http://2captcha.com/in.php', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (inResponse.data.status !== 1) {
        throw new Error(`2Captcha error: ${inResponse.data.request || 'Error desconocido'}`);
      }

      const captchaId = inResponse.data.request;
      console.log(`   📝 CAPTCHA ID: ${captchaId}`);

      for (let i = 0; i < 15; i++) {
        await this.delay(2000);

        const resResponse = await captchaClient.get('http://2captcha.com/res.php', {
          params: {
            key: this.captchaApiKey,
            action: 'get',
            id: captchaId,
            json: 1
          }
        });

        if (resResponse.data.status === 1) {
          const solution = resResponse.data.request;
          console.log(`   ✅ CAPTCHA resuelto: ${solution}`);
          return solution;
        }

        if (resResponse.data.request !== 'CAPCHA_NOT_READY') {
          console.log(`   ⚠️ Estado 2Captcha (intento ${i+1}/15): ${resResponse.data.request}`);
          if (resResponse.data.request.includes('ERROR')) {
            throw new Error(`2Captcha error: ${resResponse.data.request}`);
          }
        }
      }

      throw new Error('Timeout esperando solución del CAPTCHA');
    } catch (error) {
      console.error('   ❌ Error con 2Captcha:', error.message);
      throw error;
    }
  }

  /**
   * Consultar usando el endpoint API de MTC
   */
  async consultarAPI(client, placa, captchaText) {
    console.log('📡 Consultando API de MTC...');
    
    const pArr = `1|${placa.toUpperCase()}||${captchaText}`;
    const encodedParams = encodeURIComponent(pArr);
    const consultUrl = `https://rec.mtc.gob.pe/CITV/JrCITVConsultarFiltro?pArrParametros=${encodedParams}`;

    const cookieString = await this.getCookieString();
    const headers = {
      "Referer": this.baseURL,
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest"
    };
    if (cookieString) {
      headers['Cookie'] = cookieString;
    }

    try {
      const response = await client.get(consultUrl, { headers });
      await this.setCookiesFromResponse(response);

      if (response.status !== 200) {
        throw new Error(`Error HTTP ${response.status}`);
      }

      return response.data;
    } catch (error) {
      console.error('❌ Error consultando API:', error.message);
      throw error;
    }
  }

  /**
   * Procesar respuesta de la API
   */
  processApiResponse(data, placa) {
    const resultados = [];

    try {
      if (data.orStatus === 1 && data.orResult) {
        const resultData = data.orResult;
        
        if (typeof resultData === 'string' && resultData.includes('<')) {
          // Es HTML, parsearlo
          const $ = cheerio.load(resultData);
          for (let panelNum = 1; panelNum <= 3; panelNum++) {
            const panel = $(`#Panel${panelNum}`);
            if (panel.length === 0) continue;

            const datos = {};
            const spanIds = [
              { key: 'empresa', id: `Spv${panelNum}_1` },
              { key: 'direccion', id: `Spv${panelNum}_2` },
              { key: 'placa', id: `Spv${panelNum}_3` },
              { key: 'certificado', id: `Spv${panelNum}_4` },
              { key: 'vigente_desde', id: `Spv${panelNum}_5` },
              { key: 'vigente_hasta', id: `Spv${panelNum}_6` },
              { key: 'resultado', id: `Spv${panelNum}_7` },
              { key: 'estado', id: `Spv${panelNum}_8` }
            ];

            for (const { key, id } of spanIds) {
              const element = $(`#${id}`);
              datos[key] = element.length > 0 ? element.text().trim() : null;
            }

            if (Object.values(datos).some(v => v && v !== '')) {
              datos.tipo_documento = panelNum === 1 ? 'ÚLTIMO' :
                                    panelNum === 2 ? 'PENÚLTIMO' : 'ANTEPENÚLTIMO';
              resultados.push(datos);
            }
          }
        } else if (Array.isArray(resultData)) {
          resultados.push(...resultData);
        } else if (typeof resultData === 'string') {
          try {
            const parsed = JSON.parse(resultData);
            if (Array.isArray(parsed)) {
              resultados.push(...parsed);
            }
          } catch (e) {
            // No es JSON válido
          }
        }
      }
    } catch (error) {
      console.error('❌ Error procesando respuesta:', error.message);
    }

    return resultados;
  }

  /**
   * Consultar placa (método principal)
   */
  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [MTC-SOCKS5] Iniciando consulta para: ${placa}`);

    const client = this.createAxiosClient();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);

        // 1. Obtener página inicial
        const { viewState, eventValidation, viewStateGenerator, captchaUrl } = await this.getInitialPage(client);

        if (!captchaUrl) {
          throw new Error('No se pudo obtener URL del CAPTCHA');
        }

        // 2. Obtener imagen del CAPTCHA
        const { base64 } = await this.getCaptchaImage(client, captchaUrl);

        // 3. Resolver CAPTCHA
        const captchaText = await this.solveCaptcha(base64);

        // 4. Consultar API
        const apiData = await this.consultarAPI(client, placa, captchaText);

        // 5. Procesar resultados
        const resultados = this.processApiResponse(apiData, placa);

        if (resultados.length > 0) {
          console.log(`\n✅ [MTC-SOCKS5] CONSULTA EXITOSA en intento ${attempt}`);
          return {
            success: true,
            encontrado: true,
            datos: resultados,
            placa: placa.toUpperCase(),
            mensaje: 'Consulta exitosa'
          };
        } else {
          console.log(`\n⚠️ Consulta exitosa pero sin datos para la placa ${placa}`);
          return {
            success: true,
            encontrado: false,
            datos: [],
            placa: placa.toUpperCase(),
            mensaje: 'No se encontraron registros'
          };
        }

      } catch (error) {
        console.error(`❌ Error en intento ${attempt}:`, error.message);
        
        if (error.message.includes('CAPTCHA_INVALID') || error.message.includes('código')) {
          console.log('   ⚠️ CAPTCHA inválido, reintentando...');
          await this.delay(3000);
          continue;
        }

        if (attempt === maxAttempts) {
          throw error;
        }

        await this.delay(5000 + (attempt * 2000));
      }
    }

    throw new Error(`No se pudo obtener información después de ${maxAttempts} intentos`);
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = MTCAxiosSocks5Scraper;
