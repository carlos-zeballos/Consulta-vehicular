/**
 * SBS SCRAPER FINAL - Optimizado para velocidad
 * Similar a mtc-scraper-final.js pero para SBS
 * Extracción rápida y directa de datos
 */

const { chromium } = require('playwright');
const axios = require('axios');

class SBSSOATScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://servicios.sbs.gob.pe/reportesoat';
    this.stats = { attempts: 0, successes: 0, failures: 0 };
    this.captchaApiKey = captchaApiKey;
  }

  // ==================== MÉTODO PRINCIPAL ====================
  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [SBS-FINAL] Iniciando consulta para: ${placa}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarPlacaIntento(placa);
        
        // Si tiene pólizas, considerarlo exitoso incluso si success=false
        if (resultado.polizas && resultado.polizas.length > 0) {
          console.log(`✅ [SBS-FINAL] CONSULTA EXITOSA en intento ${attempt} con ${resultado.polizas.length} pólizas`);
          resultado.success = true;
          this.stats.successes++;
          return resultado;
        }
        
        if (resultado.success) {
          console.log(`✅ [SBS-FINAL] CONSULTA EXITOSA en intento ${attempt}`);
          this.stats.successes++;
          return resultado;
        }
        
        console.log(`⚠️ Intento ${attempt} no encontró pólizas, reintentando...`);
        await this.delay(3000); // Aumentado de 2000 a 3000
        
      } catch (error) {
        console.error(`❌ Error en intento ${attempt}:`, error.message);
        this.stats.failures++;
        
        if (attempt === maxAttempts) {
          throw error;
        }
        
        await this.delay(3000);
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
      
      // 1. NAVEGAR AL FORMULARIO (rápido como MTC)
      console.log('🌐 Navegando al sitio...');
      try {
        await page.goto(`${this.baseURL}/BusquedaPlaca`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
      } catch (navError) {
        console.log('   ⚠️ Error en navegación inicial, intentando con networkidle...');
        await page.goto(`${this.baseURL}/BusquedaPlaca`, {
          waitUntil: 'networkidle',
          timeout: 45000
        });
      }

      // 2. ESPERAR A QUE SE HABILITE EL FORMULARIO (similar a MTC)
      console.log('⏳ Esperando que el formulario se habilite...');
      await this.waitForFormEnabled(page);
      
      // 3. LLENAR FORMULARIO
      console.log('📝 Llenando formulario...');
      await this.fillForm(page, placa);
      
      // 4. RESOLVER reCAPTCHA v3 con 2Captcha
      console.log('🔐 Resolviendo reCAPTCHA v3...');
      
      // Site key de reCAPTCHA v3 de SBS (del HTML proporcionado)
      const SBS_RECAPTCHA_SITE_KEY = '6Ldq0D0hAAAAAJ2EfmS-gFvA1NprMh2MBcxtRLAL';
      
      if (this.captchaApiKey) {
        try {
          console.log('   🔄 Resolviendo reCAPTCHA v3 con 2Captcha...');
          const recaptchaToken = await this.resolveRecaptchaV3(SBS_RECAPTCHA_SITE_KEY, page.url());
          
          if (recaptchaToken) {
            console.log('   ✅ Token reCAPTCHA v3 obtenido');
            // Inyectar el token en el campo oculto
            await page.evaluate((token) => {
              const input = document.querySelector('#ctl00_MainBodyContent_hdnReCaptchaV3, input[name*="hdnReCaptchaV3"]');
              if (input) {
                input.value = token;
                console.log('   ✅ Token inyectado en campo oculto');
              } else {
                console.log('   ⚠️ Campo hdnReCaptchaV3 no encontrado');
              }
            }, recaptchaToken);
          } else {
            console.log('   ⚠️ No se pudo resolver reCAPTCHA v3 con 2Captcha, esperando ejecución automática...');
          }
        } catch (e) {
          console.log('   ⚠️ Error resolviendo reCAPTCHA v3:', e.message);
        }
      } else {
        console.log('   ⚠️ CAPTCHA_API_KEY no configurada, esperando ejecución automática de reCAPTCHA v3...');
      }
      
      // Esperar a que reCAPTCHA v3 se ejecute automáticamente si no se resolvió con 2Captcha
      try {
        await page.waitForFunction(() => {
          const recaptchaInput = document.querySelector('#ctl00_MainBodyContent_hdnReCaptchaV3, input[name*="hdnReCaptchaV3"]');
          if (recaptchaInput && recaptchaInput.value && recaptchaInput.value.length > 50) {
            return true;
          }
          return false;
        }, { timeout: 20000 });
        console.log('   ✅ reCAPTCHA v3 ejecutado automáticamente');
      } catch (e) {
        console.log('   ⚠️ Timeout esperando reCAPTCHA v3, continuando...');
      }
      
      await this.delay(5000); // Esperar adicional después de reCAPTCHA
      
      // 5. ENVIAR CONSULTA
      console.log('🚀 Enviando consulta...');
      await this.submitForm(page);
      
      // 6. ESPERAR A QUE SE CARGUEN TODOS LOS RESULTADOS (más tiempo para historial completo)
      console.log('⏳ Esperando a que se carguen todos los resultados del historial...');
      
      // Esperar navegación (puede redirigir a ReporteCentralRiesgo)
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 });
        console.log('   ✅ Navegación completada, URL actual:', page.url());
      } catch (e) {
        console.log('   ⚠️ Timeout esperando navegación, continuando...');
      }
      
      // Esperar a que aparezca algún resultado o mensaje de error
      try {
        await page.waitForFunction(() => {
          const tieneTabla = document.querySelector('#listSoatPlacaVeh, table[id*="Soat"], table[id*="list"], table');
          const tieneMensaje = document.querySelector('#ctl00_MainBodyContent_message_not_found, .message, .alert');
          const tienePlaca = document.querySelector('#ctl00_MainBodyContent_placa');
          const tieneTexto = document.body.innerText.includes('La Positiva') || 
                            document.body.innerText.includes('Interseguro') ||
                            document.body.innerText.includes('no se encontró');
          return tieneTabla || tieneMensaje || tienePlaca || tieneTexto;
        }, { timeout: 30000 });
        console.log('   ✅ Resultado o mensaje detectado');
      } catch (e) {
        console.log('   ⚠️ Timeout esperando resultado, continuando...');
      }
      
      // Esperar a que la página se estabilice completamente
      await this.delay(30000); // Aumentado a 30s para asegurar carga completa después de redirección
      
      // Verificar si estamos en la página de resultados o en la de búsqueda
      const urlActual = page.url();
      console.log(`   📍 URL actual después de envío: ${urlActual}`);
      
      if (urlActual.includes('ReporteCentralRiesgo')) {
        console.log('   ✅ Estamos en la página de resultados (ReporteCentralRiesgo)');
        // Esperar más tiempo porque los datos pueden cargarse dinámicamente
        await this.delay(20000); // Esperar 20s adicionales para carga dinámica
      }
      
      // Verificar si hay mensaje de "no encontrado" - puede ser que los datos se carguen después
      const mensajeNoEncontrado = await page.evaluate(() => {
        const mensajeEl = document.querySelector('#ctl00_MainBodyContent_message_not_found');
        if (mensajeEl) {
          const texto = mensajeEl.textContent.toLowerCase();
          return texto.includes('no tiene información') || texto.includes('no se encontró');
        }
        return false;
      });
      
      if (mensajeNoEncontrado) {
        console.log('   ⚠️ Mensaje "no encontrado" detectado, esperando más tiempo por si los datos se cargan dinámicamente...');
        await this.delay(20000); // Esperar 20s más por si hay carga dinámica
      }
      
      // Verificar si hay algún botón o enlace para ver más resultados
      const hayVerMas = await page.evaluate(() => {
        const textos = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], span'));
        for (const el of textos) {
          const texto = (el.textContent || el.value || '').toLowerCase();
          if (texto.includes('ver más') || texto.includes('ver todas') || texto.includes('historial completo') || 
              texto.includes('mostrar todas') || texto.includes('ver todo') || texto.includes('cargar más')) {
            return true;
          }
        }
        return false;
      });
      
      if (hayVerMas) {
        console.log('   🔍 Botón "Ver más" encontrado, intentando hacer clic...');
        try {
          await page.evaluate(() => {
            const elementos = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], span'));
            for (const el of elementos) {
              const texto = (el.textContent || el.value || '').toLowerCase();
              if (texto.includes('ver más') || texto.includes('ver todas') || texto.includes('historial completo') || 
                  texto.includes('mostrar todas') || texto.includes('ver todo') || texto.includes('cargar más')) {
                el.click();
                return true;
              }
            }
            return false;
          });
          await this.delay(5000); // Esperar a que cargue
        } catch (e) {
          console.log('   ⚠️ No se pudo hacer clic en "Ver más":', e.message);
        }
      }
      
      // 7. EXTRAER RESULTADOS (rápido y directo como MTC)
      console.log('📊 Extrayendo datos...');
      const resultados = await this.extractResults(page);
      
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

  // 1. ESPERAR QUE EL FORMULARIO SE HABILITE (similar a MTC)
  async waitForFormEnabled(page, timeout = 20000) {
    console.log('   ⏳ Verificando estado del formulario...');
    
    try {
      await page.waitForFunction(() => {
        const placaInput = document.querySelector('#ctl00_MainBodyContent_txtPlaca');
        const buscarBtn = document.querySelector('#ctl00_MainBodyContent_btnIngresarPla');
        
        const inputEnabled = placaInput && !placaInput.disabled;
        const btnVisible = buscarBtn && 
                          buscarBtn.style.display !== 'none' &&
                          buscarBtn.offsetParent !== null;
        
        return inputEnabled && btnVisible;
      }, { timeout });
      
      console.log('   ✅ Formulario habilitado');
      await this.delay(1000); // Delay corto para estabilizar
    } catch (error) {
      console.error('   ❌ Error esperando formulario:', error.message);
      // Continuar de todas formas
    }
  }

  // 2. LLENAR FORMULARIO
  async fillForm(page, placa) {
    const placaNormalizada = placa.trim().replace(/\s+/g, '').toUpperCase();
    
    // Llenar input de placa
    const inputSelectors = [
      '#ctl00_MainBodyContent_txtPlaca',
      'input[name="ctl00$MainBodyContent$txtPlaca"]',
      'input[id*="txtPlaca" i]'
    ];
    
    let inputFound = false;
    for (const selector of inputSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.fill(selector, placaNormalizada);
        inputFound = true;
        console.log(`   ✅ Placa ingresada: ${placaNormalizada}`);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!inputFound) {
      throw new Error("SELECTOR_MISSING: No se encontró el input de placa");
    }
    
    await this.delay(500);
    
    // IMPORTANTE: Seleccionar "Vehicular" para obtener historial completo de pólizas
    // Según la documentación del usuario, debe seleccionarse "Vehicular" para ver todas las pólizas
    try {
      // Buscar radio button "Vehicular"
      const radioVehicular = await page.$('input[value="Vehicular"][type="radio"]');
      if (radioVehicular) {
        await radioVehicular.click();
        await this.delay(1000);
        console.log('   ✅ Opción VEHICULAR seleccionada (historial completo)');
      } else {
        // Intentar con variaciones
        const radioVehicularAlt = await page.$('input[value*="Vehicular" i][type="radio"]');
        if (radioVehicularAlt) {
          await radioVehicularAlt.click();
          await this.delay(1000);
          console.log('   ✅ Opción VEHICULAR seleccionada (variación)');
        } else {
          console.log('   ⚠️ No se encontró opción Vehicular, continuando...');
        }
      }
    } catch (e) {
      console.log('   ⚠️ Error seleccionando Vehicular:', e.message);
    }
  }

  // 3. ENVIAR FORMULARIO
  async submitForm(page) {
    const buttonSelectors = [
      '#ctl00_MainBodyContent_btnIngresarPla',
      'input[name="ctl00$MainBodyContent$btnIngresarPla"]',
      'input[type="submit"][value*="Consultar" i]'
    ];
    
    let buttonFound = false;
    for (const selector of buttonSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        buttonFound = true;
        console.log(`   ✅ Botón clickeado`);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!buttonFound) {
      throw new Error("SELECTOR_MISSING: No se encontró el botón de consultar");
    }
  }

  // 4. EXTRAER RESULTADOS (rápido y directo como MTC)
  async extractResults(page, placa) {
    console.log('   🔍 Buscando resultados...');
    
    // Verificar URL actual
    const urlActual = page.url();
    console.log(`   📍 URL actual: ${urlActual}`);
    
    // Si estamos en ReporteCentralRiesgo, esperar más tiempo para que se cargue el contenido dinámico
    if (urlActual.includes('ReporteCentralRiesgo')) {
      console.log('   ⚠️ Página ReporteCentralRiesgo detectada, esperando carga dinámica...');
      await this.delay(30000); // Esperar 30s para carga dinámica
      
      // Intentar hacer scroll para activar carga lazy
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await this.delay(2000);
      }
      await this.delay(10000); // Esperar adicional después del scroll
    }
    
    // Esperar resultados con estrategia mejorada
    try {
      // Esperar selectores específicos (más rápido que networkidle)
      // Intentar múltiples selectores posibles
      const selectoresPosibles = [
        '#ctl00_MainBodyContent_placa',
        '#listSoatPlacaVeh',
        'table[id*="listSoat"]',
        'table[id*="Soat"]',
        'table',
        '#ctl00_MainBodyContent_cantidad'
      ];
      
      let selectorEncontrado = false;
      for (const selector of selectoresPosibles) {
        try {
          await page.waitForSelector(selector, { timeout: 10000, state: 'visible' });
          console.log(`   ✅ Selector encontrado: ${selector}`);
          selectorEncontrado = true;
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!selectorEncontrado) {
        console.log('   ⚠️ No se encontró ningún selector esperado, continuando de todas formas...');
      }
      
      // Esperar a que la tabla tenga contenido (puede tardar más con AJAX)
      console.log('   ⏳ Esperando a que la tabla se cargue completamente...');
      await this.delay(10000); // Esperar más tiempo para carga AJAX
      
      // Verificar cuántas filas hay en la tabla - buscar en múltiples lugares
      const filasIniciales = await page.evaluate(() => {
        // Buscar tabla principal
        let tabla = document.querySelector('#listSoatPlacaVeh tbody') || document.querySelector('#listSoatPlacaVeh');
        if (!tabla) {
          // Buscar cualquier tabla que contenga "Soat" o "list"
          const todasLasTablas = document.querySelectorAll('table');
          for (const t of todasLasTablas) {
            const id = t.id || '';
            const className = t.className || '';
            if (id.includes('Soat') || id.includes('list') || className.includes('Soat') || className.includes('list')) {
              tabla = t;
              break;
            }
          }
        }
        
        if (tabla) {
          // Contar todos los tbody y tr
          const todosLosTbody = tabla.querySelectorAll('tbody');
          let totalFilas = 0;
          todosLosTbody.forEach(tbody => {
            totalFilas += tbody.querySelectorAll('tr').length;
          });
          // Si no hay tbody, contar tr directamente
          if (totalFilas === 0) {
            totalFilas = tabla.querySelectorAll('tr').length;
          }
          return totalFilas;
        }
        return 0;
      });
      console.log(`   📊 Filas encontradas inicialmente: ${filasIniciales}`);
      
      // Esperar más tiempo si solo hay 1 fila (puede estar cargando más)
      if (filasIniciales <= 1) {
        console.log('   ⏳ Solo 1 fila detectada, esperando más tiempo para carga completa...');
        await this.delay(30000); // Aumentado a 30s para asegurar carga completa
        
        // Verificar nuevamente
        const filasDespues = await page.evaluate(() => {
          const tabla = document.querySelector('#listSoatPlacaVeh tbody') || document.querySelector('#listSoatPlacaVeh');
          return tabla ? tabla.querySelectorAll('tr').length : 0;
        });
        console.log(`   📊 Filas después de espera adicional: ${filasDespues}`);
      }
    } catch (e) {
      // Si no aparecen, esperar un poco más
      console.log('   ⏳ Esperando resultados adicionales...');
      await this.delay(5000);
    }
    
    // IMPORTANTE: Hacer scroll para cargar todas las filas si hay carga dinámica
    console.log('   📜 Haciendo scroll para cargar todo el historial...');
    try {
      // Verificar cuántas filas hay antes del scroll
      const filasAntes = await page.evaluate(() => {
        const tabla = document.querySelector('#listSoatPlacaVeh tbody') || document.querySelector('#listSoatPlacaVeh');
        return tabla ? tabla.querySelectorAll('tr').length : 0;
      });
      console.log(`   📊 Filas visibles antes del scroll: ${filasAntes}`);
      
      // Hacer scroll hasta el final de la tabla varias veces para asegurar que se carguen todas las filas
      for (let i = 0; i < 15; i++) { // Aumentado de 10 a 15 iteraciones para asegurar carga completa
        await page.evaluate(() => {
          const tabla = document.querySelector('#listSoatPlacaVeh');
          if (tabla) {
            tabla.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        });
        await this.delay(1200); // Aumentado de 800ms a 1200ms
        
        // También hacer scroll de la página completa
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await this.delay(1200); // Aumentado de 800ms a 1200ms
        
        // Verificar si hay más filas después del scroll
        const filasDespues = await page.evaluate(() => {
          const tabla = document.querySelector('#listSoatPlacaVeh tbody') || document.querySelector('#listSoatPlacaVeh');
          return tabla ? tabla.querySelectorAll('tr').length : 0;
        });
        
        if (filasDespues > filasAntes) {
          console.log(`   📈 Filas aumentaron a: ${filasDespues} (iteración ${i + 1})`);
        }
      }
      
      // Esperar un poco más para que se carguen todas las filas dinámicas
      await this.delay(5000); // Aumentado de 3000 a 5000 para asegurar carga completa
      
      // Verificar filas finales
      const filasFinales = await page.evaluate(() => {
        const tabla = document.querySelector('#listSoatPlacaVeh tbody') || document.querySelector('#listSoatPlacaVeh');
        return tabla ? tabla.querySelectorAll('tr').length : 0;
      });
      console.log(`   📊 Filas visibles después del scroll: ${filasFinales}`);
    } catch (e) {
      console.log('   ⚠️ Error haciendo scroll (continuando de todas formas):', e.message);
    }
    
    // Guardar screenshot y HTML para debugging
    try {
      await page.screenshot({ path: 'sbs-debug-screenshot.png', fullPage: true });
      console.log('   📸 Screenshot guardado: sbs-debug-screenshot.png');
      
      const htmlCompleto = await page.content();
      const fs = require('fs');
      fs.writeFileSync('sbs-debug-html.html', htmlCompleto);
      console.log('   📄 HTML guardado: sbs-debug-html.html');
      
      // Buscar información sobre paginación en el HTML
      const infoPaginacion = await page.evaluate(() => {
        const paginacionInfo = {
          totalFilas: 0,
          mensajes: [],
          enlacesPaginacion: [],
          gridViewInfo: null
        };
        
        // Buscar GridView de ASP.NET
        const gridView = document.querySelector('table[id*="listSoatPlacaVeh"]');
        if (gridView) {
          const filas = gridView.querySelectorAll('tr');
          paginacionInfo.totalFilas = filas.length;
          
          // Buscar información de paginación alrededor del GridView
          const parent = gridView.parentElement;
          if (parent) {
            const texto = parent.textContent;
            const match = texto.match(/(\d+)\s*(página|paginas|registro|registros|póliza|polizas)/gi);
            if (match) {
              paginacionInfo.mensajes = match;
            }
          }
        }
        
        // Buscar enlaces de paginación
        const enlaces = Array.from(document.querySelectorAll('a'));
        enlaces.forEach(link => {
          const href = link.getAttribute('href') || '';
          const texto = link.textContent || '';
          if (href.includes('Page') || href.includes('__doPostBack') || /^\d+$/.test(texto.trim())) {
            paginacionInfo.enlacesPaginacion.push({
              texto: texto.trim(),
              href: href.substring(0, 150),
              visible: link.offsetParent !== null
            });
          }
        });
        
        return paginacionInfo;
      });
      
      console.log('   📊 Información de paginación:', JSON.stringify(infoPaginacion, null, 2));
    } catch (e) {
      console.log('   ⚠️ Error guardando debug info:', e.message);
    }
    
    // Verificar si hay paginación y navegar por todas las páginas
    console.log('   🔄 Verificando paginación...');
    let todasLasPolizas = [];
    let paginaActual = 1;
    let hayMasPaginas = true;
    let resultado = null; // Declarar resultado fuera del loop
    
    while (hayMasPaginas && paginaActual <= 20) { // Límite de seguridad: máximo 20 páginas
      console.log(`   📄 Extrayendo página ${paginaActual}...`);
      
      // Extraer datos de la página actual
      const resultadoPagina = await page.evaluate((placaParam) => {
      const data = {};
      const placa = placaParam; // Usar el parámetro en lugar de variable global
      
      // Placa
      const placaEl = document.querySelector('#ctl00_MainBodyContent_placa');
      data.placa = placaEl ? placaEl.textContent.trim() : '';
      
      // Fecha consulta
      const fechaConsultaEl = document.querySelector('#ctl00_MainBodyContent_fecha_consulta');
      data.fecha_consulta = fechaConsultaEl ? fechaConsultaEl.textContent.trim() : '';
      
      // Fecha actualización
      const fechaActEl = document.querySelector('#ctl00_MainBodyContent_fecha_act');
      data.fecha_actualizacion = fechaActEl ? fechaActEl.textContent.trim() : '';
      
      // Cantidad de accidentes - buscar en múltiples lugares según el HTML
      let cantidadEl = document.querySelector('#ctl00_MainBodyContent_cantidad');
      if (!cantidadEl) {
        cantidadEl = document.querySelector('#ctl00_MainBodyContent_cantidadVeh'); // Para Vehicular
      }
      if (!cantidadEl) {
        // Buscar en el texto que dice "cuenta con el siguiente número de accidentes"
        const textoCompleto = document.body.innerText || '';
        const match = textoCompleto.match(/número de accidentes[^:]*:\s*(\d+)/i);
        if (match) {
          data.accidentes_ultimos_5_anios = parseInt(match[1] || '0', 10);
        } else {
          data.accidentes_ultimos_5_anios = 0;
        }
      } else {
        data.accidentes_ultimos_5_anios = parseInt(cantidadEl.textContent.trim() || '0', 10);
      }
      
      // Tabla de pólizas - extracción completa con logs
      data.polizas = [];
      
      // Buscar tabla - IMPORTANTE: La tabla tiene múltiples <tbody>, cada uno con una fila
      // MEJORADO: Buscar en múltiples lugares, incluyendo ReporteCentralRiesgo
      let tabla = document.querySelector('#listSoatPlacaVeh');
      if (!tabla) {
        // Buscar por ID alternativos
        tabla = document.querySelector('#ctl00_MainBodyContent_listSoatPlacaVeh') ||
                document.querySelector('table[id*="listSoat"]') ||
                document.querySelector('table[id*="Soat"]') ||
                document.querySelector('table[id*="Grid"]') ||
                document.querySelector('table[id*="grid"]');
      }
      
      if (!tabla) {
        // Buscar cualquier tabla que contenga datos de pólizas
        const todasLasTablas = document.querySelectorAll('table');
        for (const t of todasLasTablas) {
          const filas = t.querySelectorAll('tr');
          if (filas.length > 1) { // Más de 1 fila (header + datos)
            const primeraFila = filas[0];
            const celdas = primeraFila.querySelectorAll('td, th');
            // Reducir el mínimo a 6 celdas para ser más flexible
            if (celdas.length >= 6) {
              // Verificar si contiene texto relacionado con pólizas
              const textoFila = primeraFila.textContent.toLowerCase();
              if (textoFila.includes('aseguradora') || 
                  textoFila.includes('póliza') || 
                  textoFila.includes('poliza') ||
                  textoFila.includes('vigencia') ||
                  textoFila.includes('accidente')) {
                tabla = t;
                break;
              }
            }
          }
        }
      }
      
      // Si aún no hay tabla, buscar en divs o cualquier contenedor con datos estructurados
      if (!tabla) {
        console.log('   ⚠️ No se encontró tabla, buscando en divs y otros elementos...');
        const contenedores = document.querySelectorAll('div[class*="table"], div[class*="grid"], div[id*="list"], div[id*="grid"]');
        for (const contenedor of contenedores) {
          const texto = contenedor.textContent;
          if (texto.includes('La Positiva') || texto.includes('Interseguro') || /\d{8,}/.test(texto)) {
            console.log('   ✅ Contenedor con datos encontrado');
            // Intentar extraer datos del texto directamente
            break;
          }
        }
      }
      
      if (tabla) {
        console.log(`   🔍 Tabla encontrada: ID=${tabla.id || 'sin ID'}, Clases=${tabla.className || 'sin clases'}`);
        
        // IMPORTANTE: Buscar TODOS los tbody dentro de la tabla (cada tbody tiene una fila de datos)
        // Según el HTML proporcionado, la estructura es: <table id="listSoatPlacaVeh"> con múltiples <tbody>
        const todosLosTbody = tabla.querySelectorAll('tbody');
        console.log(`   📊 Total de elementos <tbody> encontrados: ${todosLosTbody.length}`);
        
        if (todosLosTbody.length === 0) {
          console.log('   ⚠️ No se encontraron <tbody>, buscando filas directamente en la tabla...');
          // Fallback: buscar todas las filas tr que no sean header
          const todasLasFilas = tabla.querySelectorAll('tr');
          console.log(`   📋 Filas encontradas directamente: ${todasLasFilas.length}`);
          
          todasLasFilas.forEach((row, rowIndex) => {
            // Saltar filas de header (th)
            const tieneTh = row.querySelector('th');
            if (tieneTh) {
              console.log(`   ⏭️ Fila ${rowIndex + 1} es header, saltando...`);
              return;
            }
            
            const celdas = row.querySelectorAll('td');
            if (celdas.length >= 8) {
              const aseguradora = celdas[0]?.textContent.trim() || '';
              const claseVehiculo = celdas[1]?.textContent.trim() || '';
              const usoVehiculo = celdas[2]?.textContent.trim() || '';
              const nAccidentes = celdas[3]?.textContent.trim() || '0';
              const nPoliza = celdas[4]?.textContent.trim() || '';
              const nCertificado = celdas[5]?.textContent.trim() || '';
              const inicioVigencia = celdas[6]?.textContent.trim() || '';
              const finVigencia = celdas[7]?.textContent.trim() || '';
              const comentario = celdas.length > 9 ? (celdas[9]?.textContent.trim() || '') : (celdas.length > 8 ? (celdas[8]?.textContent.trim() || '') : '');
              
              if (aseguradora || nPoliza) {
                const poliza = {
                  aseguradora: aseguradora,
                  clase_vehiculo: claseVehiculo,
                  uso_vehiculo: usoVehiculo,
                  n_accidentes: parseInt(nAccidentes || '0', 10),
                  n_poliza: nPoliza,
                  n_certificado: nCertificado,
                  inicio_vigencia: inicioVigencia,
                  fin_vigencia: finVigencia,
                  comentario: comentario
                };
                data.polizas.push(poliza);
                console.log(`      ✅ Póliza ${data.polizas.length}: ${aseguradora} | ${claseVehiculo} | ${usoVehiculo} | ${nAccidentes} accidentes | Póliza: ${nPoliza} | ${inicioVigencia} - ${finVigencia}${comentario ? ' | Comentario: ' + comentario : ''}`);
              }
            }
          });
        } else {
          // Procesar cada tbody por separado
          todosLosTbody.forEach((tbody, tbodyIndex) => {
            const filas = tbody.querySelectorAll('tr');
            console.log(`   📋 Tbody ${tbodyIndex + 1}: ${filas.length} fila(s)`);
            
            filas.forEach((row, rowIndex) => {
              const celdas = row.querySelectorAll('td'); // Solo TD, no TH
              
              // Según el HTML: 0=aseguradora, 1=clase, 2=uso, 3=accidentes, 4=póliza, 5=certificado, 6=inicio, 7=fin, 8=vacía, 9=comentario
              // Pero puede haber variaciones, así que verificamos que tenga al menos 8 celdas
              if (celdas.length >= 8) {
                const aseguradora = celdas[0]?.textContent.trim() || '';
                const claseVehiculo = celdas[1]?.textContent.trim() || '';
                const usoVehiculo = celdas[2]?.textContent.trim() || '';
                const nAccidentes = celdas[3]?.textContent.trim() || '0';
                const nPoliza = celdas[4]?.textContent.trim() || '';
                const nCertificado = celdas[5]?.textContent.trim() || '';
                const inicioVigencia = celdas[6]?.textContent.trim() || '';
                const finVigencia = celdas[7]?.textContent.trim() || '';
                // Comentario puede estar en celdas[9] o celdas[8] dependiendo de si hay columna vacía
                const comentario = celdas.length > 9 ? (celdas[9]?.textContent.trim() || '') : (celdas.length > 8 ? (celdas[8]?.textContent.trim() || '') : '');
                
                // Solo agregar si tiene datos válidos (aseguradora o póliza)
                if (aseguradora || nPoliza) {
                  const poliza = {
                    aseguradora: aseguradora,
                    clase_vehiculo: claseVehiculo,
                    uso_vehiculo: usoVehiculo,
                    n_accidentes: parseInt(nAccidentes || '0', 10),
                    n_poliza: nPoliza,
                    n_certificado: nCertificado,
                    inicio_vigencia: inicioVigencia,
                    fin_vigencia: finVigencia,
                    comentario: comentario
                  };
                  data.polizas.push(poliza);
                  console.log(`      ✅ Póliza ${data.polizas.length}: ${aseguradora} | ${claseVehiculo} | ${usoVehiculo} | ${nAccidentes} accidentes | Póliza: ${nPoliza} | ${inicioVigencia} - ${finVigencia}${comentario ? ' | Comentario: ' + comentario : ''}`);
                } else {
                  console.log(`      ⚠️ Fila ${rowIndex + 1} del tbody ${tbodyIndex + 1} omitida (sin datos válidos)`);
                }
              } else if (celdas.length > 0) {
                console.log(`      ⚠️ Fila ${rowIndex + 1} del tbody ${tbodyIndex + 1} tiene ${celdas.length} celdas (se esperaban 8+)`);
                // Debug: mostrar contenido de las celdas
                const contenidoCeldas = Array.from(celdas).map(c => c.textContent.trim()).join(' | ');
                console.log(`         Contenido: ${contenidoCeldas}`);
              }
            });
          });
        }
        
        console.log(`   📊 Total de pólizas extraídas de todos los tbody: ${data.polizas.length}`);
        
        // Verificar si hay mensaje sobre cantidad total de pólizas en toda la página
        const textoCompleto = document.body.innerText;
        const mensajesPólizas = textoCompleto.match(/(\d+)\s*(póliza|poliza|registro|registros|seguro|seguros)/gi);
        if (mensajesPólizas) {
          console.log(`   📊 Mensajes sobre pólizas encontrados: ${mensajesPólizas.join(', ')}`);
        }
        
        // Verificar si hay algún div o elemento que indique cantidad total
        const elementosConNumeros = Array.from(document.querySelectorAll('*')).filter(el => {
          const texto = el.textContent || '';
          return /(\d+)\s*(póliza|poliza|registro|registros)/i.test(texto) && el.children.length === 0;
        });
        if (elementosConNumeros.length > 0) {
          console.log(`   📊 Elementos con información de cantidad:`);
          elementosConNumeros.slice(0, 5).forEach((el, idx) => {
            console.log(`      ${idx + 1}. ${el.textContent.trim().substring(0, 100)}`);
          });
        }
        
        
        console.log(`   📊 Total de pólizas extraídas de esta página: ${data.polizas.length}`);
      } else {
        console.log('   ⚠️ No se encontró la tabla de pólizas (#listSoatPlacaVeh)');
        
        // Verificar si hay mensaje de "sin registros" o "no se encontró"
        const textoCompleto = document.body.innerText || '';
        const tieneMensajeSinRegistros = /no (se )?encontr[oó]/i.test(textoCompleto) || 
                                        /sin (registro|informaci[oó]n)/i.test(textoCompleto) ||
                                        /no tiene (informaci[oó]n|registro)/i.test(textoCompleto);
        
        if (tieneMensajeSinRegistros) {
          console.log('   ℹ️ Mensaje de "sin registros" detectado en la página');
          // Buscar el mensaje específico
          const mensajesSinRegistros = Array.from(document.querySelectorAll('*')).filter(el => {
            const texto = el.textContent || '';
            return /no (se )?encontr[oó]|sin (registro|informaci[oó]n)|no tiene (informaci[oó]n|registro)/i.test(texto) && 
                   el.children.length === 0 && texto.length < 200;
          });
          if (mensajesSinRegistros.length > 0) {
            console.log(`   📋 Mensaje encontrado: ${mensajesSinRegistros[0].textContent.trim().substring(0, 100)}`);
          }
        }
        
        // Intentar buscar cualquier tabla en la página
        const todasLasTablas = document.querySelectorAll('table');
        console.log(`   🔍 Tablas encontradas en la página: ${todasLasTablas.length}`);
        todasLasTablas.forEach((t, idx) => {
          const filas = t.querySelectorAll('tr');
          console.log(`   📋 Tabla ${idx + 1}: ${filas.length} filas, id="${t.id}", class="${t.className}"`);
        });
      }
      
        return data;
      }, placa); // Pasar placa como parámetro
      
      // Agregar pólizas de esta página al total
      if (resultadoPagina.polizas && resultadoPagina.polizas.length > 0) {
        todasLasPolizas = todasLasPolizas.concat(resultadoPagina.polizas);
        console.log(`   ✅ ${resultadoPagina.polizas.length} póliza(s) extraída(s) de la página ${paginaActual} (Total: ${todasLasPolizas.length})`);
        // Log detallado de las pólizas extraídas
        resultadoPagina.polizas.forEach((p, idx) => {
          console.log(`      📄 Póliza ${idx + 1}: ${p.aseguradora} | ${p.inicio_vigencia} - ${p.fin_vigencia} | N°: ${p.n_poliza} | Accidentes: ${p.n_accidentes}`);
        });
      } else {
        console.log(`   ⚠️ Página ${paginaActual}: No se encontraron pólizas`);
      }
      
      // Guardar datos principales de la primera página
      if (paginaActual === 1) {
        resultado = resultadoPagina;
      }
      
      // Buscar botón de "Siguiente" o paginación - MEJORADO
      const haySiguiente = await page.evaluate(() => {
        // Buscar todos los enlaces y inputs para debugging
        const allLinks = Array.from(document.querySelectorAll('a'));
        const allInputs = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"]'));
        
        console.log('   🔍 Buscando paginación...');
        console.log(`   📋 Enlaces encontrados: ${allLinks.length}`);
        console.log(`   📋 Inputs encontrados: ${allInputs.length}`);
        
        // Buscar enlaces de paginación ASP.NET GridView
        for (const link of allLinks) {
          const href = link.getAttribute('href') || '';
          const texto = link.textContent?.toLowerCase() || '';
          const id = link.id || '';
          
          // Log para debugging
          if (href.includes('Page') || href.includes('__doPostBack') || texto.includes('>') || texto.includes('siguiente') || texto.includes('next')) {
            console.log(`   🔗 Enlace encontrado: id="${id}", texto="${texto}", href="${href.substring(0, 100)}"`);
          }
          
          // Buscar enlaces de paginación ASP.NET GridView
          if (href.includes('Page$Next') || 
              (href.includes('__doPostBack') && (href.includes('Next') || href.includes('Page'))) ||
              (texto.includes('>') || texto.includes('siguiente') || texto.includes('next'))) {
            if (!link.disabled && !link.classList.contains('disabled') && link.offsetParent !== null) {
              console.log(`   ✅ Botón "Siguiente" encontrado: ${texto || id}`);
              return true;
            }
          }
        }
        
        // Buscar inputs de paginación
        for (const input of allInputs) {
          const value = input.getAttribute('value') || '';
          const id = input.id || '';
          
          if (value.includes('>') || value.includes('Siguiente') || value.includes('Next') || id.includes('Next')) {
            console.log(`   🔘 Input encontrado: id="${id}", value="${value}"`);
            if (!input.disabled) {
              console.log(`   ✅ Input "Siguiente" encontrado: ${value || id}`);
              return true;
            }
          }
        }
        
        // Buscar en la tabla de paginación (GridView de ASP.NET)
        const paginationTable = document.querySelector('table[id*="listSoatPlacaVeh"]')?.parentElement;
        if (paginationTable) {
          const paginationLinks = paginationTable.querySelectorAll('a, input[type="submit"]');
          for (const el of paginationLinks) {
            const texto = el.textContent?.toLowerCase() || el.value?.toLowerCase() || '';
            const href = el.getAttribute('href') || '';
            if (texto.includes('>') || texto.includes('siguiente') || href.includes('Next')) {
              if (!el.disabled && el.offsetParent !== null) {
                console.log(`   ✅ Paginación encontrada en tabla: ${texto || href}`);
                return true;
              }
            }
          }
        }
        
        console.log('   ⚠️ No se encontró botón de paginación');
        return false;
      });
      
      if (!haySiguiente) {
        console.log('   ✅ No hay más páginas, historial completo extraído');
        hayMasPaginas = false;
        break;
      }
      
      // Intentar hacer clic en "Siguiente"
      try {
        const clickExitoso = await page.evaluate(() => {
          // Buscar enlaces de paginación
          const links = Array.from(document.querySelectorAll('a'));
          for (const link of links) {
            const href = link.getAttribute('href') || '';
            if (href.includes('Page$Next') || (href.includes('__doPostBack') && href.includes('Next'))) {
              if (!link.disabled && !link.classList.contains('disabled')) {
                link.click();
                return true;
              }
            }
          }
          return false;
        });
        
        if (clickExitoso) {
          console.log(`   ⏭️ Navegando a página ${paginaActual + 1}...`);
          await this.delay(3000); // Esperar a que cargue la nueva página
          paginaActual++;
        } else {
          hayMasPaginas = false;
        }
      } catch (e) {
        console.log('   ⚠️ No se pudo navegar a la siguiente página:', e.message);
        hayMasPaginas = false;
      }
    }
    
    // Usar todas las pólizas extraídas
    resultado.polizas = todasLasPolizas;
    
    // Normalizar fechas
    resultado.fecha_consulta = this.normalizeDateTime(resultado.fecha_consulta) || new Date().toISOString();
    resultado.polizas = resultado.polizas.map(p => ({
      ...p,
      inicio_vigencia: this.normalizeDate(p.inicio_vigencia),
      fin_vigencia: this.normalizeDate(p.fin_vigencia)
    }));
    
      // IMPORTANTE: Primero verificar si hay pólizas. Solo si NO hay pólizas, verificar mensajes
      if (resultado.polizas && resultado.polizas.length > 0) {
        console.log(`   ✅ Se encontraron ${resultado.polizas.length} póliza(s) - OBLIGATORIO mostrar`);
        // Si hay pólizas, retornar directamente sin verificar mensajes
        return {
          success: true,
          placa: placa,
          polizas: resultado.polizas,
          accidentes_ultimos_5_anios: resultado.accidentes_ultimos_5_anios || 0,
          fecha_consulta: resultado.fecha_consulta || '',
          fecha_actualizacion: resultado.fecha_actualizacion || ''
        };
      }
      
      // Solo si NO hay pólizas, verificar si hay mensaje de "no encontrado"
      console.log(`   ⚠️ No se encontraron pólizas en la tabla, verificando mensajes de "no encontrado"...`);
      const noDataMessage = await page.evaluate(() => {
        // Buscar el elemento específico de mensaje de "no encontrado"
        const messageEl = document.querySelector('#ctl00_MainBodyContent_message_not_found');
        if (messageEl) {
          const texto = messageEl.textContent || '';
          console.log(`   📋 Mensaje encontrado en message_not_found: ${texto.trim().substring(0, 200)}`);
          if (texto.includes('no tiene información') || 
              texto.includes('no se encontr') ||
              texto.includes('sin registros') ||
              texto.includes('no tiene información reportada')) {
            return true;
          }
        }
        
        // Buscar también en otros elementos comunes
        const otrosMensajes = document.querySelectorAll('.error-sbs, .alert, .message, [class*="error"], [class*="message"]');
        for (const el of otrosMensajes) {
          const texto = el.textContent || '';
          if (texto.includes('no tiene información') || 
              texto.includes('no se encontr') ||
              texto.includes('sin registros')) {
            console.log(`   📋 Mensaje encontrado en otro elemento: ${texto.trim().substring(0, 200)}`);
            return true;
          }
        }
        
        // Buscar en el texto completo del body
        const text = document.body.innerText.toLowerCase();
        if (text.includes('no tiene información reportada') || 
            text.includes('no se encontr') ||
            text.includes('sin registros') ||
            text.includes('no hay datos')) {
          console.log(`   📋 Mensaje encontrado en texto del body`);
          return true;
        }
        
        return false;
      });
      
      if (noDataMessage) {
        console.log('   ℹ️ Mensaje de "no encontrado" detectado en la página');
        // Retornar resultado vacío pero exitoso
        return {
          success: true,
          placa: placa,
          polizas: [],
          accidentes_ultimos_5_anios: 0,
          fecha_consulta: '',
          fecha_actualizacion: '',
          message: 'Sin registros'
        };
      }
      
      // Verificar si hay datos
      if (!resultado.polizas || resultado.polizas.length === 0) {
        // MEJORADO: Buscar pólizas en cualquier parte del HTML usando texto
        console.log('   ⚠️ No se encontraron pólizas en la tabla, buscando en todo el HTML...');
        
        const polizasEnHTML = await page.evaluate((placaParam) => {
          const polizas = [];
          const textoCompleto = document.body.innerText;
          
          // Buscar patrones de pólizas (números de póliza, fechas, etc.)
          // Si encontramos "La Positiva" u otros nombres de aseguradoras, hay datos
          const aseguradoras = ['La Positiva', 'Interseguro', 'Rimac', 'Pacifico', 'Mapfre', 'Seguro'];
          const tieneAseguradora = aseguradoras.some(a => textoCompleto.includes(a));
          
          if (tieneAseguradora) {
            console.log('   ✅ Se encontraron nombres de aseguradoras en el HTML');
            // Intentar extraer de cualquier estructura de tabla
            const todasLasTablas = document.querySelectorAll('table');
            todasLasTablas.forEach(tabla => {
              const filas = tabla.querySelectorAll('tr');
              filas.forEach(fila => {
                const celdas = fila.querySelectorAll('td');
                if (celdas.length >= 6) {
                  const textoFila = fila.textContent;
                  // Si la fila contiene números que parecen pólizas y fechas
                  if (/\d{8,}/.test(textoFila) && /\d{2}\/\d{2}\/\d{4}/.test(textoFila)) {
                    const aseguradora = celdas[0]?.textContent.trim() || '';
                    const nPoliza = celdas[4]?.textContent.trim() || celdas[3]?.textContent.trim() || '';
                    if (aseguradora && nPoliza) {
                      polizas.push({
                        aseguradora: aseguradora,
                        clase_vehiculo: celdas[1]?.textContent.trim() || '',
                        uso_vehiculo: celdas[2]?.textContent.trim() || '',
                        n_accidentes: parseInt(celdas[3]?.textContent.trim() || '0', 10),
                        n_poliza: nPoliza,
                        n_certificado: celdas[5]?.textContent.trim() || '',
                        inicio_vigencia: celdas[6]?.textContent.trim() || '',
                        fin_vigencia: celdas[7]?.textContent.trim() || '',
                        comentario: celdas[8]?.textContent.trim() || ''
                      });
                    }
                  }
                }
              });
            });
          }
          
          return polizas;
        }, placa);
        
        if (polizasEnHTML && polizasEnHTML.length > 0) {
          console.log(`   ✅ Se encontraron ${polizasEnHTML.length} pólizas en el HTML (método alternativo)`);
          resultado.polizas = polizasEnHTML;
        } else if (noDataMessage) {
          console.log('   ℹ️ No se encontraron registros para esta placa (confirmado por mensaje)');
          return {
            placa: resultado.placa || placa,
            fecha_consulta: resultado.fecha_consulta,
            fecha_actualizacion: resultado.fecha_actualizacion || '',
            accidentes_ultimos_5_anios: 0,
            polizas: []
          };
        }
      }
    
    console.log(`   ✅ TOTAL: ${resultado.polizas?.length || 0} póliza(s) extraída(s) del historial completo`);
    console.log(`   📊 RESUMEN COMPLETO DE PÓLIZAS:`);
    if (resultado.polizas && resultado.polizas.length > 0) {
      resultado.polizas.forEach((p, idx) => {
        console.log(`      ${idx + 1}. ${p.aseguradora} | ${p.clase_vehiculo} | ${p.uso_vehiculo} | ${p.n_accidentes} accidentes | Póliza: ${p.n_poliza} | Cert: ${p.n_certificado} | ${p.inicio_vigencia} - ${p.fin_vigencia}${p.comentario ? ' | Comentario: ' + p.comentario : ''}`);
      });
    } else {
      console.log(`      ⚠️ No se encontraron pólizas en el historial`);
    }
    return resultado;
  }

  // ==================== UTILIDADES ====================
  
  normalizeDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return dateStr;
    const trimmed = dateStr.trim();
    if (!trimmed || trimmed === '-') return null;
    
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      const [, day, month, year] = match;
      return `${year}-${month}-${day}`;
    }
    
    return trimmed;
  }

  normalizeDateTime(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return dateStr;
    const trimmed = dateStr.trim();
    if (!trimmed || trimmed === '-') return null;
    
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const [, day, month, year, hour, minute, second] = match;
      return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    }
    
    return this.normalizeDate(trimmed);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== RESOLVER reCAPTCHA v3 CON 2CAPTCHA ====================
  async resolveRecaptchaV3(siteKey, pageUrl) {
    if (!this.captchaApiKey) {
      console.log('   ⚠️ CAPTCHA_API_KEY no configurada, no se puede resolver reCAPTCHA v3');
      return null;
    }

    try {
      console.log(`   📋 Site Key: ${siteKey.substring(0, 20)}...`);
      console.log(`   📋 Page URL: ${pageUrl}`);

      // Resolver con 2Captcha (reCAPTCHA v3)
      console.log('   🔄 Enviando reCAPTCHA v3 a 2Captcha...');
      const captchaStart = await axios.post("http://2captcha.com/in.php", null, {
        params: {
          key: this.captchaApiKey,
          method: "userrecaptcha",
          googlekey: siteKey,
          pageurl: pageUrl,
          version: "v3",
          action: "submit",
          json: 1
        },
        timeout: 10000
      });

      if (captchaStart.data.status !== 1) {
        throw new Error(`2Captcha error: ${captchaStart.data.request}`);
      }

      const captchaId = captchaStart.data.request;
      console.log(`   📋 Captcha ID: ${captchaId}`);

      // Esperar solución (máximo 2 minutos)
      const maxAttempts = 60;
      for (let i = 0; i < maxAttempts; i++) {
        await this.delay(2000);

        const captchaResult = await axios.get("http://2captcha.com/res.php", {
          params: {
            key: this.captchaApiKey,
            action: "get",
            id: captchaId,
            json: 1
          },
          timeout: 5000
        });

        if (captchaResult.data.status === 1) {
          console.log(`   ✅ reCAPTCHA v3 resuelto`);
          return captchaResult.data.request;
        }

        if (captchaResult.data.request !== "CAPCHA_NOT_READY") {
          throw new Error(`2Captcha error: ${captchaResult.data.request}`);
        }
        
        if (i % 10 === 0) {
          console.log(`   ⏳ Esperando solución de 2Captcha... (${i * 2}s)`);
        }
      }

      throw new Error("Timeout esperando solución del reCAPTCHA v3");
    } catch (error) {
      console.log(`   ⚠️ Error resolviendo reCAPTCHA v3: ${error.message}`);
      return null;
    }
  }
}

module.exports = SBSSOATScraper;
