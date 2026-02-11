/**
 * Callao Papeletas Scraper
 * Consulta de papeletas de infracción en Callao
 * URL: https://pagopapeletascallao.pe/
 * Requiere: PLACA
 * Usa CAPTCHA (resuelto con 2Captcha)
 */

const { chromium } = require('playwright');
const axios = require('axios');
const FormData = require('form-data');

class CallaoPapeletasScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://pagopapeletascallao.pe/';
    this.captchaApiKey = captchaApiKey;
    this.stats = { attempts: 0, successes: 0, failures: 0 };
  }

  async consultarPlaca(placa, maxIntentos = 3) {
    this.stats.attempts++;
    console.log(`\n[CALLAO] Iniciando consulta - Placa: ${placa}`);
    
    for (let intento = 1; intento <= maxIntentos; intento++) {
      console.log(`\n🔄 Intento ${intento}/${maxIntentos}`);
      
      try {
        const resultado = await this.consultarPlacaIntento(placa);
        if (resultado && resultado.success) {
          this.stats.successes++;
          console.log(`✅ [CALLAO] CONSULTA EXITOSA en intento ${intento}`);
          return resultado;
        }
        if (intento < maxIntentos) {
          await this.delay(3000);
        }
      } catch (error) {
        console.error(`❌ Error en intento ${intento}:`, error.message);
        if (intento === maxIntentos) {
          this.stats.failures++;
          return {
            success: true,
            placa: placa,
            encontrado: false,
            papeletas: [],
            mensaje: error.message || 'Error al consultar papeletas de Callao',
            timestamp: new Date().toISOString()
          };
        }
        await this.delay(3000);
      }
    }
    
    return {
      success: true,
      placa: placa,
      encontrado: false,
      papeletas: [],
      mensaje: 'No se pudo completar la consulta. Por favor, intente más tarde.',
      timestamp: new Date().toISOString()
    };
  }

  async consultarPlacaIntento(placa) {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
      });

      const page = await context.newPage();
      
      // Interceptar respuestas de red para capturar datos JSON
      let datosInterceptados = null;
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('buscar') || url.includes('consulta') || url.includes('resultado') || url.includes('papeleta')) {
          try {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('json') || contentType.includes('text')) {
              const text = await response.text();
              console.log(`   📡 Respuesta interceptada de: ${url.substring(0, 100)}`);
              if (text.includes('papeleta') || text.includes('infraccion') || text.match(/\d{8,}/)) {
                console.log(`   📋 Datos potenciales encontrados en respuesta`);
                try {
                  const json = JSON.parse(text);
                  if (json.papeletas || json.data || Array.isArray(json)) {
                    datosInterceptados = json;
                    console.log(`   ✅ Datos JSON interceptados!`);
                  }
                } catch (e) {
                  // No es JSON, pero puede tener datos
                  if (text.length < 5000) {
                    console.log(`   📋 Contenido: ${text.substring(0, 200)}`);
                  }
                }
              }
            }
          } catch (e) {
            // Ignorar errores de lectura
          }
        }
      });
      
      console.log('🌐 Navegando al sitio...');
      await page.goto(this.baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      // Esperar a que el DOM esté completamente renderizado
      await page.waitForLoadState('domcontentloaded');
      await this.delay(1500);

      // Esperar a que el formulario esté disponible
      console.log('⏳ Esperando que el formulario se cargue...');
      
      // Intentar seleccionar radio "Número de Placa" si existe
      console.log('   🔘 Intentando seleccionar radio "Número de Placa"...');
      try {
        const radioLocator = page.locator('input[value*="placa" i], input[value*="Placa"], label:has-text("Número de Placa"), label:has-text("Placa")').first();
        const radioCount = await radioLocator.count();
        if (radioCount > 0) {
          await radioLocator.click({ timeout: 5000 });
          console.log('   ✅ Radio "Número de Placa" seleccionado');
          await this.delay(500);
        }
      } catch (e) {
        console.log('   ℹ️ No se encontró radio "Número de Placa" (puede no ser necesario)');
      }
      
      // Buscar el input de placa usando locator robusto
      console.log('   🔍 Buscando campo de placa...');
      const placaLocator = page.locator(
        'input#placa, input[name*="placa" i], input[id*="placa" i], input[placeholder*="placa" i], form input[type="text"]'
      ).first();
      
      // Esperar a que el input esté visible
      await placaLocator.waitFor({ state: 'visible', timeout: 60000 });
      console.log('   ✅ Campo de placa encontrado y visible');
      
      // Si llegamos aquí, el input está visible, no necesitamos placaInput
      let placaInput = true;
      let placaInputSelector = 'locator';
      
      // Llenar el campo de placa usando el locator
      console.log(`📝 Ingresando placa: ${placa}`);
      await placaLocator.fill(placa.toUpperCase());
      await this.delay(1000);

      // Resolver CAPTCHA
      console.log('🔐 Resolviendo CAPTCHA...');
      const captchaResuelto = await this.checkAndSolveCaptcha(page);
      
      if (!captchaResuelto) {
        console.log('   ⚠️ No se pudo resolver el CAPTCHA');
        await browser.close();
        return {
          success: true,
          placa: placa,
          encontrado: false,
          papeletas: [],
          mensaje: 'No se pudo resolver el CAPTCHA',
          timestamp: new Date().toISOString()
        };
      }

      console.log('   ✅ CAPTCHA resuelto correctamente');
      await this.delay(2000);

      // Buscar y hacer clic en el botón de búsqueda
      console.log('🔍 Buscando papeletas...');
      
      // Intentar múltiples formas de encontrar el botón
      let buscarButton = null;
      const selectoresBoton = [
        'button:has-text("Buscar")',
        'input[type="submit"][value*="Buscar" i]',
        'button[type="submit"]',
        'input[type="submit"]',
        'button.btn',
        'button[class*="btn"]',
        'button'
      ];
      
      for (const selector of selectoresBoton) {
        try {
          buscarButton = await page.$(selector);
          if (buscarButton) {
            console.log(`   ✅ Botón encontrado: ${selector}`);
            break;
          }
        } catch (e) {
          // Continuar
        }
      }
      
      if (buscarButton) {
        console.log('   ✅ Haciendo clic en botón...');
        await buscarButton.click();
      } else {
        console.log('   ⚠️ Botón no encontrado, intentando con evaluate...');
        const clickeado = await page.evaluate(() => {
          const botones = document.querySelectorAll('button, input[type="submit"]');
          for (const boton of botones) {
            const texto = boton.textContent || boton.value || '';
            if (texto.toLowerCase().includes('buscar') || texto.toLowerCase().includes('consultar')) {
              boton.click();
              return true;
            }
          }
          // Si no encontramos, hacer clic en el primer botón
          if (botones.length > 0) {
            botones[0].click();
            return true;
          }
          return false;
        });
        
        if (!clickeado) {
          console.log('   ⚠️ No se encontró botón, presionando Enter...');
          await page.keyboard.press('Enter');
        } else {
          console.log('   ✅ Botón clickeado usando evaluate');
        }
      }

      // Esperar a que se carguen los resultados - estrategia mejorada
      console.log('   ⏳ Esperando a que carguen los resultados...');
      await this.delay(3000);
      
      // Esperar a que aparezca la tabla o algún indicador de resultados usando locator robusto
      try {
        const resultadoLocator = page.locator(
          'table tbody tr, .table tbody tr, table, .table, [class*="resultado"], [id*="resultado"], div:has-text("No se encontraron")'
        ).first();
        await resultadoLocator.waitFor({ state: 'visible', timeout: 20000 });
        console.log('   ✅ Indicador de resultados encontrado');
      } catch (e) {
        console.log('   ⚠️ No se encontró indicador inmediato de resultados, continuando...');
      }
      
      // Esperar más tiempo para que cargue contenido dinámico
      await this.delay(5000);
      
      // Verificar si la página cambió o si hay resultados visibles
      const urlDespues = page.url();
      console.log(`   📍 URL después del submit: ${urlDespues}`);
      
      // Hacer scroll para asegurar que todo el contenido esté visible
      console.log('   📜 Haciendo scroll para cargar contenido dinámico...');
      for (let scroll = 0; scroll <= 1000; scroll += 200) {
        await page.evaluate((scrollPos) => {
          window.scrollTo(0, scrollPos);
        }, scroll);
        await this.delay(500);
      }
      await this.delay(3000);
      
      // Scroll completo hacia abajo y arriba
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await this.delay(2000);
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await this.delay(2000);

      // Si tenemos datos interceptados, usarlos primero
      if (datosInterceptados) {
        console.log('   ✅ Usando datos interceptados de respuesta de red');
        const papeletasInterceptadas = this.procesarDatosInterceptados(datosInterceptados, placa);
        if (papeletasInterceptadas && papeletasInterceptadas.length > 0) {
          await browser.close();
          return {
            success: true,
            placa: placa,
            encontrado: true,
            papeletas: papeletasInterceptadas,
            total: papeletasInterceptadas.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0),
            timestamp: new Date().toISOString()
          };
        }
      }
      
      // Verificar si hay resultados en el DOM
      const resultados = await this.extraerResultados(page);
      
      // Guardar HTML completo para debugging si no hay resultados
      if (!resultados || resultados.length === 0) {
        console.log('   ⚠️ No se encontraron resultados, guardando HTML para análisis...');
        try {
          const html = await page.content();
          const fs = require('fs');
          fs.writeFileSync(`callao-debug-${Date.now()}.html`, html);
          console.log('   📄 HTML guardado para análisis');
        } catch (e) {
          console.log('   ⚠️ No se pudo guardar HTML:', e.message);
        }
      }
      
      await browser.close();

      if (resultados && resultados.length > 0) {
        console.log(`   ✅ Se encontraron ${resultados.length} papeleta(s)`);
        return {
          success: true,
          placa: placa,
          encontrado: true,
          papeletas: resultados,
          total: resultados.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0),
          timestamp: new Date().toISOString()
        };
      } else {
        console.log('   ⚠️ No se encontraron papeletas');
        return {
          success: true,
          placa: placa,
          encontrado: false,
          papeletas: [],
          mensaje: 'No se encontraron papeletas para esta placa',
          timestamp: new Date().toISOString()
        };
      }

    } catch (error) {
      await browser.close();
      const errorMessage = error.message || 'Error al consultar papeletas de Callao';
      console.log(`   ⚠️ Error capturado: ${errorMessage}`);
      return {
        success: true,
        placa: placa,
        encontrado: false,
        papeletas: [],
        mensaje: errorMessage,
        timestamp: new Date().toISOString()
      };
    }
  }

  async extraerResultados(page) {
    try {
      console.log('   🔍 Iniciando extracción de resultados...');
      
      // Primero, obtener información del estado de la página
      const pageInfo = await page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          bodyText: document.body.innerText.substring(0, 1000),
          tablesCount: document.querySelectorAll('table').length,
          tbodyCount: document.querySelectorAll('tbody').length,
          trCount: document.querySelectorAll('tr').length,
          tdCount: document.querySelectorAll('td').length
        };
      });
      
      console.log('   📊 Estado de la página:');
      console.log(`      URL: ${pageInfo.url}`);
      console.log(`      Tablas: ${pageInfo.tablesCount}`);
      console.log(`      Tbody: ${pageInfo.tbodyCount}`);
      console.log(`      Filas (tr): ${pageInfo.trCount}`);
      console.log(`      Celdas (td): ${pageInfo.tdCount}`);
      console.log(`      Texto inicial: ${pageInfo.bodyText.substring(0, 200)}`);
      
      // Verificar si hay mensaje de "no se encontró" primero
      const noEncontrado = pageInfo.bodyText.includes('No se encontró') || 
                          pageInfo.bodyText.includes('no hay datos') || 
                          pageInfo.bodyText.includes('sin resultados') ||
                          pageInfo.bodyText.includes('No hay datos que mostrar') ||
                          pageInfo.bodyText.includes('No se encontró información');
      
      if (noEncontrado) {
        console.log('   ⚠️ Mensaje de "no encontrado" detectado en la página');
        return [];
      }

      // Buscar la tabla de resultados con múltiples estrategias
      const resultados = await page.evaluate(() => {
        const papeletas = [];
        
        // ESTRATEGIA 1: Buscar todas las tablas y analizarlas
        const todasLasTablas = document.querySelectorAll('table');
        console.log(`Tablas encontradas: ${todasLasTablas.length}`);
        
        for (let tablaIndex = 0; tablaIndex < todasLasTablas.length; tablaIndex++) {
          const tabla = todasLasTablas[tablaIndex];
          console.log(`Analizando tabla ${tablaIndex + 1}:`, tabla.className, tabla.id);
          
          // Buscar filas de datos (excluir header)
          let filas = tabla.querySelectorAll('tbody tr');
          if (filas.length === 0) {
            filas = tabla.querySelectorAll('tr:not(:first-child)');
          }
          if (filas.length === 0) {
            filas = tabla.querySelectorAll('tr');
          }
          
          console.log(`Filas en tabla ${tablaIndex + 1}: ${filas.length}`);
          
          for (let i = 0; i < filas.length; i++) {
            const fila = filas[i];
            const celdas = fila.querySelectorAll('td');
            
            // Saltar filas con menos de 4 celdas (probablemente headers o vacías)
            if (celdas.length < 4) continue;
            
            // Extraer texto de todas las celdas para análisis
            const textosCeldas = Array.from(celdas).map((c, idx) => {
              const texto = c.textContent.trim();
              console.log(`      Celda[${idx}]: "${texto}"`);
              return texto;
            });
            console.log(`Fila ${i} completa:`, textosCeldas);
            
            // Estructura según imagen: [0]=Checkbox (opcional), [1]=Placa, [2]=Código, [3]=N° Papeleta, [4]=Fecha, [5]=Total, [6]=Cuota, [7]=Detalle, [8]=Fraccionar
            // Si la primera celda es un checkbox o está vacía, ajustar índices
            let indiceInicio = 0;
            if (textosCeldas[0] === '' || textosCeldas[0].length <= 1 || textosCeldas[0] === '0' || textosCeldas[0] === '□') {
              indiceInicio = 1; // Saltar checkbox
            }
            
            // Debug: mostrar estructura de celdas
            console.log(`   📋 Estructura de celdas (offset=${indiceInicio}):`, textosCeldas);
            
            // Buscar número de papeleta (patrón: 7+ dígitos que puede terminar en letra, ej: 06137268P)
            let numeroPapeleta = null;
            let codigo = '';
            let placa = '';
            let fechaInfraccion = '';
            let total = '';
            let numeroCuota = '0';
            
            // Buscar número de papeleta en cualquier celda
            for (let j = indiceInicio; j < textosCeldas.length; j++) {
              const texto = textosCeldas[j];
              
              // Patrón de número de papeleta (7+ dígitos, puede terminar en letra como 06137268P)
              if (texto.match(/^\d{7,}[A-Z]?$/)) {
                numeroPapeleta = texto;
                const indicePapeleta = j;
                
                // Mapear según estructura: [j-2]=Placa, [j-1]=Código, [j]=Papeleta, [j+1]=Fecha, [j+2]=Total, [j+3]=Cuota
                if (indicePapeleta >= indiceInicio + 2) {
                  placa = textosCeldas[indicePapeleta - 2] || '';
                  codigo = textosCeldas[indicePapeleta - 1] || '';
                } else if (indicePapeleta >= indiceInicio + 1) {
                  // Si solo hay una columna antes, asumir que es código y la placa está en otra parte
                  codigo = textosCeldas[indicePapeleta - 1] || '';
                  // Buscar placa en las primeras columnas
                  if (indiceInicio === 0 && textosCeldas.length > indicePapeleta) {
                    placa = textosCeldas[0] || '';
                  }
                }
                
                if (indicePapeleta < textosCeldas.length - 1) {
                  fechaInfraccion = textosCeldas[indicePapeleta + 1] || '';
                  console.log(`      Fecha (celda ${indicePapeleta + 1}): "${fechaInfraccion}"`);
                }
                // Total está en la posición j+2, Cuota en j+3 (después de Fecha)
                if (indicePapeleta < textosCeldas.length - 2) {
                  total = textosCeldas[indicePapeleta + 2] || '0';
                  console.log(`      Total RAW (celda ${indicePapeleta + 2}): "${total}"`);
                  // Limpiar total (remover S/, espacios, etc.)
                  total = total.replace(/[^\d.,]/g, '').replace(',', '.');
                  if (!total || total === '') total = '0';
                  console.log(`      Total limpio: "${total}"`);
                }
                if (indicePapeleta < textosCeldas.length - 3) {
                  numeroCuota = textosCeldas[indicePapeleta + 3] || '0';
                  console.log(`      Cuota RAW (celda ${indicePapeleta + 3}): "${numeroCuota}"`);
                  // Limpiar cuota
                  numeroCuota = numeroCuota.replace(/[^\d.,]/g, '').replace(',', '.');
                  if (!numeroCuota || numeroCuota === '') numeroCuota = '0';
                  console.log(`      Cuota limpia: "${numeroCuota}"`);
                }
                
                break;
              }
            }
            
            // Si no encontramos número de papeleta, intentar estructura fija
            // Estructura según imagen: [Checkbox], Placa, Código, N° Papeleta, Fecha Infracción, Total, N° Cuota, Detalle, Fraccionar
            if (!numeroPapeleta && textosCeldas.length >= 4) {
              // Estructura fija: considerar checkbox al inicio
              const tieneCheckbox = (textosCeldas[0] === '' || textosCeldas[0].length <= 1);
              const offset = tieneCheckbox ? 1 : 0;
              
              if (textosCeldas.length >= offset + 6) {
                // Estructura: [offset+0]=Placa, [offset+1]=Código, [offset+2]=Papeleta, [offset+3]=Fecha, [offset+4]=Total, [offset+5]=Cuota
                placa = textosCeldas[offset + 0] || '';
                codigo = textosCeldas[offset + 1] || '';
                numeroPapeleta = textosCeldas[offset + 2] || '';
                fechaInfraccion = textosCeldas[offset + 3] || '';
                // Total en columna 4, Cuota en columna 5
                total = textosCeldas[offset + 4] || '0';
                total = total.replace(/[^\d.,]/g, '').replace(',', '.');
                if (!total || total === '') total = '0';
                numeroCuota = textosCeldas[offset + 5] || '0';
                numeroCuota = numeroCuota.replace(/[^\d.,]/g, '').replace(',', '.');
                if (!numeroCuota || numeroCuota === '') numeroCuota = '0';
              } else if (textosCeldas.length >= offset + 4) {
                // Estructura mínima: Placa, Código, Papeleta, Fecha
                placa = textosCeldas[offset + 0] || '';
                codigo = textosCeldas[offset + 1] || '';
                numeroPapeleta = textosCeldas[offset + 2] || '';
                fechaInfraccion = textosCeldas[offset + 3] || '';
                if (textosCeldas.length > offset + 4) {
                  const col4 = textosCeldas[offset + 4] || '';
                  if (col4.match(/^\d+[.,]\d+$/) || col4.match(/^\d+$/)) {
                    total = col4;
                  } else {
                    numeroCuota = col4 || '0';
                  }
                }
                if (textosCeldas.length > offset + 5) {
                  const col5 = textosCeldas[offset + 5] || '0';
                  if (!total && (col5.match(/^\d+[.,]\d+$/) || col5.match(/^\d+$/))) {
                    total = col5;
                  } else if (!numeroCuota) {
                    numeroCuota = col5;
                  }
                }
              }
            }
            
            // Buscar total (patrón: S/ o número con decimales)
            if (!total || total === '') {
              for (const texto of textosCeldas) {
                if (texto.match(/S\/?\s*\d+[.,]\d+/) || texto.match(/^\d+[.,]\d+$/)) {
                  total = texto.replace(/[^\d.,]/g, '').replace(',', '.');
                  break;
                }
              }
            }
            
            // Si encontramos número de papeleta, agregar a resultados
            // Validar que no sea un header o texto vacío
            const numeroPapeletaClean = numeroPapeleta ? numeroPapeleta.trim() : '';
            const esHeader = numeroPapeletaClean.toLowerCase().includes('papeleta') || 
                           numeroPapeletaClean.toLowerCase().includes('n°') ||
                           numeroPapeletaClean.toLowerCase().includes('numero');
            
            if (numeroPapeletaClean && numeroPapeletaClean.length >= 7 && !esHeader) {
              // Limpiar y formatear total y cuota
              let totalClean = total || '0';
              totalClean = totalClean.toString().replace(/[^\d.,]/g, '').replace(',', '.');
              if (!totalClean || totalClean === '') totalClean = '0';
              
              let cuotaClean = numeroCuota || '0';
              cuotaClean = cuotaClean.toString().replace(/[^\d.,]/g, '').replace(',', '.');
              if (!cuotaClean || cuotaClean === '') cuotaClean = '0';
              
              // Si Total es 0 pero Cuota tiene un valor numérico significativo, pueden estar intercambiados
              const totalNum = parseFloat(totalClean);
              const cuotaNum = parseFloat(cuotaClean);
              
              if (totalNum === 0 && cuotaNum > 0) {
                // Intercambiar: el valor en Cuota es probablemente el Total
                console.log(`   ⚠️ Intercambiando Total y Cuota (Total=${totalClean}, Cuota=${cuotaClean})`);
                const temp = totalClean;
                totalClean = cuotaClean;
                cuotaClean = temp;
              }
              
              papeletas.push({
                placa: (placa || '').trim(),
                codigo: (codigo || '').trim(),
                numeroPapeleta: numeroPapeletaClean,
                fechaInfraccion: (fechaInfraccion || '').trim(),
                total: totalClean,
                numeroCuota: cuotaClean
              });
              console.log(`✅ Papeleta extraída: ${numeroPapeletaClean} - Total: ${totalClean} - Cuota: ${cuotaClean}`);
            }
          }
        }
        
        console.log(`Total de papeletas extraídas: ${papeletas.length}`);
        return papeletas;
      });
      
      console.log(`   📊 Resultados extraídos: ${resultados ? resultados.length : 0}`);
      
      if (resultados && resultados.length > 0) {
        console.log('   ✅ Papeletas encontradas:', JSON.stringify(resultados, null, 2));
        return resultados;
      }
      
      // Si no hay resultados, guardar screenshot para debugging
      console.log('   ⚠️ No se encontraron papeletas, guardando screenshot para debugging...');
      try {
        await page.screenshot({ path: `callao-debug-${Date.now()}.png`, fullPage: true });
        console.log('   📸 Screenshot guardado');
      } catch (e) {
        console.log('   ⚠️ No se pudo guardar screenshot:', e.message);
      }
      
      return [];
    } catch (error) {
      console.error('   ⚠️ Error extrayendo resultados:', error.message);
      return [];
    }
  }

  async checkAndSolveCaptcha(page) {
    // Verificar si hay CAPTCHA de imagen
    const hasImageCaptcha = await page.evaluate(() => {
      const captchaImg = document.querySelector('img[src*="captcha"], img[alt*="captcha" i], img[id*="captcha" i]');
      const captchaInput = document.querySelector('input[name*="captcha" i], input[id*="captcha" i]');
      return captchaImg !== null && captchaInput !== null;
    });

    if (!hasImageCaptcha) {
      // Verificar reCAPTCHA
      const hasRecaptcha = await page.evaluate(() => {
        return document.querySelector('.g-recaptcha') !== null ||
               document.querySelector('iframe[src*="recaptcha"]') !== null ||
               document.querySelector('[data-sitekey]') !== null;
      });

      if (!hasRecaptcha) {
        console.log('   ✅ No se requiere CAPTCHA');
        return true;
      }

      // Resolver reCAPTCHA
      return await this.solveRecaptcha(page);
    }

    // Resolver CAPTCHA de imagen
    return await this.solveImageCaptcha(page);
  }

  async solveImageCaptcha(page) {
    try {
      console.log('   🔐 CAPTCHA de imagen detectado, resolviendo...');

      if (!this.captchaApiKey) {
        console.log('   ⚠️ API Key de 2Captcha no configurada');
        return false;
      }

      // Obtener imagen del CAPTCHA
      const captchaImage = await page.evaluate(() => {
        const img = document.querySelector('img[src*="captcha"], img[alt*="captcha" i], img[id*="captcha" i]');
        if (img) {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          return canvas.toDataURL('image/png');
        }
        return null;
      });

      if (!captchaImage) {
        console.log('   ⚠️ No se pudo obtener imagen del CAPTCHA');
        return false;
      }

      // Convertir base64 a buffer
      const imageBuffer = Buffer.from(captchaImage.split(',')[1], 'base64');

      // Subir a 2Captcha
      const formData = new FormData();
      formData.append('method', 'post');
      formData.append('key', this.captchaApiKey);
      formData.append('file', imageBuffer, { filename: 'captcha.png', contentType: 'image/png' });
      formData.append('json', '1');

      const uploadResponse = await axios.post('http://2captcha.com/in.php', formData, {
        headers: formData.getHeaders(),
        timeout: 30000
      });

      if (!uploadResponse.data || uploadResponse.data.status !== 1) {
        console.log(`   ⚠️ Error subiendo CAPTCHA: ${uploadResponse.data?.request || 'Unknown error'}`);
        return false;
      }

      const taskId = uploadResponse.data.request;
      console.log(`   📋 Task ID: ${taskId}`);

      // Esperar solución (máximo 2 minutos)
      const maxAttempts = 40;
      for (let i = 0; i < maxAttempts; i++) {
        await this.delay(5000);

        const resultResponse = await axios.get(`http://2captcha.com/res.php`, {
          params: {
            key: this.captchaApiKey,
            action: 'get',
            id: taskId,
            json: 1
          },
          timeout: 10000
        });

      if (resultResponse.data.status === 1) {
        const captchaText = resultResponse.data.request;
        console.log(`   ✅ CAPTCHA resuelto: ${captchaText}`);

        // Intentar ingresar texto en el input - múltiples estrategias
        let captchaIngresado = false;
        
        // Estrategia 1: Buscar input visible
        try {
          const captchaInput = await page.$('input[name*="captcha" i], input[id*="captcha" i]');
          if (captchaInput) {
            await captchaInput.fill(captchaText);
            await this.delay(1000);
            captchaIngresado = true;
            console.log('   ✅ CAPTCHA ingresado usando fill()');
          }
        } catch (e) {
          console.log('   ⚠️ No se pudo usar fill(), intentando con evaluate...');
        }
        
        // Estrategia 2: Usar evaluate si fill() falló
        if (!captchaIngresado) {
          const ingresado = await page.evaluate((text) => {
            // Buscar input de CAPTCHA
            const inputs = document.querySelectorAll('input');
            for (const input of inputs) {
              const name = (input.name || '').toLowerCase();
              const id = (input.id || '').toLowerCase();
              const type = (input.type || '').toLowerCase();
              
              if ((name.includes('captcha') || id.includes('captcha')) && type === 'text') {
                input.value = text;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('keyup', { bubbles: true }));
                return true;
              }
            }
            
            // Si no encontramos, buscar cualquier input de texto que esté cerca de una imagen de CAPTCHA
            const captchaImgs = document.querySelectorAll('img[src*="captcha"], img[alt*="captcha" i]');
            if (captchaImgs.length > 0) {
              const img = captchaImgs[0];
              // Buscar input cercano
              let elemento = img.parentElement;
              for (let i = 0; i < 5; i++) {
                if (!elemento) break;
                const inputCercano = elemento.querySelector('input[type="text"]');
                if (inputCercano) {
                  inputCercano.value = text;
                  inputCercano.dispatchEvent(new Event('input', { bubbles: true }));
                  inputCercano.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                }
                elemento = elemento.parentElement;
              }
            }
            
            return false;
        }, captchaText);
        
        if (ingresado) {
          console.log('   ✅ CAPTCHA ingresado usando evaluate()');
          await this.delay(2000);
          return true;
        } else {
          console.log('   ⚠️ No se pudo encontrar el input del CAPTCHA');
          return false;
        }
      }
      
      // Continuar con el bucle si el CAPTCHA no está listo
      } else if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
        console.log(`   ⚠️ Error resolviendo CAPTCHA: ${resultResponse.data.request}`);
        return false;
      }
    }

    console.log('   ⚠️ Timeout esperando solución del CAPTCHA');
    return false;

    } catch (error) {
      console.log(`   ⚠️ Error en 2Captcha: ${error.message}`);
      return false;
    }
  }

  async solveRecaptcha(page) {
    try {
      console.log('   🔐 reCAPTCHA detectado, resolviendo...');

      if (!this.captchaApiKey) {
        console.log('   ⚠️ API Key de 2Captcha no configurada');
        return false;
      }

      // Obtener site key
      const siteKey = await page.evaluate(() => {
        const recaptcha = document.querySelector('.g-recaptcha');
        if (recaptcha) {
          return recaptcha.getAttribute('data-sitekey');
        }
        const iframe = document.querySelector('iframe[src*="recaptcha"]');
        if (iframe) {
          const src = iframe.getAttribute('src');
          const match = src.match(/k=([^&]+)/);
          if (match) return match[1];
        }
        return null;
      });

      if (!siteKey) {
        console.log('   ⚠️ No se pudo obtener site key');
        return false;
      }

      console.log(`   📋 Site Key: ${siteKey.substring(0, 20)}...`);

      // Resolver con 2Captcha
      const pageURL = page.url();
      const token = await this.resolveRecaptchaV2(siteKey, pageURL);

      if (!token) {
        console.log('   ⚠️ No se pudo obtener token de CAPTCHA');
        return false;
      }

      console.log(`   ✅ Token obtenido: ${token.substring(0, 30)}...`);

      // Inyectar token
      await page.evaluate((token) => {
        const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
        if (textarea) {
          textarea.value = token;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (typeof vcc === 'function') {
          vcc(token);
        }

        if (typeof grecaptcha !== 'undefined' && grecaptcha.getResponse) {
          try {
            grecaptcha.getResponse();
          } catch (e) {
            console.log('Error al verificar grecaptcha:', e);
          }
        }
      }, token);

      await this.delay(3000);
      console.log('   ✅ Token de reCAPTCHA inyectado');
      return true;

    } catch (error) {
      console.log(`   ⚠️ Error resolviendo reCAPTCHA: ${error.message}`);
      return false;
    }
  }

  async resolveRecaptchaV2(siteKey, pageURL) {
    try {
      const formData = new FormData();
      formData.append('method', 'userrecaptcha');
      formData.append('key', this.captchaApiKey);
      formData.append('googlekey', siteKey);
      formData.append('pageurl', pageURL);
      formData.append('json', '1');

      const uploadResponse = await axios.post('http://2captcha.com/in.php', formData, {
        headers: formData.getHeaders(),
        timeout: 30000
      });

      if (!uploadResponse.data || uploadResponse.data.status !== 1) {
        console.log(`   ⚠️ Error subiendo reCAPTCHA: ${uploadResponse.data?.request || 'Unknown error'}`);
        return null;
      }

      const taskId = uploadResponse.data.request;
      console.log(`   📋 Task ID: ${taskId}`);

      // Esperar solución (máximo 2 minutos)
      const maxAttempts = 40;
      for (let i = 0; i < maxAttempts; i++) {
        await this.delay(5000);

        const resultResponse = await axios.get(`http://2captcha.com/res.php`, {
          params: {
            key: this.captchaApiKey,
            action: 'get',
            id: taskId,
            json: 1
          },
          timeout: 10000
        });

        if (resultResponse.data.status === 1) {
          return resultResponse.data.request;
        } else if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
          console.log(`   ⚠️ Error resolviendo reCAPTCHA: ${resultResponse.data.request}`);
          return null;
        }
      }

      console.log('   ⚠️ Timeout esperando solución del reCAPTCHA');
      return null;

    } catch (error) {
      console.log(`   ⚠️ Error en 2Captcha: ${error.message}`);
      return null;
    }
  }

  procesarDatosInterceptados(datos, placa) {
    try {
      const papeletas = [];
      
      // Si es un array directo
      if (Array.isArray(datos)) {
        datos.forEach(item => {
          if (item.numeroPapeleta || item.numero_papeleta || item.papeleta) {
            papeletas.push({
              placa: item.placa || placa,
              codigo: item.codigo || item.codigoInfraccion || '',
              numeroPapeleta: item.numeroPapeleta || item.numero_papeleta || item.papeleta || '',
              fechaInfraccion: item.fechaInfraccion || item.fecha || item.fecha_infraccion || '',
              total: String(item.total || item.monto || item.importe || '0').replace(/[^\d.,]/g, '').replace(',', '.'),
              numeroCuota: String(item.numeroCuota || item.cuota || '0')
            });
          }
        });
      }
      // Si tiene propiedad papeletas o data
      else if (datos.papeletas && Array.isArray(datos.papeletas)) {
        return this.procesarDatosInterceptados(datos.papeletas, placa);
      }
      else if (datos.data && Array.isArray(datos.data)) {
        return this.procesarDatosInterceptados(datos.data, placa);
      }
      
      return papeletas;
    } catch (e) {
      console.log('   ⚠️ Error procesando datos interceptados:', e.message);
      return [];
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CallaoPapeletasScraper;
