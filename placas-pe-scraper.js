/**
 * PLACAS.PE Scraper - VERSIÓN FINAL CORREGIDA
 * Consulta de estado de placa en https://www.placas.pe/
 * Requiere: PLACA
 * Usa reCAPTCHA v2 (resuelto con 2Captcha)
 * 
 * CORRECCIÓN CRÍTICA: El API espera "PlateNumber" (mayúscula), NO "placaNueva"
 */

const { chromium } = require('playwright');
const axios = require('axios');
const FormData = require('form-data');

class PlacasPeScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://www.placas.pe/#/home/verificarEstadoPlaca';
    this.apiURL = 'https://www.placas.pe/core/api/Requirement/GetRequirementStatus';
    this.captchaApiKey = captchaApiKey;
    this.stats = { attempts: 0, successes: 0, failures: 0 };
  }

  async consultarPlaca(placa, maxIntentos = 3) {
    this.stats.attempts++;
    console.log(`\n[PLACAS.PE] Iniciando consulta - Placa: ${placa}`);
    
    // PRIMERO: Intentar método directo (más rápido)
    console.log('\n🚀 Intentando método directo corregido...');
    const resultadoDirecto = await this.consultaDirectaCorregida(placa);
    
    if (resultadoDirecto && resultadoDirecto.success === 'S' && resultadoDirecto.data) {
      console.log('✅ ✅ ✅ ÉXITO CON MÉTODO DIRECTO ✅ ✅ ✅');
      return this.procesarRespuesta(resultadoDirecto, placa);
    }
    
    console.log('⚠️ Método directo falló, intentando con navegador...');
    
    // SEGUNDO: Usar navegador si falla el método directo
    for (let intento = 1; intento <= maxIntentos; intento++) {
      console.log(`\n🔄 Intento ${intento}/${maxIntentos} (navegador)`);
      
      try {
        const resultado = await this.consultarConNavegador(placa);
        if (resultado && resultado.success && resultado.encontrado) {
          this.stats.successes++;
          console.log(`✅ [PLACAS.PE] CONSULTA EXITOSA en intento ${intento}`);
          return resultado;
        }
        if (intento < maxIntentos) {
          await this.delay(5000);
        }
      } catch (error) {
        console.error(`❌ Error en intento ${intento}:`, error.message);
        if (intento === maxIntentos) {
          this.stats.failures++;
          return {
            success: true,
            placa: placa,
            encontrado: false,
            mensaje: error.message || 'Error al consultar placas.pe',
            timestamp: new Date().toISOString()
          };
        }
        await this.delay(5000);
      }
    }
    
    return {
      success: true,
      placa: placa,
      encontrado: false,
      mensaje: 'No se pudo completar la consulta. Por favor, intente más tarde.',
      timestamp: new Date().toISOString()
    };
  }

  async consultaDirectaCorregida(placa) {
    try {
      console.log('📤 Enviando request CORREGIDO a la API...');
      
      // **CORRECCIÓN CRÍTICA: Usar PlateNumber en lugar de placaNueva**
      const payload = {
        PlateNumber: placa.toUpperCase()  // ← ¡ESTA ES LA CLAVE!
      };
      
      console.log(`   📋 Payload correcto: ${JSON.stringify(payload)}`);
      
      const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
        'Content-Type': 'application/json',
        'Origin': 'https://www.placas.pe',
        'Referer': 'https://www.placas.pe/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      };
      
      const response = await axios.post(
        this.apiURL,
        payload,
        { 
          headers,
          timeout: 30000,
          validateStatus: () => true
        }
      );
      
      console.log(`   📥 Respuesta recibida - Status: ${response.status}`);
      
      if (response.data && response.data.success === 'S') {
        console.log('   ✅ API retornó success="S"');
        console.log(`   📋 Datos:`, JSON.stringify(response.data, null, 2).substring(0, 1000));
        return response.data;
      } else {
        console.log(`   ⚠️ API no retornó success="S":`, JSON.stringify(response.data, null, 2).substring(0, 500));
        return null;
      }
      
    } catch (error) {
      console.log(`   ❌ Error en consulta directa: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data:`, JSON.stringify(error.response.data, null, 2).substring(0, 500));
      }
      return null;
    }
  }

  async consultarConNavegador(placa) {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-first-run',
        '--no-service-autorun',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-component-update',
        '--disable-sync',
        '--disable-client-side-phishing-detection',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--password-store=basic',
        '--no-zygote',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--window-size=1920,1080',
        '--lang=es-PE',
        '--accept-lang=es-PE,es;q=0.9,en;q=0.8'
      ],
      ignoreDefaultArgs: [
        '--enable-automation',
        '--disable-extensions'
      ]
    });

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'es-PE',
        timezoneId: 'America/Lima',
        geolocation: {
          latitude: -12.0464,
          longitude: -77.0428,
          accuracy: 50
        },
        permissions: ['geolocation'],
        colorScheme: 'light',
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
          'DNT': '1'
        }
      });

      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { 
          get: () => {
            const plugins = [];
            for (let i = 0; i < 5; i++) {
              plugins.push({ name: `Plugin ${i}`, description: 'Plugin description' });
            }
            return plugins;
          }
        });
        Object.defineProperty(navigator, 'languages', { 
          get: () => ['es-PE', 'es', 'en-US', 'en']
        });
        window.chrome = { runtime: {} };
      });

      const page = await context.newPage();
      await page.setExtraHTTPHeaders({
        'Referer': 'https://www.placas.pe/',
        'Origin': 'https://www.placas.pe'
      });

      // Configurar interceptor
      let apiResponse = null;
      
      page.on('response', async response => {
        const url = response.url();
        if (url.includes('GetRequirementStatus') && response.status() === 200) {
          try {
            const data = await response.json();
            if (data && data.success === 'S' && data.data) {
              apiResponse = data;
              console.log('   ✅✅✅ Respuesta interceptada del navegador!');
            }
          } catch (e) {
            // Ignorar
          }
        }
      });

      // Navegar
      console.log('🌐 Navegando a placas.pe...');
      await page.goto(this.baseURL, {
        waitUntil: 'networkidle',
        timeout: 300000
      });

      await this.delay(5000);

      // Llenar campo
      console.log('📝 Llenando campo de placa...');
      await page.fill('#placaNueva', placa.toUpperCase());
      await this.delay(2000);

      // Resolver CAPTCHA
      console.log('🔐 Resolviendo reCAPTCHA...');
      await this.checkAndSolveCaptcha(page);
      await this.delay(3000);

      // Hacer clic
      console.log('🔘 Haciendo clic en buscar...');
      try {
        await page.click('button:has-text("Buscar")');
      } catch (e) {
        await page.keyboard.press('Enter');
      }

      // Esperar respuesta
      console.log('⏳ Esperando respuesta (30 segundos)...');
      const startTime = Date.now();
      while (Date.now() - startTime < 30000) {
        if (apiResponse) {
          console.log('   ✅✅✅ Respuesta recibida!');
          break;
        }
        await this.delay(1000);
      }

      // Si no hay respuesta, intentar consulta directa con cookies
      if (!apiResponse) {
        console.log('   ⚠️ No se interceptó respuesta, intentando consulta directa con cookies...');
        const cookies = await context.cookies();
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        
        const headers = {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
          'Content-Type': 'application/json',
          'Origin': 'https://www.placas.pe',
          'Referer': 'https://www.placas.pe/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-Requested-With': 'XMLHttpRequest'
        };
        
        if (cookieHeader) {
          headers['Cookie'] = cookieHeader;
        }
        
        try {
          const axiosResponse = await axios.post(
            this.apiURL,
            { PlateNumber: placa.toUpperCase() }, // ← CORRECCIÓN: PlateNumber
            { headers, timeout: 30000, validateStatus: () => true }
          );
          
          if (axiosResponse.data && axiosResponse.data.success === 'S') {
            apiResponse = axiosResponse.data;
            console.log('   ✅✅✅ Respuesta obtenida via axios con cookies!');
          }
        } catch (e) {
          console.log(`   ⚠️ Error en consulta directa con cookies: ${e.message}`);
        }
      }

      await browser.close();

      if (apiResponse && apiResponse.success === 'S' && apiResponse.data) {
        return this.procesarRespuesta(apiResponse, placa);
      }

      return {
        success: true,
        placa: placa,
        encontrado: false,
        mensaje: 'No se encontró información para esta placa',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      await browser.close();
      console.error('❌ Error en navegador:', error.message);
      return {
        success: true,
        placa: placa,
        encontrado: false,
        mensaje: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  procesarRespuesta(apiResponse, placa) {
    if (!apiResponse || !apiResponse.data) {
      return {
        success: true,
        placa: placa,
        encontrado: false,
        mensaje: 'Respuesta sin datos',
        timestamp: new Date().toISOString()
      };
    }

    const datos = apiResponse.data;
    return {
      success: true,
      placa: placa,
      encontrado: true,
      statusDescription: datos.statusDescription?.trim() || null,
      serialNumber: datos.serialNumber?.trim() || null,
      brand: datos.brand?.trim() || null,
      model: datos.model?.trim() || null,
      ownerCompleteName: datos.ownerCompleteName?.trim() || null,
      plateNew: datos.plateNew?.trim() || datos.platePrevious?.trim() || null,
      deliveryPoint: datos.deliveryPoint?.trim() || null,
      startDate: datos.startDate?.trim() || null,
      insertDate: datos.insertDate?.trim() || null,
      description: datos.description?.trim() || null,
      status: datos.status?.trim() || null,
      timestamp: new Date().toISOString()
    };
  }

  async checkAndSolveCaptcha(page) {
    const hasRecaptcha = await page.evaluate(() => {
      return document.querySelector('.g-recaptcha') !== null ||
             document.querySelector('iframe[src*="recaptcha"]') !== null ||
             document.querySelector('[data-sitekey]') !== null ||
             document.querySelector('ngx-recaptcha2') !== null;
    });
    
    if (!hasRecaptcha) {
      return true;
    }
    
    if (!this.captchaApiKey) {
      return false;
    }
    
    const knownSiteKey = '6LdWXRksAAAAAJxiMq_CbLwj40Pw5IWna7n0PMjl';
    const token = await this.resolveRecaptchaV2(knownSiteKey, page.url());
    
    if (!token) {
      return false;
    }
    
    const injected = await page.evaluate((token) => {
      const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (textarea) {
        textarea.value = token;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }, token);
    
    if (injected) {
      await this.delay(3000);
      return true;
    }
    
    return false;
  }

  async resolveRecaptchaV2(siteKey, pageURL) {
    try {
      const formData = new FormData();
      formData.append('method', 'userrecaptcha');
      formData.append('key', this.captchaApiKey);
      formData.append('googlekey', siteKey);
      formData.append('pageurl', pageURL);
      formData.append('json', '1');
      
      const uploadResponse = await axios.post('http://2captcha.com/in.php', formData, {
        headers: formData.getHeaders(),
        timeout: 30000
      });
      
      if (!uploadResponse.data || uploadResponse.data.status !== 1) {
        return null;
      }
      
      const taskId = uploadResponse.data.request;
      
      const maxAttempts = 36;
      for (let i = 0; i < maxAttempts; i++) {
        await this.delay(5000);
        
        const resultResponse = await axios.get(`http://2captcha.com/res.php`, {
          params: {
            key: this.captchaApiKey,
            action: 'get',
            id: taskId,
            json: 1
          },
          timeout: 10000
        });
        
        if (resultResponse.data.status === 1) {
          return resultResponse.data.request;
        } else if (resultResponse.data.request && resultResponse.data.request.includes('ERROR')) {
          return null;
        }
      }
      
      return null;
      
    } catch (error) {
      return null;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PlacasPeScraper;
