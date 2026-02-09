/**
 * CHACHAPOYAS - PAPELETAS SCRAPER
 * Consulta de papeletas en Municipalidad Provincial de Chachapoyas
 * Requiere PLACA, DNI o NUMERO DE PAPELETA
 */

const { chromium } = require('playwright');
const axios = require('axios');

class ChachapoyasPapeletasScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://app.munichachapoyas.gob.pe/servicios/consulta_papeletas/app/papeletas.php';
    this.stats = { attempts: 0, successes: 0, failures: 0 };
  }

  // ==================== MÉTODO PRINCIPAL ====================
  async consultar(placa = null, dni = null, papeleta = null, maxAttempts = 3) {
    console.log(`\n🔍 [CHACHAPOYAS] Iniciando consulta - Placa: ${placa || 'N/A'}, DNI: ${dni || 'N/A'}, Papeleta: ${papeleta || 'N/A'}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarIntento(placa, dni, papeleta);
        
        if (resultado.success) {
          console.log(`✅ [CHACHAPOYAS] CONSULTA EXITOSA en intento ${attempt}`);
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
  async consultarIntento(placa = null, dni = null, papeleta = null) {
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
      
      // 3. LLENAR FORMULARIO
      console.log('📝 Llenando formulario...');
      await this.fillForm(page, placa, dni, papeleta);
      
      // 4. ENVIAR FORMULARIO
      console.log('📤 Enviando formulario...');
      await this.submitForm(page);
      
      // 5. ESPERAR RESULTADOS
      console.log('⏳ Esperando resultados...');
      await this.delay(5000);
      
      // 6. EXTRAER RESULTADOS
      console.log('📊 Extrayendo resultados...');
      const resultados = await this.extractResults(page, placa, dni, papeleta);
      
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
      await page.waitForSelector('#placa_cnt, #dni_cnt, #nombre_cnt', { timeout });
      console.log('   ✅ Formulario cargado');
      await this.delay(1000);
    } catch (error) {
      console.error('   ❌ Error esperando formulario:', error.message);
    }
  }

  async fillForm(page, placa, dni, papeleta) {
    // El formulario permite buscar por placa, dni o número de papeleta
    // Solo se puede usar uno a la vez
    
    if (placa) {
      // Deshabilitar otros campos y llenar placa
      await page.evaluate(() => {
        const placaInput = document.getElementById('placa_cnt');
        const dniInput = document.getElementById('dni_cnt');
        const papeletaInput = document.getElementById('nombre_cnt');
        
        if (placaInput) {
          dniInput.disabled = true;
          papeletaInput.disabled = true;
        }
      });
      
      await page.fill('#placa_cnt', placa);
      console.log(`   ✅ Placa ingresada: ${placa}`);
    } else if (dni) {
      await page.evaluate(() => {
        const placaInput = document.getElementById('placa_cnt');
        const dniInput = document.getElementById('dni_cnt');
        const papeletaInput = document.getElementById('nombre_cnt');
        
        if (dniInput) {
          placaInput.disabled = true;
          papeletaInput.disabled = true;
        }
      });
      
      await page.fill('#dni_cnt', dni);
      console.log(`   ✅ DNI ingresado: ${dni}`);
    } else if (papeleta) {
      await page.evaluate(() => {
        const placaInput = document.getElementById('placa_cnt');
        const dniInput = document.getElementById('dni_cnt');
        const papeletaInput = document.getElementById('nombre_cnt');
        
        if (papeletaInput) {
          placaInput.disabled = true;
          dniInput.disabled = true;
        }
      });
      
      await page.fill('#nombre_cnt', papeleta);
      console.log(`   ✅ Número de papeleta ingresado: ${papeleta}`);
    } else {
      throw new Error('Debe proporcionar placa, dni o número de papeleta');
    }
    
    await this.delay(500);
  }

  async submitForm(page) {
    const buttonSelectors = [
      '#btnConsulta',
      'button:has-text("Consultar")',
      'button[type="button"]',
      'button.btn-success'
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

  async extractResults(page, placa, dni, papeleta) {
    try {
      console.log('   🔍 Extrayendo datos de la tabla...');
      await this.delay(3000);
      
      try {
        await page.waitForSelector('#resultado, table', { timeout: 10000 });
      } catch (e) {
        console.log('   ⚠️ Tabla no encontrada...');
      }
      
      const datos = await page.evaluate(() => {
        const papeletas = [];
        
        // Buscar en el div resultado
        const resultadoDiv = document.getElementById('resultado');
        if (resultadoDiv) {
          const tables = resultadoDiv.querySelectorAll('table');
          
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
        }
        
        // Verificar si hay mensaje de error o sin resultados
        const bodyText = document.body.innerText || '';
        if (bodyText.includes('No se encontraron resultados') || bodyText.includes('no se encontraron')) {
          return { sinResultados: true, papeletas: [] };
        }
        
        return papeletas;
      });
      
      if (datos.sinResultados) {
        console.log('   ⚠️ No se encontraron resultados');
        return {
          success: true,
          placa: placa || null,
          dni: dni || null,
          papeleta: papeleta || null,
          papeletas: [],
          timestamp: new Date().toISOString()
        };
      }
      
      if (datos && datos.length > 0) {
        console.log(`   ✅ ${datos.length} papeleta(s) encontrada(s)`);
        return {
          success: true,
          placa: placa || null,
          dni: dni || null,
          papeleta: papeleta || null,
          papeletas: datos,
          timestamp: new Date().toISOString()
        };
      }
      
      console.log('   ⚠️ No se encontraron papeletas');
      return {
        success: true,
        placa: placa || null,
        dni: dni || null,
        papeleta: papeleta || null,
        papeletas: [],
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      console.error('   ⚠️ Error extrayendo del DOM:', e.message);
      return {
        success: true,
        placa: placa || null,
        dni: dni || null,
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

module.exports = ChachapoyasPapeletasScraper;
