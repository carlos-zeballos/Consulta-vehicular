/**
 * PIURA - MULTAS DE TRÁNSITO SCRAPER
 * Consulta de multas de tránsito en la Municipalidad de Piura
 * Maneja formulario que abre resultados en nueva ventana
 */

const { chromium } = require('playwright');
const axios = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio');

class PiuraMultasScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'http://www.munipiura.gob.pe/consulta-de-multas-de-transito#buscar-por-placa';
    this.resultURL = 'http://www2.munipiura.gob.pe/institucional/transparencia/transitoxplamot.asp';
    this.stats = { attempts: 0, successes: 0, failures: 0 };
    
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

  // ==================== MÉTODO PRINCIPAL ====================
  async consultarPlaca(placa, maxAttempts = 3) {
    console.log(`\n🔍 [PIURA] Iniciando consulta para: ${placa}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`\n🔄 Intento ${attempt}/${maxAttempts}`);
        this.stats.attempts++;
        
        const resultado = await this.consultarPlacaIntento(placa);
        
        // Verificar si el resultado tiene multas (éxito real)
        const hasMultas = resultado.multas && Array.isArray(resultado.multas) && resultado.multas.length > 0;
        
        if (resultado.success && hasMultas) {
          console.log(`✅ [PIURA] CONSULTA EXITOSA en intento ${attempt} - ${resultado.multas.length} multa(s) encontrada(s)`);
          this.stats.successes++;
          return resultado;
        }
        
        // Si success es true pero no hay multas, puede ser un resultado vacío válido
        if (resultado.success && !hasMultas) {
          console.log(`⚠️ Intento ${attempt} completado pero sin multas`);
          if (attempt === maxAttempts) {
            console.log(`⚠️ Último intento, devolviendo resultado vacío`);
            return resultado;
          }
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

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'es-PE',
        timezoneId: 'America/Lima'
      });

      // Escuchar eventos de nuevas páginas (ventanas que se abren)
      let resultPage = null;
      const pagePromise = new Promise((resolve) => {
        context.on('page', async (newPage) => {
          console.log('   📄 Nueva página detectada:', newPage.url());
          // Esperar a que la página cargue la URL correcta
          try {
            await newPage.waitForLoadState('networkidle', { timeout: 30000 });
            const url = newPage.url();
            if (url && url !== 'about:blank' && url.includes('transitoxplamot')) {
              console.log('   ✅ Página de resultados cargada:', url);
              resolve(newPage);
            } else {
              // Esperar un poco más y verificar de nuevo
              await this.delay(3000);
              const finalUrl = newPage.url();
              if (finalUrl && finalUrl !== 'about:blank') {
                console.log('   ✅ Página de resultados cargada (retry):', finalUrl);
                resolve(newPage);
              }
            }
          } catch (e) {
            console.log('   ⚠️ Error esperando carga de nueva página:', e.message);
            resolve(newPage); // Resolver de todas formas
          }
        });
      });

      const page = await context.newPage();
      
      // 1. NAVEGAR A LA PÁGINA
      console.log('🌐 Navegando a la página de multas...');
      await page.goto(this.baseURL, {
        waitUntil: 'networkidle',
        timeout: 60000
      });
      
      await this.delay(3000);
      
      // 2. ESPERAR A QUE EL FORMULARIO ESTÉ LISTO
      console.log('⏳ Esperando formulario...');
      await this.waitForFormEnabled(page);
      
      // 3. VERIFICAR Y RESOLVER CAPTCHA SI ES NECESARIO
      console.log('🔐 Verificando CAPTCHA...');
      const captchaResolved = await this.checkAndSolveCaptcha(page);
      
      // 4. LLENAR FORMULARIO
      console.log('📝 Llenando formulario...');
      await this.fillForm(page, placa);

      // IMPORTANTÍSIMO:
      // El portal de resultados (transitoxplamot.asp) funciona por POST (PlaMot=PLACA).
      // En Playwright, page.goto NO soporta method/postData, así que la navegación "POST" no aplica.
      // Para que SIEMPRE obtengamos el texto exacto (incl. "Se encontraron 0 coincidencias..."),
      // hacemos la consulta por HTTP directo.
      console.log('📤 Consultando resultados por HTTP directo (POST)...');
      const httpResult = await this.extractResultsHttp(placa);
      await browser.close();
      return httpResult;
      
      // 5. ENVIAR FORMULARIO Y ESPERAR NUEVA VENTANA
      console.log('📤 Enviando formulario y esperando nueva ventana...');
      
      // Hacer clic en el botón usando evaluate (sin esperar visibilidad)
      const buttonClicked = await page.evaluate(() => {
        const button = document.querySelector('input[name="Submit"][value="Buscar"]');
        if (button) {
          button.click();
          return true;
        }
        return false;
      });
      
      if (!buttonClicked) {
        // Si no se encuentra el botón, intentar submit del formulario directamente
        console.log('   ⚠️ Botón no encontrado, enviando formulario directamente...');
        await page.evaluate(() => {
          const form = document.querySelector('form[name="form1"]');
          if (form) {
            form.submit();
          }
        });
      }
      
      // Esperar a que se abra la nueva ventana (máximo 20 segundos)
      try {
        resultPage = await Promise.race([
          pagePromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout esperando nueva ventana')), 20000))
        ]);
        console.log('   ✅ Nueva ventana detectada y cargada');
        
        // Verificar que la URL sea correcta
        const resultUrl = resultPage.url();
        if (resultUrl === 'about:blank' || !resultUrl.includes('transitoxplamot')) {
          console.log('   ⚠️ URL no es la esperada, intentando POST directo...');
          await resultPage.close();
          resultPage = await context.newPage();
          await resultPage.goto(this.resultURL, {
            method: 'POST',
            postData: `PlaMot=${encodeURIComponent(placa.toUpperCase())}`,
            waitUntil: 'networkidle',
            timeout: 30000
          });
        }
      } catch (e) {
        // Si no se abre nueva ventana, intentar navegar directamente con POST
        console.log('   ⚠️ No se detectó nueva ventana, intentando POST directo...');
        resultPage = await context.newPage();
        
        // Hacer POST directo al endpoint de resultados
        await resultPage.goto(this.resultURL, {
          method: 'POST',
          postData: `PlaMot=${encodeURIComponent(placa.toUpperCase())}`,
          waitUntil: 'networkidle',
          timeout: 30000
        });
      }
      
      // Esperar a que la página de resultados cargue completamente
      await this.delay(5000);
      await resultPage.waitForLoadState('networkidle', { timeout: 30000 });
      
      // 6. EXTRAER RESULTADOS DE LA NUEVA VENTANA
      console.log('📊 Extrayendo resultados...');
      const resultados = await this.extractResults(resultPage, placa);
      
      await browser.close();
      return resultados;
      
    } catch (error) {
      await browser.close().catch(() => {});
      throw error;
    }
  }

  // ==================== ESPERAR FORMULARIO ====================
  async waitForFormEnabled(page) {
    const selectors = [
      'input[name="PlaMot"]',
      'input[name="PLACA"]',
      'input[type="text"]'
    ];
    
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { state: 'attached', timeout: 15000 });
        console.log(`   ✅ Campo encontrado: ${selector}`);
        return;
      } catch (e) {
        continue;
      }
    }
    
    throw new Error('No se encontró el campo de placa en el formulario');
  }

  // ==================== VERIFICAR Y RESOLVER CAPTCHA ====================
  async checkAndSolveCaptcha(page) {
    // Verificar si hay reCAPTCHA
    const hasRecaptcha = await page.evaluate(() => {
      return document.querySelector('.g-recaptcha') !== null ||
             document.querySelector('iframe[src*="recaptcha"]') !== null ||
             document.querySelector('[data-sitekey]') !== null;
    });
    
    if (!hasRecaptcha) {
      console.log('   ✅ No se requiere CAPTCHA');
      return true;
    }
    
    console.log('   🔐 reCAPTCHA detectado, resolviendo...');
    
    if (!this.captchaApiKey) {
      throw new Error('API Key de 2Captcha no configurada. Configure CAPTCHA_API_KEY en .env');
    }
    
    // Obtener site key
    const siteKey = await page.evaluate(() => {
      const recaptcha = document.querySelector('.g-recaptcha');
      if (recaptcha) {
        return recaptcha.getAttribute('data-sitekey');
      }
      const iframe = document.querySelector('iframe[src*="recaptcha"]');
      if (iframe) {
        const src = iframe.getAttribute('src');
        const match = src.match(/k=([^&]+)/);
        if (match) return match[1];
      }
      return null;
    });
    
    if (!siteKey) {
      console.log('   ⚠️ No se pudo obtener site key, puede que el CAPTCHA no esté activo');
      return false;
    }
    
    console.log(`   📋 Site Key: ${siteKey.substring(0, 20)}...`);
    
    // Resolver con 2Captcha
    const pageURL = page.url();
    const token = await this.resolveRecaptchaV2(siteKey, pageURL);
    console.log(`   ✅ Token obtenido: ${token.substring(0, 30)}...`);
    
    // Inyectar token
    await page.evaluate((token) => {
      const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (textarea) {
        textarea.value = token;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, token);
    
    await this.delay(2000);
    return true;
  }

  // ==================== RESOLVER reCAPTCHA V2 ====================
  async resolveRecaptchaV2(siteKey, pageURL) {
    try {
      const formData = new FormData();
      formData.append('method', 'userrecaptcha');
      formData.append('key', this.captchaApiKey);
      formData.append('googlekey', siteKey);
      formData.append('pageurl', pageURL);
      formData.append('json', '1');
      
      const uploadResponse = await axios.post('http://2captcha.com/in.php', formData, {
        headers: formData.getHeaders(),
        timeout: 30000
      });
      
      if (!uploadResponse.data || uploadResponse.data.status !== 1) {
        throw new Error(`Error subiendo reCAPTCHA: ${uploadResponse.data?.request || 'Unknown error'}`);
      }
      
      const taskId = uploadResponse.data.request;
      console.log(`   📋 Task ID: ${taskId}`);
      
      const maxAttempts = 40;
      for (let i = 0; i < maxAttempts; i++) {
        await this.delay(5000);
        
        const resultResponse = await axios.get(`http://2captcha.com/res.php`, {
          params: {
            key: this.captchaApiKey,
            action: 'get',
            id: taskId,
            json: 1
          },
          timeout: 10000
        });
        
        if (resultResponse.data.status === 1) {
          return resultResponse.data.request;
        } else if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
          throw new Error(`Error resolviendo reCAPTCHA: ${resultResponse.data.request}`);
        }
      }
      
      throw new Error('Timeout esperando solución del reCAPTCHA');
      
    } catch (error) {
      throw new Error(`Error en 2Captcha: ${error.message}`);
    }
  }

  // ==================== LLENAR FORMULARIO ====================
  async fillForm(page, placa) {
    const placaFilled = await page.evaluate((placa) => {
      const input = document.querySelector('input[name="PlaMot"]') || document.querySelector('input[name="PLACA"]');
      if (input && !input.disabled) {
        input.value = placa.toUpperCase();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }, placa);
    
    if (!placaFilled) {
      throw new Error('No se pudo encontrar o llenar el campo de placa');
    }
    
    console.log(`   ✅ Placa ingresada: ${placa.toUpperCase()}`);
    await this.delay(1000);
  }

  // ==================== EXTRAER RESULTADOS ====================
  async extractResults(resultPage, placa) {
    await this.delay(3000);
    
    // Tomar screenshot para debugging
    try {
      await resultPage.screenshot({ path: 'screenshots/piura-result.png', fullPage: true });
      console.log('   📸 Screenshot guardado en screenshots/piura-result.png');
    } catch (e) {
      console.log('   ⚠️ No se pudo guardar screenshot');
    }

    // Fallback robusto: Playwright no soporta POST en page.goto (los options method/postData se ignoran),
    // así que a veces la página queda en blanco. Si detectamos HTML sin contenido útil, hacemos POST por HTTP.
    try {
      const html = await resultPage.content();
      const looksBlank = !html || html.length < 800 || (!/Multas\s+de\s+Tr[aá]nsito/i.test(html) && !/coincidencias/i.test(html));
      if (looksBlank) {
        console.log('   ⚠️ Resultado HTML parece incompleto (posible GET sin parámetros). Usando POST HTTP directo...');
        return await this.extractResultsHttp(placa);
      }
    } catch (e) {
      console.log('   ⚠️ No se pudo leer content() para validar HTML, usando POST HTTP directo...');
      return await this.extractResultsHttp(placa);
    }
    
    const datos = await resultPage.evaluate((placa) => {
      const resultado = {
        success: true,
        placa: placa.toUpperCase(),
        multas: [],
        mensaje: null
      };
      
      const bodyText = document.body.innerText.toLowerCase();
      const textContent = document.body.textContent.toLowerCase();
      const combinedText = bodyText + ' ' + textContent;

      // Mensaje exacto esperado por el portal (0 coincidencias)
      // Ej: Se encontraron 0 coincidencias con la Placa "V2R075".
      const match0 = (document.body.innerText || '').match(/Se\s+encontraron\s+0\s+coincidencias[\s\S]*?Placa\s+\"?([A-Za-z0-9]+)\"?\.?/i);
      if (match0) {
        const placaFound = (match0[1] || placa).toUpperCase();
        resultado.mensaje = `Se encontraron 0 coincidencias con la Placa \"${placaFound}\".`;
        return resultado;
      }
      
      // Verificar si hay mensaje de "no hay resultados"
      if (combinedText.includes('no se encontr') || 
          combinedText.includes('sin registros') || 
          combinedText.includes('no hay') ||
          combinedText.includes('no cuenta con') ||
          combinedText.includes('no tiene') ||
          combinedText.includes('no existe')) {
        resultado.mensaje = 'Este vehículo no cuenta con multas registradas en la Municipalidad de Piura';
        return resultado;
      }
      
      // Buscar tabla de resultados
      const tableSelectors = [
        'table',
        'table[border]',
        'table.table',
        'table[class*="table" i]'
      ];
      
      let tabla = null;
      for (const selector of tableSelectors) {
        tabla = document.querySelector(selector);
        if (tabla) {
          const rows = tabla.querySelectorAll('tr');
          if (rows.length > 1) { // Más de una fila (header + datos)
            break;
          }
        }
      }
      
      if (!tabla) {
        resultado.mensaje = 'Este vehículo no cuenta con multas registradas en la Municipalidad de Piura';
        return resultado;
      }
      
      // Extraer filas de la tabla
      const rows = tabla.querySelectorAll('tr');
      
      if (rows.length <= 1) {
        resultado.mensaje = 'Este vehículo no cuenta con multas registradas en la Municipalidad de Piura';
        return resultado;
      }
      
      // Detectar si la primera fila es header
      const firstRow = rows[0];
      const firstRowCells = firstRow.querySelectorAll('th, td');
      const firstRowText = firstRow.textContent.toLowerCase();
      const isHeaderRow = firstRow.querySelectorAll('th').length > 0 ||
                         firstRowText.includes('número') ||
                         firstRowText.includes('fecha') ||
                         firstRowText.includes('multas de tránsito') ||
                         firstRowText.includes('placa') ||
                         firstRowText.includes('infracción');
      
      const startIndex = isHeaderRow ? 1 : 0;
      
      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');
        
        if (cells.length === 0) continue;
        
        // Obtener texto de todas las celdas
        const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
        const rowText = cellTexts.join(' ').toLowerCase();
        
        // Saltar filas que parecen headers o están vacías
        if (rowText.includes('multas de tránsito') ||
            rowText.includes('placa') ||
            rowText.includes('número') ||
            rowText.length < 5) {
          continue;
        }
        
        // Extraer datos de cada celda (estructura puede variar)
        const multa = {
          numero: cellTexts[0] || '',
          fecha: cellTexts[1] || '',
          infraccion: cellTexts[2] || '',
          monto: cellTexts[3] || '',
          estado: cellTexts[4] || '',
          observaciones: cellTexts[5] || ''
        };
        
        // Solo agregar si tiene al menos un campo con datos válidos (no solo espacios o guiones)
        const hasValidData = multa.numero && multa.numero.length > 2 && !multa.numero.toLowerCase().includes('multas') ||
                            multa.fecha && multa.fecha.length > 5 ||
                            multa.infraccion && multa.infraccion.length > 2 ||
                            multa.monto && multa.monto.length > 1;
        
        if (hasValidData) {
          resultado.multas.push(multa);
        }
      }
      
      if (resultado.multas.length === 0) {
        resultado.mensaje = 'Este vehículo no cuenta con multas registradas en la Municipalidad de Piura';
      }
      
      return resultado;
    }, placa);
    
    console.log(`   📊 Multas encontradas: ${datos.multas.length}`);
    if (datos.multas.length > 0) {
      datos.multas.forEach((mult, idx) => {
        console.log(`      ${idx + 1}. ${mult.numero} - ${mult.fecha} - ${mult.infraccion}`);
      });
    } else {
      console.log(`   ⚠️ Mensaje: ${datos.mensaje}`);
    }
    
    return datos;
  }

  // ==================== FALLBACK HTTP DIRECTO (POST) ====================
  async extractResultsHttp(placa) {
    const placaUpper = (placa || '').toString().trim().toUpperCase();
    try {
      const body = new URLSearchParams({ PlaMot: placaUpper }).toString();
      const resp = await axios.post(this.resultURL, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      });

      const html = resp.data || '';
      const $ = cheerio.load(html);
      const text = $('body').text().replace(/\s+/g, ' ').trim();

      // Mensaje 0 coincidencias exacto
      const m = text.match(/Se\s+encontraron\s+0\s+coincidencias\s+con\s+la\s+Placa\s+\"?([A-Z0-9]+)\"?/i);
      if (m) {
        const placaFound = (m[1] || placaUpper).toUpperCase();
        return {
          success: true,
          placa: placaFound,
          multas: [],
          mensaje: `Se encontraron 0 coincidencias con la Placa \"${placaFound}\".`
        };
      }

      // Tabla de multas (si existe)
      const multas = [];
      $('table tr').each((idx, el) => {
        const tds = $(el).find('td');
        if (tds.length >= 4) {
          const numero = $(tds[0]).text().trim();
          const placaRow = $(tds[1]).text().trim();
          const fecha = $(tds[2]).text().trim();
          const infraccion = $(tds[3]).text().trim();
          const rowText = `${numero} ${placaRow} ${fecha} ${infraccion}`.trim();
          if (!rowText) return;
          if (/N[°º]/i.test(numero) || numero.toLowerCase().includes('n')) return;
          // Heurística: si parece fila real
          if (placaRow && fecha) {
            multas.push({ numero, placa: placaRow, fecha, infraccion });
          }
        }
      });

      return {
        success: true,
        placa: placaUpper,
        multas,
        mensaje: multas.length ? `Se encontraron ${multas.length} multa(s)` : 'Este vehículo no cuenta con multas registradas en la Municipalidad de Piura'
      };
    } catch (e) {
      return {
        success: true,
        placa: placaUpper,
        multas: [],
        mensaje: e.message || 'Error consultando Piura'
      };
    }
  }

  // ==================== UTILIDADES ====================
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PiuraMultasScraper;
