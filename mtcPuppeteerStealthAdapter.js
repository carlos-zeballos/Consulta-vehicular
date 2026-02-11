/**
 * MTC CITV - Puppeteer Headless + Stealth
 * Usa puppeteer-extra + stealth plugin para reducir huellas de automatizaciÃ³n.
 *
 * Nota: esto NO garantiza Ã©xito si la IP del servidor estÃ¡ bloqueada por reputaciÃ³n (datacenter).
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const BASE_URL = "https://rec.mtc.gob.pe";

puppeteerExtra.use(StealthPlugin());

function resolveExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  // Playwright docker image stores browsers under /ms-playwright
  try {
    const root = "/ms-playwright";
    if (fs.existsSync(root)) {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      const chromiumDir = entries
        .filter((e) => e.isDirectory() && e.name.toLowerCase().startsWith("chromium-"))
        .map((e) => e.name)
        .sort()
        .reverse()[0];
      if (chromiumDir) {
        const candidate = path.join(root, chromiumDir, "chrome-linux", "chrome");
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch {
    // ignore
  }

  return undefined; // let puppeteer decide
}

function isBlockedHttpStatus(status) {
  return status === 403 || status === 429;
}

function detectBlockedFromHtml(html = "") {
  const content = String(html || "").toLowerCase();
  return (
    content.includes("cloudflare") ||
    content.includes("checking your browser") ||
    content.includes("cf-chl") ||
    content.includes("challenge")
  );
}

async function solveCaptcha2Captcha(dataImageUrl) {
  const key = process.env.CAPTCHA_API_KEY;
  if (!key) throw new Error("CAPTCHA_API_KEY no configurado");

  const base64Clean = String(dataImageUrl || "").replace(/^data:image\/[a-z]+;base64,/, "");
  if (!base64Clean) throw new Error("CAPTCHA_ERROR: Imagen captcha vacÃ­a");

  const start = await axios.post("http://2captcha.com/in.php", null, {
    params: {
      key,
      method: "base64",
      body: base64Clean,
      json: 1,
      numeric: "4",
      min_len: "4",
      max_len: "6",
      priority: 2,
    },
    timeout: 10000,
  });

  if (!start.data || start.data.status !== 1) {
    throw new Error(`2CAPTCHA_ERROR: ${start.data?.request || "unknown"}`);
  }

  const captchaId = start.data.request;

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await axios.get("http://2captcha.com/res.php", {
      params: { key, action: "get", id: captchaId, json: 1 },
      timeout: 5000,
    });
    if (res.data?.status === 1) return res.data.request;
    if (res.data?.request && res.data.request !== "CAPCHA_NOT_READY") {
      throw new Error(`2CAPTCHA_ERROR: ${res.data.request}`);
    }
  }

  throw new Error("2CAPTCHA_ERROR: Timeout esperando resoluciÃ³n");
}

async function consultCitvByPlacaPuppeteerStealth(placaRaw) {
  const placa = String(placaRaw || "").trim().replace(/\s+/g, "").toUpperCase();
  if (!placa) throw new Error("Placa requerida");

  const proxyUrl = process.env.MTC_PROXY_URL || process.env.PROXY_URL || null;

  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    "--window-size=1366,768",
  ];

  if (proxyUrl) {
    try {
      const u = new URL(proxyUrl);
      args.push(`--proxy-server=${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`);
    } catch {
      // ignore
    }
  }

  const browser = await puppeteerExtra.launch({
    headless: "new",
    executablePath: resolveExecutablePath(),
    args,
  });

  const page = await browser.newPage();

  try {
    if (proxyUrl) {
      try {
        const u = new URL(proxyUrl);
        if (u.username) {
          await page.authenticate({
            username: decodeURIComponent(u.username),
            password: decodeURIComponent(u.password || ""),
          });
        }
      } catch {
        // ignore
      }
    }

    await page.setExtraHTTPHeaders({
      "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
      "Upgrade-Insecure-Requests": "1",
    });

    const resp = await page.goto(`${BASE_URL}/Citv/ArConsultaCitv`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    const status = resp?.status?.() ?? null;
    const html0 = await page.content().catch(() => "");
    if ((status && isBlockedHttpStatus(status)) || detectBlockedFromHtml(html0)) {
      const e = new Error(`MTC_BLOCKED: WAF/Cloudflare detectado (HTTP ${status || "?"}).`);
      e.code = "MTC_BLOCKED";
      throw e;
    }

    await page.waitForSelector("#selBUS_Filtro", { timeout: 25000 });
    await page.waitForSelector("#texFiltro", { timeout: 25000 });
    await page.waitForSelector("#texCaptcha", { timeout: 25000 });
    await page.waitForSelector("#btnBuscar", { timeout: 25000 });

    await page.waitForSelector("#imgCaptcha", { timeout: 25000 });
    let captchaSrc = await page.$eval("#imgCaptcha", (img) => img.getAttribute("src"));

    if (!captchaSrc || !String(captchaSrc).startsWith("data:image")) {
      // fallback try XHR from same origin
      try {
        const data = await page.evaluate(async () => {
          const res = await fetch("/CITV/refrescarCaptcha", {
            method: "GET",
            headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
            credentials: "include",
          });
          const json = await res.json().catch(() => null);
          return json;
        });
        if (data?.orStatus && data?.orResult) captchaSrc = `data:image/png;base64,${data.orResult}`;
      } catch {
        // ignore
      }
    }

    if (!captchaSrc || !String(captchaSrc).startsWith("data:image")) {
      throw new Error("MTC_ERROR: No se pudo obtener captcha");
    }

    const captchaText = await solveCaptcha2Captcha(captchaSrc);

    await page.select("#selBUS_Filtro", "1");
    await page.type("#texFiltro", placa, { delay: 40 });
    await page.type("#texCaptcha", captchaText, { delay: 40 });

    const apiRespPromise = page
      .waitForResponse((r) => r.url().includes("JrCITVConsultarFiltro"), { timeout: 35000 })
      .catch(() => null);

    await page.click("#btnBuscar");

    const apiResp = await apiRespPromise;
    if (apiResp) {
      const st = apiResp.status();
      if (isBlockedHttpStatus(st)) {
        const e = new Error(`MTC_BLOCKED: rate-limit/WAF (HTTP ${st}).`);
        e.code = "MTC_BLOCKED";
        throw e;
      }
      if (st === 200) {
        const ct = (apiResp.headers()["content-type"] || "").toLowerCase();
        if (ct.includes("json")) {
          const json = await apiResp.json().catch(() => null);
          if (json?.orCodigo === "-1") throw new Error("CAPTCHA_INVALID: El captcha ingresado es invÃ¡lido");
          if (json && json.orStatus) {
            let records = [];
            if (Array.isArray(json.orResult) && json.orResult.length > 0) {
              try {
                const v = json.orResult[0];
                records = typeof v === "string" ? JSON.parse(v) : Array.isArray(v) ? v : [];
              } catch {
                records = [];
              }
            }
            return { status: records.length > 0 ? "success" : "empty", records };
          }
        }
      }
    }

    // DOM fallback (mismo set de spans que el scraper final)
    const domRecords = await page.evaluate(() => {
      const out = [];
      for (let panelNum = 1; panelNum <= 3; panelNum++) {
        const panel = document.querySelector(`#Panel${panelNum}`);
        if (!panel) continue;
        const get = (id) => {
          const el = document.querySelector(`#${id}`);
          return el && el.textContent ? el.textContent.trim() : "";
        };
        const rec = {
          empresa: get(`Spv${panelNum}_1`),
          direccion: get(`Spv${panelNum}_2`),
          placa: get(`Spv${panelNum}_3`),
          certificado: get(`Spv${panelNum}_4`),
          vigente_desde: get(`Spv${panelNum}_5`),
          vigente_hasta: get(`Spv${panelNum}_6`),
          resultado: get(`Spv${panelNum}_7`),
          estado: get(`Spv${panelNum}_8`),
          ambito: get(`Spv${panelNum}_9`),
          tipo_servicio: get(`Spv${panelNum}_10`),
          observaciones: get(`Spv${panelNum}_11`),
          tipo_documento: panelNum === 1 ? "ÃšLTIMO" : panelNum === 2 ? "PENÃšLTIMO" : "ANTEPENÃšLTIMO",
        };
        const has = rec.certificado || rec.vigente_hasta || rec.vigente_desde || rec.empresa || rec.placa;
        if (has) out.push(rec);
      }
      return out;
    });

    return { status: domRecords.length > 0 ? "success" : "empty", records: domRecords };
  } catch (e) {
    // evidencia
    try {
      const dir = path.join(__dirname, "screenshots");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const ts = Date.now();
      await page.screenshot({ path: path.join(dir, `mtc_stealth_error_${placa}_${ts}.png`), fullPage: true });
      const html = await page.content().catch(() => "");
      fs.writeFileSync(path.join(dir, `mtc_stealth_error_${placa}_${ts}.html`), html || "EMPTY_HTML", "utf8");
    } catch {
      // ignore
    }
    throw e;
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { consultCitvByPlacaPuppeteerStealth };

