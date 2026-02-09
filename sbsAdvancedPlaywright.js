/**
 * SBS ADAPTER AVANZADO CON PLAYWRIGHT
 * Configuración máxima de evasión y extracción multi-capa
 */

const { launchAdvancedBrowser, createAdvancedContext, guaranteePageLoad, humanDelay } = require('./playwrightConfig');
const { MultiLayerExtractor } = require('./extractors');
const { AutoAdjustingScraper } = require('./monitoring');

const BASE_URL = "https://servicios.sbs.gob.pe/reportesoat";

/**
 * Normalizar fecha DD/MM/YYYY a ISO YYYY-MM-DD
 */
function normalizeDate(dateStr) {
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

/**
 * Normalizar fecha con hora DD/MM/YYYY HH:mm:ss
 */
function normalizeDateTime(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === '-') return null;
  
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, day, month, year, hour, minute, second] = match;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }
  
  return normalizeDate(trimmed);
}

/**
 * Limpiar texto
 */
function cleanText(text) {
  if (!text) return '';
  return String(text).trim().replace(/\s+/g, ' ');
}

/**
 * Consultar SBS SOAT con configuración avanzada
 */
async function consultSbsSoatAdvanced(placa) {
  if (!placa || typeof placa !== 'string') {
    throw new Error("Placa requerida");
  }

  const placaNormalizada = placa.trim().replace(/\s+/g, '').toUpperCase();
  const monitor = new AutoAdjustingScraper();
  
  const { browser, viewport } = await launchAdvancedBrowser({ headless: true });
  const context = await createAdvancedContext(browser, { viewport });
  const page = await context.newPage();
  
  try {
    // Configurar monitoreo
    const blockDetected = await monitor.monitorPage(page);
    
    // Cargar página del formulario
    console.log(`[SBS-ADVANCED] Navegando a formulario...`);
    await guaranteePageLoad(page, `${BASE_URL}/BusquedaPlaca`, {
      referer: 'https://www.google.com/'
    });
    
    await humanDelay(2000, 4000);
    
    // Buscar y llenar input de placa
    console.log(`[SBS-ADVANCED] Buscando input de placa...`);
    const inputSelectors = [
      '#ctl00_MainBodyContent_txtPlaca',
      'input[name="ctl00$MainBodyContent$txtPlaca"]',
      'input[id*="txtPlaca" i]',
      'input[type="text"][placeholder*="placa" i]'
    ];
    
    let inputFound = false;
    for (const selector of inputSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.fill(selector, placaNormalizada);
        inputFound = true;
        console.log(`[SBS-ADVANCED] ✅ Input encontrado: ${selector}`);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!inputFound) {
      throw new Error("SELECTOR_MISSING: No se encontró el input de placa");
    }
    
    await humanDelay(500, 1000);
    
    // Seleccionar opción SOAT
    try {
      const radioSoat = await page.$('input[value="Soat"][type="radio"]');
      if (radioSoat) {
        await radioSoat.click();
        await humanDelay(300, 600);
      }
    } catch (e) {
      console.log(`[SBS-ADVANCED] No se pudo seleccionar opción SOAT`);
    }
    
    // Esperar reCAPTCHA v3
    console.log(`[SBS-ADVANCED] Esperando reCAPTCHA v3...`);
    await humanDelay(8000, 12000);
    
    // Hacer click en consultar
    console.log(`[SBS-ADVANCED] Haciendo click en consultar...`);
    const buttonSelectors = [
      '#ctl00_MainBodyContent_btnIngresarPla',
      'input[name="ctl00$MainBodyContent$btnIngresarPla"]',
      'input[type="submit"][value*="Consultar" i]',
      'button[type="submit"]'
    ];
    
    let buttonFound = false;
    for (const selector of buttonSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        buttonFound = true;
        console.log(`[SBS-ADVANCED] ✅ Botón encontrado: ${selector}`);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!buttonFound) {
      throw new Error("SELECTOR_MISSING: No se encontró el botón de consultar");
    }
    
    // Esperar resultados con múltiples estrategias
    console.log(`[SBS-ADVANCED] Esperando resultados...`);
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      // Intentar esperar selectores específicos
      try {
        await page.waitForSelector('#ctl00_MainBodyContent_placa, #listSoatPlacaVeh', { timeout: 15000 });
      } catch (e2) {
        console.log(`[SBS-ADVANCED] Esperando cualquier contenido...`);
        await page.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 10000 });
      }
    }
    
    await humanDelay(3000, 5000);
    
    // Verificar bloqueo solo si es un bloqueo real (403/429)
    // El monitor puede tener falsos positivos, así que verificamos el status HTTP
    const currentUrl = page.url();
    if (currentUrl.includes('blocked') || currentUrl.includes('403') || currentUrl.includes('429')) {
      throw new Error("BLOCKED_OR_RATE_LIMITED: Bloqueo detectado durante la navegación");
    }
    
    // Extraer datos usando sistema multi-capa
    const extractor = new MultiLayerExtractor(page);
    const extractionResult = await extractor.extractVehicleData({
      placa: ['#ctl00_MainBodyContent_placa'],
      fecha_consulta: ['#ctl00_MainBodyContent_fecha_consulta'],
      fecha_actualizacion: ['#ctl00_MainBodyContent_fecha_act'],
      cantidad: ['#ctl00_MainBodyContent_cantidad']
    });
    
    // Extraer datos principales del DOM
    const resultado = await page.evaluate(() => {
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
      
      // Tabla de pólizas
      data.polizas = [];
      const tabla = document.querySelector('#listSoatPlacaVeh tbody');
      if (tabla) {
        const filas = tabla.querySelectorAll('tr');
        filas.forEach(row => {
          const celdas = row.querySelectorAll('td');
          if (celdas.length >= 8) {
            data.polizas.push({
              aseguradora: celdas[0]?.textContent.trim() || '',
              clase_vehiculo: celdas[1]?.textContent.trim() || '',
              uso_vehiculo: celdas[2]?.textContent.trim() || '',
              n_accidentes: parseInt(celdas[3]?.textContent.trim() || '0', 10),
              n_poliza: celdas[4]?.textContent.trim() || '',
              n_certificado: celdas[5]?.textContent.trim() || '',
              inicio_vigencia: celdas[6]?.textContent.trim() || '',
              fin_vigencia: celdas[7]?.textContent.trim() || '',
              comentario: celdas.length > 9 ? celdas[9]?.textContent.trim() : (celdas.length > 8 ? celdas[8]?.textContent.trim() : '')
            });
          }
        });
      }
      
      return data;
    });
    
    await browser.close();
    
    // Normalizar fechas
    resultado.fecha_consulta = normalizeDateTime(resultado.fecha_consulta) || new Date().toISOString();
    resultado.polizas = resultado.polizas.map(p => ({
      ...p,
      inicio_vigencia: normalizeDate(p.inicio_vigencia),
      fin_vigencia: normalizeDate(p.fin_vigencia)
    }));
    
    monitor.recordSuccess();
    
    if (!resultado.polizas || resultado.polizas.length === 0) {
      return {
        placa: resultado.placa || placaNormalizada,
        fecha_consulta: resultado.fecha_consulta,
        fecha_actualizacion: resultado.fecha_actualizacion || '',
        accidentes_ultimos_5_anios: 0,
        polizas: []
      };
    }
    
    return {
      placa: resultado.placa || placaNormalizada,
      fecha_consulta: resultado.fecha_consulta,
      fecha_actualizacion: resultado.fecha_actualizacion || '',
      accidentes_ultimos_5_anios: resultado.accidentes_ultimos_5_anios || 0,
      polizas: resultado.polizas
    };
    
  } catch (error) {
    monitor.recordFailure();
    await browser.close();
    throw error;
  }
}

module.exports = { consultSbsSoatAdvanced };
