const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class MTCCITVScraper {
  constructor(captchaApiKey) {
    this.baseURL = 'https://rec.mtc.gob.pe/Citv/ArConsultaCitv';
    // Limpiar y validar API key
    if (captchaApiKey) {
      captchaApiKey = captchaApiKey.trim();
      // Extraer solo la parte válida (32 caracteres hexadecimales)
      const match = captchaApiKey.match(/^([a-f0-9]{32})/i);
      if (match) {
        this.captchaApiKey = match[1];
      } else {
        this.captchaApiKey = captchaApiKey; // Usar tal cual si no coincide el patrón
      }
    } else {
      this.captchaApiKey = null;
    }
    this.stats = { attempts: 0, successes: 0, failures: 0 };
  }

  // ==================== MÉTODO PRINCIPAL ====================
  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [MTC-FINAL] Iniciando consulta para: ${placa}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarPlacaIntento(placa);
        
        if (resultado.success) {
          console.log(`✅ [MTC-FINAL] CONSULTA EXITOSA en intento ${attempt}`);
          this.stats.successes++;
          return resultado;
        }
        
        console.log(`⚠️ Intento ${attempt} falló, reintentando...`);
        await this.delay(3000); // Esperar antes de reintentar
        
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
      headless: true, // Cambiar a false para debug
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
      try {
        await page.goto(this.baseURL, {
          waitUntil: 'domcontentloaded',
          timeout: 30000 // Aumentado a 30s
        });
      } catch (navError) {
        console.log('   ⚠️ Error en navegación inicial, intentando con networkidle...');
        await page.goto(this.baseURL, {
          waitUntil: 'networkidle',
          timeout: 45000
        });
      }

      // 2. ESPERAR A QUE SE HABILITE EL FORMULARIO (¡CRÍTICO!)
      console.log('⏳ Esperando que el formulario se habilite...');
      await this.waitForFormEnabled(page);
      
      // 3. LLENAR FORMULARIO
      console.log('📝 Llenando formulario...');
      await this.fillForm(page, placa);
      
      // 4. RESOLVER CAPTCHA
      console.log('🔐 Resolviendo CAPTCHA...');
      let captchaText;
      try {
        captchaText = await this.solveCaptcha(page);
      } catch (captchaError) {
        // Si falla la resolución automática, lanzar error con información útil
        if (captchaError.message.includes('2CAPTCHA_API_KEY_INVALID')) {
          throw new Error(`CAPTCHA_API_KEY_INVALID: ${captchaError.message}. Configure una API key válida de 2Captcha en el archivo .env`);
        }
        throw captchaError;
      }
      
      // 5. ENVIAR CONSULTA (POSTBACK TRADICIONAL)
      console.log('🚀 Enviando consulta...');
      await this.submitForm(page, captchaText);
      
      // 6. EXTRAER RESULTADOS
      console.log('📊 Extrayendo datos...');
      const resultados = await this.extractResults(page);
      
      await browser.close();
      
      return {
        success: true,
        placa: placa,
        registros: resultados,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  // ==================== FUNCIONES CRÍTICAS ====================

  // 🆕 1. ESPERAR QUE EL FORMULARIO SE HABILITE
  async waitForFormEnabled(page, timeout = 30000) {
    console.log('   ⏳ Verificando estado del formulario...');
    
    try {
      await page.waitForFunction(() => {
        // Verificar que los elementos ya no están disabled
        const filtro = document.querySelector('#selBUS_Filtro');
        const placaInput = document.querySelector('#texFiltro');
        const captchaInput = document.querySelector('#texCaptcha');
        const buscarBtn = document.querySelector('#btnBuscar');
        
        const allEnabled = filtro && !filtro.disabled &&
                          placaInput && !placaInput.disabled &&
                          captchaInput && !captchaInput.disabled;
        
        const btnVisible = buscarBtn && 
                          buscarBtn.style.display !== 'none' &&
                          buscarBtn.offsetParent !== null;
        
        return allEnabled && btnVisible;
      }, { timeout });
      
      console.log('   ✅ Formulario habilitado');
      
      // Verificar estado final
      const estadoFinal = await page.evaluate(() => {
        const filtro = document.querySelector('#selBUS_Filtro');
        const placaInput = document.querySelector('#texFiltro');
        const captchaInput = document.querySelector('#texCaptcha');
        const buscarBtn = document.querySelector('#btnBuscar');
        
        return {
          filtro: filtro ? !filtro.disabled : false,
          placa: placaInput ? !placaInput.disabled : false,
          captcha: captchaInput ? !captchaInput.disabled : false,
          boton: buscarBtn ? buscarBtn.style.display !== 'none' : false
        };
      });
      
      console.log(`   📊 Estado final:`, estadoFinal);
      
      // Pequeño delay para estabilizar
      await page.waitForTimeout(1500);
    } catch (error) {
      console.error('   ❌ Error esperando formulario:', error.message);
      
      // Intentar obtener estado actual para debugging
      const estadoActual = await page.evaluate(() => {
        const filtro = document.querySelector('#selBUS_Filtro');
        const placaInput = document.querySelector('#texFiltro');
        const captchaInput = document.querySelector('#texCaptcha');
        const buscarBtn = document.querySelector('#btnBuscar');
        
        return {
          filtroExiste: !!filtro,
          filtroDisabled: filtro ? filtro.disabled : null,
          placaExiste: !!placaInput,
          placaDisabled: placaInput ? placaInput.disabled : null,
          captchaExiste: !!captchaInput,
          captchaDisabled: captchaInput ? captchaInput.disabled : null,
          botonExiste: !!buscarBtn,
          botonDisplay: buscarBtn ? buscarBtn.style.display : null,
          botonVisible: buscarBtn ? buscarBtn.offsetParent !== null : null
        };
      });
      
      console.log('   📊 Estado actual del formulario:', estadoActual);
      throw new Error(`Formulario no se habilitó después de ${timeout}ms`);
    }
  }

  // 🆕 2. LLENAR FORMULARIO
  async fillForm(page, placa) {
    // Seleccionar "Placa" (value="1")
    await page.selectOption('#selBUS_Filtro', '1');
    await this.delay(500);
    
    // Escribir placa (se convierte automáticamente a mayúsculas)
    await page.fill('#texFiltro', placa);
    await this.delay(500);
  }

  // 🆕 3. RESOLVER CAPTCHA
  async solveCaptcha(page, captchaManual = null) {
    // Si se proporciona captcha manual, usarlo directamente
    if (captchaManual) {
      console.log(`   📝 Usando captcha manual: ${captchaManual}`);
      await page.fill('#texCaptcha', captchaManual);
      await this.delay(500);
      return captchaManual;
    }
    
    // Obtener imagen del captcha (Base64 del DOM)
    console.log('   📸 Obteniendo imagen del captcha...');
    const imgElement = await page.$('#imgCaptcha');
    if (!imgElement) {
      throw new Error('No se encontró el elemento #imgCaptcha');
    }
    
    const src = await imgElement.getAttribute('src');
    
    if (!src || !src.startsWith('data:image')) {
      throw new Error('No se pudo obtener la imagen del captcha (src inválido)');
    }
    
    console.log(`   ✅ Imagen captcha obtenida (longitud: ${src.length} chars)`);
    
    // Extraer Base64
    const base64Data = src.replace(/^data:image\/\w+;base64,/, '');
    
    // Resolver con 2Captcha
    if (!this.captchaApiKey) {
      throw new Error('API Key de 2Captcha no configurada. Proporcione captcha manual o configure CAPTCHA_API_KEY');
    }
    
    const captchaText = await this.resolveWith2Captcha(base64Data);
    
    // Escribir solución
    await page.fill('#texCaptcha', captchaText);
    await this.delay(500);
    
    return captchaText;
  }

  // 🆕 4. ENVIAR FORMULARIO (POSTBACK)
  async submitForm(page, captchaText) {
    console.log('   🖱️ Haciendo clic en Buscar...');
    
    // Verificar que el botón existe y es clickeable
    const button = await page.$('#btnBuscar');
    if (!button) {
      throw new Error('Botón #btnBuscar no encontrado');
    }
    
    const isVisible = await page.evaluate(() => {
      const btn = document.querySelector('#btnBuscar');
      return btn && btn.offsetParent !== null && btn.style.display !== 'none';
    });
    
    if (!isVisible) {
      throw new Error('Botón #btnBuscar no está visible');
    }
    
    console.log('   ✅ Botón verificado, haciendo clic...');
    
    // Opción 1: Intentar con waitForNavigation
    try {
      await Promise.all([
        page.waitForNavigation({
          waitUntil: 'domcontentloaded',
          timeout: 30000 // Aumentado a 30s
        }),
        page.click('#btnBuscar')
      ]);
      console.log('   ✅ Página recargada con resultados (método 1)');
      await this.delay(2000);
      return;
    } catch (navError) {
      console.log('   ⚠️ waitForNavigation falló, intentando método alternativo...');
    }
    
    // Opción 2: Hacer click y esperar cambios en el DOM
    try {
      await page.click('#btnBuscar');
      console.log('   ✅ Click realizado, esperando cambios en DOM...');
      
      // Esperar a que aparezcan los paneles de resultados
      await page.waitForSelector('#Panel1, #Panel2, #Panel3, .alert, .error', {
        timeout: 30000,
        state: 'visible'
      }).catch(() => {
        console.log('   ⚠️ Paneles no aparecieron, esperando timeout...');
      });
      
      // Esperar un poco más para que cargue completamente
      await this.delay(3000);
      console.log('   ✅ Espera completada');
      return;
    } catch (clickError) {
      console.log('   ⚠️ Método alternativo falló, intentando con evaluate...');
    }
    
    // Opción 3: Usar evaluate para hacer click directamente
    try {
      await page.evaluate(() => {
        const btn = document.querySelector('#btnBuscar');
        if (btn) {
          btn.click();
        } else {
          // Intentar con form submit
          const form = document.querySelector('form');
          if (form) {
            form.submit();
          }
        }
      });
      
      console.log('   ✅ Click via evaluate realizado, esperando...');
      
      // Esperar más tiempo para que cargue completamente
      await this.delay(8000);
      
      // Verificar si hay resultados o mensajes de error
      const pageState = await page.evaluate(() => {
        const panels = document.querySelectorAll('#Panel1, #Panel2, #Panel3');
        const errors = document.querySelectorAll('.alert-danger, .error, [class*="error" i]');
        const noData = document.body.innerText.toLowerCase().includes('no se encontr') || 
                      document.body.innerText.toLowerCase().includes('sin registros');
        
        return {
          hasPanels: panels.length > 0,
          panelCount: panels.length,
          hasErrors: errors.length > 0,
          errorText: errors.length > 0 ? errors[0].innerText : null,
          noData: noData,
          url: window.location.href
        };
      });
      
      console.log(`   📊 Estado de la página:`, pageState);
      
      if (pageState.hasPanels) {
        console.log(`   ✅ Resultados detectados (${pageState.panelCount} paneles)`);
        return;
      }
      
      if (pageState.hasErrors) {
        console.log(`   ⚠️ Error detectado: ${pageState.errorText}`);
        if (pageState.errorText && (pageState.errorText.toLowerCase().includes('captcha') || 
                                    pageState.errorText.toLowerCase().includes('código'))) {
          throw new Error('CAPTCHA_INVALID: El captcha ingresado es inválido');
        }
      }
      
      if (pageState.noData) {
        console.log('   ℹ️ No hay datos para esta placa');
        return; // Continuar para retornar array vacío
      }
      
      // Si llegamos aquí, esperar un poco más y verificar nuevamente
      console.log('   ⏳ Esperando más tiempo para que carguen los paneles...');
      await this.delay(5000);
      
      const finalCheck = await page.evaluate(() => {
        return document.querySelectorAll('#Panel1, #Panel2, #Panel3').length;
      });
      
      if (finalCheck > 0) {
        console.log(`   ✅ Paneles detectados después de espera adicional (${finalCheck} paneles)`);
        return;
      }
      
      throw new Error('No se detectaron resultados después del click');
    } catch (evaluateError) {
      throw new Error(`Error enviando formulario: ${evaluateError.message}`);
    }
  }

  // 🆕 5. EXTRAER RESULTADOS
  async extractResults(page) {
    console.log('   🔍 Buscando paneles de resultados...');
    
    // Esperar un poco más para asegurar que los paneles estén cargados
    await this.delay(2000);
    
    // Verificar si hay mensajes de error primero
    const errorMessage = await page.evaluate(() => {
      const errorSelectors = [
        '.alert-danger',
        '.error',
        '[class*="error" i]',
        '[id*="error" i]',
        '.alert-warning'
      ];
      
      for (const sel of errorSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText) {
          return el.innerText.trim();
        }
      }
      return null;
    });
    
    if (errorMessage) {
      console.log(`   ⚠️ Mensaje de error detectado: ${errorMessage}`);
      // Si es error de captcha, lanzar error específico
      if (errorMessage.toLowerCase().includes('captcha') || 
          errorMessage.toLowerCase().includes('código')) {
        throw new Error('CAPTCHA_INVALID: El captcha ingresado es inválido');
      }
    }
    
    const resultados = [];
    
    // Verificar cada panel (1, 2, 3 según la estructura)
    // Primero, esperar un poco más para asegurar que los paneles estén completamente cargados
    await this.delay(3000);
    
    // Verificar si hay paneles visibles
    const panelCount = await page.evaluate(() => {
      return document.querySelectorAll('#Panel1, #Panel2, #Panel3').length;
    });
    
    console.log(`   📊 Paneles encontrados en DOM: ${panelCount}`);
    
    if (panelCount === 0) {
      // Intentar esperar más tiempo
      console.log('   ⏳ No se encontraron paneles, esperando más tiempo...');
      await this.delay(5000);
      
      const panelCountAfterWait = await page.evaluate(() => {
        return document.querySelectorAll('#Panel1, #Panel2, #Panel3').length;
      });
      
      console.log(`   📊 Paneles después de espera: ${panelCountAfterWait}`);
      
      if (panelCountAfterWait === 0) {
        // Verificar si hay algún mensaje de "no encontrado"
        const noDataText = await page.evaluate(() => {
          const bodyText = document.body.innerText.toLowerCase();
          return bodyText.includes('no se encontr') || 
                 bodyText.includes('sin registros') ||
                 bodyText.includes('no hay datos');
        });
        
        if (noDataText) {
          console.log('   ℹ️ Mensaje "no encontrado" detectado en la página');
          return [];
        }
      }
    }
    
    for (let panelNum = 1; panelNum <= 3; panelNum++) {
      const panelId = `#Panel${panelNum}`;
      let panelExists = false;
      
      try {
        // Intentar esperar el selector con más tiempo
        await page.waitForSelector(panelId, { timeout: 5000, state: 'visible' });
        panelExists = true;
      } catch (e) {
        // Verificar si el panel existe pero no es visible
        const panelInDOM = await page.evaluate((id) => {
          const panel = document.querySelector(id);
          return panel !== null;
        }, panelId);
        
        if (panelInDOM) {
          console.log(`   ⚠️ Panel${panelNum} existe en DOM pero no es visible`);
          panelExists = true; // Intentar extraer de todas formas
        } else {
          // Panel no existe, continuar con siguiente
          continue;
        }
      }
      
      if (panelExists) {
        console.log(`   📋 Extrayendo datos del Panel${panelNum}...`);
        const panelData = await this.extractPanelData(page, panelNum);
        if (panelData && Object.keys(panelData).length > 0) {
          resultados.push(panelData);
          console.log(`   ✅ Panel${panelNum} extraído exitosamente`);
        } else {
          console.log(`   ⚠️ Panel${panelNum} existe pero no se pudieron extraer datos`);
        }
      }
    }
    
    // Si no hay paneles, verificar si hay mensaje de "no encontrado"
    if (resultados.length === 0) {
      const noDataMessage = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        if (text.includes('no se encontr') || 
            text.includes('sin registros') ||
            text.includes('no hay datos')) {
          return true;
        }
        return false;
      });
      
      if (noDataMessage) {
        console.log('   ℹ️ No se encontraron registros para esta placa');
        return []; // Retornar array vacío en lugar de error
      }
      
      // Guardar screenshot para debugging
      try {
        const screenshotsDir = path.join(__dirname, 'screenshots');
        if (!fs.existsSync(screenshotsDir)) {
          fs.mkdirSync(screenshotsDir, { recursive: true });
        }
        await page.screenshot({ 
          path: path.join(screenshotsDir, `mtc_no_results_${Date.now()}.png`),
          fullPage: true 
        });
        console.log('   📸 Screenshot guardado para debugging');
      } catch (screenshotError) {
        // Ignorar error de screenshot
      }
      
      throw new Error('No se encontraron resultados en la página después del postback');
    }
    
    console.log(`   ✅ Total de registros extraídos: ${resultados.length}`);
    return resultados;
  }

  // 🆕 6. EXTRAER DATOS DE UN PANEL
  async extractPanelData(page, panelNum) {
    const datos = {};
    
    // Extraer cada span específico
    const spanIds = [
      { key: 'empresa', id: `Spv${panelNum}_1` },
      { key: 'direccion', id: `Spv${panelNum}_2` },
      { key: 'placa', id: `Spv${panelNum}_3` },
      { key: 'certificado', id: `Spv${panelNum}_4` },
      { key: 'vigente_desde', id: `Spv${panelNum}_5` },
      { key: 'vigente_hasta', id: `Spv${panelNum}_6` },
      { key: 'resultado', id: `Spv${panelNum}_7` },
      { key: 'estado', id: `Spv${panelNum}_8` },
      { key: 'ambito', id: `Spv${panelNum}_9` },
      { key: 'tipo_servicio', id: `Spv${panelNum}_10` },
      { key: 'observaciones', id: `Spv${panelNum}_11` }
    ];
    
    for (const { key, id } of spanIds) {
      try {
        const element = await page.$(`#${id}`);
        if (element) {
          const text = await element.textContent();
          datos[key] = text ? text.trim() : null;
        } else {
          datos[key] = null;
        }
      } catch (error) {
        datos[key] = null;
      }
    }
    
    // Agregar tipo de documento
    datos.tipo_documento = panelNum === 1 ? 'ÚLTIMO' : 
                          panelNum === 2 ? 'PENÚLTIMO' : 'ANTEPENÚLTIMO';
    
    // Verificar que al menos tiene algunos datos
    const hasData = Object.values(datos).some(val => val !== null && val !== '');
    return hasData ? datos : null;
  }

  // 🆕 7. RESOLVER CAPTCHA CON 2CAPTCHA
  async resolveWith2Captcha(base64Data) {
    if (!this.captchaApiKey) {
      throw new Error('API Key de 2Captcha no configurada');
    }
    
    console.log('   🤖 Enviando captcha a 2Captcha...');
    
    const formData = new URLSearchParams();
    formData.append('key', this.captchaApiKey);
    formData.append('method', 'base64');
    formData.append('body', base64Data);
    formData.append('numeric', '4'); // Solo números
    formData.append('min_len', '4');
    formData.append('max_len', '6');
    formData.append('json', '1');
    
    try {
      // Enviar captcha
      const inResponse = await axios.post('http://2captcha.com/in.php', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });
      
      if (inResponse.data.status !== 1) {
        const errorMsg = inResponse.data.request || 'Error desconocido';
        
        // Mensajes de error más descriptivos
        if (errorMsg.includes('ERROR_WRONG_USER_KEY') || errorMsg.includes('ERROR_KEY_DOES_NOT_EXIST')) {
          throw new Error(`2CAPTCHA_API_KEY_INVALID: La API key de 2Captcha es inválida o no existe. Verifica tu CAPTCHA_API_KEY en el archivo .env`);
        }
        if (errorMsg.includes('ERROR_ZERO_BALANCE')) {
          throw new Error(`2CAPTCHA_BALANCE_ZERO: Tu cuenta de 2Captcha no tiene saldo. Agrega fondos en https://2captcha.com`);
        }
        if (errorMsg.includes('ERROR_NO_SLOT_AVAILABLE')) {
          throw new Error(`2CAPTCHA_NO_SLOT: No hay trabajadores disponibles. Intenta más tarde.`);
        }
        
        throw new Error(`2Captcha error: ${errorMsg}`);
      }
      
      const captchaId = inResponse.data.request;
      console.log(`   📝 Captcha ID: ${captchaId}`);
      
      // Esperar solución (30 segundos máximo)
      for (let i = 0; i < 15; i++) {
        await this.delay(2000);
        
        const resResponse = await axios.get('http://2captcha.com/res.php', {
          params: {
            key: this.captchaApiKey,
            action: 'get',
            id: captchaId,
            json: 1
          },
          timeout: 5000
        });
        
        if (resResponse.data.status === 1) {
          const solution = resResponse.data.request;
          console.log(`   ✅ Captcha resuelto: ${solution}`);
          return solution;
        }
        
        if (resResponse.data.request !== 'CAPCHA_NOT_READY') {
          console.log(`   ⚠️ Estado 2Captcha (intento ${i+1}/15): ${resResponse.data.request}`);
          
          // Si es un error definitivo, lanzar excepción
          if (resResponse.data.request.includes('ERROR')) {
            throw new Error(`2Captcha error: ${resResponse.data.request}`);
          }
        }
      }
      
      throw new Error('Timeout esperando solución del captcha (30s máximo)');
      
    } catch (error) {
      // Si es error de API key, proporcionar ayuda
      if (error.message.includes('2CAPTCHA_API_KEY_INVALID')) {
        console.error('\n   💡 SOLUCIÓN:');
        console.error('   1. Verifica que tu CAPTCHA_API_KEY en .env sea correcta');
        console.error('   2. Obtén una nueva API key en: https://2captcha.com/?from=1234567');
        console.error('   3. Asegúrate de tener saldo en tu cuenta 2Captcha');
      }
      console.error('   ❌ Error con 2Captcha:', error.message);
      throw error;
    }
  }

  // 🆕 8. UTILIDADES
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 🆕 9. GET STATS
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.attempts > 0 ? 
        (this.stats.successes / this.stats.attempts * 100).toFixed(2) + '%' : '0%'
    };
  }
}

// ==================== EJEMPLO DE USO ====================
async function ejemploUso() {
  // Configurar API Key de 2Captcha
  const API_KEY = process.env.CAPTCHA_API_KEY || '';
  
  if (!API_KEY) {
    console.error('❌ ERROR: Configura la variable de entorno CAPTCHA_API_KEY');
    console.log('1. Regístrate en https://2captcha.com');
    console.log('2. Agrega saldo ($3-5 suficiente)');
    console.log('3. Obtén tu API Key');
    console.log('4. Ejecuta: export CAPTCHA_API_KEY="tu_api_key"');
    process.exit(1);
  }
  
  const scraper = new MTCCITVScraper(API_KEY);
  
  try {
    // Consultar una placa de ejemplo
    const placa = process.argv[2] || 'V2R075';
    const resultado = await scraper.consultarPlaca(placa);
    
    console.log('\n🎉 RESULTADO FINAL:');
    console.log(JSON.stringify(resultado, null, 2));
    
    console.log('\n📊 ESTADÍSTICAS:');
    console.log(scraper.getStats());
    
  } catch (error) {
    console.error('\n💥 ERROR FATAL:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// ==================== EXPORTAR ====================
module.exports = MTCCITVScraper;

// ==================== EJECUTAR DIRECTAMENTE ====================
if (require.main === module) {
  ejemploUso();
}
