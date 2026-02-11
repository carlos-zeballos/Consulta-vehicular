/**
 * PLAYWRIGHT CONFIG - Configuración avanzada del navegador
 * Técnicas de máxima evasión anti-bot
 */

const { chromium } = require('playwright');

function parseProxyUrl(proxyUrl) {
  if (!proxyUrl || typeof proxyUrl !== "string") return null;
  try {
    const u = new URL(proxyUrl);
    const server = u.protocol + "//" + u.hostname + (u.port ? (":" + u.port) : "");
    const username = u.username ? decodeURIComponent(u.username) : undefined;
    const password = u.password ? decodeURIComponent(u.password) : undefined;
    const out = { server: server };
    if (username) out.username = username;
    if (password) out.password = password;
    return out;
  } catch (e) {
    try {
      const u = new URL("http://" + proxyUrl);
      return { server: "http://" + u.hostname + (u.port ? (":" + u.port) : "") };
    } catch (e2) {
      return null;
    }
  }
}


/**
 * User agents realistas
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

/**
 * Viewports realistas
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 }
];

/**
 * Obtener user agent aleatorio
 */
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Obtener viewport aleatorio
 */
function getRandomViewport() {
  return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
}

/**
 * Scripts de evasión anti-detección
 */
const EVASION_SCRIPTS = `
  // Eliminar navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined
  });
  
  // Spoofing de plugins
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5]
  });
  
  // Spoofing de Chrome object
  window.chrome = {
    runtime: {}
  };
  
  // Canvas fingerprint spoofing
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type) {
    if (type === 'image/png' || type === 'image/jpeg') {
      const context = this.getContext('2d');
      const imageData = context.getImageData(0, 0, this.width, this.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] += Math.floor(Math.random() * 10) - 5;
      }
      context.putImageData(imageData, 0, 0);
    }
    return originalToDataURL.apply(this, arguments);
  };
  
  // Permissions API spoofing
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) => (
    parameters.name === 'notifications' ?
      Promise.resolve({ state: Notification.permission }) :
      originalQuery(parameters)
  );
  
  // Eliminar rastros de automatización
  delete navigator.__proto__.webdriver;
`;

/**
 * Lanzar navegador con configuración avanzada
 */
async function launchAdvancedBrowser(options = {}) {
  const { headless = true, executablePath, proxyUrl } = options;
  
  const viewport = getRandomViewport();
  const userAgent = getRandomUserAgent();
  const proxy = parseProxyUrl(proxyUrl || process.env.PROXY_URL);
  
  const browser = await chromium.launch({
    headless,
    executablePath: executablePath || process.env.CHROMIUM_PATH,
    ...(proxy ? { proxy } : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-ipc-flooding-protection',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--disable-background-networking',
      `--window-size=${viewport.width},${viewport.height}`
    ]
  });
  
  return { browser, viewport, userAgent };
}

/**
 * Crear contexto con configuración avanzada
 */
async function createAdvancedContext(browser, options = {}) {
  const { viewport, userAgent } = options;
  
  const context = await browser.newContext({
    viewport: viewport || getRandomViewport(),
    userAgent: userAgent || getRandomUserAgent(),
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    permissions: ['geolocation'],
    geolocation: { latitude: -12.0464, longitude: -77.0428 }, // Lima, Perú
    colorScheme: 'light',
    extraHTTPHeaders: {
      'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    }
  });
  
  // Inyectar scripts de evasión
  await context.addInitScript(EVASION_SCRIPTS);
  
  return context;
}

/**
 * Cargar página con múltiples estrategias de espera
 */
async function guaranteePageLoad(page, url, options = {}) {
  const { referer } = options;
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const strategies = [
        { waitUntil: 'domcontentloaded', timeout: 30000 },
        { waitUntil: 'load', timeout: 30000 },
        { waitUntil: 'commit', timeout: 30000 }
      ];
      
      const strategy = strategies[attempt - 1] || strategies[0];
      
      if (referer) {
        await page.setExtraHTTPHeaders({ 'Referer': referer });
      }
      
      const response = await page.goto(url, strategy);
      
      // Verificar que la página cargó correctamente
      await page.waitForFunction(() => {
        return document.body && document.body.children.length > 0;
      }, { timeout: 10000 });
      
      return response;
    } catch (error) {
      if (attempt === maxRetries) {
        throw new Error(`PAGE_LOAD_FAILED: No se pudo cargar la página después de ${maxRetries} intentos: ${error.message}`);
      }
      console.log(`[PLAYWRIGHT] Intento ${attempt} falló, reintentando con otra estrategia...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Delay humano aleatorio
 */
async function humanDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

module.exports = {
  launchAdvancedBrowser,
  createAdvancedContext,
  guaranteePageLoad,
  humanDelay,
  parseProxyUrl
};
