/**
 * TRUJILLO - RECORD DE INFRACCIONES SCRAPER
 * Consulta de record de infracciones en SATT Trujillo
 * Requiere DNI, CELULAR, CORREO
 * Usa iframe para el formulario
 */

const { chromium } = require('playwright');
const axios = require('axios');

class TrujilloRecordScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://satt.gob.pe/servicios/record-de-infracciones';
    this.iframeURL = 'https://digital.satt.gob.pe/sigo/servicios/Record%20de%20Infracciones/registro.asp';
    this.stats = { attempts: 0, successes: 0, failures: 0 };
  }

  // ==================== MÉTODO PRINCIPAL ====================
  async consultar(dni, celular, correo, maxAttempts = 3) {
    console.log(`\n🔍 [TRUJILLO] Iniciando consulta - DNI: ${dni}, Celular: ${celular}, Correo: ${correo}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarIntento(dni, celular, correo);
        
        if (resultado.success) {
          console.log(`✅ [TRUJILLO] CONSULTA EXITOSA en intento ${attempt}`);
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
  async consultarIntento(dni, celular, correo) {
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
      console.log('🌐 Navegando al sitio...');
      await page.goto(this.baseURL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      await this.delay(2000);
      
      // 2. ESPERAR Y ACCEDER AL IFRAME
      console.log('⏳ Esperando iframe...');
      await this.waitForIframe(page);
      
      // 3. ACCEDER AL IFRAME
      console.log('📦 Accediendo al iframe...');
      const iframe = await this.getIframe(page);
      
      if (!iframe) {
        throw new Error('No se pudo acceder al iframe del formulario');
      }
      
      // 4. ESPERAR A QUE CARGUE EL FORMULARIO EN EL IFRAME
      console.log('⏳ Esperando que el formulario se cargue...');
      await this.waitForFormEnabled(iframe);
      
      // 5. LLENAR FORMULARIO
      console.log('📝 Llenando formulario...');
      await this.fillForm(iframe, dni, celular, correo);
      
      // 6. ENVIAR FORMULARIO
      console.log('📤 Enviando formulario...');
      await this.submitForm(iframe);
      
      // 7. ESPERAR RESULTADOS
      console.log('⏳ Esperando resultados...');
      await this.delay(5000);
      
      // 8. EXTRAER RESULTADOS
      console.log('📊 Extrayendo resultados...');
      const resultados = await this.extractResults(iframe, dni);
      
      await browser.close();
      return resultados;
      
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  // ==================== FUNCIONES CRÍTICAS ====================

  async waitForIframe(page, timeout = 20000) {
    console.log('   ⏳ Esperando iframe...');
    
    try {
      await page.waitForSelector('iframe[id="blockrandom"], iframe[name="iframe"], iframe[src*="sigo"]', { timeout });
      console.log('   ✅ Iframe encontrado');
      await this.delay(1000);
    } catch (error) {
      console.error('   ❌ Error esperando iframe:', error.message);
      throw error;
    }
  }

  async getIframe(page) {
    try {
      // Buscar iframe
      const iframeElement = await page.$('iframe[id="blockrandom"], iframe[name="iframe"], iframe[src*="sigo"]');
      
      if (iframeElement) {
        const iframe = await iframeElement.contentFrame();
        if (iframe) {
          console.log('   ✅ Iframe accedido correctamente');
          return iframe;
        }
      }
      
      // Alternativa: buscar por frames
      const frames = page.frames();
      for (const frame of frames) {
        const url = frame.url();
        if (url.includes('sigo') || url.includes('Record')) {
          console.log(`   ✅ Frame encontrado: ${url}`);
          return frame;
        }
      }
      
      return null;
    } catch (error) {
      console.error('   ❌ Error accediendo al iframe:', error.message);
      return null;
    }
  }

  async waitForFormEnabled(iframe, timeout = 20000) {
    console.log('   ⏳ Verificando estado del formulario en iframe...');
    
    try {
      await iframe.waitForSelector('input[type="text"], input[name*="dni"], input[name*="celular"], input[name*="correo"]', { timeout });
      console.log('   ✅ Formulario cargado en iframe');
      await this.delay(1000);
    } catch (error) {
      console.error('   ❌ Error esperando formulario:', error.message);
    }
  }

  async fillForm(iframe, dni, celular, correo) {
    // Buscar inputs en el iframe
    const inputSelectors = [
      { field: 'dni', selectors: ['input[name*="dni" i]', 'input[id*="dni" i]', 'input[placeholder*="dni" i]'] },
      { field: 'celular', selectors: ['input[name*="celular" i]', 'input[id*="celular" i]', 'input[placeholder*="celular" i]', 'input[type="tel"]'] },
      { field: 'correo', selectors: ['input[name*="correo" i]', 'input[name*="email" i]', 'input[id*="correo" i]', 'input[type="email"]'] }
    ];
    
    for (const { field, selectors } of inputSelectors) {
      const value = field === 'dni' ? dni : (field === 'celular' ? celular : correo);
      
      let inputFound = false;
      for (const selector of selectors) {
        try {
          const input = await iframe.$(selector);
          if (input) {
            await iframe.fill(selector, value);
            console.log(`   ✅ ${field} ingresado: ${value} (selector: ${selector})`);
            inputFound = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!inputFound) {
        console.log(`   ⚠️ No se encontró input para ${field}, intentando con todos los inputs...`);
        // Último recurso: buscar todos los inputs y llenar por orden
        const allInputs = await iframe.$$('input[type="text"], input[type="tel"], input[type="email"]');
        if (allInputs.length >= 3) {
          await allInputs[0].fill(dni);
          await allInputs[1].fill(celular);
          await allInputs[2].fill(correo);
          console.log(`   ✅ Campos llenados por orden`);
          break;
        }
      }
    }
    
    await this.delay(500);
  }

  async submitForm(iframe) {
    const buttonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Buscar")',
      'button:has-text("Consultar")',
      'button'
    ];
    
    let buttonFound = false;
    for (const selector of buttonSelectors) {
      try {
        await iframe.waitForSelector(selector, { timeout: 3000 });
        await iframe.click(selector);
        buttonFound = true;
        console.log(`   ✅ Botón clickeado (selector: ${selector})`);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!buttonFound) {
      throw new Error('No se encontró el botón de envío en el iframe');
    }
  }

  async extractResults(iframe, dni) {
    try {
      console.log('   🔍 Extrayendo datos de la tabla en iframe...');
      await this.delay(3000);
      
      try {
        await iframe.waitForSelector('table, .table, [id*="resultado"]', { timeout: 10000 });
      } catch (e) {
        console.log('   ⚠️ Tabla no encontrada...');
      }
      
      const datos = await iframe.evaluate(() => {
        const infracciones = [];
        
        // Buscar tablas
        const tables = document.querySelectorAll('table, .table');
        
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.querySelectorAll('td');
            
            if (cells.length >= 2) {
              const infraccion = {
                numero: cells[0]?.textContent.trim() || '',
                fecha: cells[1]?.textContent.trim() || '',
                descripcion: cells[2]?.textContent.trim() || '',
                estado: cells[3]?.textContent.trim() || ''
              };
              
              // Validar que no sea un título de columna
              const numeroLower = (infraccion.numero || '').toLowerCase();
              const descripcionLower = (infraccion.descripcion || '').toLowerCase();
              
              const titulosColumnas = ['numero', 'nro', 'número', 'fecha', 'infraccion', 'infracción',
                                       'descripcion', 'descripción', 'estado', 'consulta', 'tabla'];
              
              const esTitulo = titulosColumnas.some(titulo => 
                numeroLower.includes(titulo) || descripcionLower.includes(titulo)
              );
              
              if (infraccion.numero && !esTitulo) {
                infracciones.push(infraccion);
              }
            }
          }
        }
        
        return infracciones;
      });
      
      if (datos && datos.length > 0) {
        console.log(`   ✅ ${datos.length} infracción(es) encontrada(s)`);
        return {
          success: true,
          dni: dni,
          infracciones: datos,
          timestamp: new Date().toISOString()
        };
      }
      
      console.log('   ⚠️ No se encontraron infracciones');
      return {
        success: true,
        dni: dni,
        infracciones: [],
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      console.error('   ⚠️ Error extrayendo del DOM:', e.message);
      return {
        success: true,
        dni: dni,
        infracciones: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TrujilloRecordScraper;
