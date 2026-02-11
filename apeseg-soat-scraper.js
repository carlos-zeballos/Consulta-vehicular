/**
 * APESEG SOAT Scraper
 * Consulta SOAT desde https://www.apeseg.org.pe/consultas-soat/
 * 
 * Flujo:
 * 1. Resolver captcha (POST /captcha-api/api/captcha/verify)
 * 2. Login para obtener token (POST /consulta-soat/api/login)
 * 3. Consultar placa (GET /consulta-soat/api/certificados/placa/{PLACA})
 */

const axios = require('axios');
const puppeteer = require('puppeteer');

class ApesegSoatScraper {
  constructor(options = {}) {
    this.usePuppeteer = options.usePuppeteer !== false; // Por defecto usar Puppeteer
    this.captchaApiKey = options.captchaApiKey || process.env.CAPTCHA_API_KEY || '';
    this.baseUrl = 'https://webapp.apeseg.org.pe';
    this.appSecret = '9asjKZ9aJq1@2025';
  }

  /**
   * Obtener headers comunes para las peticiones
   */
  getCommonHeaders() {
    return {
      'accept': '*/*',
      'accept-language': 'es-PE,es;q=0.9,en;q=0.8',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'origin': this.baseUrl,
      'pragma': 'no-cache',
      'referer': `${this.baseUrl}/consulta-soat/?source=apeseg`,
      'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      'x-app-secret': this.appSecret,
      'x-referrer': 'https://www.apeseg.org.pe/',
      'x-source': 'apeseg'
    };
  }

  /**
   * Resolver captcha usando 2Captcha
   */
  async resolveCaptcha() {
    try {
      console.log('[APESEG] Resolviendo captcha...');
      
      // Primero obtener el captcha desde la API
      const verifyResponse = await axios.post(
        `${this.baseUrl}/captcha-api/api/captcha/verify`,
        {},
        {
          headers: this.getCommonHeaders(),
          timeout: 30000
        }
      );

      console.log('[APESEG] Respuesta verify:', verifyResponse.data);

      // Si la API devuelve un token directamente, usarlo
      if (verifyResponse.data && verifyResponse.data.token) {
        return verifyResponse.data.token;
      }

      // Si la respuesta contiene una imagen de captcha, resolverla con 2Captcha
      if (this.captchaApiKey && verifyResponse.data && (verifyResponse.data.image || verifyResponse.data.captcha)) {
        const FormData = require('form-data');
        const formData = new FormData();
        const imageBase64 = verifyResponse.data.image || verifyResponse.data.captcha;
        
        formData.append('method', 'base64');
        formData.append('key', this.captchaApiKey);
        formData.append('body', imageBase64);
        formData.append('json', 1);

        console.log('[APESEG] Enviando captcha a 2Captcha...');
        const solveResponse = await axios.post('http://2captcha.com/in.php', formData, {
          headers: formData.getHeaders()
        });

        if (solveResponse.data.status !== 1) {
          throw new Error(`Error al enviar captcha a 2Captcha: ${solveResponse.data.request}`);
        }

        const captchaId = solveResponse.data.request;
        console.log('[APESEG] Captcha ID:', captchaId);

        // Esperar a que se resuelva (máximo 2 minutos)
        for (let i = 0; i < 24; i++) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const resultResponse = await axios.get(
            `http://2captcha.com/res.php?key=${this.captchaApiKey}&action=get&id=${captchaId}&json=1`
          );

          if (resultResponse.data.status === 1) {
            console.log('[APESEG] Captcha resuelto:', resultResponse.data.request);
            return resultResponse.data.request; // Token del captcha resuelto
          }
          
          if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
            throw new Error(`Error al resolver captcha: ${resultResponse.data.request}`);
          }
        }

        throw new Error('Timeout esperando resolución del captcha');
      }

      // Si no hay captcha que resolver, retornar la respuesta
      return verifyResponse.data;
    } catch (error) {
      console.error('[APESEG] Error resolviendo captcha:', error.message);
      throw new Error(`Error resolviendo captcha: ${error.message}`);
    }
  }

  /**
   * Obtener token de autenticación
   */
  async getAuthToken(captchaToken = null) {
    try {
      console.log('[APESEG] Obteniendo token de autenticación...');
      
      const loginData = {};
      if (captchaToken) {
        loginData.captcha = captchaToken;
      }

      const loginHeaders = {
        ...this.getCommonHeaders(),
        'referer': `${this.baseUrl}/consulta-soat/resultados`
      };

      const loginResponse = await axios.post(
        `${this.baseUrl}/consulta-soat/api/login`,
        loginData,
        {
          headers: loginHeaders,
          timeout: 30000,
          withCredentials: true
        }
      );

      console.log('[APESEG] Respuesta login:', loginResponse.data);

      // Extraer token de diferentes formatos posibles
      let token = null;
      
      if (loginResponse.data && loginResponse.data.token) {
        token = loginResponse.data.token;
      } else if (typeof loginResponse.data === 'string') {
        token = loginResponse.data;
      } else if (loginResponse.data && loginResponse.data.data && loginResponse.data.data.token) {
        token = loginResponse.data.data.token;
      } else if (loginResponse.data && loginResponse.data.access_token) {
        token = loginResponse.data.access_token;
      } else if (loginResponse.data && loginResponse.data.accessToken) {
        token = loginResponse.data.accessToken;
      }

      if (!token) {
        // Si no hay token pero la respuesta es exitosa, puede que no se requiera autenticación
        console.warn('[APESEG] No se encontró token en la respuesta, pero la petición fue exitosa');
        return null; // Retornar null para intentar consulta sin token
      }

      console.log('[APESEG] Token obtenido:', token.substring(0, 30) + '...');
      return token;
    } catch (error) {
      console.error('[APESEG] Error obteniendo token:', error.message);
      if (error.response) {
        console.error('[APESEG] Status:', error.response.status);
        console.error('[APESEG] Respuesta error:', error.response.data);
      }
      // No lanzar error, intentar continuar sin token
      return null;
    }
  }

  /**
   * Consultar placa usando Puppeteer (método completo)
   */
  async consultarPlacaPuppeteer(placa) {
    let browser = null;
    try {
      console.log(`[APESEG] Iniciando consulta con Puppeteer para placa: ${placa}`);
      
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--ignore-certificate-errors',
          '--ignore-ssl-errors'
        ]
      });

      const page = await browser.newPage();
      
      // Configurar headers
      await page.setExtraHTTPHeaders({
        'accept-language': 'es-PE,es;q=0.9,en;q=0.8',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
      });

      // Interceptar respuestas para capturar token y certificados
      let authToken = null;
      let certificadosInterceptados = null;
      
      page.on('response', async (response) => {
        const url = response.url();
        
        // Capturar token del login
        if (url.includes('/consulta-soat/api/login')) {
          try {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json') && response.status() === 200) {
              const data = await response.json();
              console.log('[APESEG-INTERCEPT] Login response:', data);
              if (data && data.access_token) {
                authToken = data.access_token;
                console.log('[APESEG-INTERCEPT] ✅ Token obtenido:', authToken.substring(0, 30) + '...');
              } else if (data && data.token) {
                authToken = data.token;
                console.log('[APESEG-INTERCEPT] ✅ Token obtenido:', authToken.substring(0, 30) + '...');
              } else if (typeof data === 'string') {
                authToken = data;
                console.log('[APESEG-INTERCEPT] ✅ Token obtenido (string)');
              }
            }
          } catch (e) {
            console.warn('[APESEG-INTERCEPT] Error parseando login:', e.message);
          }
        }
        
        // Capturar certificados
        if (url.includes(`/consulta-soat/api/certificados/placa/`)) {
          try {
            const status = response.status();
            const contentType = response.headers()['content-type'] || '';
            console.log(`[APESEG-INTERCEPT] Respuesta certificados: status=${status}, contentType=${contentType}`);
            
            if (status === 200 && contentType.includes('application/json')) {
              const data = await response.json();
              console.log(`[APESEG-INTERCEPT] Datos recibidos:`, Array.isArray(data) ? `${data.length} items` : 'no es array');
              
              if (Array.isArray(data) && data.length > 0) {
                console.log('[APESEG-INTERCEPT] ✅ Certificados interceptados:', data.length);
                certificadosInterceptados = data;
              } else if (Array.isArray(data) && data.length === 0) {
                console.log('[APESEG-INTERCEPT] ⚠️ Array vacío - sin certificados');
                certificadosInterceptados = []; // Marcar como procesado pero vacío
              }
            } else {
              console.log(`[APESEG-INTERCEPT] ⚠️ Respuesta no válida: status=${status}, contentType=${contentType}`);
            }
          } catch (e) {
            console.warn('[APESEG-INTERCEPT] Error parseando certificados:', e.message);
          }
        }
      });

      // Navegar a la página de consulta
      console.log('[APESEG] Navegando a la página de consulta...');
      await page.goto(`${this.baseUrl}/consulta-soat/?source=apeseg`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Esperar a que la página cargue completamente (optimizado: menos tiempo)
      await page.waitForTimeout(2000);

      // Interactuar con el formulario: obtener captcha, resolverlo, llenar placa y enviar
      console.log('[APESEG] Interactuando con el formulario...');
      
      try {
        // Esperar a que el formulario cargue
        await page.waitForSelector('#placa', { timeout: 10000 });
        console.log('[APESEG] ✅ Formulario cargado');
        
        // Obtener la imagen del captcha
        console.log('[APESEG] Obteniendo imagen del captcha...');
        const captchaImageBase64 = await page.evaluate(() => {
          const img = document.querySelector('.captcha-img, img[alt="captcha"], img[src^="data:image"]');
          if (img && img.src) {
            // Si es base64, extraer solo la parte base64
            const match = img.src.match(/base64,(.+)/);
            return match ? match[1] : null;
          }
          return null;
        });
        
        if (!captchaImageBase64) {
          throw new Error('No se pudo obtener la imagen del captcha');
        }
        
        console.log('[APESEG] ✅ Imagen del captcha obtenida');
        
        // Resolver el captcha con 2Captcha
        let captchaSolution = null;
        if (this.captchaApiKey) {
          console.log('[APESEG] Resolviendo captcha con 2Captcha...');
          const FormData = require('form-data');
          const formData = new FormData();
          formData.append('method', 'base64');
          formData.append('key', this.captchaApiKey);
          formData.append('body', captchaImageBase64);
          formData.append('json', 1);
          formData.append('regsense', 1);
          formData.append('min_len', 4);
          formData.append('max_len', 6);

          const solveResponse = await axios.post('http://2captcha.com/in.php', formData, {
            headers: formData.getHeaders()
          });

          if (solveResponse.data.status !== 1) {
            throw new Error(`Error al enviar captcha a 2Captcha: ${solveResponse.data.request}`);
          }

          const captchaId = solveResponse.data.request;
          console.log('[APESEG] Captcha ID:', captchaId);

          // Esperar a que se resuelva (optimizado: verificar cada 3 segundos, máximo 90 segundos)
          for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const resultResponse = await axios.get(
              `http://2captcha.com/res.php?key=${this.captchaApiKey}&action=get&id=${captchaId}&json=1`
            );

            if (resultResponse.data.status === 1) {
              captchaSolution = resultResponse.data.request;
              console.log('[APESEG] ✅ Captcha resuelto:', captchaSolution);
              break;
            }
            
            if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
              throw new Error(`Error al resolver captcha: ${resultResponse.data.request}`);
            }
          }

          if (!captchaSolution) {
            throw new Error('Timeout esperando resolución del captcha');
          }
        } else {
          throw new Error('CAPTCHA_API_KEY no configurado. Se requiere para resolver el captcha.');
        }
        
        // Llenar el input de placa
        console.log(`[APESEG] Ingresando placa: ${placa}`);
        await page.type('#placa', placa, { delay: 100 });
        await page.waitForTimeout(500);
        
        // Llenar el input de captcha
        console.log(`[APESEG] Ingresando solución del captcha: ${captchaSolution}`);
        await page.type('#captcha', captchaSolution, { delay: 100 });
        await page.waitForTimeout(500);
        
        // Hacer click en el botón de consultar
        console.log('[APESEG] Enviando formulario...');
        await page.click('button[type="submit"]');
        
        // Esperar tiempo inicial para que se procese la petición
        console.log('[APESEG] Esperando procesamiento inicial...');
        await page.waitForTimeout(10000); // 10 segundos iniciales para que cargue completamente
        
        // Esperar a que aparezcan resultados en la página (priorizar DOM sobre intercepción)
        console.log('[APESEG] Esperando que aparezcan resultados en la página...');
        let intentos = 0;
        const maxIntentos = 60; // 60 intentos x 3 segundos = 180 segundos (3 minutos) máximo
        let datosEncontradosEnDOM = false;
        
        while (intentos < maxIntentos && !datosEncontradosEnDOM && certificadosInterceptados === null) {
          await page.waitForTimeout(3000); // Esperar 3 segundos entre verificaciones
          intentos++;
          
          // Verificar si hay datos en el DOM (prioridad)
          const hayDatosEnDOM = await page.evaluate(() => {
            // Buscar tablas con resultados
            const tablas = document.querySelectorAll('table, .table, [class*="table"], [id*="table"], tbody');
            if (tablas.length > 0) {
              for (const tabla of tablas) {
                const texto = tabla.textContent || '';
                if (texto.includes('Interseguro') || texto.includes('Rimac') || texto.includes('La Positiva') || 
                    texto.includes('NombreCompania') || texto.includes('NumeroPoliza') ||
                    texto.includes('VIGENTE') || texto.includes('VENCIDO')) {
                  return true;
                }
              }
            }
            
            // Buscar elementos que contengan datos de pólizas
            const elementos = document.querySelectorAll('*');
            for (const el of elementos) {
              const texto = el.textContent || '';
              if ((texto.includes('Interseguro') || texto.includes('Rimac') || texto.includes('La Positiva')) &&
                  (texto.includes('/202') || texto.includes('VIGENTE') || texto.includes('VENCIDO'))) {
                return true;
              }
            }
            
            return false;
          });
          
          if (hayDatosEnDOM) {
            console.log(`[APESEG] ✅ Datos detectados en el DOM después de ${intentos * 3} segundos, extrayendo...`);
            datosEncontradosEnDOM = true;
            break;
          }
          
          if (certificadosInterceptados !== null) {
            // Se interceptó algo (puede ser array vacío o con datos)
            console.log(`[APESEG] ✅ Respuesta interceptada después de ${intentos * 3} segundos`);
            break;
          }
          
          if (intentos % 10 === 0) {
            console.log(`[APESEG] Esperando resultados... (${intentos * 3}s/${maxIntentos * 3}s)`);
          }
        }
        
        if (!datosEncontradosEnDOM && certificadosInterceptados === null && intentos >= maxIntentos) {
          console.log('[APESEG] ⚠️ Timeout esperando resultados, intentando extraer del DOM de todas formas...');
        }
        
        // Si se interceptaron certificados, usarlos
        if (certificadosInterceptados && certificadosInterceptados.length > 0) {
          console.log('[APESEG] ✅ Usando certificados interceptados');
          await browser.close();
          browser = null;
          return this.formatResponse(certificadosInterceptados, placa);
        }
        
        // Si no se interceptaron, intentar extraer del DOM (fallback mejorado)
        console.log('[APESEG] Intentando extraer datos del DOM como fallback...');
        const datosDelDOM = await page.evaluate(() => {
          // 1. Buscar datos en variables globales o scripts
          if (window.certificados || window.data || window.resultados) {
            const datos = window.certificados || window.data || window.resultados;
            if (Array.isArray(datos) && datos.length > 0) {
              return datos;
            }
          }
          
          // 2. Buscar en scripts que puedan contener JSON
          const scripts = Array.from(document.querySelectorAll('script'));
          for (const script of scripts) {
            const content = script.textContent || '';
            if (content.includes('NombreCompania') || content.includes('NumeroPoliza') || 
                content.includes('Interseguro') || content.includes('Rimac')) {
              try {
                // Buscar arrays JSON
                const match = content.match(/\[[\s\S]{100,}?\]/);
                if (match) {
                  const parsed = JSON.parse(match[0]);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                  }
                }
              } catch (e) {
                // Continuar buscando
              }
            }
          }
          
          // 3. Buscar en elementos de la página que puedan contener datos
          const elementosConDatos = document.querySelectorAll('[data-certificados], [data-resultados], [id*="result"], [class*="result"]');
          for (const el of elementosConDatos) {
            try {
              const dataAttr = el.getAttribute('data-certificados') || el.getAttribute('data-resultados');
              if (dataAttr) {
                const parsed = JSON.parse(dataAttr);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  return parsed;
                }
              }
            } catch (e) {
              // Continuar
            }
          }
          
          // 4. Extraer datos de tablas HTML directamente (método mejorado)
          const tablas = document.querySelectorAll('table, .table, [class*="table"], [id*="table"], tbody, [role="table"]');
          console.log('[APESEG-DOM] Tablas encontradas:', tablas.length);
          
          for (const tabla of tablas) {
            const filas = tabla.querySelectorAll('tr');
            console.log('[APESEG-DOM] Filas en tabla:', filas.length);
            
            if (filas.length > 0) {
              const datosExtraidos = [];
              
              // Buscar filas que contengan datos de pólizas
              for (let i = 0; i < filas.length; i++) {
                const fila = filas[i];
                const celdas = fila.querySelectorAll('td, th');
                const textoFila = (fila.textContent || '').trim();
                
                // Verificar si esta fila tiene datos relevantes de SOAT
                if (textoFila && (textoFila.includes('Interseguro') || textoFila.includes('Rimac') || 
                    textoFila.includes('La Positiva') || textoFila.includes('Mapfre') ||
                    textoFila.includes('VIGENTE') || textoFila.includes('VENCIDO') || 
                    textoFila.includes('ANULADO') || /\d{2}\/\d{2}\/\d{4}/.test(textoFila))) {
                  
                  if (celdas.length >= 3) {
                    // Extraer datos de las celdas
                    const valores = Array.from(celdas).map(c => (c.textContent || '').trim()).filter(v => v);
                    
                    // Intentar identificar columnas por contenido
                    let compania = '';
                    let clase = '';
                    let uso = '';
                    let poliza = '';
                    let certificado = '';
                    let inicio = '';
                    let fin = '';
                    let estado = '';
                    
                    valores.forEach((valor, idx) => {
                      if (!compania && (valor.includes('Interseguro') || valor.includes('Rimac') || 
                          valor.includes('La Positiva') || valor.includes('Mapfre') || 
                          valor.includes('Pacífico') || valor.includes('Protecta'))) {
                        compania = valor;
                      } else if (!clase && (valor.includes('CAMIONETA') || valor.includes('AUTOMOVIL') || 
                          valor.includes('MOTOCICLETA') || valor.includes('RURAL') || valor.includes('SUV'))) {
                        clase = valor;
                      } else if (!uso && (valor.includes('PARTICULAR') || valor.includes('COMERCIAL') || 
                          valor.includes('OFICIAL'))) {
                        uso = valor;
                      } else if (!poliza && valor.length > 5 && /^[0-9]+$/.test(valor.replace(/\s/g, ''))) {
                        poliza = valor;
                      } else if (!certificado && valor.length > 5 && /^[0-9]+$/.test(valor.replace(/\s/g, '')) && valor !== poliza) {
                        certificado = valor;
                      } else if (!inicio && /\d{2}\/\d{2}\/\d{4}/.test(valor)) {
                        inicio = valor;
                      } else if (!fin && /\d{2}\/\d{2}\/\d{4}/.test(valor) && valor !== inicio) {
                        fin = valor;
                      } else if (!estado && (valor.includes('VIGENTE') || valor.includes('VENCIDO') || valor.includes('ANULADO'))) {
                        estado = valor;
                      }
                    });
                    
                    // Si encontramos al menos compañía o póliza, crear registro
                    if (compania || poliza) {
                      const polizaData = {
                        NombreCompania: compania || valores[0] || '',
                        NombreClaseVehiculo: clase || valores.find(v => v.includes('CAMIONETA') || v.includes('AUTOMOVIL')) || '',
                        NombreUsoVehiculo: uso || valores.find(v => v.includes('PARTICULAR') || v.includes('COMERCIAL')) || 'PARTICULAR',
                        NumeroPoliza: poliza || valores.find(v => v.length > 10 && /^[0-9]+$/.test(v.replace(/\s/g, ''))) || '',
                        CodigoUnicoPoliza: certificado || poliza || '',
                        FechaInicio: inicio || valores.find(v => /\d{2}\/\d{2}\/\d{4}/.test(v)) || '',
                        FechaFin: fin || valores.find((v, i, arr) => /\d{2}\/\d{2}\/\d{4}/.test(v) && arr.indexOf(v) !== arr.findIndex(x => /\d{2}\/\d{2}\/\d{4}/.test(x))) || '',
                        Estado: estado || valores.find(v => v.includes('VIGENTE') || v.includes('VENCIDO')) || '',
                        TipoCertificado: valores.find(v => v.includes('DIGITAL') || v.includes('FISICO')) || 'DIGITAL'
                      };
                      
                      datosExtraidos.push(polizaData);
                    }
                  }
                }
              }
              
              if (datosExtraidos.length > 0) {
                console.log('[APESEG-DOM] ✅ Datos extraídos de tabla HTML:', datosExtraidos.length);
                return datosExtraidos;
              }
            }
          }
          
          // 5. Buscar en divs o elementos que puedan contener datos estructurados
          const elementosConTexto = document.querySelectorAll('div, span, p, li');
          const datosDeTexto = [];
          for (const el of elementosConTexto) {
            const texto = (el.textContent || '').trim();
            if (texto.length > 20 && (texto.includes('Interseguro') || texto.includes('Rimac') || texto.includes('La Positiva'))) {
              // Intentar parsear texto estructurado
              const match = texto.match(/(Interseguro|Rimac|La Positiva|Mapfre|Pacífico|Protecta)[\s\S]{0,200}?(\d{2}\/\d{2}\/\d{4})[\s\S]{0,200}?(\d{2}\/\d{2}\/\d{4})/);
              if (match) {
                datosDeTexto.push({
                  NombreCompania: match[1],
                  FechaInicio: match[2],
                  FechaFin: match[3],
                  NombreClaseVehiculo: '',
                  NombreUsoVehiculo: 'PARTICULAR',
                  NumeroPoliza: '',
                  CodigoUnicoPoliza: '',
                  Estado: texto.includes('VIGENTE') ? 'VIGENTE' : (texto.includes('VENCIDO') ? 'VENCIDO' : ''),
                  TipoCertificado: 'DIGITAL'
                });
              }
            }
          }
          
          if (datosDeTexto.length > 0) {
            console.log('[APESEG-DOM] ✅ Datos extraídos de texto:', datosDeTexto.length);
            return datosDeTexto;
          }
          
          // 5. Buscar en el body completo por texto que indique datos
          const bodyText = document.body.textContent || '';
          if (bodyText.includes('NombreCompania') || bodyText.includes('NumeroPoliza')) {
            // Hay datos en la página, pero no los podemos extraer fácilmente
            console.log('[APESEG-DOM] Se detectaron datos en la página pero no se pudieron extraer automáticamente');
          }
          
          return null;
        });
        
        if (datosDelDOM && Array.isArray(datosDelDOM) && datosDelDOM.length > 0) {
          console.log('[APESEG] ✅ Datos extraídos del DOM:', datosDelDOM.length);
          console.log('[APESEG] Primeros datos:', JSON.stringify(datosDelDOM[0], null, 2));
          await browser.close();
          browser = null;
          return this.formatResponse(datosDelDOM, placa);
        }
        
        // Si no se encontraron datos, tomar screenshot para debug
        if (!datosDelDOM || datosDelDOM.length === 0) {
          console.log('[APESEG] ⚠️ No se encontraron datos, tomando screenshot para debug...');
          try {
            await page.screenshot({ path: `apeseg-debug-${placa}-${Date.now()}.png`, fullPage: true });
            const htmlContent = await page.content();
            const fs = require('fs');
            fs.writeFileSync(`apeseg-debug-${placa}-${Date.now()}.html`, htmlContent);
            console.log('[APESEG] Screenshot y HTML guardados para análisis');
          } catch (e) {
            console.warn('[APESEG] No se pudo guardar screenshot:', e.message);
          }
        }
        
        // Esperar un poco más y verificar nuevamente la intercepción (puede que llegue tarde)
        if (certificadosInterceptados === null) {
          console.log('[APESEG] Esperando 15 segundos adicionales por si la respuesta llega tarde...');
          await page.waitForTimeout(15000);
          
          // Intentar extraer del DOM una vez más después de esperar
          const datosDelDOM2 = await page.evaluate(() => {
            // Buscar cualquier texto que contenga datos de pólizas
            const bodyText = document.body.textContent || '';
            if (bodyText.includes('Interseguro') || bodyText.includes('Rimac') || bodyText.includes('La Positiva')) {
              // Hay datos pero no los podemos extraer fácilmente
              return { hayDatos: true, texto: bodyText.substring(0, 500) };
            }
            return null;
          });
          
          if (datosDelDOM2 && datosDelDOM2.hayDatos) {
            console.log('[APESEG] ⚠️ Se detectaron datos en la página pero no se pudieron extraer automáticamente');
            console.log('[APESEG] Texto encontrado:', datosDelDOM2.texto);
          }
          
          if (certificadosInterceptados && certificadosInterceptados.length > 0) {
            console.log('[APESEG] ✅ Certificados interceptados después de espera adicional');
            await browser.close();
            browser = null;
            return this.formatResponse(certificadosInterceptados, placa);
          }
        }
        
      } catch (interactError) {
        console.error('[APESEG] Error interactuando con el formulario:', interactError.message);
        throw interactError;
      }

      await browser.close();
      browser = null;

      // Si llegamos aquí sin datos, verificar si fue procesado o no se interceptó nada
      if (certificadosInterceptados === null) {
        // No se interceptó ninguna respuesta - puede ser que la página no haya respondido
        console.log('[APESEG] ⚠️ No se interceptó ninguna respuesta de certificados');
        return {
          success: true,
          placa: placa,
          polizas: [],
          message: 'No se encontraron certificados SOAT para esta placa'
        };
      } else if (Array.isArray(certificadosInterceptados) && certificadosInterceptados.length === 0) {
        // Se interceptó pero está vacío - sin certificados
        console.log('[APESEG] ⚠️ Se interceptó respuesta pero está vacía');
        return {
          success: true,
          placa: placa,
          polizas: [],
          message: 'No se encontraron certificados SOAT para esta placa'
        };
      }

      // Si hay certificados, formatearlos
      return this.formatResponse(certificadosInterceptados, placa);
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      console.error('[APESEG] Error en consultarPlacaPuppeteer:', error.message);
      throw error;
    }
  }

  /**
   * Consultar placa usando solo HTTP (método rápido)
   */
  async consultarPlacaHttp(placa) {
    try {
      console.log(`[APESEG] Iniciando consulta HTTP para placa: ${placa}`);
      
      const httpsAgent = new (require('https').Agent)({ rejectUnauthorized: false });

      // Paso 1: Login para obtener token (intentar sin captcha primero)
      console.log('[APESEG] Obteniendo token de autenticación...');
      const loginResponse = await axios.post(
        `${this.baseUrl}/consulta-soat/api/login`,
        {},
        {
          headers: {
            ...this.getCommonHeaders(),
            'referer': `${this.baseUrl}/consulta-soat/resultados`
          },
          timeout: 30000,
          withCredentials: true,
          httpsAgent: httpsAgent
        }
      );

      console.log('[APESEG] Login response:', loginResponse.data);

      // Extraer token
      let token = null;
      if (loginResponse.data && loginResponse.data.token) {
        token = loginResponse.data.token;
      } else if (typeof loginResponse.data === 'string') {
        token = loginResponse.data;
      } else if (loginResponse.data && loginResponse.data.data && loginResponse.data.data.token) {
        token = loginResponse.data.data.token;
      } else if (loginResponse.data && loginResponse.data.access_token) {
        token = loginResponse.data.access_token;
      }

      // Si no hay token, intentar consulta sin autenticación
      if (!token) {
        console.warn('[APESEG] No se obtuvo token, intentando consulta sin autenticación');
      } else {
        console.log('[APESEG] Token obtenido:', token.substring(0, 30) + '...');
      }

      // Paso 3: Consultar placa
      const consultHeaders = {
        ...this.getCommonHeaders(),
        'referer': `${this.baseUrl}/consulta-soat/resultados`
      };
      
      if (token) {
        consultHeaders['authorization'] = `Bearer ${token}`;
      }

      const certificadosResponse = await axios.get(
        `${this.baseUrl}/consulta-soat/api/certificados/placa/${placa}`,
        {
          headers: consultHeaders,
          timeout: 30000,
          withCredentials: true,
          httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        }
      );

      console.log('[APESEG] Certificados obtenidos:', certificadosResponse.data?.length || 0);

      return this.formatResponse(certificadosResponse.data, placa);
    } catch (error) {
      console.error('[APESEG] Error en consultarPlacaHttp:', error.message);
      if (error.response) {
        console.error('[APESEG] Error response:', error.response.status, error.response.data);
      }
      throw error;
    }
  }

  /**
   * Consultar placa (método principal)
   */
  async consultarPlaca(placa) {
    const placaNormalizada = (placa || '').trim().toUpperCase();
    
    if (!placaNormalizada) {
      throw new Error('Placa requerida');
    }

    try {
      // Intentar primero con HTTP (más rápido)
      try {
        return await this.consultarPlacaHttp(placaNormalizada);
      } catch (httpError) {
        console.log('[APESEG] HTTP falló, intentando con Puppeteer...', httpError.message);
        // Si falla HTTP, usar Puppeteer
        return await this.consultarPlacaPuppeteer(placaNormalizada);
      }
    } catch (error) {
      console.error('[APESEG] Error consultando placa:', error.message);
      throw error;
    }
  }

  /**
   * Formatear respuesta al formato esperado
   */
  formatResponse(certificados, placa) {
    if (!Array.isArray(certificados) || certificados.length === 0) {
      return {
        success: true,
        placa: placa,
        polizas: [],
        message: 'No se encontraron certificados SOAT para esta placa'
      };
    }

    const polizas = certificados.map(cert => ({
      compania_aseguradora: cert.NombreCompania || '',
      clase_vehiculo: cert.NombreClaseVehiculo || '',
      uso_vehiculo: cert.NombreUsoVehiculo || '',
      numero_accidentes: 0, // No disponible en esta API
      numero_poliza: cert.NumeroPoliza || '',
      numero_certificado: cert.CodigoUnicoPoliza || '',
      inicio_vigencia: this.formatDate(cert.FechaInicio),
      fin_vigencia: this.formatDate(cert.FechaFin),
      estado: cert.Estado || '',
      tipo_certificado: cert.TipoCertificado || '',
      fecha_creacion: cert.FechaCreacion || '',
      comentario: cert.Estado === 'VIGENTE' ? 'SOAT vigente' : cert.Estado === 'VENCIDO' ? 'SOAT vencido' : ''
    }));

    return {
      success: true,
      placa: placa,
      polizas: polizas,
      total_polizas: polizas.length,
      poliza_vigente: polizas.find(p => p.estado === 'VIGENTE') || null
    };
  }

  /**
   * Formatear fecha de DD/MM/YYYY a formato estándar
   */
  formatDate(dateStr) {
    if (!dateStr) return '';
    // Si ya está en formato correcto, retornarlo
    if (dateStr.includes('/')) {
      return dateStr;
    }
    // Si es una fecha ISO, convertirla
    try {
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateStr;
    }
  }
}

module.exports = ApesegSoatScraper;
