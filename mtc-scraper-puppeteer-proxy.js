/**
 * MTC Scraper usando Puppeteer con Proxy (Solución 3 mejorada)
 * Puppeteer tiene mejor soporte para proxies que Playwright
 */

const puppeteer = require('puppeteer');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const { getProxyConfig } = require('./playwrightConfig');

class MTCPuppeteerScraper {
  constructor(captchaApiKey) {
    this.baseURL = 'https://rec.mtc.gob.pe/Citv/ArConsultaCitv';
    this.captchaApiKey = captchaApiKey;
    this.proxyFor2Captcha = null;
  }

  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [MTC-PUPPETEER] Iniciando consulta para: ${placa}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        const resultado = await this.consultarPlacaIntento(placa);
        
        if (resultado.success) {
          console.log(`✅ [MTC-PUPPETEER] CONSULTA EXITOSA en intento ${attempt}`);
          return resultado;
        }

        console.log(`⚠️ Intento ${attempt} falló, reintentando...`);
        await this.delay(5000 + (attempt * 2000));

      } catch (error) {
        console.error(`❌ Error en intento ${attempt}:`, error.message);
        if (attempt === maxAttempts) {
          throw error;
        }
        await this.delay(5000 + (attempt * 2000));
      }
    }

    throw new Error(`No se pudo obtener información después de ${maxAttempts} intentos`);
  }

  async consultarPlacaIntento(placa) {
    // Obtener configuración del proxy
    let proxyConfig = getProxyConfig();
    this.proxyFor2Captcha = proxyConfig;

    const launchOptions = {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1366,768',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors'
      ]
    };

    // Configurar proxy en Puppeteer si está disponible
    if (proxyConfig && proxyConfig.server) {
      let proxyServer = proxyConfig.server;
      if (proxyServer.includes(':2333')) {
        proxyServer = proxyServer.replace(':2333', ':2334');
        console.log(`🔄 Cambiando puerto de 2333 a 2334 para Puppeteer`);
      }

      // Puppeteer requiere --proxy-server en args
      launchOptions.args.push(`--proxy-server=${proxyServer}`);
      
      console.log(`🔐 Proxy configurado para Puppeteer: ${proxyServer}`);
    } else {
      console.log(`⚠️  No se configuró proxy - Puppeteer funcionará sin proxy`);
    }

    const browser = await puppeteer.launch(launchOptions);

    try {
      const page = await browser.newPage();
      
      // Autenticar proxy si está configurado (MÉTODO CORRECTO para Puppeteer)
      if (proxyConfig && proxyConfig.server && proxyConfig.username && proxyConfig.password) {
        await page.authenticate({
          username: proxyConfig.username,
          password: proxyConfig.password
        });
        console.log(`🔐 Autenticación de proxy configurada`);
      }
      
      // Configurar user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });
      
      // Configurar headers adicionales
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
        'Upgrade-Insecure-Requests': '1'
      });

      // Navegar al sitio
      console.log('🌐 Navegando al sitio...');
      let navResponse = null;
      try {
        navResponse = await page.goto(this.baseURL, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
      } catch (navError) {
        console.log('   ⚠️  Error en navegación inicial, intentando con networkidle...');
        navResponse = await page.goto(this.baseURL, {
          waitUntil: 'networkidle2',
          timeout: 45000
        });
      }

      // Verificar bloqueo
      const html = await page.content().catch(() => '');
      const status = navResponse ? navResponse.status() : null;
      
      if (status === 403 || html.toLowerCase().includes('cloudflare') || html.toLowerCase().includes('checking your browser')) {
        throw new Error('MTC_BLOCKED: Acceso bloqueado por WAF/Cloudflare');
      }

      // Esperar formulario
      console.log('⏳ Esperando que el formulario se habilite...');
      await page.waitForSelector('#txtPlaca', { timeout: 30000 });

      // Llenar formulario
      console.log('📝 Llenando formulario...');
      await page.type('#txtPlaca', placa, { delay: 100 });

      // Resolver CAPTCHA
      console.log('🔐 Resolviendo CAPTCHA...');
      const captchaText = await this.solveCaptcha(page);

      // Enviar formulario
      console.log('🚀 Enviando consulta...');
      await page.click('#btnBuscar');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
        console.log('   ⚠️  waitForNavigation falló, esperando cambios en DOM...');
      });
      await this.delay(3000);

      // Extraer resultados
      console.log('📊 Extrayendo datos...');
      const resultados = await this.extractResults(page);

      await browser.close();

      return {
        success: true,
        encontrado: resultados && resultados.length > 0,
        datos: resultados || [],
        placa: placa,
        mensaje: resultados && resultados.length > 0 ? 'Consulta exitosa' : 'No se encontraron registros'
      };

    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  async solveCaptcha(page) {
    // Obtener imagen del captcha
    console.log('   📸 Obteniendo imagen del captcha...');
    const imgElement = await page.$('#imgCaptcha');
    if (!imgElement) {
      throw new Error('No se encontró el elemento #imgCaptcha');
    }

    const src = await imgElement.evaluate(el => el.src);
    if (!src || !src.startsWith('data:image')) {
      throw new Error('No se pudo obtener la imagen del captcha');
    }

    const base64Data = src.replace(/^data:image\/\w+;base64,/, '');

    // Resolver con 2Captcha usando proxy
    const captchaText = await this.resolveWith2Captcha(base64Data);

    // Escribir solución
    await page.type('#texCaptcha', captchaText, { delay: 100 });
    await this.delay(500);

    return captchaText;
  }

  async resolveWith2Captcha(base64Data) {
    if (!this.captchaApiKey) {
      throw new Error('API Key de 2Captcha no configurada');
    }

    console.log('   🤖 Enviando captcha a 2Captcha a través del proxy...');

    // Crear agentes de proxy para 2Captcha
    let httpsAgent = null;
    let httpAgent = null;

    if (this.proxyFor2Captcha && this.proxyFor2Captcha.server) {
      try {
        let proxyUrl = this.proxyFor2Captcha.server;
        if (proxyUrl.includes(':2333')) {
          proxyUrl = proxyUrl.replace(':2333', ':2334');
        }

        const proxyUrlWithAuth = `http://${this.proxyFor2Captcha.username}:${this.proxyFor2Captcha.password}@${proxyUrl.replace('http://', '')}`;
        httpsAgent = new HttpsProxyAgent(proxyUrlWithAuth);
        httpAgent = new HttpProxyAgent(proxyUrlWithAuth);
        console.log(`   🔐 Proxy configurado para 2Captcha: ${proxyUrl}`);
      } catch (proxyError) {
        console.log(`   ⚠️  Error configurando proxy: ${proxyError.message}`);
      }
    }

    const formData = new URLSearchParams();
    formData.append('key', this.captchaApiKey);
    formData.append('method', 'base64');
    formData.append('body', base64Data);
    formData.append('numeric', '4');
    formData.append('min_len', '4');
    formData.append('max_len', '6');
    formData.append('json', '1');

    try {
      const inResponse = await axios.post('http://2captcha.com/in.php', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000,
        httpAgent: httpAgent || undefined,
        httpsAgent: httpsAgent || undefined
      });

      if (inResponse.data.status !== 1) {
        throw new Error(`2Captcha error: ${inResponse.data.request || 'Error desconocido'}`);
      }

      const captchaId = inResponse.data.request;
      console.log(`   📝 Captcha ID: ${captchaId}`);

      // Esperar solución
      for (let i = 0; i < 15; i++) {
        await this.delay(2000);

        const resResponse = await axios.get('http://2captcha.com/res.php', {
          params: {
            key: this.captchaApiKey,
            action: 'get',
            id: captchaId,
            json: 1
          },
          timeout: 10000,
          httpAgent: httpAgent || undefined,
          httpsAgent: httpsAgent || undefined
        });

        if (resResponse.data.status === 1) {
          const solution = resResponse.data.request;
          console.log(`   ✅ Captcha resuelto: ${solution}`);
          return solution;
        }

        if (resResponse.data.request !== 'CAPCHA_NOT_READY') {
          console.log(`   ⚠️ Estado 2Captcha (intento ${i+1}/15): ${resResponse.data.request}`);
          if (resResponse.data.request.includes('ERROR')) {
            throw new Error(`2Captcha error: ${resResponse.data.request}`);
          }
        }
      }

      throw new Error('Timeout esperando solución del captcha');

    } catch (error) {
      console.error('   ❌ Error con 2Captcha:', error.message);
      throw error;
    }
  }

  async extractResults(page) {
    const resultados = [];

    for (let panelNum = 1; panelNum <= 3; panelNum++) {
      try {
        const panel = await page.$(`#Panel${panelNum}`);
        if (!panel) continue;

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
          try {
            const element = await page.$(`#${id}`);
            if (element) {
              const text = await element.evaluate(el => el.textContent);
              datos[key] = text ? text.trim() : null;
            }
          } catch (e) {
            datos[key] = null;
          }
        }

        if (Object.values(datos).some(v => v && v !== '')) {
          resultados.push(datos);
        }
      } catch (e) {
        // Continuar con siguiente panel
      }
    }

    return resultados;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = MTCPuppeteerScraper;
