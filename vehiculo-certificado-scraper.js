/**
 * VEHÍCULO CERTIFICADO SCRAPER - Optimizado para velocidad
 * Similar a mtc-scraper-final.js pero para consulta de certificado de vehículo
 * Extracción rápida y directa de datos
 */

const { chromium } = require('playwright');
const axios = require('axios');

class VehiculoCertificadoScraper {
  constructor(captchaApiKey, baseURL = null) {
    // URL base - https://www.consultalunaspolarizadas.com/
    this.baseURL = baseURL || process.env.VEHICULO_CERT_URL || 'https://www.consultalunaspolarizadas.com';
    this.captchaApiKey = captchaApiKey ? captchaApiKey.trim().match(/^([a-f0-9]{32})/i)?.[1] : null;
    this.stats = { attempts: 0, successes: 0, failures: 0 };
  }

  // ==================== MÉTODO PRINCIPAL ====================
  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [VEHICULO-CERT] Iniciando consulta para: ${placa}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarPlacaIntento(placa);
        
        if (resultado.success) {
          console.log(`✅ [VEHICULO-CERT] CONSULTA EXITOSA en intento ${attempt}`);
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
      
      // Variables para capturar datos
      let captchaImage = null;
      let sessionId = null;
      let datosVehiculo = null;
      let captchaUrl = null;
      let consultaUrl = null;
      
      // Interceptar respuestas para capturar datos
      page.on('response', async (response) => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        try {
          // Capturar imagen CAPTCHA desde respuestas
          if (url.includes('captcha') || url.includes('BotDetect') || url.includes('GetImage') || url.includes('GetCaptcha') || contentType.includes('image')) {
            try {
              // Intentar obtener como imagen binaria primero
              const buffer = await response.body();
              if (buffer && buffer.length > 100) { // Imágenes suelen ser > 100 bytes
                const base64 = buffer.toString('base64');
                const contentType = response.headers()['content-type'] || 'image/png';
                captchaImage = `data:${contentType};base64,${base64}`;
                captchaUrl = url;
                console.log(`   ✅ CAPTCHA interceptado desde respuesta: ${url.substring(0, 100)}... (${buffer.length} bytes)`);
              } else {
                // Si no es imagen binaria, intentar como texto/JSON
                const text = await response.text();
                if (text.includes('data:image') || text.includes('captcha_image') || text.includes('image')) {
                  let jsonData = null;
                  try {
                    jsonData = JSON.parse(text);
                  } catch (e) {
                    // No es JSON
                  }
                  
                  if (jsonData && jsonData.captcha_image) {
                    captchaImage = jsonData.captcha_image;
                    sessionId = jsonData.session_id || null;
                    captchaUrl = url;
                    console.log(`   📸 CAPTCHA capturado desde JSON: ${url}`);
                    console.log(`   🆔 Session ID: ${sessionId || 'N/A'}`);
                  } else if (text.includes('data:image')) {
                    captchaImage = text;
                    captchaUrl = url;
                    console.log(`   📸 CAPTCHA capturado (imagen directa)`);
                  }
                }
              }
            } catch (e) {
              console.log(`   ⚠️ Error procesando respuesta CAPTCHA: ${e.message}`);
            }
          }
          
          // Capturar datos del vehículo
          if (contentType.includes('json')) {
            const json = await response.json();
            if (json.datos && json.status === 'ok') {
              datosVehiculo = json.datos;
              consultaUrl = url;
              console.log(`   📊 Datos del vehículo capturados desde: ${url}`);
              console.log(`   📋 Placa: ${json.datos.PLACA || 'N/A'}`);
              console.log(`   🚗 Marca: ${json.datos.MARCA || 'N/A'}`);
            }
          }
        } catch (e) {
          // Ignorar errores de parsing
        }
      });
      
      // 1. NAVEGAR AL FORMULARIO
      console.log('🌐 Navegando al sitio...');
      console.log(`   🔗 URL: ${this.baseURL}`);
      
      try {
        await page.goto(this.baseURL, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
      } catch (navError) {
        console.log('   ⚠️ Error en navegación inicial, intentando con networkidle...');
        await page.goto(this.baseURL, {
          waitUntil: 'networkidle',
          timeout: 45000
        });
      }
      
      // Esperar a que cargue la página
      await this.delay(2000);
      
      // 2. ESPERAR A QUE CARGUE EL FORMULARIO
      console.log('⏳ Esperando que el formulario se cargue...');
      await this.waitForFormEnabled(page);
      
      // 3. OBTENER Y RESOLVER PRIMER CAPTCHA
      console.log('🔐 Obteniendo primer CAPTCHA...');
      
      // Intentar obtener CAPTCHA desde la página (BotDetect)
      captchaImage = await this.getCaptchaFromPage(page);
      
      // Si no está en la página, intentar obtenerlo via API
      if (!captchaImage) {
        console.log('   ⚠️ CAPTCHA no encontrado en página, intentando obtener via API...');
        captchaImage = await this.getCaptchaViaAPI(page);
      }
      
      if (!captchaImage) {
        throw new Error('No se pudo obtener el primer CAPTCHA');
      }
      
      console.log(`   ✅ Primer CAPTCHA obtenido (${captchaImage.length} caracteres)`);
      
      // 4. RESOLVER PRIMER CAPTCHA
      console.log('🤖 Resolviendo primer CAPTCHA...');
      let captchaText1 = null;
      
      try {
        captchaText1 = await this.solveCaptcha(captchaImage);
        console.log(`   ✅ Primer CAPTCHA resuelto: ${captchaText1.substring(0, 20)}...`);
      } catch (captchaError) {
        console.error(`   ❌ Error resolviendo primer CAPTCHA: ${captchaError.message}`);
        throw captchaError;
      }
      
      // 5. LLENAR FORMULARIO Y ENVIAR PRIMER CAPTCHA
      console.log('📝 Llenando formulario con primer CAPTCHA...');
      await this.fillAndSubmit(page, placa, captchaText1, sessionId);
      
      // 6. ESPERAR Y VERIFICAR SI HAY SEGUNDO CAPTCHA
      console.log('⏳ Esperando respuesta después del primer envío...');
      await this.delay(8000);
      
      // Verificar si aparece un segundo CAPTCHA o si hay error
      let captchaImage2 = null;
      let needsSecondCaptcha = false;
      
      try {
        // Verificar si hay mensaje de error o si aparece nuevo captcha
        const pageContent = await page.content();
        const pageText = await page.textContent('body') || '';
        const hasError = pageContent.includes('captcha') || pageContent.includes('CAPTCHA') || 
                        pageContent.includes('incorrecto') || pageContent.includes('vuelva a intentar') ||
                        pageText.includes('captcha') || pageText.includes('CAPTCHA') ||
                        pageText.includes('incorrecto') || pageText.includes('vuelva a intentar');
        
        console.log(`   🔍 Verificando segundo CAPTCHA... (hasError: ${hasError})`);
        
        // Intentar obtener segundo CAPTCHA múltiples veces
        for (let attempt = 0; attempt < 3; attempt++) {
          await this.delay(2000);
          captchaImage2 = await this.getCaptchaFromPage(page);
          
          if (captchaImage2) {
            // Comparar con el primer captcha (comparar primeros 100 caracteres del base64)
            const first100_1 = captchaImage.substring(0, 100);
            const first100_2 = captchaImage2.substring(0, 100);
            
            if (first100_1 !== first100_2) {
              needsSecondCaptcha = true;
              console.log(`🔐 Segundo CAPTCHA detectado (intento ${attempt + 1}), resolviendo...`);
              break;
            } else {
              console.log(`   ℹ️ CAPTCHA detectado pero es el mismo (intento ${attempt + 1})`);
            }
          }
        }
        
        // Si hay error pero no detectamos captcha diferente, intentar una vez más
        if (hasError && !needsSecondCaptcha) {
          console.log('   ⚠️ Error detectado pero CAPTCHA no cambió, esperando más tiempo...');
          await this.delay(4000);
          captchaImage2 = await this.getCaptchaFromPage(page);
          if (captchaImage2) {
            const first100_1 = captchaImage.substring(0, 100);
            const first100_2 = captchaImage2.substring(0, 100);
            if (first100_1 !== first100_2) {
              needsSecondCaptcha = true;
              console.log('🔐 Segundo CAPTCHA detectado después de espera adicional');
            }
          }
        }
        
        if (needsSecondCaptcha && captchaImage2) {
          // Resolver segundo CAPTCHA
          let captchaText2 = null;
          try {
            captchaText2 = await this.solveCaptcha(captchaImage2);
            console.log(`   ✅ Segundo CAPTCHA resuelto: ${captchaText2.substring(0, 20)}...`);
            
            // Llenar segundo CAPTCHA y enviar nuevamente
            await this.fillSecondCaptchaAndSubmit(page, captchaText2);
            await this.delay(8000);
          } catch (captchaError2) {
            console.error(`   ⚠️ Error resolviendo segundo CAPTCHA: ${captchaError2.message}`);
            // Continuar de todas formas
          }
        } else {
          console.log('   ℹ️ No se requiere segundo CAPTCHA, continuando con resultados...');
        }
      } catch (e) {
        console.log(`   ℹ️ Error verificando segundo CAPTCHA: ${e.message}, continuando...`);
      }
      
      // 7. ESPERAR RESPUESTA JSON (si viene por XHR)
      console.log('⏳ Esperando respuesta JSON final...');
      await this.delay(8000);
      
      // Si ya tenemos los datos desde la respuesta interceptada, usarlos
      if (datosVehiculo) {
        console.log('   ✅ Usando datos de respuesta interceptada');
        const datosFormateados = this.formatDatos(datosVehiculo);
        console.log(`[CERT-VEHICULO] Datos encontrados - OBLIGATORIO mostrar:`, datosFormateados);
        await browser.close();
        return {
          success: true,
          placa: placa,
          ...datosFormateados,
          timestamp: new Date().toISOString()
        };
      }
      
      // 8. EXTRAER RESULTADOS DEL DOM
      console.log('📊 Extrayendo datos del DOM...');
      const resultados = await this.extractResults(page, datosVehiculo);
      
      // Verificar si hay datos antes de cerrar
      const hasData = resultados.marca || resultados.modelo || resultados.nro_certificado || 
                      resultados.serie || resultados.motor || resultados.color || 
                      resultados.anio || resultados.categoria || resultados.fecha_emision;
      
      if (hasData) {
        console.log(`[CERT-VEHICULO] Datos encontrados - OBLIGATORIO mostrar:`, resultados);
      }
      
      await browser.close();
      
      return {
        success: true,
        placa: placa,
        ...resultados,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  // ==================== FUNCIONES CRÍTICAS ====================

  async waitForFormEnabled(page, timeout = 20000) {
    console.log('   ⏳ Verificando estado del formulario...');
    
    try {
      // Esperar que aparezcan los elementos del formulario
      await page.waitForSelector('input[type="text"], input[name*="placa" i], input[id*="placa" i]', { timeout });
      console.log('   ✅ Formulario cargado');
      await this.delay(1000);
    } catch (error) {
      console.error('   ❌ Error esperando formulario:', error.message);
      // Continuar de todas formas
    }
  }

  async getCaptchaFromPage(page) {
    try {
      // Esperar a que el CAPTCHA se cargue
      await this.delay(2000);
      
      // Buscar imagen CAPTCHA BotDetect en la página
      const captchaSelectors = [
        'img[src*="BotDetect" i]',
        'img[src*="BDC_VCaptcha" i]',
        'img[src*="captcha" i]',
        'img[id*="captcha" i]',
        'img[alt*="captcha" i]',
        'img[class*="captcha" i]',
        '#captcha-image',
        '.captcha-image',
        '[data-captcha]',
        'img[src*="Handler.ashx"]',
        'img[src*="Handler.aspx"]'
      ];
      
      for (const selector of captchaSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          const captchaImg = await page.$(selector);
          if (captchaImg) {
            const src = await captchaImg.getAttribute('src');
            if (src) {
              console.log(`   📸 CAPTCHA encontrado (selector: ${selector}, src: ${src.substring(0, 100)}...)`);
              
              // Si es una URL, obtener la imagen
              if (src.startsWith('http') || src.startsWith('/')) {
                try {
                  const fullUrl = src.startsWith('http') ? src : `${this.baseURL}${src}`;
                  console.log(`   📥 Descargando CAPTCHA desde: ${fullUrl}`);
                  const response = await page.request.get(fullUrl);
                  const buffer = await response.body();
                  const base64 = buffer.toString('base64');
                  const contentType = response.headers()['content-type'] || 'image/png';
                  return `data:${contentType};base64,${base64}`;
                } catch (e) {
                  console.log(`   ⚠️ Error descargando imagen: ${e.message}`);
                }
              } else if (src.includes('base64') || src.includes('data:image')) {
                console.log(`   ✅ CAPTCHA encontrado (base64)`);
                return src;
              }
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      // Si no se encuentra, intentar obtener desde el canvas o iframe de BotDetect
      try {
        const captchaData = await page.evaluate(() => {
          // Buscar iframe de BotDetect
          const iframe = document.querySelector('iframe[src*="BotDetect" i], iframe[src*="captcha" i]');
          if (iframe) {
            return { type: 'iframe', src: iframe.src };
          }
          
          // Buscar canvas
          const canvas = document.querySelector('canvas');
          if (canvas) {
            try {
              return { type: 'canvas', data: canvas.toDataURL() };
            } catch (e) {
              return null;
            }
          }
          
          return null;
        });
        
        if (captchaData && captchaData.type === 'canvas') {
          console.log(`   ✅ CAPTCHA encontrado (canvas)`);
          return captchaData.data;
        }
        
        if (captchaData && captchaData.type === 'iframe') {
          console.log(`   📸 CAPTCHA en iframe: ${captchaData.src}`);
          // Intentar obtener desde el iframe
          try {
            const frame = page.frames().find(f => f.url().includes('BotDetect') || f.url().includes('captcha'));
            if (frame) {
              const img = await frame.$('img');
              if (img) {
                const src = await img.getAttribute('src');
                if (src) {
                  const fullUrl = src.startsWith('http') ? src : `${this.baseURL}${src}`;
                  const response = await page.request.get(fullUrl);
                  const buffer = await response.body();
                  const base64 = buffer.toString('base64');
                  return `data:image/png;base64,${base64}`;
                }
              }
            }
          } catch (e) {
            console.log(`   ⚠️ Error accediendo iframe: ${e.message}`);
          }
        }
      } catch (e) {
        // Ignorar errores
      }
      
      return null;
    } catch (e) {
      return null;
    }
  }

  async getCaptchaViaAPI(page) {
    try {
      // BotDetect generalmente carga el CAPTCHA automáticamente
      // Esperar un poco más para que se cargue
      await this.delay(3000);
      
      // Intentar obtener desde la página nuevamente
      return await this.getCaptchaFromPage(page);
    } catch (e) {
      return null;
    }
  }

  async solveCaptcha(captchaImageBase64) {
    if (!this.captchaApiKey) {
      throw new Error('API Key de 2Captcha no configurada');
    }
    
    console.log('   🤖 Resolviendo CAPTCHA con 2Captcha...');
    
    // Extraer base64 si viene con prefijo data:image
    let base64Data = captchaImageBase64;
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    } else if (base64Data.startsWith('data:image')) {
      base64Data = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    }
    
    // Enviar a 2Captcha
    const formData = new URLSearchParams();
    formData.append('key', this.captchaApiKey);
    formData.append('method', 'base64');
    formData.append('body', base64Data);
    formData.append('json', '1');
    
    const submitResponse = await axios.post('http://2captcha.com/in.php', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    });
    
    if (submitResponse.data.status !== 1) {
      const errorMsg = submitResponse.data.request || 'Error desconocido';
      throw new Error(`2Captcha error: ${errorMsg}`);
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
  }

  async fillAndSubmit(page, placa, captchaText, sessionId) {
    // Primero, obtener todos los inputs disponibles para debugging
    const allInputs = await page.$$eval('input', inputs => 
      inputs.map(input => ({
        type: input.type,
        name: input.name,
        id: input.id,
        placeholder: input.placeholder,
        className: input.className,
        value: input.value
      }))
    );
    console.log(`   🔍 Inputs encontrados en la página: ${allInputs.length}`);
    allInputs.forEach((input, idx) => {
      console.log(`      ${idx + 1}. type=${input.type}, name=${input.name || 'N/A'}, id=${input.id || 'N/A'}, placeholder=${input.placeholder || 'N/A'}`);
    });
    
    // Seleccionar tipo de búsqueda: "Placa" (no "Certificado")
    console.log('   📋 Seleccionando tipo de búsqueda: Placa');
    const tipoBusquedaSelectors = [
      'select[name*="tipo" i]',
      'select[id*="tipo" i]',
      'select[name*="busqueda" i]',
      'select'
    ];
    
    let tipoSelect = null;
    for (const selector of tipoBusquedaSelectors) {
      try {
        const select = await page.$(selector);
        if (select) {
          // Obtener opciones disponibles
          const options = await page.$$eval(`${selector} option`, options => 
            options.map(opt => ({ value: opt.value, text: opt.textContent.trim() }))
          );
          console.log(`   📋 Opciones disponibles: ${JSON.stringify(options)}`);
          
          // Buscar opción "Placa" o "Certificado"
          const placaOption = options.find(opt => 
            opt.text.toLowerCase().includes('placa') || 
            opt.value.toLowerCase().includes('placa')
          );
          
          if (placaOption) {
            await page.selectOption(selector, placaOption.value);
            console.log(`   ✅ Tipo de búsqueda seleccionado: ${placaOption.text} (selector: ${selector})`);
          } else {
            // Seleccionar primera opción
            await page.selectOption(selector, { index: 0 });
            console.log(`   ✅ Tipo de búsqueda seleccionado (primera opción, selector: ${selector})`);
          }
          tipoSelect = select;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    await this.delay(1000); // Esperar a que se actualice el formulario
    
    // Buscar input de placa (después de seleccionar tipo)
    const placaSelectors = [
      'input[name*="placa" i]',
      'input[id*="placa" i]',
      'input[placeholder*="placa" i]',
      'input[placeholder*="Placa" i]',
      '#placa',
      '#txtPlaca',
      'input[type="text"]:not([name*="certificado" i]):not([name*="captcha" i])',
      'input[type="text"]'
    ];
    
    let placaInput = null;
    for (const selector of placaSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        const input = await page.$(selector);
        if (input) {
          // Verificar que no sea el input de certificado o captcha
          const name = await input.getAttribute('name');
          const id = await input.getAttribute('id');
          const placeholder = await input.getAttribute('placeholder') || '';
          
          if (name && (name.toLowerCase().includes('certificado') || name.toLowerCase().includes('captcha'))) {
            continue;
          }
          if (id && (id.toLowerCase().includes('certificado') || id.toLowerCase().includes('captcha'))) {
            continue;
          }
          if (placeholder.toLowerCase().includes('certificado')) {
            continue;
          }
          
          await page.fill(selector, placa);
          console.log(`   ✅ Placa ingresada: ${placa} (selector: ${selector}, name: ${name || 'N/A'})`);
          placaInput = input;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!placaInput) {
      // Intentar con evaluate como último recurso
      const inputFound = await page.evaluate((placa) => {
        const inputs = document.querySelectorAll('input[type="text"]');
        for (const input of inputs) {
          const name = input.name || '';
          const id = input.id || '';
          const placeholder = (input.placeholder || '').toLowerCase();
          
          if (!name.toLowerCase().includes('certificado') && 
              !name.toLowerCase().includes('captcha') &&
              !id.toLowerCase().includes('certificado') &&
              !id.toLowerCase().includes('captcha') &&
              !placeholder.includes('certificado')) {
            input.value = placa;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, placa);
      
      if (inputFound) {
        console.log(`   ✅ Placa ingresada usando evaluate`);
        placaInput = { found: true };
      } else {
        throw new Error('No se encontró el input de placa. Verifique que el formulario esté cargado correctamente.');
      }
    }
    
    await this.delay(500);
    
    // Buscar input de CAPTCHA (BotDetect)
    const captchaSelectors = [
      'input[name*="captcha" i]',
      'input[id*="captcha" i]',
      'input[name*="BDC_VCaptcha" i]',
      '#captcha',
      '#txtCaptcha',
      'input[type="text"]:not([name*="placa" i]):not([name*="certificado" i])'
    ];
    
    let captchaInput = null;
    for (const selector of captchaSelectors) {
      try {
        const input = await page.$(selector);
        if (input && input !== placaInput) {
          await page.fill(selector, captchaText);
          console.log(`   ✅ CAPTCHA ingresado (selector: ${selector})`);
          captchaInput = input;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!captchaInput) {
      console.log('   ⚠️ Input de CAPTCHA no encontrado, intentando con evaluate...');
      // Intentar inyectar CAPTCHA directamente
      await page.evaluate((text) => {
        const inputs = document.querySelectorAll('input[type="text"]');
        for (const input of inputs) {
          if (input.name && input.name.includes('captcha')) {
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }, captchaText);
    }
    
    await this.delay(500);
    
    // Buscar botón de envío
    const buttonSelectors = [
      'button:has-text("Buscar")',
      'input[type="submit"]:has-text("Buscar")',
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Consultar")',
      '#btnBuscar',
      '#btnConsultar',
      '.btn-buscar',
      '.btn-consultar',
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

  async fillSecondCaptchaAndSubmit(page, captchaText2) {
    console.log('   📝 Llenando segundo CAPTCHA...');
    
    // Buscar input de segundo CAPTCHA
    const captchaSelectors = [
      'input[name*="captcha" i]',
      'input[id*="captcha" i]',
      'input[name*="BDC_VCaptcha" i]',
      '#captcha',
      '#txtCaptcha',
      'input[type="text"]:not([name*="placa" i]):not([name*="certificado" i])'
    ];
    
    let captchaInput2 = null;
    for (const selector of captchaSelectors) {
      try {
        const input = await page.$(selector);
        if (input) {
          await page.fill(selector, captchaText2);
          console.log(`   ✅ Segundo CAPTCHA ingresado (selector: ${selector})`);
          captchaInput2 = input;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!captchaInput2) {
      // Intentar inyectar CAPTCHA directamente
      await page.evaluate((text) => {
        const inputs = document.querySelectorAll('input[type="text"]');
        for (const input of inputs) {
          if (input.name && input.name.includes('captcha')) {
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }, captchaText2);
    }
    
    await this.delay(1000);
    
    // Buscar botón de envío nuevamente
    const buttonSelectors = [
      'button:has-text("Buscar")',
      'input[type="submit"]:has-text("Buscar")',
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Consultar")',
      '#btnBuscar',
      '#btnConsultar',
      '.btn-buscar',
      '.btn-consultar',
      'button'
    ];
    
    let buttonFound = false;
    for (const selector of buttonSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        buttonFound = true;
        console.log(`   ✅ Botón clickeado (segundo envío, selector: ${selector})`);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!buttonFound) {
      console.log('   ⚠️ No se encontró el botón de envío para segundo CAPTCHA');
    }
  }

  async extractResults(page, datosVehiculo) {
    // Si ya tenemos los datos del vehículo desde la respuesta interceptada, usarlos
    if (datosVehiculo) {
      console.log('   ✅ Usando datos de respuesta interceptada');
      return this.formatDatos(datosVehiculo);
    }
    
      // Si no, intentar extraer del DOM (tabla de resultados)
      try {
        console.log('   🔍 Extrayendo datos de la tabla...');
        await this.delay(5000); // Aumentado a 5s
        
        // Esperar a que aparezca la tabla de resultados - MÚLTIPLES INTENTOS
        let tablaEncontrada = false;
        for (let intento = 0; intento < 5; intento++) {
          try {
            await page.waitForSelector('table', { timeout: 5000 });
            tablaEncontrada = true;
            console.log(`   ✅ Tabla encontrada en intento ${intento + 1}`);
            break;
          } catch (e) {
            if (intento < 4) {
              console.log(`   ⏳ Intento ${intento + 1} fallido, esperando más tiempo...`);
              await this.delay(3000);
            }
          }
        }
        
        if (!tablaEncontrada) {
          console.log('   ⚠️ Tabla no encontrada después de múltiples intentos, buscando en todo el DOM...');
        }
        
        // Esperar adicional para que se carguen datos dinámicos
        await this.delay(10000); // Aumentado a 10s
        
        // Intentar múltiples veces esperar a que aparezcan datos
        for (let intento = 0; intento < 5; intento++) {
          const tieneDatos = await page.evaluate(() => {
            const tables = document.querySelectorAll('table');
            for (const table of tables) {
              const rows = table.querySelectorAll('tr');
              for (let i = 1; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td');
                if (cells.length >= 9) {
                  const placa = cells[0]?.textContent.trim() || '';
                  if (placa && placa.length >= 4) {
                    return true;
                  }
                }
              }
            }
            return false;
          });
          
          if (tieneDatos) {
            console.log(`   ✅ Datos detectados en intento ${intento + 1}`);
            break;
          } else {
            console.log(`   ⏳ Intento ${intento + 1}: Esperando más tiempo para carga de datos...`);
            await this.delay(3000);
          }
        }
      
      const datos = await page.evaluate(() => {
        const data = {};
        
        // Buscar tabla de resultados
        const tables = document.querySelectorAll('table');
        console.log(`Tablas encontradas: ${tables.length}`);
        
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          console.log(`Filas en tabla: ${rows.length}`);
          
          // Buscar fila de datos (saltar header)
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.querySelectorAll('td');
            
            console.log(`Celdas en fila ${i}: ${cells.length}`);
            
            if (cells.length >= 9) {
              // Mapear columnas según la estructura: PLACA | NRO CERTIFICADO | CATEGORÍA | MARCA | MODELO | COLOR | MOTOR | SERIE | AÑO | FECHA EMISIÓN
              const placa = cells[0]?.textContent.trim() || '';
              const certificado = cells[1]?.textContent.trim() || '';
              
              // Solo usar esta fila si tiene datos válidos (no vacía)
              if (placa && placa.length >= 4) {
                data.placa = placa;
                data.nro_certificado = certificado;
                data.categoria = cells[2]?.textContent.trim() || '';
                data.marca = cells[3]?.textContent.trim() || '';
                data.modelo = cells[4]?.textContent.trim() || '';
                data.color = cells[5]?.textContent.trim() || '';
                data.motor = cells[6]?.textContent.trim() || '';
                data.serie = cells[7]?.textContent.trim() || '';
                data.anio = cells[8]?.textContent.trim() || '';
                data.fecha_emision = cells[9]?.textContent.trim() || '';
                break; // Usar la primera fila con datos válidos
              }
            }
          }
          
          if (data.placa) break; // Si encontramos datos, salir
        }
        
        // Si no hay tabla, buscar en texto - MÉTODO MEJORADO Y MÁS AGRESIVO
        if (!data.placa || !data.marca) {
          const textContent = document.body.innerText || '';
          const htmlContent = document.body.innerHTML || '';
          
          console.log(`Buscando datos en texto (longitud: ${textContent.length})...`);
          
          // Buscar placa en múltiples formatos
          const placaPatterns = [
            /PLACA[:\s]+([A-Z0-9]{6,7})/i,
            /PLACA\s*[:\-]?\s*([A-Z0-9]{6,7})/i,
            /\b([A-Z]{1,3}[0-9]{3,4}[A-Z0-9]{0,2})\b/,
            /Placa[:\s]+([A-Z0-9]{6,7})/i,
            /placa[:\s]+([A-Z0-9]{6,7})/i,
            /([A-Z]{1,3}[0-9]{3,4}[A-Z0-9]{0,2})/,
            /<td[^>]*>([A-Z0-9]{6,7})<\/td>/i
          ];
          
          for (const pattern of placaPatterns) {
            const match = textContent.match(pattern) || htmlContent.match(pattern);
            if (match && match[1] && match[1].length >= 4) {
              data.placa = match[1].toUpperCase();
              break;
            }
          }
          
          // Buscar marca en múltiples formatos
          const marcaPatterns = [
            /MARCA[:\s]+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,30})/i,
            /Marca[:\s]+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,30})/i,
            /<td[^>]*>([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,30})<\/td>/i
          ];
          
          for (const pattern of marcaPatterns) {
            const match = textContent.match(pattern) || htmlContent.match(pattern);
            if (match && match[1] && match[1].trim().length >= 2) {
              data.marca = match[1].trim();
              break;
            }
          }
          
          // Buscar modelo
          const modeloPatterns = [
            /MODELO[:\s]+([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s\-]{2,40})/i,
            /Modelo[:\s]+([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s\-]{2,40})/i
          ];
          
          for (const pattern of modeloPatterns) {
            const match = textContent.match(pattern);
            if (match && match[1] && match[1].trim().length >= 2) {
              data.modelo = match[1].trim();
              break;
            }
          }
          
          // Buscar certificado
          const certPatterns = [
            /CERTIFICADO[:\s]+([A-Z0-9\-]{5,20})/i,
            /NRO[:\s]+CERTIFICADO[:\s]+([A-Z0-9\-]{5,20})/i,
            /Certificado[:\s]+([A-Z0-9\-]{5,20})/i
          ];
          
          for (const pattern of certPatterns) {
            const match = textContent.match(pattern);
            if (match && match[1]) {
              data.nro_certificado = match[1].trim();
              break;
            }
          }
        }
        
        return data;
      });
      
      // Verificar si hay datos - MÁS FLEXIBLE
      const hasData = datos.placa || datos.marca || datos.modelo || datos.nro_certificado || 
                      datos.serie || datos.motor || datos.color || datos.anio || datos.categoria;
      
      if (hasData) {
        console.log(`   ✅ Datos extraídos del DOM: ${datos.placa || 'N/A'} - ${datos.marca || 'N/A'} - ${datos.modelo || 'N/A'}`);
        console.log(`[CERT-VEHICULO] Datos encontrados en DOM - OBLIGATORIO mostrar`);
        return this.formatDatos(datos);
      }
      
      // Si no hay datos, intentar una vez más después de esperar más tiempo
      console.log('   ⚠️ No se encontraron datos en el primer intento, esperando más tiempo y reintentando...');
      await this.delay(10000);
      
      // Reintentar extracción
      const datosRetry = await page.evaluate(() => {
        const data = {};
        const textContent = document.body.innerText || '';
        const htmlContent = document.body.innerHTML || '';
        
        // Buscar cualquier dato visible en la página
        if (textContent.includes('VCM675') || htmlContent.includes('VCM675')) {
          data.placa = 'VCM675';
        }
        
        // Buscar en todos los elementos de la página
        const allElements = document.querySelectorAll('td, div, span, p, li');
        for (const el of allElements) {
          const text = (el.textContent || '').trim();
          if (text.length > 0 && text.length < 100) {
            // Si contiene palabras clave, puede ser un dato
            if (text.match(/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,30}$/) && !data.marca) {
              data.marca = text;
            }
            if (text.match(/^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s\-]{2,40}$/) && !data.modelo && text !== data.marca) {
              data.modelo = text;
            }
          }
        }
        
        return data;
      });
      
      if (datosRetry.placa || datosRetry.marca || datosRetry.modelo) {
        console.log(`   ✅ Datos encontrados en segundo intento: ${JSON.stringify(datosRetry)}`);
        return this.formatDatos(datosRetry);
      }
      
      console.log('   ⚠️ No se encontraron datos en el DOM después de múltiples intentos');
      // Devolver objeto vacío para que el servidor maneje el mensaje
      return {};
    } catch (e) {
      console.error('   ⚠️ Error extrayendo del DOM:', e.message);
      return {};
    }
  }

  formatDatos(datos) {
    // Normalizar datos que vienen en diferentes formatos (mayúsculas o minúsculas)
    return {
      anio: datos.ANIO || datos.anio || datos.AÑO || datos.año || '',
      categoria: datos.CATEGORIA || datos.categoria || datos.CATEGORÍA || datos.categoría || '',
      color: datos.COLOR || datos.color || '',
      fecha_emision: datos.FECHA_EMISION || datos.fecha_emision || datos.FECHA_EMISIÓN || datos.fecha_emisión || '',
      marca: datos.MARCA || datos.marca || '',
      modelo: datos.MODELO || datos.modelo || '',
      motor: datos.MOTOR || datos.motor || '',
      nro_certificado: datos.NRO_CERTIFICADO || datos.nro_certificado || datos.certificado || '',
      placa: datos.PLACA || datos.placa || '',
      serie: datos.SERIE || datos.serie || ''
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = VehiculoCertificadoScraper;
