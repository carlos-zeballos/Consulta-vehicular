/**
 * CHICLAYO - RECORD DE INFRACCIONES SCRAPER
 * Consulta de record de infracciones en SATCH Chiclayo
 */

const { chromium } = require('playwright');
const axios = require('axios');
const FormData = require('form-data');

class ChiclayoInfraccionesScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://virtualsatch.satch.gob.pe/virtualsatch/record_infracciones/buscar_placa';
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
    console.log(`\n🔍 [CHICLAYO] Iniciando consulta para: ${placa}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarPlacaIntento(placa);
        
        // Verificar si el resultado tiene infracciones (éxito real)
        const hasInfracciones = resultado.infracciones && Array.isArray(resultado.infracciones) && resultado.infracciones.length > 0;
        
        if (resultado.success && hasInfracciones) {
          console.log(`✅ [CHICLAYO] CONSULTA EXITOSA en intento ${attempt} - ${resultado.infracciones.length} infracción(es) encontrada(s)`);
          this.stats.successes++;
          return resultado;
        }
        
        // Si success es true pero no hay infracciones, puede ser un resultado vacío válido
        if (resultado.success && !hasInfracciones) {
          console.log(`⚠️ Intento ${attempt} completado pero sin infracciones`);
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
      
      // 1. NAVEGAR A LA PÁGINA
      console.log('🌐 Navegando a la página de record de infracciones...');
      await page.goto(this.baseURL, {
        waitUntil: 'networkidle',
        timeout: 60000
      });
      
      await this.delay(3000);
      
      // 2. ESPERAR A QUE EL FORMULARIO ESTÉ LISTO
      console.log('⏳ Esperando formulario...');
      await this.waitForFormEnabled(page);
      
      // 3. VERIFICAR Y RESOLVER CAPTCHA SI ES NECESARIO
      console.log('🔐 Verificando CAPTCHA...');
      const captchaResolved = await this.checkAndSolveCaptcha(page);
      
      // 4. LLENAR FORMULARIO
      console.log('📝 Llenando formulario...');
      await this.fillForm(page, placa);
      
      // 5. ENVIAR FORMULARIO
      console.log('📤 Enviando formulario...');
      await this.submitForm(page);
      
      // 6. ESPERAR RESULTADOS
      console.log('⏳ Esperando resultados...');
      await this.delay(5000);
      
      // 7. EXTRAER RESULTADOS
      console.log('📊 Extrayendo resultados...');
      const resultados = await this.extractResults(page, placa);
      
      await browser.close();
      return resultados;
      
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  // ==================== ESPERAR FORMULARIO ====================
  async waitForFormEnabled(page) {
    const selectors = [
      'input[name="search"]',
      'input[type="text"]',
      'input.form-control'
    ];
    
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { state: 'attached', timeout: 15000 });
        console.log(`   ✅ Campo encontrado: ${selector}`);
        return;
      } catch (e) {
        continue;
      }
    }
    
    throw new Error('No se encontró el campo de placa en el formulario');
  }

  // ==================== VERIFICAR Y RESOLVER CAPTCHA ====================
  async checkAndSolveCaptcha(page) {
    // Verificar si hay reCAPTCHA
    const hasRecaptcha = await page.evaluate(() => {
      return document.querySelector('.g-recaptcha') !== null ||
             document.querySelector('iframe[src*="recaptcha"]') !== null ||
             document.querySelector('[data-sitekey]') !== null;
    });
    
    if (!hasRecaptcha) {
      console.log('   ✅ No se requiere CAPTCHA');
      return true;
    }
    
    console.log('   🔐 reCAPTCHA detectado, resolviendo...');
    
    if (!this.captchaApiKey) {
      throw new Error('API Key de 2Captcha no configurada. Configure CAPTCHA_API_KEY en .env');
    }
    
    // Obtener site key
    const siteKey = await page.evaluate(() => {
      const recaptcha = document.querySelector('.g-recaptcha');
      if (recaptcha) {
        return recaptcha.getAttribute('data-sitekey');
      }
      const iframe = document.querySelector('iframe[src*="recaptcha"]');
      if (iframe) {
        const src = iframe.getAttribute('src');
        const match = src.match(/k=([^&]+)/);
        if (match) return match[1];
      }
      return null;
    });
    
    if (!siteKey) {
      console.log('   ⚠️ No se pudo obtener site key, puede que el CAPTCHA no esté activo');
      return false;
    }
    
    console.log(`   📋 Site Key: ${siteKey.substring(0, 20)}...`);
    
    // Resolver con 2Captcha
    const pageURL = page.url();
    const token = await this.resolveRecaptchaV2(siteKey, pageURL);
    console.log(`   ✅ Token obtenido: ${token.substring(0, 30)}...`);
    
    // Inyectar token
    await page.evaluate((token) => {
      const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (textarea) {
        textarea.value = token;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, token);
    
    await this.delay(2000);
    return true;
  }

  // ==================== RESOLVER reCAPTCHA V2 ====================
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
        throw new Error(`Error subiendo reCAPTCHA: ${uploadResponse.data?.request || 'Unknown error'}`);
      }
      
      const taskId = uploadResponse.data.request;
      console.log(`   📋 Task ID: ${taskId}`);
      
      const maxAttempts = 40;
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
        } else if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
          throw new Error(`Error resolviendo reCAPTCHA: ${resultResponse.data.request}`);
        }
      }
      
      throw new Error('Timeout esperando solución del reCAPTCHA');
      
    } catch (error) {
      throw new Error(`Error en 2Captcha: ${error.message}`);
    }
  }

  // ==================== LLENAR FORMULARIO ====================
  async fillForm(page, placa) {
    const placaFilled = await page.evaluate((placa) => {
      const input = document.querySelector('input[name="search"]') || document.querySelector('input[type="text"]');
      if (input && !input.disabled) {
        input.value = placa.toUpperCase();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }, placa);
    
    if (!placaFilled) {
      throw new Error('No se pudo encontrar o llenar el campo de placa');
    }
    
    console.log(`   ✅ Placa ingresada: ${placa.toUpperCase()}`);
    await this.delay(1000);
  }

  // ==================== ENVIAR FORMULARIO ====================
  async submitForm(page) {
    // Hacer clic en el botón de búsqueda
    const buttonClicked = await page.evaluate(() => {
      const button = document.querySelector('button[type="submit"]') ||
                     document.querySelector('button.btn-primary');
      if (button && !button.disabled) {
        button.click();
        return true;
      }
      return false;
    });
    
    if (!buttonClicked) {
      throw new Error('No se pudo encontrar el botón de búsqueda');
    }
    
    console.log('   ✅ Formulario enviado');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await this.delay(5000);
  }

  // ==================== EXTRAER RESULTADOS ====================
  async extractResults(page, placa) {
    await this.delay(3000);
    
    // Tomar screenshot para debugging
    try {
      await page.screenshot({ path: 'screenshots/chiclayo-result.png', fullPage: true });
      console.log('   📸 Screenshot guardado en screenshots/chiclayo-result.png');
    } catch (e) {
      console.log('   ⚠️ No se pudo guardar screenshot');
    }
    
    const datos = await page.evaluate((placa) => {
      const resultado = {
        success: true,
        placa: placa.toUpperCase(),
        infracciones: [],
        mensaje: null
      };
      
      const bodyText = document.body.innerText.toLowerCase();
      const textContent = document.body.textContent.toLowerCase();
      const combinedText = bodyText + ' ' + textContent;
      
      // Verificar si hay mensaje de "no hay resultados"
      if (combinedText.includes('no produjo resultados') || 
          combinedText.includes('no se encontr') ||
          combinedText.includes('sin registros') ||
          combinedText.includes('no hay') ||
          combinedText.includes('no cuenta con') ||
          combinedText.includes('no tiene') ||
          combinedText.includes('no existe')) {
        resultado.mensaje = 'Este vehículo no cuenta con infracciones registradas en la Municipalidad de Chiclayo';
        return resultado;
      }
      
      // Buscar tabla de resultados
      const tableSelectors = [
        'table',
        'table.table',
        'table[class*="table" i]',
        '.card table',
        '.body table'
      ];
      
      let tabla = null;
      for (const selector of tableSelectors) {
        tabla = document.querySelector(selector);
        if (tabla) {
          const rows = tabla.querySelectorAll('tr');
          if (rows.length > 1) { // Más de una fila (header + datos)
            break;
          }
        }
      }
      
      if (!tabla) {
        resultado.mensaje = 'Este vehículo no cuenta con infracciones registradas en la Municipalidad de Chiclayo';
        return resultado;
      }
      
      // Extraer filas de la tabla
      const rows = tabla.querySelectorAll('tr');
      
      if (rows.length <= 1) {
        resultado.mensaje = 'Este vehículo no cuenta con infracciones registradas en la Municipalidad de Chiclayo';
        return resultado;
      }
      
      // Detectar si la primera fila es header
      const firstRow = rows[0];
      const firstRowCells = firstRow.querySelectorAll('th, td');
      const firstRowText = firstRow.textContent.toLowerCase();
      const isHeaderRow = firstRow.querySelectorAll('th').length > 0 ||
                         firstRowText.includes('número') ||
                         firstRowText.includes('fecha') ||
                         firstRowText.includes('placa') ||
                         firstRowText.includes('infracción');
      
      const startIndex = isHeaderRow ? 1 : 0;
      
      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');
        
        if (cells.length === 0) continue;
        
        // Obtener texto de todas las celdas
        const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
        const rowText = cellTexts.join(' ').toLowerCase();
        
        // Saltar filas que parecen headers o están vacías
        if (rowText.includes('infracciones') ||
            rowText.includes('placa') ||
            rowText.includes('número') ||
            rowText.length < 5) {
          continue;
        }
        
        // Extraer datos de cada celda (estructura puede variar)
        const infraccion = {
          numero: cellTexts[0] || '',
          fecha: cellTexts[1] || '',
          infraccion: cellTexts[2] || '',
          monto: cellTexts[3] || '',
          estado: cellTexts[4] || '',
          observaciones: cellTexts[5] || ''
        };
        
        // Solo agregar si tiene al menos un campo con datos válidos
        const hasValidData = infraccion.numero && infraccion.numero.length > 2 && !infraccion.numero.toLowerCase().includes('infracciones') ||
                            infraccion.fecha && infraccion.fecha.length > 5 ||
                            infraccion.infraccion && infraccion.infraccion.length > 2 ||
                            infraccion.monto && infraccion.monto.length > 1;
        
        if (hasValidData) {
          resultado.infracciones.push(infraccion);
        }
      }
      
      if (resultado.infracciones.length === 0) {
        resultado.mensaje = 'Este vehículo no cuenta con infracciones registradas en la Municipalidad de Chiclayo';
      }
      
      return resultado;
    }, placa);
    
    console.log(`   📊 Infracciones encontradas: ${datos.infracciones.length}`);
    if (datos.infracciones.length > 0) {
      datos.infracciones.forEach((inf, idx) => {
        console.log(`      ${idx + 1}. ${inf.numero} - ${inf.fecha} - ${inf.infraccion}`);
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

module.exports = ChiclayoInfraccionesScraper;
