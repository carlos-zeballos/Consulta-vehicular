/**
 * SBS ADAPTER - Consulta SOAT/Siniestralidad por PLACA
 * HTTP + Cookie Jar + Cheerio (sin Puppeteer)
 */

const axios = require("axios").default;
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
const cheerio = require("cheerio");

const BASE_URL = "https://servicios.sbs.gob.pe/reportesoat";

/**
 * Construir cliente HTTP con cookie jar
 */
function buildClient() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 30000,
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Cache-Control": "max-age=0",
      "DNT": "1"
    }
  }));
  return { client, jar };
}

/**
 * Normalizar fecha DD/MM/YYYY a ISO YYYY-MM-DD
 */
function normalizeDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === '-') return null;
  
  // Formato DD/MM/YYYY
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  
  return trimmed;
}

/**
 * Normalizar fecha con hora DD/MM/YYYY HH:mm:ss
 */
function normalizeDateTime(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === '-') return null;
  
  // Formato DD/MM/YYYY HH:mm:ss
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, day, month, year, hour, minute, second] = match;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }
  
  return normalizeDate(trimmed);
}

/**
 * Limpiar texto (trim, colapsar espacios)
 */
function cleanText(text) {
  if (!text) return '';
  return String(text).trim().replace(/\s+/g, ' ');
}

/**
 * Consultar SBS SOAT por placa
 */
async function consultSbsSoat(placa) {
  if (!placa || typeof placa !== 'string') {
    throw new Error("Placa requerida");
  }

  // La placa debe ir sin espacios, pero mantener mayúsculas (el sitio puede ser case-sensitive)
  const placaNormalizada = placa.trim().replace(/\s+/g, '').toUpperCase();
  const { client } = buildClient();
  let retries = 0;
  const maxRetries = 1;

  while (retries <= maxRetries) {
    try {
      // PASO 1: GET formulario para obtener tokens WebForms
      let formUrl = `${BASE_URL}/BusquedaPlaca`;
      console.log(`[SBS] GET ${formUrl} (intento ${retries + 1})`);
      let formResponse;
      
      try {
        formResponse = await client.get(formUrl, {
          headers: {
            "Referer": `${BASE_URL}/`,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "es-PE,es;q=0.9",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1"
          }
        });
      } catch (e) {
        // Si falla con 404, intentar URL base
        if (e.response && e.response.status === 404) {
          console.log(`[SBS] URL /BusquedaPlaca no encontrada, intentando URL base...`);
          formUrl = BASE_URL;
          formResponse = await client.get(formUrl, {
            headers: {
              "Referer": `${BASE_URL}/`,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
              "Accept-Language": "es-PE,es;q=0.9",
              "Sec-Fetch-Dest": "document",
              "Sec-Fetch-Mode": "navigate",
              "Sec-Fetch-Site": "none",
              "Sec-Fetch-User": "?1"
            }
          });
        } else {
          throw e;
        }
      }

      if (formResponse.status === 403 || formResponse.status === 429) {
        throw new Error("BLOCKED_OR_RATE_LIMITED: El servicio bloquea consultas automatizadas");
      }

      // Verificar que la respuesta sea HTML válido
      if (!formResponse.data || typeof formResponse.data !== 'string') {
        throw new Error("SELECTOR_MISSING: Respuesta no es HTML válido");
      }

      const $form = cheerio.load(formResponse.data);

      // Debug: verificar qué contiene la página
      const pageTitle = $form('title').text();
      const hasFormInput = $form('input[name="ctl00$MainBodyContent$txtPlaca"]').length > 0;
      console.log(`[SBS] Título de página: ${pageTitle.substring(0, 100)}`);
      console.log(`[SBS] Tiene input de placa: ${hasFormInput}`);

      // Extraer tokens WebForms - intentar múltiples selectores
      let viewState = $form('input[name="__VIEWSTATE"]').attr('value') || '';
      let viewStateGenerator = $form('input[name="__VIEWSTATEGENERATOR"]').attr('value') || '';
      let eventValidation = $form('input[name="__EVENTVALIDATION"]').attr('value') || '';
      let hdnReCaptchaV3 = $form('input[name="ctl00$MainBodyContent$hdnReCaptchaV3"]').attr('value') || '';

      // Si no encuentra con el selector exacto, intentar variaciones
      if (!hdnReCaptchaV3) {
        hdnReCaptchaV3 = $form('input[id*="hdnReCaptchaV3" i]').attr('value') || '';
      }
      if (!viewState) {
        viewState = $form('input[id*="__VIEWSTATE" i]').attr('value') || '';
      }

      console.log(`[SBS] Tokens encontrados: VIEWSTATE=${!!viewState}, hdnReCaptchaV3=${!!hdnReCaptchaV3}`);

      // Si falta VIEWSTATE, es crítico - no podemos continuar
      if (!viewState) {
        if (retries < maxRetries) {
          retries++;
          console.log(`[SBS] VIEWSTATE no encontrado, reintentando... (${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        throw new Error("SELECTOR_MISSING: No se encontró __VIEWSTATE en el formulario. El sitio puede haber cambiado su estructura.");
      }

      // Si falta hdnReCaptchaV3, buscar en el HTML completo con regex
      if (!hdnReCaptchaV3) {
        const htmlContent = formResponse.data;
        // Buscar patrones comunes: name="ctl00$MainBodyContent$hdnReCaptchaV3" value="..."
        const recaptchaPatterns = [
          /name=["']ctl00\$MainBodyContent\$hdnReCaptchaV3["'][^>]*value=["']([^"']+)["']/i,
          /id=["'][^"']*hdnReCaptchaV3[^"']*["'][^>]*value=["']([^"']+)["']/i,
          /hdnReCaptchaV3["\s]*value["\s]*=["\s]*([^"\s>]+)/i
        ];
        
        for (const pattern of recaptchaPatterns) {
          const match = htmlContent.match(pattern);
          if (match && match[1] && match[1].length > 10) {
            hdnReCaptchaV3 = match[1];
            console.log(`[SBS] ✅ Token reCAPTCHA encontrado con regex (${hdnReCaptchaV3.length} chars)`);
            break;
          }
        }
        
        // Si aún no se encuentra, usar string vacío (puede que se genere dinámicamente)
        if (!hdnReCaptchaV3) {
          console.log(`[SBS] ⚠️ hdnReCaptchaV3 no encontrado, intentando sin él (puede generarse dinámicamente)...`);
          hdnReCaptchaV3 = ''; // Intentar con string vacío
        }
      }

      // PASO 2: POST consulta - usar la misma URL que funcionó en GET
      const postUrl = formUrl || `${BASE_URL}/BusquedaPlaca`; // Fallback si formUrl no está definido
      console.log(`[SBS] POST ${postUrl} con placa: ${placaNormalizada}`);
      const postData = new URLSearchParams({
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__VIEWSTATE': viewState,
        '__VIEWSTATEGENERATOR': viewStateGenerator,
        '__EVENTVALIDATION': eventValidation,
        'ctl00$MainBodyContent$txtPlaca': placaNormalizada,
        'ctl00$MainBodyContent$rblOpcionesSeguros': 'Soat',
        'ctl00$MainBodyContent$hdnReCaptchaV3': hdnReCaptchaV3,
        'ctl00$MainBodyContent$btnIngresarPla': 'Consultar'
      });

      const postResponse = await client.post(postUrl, postData.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": `${BASE_URL}/BusquedaPlaca`,
          "Origin": BASE_URL,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "es-PE,es;q=0.9",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-User": "?1",
          "Cache-Control": "max-age=0"
        },
        maxRedirects: 0, // No seguir redirect automáticamente, lo hacemos manualmente
        validateStatus: (status) => status >= 200 && status < 400 // Aceptar 302
      });

      // PASO 3: Seguir redirect 302 o hacer GET directo
      let resultUrl = `${BASE_URL}/ReporteCentralRiesgo`;
      if (postResponse.status === 302 || postResponse.status === 301) {
        const location = postResponse.headers.location || postResponse.headers['location'];
        if (location) {
          // Normalizar location header (puede venir en diferentes casos)
          const loc = typeof location === 'string' ? location : (Array.isArray(location) ? location[0] : '');
          if (loc) {
            if (loc.startsWith('http')) {
              resultUrl = loc;
            } else if (loc.startsWith('/')) {
              // Si empieza con /, construir URL completa desde el dominio base
              const urlObj = new URL(BASE_URL);
              resultUrl = `${urlObj.protocol}//${urlObj.host}${loc}`;
            } else {
              // Relativo a la URL actual
              resultUrl = `${BASE_URL}/${loc}`;
            }
            console.log(`[SBS] Redirect detectado: ${resultUrl}`);
          }
        }
      } else if (postResponse.status === 200) {
        // Si el POST devuelve 200, puede que los datos estén en la misma respuesta
        const $postResult = cheerio.load(postResponse.data);
        const hasResult = $postResult('#ctl00_MainBodyContent_placa').length > 0 || 
                          $postResult('#listSoatPlacaVeh').length > 0;
        if (hasResult) {
          console.log(`[SBS] Resultados encontrados en respuesta POST, procesando...`);
          const $result = $postResult;
          
          // Parsear datos directamente de la respuesta POST
          const placaText = cleanText($result('#ctl00_MainBodyContent_placa').text());
          const fechaConsultaText = cleanText($result('#ctl00_MainBodyContent_fecha_consulta').text());
          const fechaActualizacionText = cleanText($result('#ctl00_MainBodyContent_fecha_act').text());
          const cantidadText = cleanText($result('#ctl00_MainBodyContent_cantidad').text());

          const polizas = [];
          const tabla = $result('#listSoatPlacaVeh tbody tr');

          if (tabla.length === 0) {
            const mensaje = cleanText($result('body').text());
            if (mensaje.toLowerCase().includes('no se encontr') || mensaje.toLowerCase().includes('sin registros')) {
              return {
                placa: placaNormalizada,
                fecha_consulta: normalizeDateTime(fechaConsultaText) || new Date().toISOString(),
                fecha_actualizacion: fechaActualizacionText || '',
                accidentes_ultimos_5_anios: 0,
                polizas: []
              };
            }
            throw new Error("SELECTOR_MISSING: No se encontró la tabla de pólizas en respuesta POST");
          }

          tabla.each((index, row) => {
            const $row = $result(row);
            const celdas = $row.find('td');
            if (celdas.length >= 8) {
              const poliza = {
                aseguradora: cleanText(celdas.eq(0).text()),
                clase_vehiculo: cleanText(celdas.eq(1).text()),
                uso_vehiculo: cleanText(celdas.eq(2).text()),
                n_accidentes: parseInt(cleanText(celdas.eq(3).text()) || '0', 10),
                n_poliza: cleanText(celdas.eq(4).text()),
                n_certificado: cleanText(celdas.eq(5).text()),
                inicio_vigencia: normalizeDate(cleanText(celdas.eq(6).text())),
                fin_vigencia: normalizeDate(cleanText(celdas.eq(7).text())),
                comentario: celdas.length > 9 ? cleanText(celdas.eq(9).text()) : (celdas.length > 8 ? cleanText(celdas.eq(8).text()) : '')
              };
              polizas.push(poliza);
            }
          });

          return {
            placa: placaText || placaNormalizada,
            fecha_consulta: normalizeDateTime(fechaConsultaText) || new Date().toISOString(),
            fecha_actualizacion: fechaActualizacionText || '',
            accidentes_ultimos_5_anios: parseInt(cantidadText || '0', 10),
            polizas
          };
        }
      }

      // PASO 4: GET resultado
      console.log(`[SBS] GET ${resultUrl}`);
      const resultResponse = await client.get(resultUrl, {
        headers: {
          "Referer": `${BASE_URL}/BusquedaPlaca`,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "es-PE,es;q=0.9",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-User": "?1"
        }
      });

      if (resultResponse.status === 403 || resultResponse.status === 429) {
        throw new Error("BLOCKED_OR_RATE_LIMITED: El servicio bloquea consultas automatizadas");
      }

      const $result = cheerio.load(resultResponse.data);

      // Parsear datos principales
      const placaText = cleanText($result('#ctl00_MainBodyContent_placa').text());
      const fechaConsultaText = cleanText($result('#ctl00_MainBodyContent_fecha_consulta').text());
      const fechaActualizacionText = cleanText($result('#ctl00_MainBodyContent_fecha_act').text());
      const cantidadText = cleanText($result('#ctl00_MainBodyContent_cantidad').text());

      // Parsear tabla de pólizas
      const polizas = [];
      const tabla = $result('#listSoatPlacaVeh tbody tr');

      if (tabla.length === 0) {
        // Verificar si hay mensaje de "sin datos"
        const mensaje = cleanText($result('body').text());
        if (mensaje.toLowerCase().includes('no se encontr') || mensaje.toLowerCase().includes('sin registros')) {
          return {
            placa: placaNormalizada.toUpperCase(),
            fecha_consulta: normalizeDateTime(fechaConsultaText) || new Date().toISOString(),
            fecha_actualizacion: fechaActualizacionText || '',
            accidentes_ultimos_5_anios: 0,
            polizas: []
          };
        }
        throw new Error("SELECTOR_MISSING: No se encontró la tabla de pólizas (#listSoatPlacaVeh)");
      }

      tabla.each((index, row) => {
        const $row = $result(row);
        const celdas = $row.find('td');
        
        // Mapear por orden de columnas según especificación:
        // 0=aseguradora, 1=clase_vehiculo, 2=uso_vehiculo, 3=n_accidentes,
        // 4=n_poliza, 5=n_certificado, 6=inicio_vigencia, 7=fin_vigencia,
        // 9=comentario (columna 8 puede estar vacía)
        if (celdas.length >= 8) {
          const poliza = {
            aseguradora: cleanText(celdas.eq(0).text()),
            clase_vehiculo: cleanText(celdas.eq(1).text()),
            uso_vehiculo: cleanText(celdas.eq(2).text()),
            n_accidentes: parseInt(cleanText(celdas.eq(3).text()) || '0', 10),
            n_poliza: cleanText(celdas.eq(4).text()),
            n_certificado: cleanText(celdas.eq(5).text()),
            inicio_vigencia: normalizeDate(cleanText(celdas.eq(6).text())),
            fin_vigencia: normalizeDate(cleanText(celdas.eq(7).text())),
            comentario: celdas.length > 9 ? cleanText(celdas.eq(9).text()) : (celdas.length > 8 ? cleanText(celdas.eq(8).text()) : '')
          };
          polizas.push(poliza);
        }
      });

      return {
        placa: placaText || placaNormalizada.toUpperCase(),
        fecha_consulta: normalizeDateTime(fechaConsultaText) || new Date().toISOString(),
        fecha_actualizacion: fechaActualizacionText || '',
        accidentes_ultimos_5_anios: parseInt(cantidadText || '0', 10),
        polizas
      };

    } catch (error) {
      if (error.message.includes('BLOCKED_OR_RATE_LIMITED')) {
        throw error;
      }
      if (error.message.includes('SELECTOR_MISSING') && retries < maxRetries) {
        retries++;
        console.log(`[SBS] Reintentando... (${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      if (error.response) {
        const status = error.response.status;
        if (status === 403 || status === 429) {
          throw new Error("BLOCKED_OR_RATE_LIMITED: El servicio bloquea consultas automatizadas");
        }
        throw new Error(`HTTP ${status}: ${error.message}`);
      }
      throw error;
    }
  }

  throw new Error("CAPTCHA_INVALID: Token expirado después de reintentos");
}

module.exports = { consultSbsSoat };
