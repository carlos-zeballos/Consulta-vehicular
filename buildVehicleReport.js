/**
 * buildVehicleReport.js
 * Normaliza datos del API en un modelo único VehicleReport
 * Reglas duras: NO inventa datos, solo normaliza lo que existe
 * VERSIÓN CEO: Coherencia total, verificacion.metodo/evidencias, meta.fuentes
 */

/**
 * @typedef {Object} VehicleData
 * @property {string} marca
 * @property {string} modelo
 * @property {string} color
 * @property {string} motor
 * @property {string} vin
 * @property {string} serie
 * @property {string} placa
 * @property {number|null} anio
 */

/**
 * @typedef {Object} SOATData
 * @property {'vigente'|'vencido'|'no_disponible'} estado
 * @property {string} aseguradora
 * @property {string|null} inicio
 * @property {string|null} fin
 * @property {string|null} poliza
 * @property {Object} verificacion
 * @property {'estado_directo'|'por_fecha'|'sin_datos'} verificacion.metodo
 * @property {string[]} verificacion.evidencias
 */

/**
 * @typedef {Object} CITVCertificate
 * @property {string} inicio
 * @property {string} fin
 * @property {string|null} resultado
 * @property {'vigente'|'vencido'} estado
 * @property {string|null} observaciones
 * @property {string|null} empresa
 * @property {string|null} direccion
 */

/**
 * @typedef {Object} InfractionSource
 * @property {'empty'|'ok'|'error'|'requires_data'|'not_verified'} status
 * @property {string} fuente
 * @property {Array} registros
 * @property {string|null} error
 * @property {boolean} requiere_captcha
 * @property {boolean} requiere_datos_adicionales
 */

/**
 * @typedef {Object} VehicleReport
 * @property {VehicleData} vehicle
 * @property {SOATData} soat
 * @property {CITVCertificate[]} citv
 * @property {Object<string, InfractionSource>} infracciones
 * @property {Object} meta
 * @property {Object} meta.fuentes - Tracking de verificación por fuente
 */

/**
 * Parsea fecha de forma segura (soporta ISO, DD/MM/YYYY, DD-MM-YYYY)
 * NUNCA retorna "Invalid Date"
 * VERSIÓN LOCAL para buildVehicleReport.js
 */
function parseDateSafeLocal(dateStr) {
  if (!dateStr) return null;
  
  const s = String(dateStr).trim();
  if (!s || s === 'N/A' || s === '-' || s === 'null' || s === 'undefined') return null;
  
  // 1) Intentar Date normal (soporta ISO y formatos estándar)
  let d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
    return d;
  }
  
  // 2) DD/MM/YYYY o DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1; // Mes es 0-indexed
    const yyyy = Number(m[3]);
    if (dd >= 1 && dd <= 31 && mm >= 0 && mm <= 11 && yyyy >= 1900 && yyyy <= 2100) {
      const d2 = new Date(yyyy, mm, dd);
      if (!isNaN(d2.getTime())) return d2;
    }
  }
  
  // 3) YYYY-MM-DD (ISO sin hora)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const yyyy = Number(isoMatch[1]);
    const mm = Number(isoMatch[2]) - 1;
    const dd = Number(isoMatch[3]);
    if (dd >= 1 && dd <= 31 && mm >= 0 && mm <= 11 && yyyy >= 1900 && yyyy <= 2100) {
      const d3 = new Date(yyyy, mm, dd);
      if (!isNaN(d3.getTime())) return d3;
    }
  }
  
  return null;
}

/**
 * Limpia texto
 */
function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/[^\w\s\u00C0-\u017F.,;:()\/\-\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae año del vehículo de múltiples fuentes
 */
function extraerAnio(rawData) {
  const vehiculo = rawData.vehiculo?.data || rawData.vehiculo || {};
  const soat = rawData.soat?.data || rawData.soat || {};
  const revision = rawData.revision?.data || rawData.revision || {};
  const placasPe = rawData['placas-pe']?.data || rawData['placas-pe'] || {};
  
  // Prioridad: vehiculo.anioFabricacion > vehiculo.anio > soat.anio > revision.anio > placasPe (si tiene año en startDate)
  const anio = vehiculo.anioFabricacion || 
               vehiculo.anio || 
               vehiculo.anio_fabricacion ||
               soat.anio ||
               revision.anio ||
               (placasPe.startDate ? parseDateSafeLocal(placasPe.startDate)?.getFullYear() : null);
  
  const parsed = parseInt(anio);
  if (isNaN(parsed) || parsed < 1950 || parsed > new Date().getFullYear() + 1) {
    return null;
  }
  return parsed;
}

/**
 * Normaliza datos del vehículo
 */
function normalizarVehiculo(rawData) {
  const vehiculo = rawData.vehiculo?.data || rawData.vehiculo || {};
  
  return {
    marca: vehiculo.marca || vehiculo.Marca || 'No disponible',
    modelo: vehiculo.modelo || vehiculo.Modelo || 'No disponible',
    color: vehiculo.color || vehiculo.Color || 'No disponible',
    motor: vehiculo.motor || vehiculo.Motor || 'No disponible',
    vin: vehiculo.vin || vehiculo.VIN || vehiculo.chasis || 'No disponible',
    serie: vehiculo.serie || vehiculo.Serie || 'No disponible',
    placa: vehiculo.placa || vehiculo.Placa || rawData.placa || 'N/A',
    anio: extraerAnio(rawData)
  };
}

/**
 * Normaliza datos de SOAT - VERSIÓN CEO: Robusta, con verificacion.metodo/evidencias
 */
function normalizarSOAT(rawData) {
  const soatWrap = rawData.soat || {};
  const soat = soatWrap.data || soatWrap || {};

  const inicio = soat.fechaInicio || soat.fecha_inicio || soat.inicio || soat.inicio_vigencia || null;
  const fin = soat.fechaFin || soat.fecha_fin || soat.fin || soat.vigenciaFin || soat.fin_vigencia || null;

  // 1) Estado directo (más variantes, case-insensitive)
  const estadoRaw =
    soat.estado ?? soat.Estado ?? soat.estado_soat ?? soat.ESTADO ?? soat.estadoSoat ?? null;

  let estado = 'no_disponible';
  let metodo = 'sin_datos';
  const evidencias = [];

  if (estadoRaw != null) {
    const s = String(estadoRaw).toLowerCase().trim();
    evidencias.push('soat.data.estado');

    const tokensVigente = ['vigente', 'activo', 'valid', 'ok', 'habilitado', 'vig'];
    const tokensVencido = ['vencido', 'inactivo', 'expired', 'caducado', 'no vigente', 'ven'];

    if (s === 'v' || tokensVigente.some(t => s.includes(t)) || s === 'si' || s === 'yes') {
      estado = 'vigente';
      metodo = 'estado_directo';
    } else if (s === 'no' || tokensVencido.some(t => s.includes(t))) {
      estado = 'vencido';
      metodo = 'estado_directo';
    }
  }

  // 2) Por fecha (solo si aún no hay estado confiable)
  if (estado === 'no_disponible' && fin) {
    evidencias.push('soat.data.fechaFin');
    const fFin = parseDateSafeLocal(fin);
    if (fFin) {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      fFin.setHours(0, 0, 0, 0);
      estado = fFin >= hoy ? 'vigente' : 'vencido';
      metodo = 'por_fecha';
    }
  }

  // 3) Si hay inicio pero no fin, calcular fin = inicio + 1 año
  let finCalculado = fin;
  if (inicio && !fin) {
    const fInicio = parseDateSafeLocal(inicio);
    if (fInicio) {
      const fFin = new Date(fInicio);
      fFin.setFullYear(fFin.getFullYear() + 1);
      finCalculado = fFin.toISOString().split('T')[0];
      evidencias.push('soat.data.fechaInicio_calculado');
      if (estado === 'no_disponible') {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        fFin.setHours(0, 0, 0, 0);
        estado = fFin >= hoy ? 'vigente' : 'vencido';
        metodo = 'por_fecha';
      }
    }
  }

  const aseguradora = soat.aseguradora || 
                      soat.Aseguradora || 
                      soat.nombre_compania || 
                      soat.nombreCompania ||
                      soat.compania ||
                      soat.empresa ||
                      'No disponible';
  
  const poliza = soat.poliza || 
                 soat.numeroPoliza || 
                 soat.numero_poliza ||
                 soat.n_poliza ||
                 soat.poliza_numero ||
                 null;

  return {
    estado,
    aseguradora: cleanText(aseguradora),
    inicio,
    fin: finCalculado || fin,
    poliza: poliza ? cleanText(poliza) : null,
    verificacion: { metodo, evidencias }
  };
}

/**
 * Normaliza certificados CITV - MEJORADA para capturar todos los campos
 */
function normalizarCITV(rawData) {
  console.log('[CITV Normalización] 🔍 rawData.revision completo:', JSON.stringify(rawData.revision, null, 2));
  
  // Intentar múltiples formas de acceder a los datos de revision
  let revision = null;
  
  // Caso 1: rawData.revision.data (array directo)
  if (rawData.revision?.data && Array.isArray(rawData.revision.data)) {
    revision = rawData.revision.data;
    console.log('[CITV Normalización] ✅ Caso 1: Array directo en revision.data, elementos:', revision.length);
  }
  // Caso 2: rawData.revision es array directo
  else if (Array.isArray(rawData.revision)) {
    revision = rawData.revision;
    console.log('[CITV Normalización] ✅ Caso 2: revision es array directo, elementos:', revision.length);
  }
  // Caso 3: rawData.revision es objeto con estructura { status, data }
  else if (rawData.revision && typeof rawData.revision === 'object' && rawData.revision.data) {
    if (Array.isArray(rawData.revision.data)) {
      revision = rawData.revision.data;
      console.log('[CITV Normalización] ✅ Caso 3: Objeto con data array, elementos:', revision.length);
    } else {
      revision = rawData.revision;
      console.log('[CITV Normalización] ⚠️ Caso 3: Objeto con data pero no es array');
    }
  }
  // Caso 4: rawData.revision es objeto único (un solo certificado)
  else if (rawData.revision && typeof rawData.revision === 'object') {
    revision = rawData.revision;
    console.log('[CITV Normalización] ⚠️ Caso 4: Objeto único (no array)');
  }
  // Caso 5: No hay datos
  else {
    revision = {};
    console.log('[CITV Normalización] ❌ Caso 5: No se encontraron datos de revision');
  }
  
  if (!revision) {
    console.log('[CITV Normalización] ❌ revision es null o undefined');
    return [];
  }
  
  // Función helper para normalizar un certificado individual
  const normalizarCert = (cert) => {
    // Extraer fechas de múltiples campos posibles
    const inicio = cert.vigencia_inicio || 
                   cert.vigenciaInicio || 
                   cert.fechaInicio || 
                   cert.fecha_inicio || 
                   cert.inicio || 
                   cert.vigente_desde ||
                   'N/A';
    
    const fin = cert.vigencia_fin || 
                cert.vigenciaFin || 
                cert.fechaFin || 
                cert.fecha_fin || 
                cert.fin || 
                cert.vigente_hasta ||
                'N/A';
    
    // Calcular estado si no está presente (usar parseDateSafeLocal)
    let estado = cert.estado;
    if (!estado && fin && fin !== 'N/A') {
      const fechaFin = parseDateSafeLocal(fin);
      if (fechaFin) {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        fechaFin.setHours(0, 0, 0, 0);
        estado = fechaFin >= hoy ? 'vigente' : 'vencido';
      } else {
        estado = 'vencido';
      }
    } else if (!estado) {
      estado = 'vencido';
    } else {
      // Normalizar estado
      const estadoStr = String(estado).toLowerCase();
      if (estadoStr.includes('vigente') || estadoStr === 'vigente' || estadoStr === 'v') {
        estado = 'vigente';
      } else {
        estado = 'vencido';
      }
    }
    
    return {
      inicio,
      fin,
      resultado: cert.resultado || cert.Resultado || null,
      estado,
      observaciones: cert.observacion || cert.observaciones || cert.Observaciones || null,
      empresa: cert.razon_social || cert.empresa || cert.Empresa || cert.razonSocial || null,
      direccion: cert.direccion || cert.Direccion || null,
      certificado: cert.nro_certificado || cert.certificado || cert.nroCertificado || null,
      ambito: cert.tipo_ambito || cert.ambito || null,
      tipo_servicio: cert.tipo_servicio || cert.tipoServicio || null
    };
  };
  
  // DEBUG: Log para ver qué datos llegan
  if (process.env.DEBUG_CITV) {
    console.log('[CITV Normalización] Datos recibidos:', JSON.stringify(revision, null, 2));
  }
  
  // Si es array, usar directamente
  if (Array.isArray(revision)) {
    if (revision.length === 0) {
      console.log('[CITV Normalización] ⚠️ Array vacío recibido');
      return [];
    }
    const result = revision.map(normalizarCert);
    console.log('[CITV Normalización] ✅ Array detectado, certificados normalizados:', result.length);
    console.log('[CITV Normalización] ✅ Primer certificado normalizado:', JSON.stringify(result[0], null, 2));
    return result;
  }
  
  // Si tiene inspecciones array
  if (revision && revision.inspecciones && Array.isArray(revision.inspecciones)) {
    const result = revision.inspecciones.map(normalizarCert);
    console.log('[CITV Normalización] ✅ Inspecciones array detectado, certificados:', result.length);
    return result;
  }
  
  // Si es un objeto único con datos de certificado
  if (revision && typeof revision === 'object' && (
      revision.vigencia_fin || 
      revision.vigenciaFin || 
      revision.fechaFin || 
      revision.fecha_fin ||
      revision.vigente_hasta ||
      revision.nro_certificado ||
      revision.certificado ||
      revision.resultado ||
      revision.estado)) {
    const result = [normalizarCert(revision)];
    console.log('[CITV Normalización] ✅ Objeto único detectado, certificado normalizado');
    return result;
  }
  
  // Si no hay datos, retornar array vacío
  console.log('[CITV Normalización] ❌ No se encontraron datos de certificado.');
  console.log('[CITV Normalización] ❌ Tipo:', typeof revision);
  console.log('[CITV Normalización] ❌ Es array?', Array.isArray(revision));
  if (revision && typeof revision === 'object') {
    console.log('[CITV Normalización] ❌ Keys:', Object.keys(revision));
    if (revision.data) {
      console.log('[CITV Normalización] ❌ revision.data existe, tipo:', typeof revision.data, 'es array?', Array.isArray(revision.data));
    }
  }
  return [];
}

/**
 * Normaliza permisos (lunas polarizadas, etc.)
 */
function normalizarPermisos(rawData) {
  const certificado = rawData['certificado-vehiculo']?.data || rawData.certificadoVehiculo || {};
  
  // Extraer estado de lunas polarizadas
  let lunasPolarizadas = null;
  
  // Si hay datos del certificado (marca, modelo, nro_certificado, etc.), significa que tiene certificado
  const tieneDatosCertificado = certificado && (
    certificado.marca || 
    certificado.modelo || 
    certificado.nro_certificado || 
    certificado.numero_certificado ||
    certificado.fecha_emision ||
    certificado.serie ||
    certificado.motor
  );
  
  // Buscar en diferentes campos posibles
  if (certificado.estado) {
    const estadoStr = String(certificado.estado).toLowerCase();
    if (estadoStr.includes('vigente') || estadoStr.includes('autorizado') || estadoStr.includes('aprobado') || estadoStr === 'si' || estadoStr === 'sí') {
      lunasPolarizadas = true;
    } else if (estadoStr.includes('vencido') || estadoStr.includes('no autorizado') || estadoStr.includes('rechazado') || estadoStr === 'no') {
      lunasPolarizadas = false;
    }
  }
  
  // Si hay datos del certificado pero no estado claro, asumir que tiene certificado vigente
  if (lunasPolarizadas === null && tieneDatosCertificado) {
    lunasPolarizadas = true; // Si hay datos del certificado, asumimos que está vigente
  }
  
  return {
    lunasPolarizadas,
    datosCertificado: tieneDatosCertificado ? certificado : null
  };
}

/**
 * Normaliza fuente de infracciones
 */
function normalizarInfracciones(rawData) {
  const fuentes = {
    sutran: { fuente: 'SUTRAN', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    callao: { fuente: 'Callao', registros: [], status: 'empty', error: null, requiere_captcha: true, requiere_datos_adicionales: false },
    puno: { fuente: 'Puno', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    sat_lima: { fuente: 'SAT Lima', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    sat_arequipa: { fuente: 'SAT Arequipa', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    sat_ica: { fuente: 'SAT Ica', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    sat_trujillo: { fuente: 'SAT Trujillo', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    sat_cajamarca: { fuente: 'SAT Cajamarca', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    sat_huancayo: { fuente: 'SAT Huancayo', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    sat_huanuco: { fuente: 'SAT Huánuco', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    sat_cusco: { fuente: 'SAT Cusco', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    sat_tacna: { fuente: 'SAT Tacna', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    sat_chachapoyas: { fuente: 'SAT Chachapoyas', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    sat_andahuaylas: { fuente: 'SAT Andahuaylas', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    sat_tarapoto: { fuente: 'SAT Tarapoto', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    arequipa: { fuente: 'Arequipa', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    piura: { fuente: 'Piura', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    tarapoto: { fuente: 'Tarapoto', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false },
    chiclayo: { fuente: 'Chiclayo', registros: [], status: 'empty', error: null, requiere_captcha: false, requiere_datos_adicionales: false }
  };
  
  // SUTRAN
  if (rawData.sutran?.data) {
    const sutran = rawData.sutran.data;
    if (sutran.infracciones && Array.isArray(sutran.infracciones) && sutran.infracciones.length > 0) {
      fuentes.sutran = {
        fuente: 'SUTRAN',
        registros: sutran.infracciones,
        status: 'ok',
        error: null,
        requiere_captcha: false,
        requiere_datos_adicionales: false
      };
    } else {
      fuentes.sutran.status = 'empty';
    }
  } else if (rawData.sutran?.error || rawData.sutran?.status === 'error') {
    fuentes.sutran.status = 'error';
    fuentes.sutran.error = rawData.sutran.error || rawData.sutran.mensaje || 'Error desconocido';
    fuentes.sutran.requiere_captcha = String(fuentes.sutran.error).toLowerCase().includes('captcha');
  }
  
  // Callao Papeletas
  if (rawData.callao?.data) {
    const callao = rawData.callao.data;
    if (callao.papeletas && Array.isArray(callao.papeletas) && callao.papeletas.length > 0) {
      fuentes.callao = {
        fuente: 'Callao',
        registros: callao.papeletas,
        status: 'ok',
        error: null,
        requiere_captcha: true,
        requiere_datos_adicionales: false
      };
    } else {
      fuentes.callao.status = 'empty';
    }
  } else if (rawData.callao?.error || rawData.callao?.status === 'error') {
    fuentes.callao.status = 'error';
    fuentes.callao.error = rawData.callao.error || rawData.callao.mensaje || 'Error desconocido';
    fuentes.callao.requiere_captcha = true;
  }

  // Puno - Papeletas
  if (rawData.puno?.data) {
    const puno = rawData.puno.data;
    const regs = puno.papeletas || [];
    if (Array.isArray(regs) && regs.length > 0) {
      fuentes.puno = { fuente: 'Puno', registros: regs, status: 'ok', error: null, requiere_captcha: false, requiere_datos_adicionales: false };
    } else {
      fuentes.puno.status = 'empty';
    }
  } else if (rawData.puno?.error || rawData.puno?.status === 'error') {
    fuentes.puno.status = 'error';
    fuentes.puno.error = rawData.puno.error || rawData.puno.mensaje || 'Error desconocido';
  }
  
  // SAT Lima - Capturas de Vehículos
  // Buscar en múltiples ubicaciones: sat, sat-lima
  const satLimaData = rawData.sat?.data || rawData['sat-lima']?.data || rawData.sat;
  
  if (satLimaData) {
    // El endpoint /api/sat devuelve capturas (no papeletas)
    const capturas = satLimaData.capturas || satLimaData.papeletas || [];
    
    if (Array.isArray(capturas) && capturas.length > 0) {
      fuentes.sat_lima = {
        fuente: 'SAT Lima',
        registros: capturas,
        status: 'ok',
        error: null,
        requiere_captcha: false,
        requiere_datos_adicionales: false
      };
    } else {
      fuentes.sat_lima.status = 'empty';
    }
  } else if (rawData.sat?.error || rawData.sat?.status === 'error' || 
             rawData['sat-lima']?.error || rawData['sat-lima']?.status === 'error') {
    fuentes.sat_lima.status = 'error';
    fuentes.sat_lima.error = rawData.sat?.error || rawData.sat?.mensaje || 
                            rawData['sat-lima']?.error || rawData['sat-lima']?.mensaje || 
                            'Error desconocido';
  }
  
  // SAT Ica
  if (rawData['sat-ica']?.data) {
    const sat = rawData['sat-ica'].data;
    if (sat.papeletas && Array.isArray(sat.papeletas) && sat.papeletas.length > 0) {
      fuentes.sat_ica = {
        fuente: 'SAT Ica',
        registros: sat.papeletas,
        status: 'ok',
        error: null,
        requiere_captcha: false,
        requiere_datos_adicionales: false
      };
    } else {
      fuentes.sat_ica.status = 'empty';
    }
  } else if (rawData['sat-ica']?.error || rawData['sat-ica']?.status === 'error') {
    fuentes.sat_ica.status = 'error';
    fuentes.sat_ica.error = rawData['sat-ica'].error || rawData['sat-ica'].mensaje || 'Error desconocido';
  }

  // Arequipa (municipalidad)
  if (rawData.arequipa?.data) {
    const a = rawData.arequipa.data;
    const regs = a.resultados || a.papeletas || a.infracciones || [];
    if (Array.isArray(regs) && regs.length > 0) {
      fuentes.arequipa = { fuente: 'Arequipa', registros: regs, status: 'ok', error: null, requiere_captcha: false, requiere_datos_adicionales: false };
    } else {
      fuentes.arequipa.status = 'empty';
    }
  } else if (rawData.arequipa?.error || rawData.arequipa?.status === 'error') {
    fuentes.arequipa.status = 'error';
    fuentes.arequipa.error = rawData.arequipa.error || rawData.arequipa.mensaje || 'Error desconocido';
  }

  // Piura
  if (rawData.piura?.data) {
    const p = rawData.piura.data;
    const regs = p.multas || p.papeletas || [];
    if (Array.isArray(regs) && regs.length > 0) {
      fuentes.piura = { fuente: 'Piura', registros: regs, status: 'ok', error: null, requiere_captcha: false, requiere_datos_adicionales: false };
    } else {
      fuentes.piura.status = 'empty';
    }
  } else if (rawData.piura?.error || rawData.piura?.status === 'error') {
    fuentes.piura.status = 'error';
    fuentes.piura.error = rawData.piura.error || rawData.piura.mensaje || 'Error desconocido';
  }

  // Tarapoto
  if (rawData.tarapoto?.data) {
    const t = rawData.tarapoto.data;
    const regs = t.multas || t.papeletas || [];
    if (Array.isArray(regs) && regs.length > 0) {
      fuentes.tarapoto = { fuente: 'Tarapoto', registros: regs, status: 'ok', error: null, requiere_captcha: false, requiere_datos_adicionales: false };
    } else {
      fuentes.tarapoto.status = 'empty';
    }
  } else if (rawData.tarapoto?.error || rawData.tarapoto?.status === 'error') {
    fuentes.tarapoto.status = 'error';
    fuentes.tarapoto.error = rawData.tarapoto.error || rawData.tarapoto.mensaje || 'Error desconocido';
  }

  // Chiclayo
  if (rawData.chiclayo?.data) {
    const c = rawData.chiclayo.data;
    const regs = c.infracciones || c.papeletas || [];
    if (Array.isArray(regs) && regs.length > 0) {
      fuentes.chiclayo = { fuente: 'Chiclayo', registros: regs, status: 'ok', error: null, requiere_captcha: false, requiere_datos_adicionales: false };
    } else {
      fuentes.chiclayo.status = 'empty';
    }
  } else if (rawData.chiclayo?.error || rawData.chiclayo?.status === 'error') {
    fuentes.chiclayo.status = 'error';
    fuentes.chiclayo.error = rawData.chiclayo.error || rawData.chiclayo.mensaje || 'Error desconocido';
  }
  
  // SAT Trujillo
  if (rawData['sat-trujillo']?.data) {
    const sat = rawData['sat-trujillo'].data;
    if (sat.papeletas && Array.isArray(sat.papeletas) && sat.papeletas.length > 0) {
      fuentes.sat_trujillo = {
        fuente: 'SAT Trujillo',
        registros: sat.papeletas,
        status: 'ok',
        error: null,
        requiere_captcha: false,
        requiere_datos_adicionales: false
      };
    } else {
      fuentes.sat_trujillo.status = 'empty';
    }
  } else if (rawData['sat-trujillo']?.error || rawData['sat-trujillo']?.status === 'error') {
    fuentes.sat_trujillo.status = 'error';
    fuentes.sat_trujillo.error = rawData['sat-trujillo'].error || rawData['sat-trujillo'].mensaje || 'Error desconocido';
    fuentes.sat_trujillo.requiere_datos_adicionales = true; // Trujillo requiere DNI, celular, correo
  }
  
  // SAT Cajamarca
  if (rawData['sat-cajamarca']?.data) {
    const sat = rawData['sat-cajamarca'].data;
    if (sat.papeletas && Array.isArray(sat.papeletas) && sat.papeletas.length > 0) {
      fuentes.sat_cajamarca = {
        fuente: 'SAT Cajamarca',
        registros: sat.papeletas,
        status: 'ok',
        error: null,
        requiere_captcha: false,
        requiere_datos_adicionales: false
      };
    } else {
      fuentes.sat_cajamarca.status = 'empty';
    }
  } else if (rawData['sat-cajamarca']?.error || rawData['sat-cajamarca']?.status === 'error') {
    fuentes.sat_cajamarca.status = 'error';
    fuentes.sat_cajamarca.error = rawData['sat-cajamarca'].error || rawData['sat-cajamarca'].mensaje || 'Error desconocido';
  }
  
  // SAT Arequipa
  if (rawData['sat-arequipa']?.data) {
    const sat = rawData['sat-arequipa'].data;
    if (sat.papeletas && Array.isArray(sat.papeletas) && sat.papeletas.length > 0) {
      fuentes.sat_arequipa = {
        fuente: 'SAT Arequipa',
        registros: sat.papeletas,
        status: 'ok',
        error: null,
        requiere_captcha: false,
        requiere_datos_adicionales: false
      };
    } else {
      fuentes.sat_arequipa.status = 'empty';
    }
  } else if (rawData['sat-arequipa']?.error || rawData['sat-arequipa']?.status === 'error') {
    fuentes.sat_arequipa.status = 'error';
    fuentes.sat_arequipa.error = rawData['sat-arequipa'].error || rawData['sat-arequipa'].mensaje || 'Error desconocido';
  }
  
  // Agregar más fuentes según necesidad...
  
  return fuentes;
}

/**
 * Normaliza datos de PLACAS.PE
 */
function normalizarPlacasPe(rawData) {
  // Buscar datos en múltiples ubicaciones posibles
  let placasPe = null;
  
  // 1. rawData['placas-pe']?.data (estructura normal)
  if (rawData['placas-pe']?.data) {
    placasPe = rawData['placas-pe'].data;
  }
  // 2. rawData['placas-pe'] (directo)
  else if (rawData['placas-pe']) {
    placasPe = rawData['placas-pe'];
  }
  // 3. rawData.placasPe (camelCase)
  else if (rawData.placasPe) {
    placasPe = rawData.placasPe;
  }
  // 4. Si placas-pe tiene estructura { ok, data, status }
  else if (rawData['placas-pe']?.ok && rawData['placas-pe']?.data) {
    placasPe = rawData['placas-pe'].data;
  }
  
  if (!placasPe || typeof placasPe !== 'object') {
    console.log('[normalizarPlacasPe] No se encontraron datos de PLACAS.PE');
    return null;
  }
  
  console.log('[normalizarPlacasPe] Datos recibidos:', JSON.stringify(placasPe, null, 2));
  
  // Extraer campos con múltiples variantes posibles
  const extractField = (obj, ...keys) => {
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
        return obj[key];
      }
    }
    return null;
  };
  
  const statusDescription = extractField(placasPe, 'statusDescription', 'StatusDescription', 'status', 'Status');
  const brand = extractField(placasPe, 'brand', 'Brand', 'marca');
  const model = extractField(placasPe, 'model', 'Model', 'modelo');
  const deliveryPoint = extractField(placasPe, 'deliveryPoint', 'DeliveryPoint', 'delivery_point');
  const description = extractField(placasPe, 'description', 'Description', 'descripcion');
  const insertDate = extractField(placasPe, 'insertDate', 'InsertDate', 'insert_date', 'fechaRegistro');
  const ownerCompleteName = extractField(placasPe, 'ownerCompleteName', 'OwnerCompleteName', 'owner_complete_name', 'propietario');
  const startDate = extractField(placasPe, 'startDate', 'StartDate', 'start_date', 'fechaInicio');
  const serialNumber = extractField(placasPe, 'serialNumber', 'SerialNumber', 'serial_number');
  const placa = extractField(placasPe, 'placa', 'Placa', 'plateNew', 'PlateNew');
  const plateNew = extractField(placasPe, 'plateNew', 'PlateNew', 'placa');
  const encontrado = placasPe.encontrado !== undefined ? placasPe.encontrado : 
                     (placasPe.Encontrado !== undefined ? placasPe.Encontrado : 
                     (statusDescription ? true : null));
  
  // Verificar si hay datos
  const tieneDatos = statusDescription || brand || model || ownerCompleteName || 
                     deliveryPoint || description || insertDate || startDate ||
                     serialNumber || placa || plateNew;
  
  if (!tieneDatos) {
    console.log('[normalizarPlacasPe] No hay datos válidos después de extracción');
    return null;
  }
  
  const resultado = {
    statusDescription: statusDescription,
    status: statusDescription || extractField(placasPe, 'status', 'Status'),
    brand: brand,
    model: model,
    ownerCompleteName: ownerCompleteName,
    plateNew: plateNew,
    placa: placa || plateNew,
    deliveryPoint: deliveryPoint,
    startDate: startDate,
    insertDate: insertDate,
    description: description,
    serialNumber: serialNumber,
    encontrado: encontrado
  };
  
  console.log('[normalizarPlacasPe] Datos normalizados:', JSON.stringify(resultado, null, 2));
  
  return resultado;
}

/**
 * Construye el reporte normalizado
 * VERSIÓN CEO: Agrega meta.fuentes para tracking de verificación
 */
function buildVehicleReport(rawData, placa) {
  const vehicle = normalizarVehiculo(rawData);
  const soat = normalizarSOAT(rawData);
  const citv = normalizarCITV(rawData);
  const infracciones = normalizarInfracciones(rawData);
  const placasPe = normalizarPlacasPe(rawData);
  const permisos = normalizarPermisos(rawData);

  // INFOGAS (sección adicional - siempre presente en PDF)
  const infogas = rawData.infogas?.data || null;

  // Impuesto Vehicular (SAT Lima)
  const impuestoVehicular = rawData['impuesto-vehicular']?.data || rawData.impuestoVehicular?.data || null;

  // PIT Foto Papeletas
  const pitFoto = rawData['pit-foto']?.data || rawData.pitFoto?.data || null;
  
  // Meta información
  const fuentesDisponibles = [];
  const errores = [];
  
  // Tracking de fuentes (meta.fuentes) - VERSIÓN CEO
  const fuentes = {};
  
  if (rawData.vehiculo) {
    fuentesDisponibles.push('Vehículo');
    fuentes.vehiculo = {
      ok: rawData.vehiculo?.ok ?? null,
      status: rawData.vehiculo?.status ?? null,
      source: rawData.vehiculo?.source ?? 'vehiculo'
    };
  }
  
  if (rawData.soat) {
    fuentesDisponibles.push('SOAT');
    fuentes.soat = {
      ok: rawData.soat?.ok ?? null,
      status: rawData.soat?.status ?? null,
      source: rawData.soat?.source ?? 'soat'
    };
  }
  
  if (rawData.revision) {
    fuentesDisponibles.push('CITV');
    fuentes.revision = {
      ok: rawData.revision?.ok ?? null,
      status: rawData.revision?.status ?? null,
      source: rawData.revision?.source ?? 'revision'
    };
  }
  
  if (rawData.sutran) {
    fuentesDisponibles.push('SUTRAN');
    fuentes.sutran = {
      ok: rawData.sutran?.ok ?? null,
      status: rawData.sutran?.status ?? null,
      source: rawData.sutran?.source ?? 'sutran'
    };
  }
  
  if (rawData.callao) {
    fuentesDisponibles.push('Callao');
    fuentes.callao = {
      ok: rawData.callao?.ok ?? null,
      status: rawData.callao?.status ?? null,
      source: rawData.callao?.source ?? 'callao'
    };
  }

  if (rawData.puno) {
    fuentesDisponibles.push('Puno');
    fuentes.puno = {
      ok: rawData.puno?.ok ?? null,
      status: rawData.puno?.status ?? null,
      source: rawData.puno?.source ?? 'puno'
    };
  }

  if (rawData.piura) {
    fuentesDisponibles.push('Piura');
    fuentes.piura = {
      ok: rawData.piura?.ok ?? null,
      status: rawData.piura?.status ?? null,
      source: rawData.piura?.source ?? 'piura'
    };
  }

  if (rawData.tarapoto) {
    fuentesDisponibles.push('Tarapoto');
    fuentes.tarapoto = {
      ok: rawData.tarapoto?.ok ?? null,
      status: rawData.tarapoto?.status ?? null,
      source: rawData.tarapoto?.source ?? 'tarapoto'
    };
  }

  if (rawData.chiclayo) {
    fuentesDisponibles.push('Chiclayo');
    fuentes.chiclayo = {
      ok: rawData.chiclayo?.ok ?? null,
      status: rawData.chiclayo?.status ?? null,
      source: rawData.chiclayo?.source ?? 'chiclayo'
    };
  }

  if (rawData.arequipa) {
    fuentesDisponibles.push('Arequipa');
    fuentes.arequipa = {
      ok: rawData.arequipa?.ok ?? null,
      status: rawData.arequipa?.status ?? null,
      source: rawData.arequipa?.source ?? 'arequipa'
    };
  }
  
  if (rawData['sat-lima']) {
    fuentesDisponibles.push('SAT Lima');
    fuentes['sat-lima'] = {
      ok: rawData['sat-lima']?.ok ?? null,
      status: rawData['sat-lima']?.status ?? null,
      source: rawData['sat-lima']?.source ?? 'sat-lima'
    };
  }
  
  if (rawData['sat-ica']) {
    fuentesDisponibles.push('SAT Ica');
    fuentes['sat-ica'] = {
      ok: rawData['sat-ica']?.ok ?? null,
      status: rawData['sat-ica']?.status ?? null,
      source: rawData['sat-ica']?.source ?? 'sat-ica'
    };
  }
  
  if (rawData['sat-trujillo']) {
    fuentesDisponibles.push('SAT Trujillo');
    fuentes['sat-trujillo'] = {
      ok: rawData['sat-trujillo']?.ok ?? null,
      status: rawData['sat-trujillo']?.status ?? null,
      source: rawData['sat-trujillo']?.source ?? 'sat-trujillo'
    };
  }
  
  if (rawData['sat-cajamarca']) {
    fuentesDisponibles.push('SAT Cajamarca');
    fuentes['sat-cajamarca'] = {
      ok: rawData['sat-cajamarca']?.ok ?? null,
      status: rawData['sat-cajamarca']?.status ?? null,
      source: rawData['sat-cajamarca']?.source ?? 'sat-cajamarca'
    };
  }
  
  if (rawData['sat-arequipa']) {
    fuentesDisponibles.push('SAT Arequipa');
    fuentes['sat-arequipa'] = {
      ok: rawData['sat-arequipa']?.ok ?? null,
      status: rawData['sat-arequipa']?.status ?? null,
      source: rawData['sat-arequipa']?.source ?? 'sat-arequipa'
    };
  }
  
  if (rawData['placas-pe']) {
    fuentesDisponibles.push('PLACAS.PE');
    fuentes['placas-pe'] = {
      ok: rawData['placas-pe']?.ok ?? null,
      status: rawData['placas-pe']?.status ?? null,
      source: rawData['placas-pe']?.source ?? 'placas-pe'
    };
  }
  
  if (rawData.siniestro) {
    fuentesDisponibles.push('SBS');
    fuentes.siniestro = {
      ok: rawData.siniestro?.ok ?? null,
      status: rawData.siniestro?.status ?? null,
      source: rawData.siniestro?.source ?? 'siniestro'
    };
  }

  if (rawData.infogas) {
    fuentesDisponibles.push('Infogas');
    fuentes.infogas = {
      ok: rawData.infogas?.ok ?? null,
      status: rawData.infogas?.status ?? null,
      source: rawData.infogas?.source ?? 'infogas'
    };
  }

  if (rawData['impuesto-vehicular']) {
    fuentesDisponibles.push('Impuesto Vehicular');
    fuentes['impuesto-vehicular'] = {
      ok: rawData['impuesto-vehicular']?.ok ?? null,
      status: rawData['impuesto-vehicular']?.status ?? null,
      source: rawData['impuesto-vehicular']?.source ?? 'impuesto-vehicular'
    };
  }

  if (rawData['pit-foto']) {
    fuentesDisponibles.push('PIT Foto');
    fuentes['pit-foto'] = {
      ok: rawData['pit-foto']?.ok ?? null,
      status: rawData['pit-foto']?.status ?? null,
      source: rawData['pit-foto']?.source ?? 'pit-foto'
    };
  }
  
  // Recolectar errores
  Object.values(infracciones).forEach(fuente => {
    if (fuente.status === 'error') {
      errores.push({
        fuente: fuente.fuente,
        error: fuente.error,
        requiere_captcha: fuente.requiere_captcha,
        requiere_datos: fuente.requiere_datos_adicionales
      });
    }
  });
  
  // SBS Siniestralidad (si existe)
  let sbsSiniestralidad = null;
  if (rawData.sbs?.data || rawData.siniestro?.data) {
    const sbs = rawData.sbs?.data || rawData.siniestro?.data;
    sbsSiniestralidad = {
      totalSiniestros: sbs.accidentes_ultimos_5_anios || sbs.siniestros?.length || sbs.cantidadAccidentes || 0,
      siniestros: sbs.siniestros || [],
      polizas: sbs.polizas || [], // Guardar pólizas completas con todos los campos
      fechaConsulta: sbs.fecha_consulta || sbs.fechaConsulta || null,
      fechaActualizacion: sbs.fecha_actualizacion || sbs.fechaActualizacion || null
    };
  }
  
  return {
    vehicle,
    soat,
    citv,
    sbsSiniestralidad,
    infracciones,
    placasPe,
    permisos,
    infogas,
    impuestoVehicular,
    pitFoto,
    meta: {
      fechaConsulta: new Date().toISOString(),
      placa: placa || vehicle.placa,
      fuentesDisponibles,
      errores,
      fuentes, // VERSIÓN CEO: Tracking de verificación por fuente
      hash: generarHash(placa || vehicle.placa, new Date().toISOString())
    }
  };
}

/**
 * Genera hash simple para el reporte
 */
function generarHash(placa, fecha) {
  const str = `${placa}-${fecha}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 8).toUpperCase();
}

module.exports = {
  buildVehicleReport,
  normalizarVehiculo,
  normalizarSOAT,
  normalizarCITV,
  normalizarInfracciones,
  parseDateSafeLocal
};
