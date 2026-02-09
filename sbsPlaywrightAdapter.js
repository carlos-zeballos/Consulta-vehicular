/**
 * SBS ADAPTER CON PLAYWRIGHT
 * Alternativa más robusta con mejor anti-detección
 */

const { chromium } = require('playwright');

const BASE_URL = "https://servicios.sbs.gob.pe/reportesoat";

/**
 * Lanzar navegador con Playwright (mejor anti-detección)
 */
async function launchBrowserPlaywright() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
  return browser;
}

/**
 * Configurar página con anti-detección mejorado
 */
async function setupPagePlaywright(page) {
  // Playwright ya tiene mejor anti-detección por defecto
  await page.setViewportSize({ width: 1920, height: 1080 });
  
  // User agent realista
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  });
}

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
 * Consultar SBS SOAT por placa usando Playwright
 */
async function consultSbsSoatPlaywright(placa) {
  if (!placa || typeof placa !== 'string') {
    throw new Error("Placa requerida");
  }

  const placaNormalizada = placa.trim().replace(/\s+/g, '').toUpperCase();
  const browser = await launchBrowserPlaywright();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'es-PE',
    timezoneId: 'America/Lima'
  });
  
  const page = await context.newPage();
  
  try {
    await setupPagePlaywright(page);
    
    console.log(`[SBS-PLAYWRIGHT] Navegando a formulario...`);
    await page.goto(`${BASE_URL}/BusquedaPlaca`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Esperar a que la página cargue completamente
    await page.waitForTimeout(3000);
    
    // Buscar y llenar input de placa
    console.log(`[SBS-PLAYWRIGHT] Buscando input de placa...`);
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
        console.log(`[SBS-PLAYWRIGHT] ✅ Input encontrado: ${selector}`);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!inputFound) {
      throw new Error("SELECTOR_MISSING: No se encontró el input de placa");
    }
    
    // Seleccionar opción SOAT si hay radio buttons
    try {
      const radioSoat = await page.$('input[value="Soat"][type="radio"]');
      if (radioSoat) {
        await radioSoat.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.log(`[SBS-PLAYWRIGHT] No se pudo seleccionar opción SOAT`);
    }
    
    // Esperar a que reCAPTCHA v3 se ejecute automáticamente
    console.log(`[SBS-PLAYWRIGHT] Esperando reCAPTCHA v3...`);
    await page.waitForTimeout(8000);
    
    // Hacer click en el botón de consultar
    console.log(`[SBS-PLAYWRIGHT] Haciendo click en consultar...`);
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
        console.log(`[SBS-PLAYWRIGHT] ✅ Botón encontrado: ${selector}`);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!buttonFound) {
      throw new Error("SELECTOR_MISSING: No se encontró el botón de consultar");
    }
    
    // Esperar a que se cargue la página de resultados
    console.log(`[SBS-PLAYWRIGHT] Esperando resultados...`);
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {
      console.log(`[SBS-PLAYWRIGHT] Timeout en navegación, continuando...`);
    });
    
    await page.waitForTimeout(3000);
    
    // Extraer datos de la página de resultados
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
      
      // Tabla de pólizas - buscar en múltiples ubicaciones posibles
      data.polizas = [];
      
      // Intentar primero con el selector principal
      let tabla = document.querySelector('#listSoatPlacaVeh tbody');
      if (!tabla) {
        // Intentar sin tbody
        tabla = document.querySelector('#listSoatPlacaVeh');
      }
      if (!tabla) {
        // Intentar buscar cualquier tabla que contenga datos de pólizas
        const tablas = document.querySelectorAll('table tbody');
        for (const t of tablas) {
          const filas = t.querySelectorAll('tr');
          if (filas.length > 0 && filas[0].querySelectorAll('td').length >= 8) {
            tabla = t;
            break;
          }
        }
      }
      
      if (tabla) {
        const filas = tabla.querySelectorAll('tr');
        console.log(`[SBS-PLAYWRIGHT] Encontradas ${filas.length} filas en la tabla`);
        filas.forEach((row, index) => {
          const celdas = row.querySelectorAll('td');
          if (celdas.length >= 8) {
            const poliza = {
              aseguradora: celdas[0]?.textContent.trim() || '',
              clase_vehiculo: celdas[1]?.textContent.trim() || '',
              uso_vehiculo: celdas[2]?.textContent.trim() || '',
              n_accidentes: parseInt(celdas[3]?.textContent.trim() || '0', 10),
              n_poliza: celdas[4]?.textContent.trim() || '',
              n_certificado: celdas[5]?.textContent.trim() || '',
              inicio_vigencia: celdas[6]?.textContent.trim() || '',
              fin_vigencia: celdas[7]?.textContent.trim() || '',
              comentario: celdas.length > 9 ? celdas[9]?.textContent.trim() : (celdas.length > 8 ? celdas[8]?.textContent.trim() : '')
            };
            // Solo agregar si tiene datos válidos
            if (poliza.aseguradora || poliza.n_poliza) {
              data.polizas.push(poliza);
            }
          }
        });
      } else {
        console.log(`[SBS-PLAYWRIGHT] No se encontró la tabla de pólizas`);
      }
      
      return data;
    });
    
    console.log(`[SBS-PLAYWRIGHT] Pólizas extraídas: ${resultado.polizas.length}`);
    
    await browser.close();
    
    // Normalizar fechas
    resultado.fecha_consulta = normalizeDateTime(resultado.fecha_consulta) || new Date().toISOString();
    resultado.polizas = resultado.polizas.map(p => ({
      ...p,
      inicio_vigencia: normalizeDate(p.inicio_vigencia),
      fin_vigencia: normalizeDate(p.fin_vigencia)
    }));
    
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
    await browser.close();
    throw error;
  }
}

module.exports = { consultSbsSoatPlaywright };
