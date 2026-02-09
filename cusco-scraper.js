/**
 * CUSCO - PAPELETAS SCRAPER
 * Consulta de record de infracciones en Municipalidad Provincial del Cusco
 * Requiere PLACA, DNI o LICENCIA
 */

const { chromium } = require('playwright');
const axios = require('axios');

class CuscoPapeletasScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://cusco.gob.pe/informatica/index.php/';
    this.stats = { attempts: 0, successes: 0, failures: 0 };
  }

  // ==================== MÉTODO PRINCIPAL ====================
  async consultar(placa = null, dni = null, licencia = null, maxAttempts = 3) {
    const tipo = placa ? 'P' : (dni ? 'D' : 'L');
    const valor = placa || dni || licencia;
    
    console.log(`\n🔍 [CUSCO] Iniciando consulta - Tipo: ${tipo}, Valor: ${valor}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarIntento(placa, dni, licencia);
        
        if (resultado.success) {
          console.log(`✅ [CUSCO] CONSULTA EXITOSA en intento ${attempt}`);
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
  async consultarIntento(placa = null, dni = null, licencia = null) {
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
      await this.selectTipoBusqueda(page, placa, dni, licencia);
      
      // 4. LLENAR FORMULARIO
      console.log('📝 Llenando formulario...');
      await this.fillForm(page, placa, dni, licencia);
      
      // 5. ENVIAR FORMULARIO
      console.log('📤 Enviando formulario...');
      await this.submitForm(page);
      
      // 6. ESPERAR RESULTADOS
      console.log('⏳ Esperando resultados...');
      await this.delay(5000);
      
      // 7. EXTRAER RESULTADOS
      console.log('📊 Extrayendo resultados...');
      const resultados = await this.extractResults(page, placa, dni, licencia);
      
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
      await page.waitForSelector('#tx_numero, input[type="text"]', { timeout });
      console.log('   ✅ Formulario cargado');
      await this.delay(1000);
    } catch (error) {
      console.error('   ❌ Error esperando formulario:', error.message);
    }
  }

  async selectTipoBusqueda(page, placa, dni, licencia) {
    const tipo = placa ? 'P' : (dni ? 'D' : 'L');
    
    // Seleccionar radio button según tipo
    const radioSelectors = [
      `input[type="radio"][name="rb_tipo"][value="${tipo}"]`,
      `input[type="radio"][value="${tipo}"]`
    ];
    
    for (const selector of radioSelectors) {
      try {
        await page.click(selector);
        console.log(`   ✅ Tipo de búsqueda seleccionado: ${tipo}`);
        await this.delay(500);
        return;
      } catch (e) {
        continue;
      }
    }
  }

  async fillForm(page, placa, dni, licencia) {
    const valor = placa || dni || licencia;
    
    // Buscar input de número
    const inputSelectors = [
      '#tx_numero',
      'input[type="text"]',
      'input[id*="numero" i]'
    ];
    
    let inputFound = null;
    for (const selector of inputSelectors) {
      try {
        const input = await page.$(selector);
        if (input) {
          await page.fill(selector, valor);
          console.log(`   ✅ Valor ingresado: ${valor} (selector: ${selector})`);
          inputFound = input;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!inputFound) {
      throw new Error('No se encontró el input de búsqueda');
    }
    
    await this.delay(500);
  }

  async submitForm(page) {
    const buttonSelectors = [
      '#bt_consultar',
      'button:has-text("CONSULTAR")',
      'button:has-text("Consultar")',
      'button[type="button"]',
      'input[type="submit"]'
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

  async extractResults(page, placa, dni, licencia) {
    try {
      console.log('   🔍 Extrayendo datos de la tabla...');
      await this.delay(3000);
      
      try {
        await page.waitForSelector('#ct_tabla, table', { timeout: 10000 });
      } catch (e) {
        console.log('   ⚠️ Tabla no encontrada...');
      }
      
      const datos = await page.evaluate(() => {
        const papeletas = [];
        
        const table = document.querySelector('#ct_tabla') || document.querySelector('table');
        
        if (table) {
          const rows = table.querySelectorAll('tr');
          
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.querySelectorAll('td');
            
            // Buscar filas con datos (saltar headers)
            if (cells.length >= 3) {
              const papeleta = {
                numero: cells[0]?.textContent.trim() || '',
                papeleta: cells[1]?.textContent.trim() || '',
                infraccion: cells[2]?.textContent.trim() || '',
                situacion: cells[3]?.textContent.trim() || '',
                estado: cells[4]?.textContent.trim() || '',
                detalles: cells[5]?.textContent.trim() || ''
              };
              
              if (papeleta.numero || papeleta.papeleta) {
                papeletas.push(papeleta);
              }
            }
          }
        }
        
        // Verificar si hay mensaje de "LIBRE DE INFRACCIONES"
        const bodyText = document.body.innerText || '';
        if (bodyText.includes('LIBRE DE INFRACCIONES') || bodyText.includes('libre de infracciones')) {
          return { libre: true, papeletas: [] };
        }
        
        return papeletas;
      });
      
      if (datos.libre) {
        console.log('   ✅ Vehículo libre de infracciones');
        return {
          success: true,
          placa: placa || null,
          dni: dni || null,
          licencia: licencia || null,
          papeletas: [],
          libre: true,
          timestamp: new Date().toISOString()
        };
      }
      
      if (datos && datos.length > 0) {
        console.log(`   ✅ ${datos.length} papeleta(s) encontrada(s)`);
        return {
          success: true,
          placa: placa || null,
          dni: dni || null,
          licencia: licencia || null,
          papeletas: datos,
          timestamp: new Date().toISOString()
        };
      }
      
      console.log('   ⚠️ No se encontraron papeletas');
      return {
        success: true,
        placa: placa || null,
        dni: dni || null,
        licencia: licencia || null,
        papeletas: [],
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      console.error('   ⚠️ Error extrayendo del DOM:', e.message);
      return {
        success: true,
        placa: placa || null,
        dni: dni || null,
        licencia: licencia || null,
        papeletas: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CuscoPapeletasScraper;
