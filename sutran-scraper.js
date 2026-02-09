/**
 * SUTRAN RECORD DE INFRACCIONES SCRAPER
 * Optimizado para velocidad - Similar a mtc-scraper-final.js
 * Extracción rápida y directa de datos desde el iframe
 */

const { chromium } = require('playwright');

class SUTRANScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://webexterno.sutran.gob.pe/WebExterno/Pages/frmRecordInfracciones.aspx';
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
  // SIGUIENDO EL PATRÓN DE MTC: Lanza errores para que el endpoint los maneje
  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [SUTRAN] Iniciando consulta para: ${placa}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarPlacaIntento(placa);
        
        // Verificar si el resultado tiene infracciones (éxito real)
        const hasInfracciones = resultado.infracciones && Array.isArray(resultado.infracciones) && resultado.infracciones.length > 0;
        
        if (resultado.success && hasInfracciones) {
          console.log(`✅ [SUTRAN] CONSULTA EXITOSA en intento ${attempt} - ${resultado.infracciones.length} infracción(es) encontrada(s)`);
          this.stats.successes++;
          return resultado;
        }
        
        // Si success es true pero no hay infracciones, puede ser un resultado vacío válido
        if (resultado.success && !hasInfracciones) {
          console.log(`⚠️ Intento ${attempt} completado pero sin infracciones`);
          // Si es el último intento, devolver el resultado vacío
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
          throw error; // Lanzar error para que el endpoint lo maneje (como MTC)
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
      
      // Interceptar respuestas para capturar datos
      let datosInfracciones = null;
      
      page.on('response', async (response) => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        try {
          // Capturar datos de infracciones (si vienen por API)
          if (contentType.includes('json') || url.includes('api') || url.includes('consulta')) {
            try {
              const json = await response.json();
              if (json.infracciones || json.data || json.records) {
                datosInfracciones = json;
                console.log(`   📊 Datos de infracciones capturados desde: ${url}`);
              }
            } catch (e) {
              // No es JSON válido
            }
          }
        } catch (e) {
          // Ignorar errores de parsing
        }
      });
      
      // 1. NAVEGAR AL FORMULARIO (ASP.NET WebForms requiere GET inicial para cookies/VIEWSTATE)
      console.log('🌐 Navegando al sitio SUTRAN...');
      console.log(`   🔗 URL: ${this.baseURL}`);
      
      let navigationSuccess = false;
      try {
        const response = await page.goto(this.baseURL, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        console.log(`   📊 Status de respuesta: ${response?.status()}`);
        console.log(`   📊 Content-Type: ${response?.headers()?.['content-type'] || 'N/A'}`);
        
        navigationSuccess = true;
      } catch (navError) {
        console.log(`   ⚠️ Error en navegación inicial: ${navError.message}`);
        console.log('   ⚠️ Intentando con networkidle...');
        
        try {
          const response = await page.goto(this.baseURL, {
            waitUntil: 'networkidle',
            timeout: 45000
          });
          
          console.log(`   📊 Status de respuesta (retry): ${response?.status()}`);
          navigationSuccess = true;
        } catch (retryError) {
          console.error(`   ❌ Error en retry de navegación: ${retryError.message}`);
          throw new Error(`No se pudo navegar al sitio: ${retryError.message}`);
        }
      }
      
      // Esperar a que cargue la página completamente
      console.log('   ⏳ Esperando carga completa de la página...');
      await this.delay(3000);
      
      // Verificar que la página cargó correctamente
      const pageTitle = await page.title();
      const pageURL = page.url();
      console.log(`   📄 Título de la página: ${pageTitle}`);
      console.log(`   🔗 URL actual: ${pageURL}`);
      
      // Verificar si hay VIEWSTATE (ASP.NET WebForms)
      const hasViewState = await page.evaluate(() => {
        return !!document.querySelector('input[name="__VIEWSTATE"]');
      });
      console.log(`   🔍 VIEWSTATE presente: ${hasViewState}`);
      
      // 2. ESPERAR A QUE CARGUE EL FORMULARIO
      console.log('⏳ Esperando que el formulario se cargue...');
      await this.waitForFormEnabled(page);
      
      // 3. GENERAR Y RESOLVER CAPTCHA
      console.log('🔐 Verificando CAPTCHA...');
      const needsCaptcha = await page.evaluate(() => {
        return document.body.innerText.toLowerCase().includes('código que se muestra') ||
               document.body.innerText.toLowerCase().includes('generar código') ||
               document.body.innerText.toLowerCase().includes('ingrese el código');
      });
      
      if (needsCaptcha) {
        console.log('   ⚠️ CAPTCHA requerido, generando imagen...');
        
        // Buscar y hacer clic en el botón "Generar código"
        const generateButton = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('input[type="submit"], button, a'));
          for (const btn of buttons) {
            const text = (btn.value || btn.textContent || btn.innerText || '').toLowerCase();
            if (text.includes('generar') && text.includes('código')) {
              return { found: true, type: btn.tagName, id: btn.id || '', value: btn.value || '' };
            }
          }
          return { found: false };
        });
        
        if (generateButton.found) {
          console.log(`   🔘 Botón "Generar código" encontrado, haciendo clic...`);
          try {
            // Hacer clic en el botón para generar el CAPTCHA
            await page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll('input[type="submit"], button, a'));
              for (const btn of buttons) {
                const text = (btn.value || btn.textContent || btn.innerText || '').toLowerCase();
                if (text.includes('generar') && text.includes('código')) {
                  btn.click();
                  return;
                }
              }
            });
            
            console.log('   ⏳ Esperando a que se genere la imagen del CAPTCHA...');
            await this.delay(3000); // Esperar a que se genere la imagen
            
            // Ahora resolver el CAPTCHA
            try {
              const captchaText = await this.solveCaptcha(page);
              console.log(`   ✅ CAPTCHA resuelto: ${captchaText}`);
              await this.delay(1000);
            } catch (captchaError) {
              console.error(`   ❌ Error resolviendo CAPTCHA: ${captchaError.message}`);
              // Continuar de todas formas
            }
          } catch (clickError) {
            console.error(`   ❌ Error haciendo clic en "Generar código": ${clickError.message}`);
          }
        } else {
          console.log('   ⚠️ Botón "Generar código" no encontrado, intentando resolver CAPTCHA directamente...');
          try {
            const captchaText = await this.solveCaptcha(page);
            console.log(`   ✅ CAPTCHA resuelto: ${captchaText}`);
            await this.delay(1000);
          } catch (captchaError) {
            console.error(`   ❌ Error resolviendo CAPTCHA: ${captchaError.message}`);
          }
        }
      } else {
        console.log('   ✅ No se detectó necesidad de CAPTCHA');
      }
      
      // 4. LLENAR FORMULARIO
      console.log('📝 Llenando formulario...');
      await this.fillForm(page, placa);
      
      // 5. ENVIAR CONSULTA
      console.log('🚀 Enviando consulta...');
      await this.submitForm(page);
      
      // 5. ESPERAR RESULTADOS
      console.log('⏳ Esperando resultados...');
      
      // Esperar específicamente la tabla #gvDeudas que es la que contiene los datos
      try {
        console.log('   🔍 Buscando tabla #gvDeudas...');
        await page.waitForSelector('#gvDeudas', { timeout: 20000 });
        console.log('   ✅ Tabla #gvDeudas detectada');
        await this.delay(3000); // Esperar más para que se renderice completamente
      } catch (e) {
        console.log('   ⚠️ Tabla #gvDeudas no encontrada, buscando otras tablas...');
        try {
          await page.waitForSelector('table[id*="gv" i], table[id*="grid" i]', { timeout: 10000 });
          console.log('   ✅ Tabla alternativa detectada');
          await this.delay(3000);
        } catch (e2) {
          console.log('   ⚠️ Ninguna tabla encontrada, esperando tiempo adicional...');
          await this.delay(5000);
        }
      }
      
      // Verificar si hay mensaje de resultados
      const hasResults = await page.evaluate(() => {
        const lblItems = document.getElementById('lblItems');
        if (lblItems) {
          const text = lblItems.textContent.trim().toLowerCase();
          return text.includes('encontr') && !text.includes('0 documentos');
        }
        return false;
      });
      
      if (hasResults) {
        console.log('   ✅ Mensaje de resultados encontrado en la página');
      }
      
      // 6. EXTRAER RESULTADOS
      console.log('📊 Extrayendo datos...');
      const resultados = await this.extractResults(page, datosInfracciones, placa);
      
      await browser.close();
      
      return {
        success: true,
        placa: placa,
        ...resultados,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      await browser.close();
      throw error; // Lanzar error para que el método principal lo maneje (como MTC)
    }
  }

  // ==================== FUNCIONES CRÍTICAS ====================

  async waitForFormEnabled(page, timeout = 20000) {
    console.log('   ⏳ Verificando estado del formulario...');
    
    try {
      // Esperar que el input exista (no necesariamente visible)
      await page.waitForSelector('#TxtBuscar, input[id*="TxtBuscar" i], input[type="text"]', { 
        timeout,
        state: 'attached' // Solo necesita existir, no estar visible
      });
      console.log('   ✅ Formulario cargado');
      await this.delay(2000); // Dar más tiempo para que se renderice
    } catch (error) {
      console.log('   ⚠️ Timeout esperando formulario, continuando de todas formas...');
      // Continuar de todas formas, usaremos evaluate que no requiere visibilidad
    }
  }

  async fillForm(page, placa) {
    // Buscar input de placa
    const placaSelectors = [
      'input[name*="placa" i]',
      'input[id*="placa" i]',
      'input[id*="txtPlaca" i]',
      'input[placeholder*="placa" i]',
      '#txtPlaca',
      '#placa',
      'input[type="text"]'
    ];
    
    let placaInput = null;
    for (const selector of placaSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        placaInput = await page.$(selector);
        if (placaInput) {
          await page.fill(selector, placa);
          console.log(`   ✅ Placa ingresada: ${placa} (selector: ${selector})`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
      if (!placaInput) {
      // Intentar con evaluate como último recurso
      const inputFound = await page.evaluate((placa) => {
        // Buscar input por ID común de ASP.NET
        const txtBuscar = document.getElementById('TxtBuscar') || 
                         document.querySelector('input[id*="TxtBuscar" i]') ||
                         document.querySelector('input[id*="txtBuscar" i]');
        
        if (txtBuscar) {
          txtBuscar.value = placa;
          txtBuscar.dispatchEvent(new Event('input', { bubbles: true }));
          txtBuscar.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        
        // Buscar cualquier input de texto
        const inputs = document.querySelectorAll('input[type="text"]');
        for (const input of inputs) {
          const name = input.name || '';
          const id = input.id || '';
          const placeholder = (input.placeholder || '').toLowerCase();
          
          if (name.toLowerCase().includes('placa') || 
              id.toLowerCase().includes('placa') ||
              id.toLowerCase().includes('buscar') ||
              placeholder.includes('placa') ||
              placeholder.includes('datos')) {
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
        // No lanzar error, intentar continuar
        console.log(`   ⚠️ No se encontró input, pero continuando...`);
        placaInput = { found: false };
      }
    }
    
    await this.delay(500);
  }

  async submitForm(page) {
    // Para ASP.NET WebForms, necesitamos extraer VIEWSTATE y EVENTVALIDATION antes de enviar
    console.log('   🔍 Extrayendo campos ocultos de ASP.NET...');
    
    const hiddenFields = await page.evaluate(() => {
      const fields = {};
      const viewstate = document.querySelector('input[name="__VIEWSTATE"]');
      const eventvalidation = document.querySelector('input[name="__EVENTVALIDATION"]');
      const viewstategenerator = document.querySelector('input[name="__VIEWSTATEGENERATOR"]');
      
      if (viewstate) fields.__VIEWSTATE = viewstate.value;
      if (eventvalidation) fields.__EVENTVALIDATION = eventvalidation.value;
      if (viewstategenerator) fields.__VIEWSTATEGENERATOR = viewstategenerator.value;
      
      return fields;
    });
    
    console.log(`   📋 VIEWSTATE presente: ${!!hiddenFields.__VIEWSTATE}`);
    console.log(`   📋 EVENTVALIDATION presente: ${!!hiddenFields.__EVENTVALIDATION}`);
    
    // Guardar URL actual para verificar que no navegue a Captcha.aspx
    const urlAntes = page.url();
    console.log(`   📍 URL antes del submit: ${urlAntes}`);
    
    // Buscar botón de envío #BtnBuscar según el HTML
    const buttonSelectors = [
      '#BtnBuscar',
      'input[id*="BtnBuscar" i]',
      'input[type="submit"][value*="Buscar" i]',
      'input[type="submit"]',
      'button[type="submit"]',
      'input[value*="Buscar" i]'
    ];
    
    let buttonFound = false;
    for (const selector of buttonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await page.evaluate((sel) => {
            const btn = document.querySelector(sel);
            return btn && btn.offsetParent !== null && btn.style.display !== 'none';
          }, selector);
          
          if (isVisible) {
            await this.delay(500);
            
            // Hacer click y esperar navegación (pero no a Captcha.aspx)
            try {
              await Promise.race([
                page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).then(() => {
                  const urlDespues = page.url();
                  if (urlDespues.includes('Captcha.aspx')) {
                    throw new Error('Navegó a Captcha.aspx, esto no debería pasar');
                  }
                }),
                button.click()
              ]);
              buttonFound = true;
              console.log(`   ✅ Botón clickeado (selector: ${selector})`);
              break;
            } catch (navError) {
              // Si navegó a Captcha.aspx, volver atrás
              if (page.url().includes('Captcha.aspx')) {
                console.log('   ⚠️ Navegó a Captcha.aspx, volviendo a la página principal...');
                await page.goto('https://webexterno.sutran.gob.pe/WebExterno/Pages/frmRecordInfracciones.aspx', {
                  waitUntil: 'networkidle',
                  timeout: 30000
                });
                await this.delay(3000);
              }
              buttonFound = true;
              break;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!buttonFound) {
      // Intentar con Enter en el input de placa
      console.log('   ⚠️ Botón no encontrado, intentando con Enter...');
      try {
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).then(() => {
            const urlDespues = page.url();
            if (urlDespues.includes('Captcha.aspx')) {
              throw new Error('Navegó a Captcha.aspx');
            }
          }),
          page.keyboard.press('Enter')
        ]);
        console.log(`   ✅ Presionado Enter para enviar`);
      } catch (navError) {
        if (page.url().includes('Captcha.aspx')) {
          console.log('   ⚠️ Navegó a Captcha.aspx, volviendo a la página principal...');
          await page.goto('https://webexterno.sutran.gob.pe/WebExterno/Pages/frmRecordInfracciones.aspx', {
            waitUntil: 'networkidle',
            timeout: 30000
          });
          await this.delay(3000);
        }
      }
    }
    
    // Verificar que estamos en la página correcta
    const urlDespues = page.url();
    if (urlDespues.includes('Captcha.aspx')) {
      console.log('   ⚠️ Página navegó a Captcha.aspx, volviendo a la página principal...');
      await page.goto('https://webexterno.sutran.gob.pe/WebExterno/Pages/frmRecordInfracciones.aspx', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      await this.delay(3000);
    }
    
    // Esperar a que se procese el submit
    await this.delay(5000);
  }

  async extractResults(page, datosInfracciones, placa) {
    // Si ya tenemos los datos desde la respuesta interceptada, usarlos
    if (datosInfracciones) {
      console.log('   ✅ Usando datos de respuesta interceptada');
      return this.formatDatos(datosInfracciones);
    }
    
    // Si no, intentar extraer del DOM
    try {
      console.log('   🔍 Extrayendo datos del DOM...');
      
      // Primero, verificar el estado de la página después del submit
      const pageState = await page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          bodyText: document.body.innerText.substring(0, 500),
          hasTables: document.querySelectorAll('table').length,
          hasGridViews: document.querySelectorAll('[id*="grid" i], [id*="GridView" i]').length
        };
      });
      
      console.log(`   📊 Estado de la página:`);
      console.log(`      URL: ${pageState.url}`);
      console.log(`      Tablas: ${pageState.hasTables}`);
      console.log(`      GridViews: ${pageState.hasGridViews}`);
      console.log(`      Texto inicial: ${pageState.bodyText.substring(0, 200)}`);
      
      await this.delay(3000);
      
      // Esperar a que aparezca la tabla de resultados
      try {
        await page.waitForSelector('table, .grid, #gvInfracciones, [id*="grid" i]', { timeout: 10000 });
      } catch (e) {
        console.log('   ⚠️ Tabla no encontrada, buscando en todo el DOM...');
      }
      
      const datos = await page.evaluate((placaOriginal) => {
        const data = {
          placa: placaOriginal,
          infracciones: [],
          mensaje: '',
          montoTotal: '0.00'
        };
        
        // Palabras a filtrar (no son datos reales)
        const palabrasInvalidas = [
          'generar código', 'generar codigo', 'placa:', 'fecha:', 
          'infracción:', 'infraccion:', 'sancion:', 'estado:',
          'buscar', 'consultar', 'limpiar', 'reset', 'submit',
          'ingrese', 'datos aquí', 'click', 'clic', 'ver', 'detalle'
        ];
        
        const esValido = (texto) => {
          if (!texto || texto.length < 2) return false;
          const textoLower = texto.toLowerCase().trim();
          // No debe ser solo espacios, números solos, o palabras inválidas
          if (textoLower.length < 3) return false;
          if (/^\d+$/.test(textoLower)) return false; // Solo números
          return !palabrasInvalidas.some(palabra => textoLower.includes(palabra));
        };
        
        const esFechaValida = (texto) => {
          if (!texto) return false;
          // Buscar patrones de fecha: DD/MM/YYYY, DD-MM-YYYY, etc.
          return /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(texto) || 
                 /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(texto);
        };
        
        // Buscar la tabla específica de deudas (#gvDeudas según el HTML)
        const tablaDeudas = document.getElementById('gvDeudas');
        
        if (tablaDeudas) {
          console.log('✅ Tabla #gvDeudas encontrada, extrayendo datos...');
          
          // Extraer datos de la tabla #gvDeudas
          // Primero intentar con tbody, si no hay, buscar directamente en la tabla
          let filas = tablaDeudas.querySelectorAll('tbody tr');
          console.log(`📊 Filas en tbody: ${filas.length}`);
          
          if (filas.length === 0) {
            console.log('⚠️ No hay filas en tbody, buscando directamente en la tabla...');
            filas = tablaDeudas.querySelectorAll('tr');
            console.log(`📊 Filas directas encontradas: ${filas.length}`);
          }
          
          for (let i = 1; i < filas.length; i++) {
            const row = filas[i];
            const cells = row.querySelectorAll('td');
            const rowText = row.textContent.trim();
            
            // Verificar si es fila de header (fondo azul o contiene texto de header)
            const bgColor = row.style.backgroundColor || window.getComputedStyle(row).backgroundColor;
            const isHeader = bgColor.includes('002F76') || 
                           bgColor.includes('rgb(0, 47, 118)') || 
                           bgColor.includes('rgb(0,47,118)') ||
                           rowText.includes('Número de documento') ||
                           rowText.includes('Tipo de Documento') ||
                           rowText.includes('Fecha de Documento');
            
            if (isHeader || !rowText || rowText.length < 5 || rowText === '&nbsp;') {
              console.log(`⏭️ Saltando fila ${i} (header o vacía): "${rowText.substring(0, 50)}"`);
              continue;
            }
            
            if (cells.length >= 5) {
              const numeroDocumento = cells[0].textContent.trim();
              const tipoDocumento = cells[1].textContent.trim();
              const fechaDocumento = cells[2].textContent.trim();
              const codigoInfraccion = cells[3].textContent.trim();
              const clasificacion = cells[4].textContent.trim();
              
              console.log(`📝 Fila ${i}: ${numeroDocumento} | ${tipoDocumento} | ${fechaDocumento} | ${codigoInfraccion} | ${clasificacion}`);
              
              // Validar que tenga datos reales (número de documento debe tener al menos 4 dígitos)
              if (numeroDocumento && numeroDocumento.length >= 4 && /^\d+/.test(numeroDocumento)) {
                data.infracciones.push({
                  numeroDocumento: numeroDocumento,
                  tipoDocumento: tipoDocumento,
                  fechaDocumento: fechaDocumento,
                  codigoInfraccion: codigoInfraccion,
                  clasificacion: clasificacion
                });
                console.log(`✅✅ Infracción AGREGADA: ${numeroDocumento} - ${tipoDocumento} - ${fechaDocumento}`);
              } else {
                console.log(`⚠️ Fila ${i} descartada: número de documento inválido (${numeroDocumento})`);
              }
            } else {
              console.log(`⚠️ Fila ${i} tiene solo ${cells.length} celdas (se necesitan 5)`);
            }
          }
        } else {
          console.log('⚠️ Tabla #gvDeudas no encontrada, buscando otras tablas...');
          
          // Fallback: buscar cualquier tabla con resultados
          const todasLasTablas = document.querySelectorAll('table');
          for (const tabla of todasLasTablas) {
            const filas = tabla.querySelectorAll('tbody tr');
            if (filas.length > 1) { // Tiene al menos header + 1 fila de datos
              const primeraFilaDatos = filas[1];
              const celdas = primeraFilaDatos.querySelectorAll('td');
              if (celdas.length >= 5) {
                console.log(`Tabla alternativa encontrada con ${filas.length} filas`);
                // Procesar esta tabla
                for (let i = 1; i < filas.length; i++) {
                  const row = filas[i];
                  const cells = row.querySelectorAll('td');
                  
                  // Saltar filas vacías o de totales
                  const rowText = row.textContent.trim();
                  if (!rowText || rowText.length < 5 || rowText.includes('&nbsp;')) {
                    continue;
                  }
                  
                  if (cells.length >= 5) {
                    const numeroDocumento = cells[0].textContent.trim();
                    const tipoDocumento = cells[1].textContent.trim();
                    const fechaDocumento = cells[2].textContent.trim();
                    const codigoInfraccion = cells[3].textContent.trim();
                    const clasificacion = cells[4].textContent.trim();
                    
                    // Validar que tenga datos reales
                    if (numeroDocumento && numeroDocumento.length > 3) {
                      data.infracciones.push({
                        numeroDocumento: numeroDocumento,
                        tipoDocumento: tipoDocumento,
                        fechaDocumento: fechaDocumento,
                        codigoInfraccion: codigoInfraccion,
                        clasificacion: clasificacion
                      });
                      console.log(`✅ Infracción agregada: ${numeroDocumento} - ${tipoDocumento}`);
                    }
                  }
                }
                break;
              }
            }
          }
        }
        
        // Extraer monto total
        const lblTotalDeuda = document.getElementById('lblTotalDeuda');
        if (lblTotalDeuda) {
          const montoText = lblTotalDeuda.textContent.trim();
          const montoMatch = montoText.match(/S\/\.\s*([\d,]+\.?\d*)/);
          if (montoMatch) {
            data.montoTotal = montoMatch[1].replace(/,/g, '');
          }
        }
        
        // Extraer placa del resultado
        const lblDoc = document.getElementById('lblDoc');
        if (lblDoc) {
          const placaText = lblDoc.textContent.trim();
          if (placaText && placaText.length >= 6) {
            data.placa = placaText.toUpperCase();
          }
        }
        
        // Verificar mensaje de "no se encontraron" SOLO si no hay infracciones
        if (data.infracciones.length === 0) {
          const lblItems = document.getElementById('lblItems');
          if (lblItems) {
            const itemsText = lblItems.textContent.trim().toLowerCase();
            if (itemsText.includes('no se encontr') || itemsText.includes('0 documentos')) {
              data.mensaje = 'No se encontraron infracciones registradas';
            } else if (itemsText.includes('encontr')) {
              // Hay mensaje de "se encontró X" pero no hay datos en la tabla
              data.mensaje = 'No se encontraron infracciones registradas';
            }
          }
        }
        
        console.log(`Total infracciones extraídas: ${data.infracciones.length}`);
        console.log(`Monto total: S/. ${data.montoTotal}`);
        
        return data;
      }, placa);
      
      // Log detallado de lo que se encontró
      console.log(`   📊 Resultado del análisis:`);
      console.log(`      Placa encontrada: ${datos.placa || 'NO'}`);
      console.log(`      Infracciones encontradas: ${datos.infracciones?.length || 0}`);
      console.log(`      Mensaje: ${datos.mensaje || 'N/A'}`);
      console.log(`      Monto total: ${datos.montoTotal || '0.00'}`);
      
      // Log detallado de cada infracción encontrada
      if (datos.infracciones && datos.infracciones.length > 0) {
        console.log(`   ✅ ${datos.infracciones.length} infracción(es) extraída(s)`);
        datos.infracciones.forEach((inf, idx) => {
          console.log(`      ${idx + 1}. N° Doc: ${inf.numeroDocumento || 'N/A'} | Tipo: ${inf.tipoDocumento || 'N/A'} | Fecha: ${inf.fechaDocumento || 'N/A'} | Código: ${inf.codigoInfraccion || 'N/A'} | Clasificación: ${inf.clasificacion || 'N/A'}`);
        });
        return {
          placa: datos.placa || placa,
          infracciones: datos.infracciones,
          montoTotal: datos.montoTotal || '0.00'
        };
      }
      
      // Si no hay infracciones pero hay mensaje de "se encontró X documentos", esperar más tiempo
      if (datos.mensaje && datos.mensaje.includes('No se encontraron') === false) {
        console.log(`   ⚠️ Hay mensaje pero no hay infracciones, puede que la tabla aún no se haya cargado completamente`);
        console.log(`   ⚠️ Esperando tiempo adicional y reintentando extracción...`);
        await this.delay(5000);
        
        // Reintentar extracción
        const datosRetry = await page.evaluate((placaOriginal) => {
          const data = {
            placa: placaOriginal,
            infracciones: [],
            mensaje: '',
            montoTotal: '0.00'
          };
          
          console.log('🔍 Reintentando extracción de datos...');
          
          const tablaDeudas = document.getElementById('gvDeudas');
          
          if (tablaDeudas) {
            console.log('✅ Tabla #gvDeudas encontrada en retry, extrayendo datos...');
            
            let filas = tablaDeudas.querySelectorAll('tbody tr');
            console.log(`📊 Filas en tbody: ${filas.length}`);
            
            if (filas.length === 0) {
              console.log('⚠️ No hay filas en tbody, buscando directamente en la tabla...');
              filas = tablaDeudas.querySelectorAll('tr');
              console.log(`📊 Filas directas encontradas: ${filas.length}`);
            }
            
            for (let i = 1; i < filas.length; i++) {
              const row = filas[i];
              const cells = row.querySelectorAll('td');
              const rowText = row.textContent.trim();
              
              const bgColor = row.style.backgroundColor || window.getComputedStyle(row).backgroundColor;
              const isHeader = bgColor.includes('002F76') || 
                             bgColor.includes('rgb(0, 47, 118)') || 
                             bgColor.includes('rgb(0,47,118)') ||
                             rowText.includes('Número de documento') ||
                             rowText.includes('Tipo de Documento') ||
                             rowText.includes('Fecha de Documento');
              
              if (isHeader || !rowText || rowText.length < 5 || rowText === '&nbsp;') {
                console.log(`⏭️ Saltando fila ${i} (header o vacía): "${rowText.substring(0, 50)}"`);
                continue;
              }
              
              if (cells.length >= 5) {
                const numeroDocumento = cells[0].textContent.trim();
                const tipoDocumento = cells[1].textContent.trim();
                const fechaDocumento = cells[2].textContent.trim();
                const codigoInfraccion = cells[3].textContent.trim();
                const clasificacion = cells[4].textContent.trim();
                
                console.log(`📝 Fila ${i}: ${numeroDocumento} | ${tipoDocumento} | ${fechaDocumento} | ${codigoInfraccion} | ${clasificacion}`);
                
                if (numeroDocumento && numeroDocumento.length >= 4 && /^\d+/.test(numeroDocumento)) {
                  data.infracciones.push({
                    numeroDocumento: numeroDocumento,
                    tipoDocumento: tipoDocumento,
                    fechaDocumento: fechaDocumento,
                    codigoInfraccion: codigoInfraccion,
                    clasificacion: clasificacion
                  });
                  console.log(`✅✅ Infracción AGREGADA en retry: ${numeroDocumento} - ${tipoDocumento} - ${fechaDocumento}`);
                } else {
                  console.log(`⚠️ Fila ${i} descartada: número de documento inválido (${numeroDocumento})`);
                }
              } else {
                console.log(`⚠️ Fila ${i} tiene solo ${cells.length} celdas (se necesitan 5)`);
              }
            }
          }
          
          const lblTotalDeuda = document.getElementById('lblTotalDeuda');
          if (lblTotalDeuda) {
            const montoText = lblTotalDeuda.textContent.trim();
            const montoMatch = montoText.match(/S\/\.\s*([\d,]+\.?\d*)/);
            if (montoMatch) {
              data.montoTotal = montoMatch[1].replace(/,/g, '');
            }
          }
          
          const lblDoc = document.getElementById('lblDoc');
          if (lblDoc) {
            const placaText = lblDoc.textContent.trim();
            if (placaText && placaText.length >= 6) {
              data.placa = placaText.toUpperCase();
            }
          }
          
          console.log(`Total infracciones extraídas en retry: ${data.infracciones.length}`);
          
          return data;
        }, placa);
        
        if (datosRetry.infracciones && datosRetry.infracciones.length > 0) {
          console.log(`   ✅✅ En retry se encontraron ${datosRetry.infracciones.length} infracción(es)`);
          return {
            placa: datosRetry.placa || placa,
            infracciones: datosRetry.infracciones,
            montoTotal: datosRetry.montoTotal || '0.00'
          };
        }
      }
      
      if (datos.mensaje) {
        console.log(`   ℹ️ ${datos.mensaje}`);
        return {
          placa: datos.placa || placa,
          infracciones: [],
          mensaje: datos.mensaje
        };
      }
      
      // Si no hay datos, verificar si hay mensaje de "sin datos" en la página
      const hasNoDataMessage = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('sin infracciones') || 
               text.includes('no se encontraron') ||
               text.includes('sin registros') ||
               text.includes('no hay registros') ||
               text.includes('no existen');
      });
      
      if (hasNoDataMessage) {
        console.log('   ℹ️ Mensaje de "sin datos" detectado en la página');
        return {
          placa: datos.placa || placa,
          infracciones: [],
          mensaje: "No se encontraron infracciones registradas"
        };
      }
      
      // Si no hay datos, tomar screenshot para debugging
      try {
        await page.screenshot({ path: 'debug-sutran-no-data.png', fullPage: true });
        console.log('   📸 Screenshot guardado: debug-sutran-no-data.png');
      } catch (e) {
        // Ignorar error de screenshot
      }
      
      console.log('   ⚠️ No se encontraron datos en el DOM');
      return {
        placa: datos.placa || placa,
        infracciones: [],
        mensaje: "No se encontraron infracciones registradas"
      };
    } catch (e) {
      console.error('   ⚠️ Error extrayendo del DOM:', e.message);
      return {
        placa: '',
        infracciones: []
      };
    }
  }

  formatDatos(datos) {
    // Normalizar datos que vienen en diferentes formatos
    if (datos.infracciones) {
      return {
        placa: datos.placa || '',
        infracciones: datos.infracciones
      };
    }
    
    if (datos.data && Array.isArray(datos.data)) {
      return {
        placa: datos.placa || '',
        infracciones: datos.data
      };
    }
    
    if (datos.records && Array.isArray(datos.records)) {
      return {
        placa: datos.placa || '',
        infracciones: datos.records
      };
    }
    
    return {
      placa: '',
      infracciones: []
    };
  }

  // ==================== RESOLVER CAPTCHA ====================
  async solveCaptcha(page) {
    console.log('   📸 Obteniendo imagen del CAPTCHA...');
    
    // El CAPTCHA está en un iframe, necesitamos acceder a él
    console.log('   🔍 Buscando iframe del CAPTCHA...');
    await this.delay(2000);
    
    // Buscar el iframe del CAPTCHA
    const iframeHandle = await page.$('#iimage');
    if (!iframeHandle) {
      throw new Error('No se encontró el iframe del CAPTCHA (#iimage)');
    }
    
    console.log('   ✅ Iframe del CAPTCHA encontrado, accediendo al contenido...');
    const iframeContent = await iframeHandle.contentFrame();
    
    if (!iframeContent) {
      throw new Error('No se pudo acceder al contenido del iframe del CAPTCHA');
    }
    
    // Esperar a que cargue el contenido del iframe
    await this.delay(2000);
    
    // Obtener la imagen del CAPTCHA desde el iframe
    const captchaInfo = await iframeContent.evaluate(() => {
      // Estrategia 1: Buscar por atributos específicos
      const captchaSelectors = [
        'img[src*="captcha" i]',
        'img[id*="captcha" i]',
        'img[name*="captcha" i]',
        'img[alt*="código" i]',
        'img[alt*="codigo" i]',
        'img[alt*="captcha" i]',
        'img[class*="captcha" i]'
      ];
      
      for (const selector of captchaSelectors) {
        const img = document.querySelector(selector);
        if (img && img.src && !img.src.includes('ajax-loader') && !img.src.includes('loading')) {
          return { found: true, src: img.src, selector: selector };
        }
      }
      
      // Estrategia 2: Buscar todas las imágenes y filtrar
      const allImages = Array.from(document.querySelectorAll('img'));
      for (const img of allImages) {
        const src = img.src || '';
        const id = (img.id || '').toLowerCase();
        const alt = (img.alt || '').toLowerCase();
        const className = (img.className || '').toLowerCase();
        
        // Excluir imágenes que NO son CAPTCHA
        if (src.includes('ajax-loader') || 
            src.includes('loading') || 
            src.includes('spinner') ||
            src.includes('logo') ||
            src.includes('banner') ||
            id.includes('logo') ||
            id.includes('banner')) {
          continue;
        }
        
        // Buscar imágenes que SÍ podrían ser CAPTCHA
        if (src.includes('captcha') || 
            src.includes('image') ||
            id.includes('captcha') ||
            id.includes('codigo') ||
            alt.includes('código') ||
            alt.includes('codigo') ||
            alt.includes('captcha') ||
            className.includes('captcha')) {
          return { found: true, src: src, selector: 'filtered' };
        }
      }
      
      // Estrategia 3: Buscar imagen cerca del texto "código" o "captcha"
      const codeTexts = document.evaluate(
        "//text()[contains(., 'código') or contains(., 'codigo') or contains(., 'captcha')]",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      
      if (codeTexts.singleNodeValue) {
        const parent = codeTexts.singleNodeValue.parentElement;
        const nearbyImg = parent.querySelector('img') || 
                         parent.parentElement?.querySelector('img');
        if (nearbyImg && nearbyImg.src && !nearbyImg.src.includes('ajax-loader')) {
          return { found: true, src: nearbyImg.src, selector: 'nearby' };
        }
      }
      
      return { found: false };
    });
    
    if (!captchaInfo.found) {
      throw new Error('No se encontró la imagen del CAPTCHA en la página');
    }
    
    console.log(`   🔍 Imagen CAPTCHA encontrada (selector: ${captchaInfo.selector})`);
    console.log(`   📄 URL: ${captchaInfo.src.substring(0, 100)}...`);
    
    let base64Data = '';
    
    // Obtener imagen como base64
    try {
      if (captchaInfo.src.startsWith('data:image')) {
        // Ya es base64
        base64Data = captchaInfo.src.replace(/^data:image\/\w+;base64,/, '');
        console.log(`   ✅ Imagen CAPTCHA obtenida (base64, longitud: ${base64Data.length} chars)`);
      } else {
        // Es URL, obtener screenshot del iframe completo (método más confiable)
        console.log(`   📥 Obteniendo screenshot del iframe del CAPTCHA...`);
        const screenshot = await iframeHandle.screenshot({ type: 'png' });
        base64Data = screenshot.toString('base64');
        console.log(`   ✅ Imagen CAPTCHA obtenida (screenshot del iframe, longitud: ${base64Data.length} chars)`);
        
        // Si el screenshot es muy pequeño, intentar obtener la imagen directamente desde el iframe
        if (base64Data.length < 1000) {
          console.log('   ⚠️ Screenshot muy pequeño, intentando obtener imagen directamente desde iframe...');
          const imgInIframe = await iframeContent.evaluate(() => {
            const img = document.querySelector('img');
            if (img && img.src) {
              return img.src;
            }
            return null;
          });
          
          if (imgInIframe && imgInIframe.startsWith('data:image')) {
            base64Data = imgInIframe.replace(/^data:image\/\w+;base64,/, '');
            console.log(`   ✅ Imagen CAPTCHA obtenida desde src del iframe (longitud: ${base64Data.length} chars)`);
          } else if (imgInIframe) {
            // Es URL, descargarla desde el contexto del iframe
            try {
              const response = await iframeContent.goto(imgInIframe);
              const buffer = await response.body();
              base64Data = buffer.toString('base64');
              console.log(`   ✅ Imagen CAPTCHA descargada desde iframe (longitud: ${base64Data.length} chars)`);
            } catch (e) {
              console.log(`   ⚠️ Error descargando desde iframe, usando screenshot: ${e.message}`);
            }
          }
        }
      }
    } catch (imgError) {
      throw new Error(`Error obteniendo imagen CAPTCHA: ${imgError.message}`);
    }
    
    if (!base64Data || base64Data.length < 100) {
      throw new Error('La imagen del CAPTCHA está vacía o es muy pequeña');
    }
    
    // Resolver con 2Captcha
    if (!this.captchaApiKey) {
      throw new Error('API Key de 2Captcha no configurada. Configure CAPTCHA_API_KEY en .env');
    }
    
    console.log('   🔄 Enviando a 2Captcha para resolver...');
    const captchaText = await this.resolveWith2Captcha(base64Data);
    console.log(`   ✅ CAPTCHA resuelto: ${captchaText}`);
    
    // Buscar input de CAPTCHA y llenarlo (TxtCodImagen según el HTML)
    const captchaInput = await page.evaluate((text) => {
      // Buscar el input específico del CAPTCHA
      const txtCodImagen = document.getElementById('TxtCodImagen');
      if (txtCodImagen) {
        txtCodImagen.value = text;
        txtCodImagen.dispatchEvent(new Event('input', { bubbles: true }));
        txtCodImagen.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      
      // Fallback: buscar por otros criterios
      const inputs = document.querySelectorAll('input[type="text"]');
      for (const input of inputs) {
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        const placeholder = (input.placeholder || '').toLowerCase();
        
        if (name.includes('captcha') || 
            id.includes('captcha') ||
            id.includes('codigo') ||
            id.includes('codimagen') ||
            placeholder.includes('código') ||
            placeholder.includes('codigo')) {
          input.value = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, captchaText);
    
    if (!captchaInput) {
      console.log('   ⚠️ No se encontró input de CAPTCHA, pero continuando...');
    } else {
      console.log('   ✅ CAPTCHA ingresado en el input');
    }
    
    await this.delay(1000);
    return captchaText;
  }
  
  // ==================== RESOLVER CON 2CAPTCHA ====================
  async resolveWith2Captcha(base64Image) {
    const axios = require('axios');
    
    if (!this.captchaApiKey) {
      throw new Error('API Key de 2Captcha no configurada');
    }
    
    // Limpiar base64 (remover prefijo si existe)
    const base64Clean = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');
    
    console.log('   📤 Subiendo imagen a 2Captcha...');
    
    // Usar URLSearchParams en lugar de FormData para mejor compatibilidad
    const params = new URLSearchParams();
    params.append('key', this.captchaApiKey);
    params.append('method', 'base64');
    params.append('body', base64Clean);
    params.append('json', '1');
    params.append('numeric', '4'); // Solo números (común en CAPTCHAs de SUTRAN)
    params.append('min_len', '4');
    params.append('max_len', '6');
    
    try {
      const uploadResponse = await axios.post('http://2captcha.com/in.php', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000
      });
      
      if (uploadResponse.data.status !== 1) {
        const errorMsg = uploadResponse.data.request || 'Error desconocido';
        
        // Mensajes de error más descriptivos
        if (errorMsg.includes('ERROR_WRONG_USER_KEY') || errorMsg.includes('ERROR_KEY_DOES_NOT_EXIST')) {
          throw new Error(`2CAPTCHA_API_KEY_INVALID: La API key de 2Captcha es inválida. Verifica tu CAPTCHA_API_KEY en el archivo .env`);
        }
        if (errorMsg.includes('ERROR_ZERO_BALANCE')) {
          throw new Error(`2CAPTCHA_BALANCE_ZERO: Tu cuenta de 2Captcha no tiene saldo. Agrega fondos en https://2captcha.com`);
        }
        if (errorMsg.includes('ERROR_NO_SLOT_AVAILABLE')) {
          throw new Error(`2CAPTCHA_NO_SLOT: No hay trabajadores disponibles. Intenta más tarde.`);
        }
        
        throw new Error(`2Captcha error: ${errorMsg}`);
      }
      
      const captchaId = uploadResponse.data.request;
      console.log(`   📝 CAPTCHA ID: ${captchaId}, esperando resolución...`);
      
      // Esperar resolución (máximo 2 minutos, revisar cada 5 segundos)
      const maxAttempts = 24; // 24 intentos * 5 segundos = 2 minutos
      for (let i = 0; i < maxAttempts; i++) {
        await this.delay(5000);
        
        const resultResponse = await axios.get('http://2captcha.com/res.php', {
          params: {
            key: this.captchaApiKey,
            action: 'get',
            id: captchaId,
            json: '1'
          },
          timeout: 10000
        });
        
        if (resultResponse.data.status === 1) {
          const solution = resultResponse.data.request;
          console.log(`   ✅ CAPTCHA resuelto: ${solution}`);
          return solution;
        }
        
        if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
          throw new Error(`2Captcha error: ${resultResponse.data.request}`);
        }
        
        if ((i + 1) % 4 === 0) { // Log cada 20 segundos
          console.log(`   ⏳ Esperando resolución... (${(i + 1) * 5}s)`);
        }
      }
      
      throw new Error('Timeout esperando resolución de CAPTCHA (2 minutos)');
      
    } catch (error) {
      if (error.response) {
        throw new Error(`Error de red con 2Captcha: ${error.message}`);
      }
      throw error;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Exportar la clase
module.exports = SUTRANScraper;

module.exports = SUTRANScraper;
