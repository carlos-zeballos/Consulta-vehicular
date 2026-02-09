/**
 * MTC ADAPTER CON PLAYWRIGHT
 * Alternativa más robusta con mejor anti-detección
 */

const { chromium } = require('playwright');

const BASE_URL = "https://rec.mtc.gob.pe";

/**
 * Lanzar navegador con Playwright
 */
async function launchBrowserPlaywright() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  return browser;
}

/**
 * Obtener captcha de MTC usando Playwright
 */
async function getCitvCaptchaPlaywright() {
  const browser = await launchBrowserPlaywright();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'es-PE'
  });
  
  const page = await context.newPage();
  
  try {
    // Paso 1: Ir a la página principal para obtener cookies
    await page.goto(`${BASE_URL}/Citv/ArConsultaCitv`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(2000);
    
    // Paso 2: Obtener captcha
    const captchaResponse = await page.request.get(`${BASE_URL}/CITV/refrescarCaptcha`, {
      headers: {
        'Referer': `${BASE_URL}/Citv/ArConsultaCitv`,
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    
    const captchaData = await captchaResponse.json();
    
    await browser.close();
    
    if (!captchaData.orStatus || !captchaData.orResult) {
      throw new Error("MTC_ERROR: No se pudo obtener el captcha");
    }
    
    return {
      imageDataUrl: `data:image/png;base64,${captchaData.orResult}`
    };
    
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/**
 * Consultar CITV por placa usando Playwright
 */
async function consultCitvByPlacaPlaywright(placa, captcha) {
  if (!placa || typeof placa !== 'string') {
    throw new Error("Placa requerida");
  }
  if (!captcha || typeof captcha !== 'string') {
    throw new Error("Captcha requerido");
  }

  const placaNormalizada = placa.trim().replace(/\s+/g, '').toUpperCase();
  const browser = await launchBrowserPlaywright();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'es-PE'
  });
  
  const page = await context.newPage();
  
  try {
    // Paso 1: Ir a la página principal para obtener cookies
    await page.goto(`${BASE_URL}/Citv/ArConsultaCitv`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(2000);
    
    // Paso 2: Obtener captcha (necesario para la sesión)
    try {
      await page.request.get(`${BASE_URL}/CITV/refrescarCaptcha`, {
        headers: {
          'Referer': `${BASE_URL}/Citv/ArConsultaCitv`,
          'Accept': 'application/json'
        }
      });
    } catch (e) {
      console.log(`[MTC-PLAYWRIGHT] No se pudo obtener captcha previo`);
    }
    
    // Paso 3: Consultar con placa y captcha
    const pArr = `1|${placaNormalizada}||${captcha}`;
    const consultUrl = `${BASE_URL}/CITV/JrCITVConsultarFiltro?pArrParametros=${encodeURIComponent(pArr)}`;
    
    const consultResponse = await page.request.get(consultUrl, {
      headers: {
        'Referer': `${BASE_URL}/Citv/ArConsultaCitv`,
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    
    const data = await consultResponse.json();
    
    await browser.close();
    
    // Verificar respuesta
    if (!data || !data.orStatus) {
      if (data && data.orCodigo === "-1") {
        throw new Error("CAPTCHA_INVALID: El captcha ingresado es inválido");
      }
      if (data && data.orCodigo === "-2") {
        throw new Error("MTC_SERVICE_ERROR: El servicio MTC no está disponible temporalmente");
      }
      throw new Error(`MTC_ERROR: ${data?.orCodigo || 'Error desconocido'}`);
    }
    
    // Parsear resultados
    let records = [];
    if (data.orResult && Array.isArray(data.orResult) && data.orResult.length > 0) {
      try {
        const jsonStr = data.orResult[0];
        if (typeof jsonStr === 'string') {
          records = JSON.parse(jsonStr);
        } else if (Array.isArray(jsonStr)) {
          records = jsonStr;
        }
      } catch (parseError) {
        console.error(`[MTC-PLAYWRIGHT] Error parseando JSON:`, parseError.message);
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
    
    return {
      status: normalizedRecords.length > 0 ? 'success' : 'empty',
      records: normalizedRecords
    };
    
  } catch (error) {
    await browser.close();
    throw error;
  }
}

module.exports = { getCitvCaptchaPlaywright, consultCitvByPlacaPlaywright };
