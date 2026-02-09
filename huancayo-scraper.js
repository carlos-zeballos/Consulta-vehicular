/**
 * HUANCAYO - PAPELETAS SCRAPER
 * Consulta de papeletas de tránsito en SATH Huancayo
 * Solo requiere PLACA
 */

const { chromium } = require('playwright');
const axios = require('axios');

class HuancayoPapeletasScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'http://sathuancayo.fortiddns.com:888/VentanillaVirtual/ConsultaPIT.aspx';
    this.stats = { attempts: 0, successes: 0, failures: 0 };
  }

  // ==================== MÉTODO PRINCIPAL ====================
  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [HUANCAYO] Iniciando consulta para: ${placa}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarPlacaIntento(placa);
        
        if (resultado.success) {
          console.log(`✅ [HUANCAYO] CONSULTA EXITOSA en intento ${attempt}`);
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
      
      // 3. LLENAR FORMULARIO (solo placa)
      console.log('📝 Llenando formulario...');
      await this.fillForm(page, placa);
      
      // 4. ENVIAR FORMULARIO
      console.log('📤 Enviando formulario...');
      await this.submitForm(page);
      
      // 5. ESPERAR RESULTADOS
      console.log('⏳ Esperando resultados...');
      await this.delay(5000);
      
      // 6. EXTRAER RESULTADOS
      console.log('📊 Extrayendo resultados...');
      const resultados = await this.extractResults(page, placa);
      
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
      // Esperar que aparezca el input de placa
      await page.waitForSelector('#ContentPlaceHolder1_txtPlaca', { timeout });
      console.log('   ✅ Formulario cargado');
      await this.delay(1000);
    } catch (error) {
      console.error('   ❌ Error esperando formulario:', error.message);
      // Continuar de todas formas
    }
  }

  async fillForm(page, placa) {
    // Buscar input de placa
    const placaSelectors = [
      '#ContentPlaceHolder1_txtPlaca',
      'input[name*="txtPlaca" i]',
      'input[id*="placa" i]',
      'input[placeholder*="placa" i]',
      'input[type="text"]'
    ];
    
    let placaInput = null;
    for (const selector of placaSelectors) {
      try {
        const input = await page.$(selector);
        if (input) {
          await page.fill(selector, placa);
          console.log(`   ✅ Placa ingresada: ${placa} (selector: ${selector})`);
          placaInput = input;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!placaInput) {
      throw new Error('No se encontró el input de placa');
    }
    
    await this.delay(500);
  }

  async submitForm(page) {
    // Buscar botón de búsqueda
    const buttonSelectors = [
      '#ContentPlaceHolder1_btnBuscarPlaca',
      'input[type="submit"][value*="Buscar" i]',
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Buscar")'
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

  async extractResults(page, placa) {
    try {
      console.log('   🔍 Extrayendo datos de la tabla...');
      await this.delay(3000);
      
      // Esperar a que aparezca la tabla de resultados
      try {
        await page.waitForSelector('table', { timeout: 10000 });
      } catch (e) {
        console.log('   ⚠️ Tabla no encontrada, buscando en todo el DOM...');
      }
      
      const datos = await page.evaluate(() => {
        const papeletas = [];
        
        // Buscar tabla de resultados
        const tables = document.querySelectorAll('table');
        
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          
          // Buscar fila de datos (saltar header)
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.querySelectorAll('td');
            
            if (cells.length >= 2) {
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
          placa: placa,
          papeletas: datos,
          timestamp: new Date().toISOString()
        };
      }
      
      console.log('   ⚠️ No se encontraron papeletas');
      return {
        success: true,
        placa: placa,
        papeletas: [],
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      console.error('   ⚠️ Error extrayendo del DOM:', e.message);
      return {
        success: true,
        placa: placa,
        papeletas: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = HuancayoPapeletasScraper;
