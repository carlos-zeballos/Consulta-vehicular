/**
 * puno-papeletas-scraper.js
 * Municipalidad Provincial de Puno - Consulta de papeletas
 * Sitio: https://papeletas.munipuno.gob.pe/
 *
 * Requisito: Siempre retornar estructura (success true) y mensaje claro.
 */

const { chromium } = require('playwright');

class PunoPapeletasScraper {
  constructor(options = {}) {
    this.baseURL = 'https://papeletas.munipuno.gob.pe/';
    this.debug = options.debug === true;
  }

  async consultarPlaca(placa, maxAttempts = 2) {
    const normalized = String(placa || '').trim().toUpperCase();
    if (!normalized) {
      return { success: true, encontrado: false, placa: normalized, papeletas: [], mensaje: 'Placa requerida' };
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await this.consultarPlacaIntento(normalized);
        return res;
      } catch (e) {
        if (attempt === maxAttempts) {
          return {
            success: true,
            encontrado: false,
            placa: normalized,
            papeletas: [],
            mensaje: `Error consultando Puno: ${e.message}`
          };
        }
        await this.delay(2000);
      }
    }

    return { success: true, encontrado: false, placa: normalized, papeletas: [], mensaje: 'No se pudo consultar' };
  }

  async consultarPlacaIntento(placa) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto(this.baseURL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1500);

      // Buscar input de placa con heurística
      const plateSelectors = [
        '#placa',
        '#txtPlaca',
        'input[name="placa" i]',
        'input[id*="placa" i]',
        'input[placeholder*="placa" i]',
        'input[type="text"]'
      ];

      let plateSel = null;
      for (const s of plateSelectors) {
        const el = await page.$(s);
        if (el) {
          plateSel = s;
          break;
        }
      }

      if (!plateSel) {
        if (this.debug) await page.screenshot({ path: 'puno-debug-no-input.png', fullPage: true });
        throw new Error('No se encontró el campo de placa en Puno');
      }

      await page.fill(plateSel, placa);
      await page.waitForTimeout(400);

      // Botón buscar/consultar
      const btnSelectors = [
        'button:has-text("Buscar")',
        'button:has-text("Consultar")',
        'input[type="submit"]',
        'button[type="submit"]',
        'a:has-text("Buscar")',
        '#btnBuscar',
        '#btnConsultar'
      ];

      let clicked = false;
      for (const bs of btnSelectors) {
        const b = await page.$(bs);
        if (b) {
          await Promise.allSettled([
            page.waitForLoadState('networkidle', { timeout: 20000 }),
            b.click({ timeout: 5000 })
          ]);
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        // Intentar Enter
        await page.keyboard.press('Enter');
      }

      await page.waitForTimeout(2500);

      // Extraer: mensaje y/o tabla
      const data = await page.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const bodyText = clean(document.body?.innerText || '');

        const mensajeCandidates = [
          '#mensaje',
          '.alert',
          '.mensaje',
          '.text-danger',
          '.swal2-html-container',
          '.swal2-title'
        ];
        let mensaje = '';
        for (const sel of mensajeCandidates) {
          const el = document.querySelector(sel);
          if (el && clean(el.textContent)) {
            mensaje = clean(el.textContent);
            break;
          }
        }
        if (!mensaje) {
          // fallback: buscar frase típica
          const lower = bodyText.toLowerCase();
          if (lower.includes('no existe') && lower.includes('placa')) {
            // recuperar una línea "no existe..."
            const lines = bodyText.split('\n').map(l => clean(l)).filter(Boolean);
            const hit = lines.find(l => l.toLowerCase().includes('no existe') && l.toLowerCase().includes('placa'));
            if (hit) mensaje = hit;
          }
        }

        // Buscar tabla de resultados
        const table =
          document.querySelector('table.table') ||
          document.querySelector('table#tabla') ||
          document.querySelector('table[id*="table" i]') ||
          document.querySelector('table');

        let headers = [];
        let rows = [];
        if (table) {
          headers = Array.from(table.querySelectorAll('thead th')).map(th => clean(th.textContent));
          const trs = Array.from(table.querySelectorAll('tbody tr'));
          rows = trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => clean(td.textContent)));
        }

        return { mensaje, headers, rows, bodyText: bodyText.substring(0, 800) };
      });

      if (this.debug) {
        await page.screenshot({ path: 'puno-debug-result.png', fullPage: true });
      }

      // Si hay tabla con filas, devolverlas
      if (data.rows && Array.isArray(data.rows) && data.rows.length > 0) {
        const papeletas = data.rows.map((cells) => {
          const obj = {};
          (data.headers || []).forEach((h, idx) => {
            obj[h || `col_${idx + 1}`] = cells[idx] || '';
          });
          if (!Object.keys(obj).length) {
            return { fila: cells };
          }
          return obj;
        });

        await browser.close();
        return {
          success: true,
          encontrado: true,
          placa,
          papeletas,
          mensaje: data.mensaje || `Se encontraron ${papeletas.length} registro(s) en Puno`
        };
      }

      // Caso esperado: "no existe esta placa..."
      const lowerMsg = String(data.mensaje || '').toLowerCase();
      const lowerBody = String(data.bodyText || '').toLowerCase();
      const noExiste = (lowerMsg.includes('no existe') && lowerMsg.includes('placa')) ||
        (lowerBody.includes('no existe') && lowerBody.includes('placa'));

      await browser.close();
      return {
        success: true,
        encontrado: false,
        placa,
        papeletas: [],
        mensaje: data.mensaje || (noExiste ? 'No existe esta placa en el sistema' : 'No se encontraron registros')
      };
    } catch (e) {
      await browser.close();
      throw e;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PunoPapeletasScraper;

