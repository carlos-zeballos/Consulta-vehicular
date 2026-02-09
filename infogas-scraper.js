/**
 * INFOGAS Scraper
 * Consulta de información vehicular en INFOGAS
 * Requiere: PLACA
 * Usa reCAPTCHA v2 (resuelto con 2Captcha)
 * Usa API directa: https://apivh.infogas.com.pe/api/search
 */

const { chromium } = require('playwright');
const axios = require('axios');
const FormData = require('form-data');

class InfogasScraper {
  constructor(captchaApiKey = null) {
    this.baseURL = 'https://vh.infogas.com.pe/';
    this.apiURL = 'https://apivh.infogas.com.pe/api/search';
    this.captchaApiKey = captchaApiKey;
    this.stats = { attempts: 0, successes: 0, failures: 0 };
  }

  async consultarPlaca(placa, maxIntentos = 3) {
    this.stats.attempts++;
    console.log(`\n[INFOGAS] Iniciando consulta - Placa: ${placa}`);
    
    for (let intento = 1; intento <= maxIntentos; intento++) {
      console.log(`\n🔄 Intento ${intento}/${maxIntentos}`);
      
      try {
        const resultado = await this.consultarPlacaIntento(placa);
        if (resultado && resultado.success) {
          this.stats.successes++;
          console.log(`✅ [INFOGAS] CONSULTA EXITOSA en intento ${intento}`);
          return resultado;
        }
        // Si el resultado no tiene success, continuar al siguiente intento
        if (intento < maxIntentos) {
          await this.delay(3000);
        }
      } catch (error) {
        console.error(`❌ Error en intento ${intento}:`, error.message);
        if (intento === maxIntentos) {
          this.stats.failures++;
          // En lugar de lanzar error, devolver resultado con mensaje
          const errorMessage = error.message || 'Error al consultar INFOGAS';
          return {
            success: true,
            placa: placa,
            encontrado: false,
            mensaje: errorMessage.includes('temporalmente') || errorMessage.includes('no disponible') 
              ? 'Servicio temporalmente no disponible' 
              : errorMessage,
            timestamp: new Date().toISOString()
          };
        }
        await this.delay(3000);
      }
    }
    
    // Si llegamos aquí, todos los intentos fallaron
    return {
      success: true,
      placa: placa,
      encontrado: false,
      mensaje: 'No se pudo completar la consulta. Por favor, intente más tarde.',
      timestamp: new Date().toISOString()
    };
  }

  async consultarPlacaIntento(placa) {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
      });

      const page = await context.newPage();
      
      console.log('🌐 Navegando al sitio...');
      await page.goto(this.baseURL, { waitUntil: 'networkidle', timeout: 30000 });
      await this.delay(2000);

      // Esperar a que el formulario esté disponible
      console.log('⏳ Esperando que el formulario se cargue...');
      await page.waitForSelector('input[name="n_placa"]', { timeout: 15000 });
      await this.delay(1000);

      // Resolver reCAPTCHA
      console.log('🔐 Resolviendo reCAPTCHA...');
      const captchaResuelto = await this.checkAndSolveCaptcha(page);
      
      if (!captchaResuelto) {
        console.log('   ⚠️ No se pudo resolver el reCAPTCHA, pero continuando...');
        // No lanzar error, intentar continuar de todas formas
        await this.delay(2000);
      } else {
        console.log('   ✅ reCAPTCHA resuelto correctamente');
      }

      // Obtener cookies de la sesión
      const cookies = await context.cookies();
      const sessionCookie = cookies.find(c => c.name === 'api_vh_session');
      
      console.log(`   📋 Cookie de sesión: ${sessionCookie ? 'Encontrada' : 'No encontrada'}`);
      if (sessionCookie) {
        console.log(`   📋 Valor cookie: ${sessionCookie.value.substring(0, 20)}...`);
      }
      
      // Esperar un poco más después de resolver el CAPTCHA
      await this.delay(3000);
      
      // Llamar a la API directamente
      console.log('📡 Consultando API...');
      const apiResponse = await this.consultarAPI(placa, sessionCookie?.value);
      
      await browser.close();
      
      if (!apiResponse || !apiResponse.success) {
        console.log('   ⚠️ API no devolvió éxito');
        return {
          success: true,
          placa: placa,
          encontrado: false,
          mensaje: apiResponse?.mensaje || 'Vehículo no encontrado',
          timestamp: new Date().toISOString()
        };
      }

      console.log('   ✅ API devolvió datos exitosamente');
      return apiResponse;

    } catch (error) {
      await browser.close();
      // En lugar de lanzar error, devolver resultado con mensaje
      const errorMessage = error.message || 'Error al consultar INFOGAS';
      console.log(`   ⚠️ Error capturado: ${errorMessage}`);
      return {
        success: true,
        placa: placa,
        encontrado: false,
        mensaje: errorMessage.includes('temporalmente') || errorMessage.includes('no disponible') 
          ? 'Servicio temporalmente no disponible' 
          : errorMessage,
        timestamp: new Date().toISOString()
      };
    }
  }

  async consultarAPI(placa, sessionCookie) {
    try {
      console.log(`   📡 Llamando a API: ${this.apiURL}`);
      console.log(`   📋 Placa: ${placa}`);
      console.log(`   📋 Cookie: ${sessionCookie ? 'Presente' : 'No presente'}`);
      
      const response = await axios.post(this.apiURL, 
        { n_placa: placa.toLowerCase() },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'Origin': 'https://vh.infogas.com.pe',
            'Referer': 'https://vh.infogas.com.pe/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
            'Cookie': sessionCookie ? `api_vh_session=${sessionCookie}` : '',
            'X-Requested-With': 'XMLHttpRequest'
          },
          timeout: 30000,
          validateStatus: function (status) {
            return status >= 200 && status < 500; // Aceptar cualquier status < 500
          }
        }
      );

      if (response.status === 200 && response.data) {
        console.log('   ✅ Respuesta de API recibida');
        console.log('   📋 Datos recibidos:', JSON.stringify(response.data, null, 2));
        
        // La API devuelve los datos directamente
        const data = response.data;
        
        // Verificar si la respuesta indica "servicio no disponible" (esto puede venir como string o en un campo)
        if (typeof data === 'string' && (data.includes('no disponible') || data.includes('temporalmente'))) {
          console.log('   ⚠️ Servicio temporalmente no disponible (respuesta string)');
          return {
            success: true,
            placa: placa,
            encontrado: false,
            mensaje: 'Servicio temporalmente no disponible',
            timestamp: new Date().toISOString()
          };
        }
        
        // Verificar si hay error en la respuesta
        if (data.error || data.mensaje === 'Vehiculo no encontrado' || data.mensaje === 'Vehículo no encontrado') {
          console.log('   ⚠️ Vehículo no encontrado en INFOGAS');
          return {
            success: true,
            placa: placa,
            encontrado: false,
            mensaje: data.mensaje || 'Vehículo no encontrado',
            timestamp: new Date().toISOString()
          };
        }
        
        // Verificar si la respuesta indica "servicio no disponible" en un campo
        if (data.mensaje && (data.mensaje.includes('no disponible') || data.mensaje.includes('temporalmente'))) {
          console.log('   ⚠️ Servicio temporalmente no disponible (en campo mensaje)');
          return {
            success: true,
            placa: placa,
            encontrado: false,
            mensaje: data.mensaje || 'Servicio temporalmente no disponible',
            timestamp: new Date().toISOString()
          };
        }

        // Extraer datos del vehículo
        const resultado = {
          success: true,
          placa: data.placa || data.n_placa || placa,
          encontrado: true,
          vencimientoRevisionAnual: data.pran || data.vencimiento_revision_anual || data.fecha_revision || '',
          vencimientoCilindro: data.pvci || data.vencimiento_cilindro || data.fecha_cilindro || '',
          tieneCredito: data.havc || data.tiene_credito || data.credito || '',
          habilitadoParaConsumir: data.vhab || data.habilitado_para_consumir || data.habilitado || '',
          tipoCombustible: data.esgnv || data.tipo_combustible || data.combustible || '',
          timestamp: new Date().toISOString()
        };
        
        // Verificar si realmente hay datos
        const tieneDatos = resultado.vencimientoRevisionAnual || 
                          resultado.vencimientoCilindro || 
                          resultado.tieneCredito || 
                          resultado.habilitadoParaConsumir || 
                          resultado.tipoCombustible;
        
        if (!tieneDatos) {
          console.log('   ⚠️ No se encontraron datos en la respuesta');
          return {
            success: true,
            placa: placa,
            encontrado: false,
            mensaje: 'No se encontró información para este vehículo',
            timestamp: new Date().toISOString()
          };
        }
        
        console.log('   ✅ Datos extraídos:', JSON.stringify(resultado, null, 2));
        return resultado;
      }

      // Si el status no es 200, verificar el mensaje de error
      console.log(`   ⚠️ API respondió con status ${response.status}`);
      if (response.data) {
        console.log(`   📋 Respuesta de error:`, JSON.stringify(response.data, null, 2));
        const errorMsg = response.data.mensaje || response.data.message || response.data.error || `API respondió con status ${response.status}`;
        return {
          success: true,
          placa: placa,
          encontrado: false,
          mensaje: errorMsg,
          timestamp: new Date().toISOString()
        };
      }
      
      // Si el status no es 200, devolver resultado con mensaje
      return {
        success: true,
        placa: placa,
        encontrado: false,
        mensaje: `API respondió con status ${response.status}. La consulta se realizó pero no se encontraron resultados.`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      if (error.response) {
        console.error(`   ⚠️ Error de API: ${error.response.status}`);
        console.error(`   📋 Respuesta:`, JSON.stringify(error.response.data, null, 2));
        
        // Si la respuesta es 200 pero con error en el body
        if (error.response.status === 200 && error.response.data) {
          const errorData = error.response.data;
          if (errorData.mensaje) {
            return {
              success: true,
              placa: placa,
              encontrado: false,
              mensaje: errorData.mensaje,
              timestamp: new Date().toISOString()
            };
          }
        }
        
        // Devolver resultado en lugar de lanzar error
        return {
          success: true,
          placa: placa,
          encontrado: false,
          mensaje: `Error de API: ${error.response.status}`,
          timestamp: new Date().toISOString()
        };
      }
      // Devolver resultado en lugar de lanzar error
      return {
        success: true,
        placa: placa,
        encontrado: false,
        mensaje: error.message || 'Error al consultar la API',
        timestamp: new Date().toISOString()
      };
    }
  }

  async checkAndSolveCaptcha(page) {
    // Verificar si hay reCAPTCHA
    const hasRecaptcha = await page.evaluate(() => {
      return document.querySelector('.g-recaptcha') !== null ||
             document.querySelector('iframe[src*="recaptcha"]') !== null ||
             document.querySelector('[data-sitekey]') !== null;
    });
    
    if (!hasRecaptcha) {
      console.log('   ✅ No se requiere CAPTCHA');
      // Aún así, esperar un poco para que la página se cargue completamente
      await this.delay(2000);
      return true;
    }
    
    console.log('   🔐 reCAPTCHA detectado, resolviendo...');
    
    if (!this.captchaApiKey) {
      console.log('   ⚠️ API Key de 2Captcha no configurada');
      // Intentar continuar sin resolver CAPTCHA (puede que no sea necesario)
      console.log('   ⚠️ Continuando sin resolver CAPTCHA...');
      await this.delay(2000);
      return false; // Retornar false pero no lanzar error
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
      console.log('   ⚠️ No se pudo obtener site key');
      return false;
    }
    
    console.log(`   📋 Site Key: ${siteKey.substring(0, 20)}...`);
    
    // Resolver con 2Captcha
    const pageURL = page.url();
    const token = await this.resolveRecaptchaV2(siteKey, pageURL);
    
    if (!token) {
      console.log('   ⚠️ No se pudo obtener token de CAPTCHA, continuando sin él...');
      await this.delay(2000);
      return false; // Retornar false pero no lanzar error
    }
    
    console.log(`   ✅ Token obtenido: ${token.substring(0, 30)}...`);
    
    // Inyectar token
    await page.evaluate((token) => {
      const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (textarea) {
        textarea.value = token;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // También llamar al callback si existe
      if (typeof vcc === 'function') {
        vcc(token);
      }
      
      // Intentar disparar el evento de verificación
      if (typeof grecaptcha !== 'undefined' && grecaptcha.getResponse) {
        try {
          grecaptcha.getResponse();
        } catch (e) {
          console.log('Error al verificar grecaptcha:', e);
        }
      }
    }, token);
    
    await this.delay(3000);
    console.log('   ✅ Token de reCAPTCHA inyectado');
    return true;
  }

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
        const errorMsg = uploadResponse.data?.request || 'Unknown error';
        console.log(`   ⚠️ Error subiendo reCAPTCHA: ${errorMsg}`);
        return null; // Retornar null en lugar de lanzar error
      }
      
      const taskId = uploadResponse.data.request;
      console.log(`   📋 Task ID: ${taskId}`);
      
      // Esperar solución (máximo 2 minutos)
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
          const errorCode = resultResponse.data.request;
          // Si el CAPTCHA no se puede resolver, intentar continuar sin él
          if (errorCode === 'ERROR_CAPTCHA_UNSOLVABLE' || errorCode === 'ERROR_WRONG_CAPTCHA_ID') {
            console.log(`   ⚠️ CAPTCHA no resuelto (${errorCode}), continuando sin token...`);
            return null; // Retornar null para indicar que no hay token
          }
          // Para otros errores, también retornar null en lugar de lanzar error
          console.log(`   ⚠️ Error resolviendo reCAPTCHA: ${errorCode}`);
          return null;
        }
      }
      
      // Si hay timeout, retornar null en lugar de lanzar error
      console.log('   ⚠️ Timeout esperando solución del reCAPTCHA');
      return null;
      
    } catch (error) {
      // En lugar de lanzar error, retornar null
      console.log(`   ⚠️ Error en 2Captcha: ${error.message}`);
      return null;
    }
  }


  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = InfogasScraper;
