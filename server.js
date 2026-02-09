/**
 * SERVER.JS - Consulta Vehicular
 * ProducciÃ³n cPanel - Contrato JSON Ãºnico
 */

require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");
const crypto = require("crypto");
const axios = require("axios");
const cors = require("cors");
const FormData = require("form-data");
const { consultSbsSoat } = require("./sbsAdapter");
const { getCitvCaptcha, consultCitvByPlaca } = require("./mtcAdapter");
const { consultSbsSoatPlaywright } = require("./sbsPlaywrightAdapter");
const { getCitvCaptchaPlaywright, consultCitvByPlacaPlaywright } = require("./mtcPlaywrightAdapter");
const { consultSbsSoatAdvanced } = require("./sbsAdvancedPlaywright");
const { getCitvCaptchaAdvanced, consultCitvByPlacaAdvanced } = require("./mtcAdvancedPlaywright");
const MTCCITVScraper = require("./mtc-scraper-final");
const SATCapturasScraper = require("./sat-scraper");
const ArequipaPapeletasScraper = require("./arequipa-scraper");
const PiuraMultasScraper = require("./piura-scraper");
const TarapotoMultasScraper = require("./tarapoto-scraper");
const ChiclayoInfraccionesScraper = require("./chiclayo-scraper");
const HuancayoPapeletasScraper = require("./huancayo-scraper");
const HuanucoPapeletasScraper = require("./huanuco-scraper");
const IcaPapeletasScraper = require("./ica-scraper");
const CuscoPapeletasScraper = require("./cusco-scraper");
const ChachapoyasPapeletasScraper = require("./chachapoyas-scraper");
const CajamarcaPapeletasScraper = require("./cajamarca-scraper");
const TrujilloRecordScraper = require("./trujillo-scraper");
const AndahuaylasPapeletasScraper = require("./andahuaylas-scraper");
const TacnaPapeletasScraper = require("./tacna-scraper");
const InfogasScraper = require("./infogas-scraper");
const ImpuestoVehicularScraper = require("./impuesto-vehicular-scraper");
const PlacasPeScraper = require("./placas-pe-scraper");
const CallaoPapeletasScraper = require("./callao-papeletas-scraper");
const PitFotoScraper = require("./pit-foto-scraper");
const PunoPapeletasScraper = require("./puno-papeletas-scraper");
const { renderPdf } = require('./renderPdf');

const app = express();

// ============================================
// MIDDLEWARE DE RUTEO PARA cPanel (Subdirectorio)
// ============================================
// Si la app está montada en /consultavehicular, recortamos el prefijo
const BASE_PATH = process.env.BASE_PATH || "/consultavehicular/proyecto-cpanel";

app.use((req, res, next) => {
  // Recortar el prefijo BASE_PATH si existe en la URL
  if (req.url.startsWith(BASE_PATH)) {
    req.url = req.url.slice(BASE_PATH.length) || "/";
  }
  // También manejar sin el prefijo completo (solo /consultavehicular)
  else if (req.url.startsWith("/consultavehicular")) {
    req.url = req.url.slice("/consultavehicular".length) || "/";
  }
  // También manejar /proyecto-cpanel directamente
  else if (req.url.startsWith("/proyecto-cpanel")) {
    req.url = req.url.slice("/proyecto-cpanel".length) || "/";
  }
  next();
});

// ============================================
// MIDDLEWARE - Solo una vez cada uno
// ============================================
app.use(cors());
// Aumentar lÃ­mite para permitir imÃ¡genes base64 grandes
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));
// Usar ruta absoluta para static files (más seguro en cPanel)
app.use(express.static(path.join(__dirname, "public")));

// ============================================
// RUTA RAÍZ - Servir index.html para cPanel
// ============================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// También servir index.html para rutas comunes
app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/result.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "result.html"));
});

// ============================================
// API: CUPONES
// ============================================
app.get("/api/coupons/public", (req, res) => {
  return respond(res, {
    ok: true,
    source: "coupons",
    status: "success",
    message: "Por seguridad, no se listan cupones en el frontend",
    data: { coupons: [] }
  });
});

app.post("/api/coupons/redeem", (req, res) => {
  const { code } = req.body || {};
  const input = normalizeCouponCode(code);
  if (!input) {
    return respond(res, { ok: false, source: "coupons", status: "error", message: "Código requerido" }, 400);
  }

  const config = getCouponConfig();
  const inputHash = hashCoupon(input);

  // Admin coupon (ilimitado)
  if (config.adminHash && inputHash === config.adminHash) {
    return respond(res, {
      ok: true,
      source: "coupons",
      status: "success",
      message: "Cupón administrador válido",
      data: {
        type: "admin",
        redirectUrl: "/result.html?modo=prueba",
        remainingUses: null
      }
    });
  }

  // Public coupons (máx 5 usos)
  const state = loadCouponState(config);
  const entry = state.public?.[inputHash];
  if (!entry || entry.active === false) {
    return respond(res, {
      ok: true,
      source: "coupons",
      status: "empty",
      message: "Cupón inválido",
      data: { valid: false }
    });
  }

  const remaining = Number(entry.remainingUses || 0);
  if (remaining <= 0) {
    return respond(res, {
      ok: true,
      source: "coupons",
      status: "empty",
      message: "Cupón agotado",
      data: { valid: false, remainingUses: 0 }
    });
  }

  entry.remainingUses = remaining - 1;
  state.public[inputHash] = entry;
  saveCouponState(state);

  return respond(res, {
    ok: true,
    source: "coupons",
    status: "success",
    message: "Cupón aplicado. Consulta gratuita habilitada.",
    data: {
      type: "public",
      remainingUses: entry.remainingUses,
      redirectUrl: "/result.html"
    }
  });
});

// ============================================
// VARIABLES DE ENTORNO
// ============================================
const FACTILIZA_TOKEN = process.env.FACTILIZA_TOKEN || "";
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || "";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";
const COUPON_ADMIN_CODE = process.env.COUPON_ADMIN_CODE || "";
const COUPONS_PUBLIC_CODES = process.env.COUPONS_PUBLIC_CODES || "";
const COUPON_HASH_SALT = process.env.COUPON_HASH_SALT || "v1";
const PORT = process.env.PORT || 3000;

// ============================================
// CUPONES (SECRETOS: solo backend / variables de entorno)
// ============================================
const COUPON_STATE_PATH = path.join(__dirname, "data", "coupon-state.json");

function normalizeCouponCode(code) {
  return String(code || "").trim().toUpperCase();
}

function hashCoupon(code) {
  const normalized = normalizeCouponCode(code);
  return crypto.createHash("sha256").update(`${COUPON_HASH_SALT}|${normalized}`).digest("hex");
}

function parsePublicCouponsEnv(raw) {
  // Formato: CODE:MAX_USOS,CODE2:MAX_USOS
  const items = String(raw || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const result = [];
  for (const item of items) {
    const [codePart, usesPart] = item.split(":").map(s => (s || "").trim());
    const code = normalizeCouponCode(codePart);
    if (!code) continue;
    const maxUses = Math.max(1, Number(usesPart || 5));
    result.push({ hash: hashCoupon(code), maxUses, active: true });
  }
  return result;
}

function getCouponConfig() {
  const admin = normalizeCouponCode(COUPON_ADMIN_CODE);
  const adminHash = admin ? hashCoupon(admin) : "";
  const publicCoupons = parsePublicCouponsEnv(COUPONS_PUBLIC_CODES);
  return { adminHash, publicCoupons };
}

function loadCouponState(config) {
  const empty = { version: 1, updatedAt: new Date().toISOString(), public: {} };

  let state = empty;
  try {
    if (fs.existsSync(COUPON_STATE_PATH)) {
      const raw = fs.readFileSync(COUPON_STATE_PATH, "utf8");
      state = JSON.parse(raw || "{}");
    }
  } catch (e) {
    console.error("[CUPONES] Error leyendo coupon-state.json:", e.message);
    state = empty;
  }

  if (!state || typeof state !== "object") state = empty;
  if (!state.public || typeof state.public !== "object") state.public = {};

  // Marcar como inactivos los que ya no existen en config
  const configured = new Set((config.publicCoupons || []).map(c => c.hash));
  for (const h of Object.keys(state.public)) {
    if (!configured.has(h)) {
      state.public[h].active = false;
    }
  }

  // Sincronizar los configurados (sin guardar códigos en disco)
  for (const c of config.publicCoupons || []) {
    const prev = state.public[c.hash];
    if (!prev) {
      state.public[c.hash] = { maxUses: c.maxUses, remainingUses: c.maxUses, active: true };
      continue;
    }
    prev.maxUses = c.maxUses;
    if (typeof prev.remainingUses !== "number") prev.remainingUses = c.maxUses;
    // No permitir remaining > maxUses
    prev.remainingUses = Math.min(prev.remainingUses, c.maxUses);
    prev.active = true;
    state.public[c.hash] = prev;
  }

  return state;
}

function saveCouponState(state) {
  try {
    fs.mkdirSync(path.dirname(COUPON_STATE_PATH), { recursive: true });
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(COUPON_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("[CUPONES] Error guardando coupon-state.json:", e.message);
    return false;
  }
}

// ============================================
// CONTRATO JSON ÃšNICO
// ============================================
function respond(res, { ok, source, status, message, data = null, meta = {} }, code = 200) {
  // Asegurar que siempre devolvemos 200 para el frontend (excepto errores de validaciÃ³n)
  const finalCode = code >= 400 && code < 500 ? code : 200;
  
  const response = {
    ok: !!ok,
    source,
    status,
    message: message || "",
    data,
    meta: { 
      timestamp: new Date().toISOString(),
      ...meta 
    }
  };
  
  // Log de respuesta formateada para debugging (SAT y SUNARP)
  if (source === 'sat') {
    console.log(`\n[SAT] ========== RESPUESTA FINAL ==========`);
    console.log(`[SAT] Status Code: ${finalCode}`);
    console.log(`[SAT] Response JSON:`);
    console.log(JSON.stringify(response, null, 2));
    console.log(`[SAT] ======================================\n`);
  }
  
  
  return res.status(finalCode).json(response);
}

// ============================================
// SANITIZAR MENSAJES DE ERROR
// ============================================
function sanitizeError(error) {
  if (!error) return "Error desconocido";
  
  const msg = error.message || String(error);
  
  // Errores de parseo JSON (HTML en lugar de JSON)
  if (msg.includes("Unexpected token") || 
      msg.includes("is not valid JSON") ||
      (msg.includes("JSON") && msg.includes("parse")) ||
      msg.includes("<!DOCTYPE") ||
      msg.includes("MTC_ERROR: Respuesta no es JSON")) {
    return "El servicio estÃ¡ devolviendo una respuesta inesperada. Puede estar bloqueando consultas automatizadas o experimentando problemas tÃ©cnicos.";
  }
  
  // Errores de Chromium/Puppeteer
  if (msg.includes("Could not find Chromium")) {
    return "Servicio temporalmente no disponible";
  }
  if (msg.includes("Browser closed") || msg.includes("Target closed")) {
    return "Error al procesar la consulta";
  }
  if (msg.includes("Navigation timeout") || msg.includes("Timeout")) {
    return "Tiempo de espera agotado - El servicio responde lento";
  }
  if (msg.includes("net::ERR") || msg.includes("Network")) {
    return "Error de conexiÃ³n con el servicio externo";
  }
  
  // Errores especÃ­ficos de adapters HTTP
  if (msg.includes("MTC_ERROR")) {
    return "El servicio MTC no estÃ¡ disponible temporalmente. Por favor intente mÃ¡s tarde.";
  }
  if (msg.includes("SELECTOR_MISSING")) {
    return "El portal cambiÃ³ su estructura. Contacte al administrador.";
  }
  if (msg.includes("BLOCKED_OR_RATE_LIMITED")) {
    return "El servicio bloquea consultas automatizadas temporalmente";
  }
  
  // Si el mensaje es muy largo o contiene rutas del sistema, acortarlo
  if (msg.length > 100 || msg.includes("/Users/") || msg.includes(".cache/puppeteer") || msg.includes("C:\\")) {
    return "Error tÃ©cnico - Contacte al administrador";
  }
  
  return msg;
}

// ============================================
// PUPPETEER PARA CPANEL LINUX
// ============================================
// (fs ya está importado arriba)

/**
 * Obtener ruta del ejecutable de Chrome/Chromium para Linux (cPanel)
 * Prioridad: PUPPETEER_EXECUTABLE_PATH > CHROME_BIN > puppeteer bundled
 */
function getExecutablePath() {
  // 1. Variable de entorno explÃ­cita (recomendado para cPanel)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const exePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (fs.existsSync(exePath)) {
      console.log(`âœ… Usando PUPPETEER_EXECUTABLE_PATH: ${exePath}`);
      return exePath;
    }
    console.log(`âš ï¸ PUPPETEER_EXECUTABLE_PATH no existe: ${exePath}`);
  }

  // 2. Variable CHROME_BIN (alternativa comÃºn)
  if (process.env.CHROME_BIN) {
    const chromeBin = process.env.CHROME_BIN;
    if (fs.existsSync(chromeBin)) {
      console.log(`âœ… Usando CHROME_BIN: ${chromeBin}`);
      return chromeBin;
    }
    console.log(`âš ï¸ CHROME_BIN no existe: ${chromeBin}`);
  }

  // 3. Rutas comunes en Linux (solo si no es Windows)
  if (process.platform !== 'win32') {
    const linuxPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/local/bin/chrome',
      '/opt/google/chrome/chrome'
    ];

    for (const linuxPath of linuxPaths) {
      if (fs.existsSync(linuxPath)) {
        console.log(`âœ… Chrome encontrado en Linux: ${linuxPath}`);
        return linuxPath;
      }
    }
  }

  // 4. Fallback: usar el Chromium bundled de Puppeteer
  console.log('â„¹ï¸ Usando Chromium bundled de Puppeteer');
  return null; // null = usar el bundled
}

/**
 * Lanzar navegador con configuraciÃ³n optimizada para cPanel Linux
 */
async function launchBrowser() {
  const executablePath = getExecutablePath();
  
  const launchOptions = {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--window-size=1920,1080"
    ]
  };

  // Solo agregar executablePath si existe
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  try {
    const browser = await puppeteer.launch(launchOptions);
    console.log('âœ… Navegador lanzado correctamente');
    return browser;
  } catch (error) {
    console.error('âŒ Error lanzando navegador:', error.message);
    // Si falla con executablePath, intentar sin Ã©l (usar bundled)
    if (executablePath && error.message.includes('Could not find')) {
      console.log('âš ï¸ Reintentando con Chromium bundled...');
      delete launchOptions.executablePath;
      return await puppeteer.launch(launchOptions);
    }
    throw error;
  }
}

// ============================================
// SCRAPING TOOLKIT - Helpers Reutilizables
// ============================================

/**
 * Esperar cualquiera de varios selectores (retorna el encontrado)
 */
async function waitForAnySelector(page, selectors, timeoutEach = 2500) {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: timeoutEach });
      console.log(`âœ… Selector encontrado: ${selector}`);
      return selector;
    } catch (e) {
      continue;
    }
  }
  return null;
}

/**
 * Escribir en el primer input que encuentre de la lista
 */
async function typeIntoFirst(page, selectors, value, options = { delay: 100 }) {
  const foundSelector = await waitForAnySelector(page, selectors, 3000);
  if (!foundSelector) {
    throw new Error(`No se encontrÃ³ ningÃºn input con selectores: ${selectors.join(', ')}`);
  }
  await page.type(foundSelector, value, options);
  return foundSelector;
}

/**
 * Click en botÃ³n por texto usando XPath
 */
async function clickByText(page, tag, text) {
  const xpath = `//${tag}[contains(text(), '${text}')]`;
  const elements = await page.$x(xpath);
  if (elements.length > 0) {
    await elements[0].click();
    console.log(`âœ… Click en ${tag} con texto: ${text}`);
    return true;
  }
  return false;
}

/**
 * Click en el primer elemento encontrado (CSS o XPath)
 */
async function clickFirst(page, selectorsOrXpaths) {
  for (const selector of selectorsOrXpaths) {
    try {
      // Si es XPath (empieza con //)
      if (selector.startsWith('//')) {
        const elements = await page.$x(selector);
        if (elements.length > 0) {
          await elements[0].click();
          console.log(`âœ… Click XPath: ${selector}`);
          return true;
        }
      } else {
        // CSS selector
        await page.waitForSelector(selector, { timeout: 2000 });
        await page.click(selector);
        console.log(`âœ… Click CSS: ${selector}`);
        return true;
      }
    } catch (e) {
      continue;
    }
  }
  return false;
}

/**
 * Detectar si la pÃ¡gina indica "sin registros"
 */
async function detectNoRecords(page) {
  const resultado = await page.evaluate(() => {
    const bodyText = document.body.innerText.toLowerCase();
    const frasesNoEncontrado = [
      'no se encontr',
      'sin registros',
      'no existe',
      'no hay resultados',
      'no registra',
      '0 resultados',
      'no tiene registros',
      'no se encontraron datos',
      'sin informaciÃ³n',
      'no hay informaciÃ³n'
    ];

    // Buscar en texto del body
    const tieneFrase = frasesNoEncontrado.some(frase => bodyText.includes(frase));

    // Buscar en elementos comunes de mensaje
    const mensajeEls = document.querySelectorAll('.mensaje, .alert, .error, #mensaje, [class*="mensaje" i], [id*="mensaje" i]');
    let mensajeEncontrado = '';
    
    for (const el of mensajeEls) {
      const texto = el.innerText.toLowerCase();
      if (frasesNoEncontrado.some(frase => texto.includes(frase))) {
        mensajeEncontrado = el.innerText.trim();
        break;
      }
    }

    return {
      isEmpty: tieneFrase || mensajeEncontrado.length > 0,
      message: mensajeEncontrado || (tieneFrase ? 'No se encontraron registros' : '')
    };
  });

  return resultado;
}

/**
 * Configurar pÃ¡gina con anti-detecciÃ³n
 */
async function setupAntiDetection(page) {
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Ocultar webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-PE', 'es', 'en'] });
  });

  // Headers adicionales
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  });
}

/**
 * Timeouts normalizados por tipo de endpoint
 */
function normalizeTimeouts(endpoint) {
  const captchaEndpoints = ['lima', 'impuesto'];
  if (captchaEndpoints.includes(endpoint)) {
    return {
      navigation: 60000,  // 60s para navegaciÃ³n
      selector: 10000,    // 10s para selectores
      captcha: 120000,   // 120s total para captcha
      processing: 5000   // 5s para procesar resultados
    };
  }
  return {
    navigation: 45000,   // 45s para navegaciÃ³n
    selector: 5000,      // 5s para selectores
    processing: 3000     // 3s para procesar resultados
  };
}

// ============================================
// RESOLVER CAPTCHA CON 2CAPTCHA (OPTIMIZADO)
// ============================================
async function resolverRecaptcha(siteKey, pageUrl) {
  if (!CAPTCHA_API_KEY) {
    throw new Error("CAPTCHA_API_KEY no configurado");
  }

  const captchaStart = await axios.post("http://2captcha.com/in.php", null, {
    params: {
      key: CAPTCHA_API_KEY,
      method: "userrecaptcha",
      googlekey: siteKey,
      pageurl: pageUrl,
      json: 1,
      priority: 2 // Prioridad alta
    },
    timeout: 5000
  });

  if (captchaStart.data.status !== 1) {
    throw new Error("Error enviando captcha: " + captchaStart.data.request);
  }

  const captchaId = captchaStart.data.request;
  let token = null;

  // Optimizado: revisar cada 2s en vez de 3s, mÃ¡ximo 20 intentos (40s en vez de 90s)
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await axios.get("http://2captcha.com/res.php", {
      params: {
        key: CAPTCHA_API_KEY,
        action: "get",
        id: captchaId,
        json: 1
      },
      timeout: 3000
    });
    if (check.data.status === 1) {
      token = check.data.request;
      break;
    }
    // Si dice que no estÃ¡ listo, continuar. Si hay otro error, esperar un poco mÃ¡s.
    if (check.data.request !== "CAPCHA_NOT_READY") {
      console.log(`Captcha intento ${i+1}: ${check.data.request}`);
    }
  }

  if (!token) throw new Error("Captcha no resuelto a tiempo (40s timeout)");
  return token;
}

/**
 * Resolver reCAPTCHA v2 con 2Captcha
 * @param {string} siteKey - Site key del reCAPTCHA
 * @param {string} pageUrl - URL de la pÃ¡gina donde estÃ¡ el captcha
 * @returns {Promise<string>} - Token de respuesta del reCAPTCHA
 */
async function resolverReCaptchaV2(siteKey, pageUrl) {
  if (!CAPTCHA_API_KEY) {
    throw new Error("CAPTCHA_API_KEY no configurado");
  }

  console.log(`[2Captcha] Resolviendo reCAPTCHA v2 (sitekey: ${siteKey.substring(0, 20)}...)`);

  // Enviar captcha a 2Captcha
  const captchaStart = await axios.post("http://2captcha.com/in.php", null, {
    params: {
      key: CAPTCHA_API_KEY,
      method: "userrecaptcha",
      googlekey: siteKey,
      pageurl: pageUrl,
      json: 1
    },
    timeout: 10000
  });

  if (captchaStart.data.status !== 1) {
    throw new Error(`2Captcha error: ${captchaStart.data.request}`);
  }

  const captchaId = captchaStart.data.request;
  console.log(`[2Captcha] Captcha ID: ${captchaId}`);

  // Esperar soluciÃ³n (mÃ¡ximo 2 minutos)
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const captchaResult = await axios.get("http://2captcha.com/res.php", {
      params: {
        key: CAPTCHA_API_KEY,
        action: "get",
        id: captchaId,
        json: 1
      },
      timeout: 5000
    });

    if (captchaResult.data.status === 1) {
      console.log(`[2Captcha] âœ… reCAPTCHA resuelto`);
      return captchaResult.data.request;
    }

    if (captchaResult.data.request !== "CAPCHA_NOT_READY") {
      throw new Error(`2Captcha error: ${captchaResult.data.request}`);
    }
  }

  throw new Error("Timeout esperando soluciÃ³n del reCAPTCHA");
}

/**
 * Resolver captcha de imagen (base64) con 2Captcha
 * @param {string} base64Image - Imagen en base64 (sin data:image/...)
 * @returns {Promise<string>} - Texto del captcha resuelto
 */
async function resolverCaptchaImagen(base64Image) {
  if (!CAPTCHA_API_KEY) {
    throw new Error("CAPTCHA_API_KEY no configurado");
  }

  // Remover prefijo data:image si existe
  const base64Clean = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');

  console.log(`[2CAPTCHA] Enviando captcha de imagen...`);
  const captchaStart = await axios.post("http://2captcha.com/in.php", null, {
    params: {
      key: CAPTCHA_API_KEY,
      method: "base64",
      body: base64Clean,
      json: 1,
      priority: 2
    },
    timeout: 5000
  });

  if (captchaStart.data.status !== 1) {
    throw new Error("Error enviando captcha: " + captchaStart.data.request);
  }

  const captchaId = captchaStart.data.request;
  console.log(`[2CAPTCHA] Captcha ID: ${captchaId}, esperando resoluciÃ³n...`);

  // Esperar resoluciÃ³n: revisar cada 2s, mÃ¡ximo 20 intentos (40s)
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await axios.get("http://2captcha.com/res.php", {
      params: {
        key: CAPTCHA_API_KEY,
        action: "get",
        id: captchaId,
        json: 1
      },
      timeout: 3000
    });

    if (check.data.status === 1) {
      const solution = check.data.request;
      console.log(`[2CAPTCHA] âœ… Captcha resuelto: ${solution}`);
      return solution;
    }

    if (check.data.request !== "CAPCHA_NOT_READY") {
      console.log(`[2CAPTCHA] Intento ${i+1}: ${check.data.request}`);
    }
  }

  throw new Error("Captcha de imagen no resuelto a tiempo (40s timeout)");
}

// ============================================
// MERCADO PAGO
// ============================================
let mercadopago = null;
try {
  const { MercadoPagoConfig, Preference } = require("mercadopago");
  if (ACCESS_TOKEN) {
    mercadopago = { config: new MercadoPagoConfig({ accessToken: ACCESS_TOKEN }), Preference };
  }
} catch (e) {
  console.log("MercadoPago no configurado");
}

// Modo prueba para desarrollo (solo se activa explícitamente)
// Para activar: agregar MODO_PRUEBA=true en .env o establecer NODE_ENV=development
// También se activa automáticamente si no hay ACCESS_TOKEN configurado
const MODO_PRUEBA = process.env.MODO_PRUEBA === 'true' || !ACCESS_TOKEN;

app.post("/crear-preferencia", async (req, res) => {
  // MODO PRUEBA: Solo si está explícitamente activado o si no hay ACCESS_TOKEN, redirigir directamente a result.html
  // En producción normal, siempre debe pasar por el proceso de pago
  if (MODO_PRUEBA) {
    if (!ACCESS_TOKEN) {
      console.log('[MODO PRUEBA] ACCESS_TOKEN no configurado - activando bypass de pago');
    } else {
      console.log('[MODO PRUEBA] Bypass de pago activado explícitamente');
    }
    return res.json({ 
      id: 'TEST_MODE', 
      test_mode: true,
      redirect_url: '/result.html'
    });
  }

  if (!mercadopago) {
    return respond(res, { ok: false, source: "mercadopago", status: "error", message: "MercadoPago no configurado. Configure ACCESS_TOKEN en el archivo .env" }, 500);
  }
  try {
    // Base URL público (Railway/cPanel/producción)
    // Recomendado: definir PUBLIC_BASE_URL en .env (ej: https://tu-dominio.com o https://tuapp.up.railway.app)
    const host = req.get('host') || 'localhost:3000';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
    const envBaseUrl = (process.env.PUBLIC_BASE_URL || '').trim();
    const baseUrl = envBaseUrl
      ? envBaseUrl.replace(/\/+$/, '')
      : (isLocalhost ? `http://${host}` : `https://${host}`);
    
    // Validar que baseUrl no esté vacío
    if (!baseUrl || !baseUrl.startsWith('http')) {
      throw new Error(`URL base inválida: ${baseUrl}`);
    }
    
    // Construir objeto de preferencia
    const preferenceBody = {
      items: [{ 
        title: "Consulta vehicular", 
        quantity: 1, 
        unit_price: 15, 
        currency_id: "PEN" 
      }],
      back_urls: {
        success: `${baseUrl}/result.html`,
        failure: `${baseUrl}/`,
        pending: `${baseUrl}/pendiente`
      }
    };
    
    // Solo agregar auto_return si no es localhost (MercadoPago puede rechazar localhost con auto_return)
    if (!isLocalhost) {
      preferenceBody.auto_return = "approved";
    }
    
    // Validar que success URL esté definida
    if (!preferenceBody.back_urls.success) {
      throw new Error('back_urls.success no está definido');
    }
    
    console.log(`[MercadoPago] Creando preferencia con URLs:`, preferenceBody.back_urls);
    if (preferenceBody.auto_return) {
      console.log(`[MercadoPago] Auto-return activado: ${preferenceBody.auto_return}`);
    }
    
    const preference = await new mercadopago.Preference(mercadopago.config).create({
      body: preferenceBody
    });
    
    console.log(`[MercadoPago] ✅ Preferencia creada: ${preference.id}`);
    console.log(`[MercadoPago] URL de éxito: ${preferenceBody.back_urls.success}`);
    res.json({ id: preference.id });
  } catch (error) {
    console.error(`[MercadoPago] ❌ Error al crear preferencia:`, error);
    console.error(`[MercadoPago] Detalles del error:`, error.response?.data || error.message);
    respond(res, { ok: false, source: "mercadopago", status: "error", message: error.message }, 500);
  }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get("/api/health", (req, res) => {
  respond(res, { ok: true, source: "health", status: "success", message: "Servidor operativo" });
});

// ============================================
// API: SOAT (Factiliza)
// ============================================
app.post("/api/soat", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "soat", status: "error", message: "Placa requerida" }, 400);

  try {
    if (!FACTILIZA_TOKEN) {
      return respond(res, { ok: false, source: "soat", status: "error", message: "Token no configurado" }, 500);
    }

    const response = await axios.get(`https://api.factiliza.com/v1/placa/soat/${placa}`, {
      headers: { Authorization: FACTILIZA_TOKEN },
      timeout: 10000
    });

    if (response.data && response.data.data) {
      respond(res, { ok: true, source: "soat", status: "success", data: response.data.data });
    } else {
      respond(res, { ok: true, source: "soat", status: "empty", data: null });
    }
  } catch (error) {
    respond(res, { ok: false, source: "soat", status: "error", message: error.message }, 500);
  }
});

// ============================================
// API: VEHÃCULO (Factiliza)
// ============================================
app.post("/api/vehiculo", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "vehiculo", status: "error", message: "Placa requerida" }, 400);

  try {
    if (!FACTILIZA_TOKEN) {
      return respond(res, { ok: false, source: "vehiculo", status: "error", message: "Token no configurado" }, 500);
    }

    const response = await axios.get(`https://api.factiliza.com/v1/placa/info/${placa}`, {
      headers: { Authorization: FACTILIZA_TOKEN },
      timeout: 10000
    });

    if (response.data && response.data.data) {
      respond(res, { ok: true, source: "vehiculo", status: "success", data: response.data.data });
    } else {
      respond(res, { ok: true, source: "vehiculo", status: "empty", data: null });
    }
  } catch (error) {
    respond(res, { ok: false, source: "vehiculo", status: "error", message: error.message }, 500);
  }
});

// ============================================
// API: SAT LIMA
// ============================================
app.post("/api/lima", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "lima", status: "error", message: "Placa requerida" }, 400);

  const timeouts = normalizeTimeouts('lima');
  let browser;
  
  try {
    console.log(`[SAT LIMA] Iniciando consulta (con captcha) para placa: ${placa}`);
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setupAntiDetection(page);

    console.log(`[SAT LIMA] Navegando a SAT...`);
    await page.goto("https://www.sat.gob.pe/websitev8/Popupv2.aspx?t=8", {
      waitUntil: "domcontentloaded",
      timeout: timeouts.navigation
    });
    await page.waitForTimeout(2000);

    // Buscar iframe (buscar por URL o por presencia de inputs)
    console.log(`[SAT LIMA] Buscando iframe...`);
    let frame = null;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(500);
      const frames = page.frames();
      for (const f of frames) {
        const url = f.url();
        const hasInput = await f.$("#tipoBusquedaPapeletas").catch(() => null);
        if (hasInput || url.includes('sat.gob.pe')) {
          frame = f;
          break;
        }
      }
      if (frame) break;
    }

    if (!frame) {
      console.log(`[SAT LIMA] âŒ Iframe no encontrado`);
      await browser.close();
      return respond(res, { ok: false, source: "lima", status: "error", message: "No se pudo cargar el formulario" });
    }

    console.log(`[SAT LIMA] Iframe encontrado, llenando formulario...`);
    await frame.select("#tipoBusquedaPapeletas", "busqPlaca");
    await frame.waitForSelector("#ctl00_cplPrincipal_txtPlaca", { timeout: timeouts.selector });
    await frame.type("#ctl00_cplPrincipal_txtPlaca", placa, { delay: 100 });

    // Resolver captcha
    console.log(`[SAT LIMA] Resolviendo captcha (puede tardar hasta 2 minutos)...`);
    const siteKey = "6Ldy_wsTAAAAAGYM08RRQAMvF96g9O_SNQ9_hFIJ";
    const pageUrl = "https://www.sat.gob.pe/websitev8/Popupv2.aspx?t=8";
    const token = await resolverRecaptcha(siteKey, pageUrl);

    console.log(`[SAT LIMA] Captcha resuelto, inyectando token...`);
    await frame.evaluate((t) => {
      let textarea = document.getElementById("g-recaptcha-response");
      if (!textarea) {
        textarea = document.createElement("textarea");
        textarea.id = "g-recaptcha-response";
        textarea.name = "g-recaptcha-response";
        textarea.style = "display: none;";
        document.body.appendChild(textarea);
      }
      textarea.value = t;
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }, token);

    console.log(`[SAT LIMA] Enviando formulario...`);
    await frame.evaluate(() => __doPostBack("ctl00$cplPrincipal$CaptchaContinue", ""));
    await page.waitForTimeout(4000);

    // Verificar si hay mensaje de "no encontrado"
    const mensaje = await frame.evaluate(() => {
      const msj = document.querySelector("#ctl00_cplPrincipal_lblMensaje");
      return msj?.innerText.trim().toLowerCase() || "";
    });

    if (mensaje.includes("no se encontraron") || mensaje.includes("sin registros")) {
      console.log(`[SAT LIMA] âœ… Sin registros encontrados`);
      await browser.close();
      return respond(res, { ok: true, source: "lima", status: "empty", data: [], message: "No se encontraron papeletas" });
    }

    // Extraer tabla
    console.log(`[SAT LIMA] Extrayendo datos de tabla...`);
    const tabla = await frame.evaluate(() => {
      const filas = Array.from(document.querySelectorAll("table tr"));
      return filas.slice(1).map((fila) => {
        const celdas = fila.querySelectorAll("td");
        return {
          Placa: celdas[1]?.innerText.trim() || "",
          Reglamento: celdas[2]?.innerText.trim() || "",
          Falta: celdas[3]?.innerText.trim() || "",
          Documento: celdas[4]?.innerText.trim() || "",
          FechaInfraccion: celdas[5]?.innerText.trim() || "",
          Importe: celdas[6]?.innerText.trim() || "",
          Deuda: celdas[9]?.innerText.trim() || "",
          Estado: celdas[10]?.innerText.trim() || ""
        };
      }).filter(r => r.Placa);
    });

    await browser.close();
    console.log(`[SAT LIMA] âœ… Consulta exitosa: ${tabla.length} registros`);
    respond(res, { ok: true, source: "lima", status: tabla.length > 0 ? "warn" : "empty", data: tabla });

  } catch (error) {
    console.error(`[SAT LIMA] âŒ Error:`, error.message);
    if (browser) await browser.close().catch(() => {});
    respond(res, { ok: false, source: "lima", status: "error", message: sanitizeError(error) }, 500);
  }
});

// ============================================
// API: SAT CALLAO - ELIMINADO (reemplazado por CallaoPapeletasScraper)
// El endpoint correcto está más abajo usando CallaoPapeletasScraper
// ============================================

// ============================================
// API: REVISIÃ“N TÃ‰CNICA (MTC CITV) - HTTP ADAPTER
// ============================================
// Endpoint para obtener captcha
app.get("/api/revision/captcha", async (req, res) => {
  try {
    console.log(`[MTC] Obteniendo captcha...`);
    const captcha = await getCitvCaptcha();
    respond(res, {
      ok: true,
      source: "revision",
      status: "success",
      data: { captchaImage: captcha.imageDataUrl }
    });
  } catch (error) {
    console.error(`[MTC] âŒ Error obteniendo captcha:`, error.message);
    respond(res, {
      ok: false,
      source: "revision",
      status: "error",
      message: sanitizeError(error)
    }, 500);
  }
});

// Endpoint para consultar con captcha
app.post("/api/revision", async (req, res) => {
  const { placa, captcha } = req.body;
  if (!placa) return respond(res, { ok: false, source: "revision", status: "error", message: "Placa requerida" }, 400);

  // ============================================
  // NUEVO: Usar scraper final si estÃ¡ disponible
  // ============================================
  if (CAPTCHA_API_KEY) {
    try {
      console.log(`[MTC] Usando scraper final con CAPTCHA automático para: ${placa}`);
      const scraper = new MTCCITVScraper(CAPTCHA_API_KEY);
      const resultado = await scraper.consultarPlaca(placa, 3);
      
      // Convertir formato del scraper al formato esperado por el frontend
      const records = resultado.registros.map(reg => ({
        placa: reg.placa || placa,
        nro_certificado: reg.certificado || '',
        vigencia_inicio: reg.vigente_desde || '',
        vigencia_fin: reg.vigente_hasta || '',
        resultado: reg.resultado || '',
        estado: reg.estado || '',
        razon_social: reg.empresa || '',
        direccion: reg.direccion || '',
        tipo_ambito: reg.ambito || '',
        tipo_servicio: reg.tipo_servicio || '',
        tipo_documento: reg.tipo_documento || '',
        observacion: reg.observaciones || ''
      }));
      
      return respond(res, {
        ok: true,
        source: "revision",
        status: records.length > 0 ? "success" : "empty",
        data: records,
        message: `Se encontraron ${records.length} certificado(s) de inspecciÃ³n tÃ©cnica`
      });
      
    } catch (scraperError) {
      console.error(`[MTC] âŒ Error con scraper final:`, scraperError.message);
      console.log(`[MTC] âš ï¸ Fallback a mÃ©todo anterior...`);
      // Continuar con el mÃ©todo anterior como fallback
    }
  }

  // Si no hay captcha, intentar resolver automÃ¡ticamente con 2Captcha si estÃ¡ configurado
  if (!captcha) {
    // Intentar hasta 3 veces con resoluciÃ³n automÃ¡tica de captcha
    const maxAutoAttempts = CAPTCHA_API_KEY ? 3 : 1;
    
    for (let attempt = 1; attempt <= maxAutoAttempts; attempt++) {
      try {
        console.log(`[MTC] Intento ${attempt}/${maxAutoAttempts}: Obteniendo captcha...`);
        
        // Intentar obtener captcha con HTTP adapter primero, luego Playwright avanzado
        let captchaData;
        try {
          captchaData = await getCitvCaptcha();
        } catch (httpError) {
          console.log(`[MTC] âš ï¸ Error HTTP obteniendo captcha, intentando con Playwright...`);
          try {
            captchaData = await getCitvCaptchaPlaywright();
          } catch (playwrightError) {
            console.log(`[MTC] âš ï¸ Error Playwright bÃ¡sico, intentando Playwright Avanzado...`);
            try {
              captchaData = await getCitvCaptchaAdvanced();
            } catch (advancedError) {
              console.error(`[MTC] âŒ Error Playwright Avanzado obteniendo captcha:`, advancedError.message);
              if (attempt === maxAutoAttempts) {
                throw new Error("No se pudo obtener el captcha despuÃ©s de mÃºltiples intentos");
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
          }
        }
        
        // Si hay 2Captcha configurado, resolver automÃ¡ticamente
        if (CAPTCHA_API_KEY) {
          try {
            console.log(`[MTC] Resolviendo captcha automÃ¡ticamente con 2Captcha (intento ${attempt})...`);
            // Extraer base64 sin prefijo
            const base64Image = captchaData.imageDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
            const captchaResuelto = await resolverCaptchaImagen(base64Image);
            
            console.log(`[MTC] âœ… Captcha resuelto automÃ¡ticamente: ${captchaResuelto}`);
            console.log(`[MTC] Usando captcha inmediatamente para evitar expiraciÃ³n...`);
            
            // Consultar INMEDIATAMENTE con el captcha resuelto (intentar HTTP primero, luego Playwright)
            // No esperar entre resolver y usar para evitar que expire
            let resultado;
            let captchaInvalido = false;
            
            try {
              resultado = await consultCitvByPlaca(placa, captchaResuelto);
            } catch (httpError) {
              console.log(`[MTC] âš ï¸ Error HTTP consultando: ${httpError.message}`);
              
              // Verificar si es error de captcha invÃ¡lido
              if (httpError.message && httpError.message.includes('CAPTCHA_INVALID')) {
                captchaInvalido = true;
                console.log(`[MTC] âš ï¸ Captcha invÃ¡lido en intento ${attempt}/${maxAutoAttempts}`);
                if (attempt < maxAutoAttempts) {
                  console.log(`[MTC] Reintentando con nuevo captcha en 2 segundos...`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  continue; // Reintentar con nuevo captcha
                } else {
                  console.log(`[MTC] âŒ Todos los intentos fallaron, solicitando captcha manual`);
                  return respond(res, {
                    ok: true,
                    source: "revision",
                    status: "captcha_required",
                    message: "El captcha automÃ¡tico fallÃ³ despuÃ©s de mÃºltiples intentos. Por favor resuÃ©lvalo manualmente.",
                    data: { captchaImage: captchaData.imageDataUrl }
                  });
                }
              }
              
              // Si no es captcha invÃ¡lido, intentar con Playwright (puede ser otro tipo de error)
              console.log(`[MTC] Intentando con Playwright...`);
              try {
                resultado = await consultCitvByPlacaPlaywright(placa, captchaResuelto);
              } catch (playwrightError) {
                // Si ambos fallan, verificar si es error de captcha invÃ¡lido
                if (playwrightError.message && playwrightError.message.includes('CAPTCHA_INVALID')) {
                  captchaInvalido = true;
                  console.log(`[MTC] âš ï¸ Captcha invÃ¡lido en intento ${attempt}/${maxAutoAttempts}`);
                  if (attempt < maxAutoAttempts) {
                    console.log(`[MTC] Reintentando con nuevo captcha en 2 segundos...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue; // Reintentar con nuevo captcha
                  } else {
                    console.log(`[MTC] âŒ Todos los intentos fallaron, solicitando captcha manual`);
                    return respond(res, {
                      ok: true,
                      source: "revision",
                      status: "captcha_required",
                      message: "El captcha automÃ¡tico fallÃ³ despuÃ©s de mÃºltiples intentos. Por favor resuÃ©lvalo manualmente.",
                      data: { captchaImage: captchaData.imageDataUrl }
                    });
                  }
                }
                // Si es otro error, intentar con Playwright Avanzado
                console.log(`[MTC] Intentando con Playwright Avanzado (mÃ¡xima evasiÃ³n)...`);
                try {
                  resultado = await consultCitvByPlacaAdvanced(placa, captchaResuelto);
                } catch (advancedError) {
                  throw advancedError;
                }
              }
            }
            
            // Si captcha fue invÃ¡lido, ya se manejÃ³ arriba con continue
            if (captchaInvalido) {
              continue;
            }
            
            // Verificar resultado (puede ser objeto con status)
            if (resultado && resultado.status === 'error') {
              // Si el resultado tiene status error, verificar si es captcha invÃ¡lido
              if (resultado.message && resultado.message.includes('CAPTCHA_INVALID')) {
                console.log(`[MTC] âš ï¸ Captcha invÃ¡lido en intento ${attempt}/${maxAutoAttempts}`);
                if (attempt < maxAutoAttempts) {
                  console.log(`[MTC] Reintentando con nuevo captcha en 2 segundos...`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  continue; // Reintentar con nuevo captcha
                } else {
                  console.log(`[MTC] âŒ Todos los intentos fallaron, solicitando captcha manual`);
                  return respond(res, {
                    ok: true,
                    source: "revision",
                    status: "captcha_required",
                    message: "El captcha automÃ¡tico fallÃ³ despuÃ©s de mÃºltiples intentos. Por favor resuÃ©lvalo manualmente.",
                    data: { captchaImage: captchaData.imageDataUrl }
                  });
                }
              }
            }
            
            // Procesar resultado exitoso
            console.log(`[MTC] âœ… Consulta exitosa con captcha automÃ¡tico!`);
            return processCitvResult(res, resultado, placa);
            
          } catch (autoError) {
            console.log(`[MTC] âš ï¸ Error en resoluciÃ³n automÃ¡tica (intento ${attempt}):`, autoError.message);
            if (attempt < maxAutoAttempts) {
              await new Promise(resolve => setTimeout(resolve, 3000));
              continue;
            }
            // Si todos los intentos fallaron y no hay 2Captcha, devolver captcha manual
          }
        }
        
        // Si no hay 2Captcha o fallÃ³, devolver captcha para resoluciÃ³n manual (solo en Ãºltimo intento)
        if (attempt === maxAutoAttempts) {
          return respond(res, {
            ok: true,
            source: "revision",
            status: "captcha_required",
            message: CAPTCHA_API_KEY 
              ? "No se pudo resolver el captcha automÃ¡ticamente. Por favor resuÃ©lvalo manualmente."
              : "Se requiere resolver el captcha (configure CAPTCHA_API_KEY para resoluciÃ³n automÃ¡tica)",
            data: { captchaImage: captchaData.imageDataUrl }
          });
        }
        
      } catch (error) {
        console.error(`[MTC] âŒ Error en intento ${attempt}:`, error.message);
        if (attempt === maxAutoAttempts) {
          return respond(res, {
            ok: false,
            source: "revision",
            status: "error",
            message: sanitizeError(error)
          }, 500);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  try {
    console.log(`[MTC] Consultando CITV para placa: ${placa} (captcha manual)`);
    let resultado;
    try {
      resultado = await consultCitvByPlaca(placa, captcha);
    } catch (httpError) {
      console.log(`[MTC] âš ï¸ Error HTTP, intentando con Playwright...`);
      try {
        resultado = await consultCitvByPlacaPlaywright(placa, captcha);
      } catch (playwrightError) {
        console.log(`[MTC] âš ï¸ Error Playwright bÃ¡sico, intentando Playwright Avanzado...`);
        resultado = await consultCitvByPlacaAdvanced(placa, captcha);
      }
    }

    return processCitvResult(res, resultado, placa);

  } catch (error) {
    console.error(`[MTC] âŒ Error:`, error.message);
    console.error(`[MTC] Stack:`, error.stack);
    
    // Detectar errores de parseo JSON (HTML en lugar de JSON)
    if (error.message.includes('Unexpected token') || 
        error.message.includes('is not valid JSON') ||
        error.message.includes('JSON') && error.message.includes('parse')) {
      console.error(`[MTC] âš ï¸ Error de parseo JSON detectado - El servidor MTC puede estar bloqueando o devolviendo HTML`);
      return respond(res, {
        ok: false,
        source: "revision",
        status: "error",
        message: "El servicio MTC estÃ¡ devolviendo una respuesta inesperada. Puede estar bloqueando consultas automatizadas o experimentando problemas tÃ©cnicos. Por favor intente mÃ¡s tarde."
      }, 503);
    }
    
    // Si el error es captcha invÃ¡lido, devolver nuevo captcha
    if (error.message.includes('CAPTCHA_INVALID')) {
      try {
        const captchaData = await getCitvCaptcha();
        return respond(res, {
          ok: true,
          source: "revision",
          status: "captcha_required",
          message: "El captcha ingresado es invÃ¡lido. Por favor intente nuevamente.",
          data: { captchaImage: captchaData.imageDataUrl }
        });
      } catch (captchaError) {
        return respond(res, {
          ok: false,
          source: "revision",
          status: "error",
          message: sanitizeError(captchaError)
        }, 500);
      }
    }

    if (error.message.includes('BLOCKED_OR_RATE_LIMITED')) {
      return respond(res, {
        ok: false,
        source: "revision",
        status: "error",
        message: "Servicio bloquea consultas automatizadas temporalmente"
      }, 503);
    }

    if (error.message.includes('MTC_SERVICE_ERROR') || error.message.includes('MTC_ERROR: -2')) {
      return respond(res, {
        ok: false,
        source: "revision",
        status: "error",
        message: "El servicio MTC no estÃ¡ disponible temporalmente. Por favor intente mÃ¡s tarde."
      }, 503);
    }

    // Si el error contiene "MTC_ERROR", sanitizarlo
    if (error.message.includes('MTC_ERROR')) {
      return respond(res, {
        ok: false,
        source: "revision",
        status: "error",
        message: "El servicio MTC no estÃ¡ disponible temporalmente. Por favor intente mÃ¡s tarde."
      }, 503);
    }

    respond(res, {
      ok: false,
      source: "revision",
      status: "error",
      message: sanitizeError(error)
    }, 500);
  }
});

/**
 * Procesar resultado de CITV y devolver respuesta formateada
 */
function processCitvResult(res, resultado, placa) {
  if (resultado.status === 'empty' || !resultado.records || resultado.records.length === 0) {
    return respond(res, {
      ok: true,
      source: "revision",
      status: "empty",
      data: null,
      message: "No se encontraron certificados de inspecciÃ³n tÃ©cnica"
    });
  }

  // Adaptar records al formato esperado por el frontend
  const records = resultado.records.map(record => ({
    placa: record.placa || placa,
    nro_certificado: record.nro_certificado || record.certificado || '',
    vigencia_inicio: record.vigencia_inicio || record.vigente_desde || '',
    vigencia_fin: record.vigencia_fin || record.vigente_hasta || '',
    resultado: record.resultado || '',
    estado: record.estado || '',
    razon_social: record.razon_social || record.empresa || '',
    direccion: record.direccion || '',
    tipo_ambito: record.tipo_ambito || record.ambito || '',
    tipo_servicio: record.tipo_servicio || '',
    tipo_documento: record.tipo_documento || '',
    observacion: record.observacion || record.observaciones || ''
  }));

  // Si solo hay un registro, devolverlo como objeto simple
  if (records.length === 1) {
    const record = records[0];
    const status = (record.resultado || '').toLowerCase().includes('aprobado') ? 'success' : 'warn';
    console.log(`[MTC] âœ… Consulta exitosa: 1 certificado encontrado`);
    return respond(res, {
      ok: true,
      source: "revision",
      status,
      data: record
    });
  }

  // Si hay mÃºltiples registros, devolver como array
  console.log(`[MTC] âœ… Consulta exitosa: ${records.length} certificados encontrados`);
  return respond(res, {
    ok: true,
    source: "revision",
    status: "success",
    data: records
  });
}

// ============================================
// API: SINIESTROS (SBS) - PUPPETEER (MÃS CONFIABLE)
// ============================================
app.post("/api/siniestro", async (req, res) => {
  const { placa, useManual = false } = req.body;
  if (!placa) return respond(res, { ok: false, source: "siniestro", status: "error", message: "Placa requerida" }, 400);

  // Usar scraper optimizado (similar a MTC) para velocidad
  try {
    console.log(`[SINIESTRO] Consulta optimizada para placa: ${placa}`);
    
    // Intentar primero con scraper optimizado (rÃ¡pido como MTC)
    try {
      const SBSSOATScraper = require('./sbs-scraper-final');
      const scraper = new SBSSOATScraper();
      const resultado = await scraper.consultarPlaca(placa, 2); // 2 intentos mÃ¡ximo
      
      console.log(`[SINIESTRO] Resultado del scraper:`, JSON.stringify(resultado, null, 2).substring(0, 500));
      
      // El scraper devuelve { success: true, placa, polizas, accidentes_ultimos_5_anios, ... }
      if (!resultado || !resultado.success) {
        throw new Error('Scraper no devolviÃ³ resultado exitoso');
      }
      
      // Adaptar respuesta al formato esperado por el frontend
      const accidentes = resultado.accidentes_ultimos_5_anios || 0;
      const status = accidentes > 0 ? "warn" : "success";

      // Si no hay pÃ³lizas, devolver empty
      if (!resultado.polizas || resultado.polizas.length === 0) {
        console.log(`[SINIESTRO] No hay pÃ³lizas, devolviendo empty`);
        return respond(res, {
          ok: true,
          source: "siniestro",
          status: "empty",
          data: null,
          message: "No se encontraron registros de SOAT"
        });
      }

      // Formatear datos para el frontend
      const data = {
        placa: resultado.placa || placa,
        fechaConsulta: resultado.fecha_consulta || new Date().toISOString(),
        fechaActualizacion: resultado.fecha_actualizacion || '',
        cantidadAccidentes: accidentes.toString(),
        polizas: resultado.polizas || []
      };

      console.log(`[SINIESTRO] âœ… Consulta exitosa (scraper optimizado): ${accidentes} accidentes, ${resultado.polizas.length} pÃ³lizas`);
      console.log(`[SINIESTRO] ðŸ“¤ Enviando respuesta al frontend...`);
      return respond(res, { ok: true, source: "siniestro", status, data });
      
    } catch (scraperError) {
      console.error(`[SINIESTRO] âš ï¸ Scraper optimizado fallÃ³:`, scraperError.message);
      console.error(`[SINIESTRO] âš ï¸ Stack:`, scraperError.stack);
      console.log(`[SINIESTRO] âš ï¸ Fallback a mÃ©todo HTTP...`);
      // Continuar con mÃ©todo HTTP como fallback
    }
    
    // Fallback: usar HTTP (mÃ¡s rÃ¡pido) - configuraciÃ³n original que funcionaba
    console.log(`[SINIESTRO] Consulta HTTP para placa: ${placa}`);
    const resultado = await consultSbsSoat(placa);

    // Adaptar respuesta al formato esperado por el frontend
    const accidentes = resultado.accidentes_ultimos_5_anios || 0;
    const status = accidentes > 0 ? "warn" : "success";

    // Si no hay pÃ³lizas, devolver empty
    if (!resultado.polizas || resultado.polizas.length === 0) {
      return respond(res, {
        ok: true,
        source: "siniestro",
        status: "empty",
        data: null,
        message: "No se encontraron registros de SOAT"
      });
    }

    // Formatear datos para el frontend
    const data = {
      placa: resultado.placa,
      fechaConsulta: resultado.fecha_consulta,
      fechaActualizacion: resultado.fecha_actualizacion,
      cantidadAccidentes: accidentes.toString(),
      polizas: resultado.polizas
    };

    console.log(`[SINIESTRO] âœ… Consulta exitosa: ${accidentes} accidentes, ${resultado.polizas.length} pÃ³lizas`);
    return respond(res, { ok: true, source: "siniestro", status, data });

  } catch (error) {
    console.error(`[SINIESTRO] âŒ Error:`, error.message);
    
    // Mensaje de error claro
    let errorMessage = "Error al consultar el servicio SBS. Por favor intente mÃ¡s tarde.";
    
    if (error.message.includes('SELECTOR_MISSING')) {
      errorMessage = "El portal cambiÃ³ su estructura. Contacte al administrador.";
    } else if (error.message.includes('BLOCKED_OR_RATE_LIMITED')) {
      errorMessage = "El servicio bloquea consultas automatizadas temporalmente";
    } else if (error.message.includes('CAPTCHA_INVALID')) {
      errorMessage = "Error de validaciÃ³n. Por favor intente nuevamente.";
    } else if (error.message.includes('HTTP 4') || error.message.includes('HTTP 5')) {
      errorMessage = "Error al conectar con el servicio SBS. Por favor intente mÃ¡s tarde.";
    } else if (error.response) {
      errorMessage = `Error del servicio SBS (${error.response.status}). Por favor intente mÃ¡s tarde.`;
    }
    
    return respond(res, {
      ok: false,
      source: "siniestro",
      status: "error",
      message: errorMessage
    }, 503);
  }
});


/**
 * Consultar SBS usando Puppeteer (permite resoluciÃ³n manual de captcha)
 */
async function consultSbsWithPuppeteer(req, res, placa) {
  const timeouts = normalizeTimeouts('siniestro');
  let browser;
  
  try {
    console.log(`[SINIESTRO] Iniciando consulta Puppeteer para placa: ${placa}`);
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setupAntiDetection(page);

    console.log(`[SINIESTRO] Navegando a SBS...`);
    await page.goto("https://servicios.sbs.gob.pe/reportesoat/BusquedaPlaca", {
      waitUntil: "networkidle2",
      timeout: timeouts.navigation
    });
    await page.waitForTimeout(3000); // Esperar carga JS y reCAPTCHA

    // Buscar y llenar input de placa
    console.log(`[SINIESTRO] Buscando input de placa...`);
    const inputSelectors = [
      '#ctl00_MainBodyContent_txtPlaca',
      'input[name="ctl00$MainBodyContent$txtPlaca"]',
      'input[id*="txtPlaca" i]',
      'input[type="text"]'
    ];
    
    try {
      await typeIntoFirst(page, inputSelectors, placa);
    } catch (e) {
      console.log(`[SINIESTRO] No se encontrÃ³ input: ${e.message}`);
      await browser.close();
      return respond(res, { 
        ok: false, 
        source: "siniestro", 
        status: "error", 
        message: "No se pudo acceder al formulario" 
      });
    }

    // Seleccionar opciÃ³n SOAT si hay radio buttons
    try {
      await page.evaluate(() => {
        const radioSoat = document.querySelector('input[value="Soat"][type="radio"]');
        if (radioSoat) radioSoat.click();
      });
      await page.waitForTimeout(500);
    } catch (e) {
      console.log(`[SINIESTRO] No se pudo seleccionar opciÃ³n SOAT: ${e.message}`);
    }

    // Esperar a que reCAPTCHA v3 se ejecute automÃ¡ticamente (puede tardar 5-10s)
    console.log(`[SINIESTRO] Esperando reCAPTCHA v3 (puede tardar hasta 10s)...`);
    await page.waitForTimeout(5000);

    // Verificar si hay token de reCAPTCHA
    const recaptchaToken = await page.evaluate(() => {
      const hdn = document.querySelector('input[name="ctl00$MainBodyContent$hdnReCaptchaV3"]');
      return hdn ? hdn.value : null;
    });

    if (!recaptchaToken || recaptchaToken.length < 50) {
      console.log(`[SINIESTRO] âš ï¸ Token reCAPTCHA v3 no encontrado o invÃ¡lido, esperando mÃ¡s tiempo...`);
      await page.waitForTimeout(5000);
    }

    // Hacer click en botÃ³n Consultar
    console.log(`[SINIESTRO] Buscando botÃ³n de consulta...`);
    const buttonSelectors = [
      '#ctl00_MainBodyContent_btnIngresarPla',
      'input[name="ctl00$MainBodyContent$btnIngresarPla"]',
      'input[type="submit"]',
      'button[type="submit"]',
      '//input[@value="Consultar"]'
    ];
    
    const clicked = await clickFirst(page, buttonSelectors);
    if (!clicked) {
      console.log(`[SINIESTRO] BotÃ³n no encontrado, presionando Enter...`);
      await page.keyboard.press('Enter');
    }

    // Esperar resultados (puede tardar si hay captcha)
    console.log(`[SINIESTRO] Esperando resultados...`);
    await page.waitForTimeout(timeouts.processing);

    // Verificar si redirigiÃ³ a la pÃ¡gina de resultados
    const currentUrl = page.url();
    if (!currentUrl.includes('ReporteCentralRiesgo')) {
      // Esperar redirect
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
      } catch (e) {
        console.log(`[SINIESTRO] No hubo redirect, verificando si hay mensaje de error...`);
      }
    }

    // Verificar si hay mensaje de "no encontrado"
    const noRecords = await detectNoRecords(page);
    if (noRecords.isEmpty) {
      await browser.close();
      return respond(res, { 
        ok: true, 
        source: "siniestro", 
        status: "empty", 
        data: null, 
        message: noRecords.message || "No se encontraron registros" 
      });
    }

    // Extraer datos de la pÃ¡gina de resultados
    console.log(`[SINIESTRO] Extrayendo datos...`);
    const resultado = await page.evaluate(() => {
      const data = {};
      
      // Datos principales
      const placaEl = document.querySelector('#ctl00_MainBodyContent_placa');
      const fechaConsultaEl = document.querySelector('#ctl00_MainBodyContent_fecha_consulta');
      const fechaActEl = document.querySelector('#ctl00_MainBodyContent_fecha_act');
      const cantidadEl = document.querySelector('#ctl00_MainBodyContent_cantidad');
      
      data.placa = placaEl ? placaEl.textContent.trim() : '';
      data.fecha_consulta = fechaConsultaEl ? fechaConsultaEl.textContent.trim() : '';
      data.fecha_actualizacion = fechaActEl ? fechaActEl.textContent.trim() : '';
      data.accidentes_ultimos_5_anios = cantidadEl ? parseInt(cantidadEl.textContent.trim() || '0', 10) : 0;
      
      // Tabla de pÃ³lizas
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

    if (!resultado.polizas || resultado.polizas.length === 0) {
      return respond(res, { 
        ok: true, 
        source: "siniestro", 
        status: "empty", 
        data: null,
        message: "No se encontraron registros de SOAT"
      });
    }

    // Normalizar fechas
    const normalizeDate = (dateStr) => {
      if (!dateStr) return dateStr;
      const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        const [, day, month, year] = match;
        return `${year}-${month}-${day}`;
      }
      return dateStr;
    };

    const normalizeDateTime = (dateStr) => {
      if (!dateStr) return dateStr;
      const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, day, month, year, hour, minute, second] = match;
        return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
      }
      return normalizeDate(dateStr);
    };

    const accidentes = resultado.accidentes_ultimos_5_anios || 0;
    const status = accidentes > 0 ? "warn" : "success";

    const data = {
      placa: resultado.placa || placa.toUpperCase(),
      fechaConsulta: normalizeDateTime(resultado.fecha_consulta) || new Date().toISOString(),
      fechaActualizacion: resultado.fecha_actualizacion || '',
      cantidadAccidentes: accidentes.toString(),
      polizas: resultado.polizas.map(p => ({
        ...p,
        inicio_vigencia: normalizeDate(p.inicio_vigencia),
        fin_vigencia: normalizeDate(p.fin_vigencia)
      }))
    };

    console.log(`[SINIESTRO] âœ… Consulta exitosa (Puppeteer): ${accidentes} accidentes, ${resultado.polizas.length} pÃ³lizas`);
    respond(res, { ok: true, source: "siniestro", status, data });

  } catch (error) {
    console.error(`[SINIESTRO] âŒ Error Puppeteer:`, error.message);
    if (browser) await browser.close().catch(() => {});
    respond(res, {
      ok: false,
      source: "siniestro",
      status: "error",
      message: sanitizeError(error)
    }, 500);
  }
}

// ============================================
// API: ORDEN DE CAPTURA
// ============================================
app.post("/api/orden-captura", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "orden-captura", status: "error", message: "Placa requerida" }, 400);

  // Placeholder - implementar segÃºn lÃ³gica original
  respond(res, { ok: true, source: "orden-captura", status: "empty", data: null, message: "Sin Ã³rdenes de captura registradas" });
});

// ============================================
// API: IMPUESTO VEHICULAR
// ============================================
app.post("/api/impuesto", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "impuesto", status: "error", message: "Placa requerida" }, 400);

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.goto("https://www.sat.gob.pe/pagosenlinea/", { waitUntil: "networkidle2", timeout: 30000 });

    await page.select("#strTipDoc", "3");
    await page.type("#strNumDoc", placa);

    const siteKey = "6Ldy_wsTAAAAAGYM08RRQAMvF96g9O_SNQ9_hFIJ";
    const token = await resolverRecaptcha(siteKey, "https://www.sat.gob.pe/pagosenlinea/");

    await page.evaluate((t) => {
      document.getElementById("g-recaptcha-response").value = t;
    }, token);

    await page.click("button.btn.btn-primary");
    await page.waitForSelector("#divimpuestos", { timeout: 30000 });

    const deuda = await page.evaluate(() => {
      return {
        placa: document.querySelector("#valordoc")?.innerText.trim() || "",
        total: document.querySelector("#montototal")?.innerText.trim() || "S/ 0.00"
      };
    });

    await browser.close();
    respond(res, { ok: true, source: "impuesto", status: "success", data: deuda });

  } catch (error) {
    if (browser) await browser.close();
    respond(res, { ok: false, source: "impuesto", status: "error", message: sanitizeError(error) }, 500);
  }
});

// ============================================
// API: IMPUESTO VEHICULAR SAT LIMA (NUEVO)
// ============================================
app.post("/api/impuesto-vehicular", async (req, res) => {
  const { placa, debug } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "impuesto-vehicular", status: "error", message: "Placa requerida" }, 400);
  }

  console.log(`\n[IMPUESTO VEHICULAR] Iniciando consulta para placa: ${placa}`);

  try {
    if (debug === true) {
      process.env.SCRAPER_DEBUG = 'true';
      console.log('[IMPUESTO VEHICULAR] 🧩 SCRAPER_DEBUG habilitado (se guardarán dumps en /screenshots)');
    }

    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    if (!CAPTCHA_API_KEY) {
      console.log('[IMPUESTO VEHICULAR] ⚠️ API Key de 2Captcha no configurada');
    }

    const scraper = new ImpuestoVehicularScraper(CAPTCHA_API_KEY, { debug: debug === true });
    const resultado = await scraper.consultarPlaca(placa, 2);

    console.log(`[IMPUESTO VEHICULAR] ✅ Resultado obtenido:`);
    console.log(`[IMPUESTO VEHICULAR]    Success: ${resultado.success}`);
    console.log(`[IMPUESTO VEHICULAR]    Encontrado: ${resultado.encontrado}`);
    console.log(`[IMPUESTO VEHICULAR]    Datos: ${resultado.datos?.length || 0} registros`);

    if (!resultado.success) {
      return respond(res, {
        ok: true,
        source: "impuesto-vehicular",
        status: "empty",
        data: {
          placa: placa,
          encontrado: false,
          mensaje: resultado.mensaje || "No se encontró información"
        },
        message: resultado.mensaje || "No se encontró información"
      });
    }

    if (!resultado.encontrado || !resultado.datos || resultado.datos.length === 0) {
      return respond(res, {
        ok: true,
        source: "impuesto-vehicular",
        status: "empty",
        data: {
          placa: placa,
          encontrado: false,
          mensaje: resultado.mensaje || "Se encontraron 0 coincidencias para su búsqueda."
        },
        message: resultado.mensaje || "Se encontraron 0 coincidencias para su búsqueda."
      });
    }

    return respond(res, {
      ok: true,
      source: "impuesto-vehicular",
      status: "success",
      data: {
        placa: resultado.placa || placa,
        encontrado: true,
        datos: resultado.datos,
        detalle: resultado.detalle || [],
        mensaje: "Consulta exitosa"
      },
      message: "Información de impuesto vehicular obtenida correctamente"
    });

  } catch (error) {
    console.error('[IMPUESTO VEHICULAR] ❌ Error:', error);
    return respond(res, {
      ok: true,
      source: "impuesto-vehicular",
      status: "empty",
      data: {
        placa: placa,
        encontrado: false,
        mensaje: "Error al consultar impuesto vehicular"
      },
      message: error.message || "Error al consultar impuesto vehicular"
    }, 200);
  }
});

// ============================================
// API: PIT - FOTO PAPELETAS (ESTADO DE CUENTA VELOCIDAD)
// ============================================
app.post("/api/pit-foto", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "pit-foto", status: "error", message: "Placa requerida" }, 400);
  }

  req.setTimeout(180000); // 3 minutos

  try {
    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    const scraper = new PitFotoScraper(CAPTCHA_API_KEY);
    const resultado = await scraper.consultarPlaca(placa);

    const papeletas = resultado?.papeletas || [];
    const encontrado = Array.isArray(papeletas) && papeletas.length > 0;
    const mensaje = resultado?.mensaje || (encontrado ? `Se encontraron ${papeletas.length} papeleta(s)` : "Sin registros");

    if (!encontrado) {
      return respond(res, {
        ok: true,
        source: "pit-foto",
        status: "empty",
        data: {
          placa: (resultado?.placa || placa).toUpperCase(),
          encontrado: false,
          papeletas: [],
          mensaje
        },
        message: mensaje
      });
    }

    return respond(res, {
      ok: true,
      source: "pit-foto",
      status: "success",
      data: {
        placa: (resultado?.placa || placa).toUpperCase(),
        encontrado: true,
        papeletas,
        total: papeletas.length,
        mensaje
      },
      message: "Información PIT obtenida correctamente"
    });
  } catch (error) {
    console.error('[PIT-FOTO] Error en endpoint:', error);
    const msg = error.message || 'Error consultando PIT';
    return respond(res, {
      ok: true,
      source: "pit-foto",
      status: "empty",
      data: {
        placa: placa.toUpperCase(),
        encontrado: false,
        papeletas: [],
        mensaje: msg
      },
      message: msg
    });
  }
});

// ============================================
// API: PUNO - PAPELETAS (munipuno.gob.pe)
// ============================================
app.post("/api/puno", async (req, res) => {
  const { placa, debug } = req.body || {};
  if (!placa) {
    return respond(res, { ok: false, source: "puno", status: "error", message: "Placa requerida" }, 400);
  }

  req.setTimeout(120000); // 2 minutos

  try {
    const scraper = new PunoPapeletasScraper({ debug: debug === true });
    const resultado = await scraper.consultarPlaca(placa, 2);

    if (!resultado.success || !resultado.encontrado || !resultado.papeletas || resultado.papeletas.length === 0) {
      return respond(res, {
        ok: true,
        source: "puno",
        status: "empty",
        data: {
          placa: (resultado.placa || placa).toUpperCase(),
          encontrado: false,
          papeletas: [],
          mensaje: resultado.mensaje || "No existe esta placa en el sistema"
        },
        message: resultado.mensaje || "No existe esta placa en el sistema"
      }, 200);
    }

    return respond(res, {
      ok: true,
      source: "puno",
      status: "success",
      data: {
        placa: (resultado.placa || placa).toUpperCase(),
        encontrado: true,
        papeletas: resultado.papeletas || [],
        total: resultado.papeletas?.length || 0,
        mensaje: resultado.mensaje || "Consulta exitosa"
      },
      message: resultado.mensaje || "Consulta exitosa"
    }, 200);
  } catch (error) {
    console.error('[PUNO] ❌ Error:', error);
    return respond(res, {
      ok: true,
      source: "puno",
      status: "empty",
      data: {
        placa: String(placa).toUpperCase(),
        encontrado: false,
        papeletas: [],
        mensaje: "Error al consultar Puno"
      },
      message: error.message || "Error al consultar Puno"
    }, 200);
  }
});

// ============================================
// ENDPOINT: PLACAS.PE - Estado de Placa
// ============================================
app.post("/api/placas-pe", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "placas-pe", status: "error", message: "Placa requerida" }, 400);
  }

  console.log(`\n[PLACAS.PE] Iniciando consulta para placa: ${placa}`);

  try {
    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    if (!CAPTCHA_API_KEY) {
      console.log('[PLACAS.PE] ⚠️ API Key de 2Captcha no configurada');
    }

    // Usar directamente el scraper de Node.js (más rápido y confiable)
    console.log('[PLACAS.PE] 🚀 Usando scraper Node.js...');
    const scraper = new PlacasPeScraper(CAPTCHA_API_KEY);
    const resultado = await scraper.consultarPlaca(placa, 2);

    console.log(`[PLACAS.PE] ✅ Resultado obtenido:`);
    console.log(`[PLACAS.PE]    Success: ${resultado.success}`);
    console.log(`[PLACAS.PE]    Encontrado: ${resultado.encontrado}`);
    console.log(`[PLACAS.PE]    StatusDescription: ${resultado.statusDescription || 'null'}`);
    console.log(`[PLACAS.PE]    SerialNumber: ${resultado.serialNumber || 'null'}`);
    console.log(`[PLACAS.PE]    Brand: ${resultado.brand || 'null'}`);
    console.log(`[PLACAS.PE]    Model: ${resultado.model || 'null'}`);
    console.log(`[PLACAS.PE]    OwnerCompleteName: ${resultado.ownerCompleteName || 'null'}`);
    console.log(`[PLACAS.PE]    PlateNew: ${resultado.plateNew || 'null'}`);
    console.log(`[PLACAS.PE]    DeliveryPoint: ${resultado.deliveryPoint || 'null'}`);
    console.log(`[PLACAS.PE]    StartDate: ${resultado.startDate || 'null'}`);
    console.log(`[PLACAS.PE]    InsertDate: ${resultado.insertDate || 'null'}`);
    console.log(`[PLACAS.PE]    Status: ${resultado.status || 'null'}`);
    console.log(`[PLACAS.PE]    Mensaje: ${resultado.mensaje || 'null'}`);
    console.log(`[PLACAS.PE]    Resultado completo:`, JSON.stringify(resultado, null, 2));

    if (!resultado.success) {
      return respond(res, {
        ok: true,
        source: "placas-pe",
        status: "empty",
        data: {
          placa: placa,
          encontrado: false,
          mensaje: resultado.mensaje || "No se encontró información"
        },
        message: resultado.mensaje || "No se encontró información"
      });
    }

    if (!resultado.encontrado) {
      return respond(res, {
        ok: true,
        source: "placas-pe",
        status: "empty",
        data: {
          placa: placa,
          encontrado: false,
          mensaje: resultado.mensaje || "No se encontró información para esta placa"
        },
        message: resultado.mensaje || "No se encontró información para esta placa"
      });
    }

    return respond(res, {
      ok: true,
      source: "placas-pe",
      status: "success",
      data: {
        placa: resultado.placa || placa,
        encontrado: true,
        statusDescription: resultado.statusDescription || null,
        serialNumber: resultado.serialNumber || null,
        brand: resultado.brand || null,
        model: resultado.model || null,
        ownerCompleteName: resultado.ownerCompleteName || null,
        plateNew: resultado.plateNew || null,
        deliveryPoint: resultado.deliveryPoint || null,
        startDate: resultado.startDate || null,
        insertDate: resultado.insertDate || null,
        description: resultado.description || null,
        status: resultado.status || null,
        mensaje: "Consulta exitosa"
      },
      message: "Información de estado de placa obtenida correctamente"
    });

  } catch (error) {
    console.error('[PLACAS.PE] ❌ Error:', error);
    return respond(res, {
      ok: true,
      source: "placas-pe",
      status: "empty",
      data: {
        placa: placa,
        encontrado: false,
        mensaje: "Error al consultar estado de placa"
      },
      message: error.message || "Error al consultar estado de placa"
    }, 500);
  }
});

  // ============================================
  // API: INFOGAS - MEJORADO (DESHABILITADO - USAR EL NUEVO ENDPOINT MÁS ABAJO)
  // ============================================
  /*
  app.post("/api/infogas-old", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "infogas", status: "error", message: "Placa requerida" }, 400);

  const timeouts = normalizeTimeouts('infogas');
  let browser;
  
  try {
    console.log(`[INFOGAS] Iniciando consulta para placa: ${placa}`);
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setupAntiDetection(page);

    await page.goto("https://vh.infogas.com.pe/", {
      waitUntil: "networkidle2",
      timeout: timeouts.navigation
    });
    await page.waitForTimeout(2000);

    // Buscar input
    const inputSelectors = ['#placa', 'input[name="placa"]', 'input[id*="placa" i]'];
    try {
      await typeIntoFirst(page, inputSelectors, placa);
    } catch (e) {
      const noRecords = await detectNoRecords(page);
      await browser.close();
      if (noRecords.isEmpty) {
        return respond(res, { ok: true, source: "infogas", status: "empty", data: null, message: noRecords.message });
      }
      return respond(res, { ok: true, source: "infogas", status: "empty", data: null });
    }

    // Buscar botÃ³n
    const buttonSelectors = ['#btnConsultar', 'button[type="submit"]', '//button[contains(text(), "Consultar")]'];
    const clicked = await clickFirst(page, buttonSelectors);
    if (!clicked) {
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(timeouts.processing);

    // Verificar "sin datos"
    const noRecords = await detectNoRecords(page);
    if (noRecords.isEmpty) {
      await browser.close();
      return respond(res, { ok: true, source: "infogas", status: "empty", data: null, message: noRecords.message || "No se encontraron registros" });
    }

    // Extraer datos (sin :contains)
    const resultado = await page.evaluate(() => {
      const getDataByLabel = (label) => {
        const allTds = Array.from(document.querySelectorAll('td'));
        for (let i = 0; i < allTds.length; i++) {
          if (allTds[i].innerText.toLowerCase().includes(label.toLowerCase())) {
            const nextTd = allTds[i + 1];
            if (nextTd) return nextTd.innerText.trim();
          }
        }
        return "-";
      };
      
      return {
        tipoCombustible: document.querySelector("#tipoCombustible")?.innerText.trim() || getDataByLabel('tipo') || "-",
        habilitado: document.querySelector("#habilitado")?.innerText.trim() || getDataByLabel('habilitado') || "-",
        tieneCredito: document.querySelector("#tieneCredito")?.innerText.trim() || getDataByLabel('credito') || "-"
      };
    });

    await browser.close();
    console.log(`[INFOGAS] âœ… Consulta exitosa`);
    respond(res, { ok: true, source: "infogas", status: "success", data: resultado });

  } catch (error) {
    console.error(`[INFOGAS] âŒ Error:`, error.message);
    if (browser) await browser.close().catch(() => {});
    respond(res, { ok: false, source: "infogas", status: "error", message: sanitizeError(error) }, 500);
  }
});
*/

// ============================================
// API: ATU - MEJORADO
// ============================================
app.post("/api/atu", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "atu", status: "error", message: "Placa requerida" }, 400);

  const timeouts = normalizeTimeouts('atu');
  let browser;
  
  try {
    console.log(`[ATU] Iniciando consulta para placa: ${placa}`);
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setupAntiDetection(page);

    await page.goto("https://sistemas.atu.gob.pe/ConsultaVehiculo/", {
      waitUntil: "networkidle2",
      timeout: timeouts.navigation
    });
    await page.waitForTimeout(2000);

    // Buscar input
    const inputSelectors = ['#txtPlaca', 'input[name*="placa" i]', 'input[id*="placa" i]'];
    try {
      await typeIntoFirst(page, inputSelectors, placa);
    } catch (e) {
      const noRecords = await detectNoRecords(page);
      await browser.close();
      if (noRecords.isEmpty) {
        return respond(res, { ok: true, source: "atu", status: "empty", data: null, message: noRecords.message || "No se encontraron registros" });
      }
      return respond(res, { ok: true, source: "atu", status: "empty", data: null });
    }

    // Buscar botÃ³n
    const buttonSelectors = ['#btnBuscar', 'button[type="submit"]', '//button[contains(text(), "Buscar")]'];
    const clicked = await clickFirst(page, buttonSelectors);
    if (!clicked) {
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(timeouts.processing);

    // Verificar "sin datos"
    const noRecords = await detectNoRecords(page);
    if (noRecords.isEmpty) {
      await browser.close();
      return respond(res, { ok: true, source: "atu", status: "empty", data: null, message: noRecords.message || "Placa no registrada en ATU" });
    }

    const registrado = await page.evaluate(() => {
      return {
        placa: document.querySelector("#lblPlaca")?.innerText.trim() || "",
        modalidad: document.querySelector("#lblModalidad")?.innerText.trim() || "",
        estado: document.querySelector("#lblEstado")?.innerText.trim() || ""
      };
    });

    await browser.close();

    if (!registrado.placa) {
      return respond(res, { ok: true, source: "atu", status: "empty", data: null, message: "Placa no registrada en ATU" });
    }

    console.log(`[ATU] âœ… Consulta exitosa`);
    respond(res, { ok: true, source: "atu", status: "success", data: registrado });

  } catch (error) {
    console.error(`[ATU] âŒ Error:`, error.message);
    if (browser) await browser.close().catch(() => {});
    respond(res, { ok: false, source: "atu", status: "error", message: sanitizeError(error) }, 500);
  }
});

// ============================================
// API: AREQUIPA - PAPELETAS (VERSIÃ“N MEJORADA)
// SIGUIENDO EL PATRÃ“N DE SAT Y SUTRAN
// ============================================
app.post("/api/arequipa", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("[AREQUIPA] ========== NUEVA PETICIÃ“N ==========");
  console.log("[AREQUIPA] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(60) + "\n");
  
  const { placa } = req.body;
  
  if (!placa) {
    console.log("[AREQUIPA] âŒ Placa no proporcionada en body");
    return respond(res, { ok: false, source: "arequipa", status: "error", message: "Placa requerida" }, 400);
  }

  try {
    console.log(`[AREQUIPA] âœ… Placa recibida: ${placa}`);
    console.log(`[AREQUIPA] Iniciando consulta...`);
    
    let resultado = null;
    
    try {
      let ArequipaScraper;
      try {
        ArequipaScraper = require('./arequipa-scraper');
        console.log(`[AREQUIPA] âœ… MÃ³dulo cargado correctamente`);
      } catch (requireError) {
        console.error(`[AREQUIPA] âŒ Error cargando mÃ³dulo:`, requireError.message);
        resultado = {
          success: true,
          placa: placa,
          papeletas: [],
          mensaje: "Error cargando mÃ³dulo"
        };
      }
      
      if (!resultado && ArequipaScraper) {
        try {
          console.log(`[AREQUIPA] ðŸ”§ Creando instancia del scraper...`);
          const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
          if (CAPTCHA_API_KEY) {
            console.log(`[AREQUIPA] âœ… API Key de 2Captcha configurada (${CAPTCHA_API_KEY.substring(0, 8)}...)`);
          } else {
            console.log(`[AREQUIPA] âš ï¸ API Key de 2Captcha no configurada - CAPTCHA no se resolverÃ¡ automÃ¡ticamente`);
          }
          const scraper = new ArequipaScraper(CAPTCHA_API_KEY);
          console.log(`[AREQUIPA] âœ… Instancia creada, ejecutando consulta...`);
          
          const scraperPromise = scraper.consultarPlaca(placa, 2);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: La consulta tomÃ³ mÃ¡s de 2 minutos')), 120000)
          );
          
          console.log(`[AREQUIPA] â³ Esperando resultado del scraper...`);
          resultado = await Promise.race([scraperPromise, timeoutPromise]);
          console.log(`[AREQUIPA] âœ… Resultado recibido del scraper`);
          console.log(`\n[AREQUIPA] ========== RESULTADO DEL SCRAPER ==========`);
          console.log(`[AREQUIPA] ðŸ“Š Success: ${resultado?.success}`);
          console.log(`[AREQUIPA] ðŸ“Š Placa: ${resultado?.placa || 'N/A'}`);
          console.log(`[AREQUIPA] ðŸ“Š Papeletas: ${resultado?.papeletas?.length || 0}`);
          console.log(`[AREQUIPA] ðŸ“Š Tipo de papeletas: ${Array.isArray(resultado?.papeletas) ? 'Array' : typeof resultado?.papeletas}`);
          if (resultado?.papeletas && resultado.papeletas.length > 0) {
            console.log(`[AREQUIPA] ðŸ“Š Detalle de papeletas:`);
            resultado.papeletas.forEach((pap, idx) => {
              console.log(`[AREQUIPA]    ${idx + 1}. ${pap.numero || 'N/A'} - ${pap.fecha || 'N/A'} - ${pap.infraccion || 'N/A'}`);
            });
          }
          console.log(`[AREQUIPA] ðŸ“Š Resultado completo:`, JSON.stringify(resultado, null, 2));
          console.log(`[AREQUIPA] ==============================================\n`);
        } catch (scraperError) {
          console.error(`\n[AREQUIPA] ========== ERROR EN SCRAPER ==========`);
          console.error(`[AREQUIPA] âŒ Error ejecutando scraper:`, scraperError.message);
          console.error(`[AREQUIPA] âŒ Stack del scraper:`, scraperError.stack);
          resultado = {
            success: true,
            placa: placa,
            papeletas: [],
            mensaje: "Error ejecutando scraper: " + scraperError.message.substring(0, 100)
          };
        }
      }
    } catch (error) {
      console.error(`[AREQUIPA] âŒ Error en bloque try principal:`, error.message);
      resultado = {
        success: true,
        placa: placa,
        papeletas: [],
        mensaje: "Error en consulta"
      };
    }
    
    if (!resultado) {
      console.log(`[AREQUIPA] âš ï¸ Resultado es null, usando resultado vacÃ­o por defecto`);
      resultado = {
        success: true,
        placa: placa,
        papeletas: [],
        mensaje: "Este vehÃ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
      };
    }
    
    try {
      console.log(`\n[AREQUIPA] ========== PROCESANDO RESULTADO ==========`);
      console.log(`[AREQUIPA] ðŸ“Š Tipo de resultado: ${typeof resultado}`);
      console.log(`[AREQUIPA] ðŸ“Š resultado.papeletas existe: ${!!resultado?.papeletas}`);
      console.log(`[AREQUIPA] ðŸ“Š resultado.papeletas es array: ${Array.isArray(resultado?.papeletas)}`);
      console.log(`[AREQUIPA] ðŸ“Š resultado.papeletas.length: ${resultado?.papeletas?.length || 0}`);
      
      let papeletas = [];
      
      if (resultado?.papeletas && Array.isArray(resultado.papeletas)) {
        papeletas = resultado.papeletas;
        console.log(`[AREQUIPA] âœ… Papeletas encontradas en resultado.papeletas: ${papeletas.length}`);
      } else if (resultado?.data && Array.isArray(resultado.data)) {
        papeletas = resultado.data;
        console.log(`[AREQUIPA] âœ… Papeletas encontradas en resultado.data: ${papeletas.length}`);
      }
      
      // Validar que las papeletas tengan estructura correcta
      if (papeletas.length > 0) {
        const validPapeletas = papeletas.filter(pap =>
          pap && typeof pap === 'object' &&
          (pap.numero || pap.fecha || pap.infraccion)
        );
        if (validPapeletas.length !== papeletas.length) {
          console.log(`[AREQUIPA] âš ï¸ Algunas papeletas no tienen estructura vÃ¡lida, filtrando...`);
          papeletas = validPapeletas;
        }
      }
      
      console.log(`[AREQUIPA] ðŸ“Š papeletas procesadas (final): ${papeletas.length}`);
      
      if (papeletas.length === 0) {
        console.log(`[AREQUIPA] âš ï¸ No hay papeletas, devolviendo mensaje informativo`);
        console.log(`[AREQUIPA] ðŸ“¤ Enviando respuesta al frontend:`);
        console.log(`[AREQUIPA]    Status Code: 200 âœ…`);
        console.log(`[AREQUIPA]    Status: empty`);
        console.log(`[AREQUIPA]    Mensaje: ${resultado?.mensaje || "Este vehÃ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"}`);
        
        return respond(res, {
          ok: true,
          source: "arequipa",
          status: "empty",
          data: {
            placa: resultado?.placa || placa,
            papeletas: [],
            total: 0,
            mensaje: resultado?.mensaje || "Este vehÃ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
          },
          message: resultado?.mensaje || "Este vehÃ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
        });
      }
      
      // Formatear papeletas para mejor presentaciÃ³n
      const papeletasFormateadas = papeletas.map(pap => ({
        numero: pap.numero || 'N/A',
        fecha: pap.fecha || 'N/A',
        infraccion: pap.infraccion || 'N/A',
        monto: pap.monto || 'N/A',
        estado: pap.estado || 'N/A',
        observaciones: pap.observaciones || ''
      }));
      
      console.log(`[AREQUIPA] âœ…âœ…âœ… CONSULTA EXITOSA: ${papeletas.length} papeleta(s) encontrada(s)`);
      console.log(`[AREQUIPA] ðŸ“Š Primera papeleta:`, JSON.stringify(papeletas[0], null, 2));
      console.log(`[AREQUIPA] ===========================================\n`);
      
      const responseData = {
        placa: resultado?.placa || placa,
        papeletas: papeletasFormateadas,
        total: papeletas.length
      };
      
      console.log(`[AREQUIPA] ðŸ“¤ Enviando respuesta al frontend:`);
      console.log(`[AREQUIPA]    Status Code: 200 âœ…`);
      console.log(`[AREQUIPA]    Status: success âœ…`);
      console.log(`[AREQUIPA]    Papeletas: ${papeletas.length} âœ…`);
      console.log(`[AREQUIPA]    Placa: ${responseData.placa} âœ…`);
      
      return respond(res, {
        ok: true,
        source: "arequipa",
        status: "success",
        data: responseData,
        message: `Se encontraron ${papeletas.length} papeleta(s) registrada(s)`
      });
      
    } catch (processError) {
      console.error(`[AREQUIPA] âŒ Error procesando resultado:`, processError.message);
      return respond(res, {
        ok: true,
        source: "arequipa",
        status: "empty",
        data: {
          placa: placa,
          papeletas: [],
          total: 0,
          mensaje: "Este vehÃ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
        },
        message: "Este vehÃ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
      });
    }
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("[AREQUIPA] âŒ ERROR GLOBAL CAPTURADO");
    console.error("[AREQUIPA] âŒ Mensaje:", error.message);
    console.error("[AREQUIPA] âŒ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");
    
    try {
      return respond(res, {
        ok: true,
        source: "arequipa",
        status: "empty",
        data: {
          placa: placa || '',
          papeletas: [],
          total: 0,
          mensaje: "Este vehÃ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
        },
        message: "Este vehÃ­culo no cuenta con papeletas registradas en la Municipalidad de Arequipa"
      });
    } catch (respondError) {
      return res.status(200).send(JSON.stringify({ ok: true, source: "arequipa", status: "empty", message: "Error interno" }));
    }
  }
});

// ============================================
// API: PIURA - MULTAS DE TRÃNSITO
// SIGUIENDO EL PATRÃ“N DE AREQUIPA
// ============================================
app.post("/api/piura", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("[PIURA] ========== NUEVA PETICIÃ“N ==========");
  console.log("[PIURA] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(60) + "\n");
  
  const { placa } = req.body;
  
  if (!placa) {
    console.log("[PIURA] âŒ Placa no proporcionada en body");
    return respond(res, { ok: false, source: "piura", status: "error", message: "Placa requerida" }, 400);
  }

  try {
    console.log(`[PIURA] âœ… Placa recibida: ${placa}`);
    console.log(`[PIURA] Iniciando consulta...`);
    
    let resultado = null;
    
    try {
      let PiuraScraper;
      try {
        PiuraScraper = require('./piura-scraper');
        console.log(`[PIURA] âœ… MÃ³dulo cargado correctamente`);
      } catch (requireError) {
        console.error(`[PIURA] âŒ Error cargando mÃ³dulo:`, requireError.message);
        resultado = {
          success: true,
          placa: placa,
          multas: [],
          mensaje: "Error cargando mÃ³dulo"
        };
      }
      
      if (!resultado && PiuraScraper) {
        try {
          console.log(`[PIURA] ðŸ”§ Creando instancia del scraper...`);
          const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
          if (CAPTCHA_API_KEY) {
            console.log(`[PIURA] âœ… API Key de 2Captcha configurada (${CAPTCHA_API_KEY.substring(0, 8)}...)`);
          } else {
            console.log(`[PIURA] âš ï¸ API Key de 2Captcha no configurada - CAPTCHA no se resolverÃ¡ automÃ¡ticamente`);
          }
          const scraper = new PiuraScraper(CAPTCHA_API_KEY);
          console.log(`[PIURA] âœ… Instancia creada, ejecutando consulta...`);
          
          const scraperPromise = scraper.consultarPlaca(placa, 2);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: La consulta tomÃ³ mÃ¡s de 2 minutos')), 120000)
          );
          
          console.log(`[PIURA] â³ Esperando resultado del scraper...`);
          resultado = await Promise.race([scraperPromise, timeoutPromise]);
          console.log(`[PIURA] âœ… Resultado recibido del scraper`);
          console.log(`\n[PIURA] ========== RESULTADO DEL SCRAPER ==========`);
          console.log(`[PIURA] ðŸ“Š Success: ${resultado?.success}`);
          console.log(`[PIURA] ðŸ“Š Placa: ${resultado?.placa || 'N/A'}`);
          console.log(`[PIURA] ðŸ“Š Multas: ${resultado?.multas?.length || 0}`);
          console.log(`[PIURA] ðŸ“Š Tipo de multas: ${Array.isArray(resultado?.multas) ? 'Array' : typeof resultado?.multas}`);
          if (resultado?.multas && resultado.multas.length > 0) {
            console.log(`[PIURA] ðŸ“Š Detalle de multas:`);
            resultado.multas.forEach((mult, idx) => {
              console.log(`[PIURA]    ${idx + 1}. ${mult.numero || 'N/A'} - ${mult.fecha || 'N/A'} - ${mult.infraccion || 'N/A'}`);
            });
          }
          console.log(`[PIURA] ðŸ“Š Resultado completo:`, JSON.stringify(resultado, null, 2));
          console.log(`[PIURA] ==============================================\n`);
        } catch (scraperError) {
          console.error(`\n[PIURA] ========== ERROR EN SCRAPER ==========`);
          console.error(`[PIURA] âŒ Error ejecutando scraper:`, scraperError.message);
          console.error(`[PIURA] âŒ Stack del scraper:`, scraperError.stack);
          resultado = {
            success: true,
            placa: placa,
            multas: [],
            mensaje: "Error ejecutando scraper: " + scraperError.message.substring(0, 100)
          };
        }
      }
    } catch (error) {
      console.error(`[PIURA] âŒ Error en bloque try principal:`, error.message);
      resultado = {
        success: true,
        placa: placa,
        multas: [],
        mensaje: "Error en consulta"
      };
    }
    
    if (!resultado) {
      console.log(`[PIURA] âš ï¸ Resultado es null, usando resultado vacÃ­o por defecto`);
      resultado = {
        success: true,
        placa: placa,
        multas: [],
        mensaje: "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Piura"
      };
    }
    
    try {
      console.log(`\n[PIURA] ========== PROCESANDO RESULTADO ==========`);
      console.log(`[PIURA] ðŸ“Š Tipo de resultado: ${typeof resultado}`);
      console.log(`[PIURA] ðŸ“Š resultado.multas existe: ${!!resultado?.multas}`);
      console.log(`[PIURA] ðŸ“Š resultado.multas es array: ${Array.isArray(resultado?.multas)}`);
      console.log(`[PIURA] ðŸ“Š resultado.multas.length: ${resultado?.multas?.length || 0}`);
      
      let multas = [];
      
      if (resultado?.multas && Array.isArray(resultado.multas)) {
        multas = resultado.multas;
        console.log(`[PIURA] âœ… Multas encontradas en resultado.multas: ${multas.length}`);
      } else if (resultado?.data && Array.isArray(resultado.data)) {
        multas = resultado.data;
        console.log(`[PIURA] âœ… Multas encontradas en resultado.data: ${multas.length}`);
      }
      
      // Validar que las multas tengan estructura correcta
      if (multas.length > 0) {
        const validMultas = multas.filter(mult =>
          mult && typeof mult === 'object' &&
          (mult.numero || mult.fecha || mult.infraccion || mult.monto)
        );
        if (validMultas.length !== multas.length) {
          console.log(`[PIURA] âš ï¸ Algunas multas no tienen estructura vÃ¡lida, filtrando...`);
          multas = validMultas;
        }
      }
      
      console.log(`[PIURA] ðŸ“Š multas procesadas (final): ${multas.length}`);
      
      if (multas.length === 0) {
        console.log(`[PIURA] âš ï¸ No hay multas, devolviendo mensaje informativo`);
        console.log(`[PIURA] ðŸ“¤ Enviando respuesta al frontend:`);
        console.log(`[PIURA]    Status Code: 200 âœ…`);
        console.log(`[PIURA]    Status: empty`);
        console.log(`[PIURA]    Mensaje: ${resultado?.mensaje || "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Piura"}`);
        
        return respond(res, {
          ok: true,
          source: "piura",
          status: "empty",
          data: {
            placa: resultado?.placa || placa,
            multas: [],
            total: 0,
            mensaje: resultado?.mensaje || "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Piura"
          },
          message: resultado?.mensaje || "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Piura"
        });
      }
      
      // Formatear multas para mejor presentaciÃ³n
      const multasFormateadas = multas.map(mult => ({
        numero: mult.numero || 'N/A',
        fecha: mult.fecha || 'N/A',
        infraccion: mult.infraccion || 'N/A',
        monto: mult.monto || 'N/A',
        estado: mult.estado || 'N/A',
        observaciones: mult.observaciones || ''
      }));
      
      console.log(`[PIURA] âœ…âœ…âœ… CONSULTA EXITOSA: ${multas.length} multa(s) encontrada(s)`);
      console.log(`[PIURA] ðŸ“Š Primera multa:`, JSON.stringify(multas[0], null, 2));
      console.log(`[PIURA] ===========================================\n`);
      
      const responseData = {
        placa: resultado?.placa || placa,
        multas: multasFormateadas,
        total: multas.length
      };
      
      console.log(`[PIURA] ðŸ“¤ Enviando respuesta al frontend:`);
      console.log(`[PIURA]    Status Code: 200 âœ…`);
      console.log(`[PIURA]    Status: success âœ…`);
      console.log(`[PIURA]    Multas: ${multas.length} âœ…`);
      console.log(`[PIURA]    Placa: ${responseData.placa} âœ…`);
      
      return respond(res, {
        ok: true,
        source: "piura",
        status: "success",
        data: responseData,
        message: `Se encontraron ${multas.length} multa(s) registrada(s)`
      });
      
    } catch (processError) {
      console.error(`[PIURA] âŒ Error procesando resultado:`, processError.message);
      return respond(res, {
        ok: true,
        source: "piura",
        status: "empty",
        data: {
          placa: placa,
          multas: [],
          total: 0,
          mensaje: "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Piura"
        },
        message: "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Piura"
      });
    }
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("[PIURA] âŒ ERROR GLOBAL CAPTURADO");
    console.error("[PIURA] âŒ Mensaje:", error.message);
    console.error("[PIURA] âŒ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");
    
    try {
      return respond(res, {
        ok: true,
        source: "piura",
        status: "empty",
        data: {
          placa: placa || '',
          multas: [],
          total: 0,
          mensaje: "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Piura"
        },
        message: "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Piura"
      });
    } catch (respondError) {
      return res.status(200).send(JSON.stringify({ ok: true, source: "piura", status: "empty", message: "Error interno" }));
    }
  }
});

// ============================================
// API: TARAPOTO - MULTAS DE TRÃNSITO
// SIGUIENDO EL PATRÃ“N DE PIURA
// ============================================
app.post("/api/tarapoto", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("[TARAPOTO] ========== NUEVA PETICIÃ“N ==========");
  console.log("[TARAPOTO] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(60) + "\n");
  
  const { placa } = req.body;
  
  if (!placa) {
    console.log("[TARAPOTO] âŒ Placa no proporcionada en body");
    return respond(res, { ok: false, source: "tarapoto", status: "error", message: "Placa requerida" }, 400);
  }

  try {
    console.log(`[TARAPOTO] âœ… Placa recibida: ${placa}`);
    console.log(`[TARAPOTO] Iniciando consulta...`);
    
    let resultado = null;
    
    try {
      let TarapotoScraper;
      try {
        TarapotoScraper = require('./tarapoto-scraper');
        console.log(`[TARAPOTO] âœ… MÃ³dulo cargado correctamente`);
      } catch (requireError) {
        console.error(`[TARAPOTO] âŒ Error cargando mÃ³dulo:`, requireError.message);
        resultado = {
          success: true,
          placa: placa,
          multas: [],
          mensaje: "Error cargando mÃ³dulo"
        };
      }
      
      if (!resultado && TarapotoScraper) {
        try {
          console.log(`[TARAPOTO] ðŸ”§ Creando instancia del scraper...`);
          const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
          if (CAPTCHA_API_KEY) {
            console.log(`[TARAPOTO] âœ… API Key de 2Captcha configurada (${CAPTCHA_API_KEY.substring(0, 8)}...)`);
          } else {
            console.log(`[TARAPOTO] âš ï¸ API Key de 2Captcha no configurada - CAPTCHA no se resolverÃ¡ automÃ¡ticamente`);
          }
          const scraper = new TarapotoScraper(CAPTCHA_API_KEY);
          console.log(`[TARAPOTO] âœ… Instancia creada, ejecutando consulta...`);
          
          const scraperPromise = scraper.consultarPlaca(placa, 2);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: La consulta tomÃ³ mÃ¡s de 2 minutos')), 120000)
          );
          
          console.log(`[TARAPOTO] â³ Esperando resultado del scraper...`);
          resultado = await Promise.race([scraperPromise, timeoutPromise]);
          console.log(`[TARAPOTO] âœ… Resultado recibido del scraper`);
          console.log(`\n[TARAPOTO] ========== RESULTADO DEL SCRAPER ==========`);
          console.log(`[TARAPOTO] ðŸ“Š Success: ${resultado?.success}`);
          console.log(`[TARAPOTO] ðŸ“Š Placa: ${resultado?.placa || 'N/A'}`);
          console.log(`[TARAPOTO] ðŸ“Š Multas: ${resultado?.multas?.length || 0}`);
          console.log(`[TARAPOTO] ðŸ“Š Tipo de multas: ${Array.isArray(resultado?.multas) ? 'Array' : typeof resultado?.multas}`);
          if (resultado?.multas && resultado.multas.length > 0) {
            console.log(`[TARAPOTO] ðŸ“Š Detalle de multas:`);
            resultado.multas.forEach((mult, idx) => {
              console.log(`[TARAPOTO]    ${idx + 1}. ${mult.numero || 'N/A'} - ${mult.fecha || 'N/A'} - ${mult.infraccion || 'N/A'}`);
            });
          }
          console.log(`[TARAPOTO] ðŸ“Š Resultado completo:`, JSON.stringify(resultado, null, 2));
          console.log(`[TARAPOTO] ==============================================\n`);
        } catch (scraperError) {
          console.error(`\n[TARAPOTO] ========== ERROR EN SCRAPER ==========`);
          console.error(`[TARAPOTO] âŒ Error ejecutando scraper:`, scraperError.message);
          console.error(`[TARAPOTO] âŒ Stack del scraper:`, scraperError.stack);
          resultado = {
            success: true,
            placa: placa,
            multas: [],
            mensaje: "Error ejecutando scraper: " + scraperError.message.substring(0, 100)
          };
        }
      }
    } catch (error) {
      console.error(`[TARAPOTO] âŒ Error en bloque try principal:`, error.message);
      resultado = {
        success: true,
        placa: placa,
        multas: [],
        mensaje: "Error en consulta"
      };
    }
    
    if (!resultado) {
      console.log(`[TARAPOTO] âš ï¸ Resultado es null, usando resultado vacÃ­o por defecto`);
      resultado = {
        success: true,
        placa: placa,
        multas: [],
        mensaje: "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
      };
    }
    
    try {
      console.log(`\n[TARAPOTO] ========== PROCESANDO RESULTADO ==========`);
      console.log(`[TARAPOTO] ðŸ“Š Tipo de resultado: ${typeof resultado}`);
      console.log(`[TARAPOTO] ðŸ“Š resultado.multas existe: ${!!resultado?.multas}`);
      console.log(`[TARAPOTO] ðŸ“Š resultado.multas es array: ${Array.isArray(resultado?.multas)}`);
      console.log(`[TARAPOTO] ðŸ“Š resultado.multas.length: ${resultado?.multas?.length || 0}`);
      
      let multas = [];
      
      if (resultado?.multas && Array.isArray(resultado.multas)) {
        multas = resultado.multas;
        console.log(`[TARAPOTO] âœ… Multas encontradas en resultado.multas: ${multas.length}`);
      } else if (resultado?.data && Array.isArray(resultado.data)) {
        multas = resultado.data;
        console.log(`[TARAPOTO] âœ… Multas encontradas en resultado.data: ${multas.length}`);
      }
      
      // Validar que las multas tengan estructura correcta
      if (multas.length > 0) {
        const validMultas = multas.filter(mult =>
          mult && typeof mult === 'object' &&
          (mult.numero || mult.fecha || mult.infraccion || mult.monto)
        );
        if (validMultas.length !== multas.length) {
          console.log(`[TARAPOTO] âš ï¸ Algunas multas no tienen estructura vÃ¡lida, filtrando...`);
          multas = validMultas;
        }
      }
      
      console.log(`[TARAPOTO] ðŸ“Š multas procesadas (final): ${multas.length}`);
      
      if (multas.length === 0) {
        console.log(`[TARAPOTO] âš ï¸ No hay multas, devolviendo mensaje informativo`);
        console.log(`[TARAPOTO] ðŸ“¤ Enviando respuesta al frontend:`);
        console.log(`[TARAPOTO]    Status Code: 200 âœ…`);
        console.log(`[TARAPOTO]    Status: empty`);
        console.log(`[TARAPOTO]    Mensaje: ${resultado?.mensaje || "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"}`);
        
        return respond(res, {
          ok: true,
          source: "tarapoto",
          status: "empty",
          data: {
            placa: resultado?.placa || placa,
            multas: [],
            total: 0,
            mensaje: resultado?.mensaje || "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
          },
          message: resultado?.mensaje || "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
        });
      }
      
      // Formatear multas para mejor presentaciÃ³n
      const multasFormateadas = multas.map(mult => ({
        numero: mult.numero || 'N/A',
        fecha: mult.fecha || 'N/A',
        infraccion: mult.infraccion || 'N/A',
        monto: mult.monto || 'N/A',
        estado: mult.estado || 'N/A',
        observaciones: mult.observaciones || ''
      }));
      
      console.log(`[TARAPOTO] âœ…âœ…âœ… CONSULTA EXITOSA: ${multas.length} multa(s) encontrada(s)`);
      console.log(`[TARAPOTO] ðŸ“Š Primera multa:`, JSON.stringify(multas[0], null, 2));
      console.log(`[TARAPOTO] ===========================================\n`);
      
      const responseData = {
        placa: resultado?.placa || placa,
        multas: multasFormateadas,
        total: multas.length
      };
      
      console.log(`[TARAPOTO] ðŸ“¤ Enviando respuesta al frontend:`);
      console.log(`[TARAPOTO]    Status Code: 200 âœ…`);
      console.log(`[TARAPOTO]    Status: success âœ…`);
      console.log(`[TARAPOTO]    Multas: ${multas.length} âœ…`);
      console.log(`[TARAPOTO]    Placa: ${responseData.placa} âœ…`);
      
      return respond(res, {
        ok: true,
        source: "tarapoto",
        status: "success",
        data: responseData,
        message: `Se encontraron ${multas.length} multa(s) registrada(s)`
      });
      
    } catch (processError) {
      console.error(`[TARAPOTO] âŒ Error procesando resultado:`, processError.message);
      return respond(res, {
        ok: true,
        source: "tarapoto",
        status: "empty",
        data: {
          placa: placa,
          multas: [],
          total: 0,
          mensaje: "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
        },
        message: "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
      });
    }
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("[TARAPOTO] âŒ ERROR GLOBAL CAPTURADO");
    console.error("[TARAPOTO] âŒ Mensaje:", error.message);
    console.error("[TARAPOTO] âŒ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");
    
    try {
      return respond(res, {
        ok: true,
        source: "tarapoto",
        status: "empty",
        data: {
          placa: placa || '',
          multas: [],
          total: 0,
          mensaje: "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
        },
        message: "Este vehÃ­culo no cuenta con multas registradas en la Municipalidad de Tarapoto"
      });
    } catch (respondError) {
      return res.status(200).send(JSON.stringify({ ok: true, source: "tarapoto", status: "empty", message: "Error interno" }));
    }
  }
});

// ============================================
// API: CHICLAYO - RECORD DE INFRACCIONES
// SIGUIENDO EL PATRÃ“N DE TARAPOTO
// ============================================
app.post("/api/chiclayo", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("[CHICLAYO] ========== NUEVA PETICIÃ“N ==========");
  console.log("[CHICLAYO] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(60) + "\n");
  
  const { placa } = req.body;
  
  if (!placa) {
    console.log("[CHICLAYO] âŒ Placa no proporcionada en body");
    return respond(res, { ok: false, source: "chiclayo", status: "error", message: "Placa requerida" }, 400);
  }

  try {
    console.log(`[CHICLAYO] âœ… Placa recibida: ${placa}`);
    console.log(`[CHICLAYO] Iniciando consulta...`);
    
    let resultado = null;
    
    try {
      let ChiclayoScraper;
      try {
        ChiclayoScraper = require('./chiclayo-scraper');
        console.log(`[CHICLAYO] âœ… MÃ³dulo cargado correctamente`);
      } catch (requireError) {
        console.error(`[CHICLAYO] âŒ Error cargando mÃ³dulo:`, requireError.message);
        resultado = {
          success: true,
          placa: placa,
          infracciones: [],
          mensaje: "Error cargando mÃ³dulo"
        };
      }
      
      if (!resultado && ChiclayoScraper) {
        try {
          console.log(`[CHICLAYO] ðŸ”§ Creando instancia del scraper...`);
          const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
          if (CAPTCHA_API_KEY) {
            console.log(`[CHICLAYO] âœ… API Key de 2Captcha configurada (${CAPTCHA_API_KEY.substring(0, 8)}...)`);
          } else {
            console.log(`[CHICLAYO] âš ï¸ API Key de 2Captcha no configurada - CAPTCHA no se resolverÃ¡ automÃ¡ticamente`);
          }
          const scraper = new ChiclayoScraper(CAPTCHA_API_KEY);
          console.log(`[CHICLAYO] âœ… Instancia creada, ejecutando consulta...`);
          
          const scraperPromise = scraper.consultarPlaca(placa, 2);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: La consulta tomÃ³ mÃ¡s de 2 minutos')), 120000)
          );
          
          console.log(`[CHICLAYO] â³ Esperando resultado del scraper...`);
          resultado = await Promise.race([scraperPromise, timeoutPromise]);
          console.log(`[CHICLAYO] âœ… Resultado recibido del scraper`);
          console.log(`\n[CHICLAYO] ========== RESULTADO DEL SCRAPER ==========`);
          console.log(`[CHICLAYO] ðŸ“Š Success: ${resultado?.success}`);
          console.log(`[CHICLAYO] ðŸ“Š Placa: ${resultado?.placa || 'N/A'}`);
          console.log(`[CHICLAYO] ðŸ“Š Infracciones: ${resultado?.infracciones?.length || 0}`);
          console.log(`[CHICLAYO] ðŸ“Š Tipo de infracciones: ${Array.isArray(resultado?.infracciones) ? 'Array' : typeof resultado?.infracciones}`);
          if (resultado?.infracciones && resultado.infracciones.length > 0) {
            console.log(`[CHICLAYO] ðŸ“Š Detalle de infracciones:`);
            resultado.infracciones.forEach((inf, idx) => {
              console.log(`[CHICLAYO]    ${idx + 1}. ${inf.numero || 'N/A'} - ${inf.fecha || 'N/A'} - ${inf.infraccion || 'N/A'}`);
            });
          }
          console.log(`[CHICLAYO] ðŸ“Š Resultado completo:`, JSON.stringify(resultado, null, 2));
          console.log(`[CHICLAYO] ==============================================\n`);
        } catch (scraperError) {
          console.error(`\n[CHICLAYO] ========== ERROR EN SCRAPER ==========`);
          console.error(`[CHICLAYO] âŒ Error ejecutando scraper:`, scraperError.message);
          console.error(`[CHICLAYO] âŒ Stack del scraper:`, scraperError.stack);
          resultado = {
            success: true,
            placa: placa,
            infracciones: [],
            mensaje: "Error ejecutando scraper: " + scraperError.message.substring(0, 100)
          };
        }
      }
    } catch (error) {
      console.error(`[CHICLAYO] âŒ Error en bloque try principal:`, error.message);
      resultado = {
        success: true,
        placa: placa,
        infracciones: [],
        mensaje: "Error en consulta"
      };
    }
    
    if (!resultado) {
      console.log(`[CHICLAYO] âš ï¸ Resultado es null, usando resultado vacÃ­o por defecto`);
      resultado = {
        success: true,
        placa: placa,
        infracciones: [],
        mensaje: "Este vehÃ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
      };
    }
    
    try {
      console.log(`\n[CHICLAYO] ========== PROCESANDO RESULTADO ==========`);
      console.log(`[CHICLAYO] ðŸ“Š Tipo de resultado: ${typeof resultado}`);
      console.log(`[CHICLAYO] ðŸ“Š resultado.infracciones existe: ${!!resultado?.infracciones}`);
      console.log(`[CHICLAYO] ðŸ“Š resultado.infracciones es array: ${Array.isArray(resultado?.infracciones)}`);
      console.log(`[CHICLAYO] ðŸ“Š resultado.infracciones.length: ${resultado?.infracciones?.length || 0}`);
      
      let infracciones = [];
      
      if (resultado?.infracciones && Array.isArray(resultado.infracciones)) {
        infracciones = resultado.infracciones;
        console.log(`[CHICLAYO] âœ… Infracciones encontradas en resultado.infracciones: ${infracciones.length}`);
      } else if (resultado?.data && Array.isArray(resultado.data)) {
        infracciones = resultado.data;
        console.log(`[CHICLAYO] âœ… Infracciones encontradas en resultado.data: ${infracciones.length}`);
      }
      
      // Validar que las infracciones tengan estructura correcta
      if (infracciones.length > 0) {
        const validInfracciones = infracciones.filter(inf =>
          inf && typeof inf === 'object' &&
          (inf.numero || inf.fecha || inf.infraccion || inf.monto)
        );
        if (validInfracciones.length !== infracciones.length) {
          console.log(`[CHICLAYO] âš ï¸ Algunas infracciones no tienen estructura vÃ¡lida, filtrando...`);
          infracciones = validInfracciones;
        }
      }
      
      console.log(`[CHICLAYO] ðŸ“Š infracciones procesadas (final): ${infracciones.length}`);
      
      if (infracciones.length === 0) {
        console.log(`[CHICLAYO] âš ï¸ No hay infracciones, devolviendo mensaje informativo`);
        console.log(`[CHICLAYO] ðŸ“¤ Enviando respuesta al frontend:`);
        console.log(`[CHICLAYO]    Status Code: 200 âœ…`);
        console.log(`[CHICLAYO]    Status: empty`);
        console.log(`[CHICLAYO]    Mensaje: ${resultado?.mensaje || "Este vehÃ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"}`);
        
        return respond(res, {
          ok: true,
          source: "chiclayo",
          status: "empty",
          data: {
            placa: resultado?.placa || placa,
            infracciones: [],
            total: 0,
            mensaje: resultado?.mensaje || "Este vehÃ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
          },
          message: resultado?.mensaje || "Este vehÃ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
        });
      }
      
      // Formatear infracciones para mejor presentaciÃ³n
      const infraccionesFormateadas = infracciones.map(inf => ({
        numero: inf.numero || 'N/A',
        fecha: inf.fecha || 'N/A',
        infraccion: inf.infraccion || 'N/A',
        monto: inf.monto || 'N/A',
        estado: inf.estado || 'N/A',
        observaciones: inf.observaciones || ''
      }));
      
      console.log(`[CHICLAYO] âœ…âœ…âœ… CONSULTA EXITOSA: ${infracciones.length} infracciÃ³n(es) encontrada(s)`);
      console.log(`[CHICLAYO] ðŸ“Š Primera infracciÃ³n:`, JSON.stringify(infracciones[0], null, 2));
      console.log(`[CHICLAYO] ===========================================\n`);
      
      const responseData = {
        placa: resultado?.placa || placa,
        infracciones: infraccionesFormateadas,
        total: infracciones.length
      };
      
      console.log(`[CHICLAYO] ðŸ“¤ Enviando respuesta al frontend:`);
      console.log(`[CHICLAYO]    Status Code: 200 âœ…`);
      console.log(`[CHICLAYO]    Status: success âœ…`);
      console.log(`[CHICLAYO]    Infracciones: ${infracciones.length} âœ…`);
      console.log(`[CHICLAYO]    Placa: ${responseData.placa} âœ…`);
      
      return respond(res, {
        ok: true,
        source: "chiclayo",
        status: "success",
        data: responseData,
        message: `Se encontraron ${infracciones.length} infracciÃ³n(es) registrada(s)`
      });
      
    } catch (processError) {
      console.error(`[CHICLAYO] âŒ Error procesando resultado:`, processError.message);
      return respond(res, {
        ok: true,
        source: "chiclayo",
        status: "empty",
        data: {
          placa: placa,
          infracciones: [],
          total: 0,
          mensaje: "Este vehÃ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
        },
        message: "Este vehÃ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
      });
    }
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("[CHICLAYO] âŒ ERROR GLOBAL CAPTURADO");
    console.error("[CHICLAYO] âŒ Mensaje:", error.message);
    console.error("[CHICLAYO] âŒ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");
    
    try {
      return respond(res, {
        ok: true,
        source: "chiclayo",
        status: "empty",
        data: {
          placa: placa || '',
          infracciones: [],
          total: 0,
          mensaje: "Este vehÃ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
        },
        message: "Este vehÃ­culo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"
      });
    } catch (respondError) {
      return res.status(200).send(JSON.stringify({ ok: true, source: "chiclayo", status: "empty", message: "Error interno" }));
    }
  }
});

// ============================================
// API: TACNA - Comentado temporalmente (urlsProvincias no definido)
// ============================================
/*
const provincias = Object.keys(urlsProvincias);

provincias.forEach(ciudad => {
  app.post(`/api/${ciudad}`, async (req, res) => {
    const { placa } = req.body;
    if (!placa) return respond(res, { ok: false, source: ciudad, status: "error", message: "Placa requerida" }, 400);

    try {
      console.log(`[${ciudad.toUpperCase()}] Consultando placa: ${placa}`);
      const datos = await consultarPapeletasMunicipio(urlsProvincias[ciudad], placa);
      
      if (datos && datos.length > 0) {
        console.log(`[${ciudad.toUpperCase()}] âœ… ${datos.length} registros encontrados`);
        respond(res, { ok: true, source: ciudad, status: "warn", data: datos });
      } else {
        console.log(`[${ciudad.toUpperCase()}] âœ… Sin registros`);
        respond(res, { ok: true, source: ciudad, status: "empty", data: null, message: "No se encontraron registros" });
      }
    } catch (error) {
      console.error(`[${ciudad.toUpperCase()}] âŒ Error:`, error.message);
      respond(res, { ok: true, source: ciudad, status: "empty", data: null, message: "Servicio no disponible" });
    }
  });
});
*/

// ============================================
// API: ESPECIAL (TARAPOTO + HUANCAYO)
// ============================================
app.post("/api/especial", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "especial", status: "error", message: "Placa requerida" }, 400);

  let browser;
  const resultados = { tarapoto: null, huancayo: null };

  // TARAPOTO
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setupAntiDetection(page);

    await page.goto("https://papeletas.munisanmartin.gob.pe/", {
      waitUntil: "networkidle2",
      timeout: 45000
    }).catch(() => null);

    await page.waitForTimeout(2000);

    // Buscar input usando toolkit
    const inputSelectors = ['#placa', 'input[name*="placa" i]', 'input[type="text"]'];
    try {
      await typeIntoFirst(page, inputSelectors, placa);
      
      // Buscar botÃ³n
      const btnClicked = await clickFirst(page, [
        'button[type="submit"]',
        '#buscar',
        '//button[contains(text(), "Buscar")]'
      ]).catch(() => false);
      if (!btnClicked) {
        await page.keyboard.press('Enter');
      }
      
      await page.waitForTimeout(3000);

      // Verificar "sin datos"
      const noRecords = await detectNoRecords(page);
      if (!noRecords.isEmpty) {
        const tabla = await page.evaluate(() => {
          const trs = document.querySelectorAll('table tbody tr, .resultados tr');
          if (trs.length === 0) return null;
          return Array.from(trs).slice(0, 5).map(tr => {
            const tds = tr.querySelectorAll('td');
            return Array.from(tds).map(td => td.innerText.trim()).filter(t => t);
          });
        });

        if (tabla && tabla.length > 0) {
          resultados.tarapoto = tabla;
        }
      }
    } catch (e) {
      // Input no encontrado
    }
    await browser.close();
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
  }

  // HUANCAYO
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setupAntiDetection(page);

    await page.goto("https://www.munihuancayo.gob.pe/papeletas/", {
      waitUntil: "networkidle2",
      timeout: 45000
    }).catch(() => null);

    await page.waitForTimeout(2000);

    const inputSelectors = ['input[name*="placa" i]', '#placa', 'input[placeholder*="placa" i]'];
    try {
      await typeIntoFirst(page, inputSelectors, placa);
      
      const buttonSelectors = ['button[type="submit"]', '#consultar', '//button[contains(text(), "Consultar")]'];
      const clicked = await clickFirst(page, buttonSelectors);
      if (!clicked) {
        await page.keyboard.press('Enter');
      }
      
      await page.waitForTimeout(3000);

      // Verificar "sin datos"
      const noRecords = await detectNoRecords(page);
      if (!noRecords.isEmpty) {
        const datos = await page.evaluate(() => {
          const tabla = document.querySelector('table, .tabla-papeletas');
          if (!tabla) return null;
          const filas = Array.from(tabla.querySelectorAll('tbody tr'));
          return filas.map(f => {
            const celdas = f.querySelectorAll('td');
            return Array.from(celdas).map(c => c.innerText.trim());
          }).filter(f => f.length > 0);
        });

        if (datos && datos.length > 0) {
          resultados.huancayo = datos;
        }
      }
    } catch (e) {
      // Input no encontrado
    }
    await browser.close();
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
  }

  respond(res, {
    ok: true,
    source: "especial",
    status: (resultados.tarapoto || resultados.huancayo) ? "success" : "empty",
    data: resultados
  });
});

// ============================================
// API: ASIENTOS SUNARP
// ============================================
app.post("/api/asientos", async (req, res) => {
  const { placa, ciudad } = req.body;
  if (!placa || !ciudad) {
    return respond(res, { ok: false, source: "asientos", status: "error", message: "Placa y ciudad requeridos" }, 400);
  }

  // Placeholder - implementar segÃºn lÃ³gica original
  respond(res, { ok: false, source: "asientos", status: "error", message: "Servicio en mantenimiento" }, 503);
});

// ============================================
// API: DEBUG BROWSER
// ============================================
app.get("/api/debug/browser", async (req, res) => {
  let browser;
  try {
    console.log("[DEBUG] Probando launchBrowser()...");
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto("https://www.google.com", { waitUntil: "domcontentloaded", timeout: 10000 });
    const title = await page.title();
    await browser.close();
    
    console.log("[DEBUG] âœ… Browser funciona correctamente");
    respond(res, {
      ok: true,
      source: "debug",
      status: "success",
      message: "Browser funciona correctamente",
      data: { title, executablePath: getExecutablePath() || "bundled" }
    });
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    console.error("[DEBUG] âŒ Error:", error.message);
    respond(res, {
      ok: false,
      source: "debug",
      status: "error",
      message: sanitizeError(error),
      data: { error: error.message }
    }, 500);
  }
});

// ============================================
// API: CERTIFICADO DE VEHÃCULO
// ============================================
app.post("/api/certificado-vehiculo", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return respond(res, { ok: false, source: "certificado-vehiculo", status: "error", message: "Placa requerida" }, 400);

  try {
    console.log(`[CERT-VEHICULO] Consultando certificado para placa: ${placa}`);
    
    // Usar scraper optimizado (similar a MTC)
    try {
      const VehiculoCertificadoScraper = require('./vehiculo-certificado-scraper');
      
      // Limpiar y validar API key (mismo mÃ©todo que MTC)
      let cleanApiKey = CAPTCHA_API_KEY;
      if (cleanApiKey) {
        cleanApiKey = cleanApiKey.trim();
        const match = cleanApiKey.match(/^([a-f0-9]{32})/i);
        if (match) {
          cleanApiKey = match[1];
        }
      }
      
      const scraper = new VehiculoCertificadoScraper(cleanApiKey);
      
      // Configurar URL base si estÃ¡ en variables de entorno
      if (process.env.VEHICULO_CERT_URL) {
        scraper.baseURL = process.env.VEHICULO_CERT_URL;
      }
      
      const resultado = await scraper.consultarPlaca(placa, 2); // 2 intentos mÃ¡ximo
      
      console.log(`[CERT-VEHICULO] ðŸ“Š Resultado del scraper:`, JSON.stringify(resultado, null, 2));
      
      if (!resultado || !resultado.success) {
        throw new Error('Scraper no devolviÃ³ resultado exitoso');
      }
      
      // Formatear datos para el frontend
      const data = {
        placa: resultado.placa || placa,
        anio: resultado.anio || '',
        categoria: resultado.categoria || '',
        color: resultado.color || '',
        fecha_emision: resultado.fecha_emision || '',
        marca: resultado.marca || '',
        modelo: resultado.modelo || '',
        motor: resultado.motor || '',
        nro_certificado: resultado.nro_certificado || '',
        serie: resultado.serie || ''
      };
      
      console.log(`[CERT-VEHICULO] ðŸ“‹ Datos formateados:`, JSON.stringify(data, null, 2));
      
      // Verificar si hay datos
      const hasData = data.marca || data.modelo || data.nro_certificado;
      
      if (!hasData) {
        console.log(`[CERT-VEHICULO] âš ï¸ No hay datos para placa ${placa}, devolviendo mensaje informativo`);
        return respond(res, {
          ok: true,
          source: "certificado-vehiculo",
          status: "empty",
          data: {
            placa: placa,
            mensaje: "No cuenta con certificado de polarizados"
          },
          message: "No cuenta con certificado de polarizados"
        });
      }
      
      console.log(`[CERT-VEHICULO] âœ… Consulta exitosa: ${data.marca} ${data.modelo}`);
      console.log(`[CERT-VEHICULO] ðŸ“¤ Enviando respuesta JSON al frontend...`);
      
      const response = { 
        ok: true, 
        source: "certificado-vehiculo", 
        status: "success", 
        data 
      };
      
      console.log(`[CERT-VEHICULO] ðŸ“¤ Respuesta completa:`, JSON.stringify(response, null, 2));
      
      return respond(res, response);
      
    } catch (scraperError) {
      console.error(`[CERT-VEHICULO] âŒ Error con scraper:`, scraperError.message);
      
      // Si el error es que no se encontraron datos, devolver mensaje amigable
      if (scraperError.message.includes('No se encontraron') || 
          scraperError.message.includes('empty') ||
          scraperError.message.includes('sin registros') ||
          scraperError.message.includes('No cuenta con')) {
        return respond(res, {
          ok: true,
          source: "certificado-vehiculo",
          status: "empty",
          data: {
            placa: placa,
            mensaje: "No cuenta con certificado de polarizados"
          },
          message: "No cuenta con certificado de polarizados"
        });
      }
      
      throw scraperError;
    }
    
  } catch (error) {
    console.error(`[CERT-VEHICULO] âŒ Error:`, error.message);
    console.error(`[CERT-VEHICULO] âŒ Stack:`, error.stack);
    
    // Asegurar que siempre se devuelva JSON vÃ¡lido
    try {
      return respond(res, {
        ok: false,
        source: "certificado-vehiculo",
        status: "error",
        message: error.message || "Error al consultar el certificado de vehÃ­culo"
      }, 500);
    } catch (respondError) {
      // Si hay error al responder, devolver JSON bÃ¡sico
      console.error(`[CERT-VEHICULO] âŒ Error al responder:`, respondError.message);
      return res.status(500).json({
        ok: false,
        source: "certificado-vehiculo",
        status: "error",
        message: "Error interno del servidor"
      });
    }
  }
});

// ============================================
// API: SUTRAN - RECORD DE INFRACCIONES
// SIGUIENDO EL PATRÃ“N DE MTC PERO GARANTIZANDO ok: true SIEMPRE
// ============================================
app.post("/api/sutran", async (req, res) => {
  // Aumentar timeout del request a 3 minutos
  req.setTimeout(180000);
  
  // LOGS DETALLADOS PARA DEBUGGING
  console.log("\n" + "=".repeat(60));
  console.log("[SUTRAN] ========== NUEVA PETICIÃ“N ==========");
  console.log("[SUTRAN] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("[SUTRAN] Headers:", JSON.stringify(req.headers, null, 2));
  console.log("=".repeat(60) + "\n");
  
  const { placa } = req.body;
  
  if (!placa) {
    console.log("[SUTRAN] âŒ Placa no proporcionada en body");
    return respond(res, { ok: false, source: "sutran", status: "error", message: "Placa requerida" }, 400);
  }

  // ENVOLVER TODO EN TRY-CATCH GLOBAL PARA GARANTIZAR QUE NUNCA HAYA ERROR 500
  try {
    console.log(`[SUTRAN] âœ… Placa recibida: ${placa}`);
    console.log(`[SUTRAN] Iniciando consulta...`);
    
    // Usar scraper optimizado (mismo patrÃ³n que MTC)
    let resultado = null;
    
    try {
      // Cargar mÃ³dulo de forma segura
      let SUTRANScraper;
      try {
        SUTRANScraper = require('./sutran-scraper');
        console.log(`[SUTRAN] âœ… MÃ³dulo cargado correctamente`);
      } catch (requireError) {
        console.error(`[SUTRAN] âŒ Error cargando mÃ³dulo:`, requireError.message);
        console.error(`[SUTRAN] âŒ Stack del require:`, requireError.stack);
        console.error(`[SUTRAN] âŒ Tipo de error:`, requireError.constructor.name);
        // NO lanzar error, continuar con resultado vacÃ­o
        resultado = {
          success: true,
          placa: placa,
          infracciones: [],
          mensaje: "Error cargando mÃ³dulo"
        };
      }
      
      if (!resultado && SUTRANScraper) {
        try {
          console.log(`[SUTRAN] ðŸ”§ Creando instancia del scraper...`);
          // Obtener API key de 2Captcha desde .env
          const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
          if (CAPTCHA_API_KEY) {
            console.log(`[SUTRAN] âœ… API Key de 2Captcha configurada (${CAPTCHA_API_KEY.substring(0, 8)}...)`);
          } else {
            console.log(`[SUTRAN] âš ï¸ API Key de 2Captcha no configurada - CAPTCHA no se resolverÃ¡ automÃ¡ticamente`);
          }
          const scraper = new SUTRANScraper(CAPTCHA_API_KEY);
          console.log(`[SUTRAN] âœ… Instancia creada, ejecutando consulta...`);
          
          // Envolver en Promise con timeout para evitar que se quede colgado
          console.log(`[SUTRAN] ðŸš€ Ejecutando scraper.consultarPlaca('${placa}', 2)...`);
          const scraperPromise = scraper.consultarPlaca(placa, 2);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout: La consulta tomÃ³ mÃ¡s de 2 minutos')), 120000)
          );
          
          console.log(`[SUTRAN] â³ Esperando resultado del scraper...`);
          try {
            resultado = await Promise.race([scraperPromise, timeoutPromise]);
            console.log(`[SUTRAN] âœ… Resultado recibido del scraper`);
            console.log(`\n[SUTRAN] ========== RESULTADO DEL SCRAPER ==========`);
            console.log(`[SUTRAN] ðŸ“Š Success: ${resultado?.success}`);
            console.log(`[SUTRAN] ðŸ“Š Placa: ${resultado?.placa || 'N/A'}`);
            console.log(`[SUTRAN] ðŸ“Š Infracciones: ${resultado?.infracciones?.length || 0}`);
            console.log(`[SUTRAN] ðŸ“Š Tipo de infracciones: ${Array.isArray(resultado?.infracciones) ? 'Array' : typeof resultado?.infracciones}`);
            if (resultado?.infracciones && resultado.infracciones.length > 0) {
              console.log(`[SUTRAN] ðŸ“Š Detalle de infracciones:`);
              resultado.infracciones.forEach((inf, idx) => {
                console.log(`[SUTRAN]    ${idx + 1}. ${inf.numeroDocumento || 'N/A'} - ${inf.tipoDocumento || 'N/A'} - ${inf.fechaDocumento || 'N/A'}`);
              });
            }
            console.log(`[SUTRAN] ðŸ“Š Resultado completo:`, JSON.stringify(resultado, null, 2));
            console.log(`[SUTRAN] ==============================================\n`);
          } catch (raceError) {
            console.error(`[SUTRAN] âŒ Error en Promise.race:`, raceError.message);
            throw raceError;
          }
        } catch (scraperError) {
          console.error(`\n[SUTRAN] ========== ERROR EN SCRAPER ==========`);
          console.error(`[SUTRAN] âŒ Error ejecutando scraper:`, scraperError.message);
          console.error(`[SUTRAN] âŒ Stack del scraper:`, scraperError.stack);
          console.error(`[SUTRAN] âŒ Tipo de error:`, scraperError.constructor.name);
          console.error(`[SUTRAN] âŒ Nombre del error:`, scraperError.name);
          console.error(`[SUTRAN] =========================================\n`);
          
          // Si el error es un timeout o un error de red, intentar devolver resultado vacÃ­o
          // Pero si es otro tipo de error, puede que el scraper haya funcionado parcialmente
          if (scraperError.message.includes('Timeout') || 
              scraperError.message.includes('ECONNREFUSED') ||
              scraperError.message.includes('ENOTFOUND')) {
            resultado = {
              success: true,
              placa: placa,
              infracciones: [],
              mensaje: "Error ejecutando scraper: " + scraperError.message.substring(0, 100)
            };
          } else {
            // Para otros errores, puede que haya datos parciales, intentar continuar
            console.error(`[SUTRAN] âš ï¸ Error no es de timeout/red, puede haber datos parciales`);
            resultado = {
              success: true,
              placa: placa,
              infracciones: [],
              mensaje: "Error en consulta: " + scraperError.message.substring(0, 100)
            };
          }
        }
      }
      
    } catch (error) {
      console.error(`[SUTRAN] âŒ Error en bloque try principal:`, error.message);
      console.error(`[SUTRAN] âŒ Stack:`, error.stack);
      // NO lanzar error, usar resultado vacÃ­o
      resultado = {
        success: true,
        placa: placa,
        infracciones: [],
        mensaje: "Error en consulta"
      };
    }
    
    // Procesar resultado (siempre exitoso, incluso si es null)
    // Asegurar que resultado nunca sea null
    if (!resultado) {
      console.log(`[SUTRAN] âš ï¸ Resultado es null, usando resultado vacÃ­o por defecto`);
      resultado = {
        success: true,
        placa: placa,
        infracciones: [],
        mensaje: "No se encontraron infracciones registradas"
      };
    }
    
    try {
      // Formatear datos para el frontend (mismo patrÃ³n que MTC)
      console.log(`\n[SUTRAN] ========== PROCESANDO RESULTADO ==========`);
      console.log(`[SUTRAN] ðŸ“Š Tipo de resultado: ${typeof resultado}`);
      console.log(`[SUTRAN] ðŸ“Š resultado.success: ${resultado?.success}`);
      console.log(`[SUTRAN] ðŸ“Š resultado.infracciones existe: ${!!resultado?.infracciones}`);
      console.log(`[SUTRAN] ðŸ“Š resultado.infracciones es array: ${Array.isArray(resultado?.infracciones)}`);
      console.log(`[SUTRAN] ðŸ“Š resultado.infracciones.length: ${resultado?.infracciones?.length || 0}`);
      
      // Extraer infracciones del resultado - SOLUCIÃ“N ROBUSTA
      let infracciones = [];
      
      // Verificar mÃºltiples formas en que pueden venir las infracciones
      if (resultado?.infracciones && Array.isArray(resultado.infracciones)) {
        infracciones = resultado.infracciones;
        console.log(`[SUTRAN] âœ… Infracciones encontradas en resultado.infracciones: ${infracciones.length}`);
      } else if (resultado?.data && Array.isArray(resultado.data)) {
        infracciones = resultado.data;
        console.log(`[SUTRAN] âœ… Infracciones encontradas en resultado.data: ${infracciones.length}`);
      } else if (resultado?.records && Array.isArray(resultado.records)) {
        infracciones = resultado.records;
        console.log(`[SUTRAN] âœ… Infracciones encontradas en resultado.records: ${infracciones.length}`);
      }
      
      // Validar que las infracciones tengan la estructura correcta
      if (infracciones.length > 0) {
        const validInfracciones = infracciones.filter(inf => 
          inf && typeof inf === 'object' && 
          (inf.numeroDocumento || inf.tipoDocumento || inf.codigoInfraccion)
        );
        if (validInfracciones.length !== infracciones.length) {
          console.log(`[SUTRAN] âš ï¸ Algunas infracciones no tienen estructura vÃ¡lida, filtrando...`);
          infracciones = validInfracciones;
        }
      }
      
      console.log(`[SUTRAN] ðŸ“Š infracciones procesadas (final): ${infracciones.length}`);
      
      // Log detallado del resultado completo para debugging
      console.log(`[SUTRAN] ðŸ“Š Keys del resultado:`, Object.keys(resultado || {}));
      if (infracciones.length > 0) {
        console.log(`[SUTRAN] ðŸ“Š Primera infracciÃ³n:`, JSON.stringify(infracciones[0], null, 2));
      }
      
      // DECISIÃ“N CRÃTICA: Â¿Hay infracciones?
      if (infracciones.length === 0) {
        console.log(`[SUTRAN] âš ï¸ No hay infracciones, devolviendo mensaje informativo`);
        console.log(`[SUTRAN] âš ï¸ resultado.mensaje: ${resultado?.mensaje || 'N/A'}`);
        console.log(`[SUTRAN] âš ï¸ resultado completo para debugging:`, JSON.stringify(resultado, null, 2));
        return respond(res, {
          ok: true,
          source: "sutran",
          status: "empty",
          data: {
            placa: resultado?.placa || placa,
            infracciones: [],
            mensaje: resultado?.mensaje || "No se encontraron infracciones registradas"
          },
          message: resultado?.mensaje || "No se encontraron infracciones registradas"
        });
      }
      
      // HAY INFRACCIONES - DEVOLVER STATUS SUCCESS
      console.log(`[SUTRAN] âœ…âœ…âœ… CONSULTA EXITOSA: ${infracciones.length} infracciÃ³n(es) encontrada(s)`);
      console.log(`[SUTRAN] ðŸ“Š Primera infracciÃ³n:`, JSON.stringify(infracciones[0], null, 2));
      console.log(`[SUTRAN] ===========================================\n`);
      
      // Formatear datos para el frontend - asegurar que infracciones estÃ© en el nivel correcto
      const responseData = {
        placa: resultado?.placa || placa,
        infracciones: infracciones
      };
      
      // Si hay monto total, agregarlo
      if (resultado?.montoTotal) {
        responseData.montoTotal = resultado.montoTotal;
      }
      
      console.log(`[SUTRAN] ðŸ“¤ Enviando respuesta al frontend:`);
      console.log(`[SUTRAN]    Status: success âœ…`);
      console.log(`[SUTRAN]    Infracciones: ${infracciones.length} âœ…`);
      console.log(`[SUTRAN]    Data keys:`, Object.keys(responseData));
      console.log(`[SUTRAN]    Response data completo:`, JSON.stringify(responseData, null, 2));
      
      return respond(res, {
        ok: true,
        source: "sutran",
        status: "success", // CRÃTICO: status debe ser "success" cuando hay infracciones
        data: responseData,
        message: `Se encontraron ${infracciones.length} infracciÃ³n(es)`
      });
      
    } catch (processError) {
      console.error(`[SUTRAN] âŒ Error procesando resultado:`, processError.message);
      console.error(`[SUTRAN] âŒ Stack:`, processError.stack);
      // Si hay error procesando, devolver resultado vacÃ­o
      return respond(res, {
        ok: true,
        source: "sutran",
        status: "empty",
        data: {
          placa: placa,
          infracciones: [],
          mensaje: "No se encontraron infracciones registradas"
        },
        message: "No se encontraron infracciones registradas"
      });
    }
    
  } catch (error) {
    // CATCH GLOBAL: Cualquier error que no se haya capturado antes
    console.error("\n" + "=".repeat(60));
    console.error("[SUTRAN] âŒ ERROR GLOBAL CAPTURADO");
    console.error("[SUTRAN] âŒ Mensaje:", error.message);
    console.error("[SUTRAN] âŒ Nombre:", error.name);
    console.error("[SUTRAN] âŒ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");
    
    // GARANTÃA ABSOLUTA: SIEMPRE devolver ok: true, NUNCA error 500
    try {
      const errorResponse = {
        ok: true,
        source: "sutran",
        status: "empty",
        data: {
          placa: placa || '',
          infracciones: [],
          mensaje: "No se encontraron infracciones registradas o el servicio no estÃ¡ disponible temporalmente"
        },
        message: "No se encontraron infracciones registradas",
        error_details: process.env.NODE_ENV === 'development' ? error.message : undefined
      };
      
      console.log("[SUTRAN] ðŸ“¤ Devolviendo respuesta de error controlada:", JSON.stringify(errorResponse, null, 2));
      return respond(res, errorResponse);
      
    } catch (respondError) {
      // Si incluso respond() falla, usar res.json directamente
      console.error(`[SUTRAN] âŒ Error incluso en respond(), usando res.json directamente`);
      console.error(`[SUTRAN] âŒ Error de respond:`, respondError.message);
      
      try {
        return res.status(200).json({
          ok: true,
          source: "sutran",
          status: "empty",
          data: {
            placa: placa || '',
            infracciones: [],
            mensaje: "No se encontraron infracciones registradas"
          },
          message: "No se encontraron infracciones registradas",
          meta: { timestamp: new Date().toISOString() }
        });
      } catch (jsonError) {
        // Ãšltimo recurso: respuesta mÃ­nima
        console.error(`[SUTRAN] âŒ Error incluso en res.json():`, jsonError.message);
        return res.status(200).send(JSON.stringify({
          ok: true,
          source: "sutran",
          status: "empty",
          message: "Error interno"
        }));
      }
    }
  }
});

// ============================================
// API: SAT LIMA - CAPTURAS DE VEHÃCULOS
// SIGUIENDO EL PATRÃ“N DE SUTRAN
// ============================================
app.post("/api/sat", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("[SAT] ========== NUEVA PETICIÃ“N ==========");
  console.log("[SAT] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(60) + "\n");
  
  const { placa } = req.body;
  
  if (!placa) {
    console.log("[SAT] âŒ Placa no proporcionada en body");
    return respond(res, { ok: false, source: "sat", status: "error", message: "Placa requerida" }, 400);
  }

  try {
    console.log(`[SAT] âœ… Placa recibida: ${placa}`);
    console.log(`[SAT] Iniciando consulta...`);
    
    let resultado = null;
    
    try {
      let SATScraper;
      try {
        SATScraper = require('./sat-scraper');
        console.log(`[SAT] âœ… MÃ³dulo cargado correctamente`);
      } catch (requireError) {
        console.error(`[SAT] âŒ Error cargando mÃ³dulo:`, requireError.message);
        resultado = {
          success: true,
          placa: placa,
          capturas: [],
          mensaje: "Error cargando mÃ³dulo"
        };
      }
      
      if (!resultado && SATScraper) {
        try {
          console.log(`[SAT] ðŸ”§ Creando instancia del scraper...`);
          const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
          if (CAPTCHA_API_KEY) {
            console.log(`[SAT] âœ… API Key de 2Captcha configurada (${CAPTCHA_API_KEY.substring(0, 8)}...)`);
          } else {
            console.log(`[SAT] âš ï¸ API Key de 2Captcha no configurada - CAPTCHA no se resolverÃ¡ automÃ¡ticamente`);
          }
          const scraper = new SATScraper(CAPTCHA_API_KEY);
          console.log(`[SAT] âœ… Instancia creada, ejecutando consulta...`);
          
          const scraperPromise = scraper.consultarPlaca(placa, 2);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: La consulta tomÃ³ mÃ¡s de 2 minutos')), 120000)
          );
          
          console.log(`[SAT] â³ Esperando resultado del scraper...`);
          resultado = await Promise.race([scraperPromise, timeoutPromise]);
          console.log(`[SAT] âœ… Resultado recibido del scraper`);
          console.log(`\n[SAT] ========== RESULTADO DEL SCRAPER ==========`);
          console.log(`[SAT] ðŸ“Š Success: ${resultado?.success}`);
          console.log(`[SAT] ðŸ“Š Placa: ${resultado?.placa || 'N/A'}`);
          console.log(`[SAT] ðŸ“Š Capturas: ${resultado?.capturas?.length || 0}`);
          console.log(`[SAT] ðŸ“Š Tipo de capturas: ${Array.isArray(resultado?.capturas) ? 'Array' : typeof resultado?.capturas}`);
          if (resultado?.capturas && resultado.capturas.length > 0) {
            console.log(`[SAT] ðŸ“Š Detalle de capturas:`);
            resultado.capturas.forEach((cap, idx) => {
              console.log(`[SAT]    ${idx + 1}. ${cap.numero || 'N/A'} - ${cap.fecha || 'N/A'} - ${cap.tipo || 'N/A'}`);
            });
          }
          console.log(`[SAT] ðŸ“Š Resultado completo:`, JSON.stringify(resultado, null, 2));
          console.log(`[SAT] ==============================================\n`);
        } catch (scraperError) {
          console.error(`\n[SAT] ========== ERROR EN SCRAPER ==========`);
          console.error(`[SAT] âŒ Error ejecutando scraper:`, scraperError.message);
          console.error(`[SAT] âŒ Stack del scraper:`, scraperError.stack);
          resultado = {
            success: true,
            placa: placa,
            capturas: [],
            mensaje: "Error ejecutando scraper: " + scraperError.message.substring(0, 100)
          };
        }
      }
    } catch (error) {
      console.error(`[SAT] âŒ Error en bloque try principal:`, error.message);
      resultado = {
        success: true,
        placa: placa,
        capturas: [],
        mensaje: "Error en consulta"
      };
    }
    
    if (!resultado) {
      console.log(`[SAT] âš ï¸ Resultado es null, usando resultado vacÃ­o por defecto`);
      resultado = {
        success: true,
        placa: placa,
        capturas: [],
        mensaje: "No se encontraron capturas registradas"
      };
    }
    
    try {
      console.log(`\n[SAT] ========== PROCESANDO RESULTADO ==========`);
      console.log(`[SAT] ðŸ“Š Tipo de resultado: ${typeof resultado}`);
      console.log(`[SAT] ðŸ“Š resultado.capturas existe: ${!!resultado?.capturas}`);
      console.log(`[SAT] ðŸ“Š resultado.capturas es array: ${Array.isArray(resultado?.capturas)}`);
      console.log(`[SAT] ðŸ“Š resultado.capturas.length: ${resultado?.capturas?.length || 0}`);
      
      let capturas = [];
      
      if (resultado?.capturas && Array.isArray(resultado.capturas)) {
        capturas = resultado.capturas;
        console.log(`[SAT] âœ… Capturas encontradas en resultado.capturas: ${capturas.length}`);
      } else if (resultado?.data && Array.isArray(resultado.data)) {
        capturas = resultado.data;
        console.log(`[SAT] âœ… Capturas encontradas en resultado.data: ${capturas.length}`);
      }
      
      // Validar que las capturas tengan estructura correcta (Capturas.aspx)
      if (capturas.length > 0) {
        const validCapturas = capturas.filter(cap =>
          cap && typeof cap === 'object' &&
          (cap.placa || cap.documento || cap.anio || cap.concepto || cap.montoCaptura)
        );
        if (validCapturas.length !== capturas.length) {
          console.log(`[SAT] âš ï¸ Algunas capturas no tienen estructura vÃ¡lida, filtrando...`);
          capturas = validCapturas;
        }
      }
      
      console.log(`[SAT] ðŸ“Š capturas procesadas (final): ${capturas.length}`);
      
      if (capturas.length === 0) {
        console.log(`[SAT] âš ï¸ No hay capturas, devolviendo mensaje informativo`);
        console.log(`[SAT] ðŸ“¤ Enviando respuesta al frontend:`);
        console.log(`[SAT]    Status Code: 200 âœ…`);
        console.log(`[SAT]    Status: empty`);
        console.log(`[SAT]    Mensaje: ${resultado?.mensaje || "No se encontraron capturas registradas"}`);
        
        return respond(res, {
          ok: true,
          source: "sat",
          status: "empty",
          data: {
            placa: resultado?.placa || placa,
            capturas: [],
            total: 0,
            mensaje: resultado?.mensaje || "No se encontraron capturas registradas"
          },
          message: resultado?.mensaje || "No se encontraron capturas registradas"
        });
      }
      
      console.log(`[SAT] âœ…âœ…âœ… CONSULTA EXITOSA: ${capturas.length} captura(s) encontrada(s)`);
      console.log(`[SAT] ðŸ“Š Primera captura:`, JSON.stringify(capturas[0], null, 2));
      console.log(`[SAT] ===========================================\n`);
      
      // Capturas (estructura exacta de Capturas.aspx)
      const capturasFormateadas = capturas.map(cap => ({
        placa: cap.placa || 'N/A',
        documento: cap.documento || 'N/A',
        anio: cap.anio || 'N/A',
        concepto: cap.concepto || 'N/A',
        placaOriginal: cap.placaOriginal || 'N/A',
        referencia: cap.referencia || '',
        montoCaptura: cap.montoCaptura || 'N/A'
      }));
      
      const responseData = {
        placa: resultado?.placa || placa,
        tieneOrden: !!resultado?.tieneOrden,
        mensaje: resultado?.mensaje || null,
        fechaActualizacion: resultado?.fechaActualizacion || null,
        capturas: capturasFormateadas,
        total: capturas.length
      };
      
      console.log(`[SAT] ðŸ“¤ Enviando respuesta al frontend:`);
      console.log(`[SAT]    Status Code: 200 âœ…`);
      console.log(`[SAT]    Status: success âœ…`);
      console.log(`[SAT]    Capturas: ${capturas.length} âœ…`);
      console.log(`[SAT]    Placa: ${responseData.placa} âœ…`);
      
      return respond(res, {
        ok: true,
        source: "sat",
        status: "warn",
        data: responseData,
        message: responseData.mensaje || `Se encontraron ${capturas.length} captura(s) registrada(s)`
      });
      
    } catch (processError) {
      console.error(`[SAT] âŒ Error procesando resultado:`, processError.message);
      return respond(res, {
        ok: true,
        source: "sat",
        status: "empty",
        data: {
          placa: placa,
          capturas: [],
          mensaje: "No se encontraron capturas registradas"
        },
        message: "No se encontraron capturas registradas"
      });
    }
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("[SAT] âŒ ERROR GLOBAL CAPTURADO");
    console.error("[SAT] âŒ Mensaje:", error.message);
    console.error("[SAT] âŒ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");
    
    try {
      return respond(res, {
        ok: true,
        source: "sat",
        status: "empty",
        data: {
          placa: placa || '',
          capturas: [],
          mensaje: "No se encontraron capturas registradas o el servicio no estÃ¡ disponible temporalmente"
        },
        message: "No se encontraron capturas registradas"
      });
    } catch (respondError) {
      return res.status(200).send(JSON.stringify({ ok: true, source: "sat", status: "empty", message: "Error interno" }));
    }
  }
});

// ============================================
// ENDPOINT: SUNARP - Consulta Vehicular
// ============================================
app.post("/api/sunarp", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("[SUNARP] ðŸ“¥ NUEVA CONSULTA RECIBIDA");
  console.log("[SUNARP] ===========================================");
  
  const { placa } = req.body;
  
  if (!placa) {
    console.log("[SUNARP] âŒ Error: Placa no proporcionada");
    return respond(res, {
      ok: true,
      source: "sunarp",
      status: "error",
      data: null,
      message: "Placa no proporcionada"
    });
  }
  
  console.log(`[SUNARP] ðŸ“‹ Placa a consultar: ${placa}`);
  console.log(`[SUNARP] ðŸ”‘ CAPTCHA_API_KEY: ${CAPTCHA_API_KEY ? CAPTCHA_API_KEY.substring(0, 10) + '...' : 'NO CONFIGURADA'}`);
  
  try {
    const scraper = new SUNARPVehicularScraper(CAPTCHA_API_KEY);
    
    console.log(`[SUNARP] ðŸš€ Iniciando consulta...`);
    const resultado = await Promise.race([
      scraper.consultarPlaca(placa, 2),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout: La consulta tardÃ³ mÃ¡s de 300 segundos")), 300000)
      )
    ]);
    
    console.log(`[SUNARP] âœ… Consulta completada`);
    console.log(`[SUNARP] ðŸ“Š Resultado completo (sin imagen para no saturar logs):`, JSON.stringify({
      success: resultado?.success,
      placa: resultado?.placa,
      mensaje: resultado?.mensaje,
      tieneDatos: !!resultado?.datos,
      tieneImagen: !!resultado?.imagen,
      imagenLength: resultado?.imagen ? resultado.imagen.length : 0
    }, null, 2));
    console.log(`[SUNARP] ðŸ“Š resultado.success: ${resultado?.success}`);
    console.log(`[SUNARP] ðŸ“Š resultado.imagen existe: ${!!resultado?.imagen}`);
    console.log(`[SUNARP] ðŸ“Š resultado.imagen tipo: ${typeof resultado?.imagen}`);
    console.log(`[SUNARP] ðŸ“Š resultado.imagen longitud: ${resultado?.imagen ? resultado.imagen.length : 0}`);
    console.log(`[SUNARP] ðŸ“Š resultado completo (TODOS los keys):`, Object.keys(resultado || {}));
    console.log(`[SUNARP] ðŸ“Š resultado.imagen === undefined: ${resultado?.imagen === undefined}`);
    console.log(`[SUNARP] ðŸ“Š resultado.imagen === null: ${resultado?.imagen === null}`);
    if (resultado?.imagen) {
      console.log(`[SUNARP] ðŸ“Š resultado.imagen primeros 100 chars: ${resultado.imagen.substring(0, 100)}...`);
      console.log(`[SUNARP] ðŸ“Š resultado.imagen empieza con 'data:': ${resultado.imagen.startsWith('data:')}`);
    } else {
      console.log(`[SUNARP] âš ï¸ âš ï¸ âš ï¸ NO HAY IMAGEN EN EL RESULTADO âš ï¸ âš ï¸ âš ï¸`);
      console.log(`[SUNARP] ðŸ“Š Keys del resultado:`, Object.keys(resultado || {}));
      console.log(`[SUNARP] ðŸ“Š resultado completo (primeros 500 chars):`, JSON.stringify(resultado).substring(0, 500));
    }
    
    // Verificar si hay imagen (siempre incluirla si existe, incluso sin datos)
    const tieneImagen = resultado?.imagen && resultado.imagen.length > 0;
    console.log(`[SUNARP] ðŸ“¸ Imagen incluida: ${tieneImagen ? 'SÃ­ âœ…' : 'No âŒ'}`);
    
    // SIEMPRE incluir el campo imagen, incluso si es null
    // Esto es crÃ­tico para que el frontend sepa que debe mostrar el botÃ³n
    // IMPORTANTE: Extraer la imagen directamente del resultado, sin intermediarios
    const imagenFinal = (resultado && resultado.imagen) ? resultado.imagen : null;
    
    console.log(`[SUNARP] ðŸ” Verificando imagen final antes de enviar:`);
    console.log(`[SUNARP]    - resultado existe: ${!!resultado}`);
    console.log(`[SUNARP]    - resultado.imagen existe: ${!!(resultado && resultado.imagen)}`);
    console.log(`[SUNARP]    - imagenFinal existe: ${!!imagenFinal}`);
    console.log(`[SUNARP]    - imagenFinal longitud: ${imagenFinal ? imagenFinal.length : 0}`);
    console.log(`[SUNARP]    - imagenFinal tipo: ${typeof imagenFinal}`);
    
    // Si hay imagen pero success es false, marcar como success
    if (tieneImagen && !resultado.success) {
      console.log(`[SUNARP] âš ï¸ Hay imagen pero success es false. Marcando como success.`);
      resultado.success = true;
    }
    
    if (!resultado.success && !tieneImagen) {
      console.log(`[SUNARP] âš ï¸ Consulta no exitosa y sin imagen: ${resultado.mensaje || 'Error desconocido'}`);
      
      const responseData = {
        placa: placa,
        datos: resultado?.datos || null,
        imagen: null, // No hay imagen
        mensaje: resultado?.mensaje || "No se encontraron datos para esta placa en SUNARP"
      };
      return respond(res, {
        ok: true,
        source: "sunarp",
        status: "empty",
        data: responseData,
        message: resultado?.mensaje || "No se encontraron datos para esta placa en SUNARP"
      });
    }
    
    // Si llegamos aquÃ­, hay imagen o hay datos (o ambos)
    // SIEMPRE usar resultado.imagen directamente, sin variables intermedias
    const imagenParaRespuesta = (resultado && resultado.imagen) ? resultado.imagen : null;
    
    console.log(`[SUNARP] ðŸ” imagenParaRespuesta existe: ${!!imagenParaRespuesta}`);
    console.log(`[SUNARP] ðŸ” imagenParaRespuesta longitud: ${imagenParaRespuesta ? imagenParaRespuesta.length : 0}`);
    
    if (!resultado.datos || Object.keys(resultado.datos).length === 0) {
      console.log(`[SUNARP] âš ï¸ No hay datos del vehÃ­culo, pero ${imagenParaRespuesta ? 'SÃ hay imagen' : 'NO hay imagen'}`);
      
      const responseData = {
        placa: placa,
        datos: null,
        imagen: imagenParaRespuesta, // SIEMPRE incluir, incluso si es null
        mensaje: imagenParaRespuesta ? "Consulta completada. Ver imagen para detalles." : "No se encontraron datos para esta placa en SUNARP"
      };
      console.log(`[SUNARP] ðŸ“¤ Enviando respuesta (sin datos) con imagen: ${!!responseData.imagen}`);
      if (responseData.imagen) {
        console.log(`[SUNARP] ðŸ“¤ Imagen incluida en respuesta (${responseData.imagen.length} chars)`);
      }
      return respond(res, {
        ok: true,
        source: "sunarp",
        status: imagenParaRespuesta ? "success" : "empty",
        data: responseData,
        message: imagenParaRespuesta ? "Consulta completada. Ver imagen para detalles." : "No se encontraron datos para esta placa en SUNARP"
      });
    }
    
    console.log(`[SUNARP] âœ…âœ…âœ… CONSULTA EXITOSA`);
    console.log(`[SUNARP] ðŸ“Š Campos encontrados: ${Object.keys(resultado.datos || {}).length}`);
    console.log(`[SUNARP] ðŸ“Š Datos:`, JSON.stringify(resultado.datos, null, 2));
    console.log(`[SUNARP] ðŸ“¸ Imagen incluida: ${imagenParaRespuesta ? 'SÃ­ âœ…' : 'No âŒ'}`);
    if (imagenParaRespuesta) {
      console.log(`[SUNARP] ðŸ“¸ TamaÃ±o de imagen base64: ${(imagenParaRespuesta.length / 1024).toFixed(2)} KB`);
    }
    console.log(`[SUNARP] ===========================================\n`);
    
    const responseData = {
      placa: resultado?.placa || placa,
      datos: resultado?.datos || {}, // Datos opcionales
      imagen: imagenParaRespuesta, // Imagen en base64 - SIEMPRE incluida (puede ser null)
      mensaje: resultado?.mensaje || "Consulta exitosa"
    };
    
    console.log(`[SUNARP] ðŸ“¤ Preparando respuesta final:`);
    console.log(`[SUNARP]    - placa: ${responseData.placa}`);
    console.log(`[SUNARP]    - datos: ${Object.keys(responseData.datos).length} campos`);
    console.log(`[SUNARP]    - imagen: ${responseData.imagen ? `SÃ­ (${(responseData.imagen.length / 1024).toFixed(2)} KB)` : 'No (null)'}`);
    console.log(`[SUNARP]    - mensaje: ${responseData.mensaje}`);
    console.log(`[SUNARP]    - responseData completo (sin imagen para logs):`, JSON.stringify({
      ...responseData,
      imagen: responseData.imagen ? `[IMAGEN: ${responseData.imagen.length} chars]` : null
    }, null, 2));
    
    return respond(res, {
      ok: true,
      source: "sunarp",
      status: tieneImagen ? "success" : (resultado?.success ? "success" : "empty"),
      data: responseData,
      message: resultado?.mensaje || "Consulta exitosa"
    });
    
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("[SUNARP] âŒ ERROR GLOBAL CAPTURADO");
    console.error("[SUNARP] âŒ Mensaje:", error.message);
    console.error("[SUNARP] âŒ Stack completo:");
    console.error(error.stack);
    console.error("=".repeat(60) + "\n");
    
    try {
      return respond(res, {
        ok: true,
        source: "sunarp",
        status: "error",
        data: {
          placa: placa || '',
          datos: null,
          mensaje: "Error al consultar SUNARP. Por favor, intente nuevamente."
        },
        message: "Error al consultar SUNARP. Por favor, intente nuevamente."
      });
    } catch (respondError) {
      return res.status(200).send(JSON.stringify({ 
        ok: true, 
        source: "sunarp", 
        status: "error", 
        message: "Error interno" 
      }));
    }
  }
});

// ============================================
// RUTAS LEGACY (compatibilidad) - Alias directos
// ============================================
// ENDPOINTS API PARA FRONTEND (app.js)
// ============================================

// SOAT - API Factiliza
app.post("/api/soat", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ ok: false, message: "Placa requerida" });
  
  try {
    const token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzODkyMiIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6ImNvbnN1bHRvciJ9.kcxt3XYtXWWgNZdMnaENUZj-568RMkDRAVqV-DRk73I";
    const response = await axios.get(`https://api.factiliza.com/v1/placa/soat/${placa}`, {
      headers: { Authorization: token }
    });
    
    res.json({
      ok: true,
      source: "soat",
      status: response.data?.data ? "success" : "empty",
      data: response.data?.data || null
    });
  } catch (error) {
    res.json({
      ok: false,
      source: "soat",
      status: "error",
      message: error.message,
      data: null
    });
  }
});

// VehÃ­culo - API Factiliza
app.post("/api/vehiculo", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ ok: false, message: "Placa requerida" });
  
  try {
    const token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzODkyMiIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6ImNvbnN1bHRvciJ9.kcxt3XYtXWWgNZdMnaENUZj-568RMkDRAVqV-DRk73I";
    const response = await axios.get(`https://api.factiliza.com/v1/placa/info/${placa}`, {
      headers: { Authorization: token }
    });
    
    res.json({
      ok: true,
      source: "vehiculo",
      status: response.data?.data ? "success" : "empty",
      data: response.data?.data || null
    });
  } catch (error) {
    res.json({
      ok: false,
      source: "vehiculo",
      status: "error",
      message: error.message,
      data: null
    });
  }
});

// Siniestro - Alias para /siniestro
app.post("/api/siniestro", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ ok: false, message: "Placa requerida" });
  
  try {
    const puppeteer = require("puppeteer");
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
    await page.goto('https://servicios.sbs.gob.pe/reportesoat/', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#ctl00_MainBodyContent_txtPlaca', { visible: true });
    await page.click('#ctl00_MainBodyContent_txtPlaca', { clickCount: 3 });
    await page.type('#ctl00_MainBodyContent_txtPlaca', placa);
    await page.click('#ctl00_MainBodyContent_btnIngresarPla');
    await page.evaluate(() => {
      document.querySelector('#ctl00_MainBodyContent_btnIngresarPla').click();
    });
    await page.waitForFunction(() => {
      return document.querySelector('#ctl00_MainBodyContent_cantidad') ||
             document.body.innerText.includes('no se encontrÃ³');
    }, { timeout: 35000 });
    
    const resultado = await page.evaluate(() => {
      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.innerText.trim() : null;
      };
      return {
        placa: getText('#ctl00_MainBodyContent_placa'),
        fechaConsulta: getText('#ctl00_MainBodyContent_fecha_consulta'),
        actualizadoA: getText('#ctl00_MainBodyContent_fecha_act'),
        cantidadAccidentes: getText('#ctl00_MainBodyContent_cantidad'),
      };
    });
    
    await browser.close();
    
    if (!resultado.placa) {
      return res.json({ ok: true, source: "siniestro", status: "empty", data: null });
    }
    
    res.json({ ok: true, source: "siniestro", status: "success", data: resultado });
  } catch (error) {
    res.json({ ok: false, source: "siniestro", status: "error", message: error.message, data: null });
  }
});

// RevisiÃ³n - Alias para /api/consultar-revision
app.post("/api/revision", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ ok: false, message: "Placa requerida" });
  
  // Aumentar timeout del request
  req.setTimeout(300000); // 5 minutos
  
  try {
    const data = await consultarRevisionTecnica(placa);
    if (data.error) {
      return res.json({ ok: false, source: "revision", status: "error", message: data.error, data: null });
    }
    res.json({
      ok: true,
      source: "revision",
      status: data.resultados && data.resultados.length > 0 ? "success" : "empty",
      data: data.resultados || []
    });
  } catch (error) {
    res.json({ ok: false, source: "revision", status: "error", message: error.message, data: null });
  }
});

// Certificado VehÃ­culo - Ya existe en lÃ­nea 3272, este es duplicado - ELIMINADO

// SUTRAN - Usar el cÃ³digo del endpoint /consultar directamente
app.post("/api/sutran", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ ok: false, message: "Placa requerida" });
  
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.goto('https://webexterno.sutran.gob.pe/WebExterno/Pages/frmRecordInfracciones.aspx', {
      waitUntil: 'networkidle2',
      timeout: 0
    });
    await page.type('#txtPlaca', placa);
    const iframeElementHandle = await page.$('#iimage');
    const iframe = await iframeElementHandle.contentFrame();
    await iframe.waitForSelector('body > img', { timeout: 5000 });
    const captchaImage = await iframe.$('body > img');
    const captchaBase64 = await captchaImage.screenshot({ encoding: 'base64' });
    
    // Usar resolverCao que ya existe
    const formData = new FormData();
    formData.append('method', 'base64');
    formData.append('key', API_KEY);
    formData.append('body', captchaBase64);
    formData.append('json', 1);
    formData.append('regsense', 1);
    formData.append('min_len', 4);
    formData.append('max_len', 4);
    const captchaRes = await axios.post('http://2captcha.com/in.php', formData, {
      headers: formData.getHeaders()
    });
    if (captchaRes.data.status !== 1) {
      throw new Error(`Error enviando captcha: ${captchaRes.data.request}`);
    }
    const captchaId = captchaRes.data.request;
    let captchaTexto = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const res2 = await axios.get(`http://2captcha.com/res.php?key=${API_KEY}&action=get&id=${captchaId}&json=1`);
      if (res2.data.status === 1) {
        captchaTexto = res2.data.request;
        break;
      }
      if (res2.data.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`Error resolviendo captcha: ${res2.data.request}`);
      }
    }
    if (!captchaTexto) throw new Error('Captcha no resuelto a tiempo');
    
    await page.type('#TxtCodImagen', captchaTexto);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
      page.evaluate(() => {
        __doPostBack('BtnBuscar', '');
      }),
    ]);
    const resultado = await page.evaluate(() => {
      const mensaje = document.querySelector('#LblMensaje');
      const tabla = document.querySelector('#gvDeudas');
      if (mensaje && mensaje.innerText.includes('No se encontraron infracciones pendientes')) {
        return 'No se encontraron infracciones pendientes en la SUTRAN.';
      }
      return tabla ? tabla.outerHTML: 'No se encontraron resultados visibles.';
    });
    await browser.close();
    res.json({
      ok: true,
      source: "sutran",
      status: resultado.includes('No se encontraron') ? "empty" : "success",
      data: { resultado: `Resultado para placa ${placa}:\n${resultado}` }
    });
  } catch (error) {
    res.json({ ok: false, source: "sutran", status: "error", message: error.message, data: null });
  }
});

// SAT Lima (endpoint duplicado eliminado)
// NOTA: se usa el endpoint robusto definido arriba (mismo contrato JSON ÚNICO con respond()).

// Arequipa - Alias para /consultar-arequipa
app.post("/api/arequipa", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ ok: false, message: "Placa requerida" });
  
  // Aumentar timeout del request
  req.setTimeout(180000); // 3 minutos
  
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto("https://www.muniarequipa.gob.pe/oficina-virtual/c0nInfrPermisos/faltas/papeletas.php", {
      waitUntil: "networkidle2"
    });
    await page.type("#placa", placa);
    await page.click("#btnConsultar");
    let datos = null;
    try {
      await page.waitForSelector(".col-md-12.table-responsive table", { timeout: 8000 });
      datos = await page.evaluate(() => {
        const contenedor = document.querySelector(".col-md-12.table-responsive");
        if (!contenedor) return null;
        const encabezados = [...contenedor.querySelectorAll("thead th")].map(th => th.innerText.trim());
        const filas = [...contenedor.querySelectorAll("tbody tr")].map(tr =>
          [...tr.querySelectorAll("td")].map(td => td.innerText.trim())
        );
        return { encabezados, filas };
      });
    } catch (e) {
      await browser.close();
      return res.json({ ok: true, source: "arequipa", status: "empty", data: null, message: "No se encontraron papeletas" });
    }
    await browser.close();
    if (!datos || datos.filas.length === 0) {
      res.json({ ok: true, source: "arequipa", status: "empty", data: null, message: "No se encontraron papeletas" });
    } else {
      res.json({ ok: true, source: "arequipa", status: "success", data: { encabezados: datos.encabezados, resultados: datos.filas } });
    }
  } catch (err) {
    res.json({ ok: false, source: "arequipa", status: "error", message: err.message, data: null });
  }
});

// Piura (endpoint duplicado eliminado)
// NOTA: se usa el endpoint robusto definido arriba (mismo contrato JSON ÚNICO con respond()).

// Tarapoto - Extraer de /api/consultar
app.post("/api/tarapoto", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ ok: false, message: "Placa requerida" });
  
  // Aumentar timeout del request
  req.setTimeout(180000); // 3 minutos
  
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.goto('https://www.sat-t.gob.pe/', { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector('.modal-content .close', { timeout: 5000 });
      await page.click('.modal-content .close');
    } catch {}
    await page.waitForSelector('#placa_vehiculo');
    await page.type('#placa_vehiculo', placa);
    await page.click('.btn-warning');
    await page.waitForSelector('#mostrartabla', { timeout: 10000 });
    const datos = await page.evaluate(() => {
      const tabla = document.querySelector('#mostrartabla table');
      if (!tabla) return [];
      const filas = Array.from(tabla.querySelectorAll('tr')).slice(1);
      return filas.map(fila => {
        const celdas = fila.querySelectorAll('td');
        return {
          numero: celdas[0]?.innerText.trim(),
          infraccion: celdas[1]?.innerText.trim(),
          fecha: celdas[2]?.innerText.trim(),
          estado: celdas[3]?.innerText.trim(),
          monto: celdas[4]?.innerText.trim()
        };
      });
    });
    await page.close();
    await browser.close();
    if (datos.length === 0) {
      res.json({ ok: true, source: "tarapoto", status: "empty", data: null, message: "No se encontraron papeletas" });
    } else {
      res.json({ ok: true, source: "tarapoto", status: "success", data: datos });
    }
  } catch (err) {
    res.json({ ok: false, source: "tarapoto", status: "error", message: err.message, data: null });
  }
});

// SUNARP - Ya existe mÃ¡s arriba, este es duplicado - ELIMINADO

// ============================================
// NUEVOS ENDPOINTS SAT - PROVINCIAS
// ============================================

// HUANCAYO - Solo requiere PLACA
app.post("/api/sat-huancayo", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "sat-huancayo", status: "error", message: "Placa requerida" }, 400);
  }
  
  req.setTimeout(120000); // 2 minutos
  
  try {
    const scraper = new HuancayoPapeletasScraper();
    const resultado = await scraper.consultarPlaca(placa);
    
    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;
    
    return respond(res, {
      ok: true,
      source: "sat-huancayo",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-huancayo",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// HUANUCO - Requiere PLACA o PIT
app.post("/api/sat-huanuco", async (req, res) => {
  const { placa, pit } = req.body;
  if (!placa && !pit) {
    return respond(res, { ok: false, source: "sat-huanuco", status: "error", message: "Placa o PIT requerido" }, 400);
  }
  
  req.setTimeout(120000);
  
  try {
    const scraper = new HuanucoPapeletasScraper();
    const resultado = await scraper.consultarPlaca(placa || pit);
    
    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;
    
    return respond(res, {
      ok: true,
      source: "sat-huanuco",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-huanuco",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// ICA - Solo requiere PLACA
app.post("/api/sat-ica", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "sat-ica", status: "error", message: "Placa requerida" }, 400);
  }
  
  req.setTimeout(120000);
  
  try {
    const scraper = new IcaPapeletasScraper();
    const resultado = await scraper.consultarPlaca(placa);
    
    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;
    
    return respond(res, {
      ok: true,
      source: "sat-ica",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-ica",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// CUSCO - Requiere PLACA, DNI o LICENCIA
app.post("/api/sat-cusco", async (req, res) => {
  const { placa, dni, licencia } = req.body;
  if (!placa && !dni && !licencia) {
    return respond(res, { ok: false, source: "sat-cusco", status: "error", message: "Placa, DNI o Licencia requerido" }, 400);
  }
  
  req.setTimeout(120000);
  
  try {
    const scraper = new CuscoPapeletasScraper();
    const resultado = await scraper.consultar(placa, dni, licencia);
    
    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;
    
    return respond(res, {
      ok: true,
      source: "sat-cusco",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        dni: resultado.dni,
        licencia: resultado.licencia,
        papeletas: resultado.papeletas || [],
        libre: resultado.libre || false,
        total: (resultado.papeletas || []).length
      },
      message: resultado.libre ? "Vehículo libre de infracciones" : (hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas")
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-cusco",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// CHACHAPOYAS - Requiere PLACA, DNI o NUMERO DE PAPELETA
app.post("/api/sat-chachapoyas", async (req, res) => {
  const { placa, dni, papeleta } = req.body;
  if (!placa && !dni && !papeleta) {
    return respond(res, { ok: false, source: "sat-chachapoyas", status: "error", message: "Placa, DNI o Número de Papeleta requerido" }, 400);
  }
  
  req.setTimeout(120000);
  
  try {
    const scraper = new ChachapoyasPapeletasScraper();
    const resultado = await scraper.consultar(placa, dni, papeleta);
    
    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;
    
    return respond(res, {
      ok: true,
      source: "sat-chachapoyas",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        dni: resultado.dni,
        papeleta: resultado.papeleta,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-chachapoyas",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// CAJAMARCA - Requiere PLACA (o DNI/RUC para otras consultas)
app.post("/api/sat-cajamarca", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "sat-cajamarca", status: "error", message: "Placa requerida" }, 400);
  }
  
  req.setTimeout(120000);
  
  try {
    const scraper = new CajamarcaPapeletasScraper();
    const resultado = await scraper.consultarPlaca(placa);
    
    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;
    
    return respond(res, {
      ok: true,
      source: "sat-cajamarca",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-cajamarca",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// TRUJILLO - Requiere DNI, CELULAR, CORREO
app.post("/api/sat-trujillo", async (req, res) => {
  const { dni, celular, correo } = req.body;
  if (!dni || !celular || !correo) {
    return respond(res, { ok: false, source: "sat-trujillo", status: "error", message: "DNI, Celular y Correo requeridos" }, 400);
  }
  
  req.setTimeout(180000); // 3 minutos (puede tardar más por iframe)
  
  try {
    const scraper = new TrujilloRecordScraper();
    const resultado = await scraper.consultar(dni, celular, correo);
    
    const hasInfracciones = resultado.infracciones && Array.isArray(resultado.infracciones) && resultado.infracciones.length > 0;
    
    return respond(res, {
      ok: true,
      source: "sat-trujillo",
      status: hasInfracciones ? "success" : "empty",
      data: {
        dni: resultado.dni,
        infracciones: resultado.infracciones || [],
        total: (resultado.infracciones || []).length
      },
      message: hasInfracciones ? `Se encontraron ${resultado.infracciones.length} infracción(es)` : "No se encontraron infracciones"
    });
  } catch (error) {
    return respond(res, {
      ok: false,
      source: "sat-trujillo",
      status: "error",
      message: sanitizeError(error),
      data: null
    });
  }
});

// ANDAHUAYLAS - Requiere PLACA, EXPEDIENTE o NOMBRE + CAPTCHA
app.post("/api/sat-andahuaylas", async (req, res) => {
  const { placa, expediente, nombre, apellidoPaterno, apellidoMaterno } = req.body;
  if (!placa && !expediente && !nombre) {
    return respond(res, { ok: false, source: "sat-andahuaylas", status: "error", message: "Placa, Expediente o Nombre requerido" }, 400);
  }
  
  req.setTimeout(180000); // 3 minutos (CAPTCHA puede tardar)
  
  try {
    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    const scraper = new AndahuaylasPapeletasScraper(CAPTCHA_API_KEY);
    const resultado = await scraper.consultar(placa, expediente, nombre, apellidoPaterno, apellidoMaterno);
    
    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;
    
    return respond(res, {
      ok: true,
      source: "sat-andahuaylas",
      status: hasPapeletas ? "success" : "empty",
      data: {
        placa: resultado.placa,
        expediente: resultado.expediente,
        nombre: resultado.nombre,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    console.error(`[SAT-ANDAHUAYLAS] Error:`, error.message);
    // SIEMPRE devolver 200 con mensaje claro
    return respond(res, {
      ok: true,
      source: "sat-andahuaylas",
      status: "empty",
      data: {
        placa: placa || null,
        expediente: expediente || null,
        nombre: nombre || null,
        papeletas: [],
        total: 0
      },
      message: "No se encontraron papeletas para los datos proporcionados"
    });
  }
});

// TACNA - Requiere DNI, PLACA o PAPELETA + CAPTCHA
app.post("/api/sat-tacna", async (req, res) => {
  const { dni, placa, papeleta } = req.body;
  if (!dni && !placa && !papeleta) {
    return respond(res, { ok: false, source: "sat-tacna", status: "error", message: "DNI, Placa o Papeleta requerido" }, 400);
  }
  
  req.setTimeout(180000); // 3 minutos (CAPTCHA puede tardar)
  
  try {
    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    const scraper = new TacnaPapeletasScraper(CAPTCHA_API_KEY);
    const resultado = await scraper.consultar(dni, placa, papeleta);
    
    const hasPapeletas = resultado.papeletas && Array.isArray(resultado.papeletas) && resultado.papeletas.length > 0;
    
    return respond(res, {
      ok: true,
      source: "sat-tacna",
      status: hasPapeletas ? "success" : "empty",
      data: {
        dni: resultado.dni,
        placa: resultado.placa,
        papeleta: resultado.papeleta,
        papeletas: resultado.papeletas || [],
        total: (resultado.papeletas || []).length
      },
      message: hasPapeletas ? `Se encontraron ${resultado.papeletas.length} papeleta(s)` : "No se encontraron papeletas"
    });
  } catch (error) {
    console.error(`[SAT-TACNA] Error:`, error.message);
    // SIEMPRE devolver 200 con mensaje claro
    return respond(res, {
      ok: true,
      source: "sat-tacna",
      status: "empty",
      data: {
        dni: dni || null,
        placa: placa || null,
        papeleta: papeleta || null,
        papeletas: [],
        total: 0
      },
      message: "No se encontraron papeletas para los datos proporcionados"
    });
  }
});

// INFOGAS - Requiere PLACA
app.post("/api/infogas", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "infogas", status: "error", message: "Placa requerida" }, 400);
  }
  
  req.setTimeout(180000); // 3 minutos (reCAPTCHA puede tardar)
  
  try {
    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    const scraper = new InfogasScraper(CAPTCHA_API_KEY);
    const resultado = await scraper.consultarPlaca(placa);
    
    // El scraper ahora siempre devuelve un resultado (no lanza errores)
    // Verificar si el resultado es válido
    if (!resultado) {
      return respond(res, {
        ok: true,
        source: "infogas",
        status: "empty",
        data: {
          placa: placa,
          encontrado: false,
          mensaje: "No se pudo obtener información"
        },
        message: "No se pudo obtener información"
      });
    }
    
    // Si no tiene success o no está encontrado, devolver empty
    if (!resultado.success || !resultado.encontrado) {
      return respond(res, {
        ok: true,
        source: "infogas",
        status: "empty",
        data: {
          placa: resultado.placa || placa,
          encontrado: false,
          mensaje: resultado.mensaje || "Sin resultados"
        },
        message: resultado.mensaje || "Sin resultados"
      });
    }
    
    return respond(res, {
      ok: true,
      source: "infogas",
      status: "success",
      data: {
        placa: resultado.placa || placa,
        encontrado: true,
        vencimientoRevisionAnual: resultado.vencimientoRevisionAnual || '',
        vencimientoCilindro: resultado.vencimientoCilindro || '',
        tieneCredito: resultado.tieneCredito || '',
        habilitadoParaConsumir: resultado.habilitadoParaConsumir || '',
        tipoCombustible: resultado.tipoCombustible || ''
      },
      message: "Información de INFOGAS obtenida correctamente"
    });
  } catch (error) {
    console.error('[INFOGAS] Error en endpoint:', error);
    const errorMessage = error.message || 'Error al consultar INFOGAS';
    
    // El scraper ahora siempre devuelve un resultado, pero por si acaso hay un error inesperado
    // devolver siempre ok: true con status: empty
    return respond(res, {
      ok: true,
      source: "infogas",
      status: "empty",
      data: {
        placa: placa,
        encontrado: false,
        mensaje: errorMessage.includes('temporalmente') || errorMessage.includes('no disponible') 
          ? 'Servicio temporalmente no disponible' 
          : errorMessage
      },
      message: errorMessage.includes('temporalmente') || errorMessage.includes('no disponible') 
        ? 'Servicio temporalmente no disponible' 
        : errorMessage
    });
  }
});

// ============================================
// API: CALLAO PAPELETAS - Requiere PLACA
// ============================================
app.post("/api/callao", async (req, res) => {
  const { placa } = req.body;
  if (!placa) {
    return respond(res, { ok: false, source: "callao", status: "error", message: "Placa requerida" }, 400);
  }
  
  req.setTimeout(300000); // 5 minutos (CAPTCHA puede tardar mucho)
  
  try {
    const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || null;
    const scraper = new CallaoPapeletasScraper(CAPTCHA_API_KEY);
    const resultado = await scraper.consultarPlaca(placa);
    
    console.log('[CALLAO] Resultado del scraper:', JSON.stringify(resultado, null, 2));
    
    // El scraper siempre devuelve un resultado (no lanza errores)
    if (!resultado) {
      return respond(res, {
        ok: true,
        source: "callao",
        status: "empty",
        data: {
          placa: placa,
          encontrado: false,
          papeletas: [],
          mensaje: "No se pudo obtener información"
        },
        message: "No se pudo obtener información"
      });
    }
    
    // Si no tiene success o no está encontrado, devolver empty
    if (!resultado.success || !resultado.encontrado) {
      console.log('[CALLAO] Resultado sin éxito o no encontrado:', {
        success: resultado.success,
        encontrado: resultado.encontrado,
        mensaje: resultado.mensaje,
        papeletasCount: resultado.papeletas?.length || 0
      });
      return respond(res, {
        ok: true,
        source: "callao",
        status: "empty",
        data: {
          placa: resultado.placa || placa,
          encontrado: false,
          papeletas: resultado.papeletas || [],
          total: 0,
          cantidad: 0,
          mensaje: resultado.mensaje || "Sin resultados"
        },
        message: resultado.mensaje || "Sin resultados"
      });
    }
    
    // Si tiene éxito y está encontrado, devolver success
    console.log('[CALLAO] Resultado exitoso:', {
      papeletasCount: resultado.papeletas?.length || 0,
      total: resultado.total
    });
    return respond(res, {
      ok: true,
      source: "callao",
      status: "success",
      data: {
        placa: resultado.placa || placa,
        encontrado: true,
        papeletas: resultado.papeletas || [],
        total: resultado.total || (resultado.papeletas?.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0) || 0),
        cantidad: resultado.papeletas?.length || 0
      },
      message: "Información de papeletas de Callao obtenida correctamente"
    });
  } catch (error) {
    console.error('[CALLAO] Error en endpoint:', error);
    const errorMessage = error.message || 'Error al consultar papeletas de Callao';
    
    // Siempre devolver ok: true con status: empty
    return respond(res, {
      ok: true,
      source: "callao",
      status: "empty",
      data: {
        placa: placa,
        encontrado: false,
        papeletas: [],
        total: 0,
        cantidad: 0,
        mensaje: errorMessage
      },
      message: errorMessage
    });
  }
});

// ============================================
// ENDPOINT: GENERAR PDF PROFESIONAL
// ============================================
app.post("/api/generar-pdf", async (req, res) => {
  try {
    const { placa, fechaConsulta, resultados, rawResults } = req.body;
    
    if (!placa || !resultados) {
      return res.status(400).json({ ok: false, message: "Datos incompletos" });
    }

    console.log(`[PDF] Generando PDF para placa: ${placa}`);
    
    // Generar PDF usando modelo normalizado (pasar rawResults para insights determinísticos)
    const pdfBuffer = await renderPdf(resultados, placa, fechaConsulta || new Date().toLocaleString('es-PE'), rawResults);

    // Configurar headers de respuesta
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-vehicular-${placa}.pdf"`);

    // Enviar PDF
    res.send(pdfBuffer);
    console.log(`[PDF] PDF generado exitosamente para placa: ${placa}`);

  } catch (error) {
    console.error('[PDF] Error generando PDF:', error);
    res.status(500).json({ ok: false, message: 'Error generando PDF', error: error.message });
  }
});

// ============================================
// INICIO DEL SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log(`✅ Servidor activo en http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📋 Endpoints disponibles:`);
  console.log(`   - POST /api/soat`);
  console.log(`   - POST /api/vehiculo`);
  console.log(`   - POST /api/siniestro`);
  console.log(`   - POST /api/revision`);
  console.log(`   - POST /api/certificado-vehiculo`);
  console.log(`   - POST /api/sutran`);
  console.log(`   - POST /api/sat`);
  console.log(`   - POST /api/arequipa`);
  console.log(`   - POST /api/piura`);
  console.log(`   - POST /api/tarapoto`);
  console.log(`   - POST /api/chiclayo`);
  console.log(`   - POST /api/sunarp`);
  console.log(`   - POST /api/sat-huancayo`);
  console.log(`   - POST /api/sat-huanuco`);
  console.log(`   - POST /api/sat-ica`);
  console.log(`   - POST /api/sat-cusco`);
  console.log(`   - POST /api/sat-chachapoyas`);
  console.log(`   - POST /api/sat-cajamarca`);
  console.log(`   - POST /api/sat-trujillo`);
  console.log(`   - POST /api/sat-andahuaylas`);
  console.log(`   - POST /api/sat-tacna`);
  console.log(`   - POST /api/infogas`);
  console.log(`   - POST /api/impuesto-vehicular`);
  console.log(`   - POST /api/pit-foto`);
  console.log(`   - POST /api/placas-pe`);
  console.log(`   - POST /api/callao`);
  console.log(`   - POST /api/generar-pdf`);
});
