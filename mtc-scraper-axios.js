/**
 * MTC Scraper usando SOLO Axios + Proxy
 * Sin navegadores automatizados - Compatible con proxy de 2Captcha
 */

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const cheerio = require('cheerio');
const { CookieJar } = require('tough-cookie');

class MTCAxiosScraper {
  constructor(captchaApiKey) {
    this.baseURL = 'https://rec.mtc.gob.pe/Citv/ArConsultaCitv';
    this.captchaApiKey = captchaApiKey;
    this.proxyConfig = null;
    this.cookieJar = new CookieJar();
  }

  /**
   * Configurar proxy desde variables de entorno
   */
  setupProxy() {
    const PROXY_HOST = process.env.MTC_PROXY_HOST || 'na.proxy.2captcha.com';
    const PROXY_PORT = process.env.MTC_PROXY_PORT || '2333';
    const PROXY_USER = process.env.MTC_PROXY_USER || 'uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3';
    const PROXY_PASS = process.env.MTC_PROXY_PASS || 'uae12c98557ca05dd';

    if (!PROXY_HOST || !PROXY_PORT || !PROXY_USER || !PROXY_PASS) {
      console.log('⚠️  Proxy no configurado completamente');
      return null;
    }

    // Intentar con puerto 2334 primero (HTTP), si falla usar 2333
    let port = PROXY_PORT === '2333' ? '2334' : PROXY_PORT;
    
    const proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${port}`;
    
    this.proxyConfig = {
      host: PROXY_HOST,
      port: parseInt(port),
      username: PROXY_USER,
      password: PROXY_PASS,
      url: proxyUrl
    };

    // Crear agentes de proxy con configuración más permisiva
    try {
      this.httpAgent = new HttpProxyAgent(proxyUrl, {
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 256,
        maxFreeSockets: 256,
        timeout: 30000
      });
      this.httpsAgent = new HttpsProxyAgent(proxyUrl, {
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 256,
        maxFreeSockets: 256,
        timeout: 30000,
        rejectUnauthorized: false // Permitir certificados autofirmados
      });
    } catch (error) {
      console.log(`⚠️  Error creando agentes de proxy: ${error.message}`);
      return null;
    }

    console.log(`🔐 Proxy configurado: ${PROXY_HOST}:${port}`);
    return this.proxyConfig;
  }

  /**
   * Obtener cookies como string para headers
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
   * Guardar cookies desde headers Set-Cookie
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
   * Crear cliente axios con proxy
   */
  createAxiosClient() {
    const config = {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1'
      }
    };

    // Agregar proxy si está configurado
    if (this.proxyConfig) {
      config.httpAgent = this.httpAgent;
      config.httpsAgent = this.httpsAgent;
      config.proxy = false; // Usar agent en lugar de proxy directo
    }

    return axios.create(config);
  }

  /**
   * Obtener la página inicial y extraer ViewState/EventValidation
   */
  async getInitialPage(client) {
    console.log('🌐 Obteniendo página inicial...');
    
    try {
      // Obtener cookies actuales
      const cookieString = await this.getCookieString();
      const headers = cookieString ? { 'Cookie': cookieString } : {};

      const response = await client.get(this.baseURL, { headers });
      
      // Guardar cookies de la respuesta
      await this.setCookiesFromResponse(response);
      
      if (response.status !== 200) {
        throw new Error(`Error HTTP ${response.status} al obtener página inicial`);
      }

      // Verificar si hay bloqueo
      const html = response.data;
      if (html.toLowerCase().includes('cloudflare') || 
          html.toLowerCase().includes('checking your browser') ||
          html.toLowerCase().includes('cf-chl')) {
        throw new Error('MTC_BLOCKED: Acceso bloqueado por WAF/Cloudflare');
      }

      const $ = cheerio.load(html);

      // Extraer ViewState y EventValidation (ASP.NET)
      const viewState = $('#__VIEWSTATE').attr('value') || '';
      const eventValidation = $('#__EVENTVALIDATION').attr('value') || '';
      const viewStateGenerator = $('#__VIEWSTATEGENERATOR').attr('value') || '';

      // Extraer URL de la imagen del CAPTCHA
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
      console.log(`   ViewState: ${viewState.substring(0, 20)}...`);
      console.log(`   CAPTCHA URL: ${captchaUrl || 'No encontrada'}`);

      return {
        html,
        viewState,
        eventValidation,
        viewStateGenerator,
        captchaUrl,
        $
      };
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
      // Obtener cookies actuales
      const cookieString = await this.getCookieString();
      const headers = {
        'Referer': this.baseURL
      };
      if (cookieString) {
        headers['Cookie'] = cookieString;
      }

      const response = await client.get(captchaUrl, {
        responseType: 'arraybuffer',
        headers
      });

      // Guardar cookies de la respuesta
      await this.setCookiesFromResponse(response);

      if (response.status !== 200) {
        throw new Error(`Error HTTP ${response.status} al obtener CAPTCHA`);
      }

      // Convertir a base64
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
   * Resolver CAPTCHA con 2Captcha usando proxy
   */
  async solveCaptcha(base64Data) {
    if (!this.captchaApiKey) {
      throw new Error('API Key de 2Captcha no configurada');
    }

    console.log('🤖 Enviando CAPTCHA a 2Captcha a través del proxy...');

    // Crear cliente axios para 2Captcha con proxy
    const captchaClient = axios.create({
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      timeout: 30000
    });

    const formData = new URLSearchParams();
    formData.append('key', this.captchaApiKey);
    formData.append('method', 'base64');
    formData.append('body', base64Data);
    formData.append('numeric', '4'); // Solo números
    formData.append('min_len', '4');
    formData.append('max_len', '6');
    formData.append('json', '1');

    try {
      // Enviar CAPTCHA
      const inResponse = await captchaClient.post('http://2captcha.com/in.php', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (inResponse.data.status !== 1) {
        const errorMsg = inResponse.data.request || 'Error desconocido';
        throw new Error(`2Captcha error: ${errorMsg}`);
      }

      const captchaId = inResponse.data.request;
      console.log(`   📝 CAPTCHA ID: ${captchaId}`);

      // Esperar solución (máximo 30 segundos)
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
   * Enviar formulario con placa y CAPTCHA
   */
  async submitForm(client, placa, captchaText, viewState, eventValidation, viewStateGenerator) {
    console.log('🚀 Enviando formulario...');

    const formData = new URLSearchParams();
    formData.append('__VIEWSTATE', viewState);
    formData.append('__EVENTVALIDATION', eventValidation);
    formData.append('__VIEWSTATEGENERATOR', viewStateGenerator);
    formData.append('txtPlaca', placa.toUpperCase());
    formData.append('texCaptcha', captchaText);
    formData.append('btnBuscar', 'Buscar');

    try {
      // Obtener cookies actuales
      const cookieString = await this.getCookieString();
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': this.baseURL,
        'Origin': 'https://rec.mtc.gob.pe'
      };
      if (cookieString) {
        headers['Cookie'] = cookieString;
      }

      const response = await client.post(this.baseURL, formData.toString(), {
        headers,
        maxRedirects: 5
      });

      // Guardar cookies de la respuesta
      await this.setCookiesFromResponse(response);

      if (response.status !== 200) {
        throw new Error(`Error HTTP ${response.status} al enviar formulario`);
      }

      console.log('✅ Formulario enviado');
      return response.data;
    } catch (error) {
      console.error('❌ Error enviando formulario:', error.message);
      throw error;
    }
  }

  /**
   * Procesar respuesta de la API JSON
   */
  processApiResponse(data, placa) {
    const resultados = [];

    try {
      // El formato de respuesta puede variar, intentar diferentes estructuras
      if (data.orStatus === 1 && data.orResult) {
        // Formato esperado: orResult contiene HTML o datos estructurados
        const resultData = data.orResult;
        
        if (typeof resultData === 'string' && resultData.includes('<')) {
          // Es HTML, parsearlo
          return this.extractResults(resultData);
        } else if (Array.isArray(resultData)) {
          // Es un array de resultados
          return resultData.map(item => ({
            empresa: item.empresa || item.razon_social || null,
            direccion: item.direccion || null,
            placa: item.placa || placa,
            certificado: item.certificado || item.numero_certificado || null,
            vigente_desde: item.vigente_desde || item.fecha_inicio || null,
            vigente_hasta: item.vigente_hasta || item.fecha_fin || null,
            resultado: item.resultado || null,
            estado: item.estado || null,
            ambito: item.ambito || null,
            tipo_servicio: item.tipo_servicio || null,
            observaciones: item.observaciones || null
          }));
        }
      }

      // Si no se reconoce el formato, retornar vacío
      console.log('⚠️  Formato de respuesta no reconocido');
      return [];
    } catch (error) {
      console.error('❌ Error procesando respuesta API:', error.message);
      return [];
    }
  }

  /**
   * Extraer resultados del HTML
   */
  extractResults(html) {
    const $ = cheerio.load(html);
    const resultados = [];

    // Buscar paneles de resultados (Panel1, Panel2, Panel3)
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
        { key: 'estado', id: `Spv${panelNum}_8` },
        { key: 'ambito', id: `Spv${panelNum}_9` },
        { key: 'tipo_servicio', id: `Spv${panelNum}_10` },
        { key: 'observaciones', id: `Spv${panelNum}_11` }
      ];

      for (const { key, id } of spanIds) {
        const element = $(`#${id}`);
        if (element.length > 0) {
          datos[key] = element.text().trim() || null;
        } else {
          datos[key] = null;
        }
      }

      // Verificar si tiene datos significativos
      const hasData = Object.values(datos).some(v => v && v !== '' && v !== null);
      if (hasData) {
        datos.tipo_documento = panelNum === 1 ? 'ÚLTIMO' :
                              panelNum === 2 ? 'PENÚLTIMO' : 'ANTEPENÚLTIMO';
        resultados.push(datos);
      }
    }

    return resultados;
  }

  /**
   * Consultar placa (método principal)
   */
  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [MTC-AXIOS] Iniciando consulta para: ${placa}`);

    // Configurar proxy
    this.setupProxy();
    if (!this.proxyConfig) {
      throw new Error('Proxy no configurado. Configure MTC_PROXY_HOST, MTC_PROXY_PORT, MTC_PROXY_USER, MTC_PROXY_PASS');
    }

    // Crear cliente axios
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

        // 4. Consultar usando el endpoint API (más confiable que POST)
        const consultUrl = `${this.baseURL.replace('/Citv/ArConsultaCitv', '')}/CITV/JrCITVConsultarFiltro?pArrParametros=${encodeURIComponent(`1|${placa.toUpperCase()}||${captchaText}`)}`;
        
        const cookieString = await this.getCookieString();
        const apiHeaders = {
          "Referer": this.baseURL,
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest"
        };
        if (cookieString) {
          apiHeaders['Cookie'] = cookieString;
        }

        console.log('📡 Consultando API...');
        const apiResponse = await client.get(consultUrl, { headers: apiHeaders });
        await this.setCookiesFromResponse(apiResponse);

        // 5. Procesar respuesta JSON
        let resultados = [];
        if (apiResponse.data && typeof apiResponse.data === 'object') {
          resultados = this.processApiResponse(apiResponse.data, placa);
        } else {
          // Si no es JSON, intentar extraer del HTML
          const resultHtml = await this.submitForm(client, placa, captchaText, viewState, eventValidation, viewStateGenerator);
          resultados = this.extractResults(resultHtml);
        }

        if (resultados.length > 0) {
          console.log(`\n✅ [MTC-AXIOS] CONSULTA EXITOSA en intento ${attempt}`);
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

module.exports = MTCAxiosScraper;
