/**
 * PIT (Foto PIT) - Estados de Cuentas (Velocidad)
 * URL: http://www.pit.gob.pe/pit2007/EstadoCuentaVelocidad.aspx
 *
 * Flujo:
 * - Ingresar placa
 * - Resolver captcha si existe (imagen o reCAPTCHA)
 * - Buscar por placa
 * - Extraer tabla #grdEstadoCuenta (Placa, Documento, Fecha, Total, Estado, Falta, Licencia)
 * - Extraer links de evidencia fotográfica (lupa) si existen
 */

const { chromium } = require('playwright');
const axios = require('axios');
const FormData = require('form-data');

class PitFotoScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'http://www.pit.gob.pe/pit2007/EstadoCuentaVelocidad.aspx';
    this.captchaApiKey = (captchaApiKey || process.env.CAPTCHA_API_KEY || '').trim() || null;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async consultarPlaca(placa) {
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
      const placaUpper = (placa || '').toString().trim().toUpperCase();

      console.log(`\n[PIT-FOTO] Iniciando consulta - Placa: ${placaUpper}`);
      await page.goto(this.baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.delay(1200);

      // 1) Completar placa
      await page.waitForSelector('#txtPlaca, input[name="txtPlaca"]', { timeout: 20000 });
      await page.fill('#txtPlaca, input[name="txtPlaca"]', placaUpper);
      await this.delay(300);

      // 2) Resolver CAPTCHA si existe (imagen / reCAPTCHA). Si no existe, continuar.
      await this.solveCaptchaIfPresent(page);

      // 3) Click buscar por placa (input type=image)
      const clicked = await this.clickFirst(page, [
        '#btnBuscarPlaca',
        'input[name="btnBuscarPlaca"]',
        'input[type="image"][id*="BuscarPlaca" i]',
        'input[type="image"][name*="BuscarPlaca" i]'
      ]);

      if (!clicked) {
        // fallback: submit
        await page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) form.submit();
        });
      }

      // 4) Esperar resultados
      await page.waitForTimeout(1500);
      await page.waitForSelector('#grdEstadoCuenta, #lblMensajeVacio, #lblMensajeRespuestaError', { timeout: 30000 }).catch(() => {});
      await this.delay(800);

      const result = await page.evaluate(() => {
        const mensaje = (document.querySelector('#lblMensajeVacio')?.textContent || '').trim()
          || (document.querySelector('#lblMensajeRespuestaError')?.textContent || '').trim()
          || '';

        const table = document.querySelector('#grdEstadoCuenta');
        const rows = [];
        if (table) {
          const trs = Array.from(table.querySelectorAll('tr'));
          for (let i = 1; i < trs.length; i++) {
            const tds = Array.from(trs[i].querySelectorAll('td'));
            if (!tds.length) continue;
            const evidenciaLink = tds[1]?.querySelector('a[href]')?.getAttribute('href') || '';
            rows.push({
              placa: (tds[0]?.textContent || '').trim(),
              documento: (tds[1]?.innerText || '').trim().replace(/\s+/g, ' '),
              fecha: (tds[2]?.textContent || '').trim(),
              totalPagar: (tds[3]?.textContent || '').trim(),
              estado: (tds[4]?.textContent || '').trim(),
              falta: (tds[5]?.textContent || '').trim(),
              licencia: (tds[6]?.textContent || '').trim(),
              evidenciaUrl: evidenciaLink
            });
          }
        }
        return { mensaje, rows };
      });

      const papeletas = (result.rows || []).filter(r => r.placa || r.documento);
      const mensaje = result.mensaje || (papeletas.length ? `Se encontraron ${papeletas.length} registro(s)` : 'Sin registros');

      console.log(`[PIT-FOTO] Papeletas: ${papeletas.length}`);
      if (mensaje) console.log(`[PIT-FOTO] Mensaje: ${mensaje}`);

      return {
        success: true,
        placa: placaUpper,
        encontrado: papeletas.length > 0,
        papeletas,
        mensaje
      };

    } catch (e) {
      console.log(`[PIT-FOTO] Error: ${e.message}`);
      return {
        success: true,
        placa: (placa || '').toString().trim().toUpperCase(),
        encontrado: false,
        papeletas: [],
        mensaje: e.message || 'Error consultando PIT'
      };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  async clickFirst(page, selectors) {
    for (const sel of selectors) {
      try {
        const loc = page.locator(sel).first();
        if (await loc.count()) {
          await loc.click({ timeout: 8000 });
          return true;
        }
      } catch {}
    }
    return false;
  }

  async solveCaptchaIfPresent(page) {
    // reCAPTCHA?
    const hasRecaptcha = await page.evaluate(() => {
      return document.querySelector('.g-recaptcha') ||
        document.querySelector('iframe[src*="recaptcha"]') ||
        document.querySelector('[data-sitekey]');
    });
    if (hasRecaptcha) {
      if (!this.captchaApiKey) throw new Error('API Key de 2Captcha no configurada');
      const siteKey = await page.evaluate(() => {
        const el = document.querySelector('[data-sitekey]');
        return el ? el.getAttribute('data-sitekey') : null;
      });
      if (!siteKey) return;
      const token = await this.resolveRecaptchaV2(siteKey, page.url());
      await page.evaluate((t) => {
        const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
        if (textarea) {
          textarea.value = t;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, token);
      await this.delay(1200);
      return;
    }

    // Captcha imagen + input (si existe)
    const captcha = await page.evaluate(() => {
      const img = document.querySelector('img[src*="captcha" i], img[id*="captcha" i], img[alt*="captcha" i]');
      const input = document.querySelector('input[id*="captcha" i], input[name*="captcha" i]');
      return {
        has: !!(img && input),
        imgSelector: img ? (img.id ? `#${img.id}` : 'img[src*="captcha" i]') : null,
        inputSelector: input ? (input.id ? `#${input.id}` : 'input[id*="captcha" i]') : null
      };
    });

    if (!captcha.has) return;
    if (!this.captchaApiKey) throw new Error('API Key de 2Captcha no configurada');

    const imgEl = await page.$(captcha.imgSelector);
    const buf = await imgEl.screenshot({ type: 'png' });
    const base64Data = buf.toString('base64');
    const solution = await this.solveImageCaptcha(base64Data);
    await page.fill(captcha.inputSelector, solution);
    await this.delay(500);
  }

  async solveImageCaptcha(base64Data) {
    const formData = new FormData();
    formData.append('method', 'base64');
    formData.append('key', this.captchaApiKey);
    formData.append('body', base64Data);
    formData.append('json', 1);

    const upload = await axios.post('http://2captcha.com/in.php', formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });
    if (!upload.data || upload.data.status !== 1) {
      throw new Error(`2Captcha error: ${upload.data?.request || 'Unknown'}`);
    }
    const id = upload.data.request;

    for (let i = 0; i < 40; i++) {
      await this.delay(2000);
      const res = await axios.get('http://2captcha.com/res.php', {
        params: { key: this.captchaApiKey, action: 'get', id, json: 1 },
        timeout: 10000
      });
      if (res.data.status === 1) return res.data.request;
      if (res.data.request !== 'CAPCHA_NOT_READY') throw new Error(`2Captcha error: ${res.data.request}`);
    }
    throw new Error('CAPTCHA no resuelto a tiempo');
  }

  async resolveRecaptchaV2(siteKey, pageURL) {
    const formData = new FormData();
    formData.append('method', 'userrecaptcha');
    formData.append('key', this.captchaApiKey);
    formData.append('googlekey', siteKey);
    formData.append('pageurl', pageURL);
    formData.append('json', '1');

    const upload = await axios.post('http://2captcha.com/in.php', formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });
    if (!upload.data || upload.data.status !== 1) {
      throw new Error(`Error subiendo reCAPTCHA: ${upload.data?.request || 'Unknown'}`);
    }
    const id = upload.data.request;

    for (let i = 0; i < 40; i++) {
      await this.delay(5000);
      const res = await axios.get('http://2captcha.com/res.php', {
        params: { key: this.captchaApiKey, action: 'get', id, json: 1 },
        timeout: 10000
      });
      if (res.data.status === 1) return res.data.request;
      if (res.data.request !== 'CAPCHA_NOT_READY') throw new Error(`Error reCAPTCHA: ${res.data.request}`);
    }
    throw new Error('Timeout esperando solución del reCAPTCHA');
  }
}

module.exports = PitFotoScraper;

