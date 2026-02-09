/**
 * SAT LIMA - CAPTURAS DE VEHÍCULOS SCRAPER
 * Consulta de registros de captura de vehículos en el SAT de Lima
 * Similar a sutran-scraper.js pero adaptado para SAT
 */

const { chromium } = require('playwright');
const axios = require('axios');
const FormData = require('form-data');

class SATCapturasScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://www.sat.gob.pe/VirtualSAT/modulos/Capturas.aspx';
    this.stats = { attempts: 0, successes: 0, failures: 0 };
    
    // Configurar API key de 2Captcha si está disponible
    if (captchaApiKey) {
      captchaApiKey = captchaApiKey.trim();
      const match = captchaApiKey.match(/^([a-f0-9]{32})/i);
      if (match) {
        this.captchaApiKey = match[1];
      } else {
        this.captchaApiKey = captchaApiKey;
      }
    } else {
      this.captchaApiKey = process.env.CAPTCHA_API_KEY || null;
    }
  }

  // ==================== MÉTODO PRINCIPAL ====================
  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [SAT] Iniciando consulta para: ${placa}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarPlacaIntento(placa);
        
        // Verificar si el resultado tiene capturas (éxito real)
        const hasCapturas = resultado.capturas && Array.isArray(resultado.capturas) && resultado.capturas.length > 0;
        
        if (resultado.success && hasCapturas) {
          console.log(`✅ [SAT] CONSULTA EXITOSA en intento ${attempt} - ${resultado.capturas.length} captura(s) encontrada(s)`);
          this.stats.successes++;
          return resultado;
        }
        
        // Si success es true pero no hay capturas, puede ser un resultado vacío válido
        if (resultado.success && !hasCapturas) {
          console.log(`⚠️ Intento ${attempt} completado pero sin capturas`);
          if (attempt === maxAttempts) {
            console.log(`⚠️ Último intento, devolviendo resultado vacío`);
            return resultado;
          }
        }
        
        console.log(`⚠️ Intento ${attempt} falló, reintentando...`);
        await this.delay(3000);
        
      } catch (error) {
        console.error(`❌ Error en intento ${attempt}:`, error.message);
        this.stats.failures++;
        
        if (attempt === maxAttempts) {
          throw error;
        }
        
        await this.delay(5000);
      }
    }
    
    throw new Error(`No se pudo consultar la placa después de ${maxAttempts} intentos`);
  }

  // ==================== INTENTO INDIVIDUAL ====================
  async consultarPlacaIntento(placa) {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1366,768'
      ]
    });

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'es-PE',
        timezoneId: 'America/Lima'
      });

      const page = await context.newPage();
      
      // 1. NAVEGAR A LA PÁGINA PRINCIPAL
      console.log('🌐 Navegando a la página principal...');
      await page.goto('https://www.sat.gob.pe/VirtualSAT/principal.aspx', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      await this.delay(2000);
      
      // 2. OBTENER SESSION ID DE LA URL O COOKIES
      const sessionId = await this.getSessionId(page);
      console.log(`📋 Session ID obtenido: ${sessionId ? sessionId.substring(0, 20) + '...' : 'N/A'}`);
      
      // 3. NAVEGAR A LA PÁGINA DE CAPTURAS
      const capturasURL = `https://www.sat.gob.pe/VirtualSAT/modulos/Capturas.aspx?tri=C&mysession=${encodeURIComponent(sessionId)}`;
      console.log('🌐 Navegando a página de capturas...');
      await page.goto(capturasURL, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      await this.delay(3000);
      
      // 4. ESPERAR A QUE EL FORMULARIO ESTÉ LISTO
      console.log('⏳ Esperando formulario...');
      await this.waitForFormEnabled(page);
      
      // 5. RESOLVER CAPTCHA
      console.log('🔐 Resolviendo CAPTCHA...');
      await this.solveCaptcha(page);
      
      // 6. LLENAR FORMULARIO
      console.log('📝 Llenando formulario...');
      await this.fillForm(page, placa);
      
      // 7. ENVIAR FORMULARIO
      console.log('📤 Enviando formulario...');
      await this.submitForm(page);
      
      // 8. ESPERAR RESULTADOS
      console.log('⏳ Esperando resultados...');
      await this.delay(5000);
      
      // 9. EXTRAER RESULTADOS
      console.log('📊 Extrayendo resultados...');
      const resultados = await this.extractResults(page, placa);
      
      await browser.close();
      return resultados;
      
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  // ==================== OBTENER SESSION ID ====================
  async getSessionId(page) {
    try {
      // Intentar obtener de la URL actual
      const currentURL = page.url();
      const urlMatch = currentURL.match(/mysession=([^&]+)/);
      if (urlMatch) {
        return decodeURIComponent(urlMatch[1]);
      }
      
      // Intentar obtener de cookies
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(c => c.name.includes('Session') || c.name.includes('ASP.NET'));
      if (sessionCookie) {
        return sessionCookie.value;
      }
      
      // Intentar obtener del iframe
      const iframeHandle = await page.$('frame[name="fraRightFrame"]');
      if (iframeHandle) {
        const iframeContent = await iframeHandle.contentFrame();
        if (iframeContent) {
          const iframeURL = iframeContent.url();
          const iframeMatch = iframeURL.match(/mysession=([^&]+)/);
          if (iframeMatch) {
            return decodeURIComponent(iframeMatch[1]);
          }
        }
      }
      
      // Generar uno por defecto o usar el que viene en la URL de referencia
      console.log('⚠️ No se pudo obtener session ID, usando valor por defecto');
      return 'U2x0%2fGGIUbk3CRDA8R2g6M%2bdNMvFr6Bt4mb2IOETzaI%3d';
      
    } catch (error) {
      console.log('⚠️ Error obteniendo session ID:', error.message);
      return 'U2x0%2fGGIUbk3CRDA8R2g6M%2bdNMvFr6Bt4mb2IOETzaI%3d';
    }
  }

  // ==================== ESPERAR FORMULARIO ====================
  async waitForFormEnabled(page) {
    const selectors = [
      'input[name*="placa" i]',
      'input[id*="placa" i]',
      '#txtPlaca',
      'input[type="text"]'
    ];
    
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { state: 'attached', timeout: 10000 });
        console.log(`   ✅ Campo encontrado: ${selector}`);
        return;
      } catch (e) {
        continue;
      }
    }
    
    throw new Error('No se encontró el campo de placa en el formulario');
  }

  // ==================== RESOLVER CAPTCHA ====================
  async solveCaptcha(page) {
    console.log('   📸 Obteniendo imagen del CAPTCHA...');
    
    await this.delay(2000);
    
    // Buscar imagen del CAPTCHA
    const captchaInfo = await page.evaluate(() => {
      const captchaSelectors = [
        'img[src*="captcha" i]',
        'img[id*="captcha" i]',
        'img[name*="captcha" i]',
        'img[alt*="código" i]',
        'img[alt*="codigo" i]',
        'img[alt*="captcha" i]',
        'img[class*="captcha" i]',
        'img[src*="ImageHandler" i]',
        'img[src*="ImageGenerator" i]'
      ];
      
      for (const selector of captchaSelectors) {
        const img = document.querySelector(selector);
        if (img && img.src && !img.src.includes('ajax-loader') && !img.src.includes('loading')) {
          return { found: true, src: img.src, selector: selector };
        }
      }
      return { found: false };
    });
    
    if (!captchaInfo.found) {
      console.log('   ⚠️ No se encontró imagen CAPTCHA, puede que no sea necesario');
      return;
    }
    
    console.log(`   🔍 Imagen CAPTCHA encontrada (selector: ${captchaInfo.selector})`);
    
    let base64Data = '';
    try {
      const imgElement = await page.$(captchaInfo.selector);
      if (imgElement) {
        const screenshot = await imgElement.screenshot({ type: 'png' });
        base64Data = screenshot.toString('base64');
        console.log(`   ✅ Imagen CAPTCHA obtenida (longitud: ${base64Data.length} chars)`);
      } else {
        throw new Error('No se pudo obtener el elemento de imagen CAPTCHA');
      }
    } catch (imgError) {
      throw new Error(`Error obteniendo imagen CAPTCHA: ${imgError.message}`);
    }
    
    if (!base64Data || base64Data.length < 100) {
      throw new Error('La imagen del CAPTCHA está vacía o es muy pequeña');
    }
    
    if (!this.captchaApiKey) {
      throw new Error('API Key de 2Captcha no configurada. Configure CAPTCHA_API_KEY en .env');
    }
    
    console.log('   🔄 Enviando a 2Captcha para resolver...');
    const captchaText = await this.resolveWith2Captcha(base64Data);
    console.log(`   ✅ CAPTCHA resuelto: ${captchaText}`);
    
    // Buscar input del CAPTCHA y llenarlo
    const captchaInput = await page.evaluate((text) => {
      const selectors = [
        'input[name*="captcha" i]',
        'input[id*="captcha" i]',
        'input[name*="codigo" i]',
        'input[id*="codigo" i]',
        '#txtCaptcha',
        '#txtCodigo'
      ];
      
      for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input) {
          input.value = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, captchaText);
    
    if (!captchaInput) {
      console.log('   ⚠️ No se encontró input de CAPTCHA, pero continuando...');
    }
    
    await this.delay(1000);
    return captchaText;
  }

  // ==================== RESOLVER CON 2CAPTCHA ====================
  async resolveWith2Captcha(base64Image) {
    try {
      // Subir imagen a 2Captcha
      const formData = new FormData();
      formData.append('method', 'base64');
      formData.append('key', this.captchaApiKey);
      formData.append('body', base64Image);
      formData.append('json', '1');
      
      const uploadResponse = await axios.post('http://2captcha.com/in.php', formData, {
        headers: formData.getHeaders(),
        timeout: 30000
      });
      
      if (!uploadResponse.data || uploadResponse.data.status !== 1) {
        throw new Error(`Error subiendo CAPTCHA: ${uploadResponse.data?.request || 'Unknown error'}`);
      }
      
      const taskId = uploadResponse.data.request;
      console.log(`   📋 Task ID: ${taskId}`);
      
      // Esperar solución (máximo 2 minutos)
      const maxAttempts = 40;
      for (let i = 0; i < maxAttempts; i++) {
        await this.delay(3000);
        
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
        } else if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
          throw new Error(`Error resolviendo CAPTCHA: ${resultResponse.data.request}`);
        }
      }
      
      throw new Error('Timeout esperando solución del CAPTCHA');
      
    } catch (error) {
      throw new Error(`Error en 2Captcha: ${error.message}`);
    }
  }

  // ==================== LLENAR FORMULARIO ====================
  async fillForm(page, placa) {
    // Buscar campo de placa
    const placaFilled = await page.evaluate((placa) => {
      const selectors = [
        'input[name*="placa" i]',
        'input[id*="placa" i]',
        '#txtPlaca',
        'input[type="text"]'
      ];
      
      for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input && !input.disabled) {
          input.value = placa;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, placa);
    
    if (!placaFilled) {
      throw new Error('No se pudo encontrar o llenar el campo de placa');
    }
    
    console.log(`   ✅ Placa ingresada: ${placa}`);
    await this.delay(1000);
  }

  // ==================== ENVIAR FORMULARIO ====================
  async submitForm(page) {
    // Extraer VIEWSTATE y EVENTVALIDATION
    const formData = await page.evaluate(() => {
      const viewstate = document.querySelector('input[name="__VIEWSTATE"]')?.value || '';
      const eventvalidation = document.querySelector('input[name="__EVENTVALIDATION"]')?.value || '';
      return { viewstate, eventvalidation };
    });
    
    // Buscar y hacer clic en el botón de búsqueda
    const buttonClicked = await page.evaluate(() => {
      const buttonSelectors = [
        'input[type="submit"]',
        'button[type="submit"]',
        'input[value*="Buscar" i]',
        'input[value*="Consultar" i]',
        'button:contains("Buscar")',
        '#btnBuscar',
        '#btnConsultar'
      ];
      
      for (const selector of buttonSelectors) {
        try {
          const button = document.querySelector(selector);
          if (button && !button.disabled) {
            button.click();
            return true;
          }
        } catch (e) {
          continue;
        }
      }
      return false;
    });
    
    if (!buttonClicked) {
      throw new Error('No se pudo encontrar el botón de búsqueda');
    }
    
    console.log('   ✅ Formulario enviado');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await this.delay(3000);
  }

  // ==================== EXTRAER RESULTADOS ====================
  async extractResults(page, placa) {
    // Esperar un poco más para que cargue el contenido
    await this.delay(3000);
    
    // Tomar screenshot para debugging
    try {
      await page.screenshot({ path: 'screenshots/sat-result.png', fullPage: true });
      console.log('   📸 Screenshot guardado en screenshots/sat-result.png');
    } catch (e) {
      console.log('   ⚠️ No se pudo guardar screenshot');
    }
    
    const datos = await page.evaluate((placa) => {
      const getText = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

      const msg = getText(document.querySelector('#ctl00_cplPrincipal_lblMensajeVacio')) ||
                  getText(document.querySelector('#ctl00_cplPrincipal_lblMensajeCapcha')) ||
                  getText(document.querySelector('#ctl00_cplPrincipal_lblMensajeCapcha')) ||
                  '';
      const fechaActualizacion = getText(document.querySelector('#ctl00_cplPrincipal_lblFecha')) || '';

      // Tabla exacta de Capturas
      const table = document.querySelector('#ctl00_cplPrincipal_grdCapturas')
        || document.querySelector('table[id*="grdCapturas" i]')
        || document.querySelector('table[id*="Capturas" i]');

      const resultado = {
        success: true,
        placa,
        mensaje: msg || null,
        fechaActualizacion: fechaActualizacion || null,
        tieneOrden: msg.toUpperCase().includes('TIENE ORDEN DE CAPTURA'),
        capturas: []
      };

      if (!table) {
        const bodyText = (document.body.innerText || '').toLowerCase();
        if (bodyText.includes('no se encontr') || bodyText.includes('sin registros') || bodyText.includes('no hay')) {
          resultado.mensaje = resultado.mensaje || 'No se encontraron capturas registradas';
        } else {
          resultado.mensaje = resultado.mensaje || 'No se encontró tabla de resultados';
        }
        return resultado;
      }

      const rows = Array.from(table.querySelectorAll('tr'));
      for (let i = 1; i < rows.length; i++) {
        const tds = Array.from(rows[i].querySelectorAll('td'));
        if (tds.length < 7) continue;
        resultado.capturas.push({
          placa: clean(getText(tds[0])),
          documento: clean(getText(tds[1])),
          anio: clean(getText(tds[2])),
          concepto: clean(getText(tds[3])),
          placaOriginal: clean(getText(tds[4])),
          referencia: clean(getText(tds[5])),
          montoCaptura: clean(getText(tds[6]))
        });
      }

      if (!resultado.capturas.length) {
        resultado.mensaje = resultado.mensaje || 'No se encontraron capturas registradas';
      }

      return resultado;
    }, placa);
    
    console.log(`   📊 Capturas encontradas: ${datos.capturas.length}`);
    if (datos.mensaje) console.log(`   📝 Mensaje: ${datos.mensaje}`);
    if (datos.fechaActualizacion) console.log(`   🕒 ${datos.fechaActualizacion}`);
    if (datos.capturas.length > 0) {
      datos.capturas.forEach((cap, idx) => {
        console.log(`      ${idx + 1}. ${cap.placa} - ${cap.documento} - ${cap.anio} - ${cap.concepto} - ${cap.montoCaptura}`);
      });
    } else {
      console.log(`   ⚠️ Mensaje: ${datos.mensaje}`);
    }
    
    return datos;
  }

  // ==================== UTILIDADES ====================
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SATCapturasScraper;
