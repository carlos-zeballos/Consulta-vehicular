/**
 * SBS SCRAPER FINAL - Optimizado para velocidad
 * Similar a mtc-scraper-final.js pero para SBS
 * Extracción rápida y directa de datos
 */

const { chromium } = require('playwright');

class SBSSOATScraper {
  constructor() {
    this.baseURL = 'https://servicios.sbs.gob.pe/reportesoat';
    this.stats = { attempts: 0, successes: 0, failures: 0 };
  }

  // ==================== MÉTODO PRINCIPAL ====================
  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [SBS-FINAL] Iniciando consulta para: ${placa}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarPlacaIntento(placa);
        
        if (resultado.success) {
          console.log(`✅ [SBS-FINAL] CONSULTA EXITOSA en intento ${attempt}`);
          this.stats.successes++;
          return resultado;
        }
        
        console.log(`⚠️ Intento ${attempt} falló, reintentando...`);
        await this.delay(2000); // Esperar antes de reintentar
        
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
      
      // 4. ESPERAR reCAPTCHA v3 (más corto que antes)
      console.log('🔐 Esperando reCAPTCHA v3...');
      await this.delay(5000); // Reducido de 8-12s a 5s
      
      // 5. ENVIAR CONSULTA
      console.log('🚀 Enviando consulta...');
      await this.submitForm(page);
      
      // 6. ESPERAR A QUE SE CARGUEN TODOS LOS RESULTADOS (más tiempo para historial completo)
      console.log('⏳ Esperando a que se carguen todos los resultados del historial...');
      await this.delay(8000); // Esperar más tiempo para que se cargue todo el historial
      
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
    
    // Seleccionar opción VEHICULAR (no SOAT) para obtener historial completo
    try {
      // Buscar todos los radio buttons disponibles para debugging
      const radiosDisponibles = await page.evaluate(() => {
        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        return radios.map(r => ({
          value: r.value,
          id: r.id,
          name: r.name,
          checked: r.checked
        }));
      });
      console.log(`   📋 Radio buttons disponibles:`, JSON.stringify(radiosDisponibles, null, 2));
      
      // Intentar primero con Vehicular (historial completo)
      const radioVehicular = await page.$('input[value="Vehicular"][type="radio"]');
      if (radioVehicular) {
        await radioVehicular.click();
        await this.delay(500);
        console.log('   ✅ Opción VEHICULAR seleccionada (historial completo)');
      } else {
        // Intentar con variaciones del nombre
        const radioVehicularAlt = await page.$('input[value*="Vehicular" i][type="radio"]');
        if (radioVehicularAlt) {
          await radioVehicularAlt.click();
          await this.delay(500);
          console.log('   ✅ Opción VEHICULAR seleccionada (variación)');
        } else {
          // Fallback a SOAT si no existe Vehicular
          const radioSoat = await page.$('input[value="Soat"][type="radio"]');
          if (radioSoat) {
            await radioSoat.click();
            await this.delay(500);
            console.log('   ⚠️ Opción SOAT seleccionada (fallback - puede no mostrar historial completo)');
          } else {
            console.log('   ⚠️ No se encontró ninguna opción de seguro');
          }
        }
      }
    } catch (e) {
      console.log('   ⚠️ Error seleccionando opción de seguro:', e.message);
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
  async extractResults(page) {
    console.log('   🔍 Buscando resultados...');
    
    // Esperar resultados con estrategia mejorada
    try {
      // Esperar selectores específicos (más rápido que networkidle)
      await page.waitForSelector('#ctl00_MainBodyContent_placa, #listSoatPlacaVeh', { 
        timeout: 20000,
        state: 'visible'
      });
      console.log('   ✅ Resultados encontrados');
      
      // Esperar a que la tabla tenga contenido (puede tardar más con AJAX)
      console.log('   ⏳ Esperando a que la tabla se cargue completamente...');
      await this.delay(5000); // Esperar más tiempo para carga AJAX
      
      // Verificar cuántas filas hay en la tabla
      const filasIniciales = await page.evaluate(() => {
        const tabla = document.querySelector('#listSoatPlacaVeh tbody') || document.querySelector('#listSoatPlacaVeh');
        return tabla ? tabla.querySelectorAll('tr').length : 0;
      });
      console.log(`   📊 Filas encontradas inicialmente: ${filasIniciales}`);
      
      // Esperar más tiempo si solo hay 1 fila (puede estar cargando más)
      if (filasIniciales <= 1) {
        console.log('   ⏳ Solo 1 fila detectada, esperando más tiempo para carga completa...');
        await this.delay(10000); // Esperar 10 segundos adicionales
        
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
      for (let i = 0; i < 10; i++) { // Aumentado de 5 a 10 iteraciones
        await page.evaluate(() => {
          const tabla = document.querySelector('#listSoatPlacaVeh');
          if (tabla) {
            tabla.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        });
        await this.delay(800);
        
        // También hacer scroll de la página completa
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await this.delay(800);
        
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
      await this.delay(3000); // Aumentado de 2000 a 3000
      
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
      const resultadoPagina = await page.evaluate(() => {
      const data = {};
      
      // Placa
      const placaEl = document.querySelector('#ctl00_MainBodyContent_placa');
      data.placa = placaEl ? placaEl.textContent.trim() : '';
      
      // Fecha consulta
      const fechaConsultaEl = document.querySelector('#ctl00_MainBodyContent_fecha_consulta');
      data.fecha_consulta = fechaConsultaEl ? fechaConsultaEl.textContent.trim() : '';
      
      // Fecha actualización
      const fechaActEl = document.querySelector('#ctl00_MainBodyContent_fecha_act');
      data.fecha_actualizacion = fechaActEl ? fechaActEl.textContent.trim() : '';
      
      // Cantidad de accidentes
      const cantidadEl = document.querySelector('#ctl00_MainBodyContent_cantidad');
      data.accidentes_ultimos_5_anios = cantidadEl ? parseInt(cantidadEl.textContent.trim() || '0', 10) : 0;
      
      // Tabla de pólizas - extracción completa con logs
      data.polizas = [];
      
      // Buscar tabla - IMPORTANTE: La tabla tiene múltiples <tbody>, cada uno con una fila
      let tabla = document.querySelector('#listSoatPlacaVeh');
      if (!tabla) {
        // Buscar cualquier tabla que contenga datos de pólizas
        const todasLasTablas = document.querySelectorAll('table');
        for (const t of todasLasTablas) {
          const filas = t.querySelectorAll('tr');
          if (filas.length > 1) { // Más de 1 fila (header + datos)
            const primeraFila = filas[0];
            const celdas = primeraFila.querySelectorAll('td, th');
            if (celdas.length >= 8) {
              tabla = t;
              break;
            }
          }
        }
      }
      
      if (tabla) {
        // IMPORTANTE: Buscar TODOS los tbody dentro de la tabla (cada tbody tiene una fila de datos)
        const todosLosTbody = tabla.querySelectorAll('tbody');
        console.log(`   📊 Total de elementos <tbody> encontrados: ${todosLosTbody.length}`);
        
        // Procesar cada tbody por separado
        todosLosTbody.forEach((tbody, tbodyIndex) => {
          const filas = tbody.querySelectorAll('tr');
          console.log(`   📋 Tbody ${tbodyIndex + 1}: ${filas.length} fila(s)`);
          
          filas.forEach((row, rowIndex) => {
            const celdas = row.querySelectorAll('td'); // Solo TD, no TH
            
            // Saltar filas de encabezado (th) o filas con menos de 8 celdas
            if (celdas.length >= 8) {
              const aseguradora = celdas[0]?.textContent.trim() || '';
              const claseVehiculo = celdas[1]?.textContent.trim() || '';
              const usoVehiculo = celdas[2]?.textContent.trim() || '';
              const nAccidentes = celdas[3]?.textContent.trim() || '0';
              const nPoliza = celdas[4]?.textContent.trim() || '';
              const nCertificado = celdas[5]?.textContent.trim() || '';
              const inicioVigencia = celdas[6]?.textContent.trim() || '';
              const finVigencia = celdas[7]?.textContent.trim() || '';
              const comentario = celdas.length > 9 ? celdas[9]?.textContent.trim() : (celdas.length > 8 ? celdas[8]?.textContent.trim() : '');
              
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
                console.log(`      ✅ Póliza extraída del tbody ${tbodyIndex + 1}: ${aseguradora} | ${inicioVigencia} - ${finVigencia} | Póliza: ${nPoliza}`);
              } else {
                console.log(`      ⚠️ Fila ${rowIndex + 1} del tbody ${tbodyIndex + 1} omitida (sin datos válidos)`);
              }
            } else if (celdas.length > 0) {
              console.log(`      ⚠️ Fila ${rowIndex + 1} del tbody ${tbodyIndex + 1} tiene ${celdas.length} celdas (se esperaban 8+)`);
            }
          });
        });
        
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
        console.log('   ⚠️ No se encontró la tabla de pólizas');
        // Intentar buscar cualquier tabla en la página
        const todasLasTablas = document.querySelectorAll('table');
        console.log(`   🔍 Tablas encontradas en la página: ${todasLasTablas.length}`);
        todasLasTablas.forEach((t, idx) => {
          const filas = t.querySelectorAll('tr');
          console.log(`   📋 Tabla ${idx + 1}: ${filas.length} filas, id="${t.id}", class="${t.className}"`);
        });
      }
      
        return data;
      });
      
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
    
    // Verificar si hay datos
    if (!resultado.polizas || resultado.polizas.length === 0) {
      // Verificar si hay mensaje de "no encontrado"
      const noDataMessage = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('no se encontr') || 
               text.includes('sin registros') ||
               text.includes('no hay datos');
      });
      
      if (noDataMessage) {
        console.log('   ℹ️ No se encontraron registros para esta placa');
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
}

module.exports = SBSSOATScraper;
