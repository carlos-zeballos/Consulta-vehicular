/**
 * SUNARP SCRAPER - Consulta Vehicular
 * Intenta primero con axios para obtener imagen directamente de la API
 * Si falla, usa Playwright como fallback
 */

const { chromium } = require('playwright');
const axios = require('axios');
const Tesseract = require('tesseract.js');

class SUNARPVehicularScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://consultavehicular.sunarp.gob.pe/consulta-vehicular';
    this.baseURLAlt = 'https://consultavehicular.sunarp.gob.pe/consulta-vehicular/inicio';
    this.apiURL = 'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular/consulta/getDatosVehiculo';
    this.captchaApiKey = captchaApiKey;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== CONSULTAR PLACA ====================
  async consultarPlaca(placa, maxAttempts = 2) {
    // PRIMERO: Intentar con axios (método directo a la API)
    try {
      console.log(`\n[SUNARP] 🚀 Intentando método directo con axios...`);
      const resultadoAxios = await this.consultarPlacaConAxios(placa);
      if (resultadoAxios && resultadoAxios.success && resultadoAxios.imagen) {
        console.log(`[SUNARP] ✅ Imagen obtenida exitosamente con axios`);
        return resultadoAxios;
      }
      console.log(`[SUNARP] ⚠️ Método axios no funcionó, intentando con Playwright...`);
    } catch (error) {
      console.log(`[SUNARP] ⚠️ Error con axios: ${error.message}, intentando con Playwright...`);
    }
    
    // SEGUNDO: Si axios falla, usar Playwright como fallback
    for (let intento = 1; intento <= maxAttempts; intento++) {
      try {
        console.log(`\n[SUNARP] Intento ${intento}/${maxAttempts} con Playwright para placa: ${placa}`);
        const resultado = await this.consultarPlacaIntento(placa);
        // Si hay imagen, considerar éxito incluso si success es false
        if (resultado && (resultado.success || resultado.imagen)) {
          // Asegurar que success sea true si hay imagen
          if (resultado.imagen && !resultado.success) {
            resultado.success = true;
            console.log(`[SUNARP] ✅ Marcando como éxito porque hay imagen`);
          }
          return resultado;
        }
      } catch (error) {
        console.error(`[SUNARP] ❌ Intento ${intento} falló:`, error.message);
        if (intento === maxAttempts) {
          return {
            success: false,
            placa: placa,
            datos: null,
            imagen: null,
            mensaje: `Error después de ${maxAttempts} intentos: ${error.message}`
          };
        }
        await this.delay(5000);
      }
    }
    
    return {
      success: false,
      placa: placa,
      datos: null,
      imagen: null,
      mensaje: "No se pudo obtener datos después de múltiples intentos"
    };
  }

  // ==================== CONSULTAR PLACA CON AXIOS (MÉTODO DIRECTO) ====================
  async consultarPlacaConAxios(placa) {
    try {
      // Configuración de headers para simular un navegador real
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Origin': 'https://consultavehicular.sunarp.gob.pe',
        'Referer': 'https://consultavehicular.sunarp.gob.pe/consulta-vehicular/inicio',
        'X-Requested-With': 'XMLHttpRequest'
      };

      console.log(`[SUNARP-AXIOS] 🌐 Obteniendo página inicial para cookies...`);
      
      // Primero, obtenemos la página para obtener cookies necesarios
      const initialResponse = await axios.get('https://consultavehicular.sunarp.gob.pe/consulta-vehicular/inicio', {
        headers: headers,
        timeout: 30000,
        validateStatus: () => true // Aceptar cualquier status
      });
      
      // Extraemos cookies de la respuesta
      const cookies = initialResponse.headers['set-cookie'] || [];
      const cookieString = cookies.map(cookie => cookie.split(';')[0]).join('; ');
      
      console.log(`[SUNARP-AXIOS] ✅ Cookies obtenidas: ${cookieString ? 'Sí' : 'No'}`);
      
      // Preparamos los headers para la consulta incluyendo las cookies
      const requestHeaders = {
        ...headers,
        'Cookie': cookieString,
        'Content-Type': 'application/x-www-form-urlencoded'
      };
      
      // Intentar diferentes endpoints posibles
      const endpoints = [
        'https://consultavehicular.sunarp.gob.pe/consulta-vehicular/buscarVehiculo',
        'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular/consulta/getDatosVehiculo',
        'https://consultavehicular.sunarp.gob.pe/api/consulta/buscar',
        'https://consultavehicular.sunarp.gob.pe/consulta-vehicular/consultar'
      ];
      
      for (const endpoint of endpoints) {
        try {
          console.log(`[SUNARP-AXIOS] 🔍 Intentando endpoint: ${endpoint}`);
          
          // Intentar diferentes formatos de datos
          const dataFormats = [
            `placa=${placa}`,
            JSON.stringify({ placa: placa }),
            JSON.stringify({ numeroPlaca: placa }),
            JSON.stringify({ placaVehiculo: placa })
          ];
          
          for (const dataFormat of dataFormats) {
            try {
              const contentType = typeof dataFormat === 'string' && dataFormat.startsWith('{') 
                ? 'application/json' 
                : 'application/x-www-form-urlencoded';
              
              const consultaResponse = await axios.post(
                endpoint,
                dataFormat,
                {
                  headers: {
                    ...requestHeaders,
                    'Content-Type': contentType
                  },
                  timeout: 30000,
                  validateStatus: () => true
                }
              );
              
              console.log(`[SUNARP-AXIOS] 📊 Status: ${consultaResponse.status}`);
              console.log(`[SUNARP-AXIOS] 📊 Content-Type: ${consultaResponse.headers['content-type']}`);
              
              if (consultaResponse.status === 200) {
                let data = consultaResponse.data;
                
                // Si la respuesta es string, intentar parsear como JSON
                if (typeof data === 'string') {
                  try {
                    data = JSON.parse(data);
                  } catch (e) {
                    console.log(`[SUNARP-AXIOS] ⚠️ No se pudo parsear como JSON`);
                    continue;
                  }
                }
                
                console.log(`[SUNARP-AXIOS] 📊 Respuesta recibida (primeros 1000 chars):`, JSON.stringify(data, null, 2).substring(0, 1000));
                
                // Buscar imagen en diferentes ubicaciones posibles
                let imagenBase64 = null;
                
                if (data.model && data.model.imagen) {
                  imagenBase64 = data.model.imagen;
                  console.log(`[SUNARP-AXIOS] ✅ Imagen encontrada en data.model.imagen`);
                } else if (data.imagen) {
                  imagenBase64 = data.imagen;
                  console.log(`[SUNARP-AXIOS] ✅ Imagen encontrada en data.imagen`);
                } else if (data.data && data.data.imagen) {
                  imagenBase64 = data.data.imagen;
                  console.log(`[SUNARP-AXIOS] ✅ Imagen encontrada en data.data.imagen`);
                } else if (data.resultado && data.resultado.imagen) {
                  imagenBase64 = data.resultado.imagen;
                  console.log(`[SUNARP-AXIOS] ✅ Imagen encontrada en data.resultado.imagen`);
                }
                
                if (imagenBase64) {
                  console.log(`[SUNARP-AXIOS] ✅ Imagen encontrada! Tamaño: ${imagenBase64.length} caracteres`);
                  
                  // Asegurar que sea un data URL completo
                  let imagenDataUrl = imagenBase64;
                  if (!imagenBase64.startsWith('data:')) {
                    // Si no tiene el prefijo data:, agregarlo
                    imagenDataUrl = `data:image/png;base64,${imagenBase64}`;
                  }
                  
                  return {
                    success: true,
                    placa: placa,
                    datos: data.model || data.data || {},
                    imagen: imagenDataUrl,
                    mensaje: data.mensaje || "Consulta exitosa"
                  };
                } else {
                  console.log(`[SUNARP-AXIOS] ⚠️ No se encontró imagen en la respuesta`);
                }
              }
            } catch (error) {
              console.log(`[SUNARP-AXIOS] ⚠️ Error con formato de datos: ${error.message}`);
              continue;
            }
          }
        } catch (error) {
          console.log(`[SUNARP-AXIOS] ⚠️ Error con endpoint ${endpoint}: ${error.message}`);
          continue;
        }
      }
      
      throw new Error('No se pudo obtener imagen de ningún endpoint');
      
    } catch (error) {
      console.error(`[SUNARP-AXIOS] ❌ Error: ${error.message}`);
      throw error;
    }
  }

  // ==================== INTENTO DE CONSULTA ====================
  async consultarPlacaIntento(placa) {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080',
        '--start-maximized',
        '--disable-infobars',
        '--disable-notifications',
        '--lang=es-PE',
        '--disable-extensions',
        '--disable-plugins-discovery',
        '--disable-default-apps'
      ]
    });

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'es-PE',
        timezoneId: 'America/Lima',
        permissions: ['geolocation'],
        geolocation: { latitude: -12.0464, longitude: -77.0428 }, // Lima, Perú
        colorScheme: 'light'
      });
      
      const page = await context.newPage();
      
      // Inyectar scripts anti-detección avanzados ANTES de navegar
      await page.addInitScript(() => {
        // Ocultar webdriver
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false
        });
        
        // Sobrescribir plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        
        // Sobrescribir languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['es-PE', 'es', 'en']
        });
        
        // Sobrescribir permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
        
        // Sobrescribir chrome
        window.chrome = {
          runtime: {}
        };
      });
      
      // Interceptar respuestas de la API ANTES de navegar
      let apiResponseData = null;
      let captchaImageUrl = null;
      
      page.on('response', async (response) => {
        const url = response.url();
        const status = response.status();
        
        // Interceptar respuesta de getDatosVehiculo
        if (url.includes('getDatosVehiculo') && status === 200) {
          try {
            const data = await response.json();
            console.log('[SUNARP] ✅ Respuesta API interceptada directamente');
            console.log('[SUNARP] 📊 Datos API:', JSON.stringify(data, null, 2));
            apiResponseData = data;
          } catch (e) {
            console.log(`[SUNARP] ⚠️ Error parseando respuesta JSON: ${e.message}`);
            try {
              const text = await response.text();
              console.log(`[SUNARP] 📄 Respuesta como texto (primeros 500 chars):`, text.substring(0, 500));
              // Intentar parsear como JSON manualmente
              try {
                apiResponseData = JSON.parse(text);
              } catch (e2) {
                // Ignorar
              }
            } catch (e2) {
              // Ignorar
            }
          }
        }
        
        // Interceptar imagen del CAPTCHA
        if (url.includes('captcha') && (url.includes('generar') || url.includes('image'))) {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('image')) {
            captchaImageUrl = url;
            console.log('[SUNARP] 📸 URL de imagen CAPTCHA interceptada:', captchaImageUrl);
          }
        }
      });
      
      // Configurar route para interceptar y modificar requests
      await page.route('**/*', async (route) => {
        const request = route.request();
        const headers = {
          ...request.headers(),
          'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': request.resourceType() === 'document' ? 'document' : 'empty',
          'Sec-Fetch-Mode': request.resourceType() === 'document' ? 'navigate' : 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'Cache-Control': 'max-age=0'
        };
        await route.continue({ headers });
      });

      console.log('[SUNARP] 🌐 Navegando a la página...');
      
      // Navegar con timeout aumentado para dar más tiempo
      try {
        await page.goto(this.baseURL, {
          waitUntil: 'domcontentloaded',
          timeout: 60000 // 60 segundos
        });
        console.log('[SUNARP] ✅ Página cargada');
      } catch (e) {
        console.log(`[SUNARP] ⚠️ Error navegando, intentando URL alternativa: ${e.message}`);
        try {
          await page.goto(this.baseURLAlt, {
            waitUntil: 'domcontentloaded',
            timeout: 60000 // 60 segundos
          });
          console.log('[SUNARP] ✅ Página cargada desde URL alternativa');
        } catch (e2) {
          throw new Error(`No se pudo navegar a ninguna URL: ${e2.message}`);
        }
      }
      
      // Esperar más tiempo para que Angular inicie completamente
      console.log('[SUNARP] ⏳ Esperando a que Angular cargue completamente (5s)...');
      await this.delay(5000);
      
      // Verificar si hay Cloudflare challenge
      const hasCloudflare = await page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        return bodyText.includes('Checking your browser') ||
               bodyText.includes('Just a moment') ||
               bodyText.includes('Please wait') ||
               document.querySelector('#challenge-form') !== null;
      });
      
      if (hasCloudflare) {
        console.log('[SUNARP] 🛡️ Cloudflare challenge detectado, esperando resolución automática (20s)...');
        await this.delay(20000); // Esperar más tiempo a que Cloudflare se resuelva
      }
      
      // Esperar a que el formulario esté disponible
      console.log('[SUNARP] ⏳ Esperando formulario...');
      try {
        await page.waitForSelector('input[formcontrolname*="placa" i], input[placeholder*="placa" i], input[type="text"]', {
          timeout: 30000 // 30 segundos
        });
        console.log('[SUNARP] ✅ Formulario encontrado');
      } catch (e) {
        console.log('[SUNARP] ⚠️ Formulario no encontrado con selector estándar, continuando...');
      }
      
      console.log('[SUNARP] ⏳ Esperando adicional antes de llenar formulario (3s)...');
      await this.delay(3000);
      
      // Llenar el campo de placa
      console.log('[SUNARP] 📝 Llenando campo de placa...');
      const inputFilled = await page.evaluate((placa) => {
        const selectors = [
          'input[formcontrolname*="placa" i]',
          'input[placeholder*="placa" i]',
          'input[type="text"]',
          'input.ant-input',
          'input.nz-input'
        ];
        
        for (const selector of selectors) {
          const input = document.querySelector(selector);
          if (input && input.offsetParent !== null) { // Verificar que sea visible
            input.focus();
            input.value = placa;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, placa);
      
      if (!inputFilled) {
        console.log('[SUNARP] ⚠️ No se pudo llenar el campo automáticamente, intentando método alternativo...');
        // Intentar escribir directamente
        await page.keyboard.type(placa, { delay: 100 });
      }
      
      console.log('[SUNARP] ⏳ Esperando después de llenar campo (3s)...');
      await this.delay(3000);
      
      // Marcar checkbox de verificación si existe
      console.log('[SUNARP] ☑️ Buscando checkbox de verificación...');
      await page.evaluate(() => {
        const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        for (const cb of checkboxes) {
          let element = cb;
          for (let i = 0; i < 5; i++) {
            const parent = element.parentElement;
            if (!parent) break;
            const text = (parent.textContent || '').toLowerCase();
            if ((text.includes('verifica') || text.includes('humano')) && !cb.checked) {
              cb.click();
              cb.checked = true;
              return true;
            }
            element = parent;
          }
        }
        return false;
      });
      
      console.log('[SUNARP] ⏳ Esperando después de checkbox (3s)...');
      await this.delay(3000);
      
      // Hacer clic en el botón de búsqueda
      console.log('[SUNARP] 🔘 Enviando formulario...');
      const formSubmitted = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const searchButton = buttons.find(btn => {
          const text = (btn.textContent || '').toLowerCase();
          return text.includes('buscar') || text.includes('realizar') || text.includes('consultar');
        });
        
        if (searchButton) {
          searchButton.click();
          return true;
        }
        
        // Intentar enviar formulario
        const form = document.querySelector('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          return true;
        }
        
        return false;
      });
      
      if (!formSubmitted) {
        // Intentar con Enter
        await page.keyboard.press('Enter');
      }
      
      // Esperar respuesta de la API (máximo 120 segundos)
      console.log('[SUNARP] ⏳ Esperando respuesta de la API (máx 120s)...');
      const startTime = Date.now();
      const maxWaitTime = 120000; // 120 segundos (2 minutos)
      
      while (!apiResponseData && (Date.now() - startTime) < maxWaitTime) {
        await this.delay(3000);
        if (apiResponseData) {
          break;
        }
      }
      
      // Si tenemos datos de la API, esperar un poco para que la página se actualice y luego tomar screenshot
      if (apiResponseData) {
        console.log('[SUNARP] ✅ Datos obtenidos directamente de la API');
        const datosVehiculo = this.extraerDatosDeAPI(apiResponseData);
        
        // Esperar a que la página muestre los resultados visualmente (más tiempo)
        console.log('[SUNARP] ⏳ Esperando a que la página muestre los resultados (15s)...');
        await this.delay(15000);
        
        // Cerrar popups si existen
        await page.evaluate(() => {
          const closeButtons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(btn => {
            const text = (btn.textContent || '').toLowerCase();
            return text === 'ok' || text.includes('aceptar') || text.includes('cerrar') || text.includes('×');
          });
          closeButtons.forEach(btn => {
            try { btn.click(); } catch(e) {}
          });
        });
        
        await this.delay(5000);
        
        // Hacer scroll para asegurar que todo esté visible
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 500);
          setTimeout(() => window.scrollTo(0, 0), 1000);
        });
        
        await this.delay(3000);
        
        // Tomar screenshot siempre
        console.log('[SUNARP] 📸 Tomando screenshot de los resultados (datos de API)...');
        const screenshotPath = 'sunarp-result.png';
        const screenshotBuffer = await page.screenshot({ 
          path: screenshotPath, 
          fullPage: true,
          type: 'png'
        });
        
        if (!screenshotBuffer) {
          console.error('[SUNARP] ❌ ERROR: screenshotBuffer es null o undefined');
          throw new Error('No se pudo capturar el screenshot');
        }
        
        const screenshotBase64 = screenshotBuffer.toString('base64');
        const screenshotDataUrl = `data:image/png;base64,${screenshotBase64}`;
        console.log('[SUNARP] ✅ Screenshot capturado y convertido a base64');
        console.log('[SUNARP] 📸 screenshotDataUrl existe:', !!screenshotDataUrl);
        console.log('[SUNARP] 📸 screenshotDataUrl longitud:', screenshotDataUrl ? screenshotDataUrl.length : 0);
        
        // SIEMPRE devolver la imagen, incluso si no hay datos extraídos
        const resultadoConImagen = {
          success: true,
          placa: placa,
          datos: datosVehiculo || {}, // Datos opcionales
          imagen: screenshotDataUrl, // Imagen en base64 - SIEMPRE incluida
          mensaje: datosVehiculo && Object.keys(datosVehiculo).length > 0 
            ? "Consulta exitosa" 
            : "Consulta completada. Ver imagen para detalles."
        };
        
        console.log('[SUNARP] 📤 Retornando resultado con imagen (datos de API):', JSON.stringify({
          ...resultadoConImagen,
          imagen: resultadoConImagen.imagen ? `[IMAGEN: ${resultadoConImagen.imagen.length} chars]` : null
        }, null, 2));
        
        return resultadoConImagen;
      }
      
      // Si no hay datos de API, esperar a que la página muestre resultados y extraer del DOM
      console.log('[SUNARP] ⏳ No se interceptó API, esperando resultados en página...');
      
      // Esperar tiempo suficiente para que la página cargue completamente (más tiempo)
      console.log('[SUNARP] ⏳ Esperando a que la página cargue completamente (20s)...');
      await this.delay(20000);
      
      // Verificar si hay resultados en la página
      const hasResults = await page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        return bodyText.includes('Datos del Vehículo') ||
               bodyText.includes('Marca') ||
               bodyText.includes('Modelo') ||
               bodyText.includes('Placa N°') ||
               bodyText.includes('V2RO75') ||
               bodyText.includes('titulares del vehículo');
      });
      
      console.log(`[SUNARP] ${hasResults ? '✅' : '⚠️'} Resultados detectados: ${hasResults}`);
      
      // Cerrar popups/modales que puedan estar bloqueando la vista
      console.log('[SUNARP] 🔄 Cerrando popups y esperando a que carguen todos los datos...');
      await page.evaluate(() => {
        // Cerrar todos los popups/modales posibles
        const closeButtons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(btn => {
          const text = (btn.textContent || '').toLowerCase();
          return text === 'ok' || text.includes('aceptar') || text.includes('cerrar') || text.includes('×');
        });
        closeButtons.forEach(btn => {
          try { btn.click(); } catch(e) {}
        });
        
        // Cerrar modales
        const modals = document.querySelectorAll('.ant-modal, nz-modal, [class*="modal"], [role="dialog"]');
        modals.forEach(modal => {
          const closeBtn = modal.querySelector('button, .close, [aria-label*="close" i]');
          if (closeBtn) {
            try { closeBtn.click(); } catch(e) {}
          }
        });
      });
      
      console.log('[SUNARP] ⏳ Esperando adicional (10s) para asegurar carga completa...');
      await this.delay(10000);
      
      // Hacer scroll para asegurar que todo esté visible y cargado
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 500);
        setTimeout(() => window.scrollTo(0, 0), 1000);
      });
      
      console.log('[SUNARP] ⏳ Esperando después del scroll (5s)...');
      await this.delay(5000);
      
      // SIEMPRE tomar screenshot para mostrar en frontend (incluso si no hay resultados)
      console.log('[SUNARP] 📸 Tomando screenshot de la página de resultados...');
      const screenshotPath = 'sunarp-result.png';
      const screenshotBuffer = await page.screenshot({ 
        path: screenshotPath, 
        fullPage: true,
        type: 'png'
      });
      
      if (!screenshotBuffer) {
        console.error('[SUNARP] ❌ ERROR: screenshotBuffer es null o undefined');
        throw new Error('No se pudo capturar el screenshot');
      }
      
      // Convertir screenshot a base64 para enviarlo al frontend
      const screenshotBase64 = screenshotBuffer.toString('base64');
      const screenshotDataUrl = `data:image/png;base64,${screenshotBase64}`;
      console.log('[SUNARP] ✅ Screenshot capturado y convertido a base64');
      console.log('[SUNARP] 📸 screenshotDataUrl existe:', !!screenshotDataUrl);
      console.log('[SUNARP] 📸 screenshotDataUrl longitud:', screenshotDataUrl ? screenshotDataUrl.length : 0);
      
      // NO extraer datos del DOM ni OCR - SOLO devolver la imagen
      // El usuario solo quiere la imagen, no datos extraídos que pueden ser incorrectos
      console.log('[SUNARP] ✅ Screenshot capturado - NO extrayendo datos (solo imagen)');
      
      // SIEMPRE retornar SOLO la imagen, sin datos extraídos
      console.log(`[SUNARP] ✅✅✅ RETORNANDO RESULTADO CON IMAGEN ✅✅✅`);
      console.log(`[SUNARP] 📸 Imagen capturada: ${screenshotDataUrl ? 'Sí' : 'No'}`);
      console.log(`[SUNARP] 📸 Tamaño imagen: ${screenshotDataUrl ? screenshotDataUrl.length : 0} caracteres`);
      console.log(`[SUNARP] 📸 Imagen empieza con 'data:': ${screenshotDataUrl ? screenshotDataUrl.startsWith('data:') : 'N/A'}`);
      
      const resultadoFinal = {
        success: true, // Siempre success si tenemos imagen
        placa: placa,
        datos: {}, // Sin datos extraídos - solo imagen
        imagen: screenshotDataUrl, // Imagen en base64 - SIEMPRE incluida (lo más importante)
        mensaje: "Consulta completada. Ver imagen para detalles."
      };
      
      console.log(`[SUNARP] 📤 Resultado final (sin imagen para logs):`, JSON.stringify({
        ...resultadoFinal,
        imagen: resultadoFinal.imagen ? `[IMAGEN: ${resultadoFinal.imagen.length} chars]` : null
      }, null, 2));
      
      return resultadoFinal;
      
    } catch (error) {
      console.error(`[SUNARP] ❌ ERROR en consultarPlacaIntento:`, error.message);
      console.error(`[SUNARP] ❌ Stack:`, error.stack);
      // Incluso si hay error, intentar tomar un screenshot de la página actual
      try {
        const page = await browser.pages()[0];
        if (page) {
          console.log(`[SUNARP] 📸 Intentando capturar screenshot de error...`);
          const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'png' });
          const screenshotDataUrl = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;
          return {
            success: false,
            placa: placa,
            datos: {},
            imagen: screenshotDataUrl, // Incluir screenshot incluso en caso de error
            mensaje: `Error: ${error.message}. Se capturó screenshot de la página.`
          };
        }
      } catch (screenshotError) {
        console.error(`[SUNARP] ❌ Error capturando screenshot:`, screenshotError.message);
      }
      
      throw error;
    } finally {
      await browser.close();
    }
  }

  // ==================== EXTRAER DATOS DE API ====================
  extraerDatosDeAPI(apiData) {
    const datos = {};
    
    if (!apiData || typeof apiData !== 'object') {
      return datos;
    }
    
    // Mapear campos comunes de la API
    const fieldMapping = {
      'marca': ['marca', 'brand', 'marcaVehiculo'],
      'modelo': ['modelo', 'model', 'modeloVehiculo'],
      'año': ['año', 'anio', 'añoFabricacion', 'year', 'fabricacion'],
      'añoFabricacion': ['añoFabricacion', 'anioFabricacion', 'fabricacion'],
      'añoModelo': ['añoModelo', 'anioModelo', 'modeloYear'],
      'color': ['color', 'colorVehiculo'],
      'serie': ['serie', 'numeroSerie', 'serieVehiculo', 'chasis'],
      'motor': ['motor', 'numeroMotor', 'motorVehiculo'],
      'vin': ['vin', 'numeroVin', 'chassisNumber'],
      'placa': ['placa', 'numeroPlaca', 'placaVehiculo'],
      'tive': ['tive', 'numeroTive', 'tiveVehiculo'],
      'propietario': ['propietario', 'titular', 'owner', 'nombrePropietario', 'titularNombre', 'propietarioNombre', 'nombreTitular', 'nombre', 'razonSocial', 'denominacion']
    };
    
    // Buscar cada campo en la respuesta
    for (const [campo, posiblesNombres] of Object.entries(fieldMapping)) {
      for (const nombre of posiblesNombres) {
        if (apiData[nombre] !== undefined && apiData[nombre] !== null && apiData[nombre] !== '') {
          datos[campo] = String(apiData[nombre]).trim();
          break;
        }
      }
    }
    
    // Buscar en objetos anidados
    if (apiData.data) {
      const nestedData = this.extraerDatosDeAPI(apiData.data);
      Object.assign(datos, nestedData);
    }
    
    if (apiData.resultado) {
      const nestedData = this.extraerDatosDeAPI(apiData.resultado);
      Object.assign(datos, nestedData);
    }
    
    // Buscar propietario en arrays de titulares
    if (apiData.titulares && Array.isArray(apiData.titulares) && apiData.titulares.length > 0) {
      const primerTitular = apiData.titulares[0];
      if (primerTitular.nombre || primerTitular.nombreCompleto || primerTitular.razonSocial) {
        datos.propietario = primerTitular.nombre || primerTitular.nombreCompleto || primerTitular.razonSocial;
      }
    }
    
    // Buscar en cualquier propiedad que contenga "titular" o "propietario"
    for (const key in apiData) {
      if (key.toLowerCase().includes('titular') || key.toLowerCase().includes('propietario')) {
        if (typeof apiData[key] === 'string' && apiData[key].length > 3) {
          datos.propietario = apiData[key];
        } else if (typeof apiData[key] === 'object' && apiData[key] !== null) {
          const nestedPropietario = this.extraerDatosDeAPI(apiData[key]);
          if (nestedPropietario.propietario) {
            datos.propietario = nestedPropietario.propietario;
          }
        }
      }
    }
    
    return datos;
  }

  // ==================== EXTRAER DATOS DEL DOM ====================
  async extraerDatosDelDOM(page) {
    return await page.evaluate(() => {
      const datos = {};
      
      // Buscar en la sección de "Datos del Vehículo" específicamente
      const datosSection = document.querySelector('[class*="datos-vehiculo"], [class*="vehicle-data"], nz-card, .ant-card');
      const searchText = datosSection ? (datosSection.innerText || datosSection.textContent || '') : (document.body.innerText || '');
      
      // Buscar propietario en elementos específicos primero
      const propietarioElements = document.querySelectorAll('div, span, p, td');
      let propietarioText = null;
      for (const el of propietarioElements) {
        const text = (el.innerText || el.textContent || '').toLowerCase();
        if ((text.includes('propietario') || text.includes('titular') || text.includes('titulares del vehículo')) && 
            text.length > 20 && text.length < 200) {
          // Buscar el nombre después de la etiqueta
          const match = (el.innerText || el.textContent || '').match(/(?:propietario|titular|titulares\s+del\s+vehículo)[:\s]+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúÑñ\s,\.]{2,80})/i);
          if (match && match[1]) {
            propietarioText = match[1].trim();
            break;
          }
        }
      }
      
      // Filtrar texto no deseado
      const filteredText = searchText
        .replace(/Tarjeta TIVE/gi, '')
        .replace(/Mayor Información/gi, '')
        .replace(/Verifica que eres/gi, '')
        .replace(/Captcha no resuelto/gi, '')
        .replace(/Por favor resuelva/gi, '');
      
      // Patrones mejorados y más específicos
      const patterns = {
        marca: /marca[:\s]+([A-ZÁÉÍÓÚÑ]{3,30})(?:\s|$|Modelo|Color|Categoría)/i,
        modelo: /modelo[:\s]+([A-Z0-9ÁÉÍÓÚÑ\s\-]{2,30})(?:\s|$|Color|Año|Categoría)/i,
        añoFabricacion: /año\s+de\s+fab\.?[:\s]*([0-9]{4})/i,
        añoModelo: /año\s+modelo[:\s]+([0-9]{4})/i,
        color: /color[:\s]+([A-ZÁÉÍÓÚÑ\s]{2,40})(?:\s|$|Número|Serie|VIN)/i,
        serie: /(?:número\s+de\s+serie|serie)[:\s]+([A-Z0-9]{5,25})(?:\s|$|Motor|VIN)/i,
        motor: /(?:número\s+de\s+motor|motor)[:\s]+([A-Z0-9]{5,25})(?:\s|$|Serie|VIN)/i,
        vin: /(?:número\s+de\s+vin|vin)[:\s]+([A-Z0-9]{10,20})(?:\s|$|Serie|Motor)/i,
        placa: /placa\s+n°[:\s]+([A-Z0-9\-]{5,10})(?:\s|$|Anterior|TIVE)/i,
        tive: /(?:número\s+de\s+tive|tive)[:\s]+([0-9]{10,15})(?:\s|$|Año|Placa)/i,
        propietario: /(?:propietario|titular)[:\s]+([A-Za-zÁÉÍÓÚáéíóúÑñ\s,\.]{3,100})(?:\s|$|Datos|Vehículo)/i
      };
      
      for (const [campo, pattern] of Object.entries(patterns)) {
        const match = filteredText.match(pattern);
        if (match && match[1]) {
          let value = match[1].trim();
          
          // Limpiar valor
          value = value.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
          
          // Validaciones específicas
          if (campo === 'marca') {
            const marcaMatch = value.match(/^([A-ZÁÉÍÓÚÑ]{3,20})/);
            if (marcaMatch) value = marcaMatch[1];
            else if (value.includes('VOLKSWAGEN')) value = 'VOLKSWAGEN';
            else if (value.includes('TOYOTA')) value = 'TOYOTA';
            else if (value.includes('NISSAN')) value = 'NISSAN';
          }
          
          if (campo === 'añoFabricacion' || campo === 'añoModelo') {
            const añoMatch = value.match(/([0-9]{4})/);
            if (añoMatch) value = añoMatch[1];
            else continue; // Saltar si no es un año válido
          }
          
          if (campo === 'modelo') {
            if (value.includes('TIVE') || value.includes('Información') || value.length < 3) {
              continue; // Saltar valores inválidos
            }
          }
          
          if (campo === 'propietario') {
            // Limpiar el propietario de texto común
            value = value.replace(/los titulares del vehículo/gi, '').trim();
            value = value.replace(/del vehículo/gi, '').trim();
            // El propietario debe tener al menos 3 caracteres y ser texto válido
            if (value.length < 3 || /^[0-9\s\-]+$/.test(value)) {
              continue; // Saltar si es solo números o muy corto
            }
          }
          
          // Filtrar valores no deseados
          if (value.length > 0 && 
              value.length < 100 &&
              !value.includes('Zona Registral') &&
              !value.includes('Oficina Registral') &&
              !value.includes('Servicio Gratuito') &&
              !value.includes('ALÓ SUNARP') &&
              !value.includes('Tarjeta TIVE') &&
              !value.includes('Mayor Información')) {
            datos[campo] = value;
          }
        }
      }
      
      if (!datos.año && datos.añoFabricacion) {
        datos.año = datos.añoFabricacion;
      } else if (!datos.año && datos.añoModelo) {
        datos.año = datos.añoModelo;
      }
      
      // Agregar propietario si se encontró
      if (propietarioText && propietarioText.length >= 3) {
        datos.propietario = propietarioText;
      }
      
      return datos;
    });
  }

  // ==================== EXTRAER DATOS CON OCR ====================
  async extractDataFromScreenshot(imagePath) {
    try {
      console.log('[SUNARP] 🔍 Procesando imagen con OCR...');
      const { data: { text } } = await Tesseract.recognize(imagePath, 'spa', {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`[SUNARP] OCR: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      console.log('[SUNARP] 📄 Texto extraído del OCR (primeros 500 caracteres):');
      console.log(text.substring(0, 500));
      
      const datos = {};
      const patterns = {
        marca: /marca[:\s]+([A-ZÁÉÍÓÚÑ\s]{2,30})(?:\n|Modelo|Color|$)/i,
        modelo: /modelo[:\s]+([A-Z0-9ÁÉÍÓÚÑ\s\-]{2,30})(?:\n|Color|Año|$)/i,
        añoFabricacion: /año\s+de\s+fab\.?[:\s]*([0-9]{4})/i,
        añoModelo: /año\s+modelo[:\s]+([0-9]{4})/i,
        color: /color[:\s]+([A-ZÁÉÍÓÚÑ\s]{2,40})(?:\n|Número|Serie|$)/i,
        serie: /(?:número\s+de\s+serie|serie)[:\s]+([A-Z0-9]{5,25})(?:\n|Motor|VIN|$)/i,
        motor: /(?:número\s+de\s+motor|motor)[:\s]+([A-Z0-9]{5,25})(?:\n|Serie|VIN|$)/i,
        vin: /(?:número\s+de\s+vin|vin)[:\s]+([A-Z0-9]{10,20})(?:\n|Serie|Motor|$)/i,
        placa: /placa\s+n°[:\s]+([A-Z0-9\-]{5,10})(?:\n|Anterior|TIVE|$)/i,
        tive: /(?:número\s+de\s+tive|tive)[:\s]+([0-9]{10,15})(?:\n|Año|Placa|$)/i
      };
      
      // Buscar propietario con múltiples patrones (puede estar en diferentes formatos)
      const propietarioPatterns = [
        // Patrón 1: "titulares del vehículo: NOMBRE"
        /(?:titulares\s+del\s+vehículo|propietario|titular)[:\s\.]+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúÑñ\s,\.]{2,80})(?:\n|$|Datos|Vehículo|\.|,)/i,
        // Patrón 2: "V2RO75 los titulares del vehículo. NOMBRE"
        /V2RO75\s+los\s+titulares\s+del\s+vehículo[\.\s]+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúÑñ\s,\.]{2,80})/i,
        // Patrón 3: Buscar después de "titulares del vehículo" en la siguiente línea
        /titulares\s+del\s+vehículo[\.\s]*\n\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúÑñ\s,\.]{2,80})/i,
        // Patrón 4: Buscar cualquier nombre propio después de "titulares"
        /titulares[:\s\.]+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúÑñ\s,\.]{2,80})(?:\n|$|Datos|Vehículo|\.)/i
      ];
      
      for (const pattern of propietarioPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          let value = match[1].trim();
          value = value.replace(/V2RO75/gi, '').trim();
          value = value.replace(/los titulares del vehículo/gi, '').trim();
          value = value.replace(/del vehículo/gi, '').trim();
          value = value.replace(/[=—>\-—]/g, ' ').replace(/\s+/g, ' ').trim();
          
          // Validar que sea un nombre válido (no solo números, no muy corto, no palabras comunes)
          if (value.length >= 3 && 
              !/^[0-9\s\-]+$/.test(value) && 
              !value.includes('TIVE') &&
              !value.includes('Verifica') &&
              !value.includes('Captcha') &&
              !value.toLowerCase().includes('realizar') &&
              !value.toLowerCase().includes('busqueda')) {
            datos.propietario = value;
            console.log(`[SUNARP] ✅ propietario encontrado por OCR: ${value}`);
            break;
          }
        }
      }
      
      // Si no se encontró con patrones, buscar cualquier texto que parezca un nombre después de "titulares"
      if (!datos.propietario) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes('titulares') || lines[i].toLowerCase().includes('propietario')) {
            // Buscar en las siguientes 3 líneas
            for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
              const line = lines[j].trim();
              // Verificar si la línea parece un nombre (empieza con mayúscula, tiene al menos 3 caracteres, no es solo números)
              if (line.length >= 3 && 
                  /^[A-ZÁÉÍÓÚÑ]/.test(line) && 
                  !/^[0-9\s\-]+$/.test(line) &&
                  !line.includes('TIVE') &&
                  !line.includes('Verifica') &&
                  !line.toLowerCase().includes('realizar')) {
                datos.propietario = line;
                console.log(`[SUNARP] ✅ propietario encontrado por OCR (línea siguiente): ${line}`);
                break;
              }
            }
            if (datos.propietario) break;
          }
        }
      }
      
      for (const [campo, pattern] of Object.entries(patterns)) {
        const match = text.match(pattern);
        if (match && match[1]) {
          let value = match[1].trim();
          value = value.replace(/[=—>\-—]/g, ' ').replace(/\s+/g, ' ').trim();
          
          if (campo === 'marca') {
            const marcaMatch = value.match(/^([A-ZÁÉÍÓÚÑ]{3,20})/);
            if (marcaMatch) value = marcaMatch[1];
          }
          
          if (campo === 'añoFabricacion' || campo === 'añoModelo') {
            const añoMatch = value.match(/([0-9]{4})/);
            if (añoMatch) value = añoMatch[1];
          }
          
          if (value.length > 0 && value.length < 100 &&
              !value.includes('TIVE') &&
              !value.includes('Verifica') &&
              !value.match(/^[=—>\-—\s]+$/)) {
            datos[campo] = value;
            console.log(`[SUNARP] ✅ ${campo} encontrado por OCR: ${value}`);
          }
        }
      }
      
      if (!datos.año && datos.añoFabricacion) {
        datos.año = datos.añoFabricacion;
      } else if (!datos.año && datos.añoModelo) {
        datos.año = datos.añoModelo;
      }
      
      // Limpiar datos
      const datosLimpios = {};
      Object.keys(datos).forEach(key => {
        let value = datos[key];
        if (typeof value === 'string') {
          value = value.replace(/Captcha no resuelto/gi, '').trim();
          value = value.replace(/Verificación de seguridad/gi, '').trim();
          value = value.replace(/Tarjeta TIVE/gi, '').trim();
          value = value.replace(/[=—>\-—]/g, ' ').replace(/\s+/g, ' ').trim();
          
          if (value.length > 0 && value.length < 200) {
            datosLimpios[key] = value;
          }
        }
      });
      
      console.log('[SUNARP] 📊 Datos extraídos por OCR (limpios):', JSON.stringify(datosLimpios, null, 2));
      return Object.keys(datosLimpios).length > 0 ? datosLimpios : null;
      
    } catch (error) {
      console.log(`[SUNARP] ⚠️ Error en OCR: ${error.message}`);
      return null;
    }
  }
}

module.exports = SUNARPVehicularScraper;
