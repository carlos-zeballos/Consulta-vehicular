/**
 * APESEG SOAT Adapter
 * Consulta SOAT usando la API oficial de APESEG
 * https://www.apeseg.org.pe/consultas-soat/
 */

const axios = require('axios');
const FormData = require('form-data');

class ApesegSoatAdapter {
  constructor(captchaApiKey = null) {
    this.captchaApiKey = captchaApiKey || process.env.CAPTCHA_API_KEY || '';
    this.baseUrl = 'https://webapp.apeseg.org.pe';
    this.appSecret = '9asjKZ9aJq1@2025';
    this.token = null;
  }

  /**
   * Resolver captcha usando 2Captcha
   */
  async resolveCaptcha() {
    try {
      console.log('[APESEG] Resolviendo captcha...');
      
      // Primero obtener el captcha
      const captchaResponse = await axios.post(
        `${this.baseUrl}/captcha-api/api/captcha/verify`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'x-app-secret': this.appSecret,
            'origin': this.baseUrl,
            'referer': `${this.baseUrl}/consulta-soat/?source=apeseg`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
          }
        }
      );

      console.log('[APESEG] Respuesta captcha:', captchaResponse.data);

      // Si el captcha requiere resolución con 2Captcha
      if (captchaResponse.data && captchaResponse.data.captcha) {
        if (!this.captchaApiKey) {
          throw new Error('CAPTCHA_API_KEY no configurado. Se requiere para resolver el captcha de APESEG.');
        }

        // Resolver con 2Captcha
        const formData = new FormData();
        formData.append('method', 'base64');
        formData.append('key', this.captchaApiKey);
        formData.append('body', captchaResponse.data.captcha);
        formData.append('json', 1);

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
            return resultResponse.data.request; // Token del captcha resuelto
          }
          
          if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
            throw new Error(`Error al resolver captcha: ${resultResponse.data.request}`);
          }
        }

        throw new Error('Timeout esperando resolución del captcha');
      }

      // Si no requiere captcha, retornar éxito
      return captchaResponse.data;
    } catch (error) {
      console.error('[APESEG] Error resolviendo captcha:', error.message);
      throw error;
    }
  }

  /**
   * Hacer login para obtener token Bearer
   */
  async login(captchaToken = null) {
    try {
      console.log('[APESEG] Haciendo login...');

      const loginData = {};
      if (captchaToken) {
        loginData.captcha = captchaToken;
      }

      const loginResponse = await axios.post(
        `${this.baseUrl}/consulta-soat/api/login`,
        loginData,
        {
          headers: {
            'Content-Type': 'application/json',
            'origin': this.baseUrl,
            'referer': `${this.baseUrl}/consulta-soat/resultados`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
          }
        }
      );

      console.log('[APESEG] Respuesta login:', loginResponse.data);

      if (loginResponse.data && loginResponse.data.token) {
        this.token = loginResponse.data.token;
        return this.token;
      }

      // Si no hay token en la respuesta, puede que el login sea automático
      // Intentar usar un token por defecto o hacer la consulta directamente
      if (loginResponse.status === 200) {
        // El token puede estar en las cookies o headers
        const setCookie = loginResponse.headers['set-cookie'];
        if (setCookie) {
          console.log('[APESEG] Cookies recibidas:', setCookie);
        }
        return 'anonymous'; // Token anónimo si no se requiere autenticación
      }

      throw new Error('No se pudo obtener token de autenticación');
    } catch (error) {
      console.error('[APESEG] Error en login:', error.message);
      throw error;
    }
  }

  /**
   * Consultar placa
   */
  async consultarPlaca(placa) {
    try {
      console.log(`[APESEG] Consultando placa: ${placa}`);

      // Normalizar placa (mayúsculas, sin espacios)
      const placaNormalizada = placa.toUpperCase().trim().replace(/\s+/g, '');

      // Si no hay token, intentar obtenerlo primero
      if (!this.token) {
        try {
          const captchaResult = await this.resolveCaptcha();
          await this.login(captchaResult);
        } catch (error) {
          console.warn('[APESEG] No se pudo obtener token, intentando consulta directa:', error.message);
        }
      }

      const headers = {
        'accept': '*/*',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'es-PE,es;q=0.9',
        'cache-control': 'no-cache',
        'origin': this.baseUrl,
        'referer': `${this.baseUrl}/consulta-soat/resultados`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'x-referrer': 'https://www.apeseg.org.pe/',
        'x-source': 'apeseg'
      };

      // Agregar token si existe
      if (this.token && this.token !== 'anonymous') {
        headers['authorization'] = `Bearer ${this.token}`;
      }

      const response = await axios.get(
        `${this.baseUrl}/consulta-soat/api/certificados/placa/${placaNormalizada}`,
        {
          headers,
          timeout: 30000
        }
      );

      console.log(`[APESEG] Respuesta para placa ${placaNormalizada}:`, response.data);

      if (Array.isArray(response.data) && response.data.length > 0) {
        return {
          success: true,
          placa: placaNormalizada,
          polizas: response.data.map(poliza => this.normalizarPoliza(poliza)),
          total: response.data.length
        };
      }

      return {
        success: true,
        placa: placaNormalizada,
        polizas: [],
        total: 0,
        message: 'No se encontraron pólizas SOAT para esta placa'
      };
    } catch (error) {
      console.error(`[APESEG] Error consultando placa ${placa}:`, error.message);
      
      if (error.response) {
        console.error('[APESEG] Status:', error.response.status);
        console.error('[APESEG] Data:', error.response.data);
        
        if (error.response.status === 401) {
          // Token expirado, intentar renovar
          this.token = null;
          try {
            const captchaResult = await this.resolveCaptcha();
            await this.login(captchaResult);
            // Reintentar consulta
            return this.consultarPlaca(placa);
          } catch (retryError) {
            throw new Error(`Error de autenticación: ${retryError.message}`);
          }
        }
      }

      throw error;
    }
  }

  /**
   * Normalizar datos de póliza al formato esperado
   */
  normalizarPoliza(poliza) {
    return {
      compania: poliza.NombreCompania || poliza.NombreCompania || 'N/A',
      fecha_inicio: poliza.FechaInicio || '',
      fecha_fin: poliza.FechaFin || '',
      numero_poliza: poliza.NumeroPoliza || '',
      numero_certificado: poliza.CodigoUnicoPoliza || '',
      estado: poliza.Estado || '',
      uso_vehiculo: poliza.NombreUsoVehiculo || '',
      clase_vehiculo: poliza.NombreClaseVehiculo || '',
      tipo_certificado: poliza.TipoCertificado || '',
      fecha_creacion: poliza.FechaCreacion || '',
      // Campos adicionales
      codigo_sbs_aseguradora: poliza.CodigoSBSAseguradora || '',
      fecha_control_policial: poliza.FechaControlPolicial || '',
      placa: poliza.Placa || ''
    };
  }

  /**
   * Método principal: consultar SOAT por placa
   */
  async consultar(placa) {
    try {
      // Intentar consulta directa primero (puede que no requiera captcha)
      try {
        return await this.consultarPlaca(placa);
      } catch (error) {
        // Si falla, intentar con captcha y login
        console.log('[APESEG] Consulta directa falló, intentando con captcha...');
        const captchaResult = await this.resolveCaptcha();
        await this.login(captchaResult);
        return await this.consultarPlaca(placa);
      }
    } catch (error) {
      console.error('[APESEG] Error en consulta:', error.message);
      return {
        success: false,
        placa: placa.toUpperCase().trim(),
        polizas: [],
        error: error.message
      };
    }
  }
}

module.exports = ApesegSoatAdapter;
