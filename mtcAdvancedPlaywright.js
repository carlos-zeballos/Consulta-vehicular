/**
 * MTC ADAPTER AVANZADO CON PLAYWRIGHT
 * Configuración máxima de evasión y extracción multi-capa
 * Interactúa directamente con el formulario HTML usando selectores exactos
 */

const { launchAdvancedBrowser, createAdvancedContext, guaranteePageLoad, humanDelay } = require('./playwrightConfig');
const { AutoAdjustingScraper } = require('./monitoring');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = "https://rec.mtc.gob.pe";
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY;

/**
 * Resolver captcha de imagen usando 2Captcha
 */
async function resolverCaptchaImagen(base64Image) {
  if (!CAPTCHA_API_KEY) {
    throw new Error("CAPTCHA_API_KEY no configurado");
  }

  // Remover prefijo data:image si existe
  const base64Clean = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');

  console.log(`[MTC-ADVANCED] [2CAPTCHA] Enviando captcha de imagen...`);
  const captchaStart = await axios.post("http://2captcha.com/in.php", null, {
    params: {
      key: CAPTCHA_API_KEY,
      method: "base64",
      body: base64Clean,
      json: 1,
      numeric: "4", // Solo números
      min_len: "4",
      max_len: "6",
      priority: 2
    },
    timeout: 5000
  });

  if (captchaStart.data.status !== 1) {
    throw new Error(`2CAPTCHA_ERROR: ${captchaStart.data.request || captchaStart.data}`);
  }

  const captchaId = captchaStart.data.request;
  console.log(`[MTC-ADVANCED] [2CAPTCHA] Captcha ID: ${captchaId}, esperando resolución...`);

  // Esperar resolución: revisar cada 2s, máximo 20 intentos (40s)
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const solutionRes = await axios.get("http://2captcha.com/res.php", {
      params: {
        key: CAPTCHA_API_KEY,
        action: "get",
        id: captchaId,
        json: 1
      },
      timeout: 3000
    });

    if (solutionRes.data.status === 1) {
      const solution = solutionRes.data.request;
      console.log(`[MTC-ADVANCED] [2CAPTCHA] ✅ Captcha resuelto: ${solution}`);
      return solution;
    }
    
    if (solutionRes.data.request !== "CAPCHA_NOT_READY") {
      console.log(`[MTC-ADVANCED] [2CAPTCHA] Intento ${i+1}: ${solutionRes.data.request}`);
    }
  }

  throw new Error("2CAPTCHA_ERROR: Timeout esperando resolución");
}

/**
 * Obtener captcha de MTC con configuración avanzada
 * Extrae directamente del DOM usando selector #imgCaptcha
 */
async function getCitvCaptchaAdvanced() {
  const monitor = new AutoAdjustingScraper();
  
  const { browser, viewport } = await launchAdvancedBrowser({ headless: true });
  const context = await createAdvancedContext(browser, { viewport });
  const page = await context.newPage();
  
  try {
    await monitor.monitorPage(page);
    
    // Paso 1: Ir a la página principal
    console.log(`[MTC-ADVANCED] Navegando a formulario...`);
    await guaranteePageLoad(page, `${BASE_URL}/Citv/ArConsultaCitv`, {
      referer: 'https://www.google.com/'
    });
    
    await humanDelay(2000, 4000);
    
    // Paso 2: Esperar que el captcha esté visible en el DOM
    console.log(`[MTC-ADVANCED] Esperando captcha en DOM...`);
    await page.waitForSelector('#imgCaptcha', { timeout: 20000 });
    
    // Paso 3: Extraer captcha directamente del DOM
    const captchaSrc = await page.$eval('#imgCaptcha', img => img.getAttribute('src'));
    
    if (!captchaSrc || !captchaSrc.startsWith('data:image')) {
      // Fallback: intentar obtener via API
      console.log(`[MTC-ADVANCED] Captcha no encontrado en DOM, intentando via API...`);
      const captchaResponse = await page.request.get(`${BASE_URL}/CITV/refrescarCaptcha`, {
        headers: {
          'Referer': `${BASE_URL}/Citv/ArConsultaCitv`,
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      const captchaData = await captchaResponse.json();
      
      if (!captchaData.orStatus || !captchaData.orResult) {
        throw new Error("MTC_ERROR: No se pudo obtener el captcha");
      }
      
      await browser.close();
      monitor.recordSuccess();
      
      return {
        imageDataUrl: `data:image/png;base64,${captchaData.orResult}`
      };
    }
    
    await browser.close();
    monitor.recordSuccess();
    
    return {
      imageDataUrl: captchaSrc
    };
    
  } catch (error) {
    monitor.recordFailure();
    await browser.close();
    throw error;
  }
}

/**
 * Consultar CITV por placa con configuración avanzada
 * Interactúa directamente con el formulario HTML usando selectores exactos
 */
async function consultCitvByPlacaAdvanced(placa, captcha) {
  if (!placa || typeof placa !== 'string') {
    throw new Error("Placa requerida");
  }
  if (!captcha || typeof captcha !== 'string') {
    throw new Error("Captcha requerido");
  }

  const placaNormalizada = placa.trim().replace(/\s+/g, '').toUpperCase();
  const monitor = new AutoAdjustingScraper();
  
  const { browser, viewport } = await launchAdvancedBrowser({ headless: true });
  const context = await createAdvancedContext(browser, { viewport });
  const page = await context.newPage();
  
  try {
    await monitor.monitorPage(page);
    
    // Paso 1: Ir a la página principal
    console.log(`[MTC-ADVANCED] 🚗 Consultando placa: ${placaNormalizada}`);
    await guaranteePageLoad(page, `${BASE_URL}/Citv/ArConsultaCitv`, {
      referer: 'https://www.google.com/'
    });
    
    await humanDelay(2000, 4000);
    
    // Paso 2: Seleccionar "PLACA" en el selector
    console.log(`[MTC-ADVANCED] Seleccionando opción 'Placa'...`);
    await page.waitForSelector('#selBUS_Filtro', { timeout: 10000 });
    await page.selectOption('#selBUS_Filtro', '1');
    await humanDelay(1000, 2000);
    
    // Paso 3: Escribir placa en el input
    console.log(`[MTC-ADVANCED] Escribiendo placa: ${placaNormalizada}`);
    await page.waitForSelector('#texFiltro', { timeout: 10000 });
    await page.fill('#texFiltro', placaNormalizada);
    await humanDelay(1500, 2500);
    
    // Paso 4: Escribir captcha en el input
    console.log(`[MTC-ADVANCED] Escribiendo captcha: ${captcha}`);
    await page.waitForSelector('#texCaptcha', { timeout: 10000 });
    await page.fill('#texCaptcha', captcha);
    await humanDelay(1000, 2000);
    
    // Paso 5: Hacer click en el botón buscar
    console.log(`[MTC-ADVANCED] Haciendo click en 'Buscar'...`);
    await page.waitForSelector('#btnBuscar', { timeout: 10000 });
    
    // Interceptar la respuesta ANTES de hacer click (timeout aumentado)
    let responseData = null;
    const responsePromise = page.waitForResponse(
      response => {
        const url = response.url();
        const matches = url.includes('JrCITVConsultarFiltro');
        if (matches) {
          console.log(`[MTC-ADVANCED] ✅ Respuesta API detectada: ${url}`);
        }
        return matches;
      },
      { timeout: 30000 } // Aumentado a 30s
    ).catch((e) => {
      console.log(`[MTC-ADVANCED] ⚠️ No se recibió respuesta de API: ${e.message}`);
      return null;
    });
    
    // Hacer click y esperar respuesta
    try {
      await page.click('#btnBuscar');
    } catch (clickError) {
      // Intentar con otros selectores si falla
      console.log(`[MTC-ADVANCED] ⚠️ Click falló, intentando método alternativo...`);
      await page.evaluate(() => {
        const btn = document.querySelector('#btnBuscar, button[id*="buscar" i], button[type="submit"]');
        if (btn) btn.click();
      });
    }
    
    // Esperar respuesta
    try {
      const response = await responsePromise;
      if (response) {
        responseData = response;
      }
    } catch (e) {
      console.log(`[MTC-ADVANCED] ⚠️ Error esperando respuesta: ${e.message}`);
    }
    
    // Esperar un poco más para que procese
    await humanDelay(1500, 2500);
    
    // Procesar respuesta de la API
    try {
      const response = responseData; // Usar la respuesta capturada
      if (response) {
        const status = response.status();
        const contentType = response.headers()['content-type'] || '';
        
        // Validar status
        if (status !== 200) {
          const text = await response.text().catch(() => '');
          console.error(`[MTC-ADVANCED] ⚠️ Error HTTP ${status} en respuesta de API`);
          console.error(`[MTC-ADVANCED] Respuesta (primeros 300 chars): ${text.substring(0, 300)}`);
          throw new Error(`MTC_ERROR: Error HTTP ${status} al consultar. Posible bloqueo o error del servidor.`);
        }
        
        // Validar tipo de contenido
        if (!contentType.includes('application/json') && !contentType.includes('text/json') && !contentType.includes('text/javascript')) {
          const text = await response.text().catch(() => '');
          console.error(`[MTC-ADVANCED] ⚠️ Respuesta no es JSON (Content-Type: ${contentType})`);
          console.error(`[MTC-ADVANCED] Respuesta (primeros 500 chars): ${text.substring(0, 500)}`);
          // No lanzar error aquí, intentar extraer del DOM
          console.log(`[MTC-ADVANCED] Intentando extraer datos del DOM como fallback...`);
        } else {
          // Intentar parsear JSON
          try {
            responseData = await response.json();
            console.log(`[MTC-ADVANCED] ✅ Respuesta JSON recibida de la API`);
          } catch (jsonError) {
            const text = await response.text().catch(() => '');
            console.error(`[MTC-ADVANCED] ⚠️ Error parseando JSON: ${jsonError.message}`);
            console.error(`[MTC-ADVANCED] Respuesta recibida (primeros 500 chars): ${text.substring(0, 500)}`);
            // No lanzar error aquí, intentar extraer del DOM
            console.log(`[MTC-ADVANCED] Intentando extraer datos del DOM como fallback...`);
          }
        }
      }
    } catch (e) {
      console.log(`[MTC-ADVANCED] ⚠️ No se recibió respuesta válida de API: ${e.message}`);
      console.log(`[MTC-ADVANCED] Intentando extraer datos del DOM...`);
    }
    
    // Paso 6: Esperar resultados (tabla o mensaje)
    await humanDelay(2000, 3000);
    
    // Intentar extraer datos del DOM si la API no respondió
    if (!responseData) {
      console.log(`[MTC-ADVANCED] Extrayendo datos del DOM...`);
      try {
        await page.waitForSelector('#tblResultado, table, .table, #divResultados', { 
          timeout: 10000 
        });
      } catch (e) {
        console.log(`[MTC-ADVANCED] ⚠️ No se encontró tabla de resultados en DOM`);
      }
      
      // Extraer datos del DOM
      const datosDOM = await page.evaluate(() => {
        const resultados = {};
        
        // Extraer tabla completa si existe
        const tabla = document.querySelector('table, #tblResultado');
        if (tabla) {
          const filas = tabla.querySelectorAll('tr');
          filas.forEach(fila => {
            const celdas = fila.querySelectorAll('td, th');
            if (celdas.length >= 2) {
              const clave = celdas[0].innerText.trim().toLowerCase().replace(/\s+/g, '_');
              const valor = celdas[1].innerText.trim();
              if (clave && valor) {
                resultados[clave] = valor;
              }
            }
          });
        }
        
        return resultados;
      });
      
      if (Object.keys(datosDOM).length > 0) {
        console.log(`[MTC-ADVANCED] ✅ Datos extraídos del DOM:`, datosDOM);
        await browser.close();
        monitor.recordSuccess();
        
        return {
          status: 'success',
          records: [{
            placa: placaNormalizada,
            ...datosDOM
          }]
        };
      }
    }
    
    // Si tenemos respuesta de API, procesarla
    if (responseData) {
      await browser.close();
      
      // Verificar respuesta
      if (!responseData.orStatus) {
        if (responseData.orCodigo === "-1") {
          throw new Error("CAPTCHA_INVALID: El captcha ingresado es inválido");
        }
        if (responseData.orCodigo === "-2") {
          throw new Error("MTC_SERVICE_ERROR: El servicio MTC no está disponible temporalmente");
        }
        throw new Error(`MTC_ERROR: ${responseData?.orCodigo || 'Error desconocido'}`);
      }
      
      // Parsear resultados
      let records = [];
      if (responseData.orResult && Array.isArray(responseData.orResult) && responseData.orResult.length > 0) {
        try {
          const jsonStr = responseData.orResult[0];
          if (typeof jsonStr === 'string') {
            records = JSON.parse(jsonStr);
          } else if (Array.isArray(jsonStr)) {
            records = jsonStr;
          }
        } catch (parseError) {
          console.error(`[MTC-ADVANCED] Error parseando JSON:`, parseError.message);
          throw new Error(`MTC_ERROR: Error parseando respuesta JSON`);
        }
      }
      
      // Normalizar records
      const normalizedRecords = Array.isArray(records) ? records.map(record => ({
        placa: record.placa || placaNormalizada,
        nro_certificado: record.nro_certificado || record.certificado || '',
        vigencia_inicio: record.vigencia_inicio || record.fecha_inicio || '',
        vigencia_fin: record.vigencia_fin || record.fecha_fin || '',
        resultado: record.resultado || '',
        estado: record.estado || '',
        razon_social: record.razon_social || record.razonSocial || '',
        direccion: record.direccion || '',
        tipo_ambito: record.tipo_ambito || record.tipoAmbito || '',
        tipo_servicio: record.tipo_servicio || record.tipoServicio || '',
        tipo_documento: record.tipo_documento || record.tipoDocumento || '',
        observacion: record.observacion || ''
      })) : [];
      
      monitor.recordSuccess();
      
      return {
        status: normalizedRecords.length > 0 ? 'success' : 'empty',
        records: normalizedRecords
      };
    }
    
    // Si no hay datos ni de API ni de DOM
    await browser.close();
    throw new Error("MTC_ERROR: No se pudieron extraer datos ni de la API ni del DOM");
    
  } catch (error) {
    monitor.recordFailure();
    
    // Guardar screenshot en caso de error
    try {
      const screenshotsDir = path.join(__dirname, 'screenshots');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }
      await page.screenshot({ 
        path: path.join(screenshotsDir, `mtc_error_${placaNormalizada}_${Date.now()}.png`),
        fullPage: true 
      });
    } catch (screenshotError) {
      console.log(`[MTC-ADVANCED] No se pudo guardar screenshot:`, screenshotError.message);
    }
    
    await browser.close();
    throw error;
  }
}

/**
 * Consultar CITV con resolución automática de captcha
 * Combina getCitvCaptchaAdvanced + resolverCaptchaImagen + consultCitvByPlacaAdvanced
 */
async function consultCitvByPlacaWithAutoCaptcha(placa) {
  if (!placa || typeof placa !== 'string') {
    throw new Error("Placa requerida");
  }

  const placaNormalizada = placa.trim().replace(/\s+/g, '').toUpperCase();
  
  // Paso 1: Obtener captcha
  console.log(`[MTC-ADVANCED] Obteniendo captcha para placa: ${placaNormalizada}`);
  const captchaData = await getCitvCaptchaAdvanced();
  
  // Paso 2: Resolver captcha automáticamente si hay API key
  let captchaResuelto = null;
  if (CAPTCHA_API_KEY) {
    try {
      console.log(`[MTC-ADVANCED] Resolviendo captcha automáticamente con 2Captcha...`);
      captchaResuelto = await resolverCaptchaImagen(captchaData.imageDataUrl);
      console.log(`[MTC-ADVANCED] ✅ Captcha resuelto: ${captchaResuelto}`);
    } catch (error) {
      console.error(`[MTC-ADVANCED] ❌ Error resolviendo captcha:`, error.message);
      throw new Error(`CAPTCHA_RESOLUTION_ERROR: ${error.message}`);
    }
  } else {
    throw new Error("CAPTCHA_API_KEY no configurado. Se requiere para resolución automática.");
  }
  
  // Paso 3: Consultar con captcha resuelto
  return await consultCitvByPlacaAdvanced(placaNormalizada, captchaResuelto);
}

module.exports = { 
  getCitvCaptchaAdvanced, 
  consultCitvByPlacaAdvanced,
  consultCitvByPlacaWithAutoCaptcha,
  resolverCaptchaImagen
};
