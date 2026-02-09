/**
 * TACNA - PAPELETAS SCRAPER
 * Consulta de papeletas de infracción de tránsito en Municipalidad Provincial de Tacna
 * Requiere DNI, PLACA o PAPELETA + CAPTCHA
 */

const { chromium } = require('playwright');
const axios = require('axios');
const FormData = require('form-data');

class TacnaPapeletasScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://www.munitacna.gob.pe/pagina/sf/servicios/papeletas';
    this.stats = { attempts: 0, successes: 0, failures: 0 };
    
    // Configurar API key de 2Captcha
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
  async consultar(dni = null, placa = null, papeleta = null, maxAttempts = 3) {
    console.log(`\n🔍 [TACNA] Iniciando consulta - DNI: ${dni || 'N/A'}, Placa: ${placa || 'N/A'}, Papeleta: ${papeleta || 'N/A'}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarIntento(dni, placa, papeleta);
        
        if (resultado.success) {
          console.log(`✅ [TACNA] CONSULTA EXITOSA en intento ${attempt}`);
          this.stats.successes++;
          return resultado;
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
    
    throw new Error(`No se pudo consultar después de ${maxAttempts} intentos`);
  }

  // ==================== INTENTO INDIVIDUAL ====================
  async consultarIntento(dni = null, placa = null, papeleta = null) {
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
      
      // 1. NAVEGAR AL FORMULARIO
      console.log('🌐 Navegando al sitio...');
      await page.goto(this.baseURL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      await this.delay(2000);
      
      // 2. ESPERAR A QUE CARGUE EL FORMULARIO
      console.log('⏳ Esperando que el formulario se cargue...');
      await this.waitForFormEnabled(page);
      
      // 3. SELECCIONAR TIPO DE BÚSQUEDA
      console.log('📝 Seleccionando tipo de búsqueda...');
      await this.selectTipoBusqueda(page, dni, placa, papeleta);
      
      // 4. OBTENER Y RESOLVER CAPTCHA
      console.log('🔐 Obteniendo y resolviendo CAPTCHA...');
      const captchaText = await this.solveCaptcha(page);
      
      // 5. LLENAR FORMULARIO
      console.log('📝 Llenando formulario...');
      await this.fillForm(page, dni, placa, papeleta, captchaText);
      
      // 6. ENVIAR FORMULARIO
      console.log('📤 Enviando formulario...');
      await this.submitForm(page);
      
      // 7. ESPERAR RESULTADOS
      console.log('⏳ Esperando resultados...');
      await this.delay(5000);
      
      // 8. EXTRAER RESULTADOS
      console.log('📊 Extrayendo resultados...');
      const resultados = await this.extractResults(page, dni, placa, papeleta);
      
      await browser.close();
      return resultados;
      
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  // ==================== FUNCIONES CRÍTICAS ====================

  async waitForFormEnabled(page, timeout = 20000) {
    console.log('   ⏳ Verificando estado del formulario...');
    
    try {
      await page.waitForSelector('#opcion, #busca, select[name="opcion"]', { timeout });
      console.log('   ✅ Formulario cargado');
      await this.delay(1000);
    } catch (error) {
      console.error('   ❌ Error esperando formulario:', error.message);
    }
  }

  async selectTipoBusqueda(page, dni, placa, papeleta) {
    let tipo = 'dni';
    if (placa) tipo = 'placa';
    else if (papeleta) tipo = 'papeleta';
    
    try {
      await page.selectOption('#opcion, select[name="opcion"]', tipo);
      console.log(`   ✅ Tipo de búsqueda seleccionado: ${tipo.toUpperCase()}`);
      await this.delay(1000);
    } catch (e) {
      console.log('   ⚠️ No se pudo seleccionar tipo, continuando...');
    }
  }

  async solveCaptcha(page) {
    try {
      // Obtener URL de la imagen del CAPTCHA
      const captchaUrl = await page.evaluate(() => {
        const img = document.querySelector('.img-captcha, img[src*="papeleta_c"]');
        if (img) {
          return img.src;
        }
        return null;
      });
      
      if (!captchaUrl) {
        throw new Error('No se encontró la imagen del CAPTCHA');
      }
      
      console.log('   📸 CAPTCHA encontrado, descargando...');
      
      // Descargar imagen
      const fullUrl = captchaUrl.startsWith('http') ? captchaUrl : `https://www.munitacna.gob.pe${captchaUrl}`;
      const response = await page.request.get(fullUrl);
      const buffer = await response.body();
      const base64 = buffer.toString('base64');
      
      // Resolver con 2Captcha
      if (!this.captchaApiKey) {
        throw new Error('API Key de 2Captcha no configurada');
      }
      
      console.log('   🤖 Resolviendo CAPTCHA con 2Captcha...');
      
      const formData = new URLSearchParams();
      formData.append('key', this.captchaApiKey);
      formData.append('method', 'base64');
      formData.append('body', base64);
      formData.append('json', '1');
      
      const submitResponse = await axios.post('http://2captcha.com/in.php', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });
      
      if (submitResponse.data.status !== 1) {
        throw new Error(`2Captcha error: ${submitResponse.data.request || 'Error desconocido'}`);
      }
      
      const captchaId = submitResponse.data.request;
      console.log(`   📝 CAPTCHA ID: ${captchaId}, esperando resolución...`);
      
      // Esperar resolución (máximo 40 segundos)
      for (let i = 0; i < 20; i++) {
        await this.delay(2000);
        
        const checkResponse = await axios.get('http://2captcha.com/res.php', {
          params: {
            key: this.captchaApiKey,
            action: 'get',
            id: captchaId,
            json: 1
          },
          timeout: 3000
        });
        
        if (checkResponse.data.status === 1) {
          const solution = checkResponse.data.request;
          console.log(`   ✅ CAPTCHA resuelto: ${solution}`);
          return solution;
        }
        
        if (checkResponse.data.request !== 'CAPCHA_NOT_READY') {
          console.log(`   ⚠️ Intento ${i+1}: ${checkResponse.data.request}`);
        }
      }
      
      throw new Error('CAPTCHA no resuelto a tiempo (40s timeout)');
    } catch (error) {
      console.error(`   ❌ Error resolviendo CAPTCHA: ${error.message}`);
      throw error;
    }
  }

  async fillForm(page, dni, placa, papeleta, captchaText) {
    const valor = dni || placa || papeleta;
    
    // Llenar campo de búsqueda
    await page.fill('#busca, input[name="busca"]', valor);
    console.log(`   ✅ Valor ingresado: ${valor}`);
    
    // Llenar CAPTCHA
    await page.fill('#codigo, input[name="codigo"]', captchaText.toUpperCase());
    console.log(`   ✅ CAPTCHA ingresado`);
    
    await this.delay(500);
  }

  async submitForm(page) {
    const buttonSelectors = [
      'button:has-text("Buscar")',
      'button.btn-danger',
      'button[type="button"]',
      'button'
    ];
    
    let buttonFound = false;
    for (const selector of buttonSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        buttonFound = true;
        console.log(`   ✅ Botón clickeado (selector: ${selector})`);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!buttonFound) {
      throw new Error('No se encontró el botón de envío');
    }
  }

  async extractResults(page, dni, placa, papeleta) {
    try {
      console.log('   🔍 Extrayendo datos de la tabla...');
      await this.delay(3000);
      
      try {
        await page.waitForSelector('table, .table, [id*="resultado"]', { timeout: 10000 });
      } catch (e) {
        console.log('   ⚠️ Tabla no encontrada...');
      }
      
      const datos = await page.evaluate(() => {
        const papeletas = [];
        
        // Buscar tablas
        const tables = document.querySelectorAll('table, .table');
        
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.querySelectorAll('td');
            
            if (cells.length >= 3) {
              const papeleta = {
                numero: cells[0]?.textContent.trim() || '',
                fecha: cells[1]?.textContent.trim() || '',
                infraccion: cells[2]?.textContent.trim() || '',
                importe: cells[3]?.textContent.trim() || '',
                estado: cells[4]?.textContent.trim() || ''
              };
              
              if (papeleta.numero) {
                papeletas.push(papeleta);
              }
            }
          }
        }
        
        return papeletas;
      });
      
      if (datos && datos.length > 0) {
        console.log(`   ✅ ${datos.length} papeleta(s) encontrada(s)`);
        return {
          success: true,
          dni: dni || null,
          placa: placa || null,
          papeleta: papeleta || null,
          papeletas: datos,
          timestamp: new Date().toISOString()
        };
      }
      
      console.log('   ⚠️ No se encontraron papeletas');
      return {
        success: true,
        dni: dni || null,
        placa: placa || null,
        papeleta: papeleta || null,
        papeletas: [],
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      console.error('   ⚠️ Error extrayendo del DOM:', e.message);
      return {
        success: true,
        dni: dni || null,
        placa: placa || null,
        papeleta: papeleta || null,
        papeletas: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TacnaPapeletasScraper;
