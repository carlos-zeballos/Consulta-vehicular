/**
 * CAJAMARCA - PAPELETAS SCRAPER
 * Consulta de récord vehicular en SAT Cajamarca
 * Requiere PLACA (o DNI/RUC para otras consultas)
 */

const { chromium } = require('playwright');
const axios = require('axios');

class CajamarcaPapeletasScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://www.satcajamarca.gob.pe/consultas';
    this.stats = { attempts: 0, successes: 0, failures: 0 };
  }

  // ==================== MÉTODO PRINCIPAL ====================
  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [CAJAMARCA] Iniciando consulta para: ${placa}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarPlacaIntento(placa);
        
        if (resultado.success) {
          console.log(`✅ [CAJAMARCA] CONSULTA EXITOSA en intento ${attempt}`);
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
      
      // 3. LLENAR FORMULARIO (placa)
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
      await page.waitForSelector('#placa, input[id*="placa"], input[placeholder*="placa"]', { timeout });
      console.log('   ✅ Formulario cargado');
      await this.delay(1000);
    } catch (error) {
      console.error('   ❌ Error esperando formulario:', error.message);
    }
  }

  async fillForm(page, placa) {
    // Buscar input de placa
    const placaSelectors = [
      '#placa',
      'input[id*="placa" i]',
      'input[placeholder*="placa" i]',
      'input[placeholder*="Ingrese placa" i]',
      'input[type="text"]'
    ];
    
    let placaInput = null;
    for (const selector of placaSelectors) {
      try {
        const input = await page.$(selector);
        if (input) {
          await page.fill(selector, placa.toUpperCase());
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
      'button:has-text("Buscar")',
      'button:has-text("buscar")',
      'button[onclick*="buscarRecord"]',
      'button.btn-outline-primary',
      'button[type="button"]'
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
      // Intentar con evaluate
      await page.evaluate(() => {
        const btn = document.querySelector('button[onclick*="buscarRecord"]');
        if (btn) btn.click();
      });
      console.log('   ✅ Botón clickeado usando evaluate');
    }
  }

  async extractResults(page, placa) {
    try {
      console.log('   🔍 Extrayendo datos de la página...');
      await this.delay(3000);
      
      // La página puede redirigir o mostrar resultados en la misma página
      const currentUrl = page.url();
      console.log(`   📍 URL actual: ${currentUrl}`);
      
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
            
            if (cells.length >= 2) {
              const papeleta = {
                numero: cells[0]?.textContent.trim() || '',
                fecha: cells[1]?.textContent.trim() || '',
                infraccion: cells[2]?.textContent.trim() || '',
                importe: cells[3]?.textContent.trim() || '',
                estado: cells[4]?.textContent.trim() || ''
              };
              
              // Validar que no sea un título de columna ni datos placeholder
              const numeroLower = (papeleta.numero || '').toLowerCase();
              const infraccionLower = (papeleta.infraccion || '').toLowerCase();
              const fecha = (papeleta.fecha || '').trim();
              const importe = (papeleta.importe || '').trim();
              const estado = (papeleta.estado || '').trim();
              
              const titulosColumnas = ['numero', 'nro', 'número', 'fecha', 'infraccion', 'infracción',
                                       'descripcion', 'descripción', 'importe', 'monto', 'estado',
                                       'consulta', 'tabla'];
              
              const esTitulo = titulosColumnas.some(titulo => 
                numeroLower.includes(titulo) || infraccionLower.includes(titulo)
              );
              
              // Detectar datos placeholder según la imagen: "Desc:", "0.00", "-", "-", "-"
              const esPlaceholder = (
                numeroLower.includes('desc:') ||
                numeroLower.includes('desc') ||
                (fecha === '0.00' || fecha === '0') ||
                (importe === '-' || importe === '0.00' || importe === '0') ||
                (estado === '-' || estado === '') ||
                (infraccionLower === '-' || infraccionLower === '')
              );
              
              // Debe tener datos reales válidos
              const tieneDatosReales = papeleta.numero && 
                                       papeleta.numero.length > 0 &&
                                       !esPlaceholder &&
                                       (fecha && fecha !== '0.00' && fecha !== '0' && fecha !== '-') ||
                                       (importe && importe !== '0.00' && importe !== '0' && importe !== '-') ||
                                       (estado && estado !== '-');
              
              if (!esTitulo && tieneDatosReales) {
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

module.exports = CajamarcaPapeletasScraper;
