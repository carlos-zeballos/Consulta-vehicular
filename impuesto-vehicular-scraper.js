/**
 * IMPUESTO VEHICULAR SAT LIMA - SCRAPER
 * Consulta de deuda de impuesto vehicular en el SAT de Lima
 * URL: https://www.sat.gob.pe/VirtualSAT/principal.aspx
 */

const { chromium } = require('playwright');
const axios = require('axios');
const FormData = require('form-data');

class ImpuestoVehicularScraper {
  constructor(captchaApiKey = null, opts = {}) {
    this.baseURL = 'https://www.sat.gob.pe/VirtualSAT/principal.aspx';
    this.stats = { attempts: 0, successes: 0, failures: 0 };
    this.debug = opts.debug === true || process.env.SCRAPER_DEBUG === 'true';
    
    // Configurar API key de 2Captcha si está disponible
    if (captchaApiKey) {
      captchaApiKey = captchaApiKey.trim();
      const match = captchaApiKey.match(/^([a-f0-9]{32})/i);
      if (match) {
        this.captchaApiKey = match[1];
      } else {
        this.captchaApiKey = captchaApiKey;
      }
    } else {
      this.captchaApiKey = process.env.CAPTCHA_API_KEY || null;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== MÉTODO PRINCIPAL ====================
  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [IMPUESTO VEHICULAR] Iniciando consulta para: ${placa}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarPlacaIntento(placa);
        
        if (resultado.success) {
          console.log(`✅ [IMPUESTO VEHICULAR] CONSULTA EXITOSA en intento ${attempt}`);
          this.stats.successes++;
          return resultado;
        }
        
        console.log(`⚠️ Intento ${attempt} falló, reintentando...`);
        await this.delay(3000);
        
      } catch (error) {
        console.error(`❌ Error en intento ${attempt}:`, error.message);
        this.stats.failures++;
        
        if (attempt === maxAttempts) {
          throw error;
        }
        
        await this.delay(5000);
      }
    }
    
    throw new Error(`No se pudo consultar la placa después de ${maxAttempts} intentos`);
  }

  // ==================== INTENTO INDIVIDUAL ====================
  async consultarPlacaIntento(placa) {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1366,768'
      ]
    });

    // debugDump debe existir incluso si falla antes de crear la página
    // (debe estar fuera del bloque try para que también exista en catch)
    let debugDump = async () => {};

    try {

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'es-PE',
        timezoneId: 'America/Lima'
      });

      const page = await context.newPage();
      let frame = null;

      debugDump = async (tag) => {
        if (!this.debug) return;
        try {
          const ts = Date.now();
          const fs = require('fs');
          const path = require('path');
          const dir = path.join(__dirname, 'screenshots');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const pngPath = path.join(dir, `impuesto-${tag}-${placa}-${ts}.png`);
          const htmlPath = path.join(dir, `impuesto-${tag}-${placa}-${ts}.html`);
          const frameHtmlPath = path.join(dir, `impuesto-${tag}-${placa}-${ts}-frame.html`);
          await page.screenshot({ path: pngPath, fullPage: true });
          fs.writeFileSync(htmlPath, await page.content(), 'utf8');
          if (frame) {
            try {
              fs.writeFileSync(frameHtmlPath, await frame.content(), 'utf8');
            } catch (e) {
              // ignore
            }
          }
          console.log(`   🧩 [DEBUG] Dump guardado: ${pngPath}`);
        } catch (e) {
          console.log(`   ⚠️ [DEBUG] No se pudo guardar dump: ${e.message}`);
        }
      };
      
      // 1. NAVEGAR A LA PÁGINA PRINCIPAL
      console.log('🌐 Navegando a la página principal del SAT...');
      await page.goto(this.baseURL, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      await this.delay(3000);

      const getMySession = () => {
        try {
          const u = new URL(page.url());
          return u.searchParams.get('mysession') || null;
        } catch {
          return null;
        }
      };
      const mysession = getMySession();
      const withSession = (url) => {
        try {
          if (!mysession) return url;
          const u = new URL(url);
          if (!u.searchParams.get('mysession')) u.searchParams.set('mysession', mysession);
          return u.toString();
        } catch {
          return url;
        }
      };

      // 1.1 Ir directo al módulo de Impuesto Vehicular (evita problemas de frameset)
      console.log('🧭 Abriendo módulo de Impuesto Vehicular (tri=V)...');
      try {
        await page.goto(withSession('https://www.sat.gob.pe/VirtualSAT/modulos/BusquedaTributario.aspx?tri=V'), {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        await this.delay(2000);
        // A veces SAT redirige a principal.aspx (frameset). En ese caso, NO es el módulo.
        if (/\/VirtualSAT\/principal\.aspx/i.test(page.url())) {
          console.log(`ℹ️ Redirección a principal.aspx detectada (frameset). Continuando con navegación vía fraRightFrame...`);
          frame = null;
        } else {
          frame = page.mainFrame();
          console.log(`✅ Módulo abierto: ${page.url()}`);
        }
      } catch (e) {
        console.log(`⚠️ No se pudo abrir módulo directo (continuando con frameset): ${e.message}`);
      }

      // 2. BUSCAR EL FRAME/IFRAME
      console.log('🔍 Buscando frame principal...');
      if (!frame) frame = null;
      const frames = page.frames();
      if (this.debug) {
        console.log(`   🧩 [DEBUG] URL actual: ${page.url()}`);
        console.log(`   🧩 [DEBUG] Frames detectados: ${frames.length}`);
        for (const f of frames) {
          console.log(`   🧩 [DEBUG] Frame URL: ${f.url()}`);
        }
      }

      // Preferir el frame principal de contenido (frameset)
      if (!frame) {
        const rightFrameByName = page.frame({ name: 'fraRightFrame' });
        if (rightFrameByName) {
          frame = rightFrameByName;
          console.log(`✅ Frame por nombre encontrado: ${frame.url()}`);
        }
      }
      
      // Buscar frame que contenga el formulario
      if (!frame) {
        for (const f of frames) {
          const url = f.url();
          if (url.includes('bienvenida.aspx') || url.includes('BusquedaTributario')) {
            frame = f;
            console.log(`✅ Frame encontrado: ${url}`);
            break;
          }
        }
      }

      // Si no encontramos frame, esperar a que se cargue
      if (!frame) {
        console.log('⏳ Esperando a que se cargue el frame...');
        await this.delay(3000);
        const framesAfter = page.frames();
        for (const f of framesAfter) {
          const url = f.url();
          if (url.includes('bienvenida.aspx') || url.includes('BusquedaTributario') || url.includes('sat.gob.pe')) {
            frame = f;
            console.log(`✅ Frame encontrado después de esperar: ${url}`);
            break;
          }
        }
      }

      // Si aún no hay frame, intentar navegar directamente
      if (!frame) {
        console.log('⚠️ No se encontró frame, intentando navegar directamente...');
        try {
          await page.goto('https://www.sat.gob.pe/VirtualSAT/modulos/BusquedaTributario.aspx?tri=V', {
            waitUntil: 'networkidle',
            timeout: 30000
          });
          await this.delay(2000);
          frame = page.mainFrame();
        } catch (e) {
          console.log('❌ Error navegando directamente:', e.message);
        }
      }

      if (!frame) {
        await debugDump('no-frame');
        throw new Error('No se pudo encontrar el frame del formulario');
      }

      // Helper para refrescar frame (evita "Frame was detached")
      const refreshFrame = () => page.frame({ name: 'fraRightFrame' }) || page.mainFrame();
      const gotoInRightFrame = async (url, max = 3) => {
        let lastErr = null;
        for (let i = 1; i <= max; i++) {
          const f = refreshFrame();
          try {
            // En frames SAT, networkidle suele causar detach; usar load/domcontentloaded es más estable
            await f.goto(withSession(url), { waitUntil: 'load', timeout: 30000 });
            return f;
          } catch (e) {
            lastErr = e;
            const msg = e?.message || '';
            if (msg.toLowerCase().includes('detached')) {
              await this.delay(500 + i * 250);
              continue;
            }
            throw e;
          }
        }
        throw lastErr || new Error('No se pudo navegar en fraRightFrame');
      };

      // 2.1 Si estamos en la bienvenida, entrar a "Consulta Tributos"
      if (frame.url().includes('bienvenida.aspx')) {
        console.log('🧭 Estamos en bienvenida, navegando a "Consulta Tributos"...');
        try {
          const locatorCandidates = [
            'a:has-text("Consulta Tributos")',
            'div:has-text("Consulta Tributos")',
            'span:has-text("Consulta Tributos")',
            'text=Consulta Tributos'
          ];

          let clicked = false;
          for (const sel of locatorCandidates) {
            const loc = frame.locator(sel).first();
            if (await loc.count()) {
              await loc.click({ timeout: 10000 });
              clicked = true;
              console.log(`✅ Click en "Consulta Tributos" con selector: ${sel}`);
              break;
            }
          }

          if (clicked) {
            // Esperar a que el frame derecho navegue a la pantalla de búsqueda
            await page.waitForEvent('framenavigated', {
              timeout: 20000,
              predicate: (f) => {
                try {
                  return f.name() === 'fraRightFrame' && /BusquedaTributario|Busqueda/i.test(f.url());
                } catch {
                  return false;
                }
              }
            });
          } else {
            console.log('⚠️ No se encontró el botón "Consulta Tributos", intentando URL directa...');
            await gotoInRightFrame('https://www.sat.gob.pe/VirtualSAT/modulos/BusquedaTributario.aspx?tri=V', 3);
          }

          // Re-resolver frame derecho después de navegación
          frame = refreshFrame();
          console.log(`✅ Frame actualizado: ${frame.url()}`);
          await this.delay(2000);

          // Importante: forzar módulo de IMPUESTO VEHICULAR (tri=V) si estamos en otro tri
          if (/BusquedaTributario/i.test(frame.url()) && !/[?&]tri=V/i.test(frame.url())) {
            console.log('🧭 Cambiando a Impuesto Vehicular (tri=V)...');
            let changed = false;
            try {
              const linkVehicular = frame.locator('#menuOption02, a#menuOption02, a[href*=\"tri=V\"], a:has-text(\"Impuesto Vehicular\")').first();
              if (await linkVehicular.count()) {
                await linkVehicular.click({ timeout: 15000 });
                changed = true;
              }
            } catch {}

            if (!changed) {
              // Fallback: navegar directo
              await gotoInRightFrame('https://www.sat.gob.pe/VirtualSAT/modulos/BusquedaTributario.aspx?tri=V', 3);
            }

            await this.delay(2500);
            frame = refreshFrame();
            console.log(`✅ Frame (pos tri=V): ${frame.url()}`);
          }
        } catch (e) {
          console.log(`⚠️ No se pudo navegar desde bienvenida: ${e.message}`);
          await debugDump('bienvenida-nav-failed');
        }
      }

      // 3. ESPERAR A QUE EL FORMULARIO ESTÉ LISTO
      console.log('⏳ Esperando a que el formulario esté listo...');
      await this.delay(2000);

      // 3.1 SELECCIONAR "BÚSQUEDA POR PLACA" desde el combo #tipoBusqueda
      try {
        const combo = frame.locator('#tipoBusqueda');
        if (await combo.count()) {
          await frame.selectOption('#tipoBusqueda', { value: 'divBuscaPlaca' });
          await this.delay(800);
          console.log('✅ Opción "Búsqueda por placa" seleccionada (tipoBusqueda=divBuscaPlaca)');
        } else {
          console.log('ℹ️ No se encontró #tipoBusqueda (continuando con heurísticas)');
        }
      } catch (e) {
        console.log(`ℹ️ No se pudo seleccionar en #tipoBusqueda: ${e.message}`);
      }

      // Esperar a que se muestre el div de placa
      try {
        await frame.waitForSelector('#ctl00_cplPrincipal_divBuscaPlaca', { timeout: 8000 });
      } catch {}

      // Buscar el campo de placa
      const placaSelectors = [
        // Comunes SAT (variantes ASP.NET)
        '#ctl00_cplPrincipal_divBuscaPlaca input[type="text"]',
        'input[placeholder*="PLACA" i]',
        'input[placeholder*="Placa" i]',
        'input[aria-label*="Placa" i]',
        '#txtPlaca',
        '#ctl00_cplPrincipal_txtPlaca',
        'input[id*="txtPlaca" i]',
        'input[name*="Placa" i]',
        'input[id*="placa" i]',
        'input[type="text"]'
      ];

      let placaInput = null;
      for (const selector of placaSelectors) {
        try {
          await frame.waitForSelector(selector, { timeout: 5000 });
          placaInput = await frame.$(selector);
          if (placaInput) {
            console.log(`✅ Campo de placa encontrado: ${selector}`);
            break;
          }
        } catch (e) {
          // Continuar con el siguiente selector
        }
      }

      if (!placaInput) {
        // Intentar encontrar cualquier input de texto
        const inputs = await frame.$$('input[type="text"]');
        if (inputs.length > 0) {
          placaInput = inputs[0];
          console.log('✅ Usando primer input de texto encontrado');
        }
      }

      if (!placaInput) {
        await debugDump('no-placa-input');
        throw new Error('No se encontró el campo de placa');
      }

      await debugDump('pre-submit');

      // 4. LLENAR EL FORMULARIO
      console.log(`📝 Llenando formulario con placa: ${placa}`);
      await placaInput.fill(placa);
      await this.delay(1000);

      // 5. RESOLVER CAPTCHA
      console.log('🔐 Resolviendo CAPTCHA...');
      await this.solveCaptcha(frame);

      // 6. BUSCAR Y HACER CLIC EN EL BOTÓN DE CONSULTA
      console.log('🔍 Buscando botón de consulta...');
      const buttonSelectors = [
        '#btnConsultar',
        '#ctl00_cplPrincipal_btnConsultar',
        '#btnBuscar',
        '#ctl00_cplPrincipal_btnBuscar',
        'input[type="submit"]',
        'button[type="submit"]',
        'input[value*="Consultar" i]',
        'input[value*="Buscar" i]',
        'button:has-text("Consultar")'
      ];

      let buttonClicked = false;
      for (const selector of buttonSelectors) {
        try {
          const button = await frame.$(selector);
          if (button) {
            await button.click();
            buttonClicked = true;
            console.log(`✅ Botón encontrado y clickeado: ${selector}`);
            break;
          }
        } catch (e) {
          // Continuar con el siguiente selector
        }
      }

      if (!buttonClicked) {
        // Intentar hacer submit del formulario
        await frame.evaluate(() => {
          const form = document.querySelector('form');
          if (form) {
            form.submit();
          }
        });
        console.log('✅ Formulario enviado mediante submit()');
      }

      // 7. ESPERAR RESULTADOS
      console.log('⏳ Esperando resultados...');
      await this.delay(4000);

      // Esperar a tabla específica de contribuyentes o cualquier tabla
      frame = refreshFrame();
      try { await frame.waitForSelector('#ctl00_cplPrincipal_grdAdministrados', { timeout: 30000 }); } catch {}
      try { await frame.waitForSelector('table', { timeout: 20000 }); } catch {}
      await debugDump('post-submit');

      // 8. EXTRAER RESULTADOS
      const resultado = await frame.evaluate(() => {
        const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

        // Buscar mensaje de "no encontrado"
        const mensajes = [
          'Se encontraron 0 coincidencias',
          'no se encontraron',
          'sin registros',
          'no hay resultados'
        ];

        const bodyText = document.body.innerText.toLowerCase();
        for (const msg of mensajes) {
          if (bodyText.includes(msg)) {
            return { encontrado: false, mensaje: 'Se encontraron 0 coincidencias para su búsqueda.' };
          }
        }

        // 1) Tabla esperada de contribuyentes encontrados
        const tablaAdmins = document.querySelector('#ctl00_cplPrincipal_grdAdministrados');
        if (tablaAdmins) {
          const filas = Array.from(tablaAdmins.querySelectorAll('tr'));
          const headers = Array.from(filas[0].querySelectorAll('th, td')).map(h => h.innerText.trim());
          const rows = [];
          for (let i = 1; i < filas.length; i++) {
            const tds = Array.from(filas[i].querySelectorAll('td'));
            if (!tds.length) continue;
            const codigo = (tds[0]?.innerText || '').trim();
            const contribuyente = (tds[1]?.innerText || '').trim();
            if (codigo || contribuyente) rows.push({ codigo, contribuyente });
          }
          return { encontrado: rows.length > 0, resumen: rows };
        }

        // 2) Fallback: tabla genérica de resultados (código/contribuyente)
        const tablas = Array.from(document.querySelectorAll('table'));
        const parseTable = (table) => {
          const filas = Array.from(table.querySelectorAll('tr'));
          if (filas.length < 2) return null;
          const headers = Array.from(filas[0].querySelectorAll('th, td')).map(h => h.innerText.trim());
          const hNorm = headers.map(norm);
          // Heurística: debe incluir "codigo" y "contribuyente"
          if (!(hNorm.some(h => h.includes('codigo')) && hNorm.some(h => h.includes('contribuyente')))) return null;
          const rows = [];
          for (let i = 1; i < filas.length; i++) {
            const celdas = Array.from(filas[i].querySelectorAll('td'));
            if (!celdas.length) continue;
            const row = {};
            headers.forEach((header, idx) => {
              row[header] = celdas[idx]?.innerText.trim() || '';
            });
            rows.push(row);
          }
          if (!rows.length) return null;
          return { headers, rows };
        };

        let resumen = null;
        for (const t of tablas) {
          const parsed = parseTable(t);
          if (parsed) {
            resumen = parsed;
            break;
          }
        }

        // También capturar el primer link de contribuyente para click externo
        let contribuyenteText = null;
        if (resumen?.rows?.length) {
          contribuyenteText = Object.values(resumen.rows[0]).find(v => norm(v).includes('garcia') || norm(v).includes('contrib')) || null;
        }

        if (resumen) {
          return { encontrado: true, resumen: resumen.rows };
        }

        // Fallback: cualquier tabla con filas
        for (const tabla of tablas) {
          const filas = tabla.querySelectorAll('tr');
          if (filas.length > 1) {
            const headers = Array.from(filas[0].querySelectorAll('th, td')).map(h => h.innerText.trim());
            const rows = [];
            for (let i = 1; i < filas.length; i++) {
              const celdas = Array.from(filas[i].querySelectorAll('td'));
              if (celdas.length > 0) {
                const row = {};
                headers.forEach((header, idx) => {
                  row[header] = celdas[idx]?.innerText.trim() || '';
                });
                rows.push(row);
              }
            }
            if (rows.length > 0) {
              return { encontrado: true, resumen: rows, _fallback: true };
            }
          }
        }

        return { encontrado: false, mensaje: 'No se encontraron resultados' };
      });

      // 9. SI HAY RESUMEN, INTENTAR CLICK EN CONTRIBUYENTE Y EXTRAER DETALLE
      let detalle = [];
      if (resultado.encontrado) {
        try {
          frame = refreshFrame();
          // Click directo a lnkNombre (contribuyente) si existe
          const linkNombre = frame.locator('a[id*="lnkNombre" i]').first();
          const linkAny = frame.locator('#ctl00_cplPrincipal_grdAdministrados a').nth(1);
          const link = (await linkNombre.count()) ? linkNombre : linkAny;

          if (await link.count()) {
            console.log('🖱️ Haciendo clic en contribuyente para ver detalle...');
            await link.click({ timeout: 15000 });
            await this.delay(2500);

            // Esperar tabla detalle (con "Año" y "Cuota")
            frame = refreshFrame();
            await frame.waitForSelector('table', { timeout: 20000 });
            detalle = await frame.evaluate(() => {
              const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
              const tablas = Array.from(document.querySelectorAll('table'));
              const parse = (table) => {
                const filas = Array.from(table.querySelectorAll('tr'));
                if (filas.length < 2) return null;
                const headers = Array.from(filas[0].querySelectorAll('th, td')).map(h => h.innerText.trim());
                const hNorm = headers.map(norm);
                if (!(hNorm.some(h => h === 'ano' || h.includes('ano') || h.includes('año')) && hNorm.some(h => h.includes('cuota')))) return null;
                const rows = [];
                for (let i = 1; i < filas.length; i++) {
                  const celdas = Array.from(filas[i].querySelectorAll('td'));
                  if (!celdas.length) continue;
                  const row = {};
                  headers.forEach((header, idx) => {
                    row[header] = celdas[idx]?.innerText.trim() || '';
                  });
                  // Heurística: fila válida debe tener año (4 dígitos) y algún documento
                  const values = Object.values(row).join(' ');
                  if (/\b20\d{2}\b/.test(values)) rows.push(row);
                }
                return rows.length ? rows : null;
              };
              for (const t of tablas) {
                const rows = parse(t);
                if (rows) return rows;
              }
              return [];
            });
            console.log(`✅ Detalle extraído: ${detalle.length} registro(s)`);
          } else {
            console.log('ℹ️ No se encontró link para contribuyente (sin detalle)');
          }
        } catch (e) {
          console.log(`⚠️ No se pudo extraer detalle: ${e.message}`);
        }
      }

      if (resultado.encontrado) {
        await browser.close();
        return {
          success: true,
          placa: placa,
          encontrado: true,
          datos: resultado.resumen || [],
          detalle: detalle || [],
          mensaje: 'Consulta exitosa'
        };
      } else {
        await debugDump('no-results');
        await browser.close();
        return {
          success: true,
          placa: placa,
          encontrado: false,
          datos: [],
          mensaje: resultado.mensaje || 'Se encontraron 0 coincidencias para su búsqueda.'
        };
      }

    } catch (error) {
      await debugDump('error');
      await browser.close();
      throw error;
    }
  }

  // ==================== RESOLVER CAPTCHA ====================
  async solveCaptcha(frame) {
    console.log('   📸 Obteniendo imagen del CAPTCHA...');
    
    await this.delay(2000);
    
    // Buscar imagen del CAPTCHA
    const captchaInfo = await frame.evaluate(() => {
      const captchaSelectors = [
        'img[src*="captcha" i]',
        'img[id*="captcha" i]',
        'img[name*="captcha" i]',
        'img[alt*="código" i]',
        'img[alt*="codigo" i]',
        'img[alt*="captcha" i]',
        'img[class*="captcha" i]',
        'img[src*="ImageHandler" i]',
        'img[src*="ImageGenerator" i]'
      ];
      
      for (const selector of captchaSelectors) {
        const img = document.querySelector(selector);
        if (img && img.src && !img.src.includes('ajax-loader') && !img.src.includes('loading')) {
          return { found: true, src: img.src, selector: selector };
        }
      }
      return { found: false };
    });
    
    if (!captchaInfo.found) {
      console.log('   ⚠️ No se encontró imagen CAPTCHA, puede que no sea necesario');
      return;
    }
    
    console.log(`   🔍 Imagen CAPTCHA encontrada (selector: ${captchaInfo.selector})`);
    
    let base64Data = '';
    try {
      const imgElement = await frame.$(captchaInfo.selector);
      if (imgElement) {
        const screenshot = await imgElement.screenshot({ type: 'png' });
        base64Data = screenshot.toString('base64');
        console.log(`   ✅ Imagen CAPTCHA obtenida (longitud: ${base64Data.length} chars)`);
      } else {
        throw new Error('No se pudo obtener el elemento de imagen CAPTCHA');
      }
    } catch (imgError) {
      throw new Error(`Error obteniendo imagen CAPTCHA: ${imgError.message}`);
    }
    
    if (!base64Data || base64Data.length < 100) {
      throw new Error('La imagen del CAPTCHA está vacía o es muy pequeña');
    }
    
    if (!this.captchaApiKey) {
      throw new Error('API Key de 2Captcha no configurada');
    }

    // Enviar a 2Captcha
    console.log('   📤 Enviando CAPTCHA a 2Captcha...');
    const formData = new FormData();
    formData.append('method', 'base64');
    formData.append('key', this.captchaApiKey);
    formData.append('body', base64Data);
    formData.append('json', 1);

    const response = await axios.post('http://2captcha.com/in.php', formData, {
      headers: formData.getHeaders()
    });

    if (response.data.status !== 1) {
      throw new Error(`2Captcha error: ${response.data.request}`);
    }

    const captchaId = response.data.request;
    console.log(`   ✅ CAPTCHA enviado, ID: ${captchaId}`);

    // Esperar solución
    console.log('   ⏳ Esperando solución del CAPTCHA (puede tardar 10-40 segundos)...');
    for (let i = 0; i < 40; i++) {
      await this.delay(2000);
      
      const resultResponse = await axios.get(`http://2captcha.com/res.php?key=${this.captchaApiKey}&action=get&id=${captchaId}&json=1`);
      
      if (resultResponse.data.status === 1) {
        const solution = resultResponse.data.request;
        console.log(`   ✅ CAPTCHA resuelto: ${solution}`);
        
        // Ingresar solución en el campo
        const captchaInputSelectors = [
          '#txtCaptcha',
          '#ctl00_cplPrincipal_txtCaptcha',
          'input[name*="captcha" i]',
          'input[id*="captcha" i]',
          'input[type="text"]'
        ];

        for (const selector of captchaInputSelectors) {
          try {
            const input = await frame.$(selector);
            if (input) {
              await input.fill(solution);
              console.log(`   ✅ Solución ingresada en: ${selector}`);
              break;
            }
          } catch (e) {
            // Continuar
          }
        }
        
        return;
      }
      
      if (resultResponse.data.request === 'CAPCHA_NOT_READY') {
        continue;
      }
    }
    
    throw new Error('CAPTCHA no resuelto a tiempo (80s timeout)');
  }
}

module.exports = ImpuestoVehicularScraper;
