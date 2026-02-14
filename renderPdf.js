/**
 * renderPdf.js
 * Renderiza PDF usando modelo normalizado VehicleReport
 * Plantillas determinísticas - NO inventa datos
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { buildVehicleReport } = require('./buildVehicleReport');
const { calculateRiskScore } = require('./calculateRiskScore');
const { getEmisionesEstimadas } = require('./emisionesLookup');
const { generateInsightsFromRaw, generateInsightsFromReport, renderInsightsHTML } = require('./generateInsights');

/**
 * Font Awesome Icons (usando CDN)
 * Más colorido y profesional que SVG inline
 */
const FONT_AWESOME_CDN = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" integrity="sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==" crossorigin="anonymous" referrerpolicy="no-referrer" />';

/**
 * Iconos Font Awesome como HTML
 */
const ICONS = {
  // Usar Font Awesome en lugar de SVG
  check: '<i class="fas fa-check-circle" style="color: #065f46;"></i>',
  x: '<i class="fas fa-times-circle" style="color: #dc2626;"></i>',
  warning: '<i class="fas fa-exclamation-triangle" style="color: #92400e;"></i>',
  info: '<i class="fas fa-info-circle" style="color: #1e3a5f;"></i>',
  car: '<i class="fas fa-car" style="color: #1e3a5f;"></i>',
  calendar: '<i class="fas fa-calendar-alt" style="color: #1e3a5f;"></i>',
  shield: '<i class="fas fa-shield-alt" style="color: #1e3a5f;"></i>',
  clock: '<i class="fas fa-clock" style="color: #64748b;"></i>',
  document: '<i class="fas fa-file-alt" style="color: #1e3a5f;"></i>',
  exclamationCircle: '<i class="fas fa-exclamation-circle" style="color: #92400e;"></i>',
  // Nuevos iconos para CITV
  certificate: '<i class="fas fa-certificate" style="color: #065f46;"></i>',
  wrench: '<i class="fas fa-wrench" style="color: #1e3a5f;"></i>',
  building: '<i class="fas fa-building" style="color: #64748b;"></i>',
  mapMarker: '<i class="fas fa-map-marker-alt" style="color: #dc2626;"></i>',
  checkSquare: '<i class="fas fa-check-square" style="color: #065f46;"></i>',
  timesSquare: '<i class="fas fa-times-square" style="color: #dc2626;"></i>',
  clipboard: '<i class="fas fa-clipboard-check" style="color: #065f46;"></i>',
  eye: '<i class="fas fa-eye" style="color: #1e3a5f;"></i>',
  list: '<i class="fas fa-list" style="color: #64748b;"></i>'
};

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
 * Parsea fecha de forma segura (soporta ISO, DD/MM/YYYY, DD-MM-YYYY)
 * NUNCA retorna "Invalid Date"
 */
function parseDateSafe(dateStr) {
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
 * Formatea fecha (usa parseDateSafe, NUNCA muestra "Invalid Date")
 */
function formatDate(dateStr) {
  const d = parseDateSafe(dateStr);
  if (!d) return 'N/A';
  try {
    return d.toLocaleDateString('es-PE', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return 'N/A';
  }
}

/**
 * Genera HTML de vehículo
 */
function renderVehicle(report) {
  const v = report.vehicle;
  const colorCard = '#1e3a5f';
  
  return `
    <div class="card" style="border-left: 4px solid ${colorCard}; page-break-inside: avoid; break-inside: avoid;">
      <div class="card-header" style="display: flex; align-items: center; gap: 12px; padding: 16px; background: ${colorCard}15; border-radius: 8px 8px 0 0;">
        <div style="width: 50px; height: 50px; background: ${colorCard}; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">
          <i class="fas fa-car"></i>
        </div>
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #1a1a1a;">Información del Vehículo</h3>
        </div>
      </div>
      <div class="card-body" style="padding: 16px; page-break-inside: avoid; break-inside: avoid;">
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Placa</div>
            <div style="font-size: 14px; font-weight: 700; color: #1a1a1a;">${cleanText(v.placa)}</div>
          </div>
          <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Marca</div>
            <div style="font-size: 14px; font-weight: 600; color: #1a1a1a;">${cleanText(v.marca)}</div>
          </div>
          <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Modelo</div>
            <div style="font-size: 14px; font-weight: 600; color: #1a1a1a;">${cleanText(v.modelo)}</div>
          </div>
          <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Color</div>
            <div style="font-size: 14px; font-weight: 600; color: #1a1a1a;">${cleanText(v.color)}</div>
          </div>
          <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Motor</div>
            <div style="font-size: 13px; font-weight: 600; color: #1a1a1a;">${cleanText(v.motor)}</div>
          </div>
          <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">VIN</div>
            <div style="font-size: 12px; font-weight: 600; color: #1a1a1a; word-break: break-all;">${cleanText(v.vin)}</div>
          </div>
          <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Serie</div>
            <div style="font-size: 12px; font-weight: 600; color: #1a1a1a; word-break: break-all;">${cleanText(v.serie)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Genera HTML de PLACAS.PE - MISMO FORMATO que renderVehicle
 * SUPER DETALLADO con TODOS los campos solicitados
 */
function renderPlacasPe(report) {
  const p = report.placasPe;
  if (!p) {
    console.log('[PDF PLACAS.PE] No hay datos de PLACAS.PE en el reporte');
    return '';
  }

  console.log('[PDF PLACAS.PE] Datos recibidos:', JSON.stringify(p, null, 2));

  const colorCard = '#1e3a5f';
  
  // Helper para crear boxes (MISMO FORMATO que renderVehicle)
  const box = (label, value, full = false) => {
    if (!value || value === 'null' || value === 'undefined') return '';
    const displayValue = typeof value === 'string' ? cleanText(value) : String(value);
    if (!displayValue || displayValue.trim() === '') return '';
    return `
      <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; ${full ? 'grid-column: 1 / -1;' : ''}">
        <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">${label}</div>
        <div style="font-size: ${full ? '13px' : '14px'}; font-weight: ${full ? '600' : '700'}; color: #1a1a1a; line-height: 1.35; word-break: break-word;">${displayValue}</div>
      </div>
    `;
  };

  // Recopilar TODOS los campos (ORDEN SOLICITADO) - FORZAR TODOS LOS CAMPOS
  const campos = [];
  
  // 1. Status (Estado de Placa) - PRIMERO - SIEMPRE MOSTRAR
  campos.push(box('Estado de Placa', p.statusDescription || p.status || 'No disponible'));
  
  // 2. Marca (Brand) - SOLICITADO - SIEMPRE MOSTRAR
  campos.push(box('Marca', p.brand || 'No disponible'));
  
  // 3. Delivery Point - SOLICITADO (full width por ser largo) - SIEMPRE MOSTRAR
  campos.push(box('Punto de Entrega', p.deliveryPoint || 'No disponible', true));
  
  // 4. Descripción - SOLICITADO (full width) - SIEMPRE MOSTRAR
  campos.push(box('Descripción / Categoría', p.description || 'No disponible', true));
  
  // 5. Insert Date (Fecha de Registro) - SOLICITADO - SIEMPRE MOSTRAR
  const insertDateFormatted = p.insertDate ? formatDate(p.insertDate) : 'No disponible';
  campos.push(box('Fecha de Registro', insertDateFormatted));
  
  // 6. Owner Complete Name - SOLICITADO (full width por ser largo) - SIEMPRE MOSTRAR
  campos.push(box('Propietario', p.ownerCompleteName || 'No disponible', true));
  
  // 7. Start Date - SOLICITADO - SIEMPRE MOSTRAR
  const startDateFormatted = p.startDate ? formatDate(p.startDate) : 'No disponible';
  campos.push(box('Fecha de Inicio', startDateFormatted));
  
  // Campos adicionales para completitud
  if (p.model) {
    campos.push(box('Modelo', p.model));
  }
  
  if (p.placa || p.plateNew) {
    campos.push(box('Placa', p.placa || p.plateNew));
  }
  
  if (p.serialNumber) {
    campos.push(box('Número de Serie', p.serialNumber));
  }
  
  if (p.encontrado !== undefined && p.encontrado !== null) {
    const encontradoText = p.encontrado === true || p.encontrado === 'true' ? 'Sí' : 'No';
    campos.push(box('Encontrado', encontradoText));
  }
  
  console.log('[PDF PLACAS.PE] Campos generados:', campos.length);

  return `
    <div class="card" style="border-left: 4px solid ${colorCard}; page-break-inside: avoid; break-inside: avoid;">
      <div class="card-header" style="display: flex; align-items: center; gap: 12px; padding: 16px; background: ${colorCard}15; border-radius: 8px 8px 0 0;">
        <div style="width: 50px; height: 50px; background: ${colorCard}; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">
          <i class="fas fa-id-card"></i>
        </div>
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #1a1a1a;">Identidad Registral (PLACAS.PE)</h3>
        </div>
      </div>
      <div class="card-body" style="padding: 16px; page-break-inside: avoid; break-inside: avoid;">
        ${campos.length > 0 ? `
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            ${campos.join('')}
          </div>
        ` : '<div style="padding: 20px; text-align: center; color: #64748b;">No hay información disponible</div>'}
      </div>
    </div>
  `;
}

/**
 * Helper: Normaliza string para comparación
 */
function norm(s) {
  return (s || '').toString().trim().toLowerCase();
}

/**
 * Genera HTML de SOAT (plantilla determinística) - CON CUADROS E ICONOS
 */
function renderSOAT(report) {
  const soat = report.soat;
  
  // Determinar estado y colores
  let estadoTexto = '';
  let estadoClass = '';
  let estadoColor = '';
  let estadoIcon = '';
  
  if (soat.estado === 'vigente') {
    estadoTexto = 'VIGENTE';
    estadoClass = 'estado-ok';
    estadoColor = '#065f46'; // Verde
    estadoIcon = ICONS.check.replace('currentColor', estadoColor);
  } else if (soat.estado === 'vencido') {
    estadoTexto = 'VENCIDO';
    estadoClass = 'estado-bad';
    estadoColor = '#dc2626'; // Rojo
    estadoIcon = ICONS.x.replace('currentColor', estadoColor);
  } else {
    estadoTexto = 'NO DISPONIBLE';
    estadoClass = 'estado-warn';
    estadoColor = '#92400e'; // Amarillo
    estadoIcon = ICONS.warning.replace('currentColor', estadoColor);
  }
  
  // Generar mensaje principal
  let mensajePrincipal = '';
  if (soat.estado === 'vigente' && soat.fin) {
    mensajePrincipal = `Vigente hasta ${formatDate(soat.fin)}`;
  } else if (soat.estado === 'vencido' && soat.fin) {
    mensajePrincipal = `Vencido desde ${formatDate(soat.fin)}`;
  } else if (soat.estado === 'vigente') {
    mensajePrincipal = 'Vigente';
  } else {
    mensajePrincipal = 'No disponible';
  }
  
  return `
    <div class="card" style="border-left: 4px solid ${estadoColor};">
      <div class="card-header" style="display: flex; align-items: center; gap: 12px; padding: 16px; background: ${estadoColor}15; border-radius: 8px 8px 0 0;">
        <div style="width: 50px; height: 50px; background: ${estadoColor}; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">
          <i class="fas fa-shield-alt"></i>
        </div>
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #1a1a1a;">SOAT</h3>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
            <i class="fas ${soat.estado === 'vigente' ? 'fa-check-circle' : soat.estado === 'vencido' ? 'fa-times-circle' : 'fa-exclamation-triangle'}" style="color: ${estadoColor}; font-size: 16px;"></i>
            <span style="font-weight: 600; color: ${estadoColor}; font-size: 13px;">${estadoTexto}</span>
          </div>
        </div>
      </div>
      <div class="card-body" style="padding: 16px;">
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
          <div style="font-size: 14px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">${mensajePrincipal}</div>
          ${soat.aseguradora && soat.aseguradora !== 'No disponible' ? `<div style="font-size: 12px; color: #64748b;">Aseguradora: ${cleanText(soat.aseguradora)}</div>` : ''}
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          ${soat.poliza ? `
            <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Póliza</div>
              <div style="font-size: 13px; font-weight: 600; color: #1a1a1a;">${cleanText(soat.poliza)}</div>
            </div>
          ` : ''}
          ${soat.inicio ? `
            <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Inicio</div>
              <div style="font-size: 13px; font-weight: 600; color: #1a1a1a;">${formatDate(soat.inicio)}</div>
            </div>
          ` : ''}
          ${soat.fin ? `
            <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Fin</div>
              <div style="font-size: 13px; font-weight: 600; color: #1a1a1a;">${formatDate(soat.fin)}</div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Selecciona el certificado CITV principal según fecha más cercana a consulta
 */
function pickCITVPrincipal(citv, consultaDate) {
  if (!citv || citv.length === 0) return null;
  
  // Parsear fechas y filtrar válidas
  const items = citv
    .map(c => {
      const fin = parseDateSafe(c.fin);
      const inicio = parseDateSafe(c.inicio);
      return { ...c, _fin: fin, _inicio: inicio };
    })
    .filter(c => c._fin || c._inicio);
  
  if (items.length === 0) return citv[citv.length - 1]; // Fallback al último si no hay fechas válidas
  
  // Priorizar: certificado vigente (fin >= consultaDate) más cercano a la fecha de consulta
  const vigentes = items
    .filter(c => c._fin && c._fin >= consultaDate)
    .sort((a, b) => a._fin - b._fin); // El que vence "más pronto" pero aún vigente
  
  if (vigentes.length > 0) {
    return vigentes[0];
  }
  
  // Si no hay vigente, el más recientemente vencido (mayor fecha fin)
  const vencidos = items
    .filter(c => c._fin)
    .sort((a, b) => b._fin - a._fin); // Más reciente primero
  
  return vencidos[0] || citv[citv.length - 1];
}

/**
 * Genera HTML de CITV (plantilla determinística) - CON CUADROS E ICONOS
 * REGLA DURA: Si citv.length > 0 => SIEMPRE mostrar tabla, nunca "No hay registros"
 */
function renderCITV(report) {
  const citv = report.citv;
  
  // PRIORIDAD: Verificar primero si el vehículo tiene menos de 3 años desde su registro
  // Esta verificación tiene PRIORIDAD sobre los registros de CITV existentes
  // Si el vehículo tiene < 3 años, mostrar mensaje verde INDEPENDIENTEMENTE de si hay registros
  const consultaDate = parseDateSafe(report?.meta?.fechaConsulta) || new Date();
  const placasPe = report.placasPe;
  let fechaRegistro = null;
  
  // Obtener fecha de registro desde placas-pe (insertDate o startDate)
  if (placasPe) {
    // Intentar insertDate primero (fecha de inserción/registro)
    if (placasPe.insertDate) {
      fechaRegistro = parseDateSafe(placasPe.insertDate);
    }
    // Si no hay insertDate, usar startDate
    if (!fechaRegistro && placasPe.startDate) {
      fechaRegistro = parseDateSafe(placasPe.startDate);
    }
  }
  
  // Si hay fecha de registro y es menor a 3 años desde la consulta
  // MOSTRAR MENSAJE VERDE INDEPENDIENTEMENTE de si hay registros de CITV o no
  if (fechaRegistro) {
    // Calcular diferencia en años (considerando años completos)
    const diffTime = consultaDate.getTime() - fechaRegistro.getTime();
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    
    // Si el vehículo tiene menos de 3 años desde su registro
    if (diffYears < 3) {
      // Calcular fecha de primera inspección (exactamente 3 años desde fecha de registro)
      const primeraInspeccion = new Date(fechaRegistro);
      primeraInspeccion.setFullYear(primeraInspeccion.getFullYear() + 3);
      
      const colorCard = '#065f46';
      return `
        <div class="card" style="border-left: 5px solid ${colorCard}; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div class="card-header" style="display: flex; align-items: center; gap: 16px; padding: 20px; background: linear-gradient(135deg, ${colorCard}15 0%, ${colorCard}08 100%); border-radius: 8px 8px 0 0;">
            <div style="width: 60px; height: 60px; background: linear-gradient(135deg, ${colorCard} 0%, ${colorCard}dd 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 28px; box-shadow: 0 4px 8px rgba(0,0,0,0.15);">
              <i class="fas fa-clipboard-check"></i>
            </div>
            <div style="flex: 1;">
              <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a;">Certificación de Inspección Técnica Vehicular</h3>
              <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                <i class="fas fa-check-circle" style="color: ${colorCard}; font-size: 16px;"></i>
                <span style="font-weight: 700; color: ${colorCard}; font-size: 14px; text-transform: uppercase;">SIN RIESGO</span>
              </div>
            </div>
          </div>
          <div class="card-body" style="padding: 20px;">
            <div style="background: #f0fdf4; padding: 14px; border-radius: 8px; color: #065f46; border-left: 4px solid ${colorCard};">
              <div style="display: flex; align-items: start; gap: 10px;">
                <i class="fas fa-info-circle" style="font-size: 18px; margin-top: 2px;"></i>
                <div style="flex: 1;">
                  <div style="font-weight: 600; margin-bottom: 8px;">Vehículo aún no necesita de revisión técnica.</div>
                  <div style="font-size: 13px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(6, 95, 70, 0.2);">
                    <strong>Primera revisión técnica en:</strong> ${formatDate(primeraInspeccion.toISOString())}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }
  
  // Si no hay fecha de registro o el vehículo tiene 3+ años, continuar con lógica normal
  if (citv.length === 0) {
    // Si no cumple la condición de 3 años, mostrar mensaje normal
    const colorCard = '#92400e';
    return `
      <div class="card" style="border-left: 5px solid ${colorCard}; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <div class="card-header" style="display: flex; align-items: center; gap: 16px; padding: 20px; background: linear-gradient(135deg, ${colorCard}15 0%, ${colorCard}08 100%); border-radius: 8px 8px 0 0;">
          <div style="width: 60px; height: 60px; background: linear-gradient(135deg, ${colorCard} 0%, ${colorCard}dd 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 28px; box-shadow: 0 4px 8px rgba(0,0,0,0.15);">
            <i class="fas fa-clipboard-list"></i>
          </div>
          <div style="flex: 1;">
            <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a;">Certificación de Inspección Técnica Vehicular</h3>
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
              <i class="fas fa-exclamation-triangle" style="color: ${colorCard}; font-size: 16px;"></i>
              <span style="font-weight: 700; color: ${colorCard}; font-size: 14px; text-transform: uppercase;">SIN REGISTROS</span>
            </div>
          </div>
        </div>
        <div class="card-body" style="padding: 20px;">
          <div style="background: #fef3c7; padding: 14px; border-radius: 8px; color: #92400e; display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-info-circle" style="font-size: 18px;"></i>
            <span>Sin registros de inspección técnica disponibles.</span>
          </div>
        </div>
      </div>
    `;
  }
  
  // Obtener certificado principal según fecha más cercana a consulta
  // consultaDate ya está declarado arriba, reutilizar
  const principal = pickCITVPrincipal(citv, consultaDate) || citv[citv.length - 1];
  
  // Calcular estado real por fecha (no por string)
  const fin = parseDateSafe(principal.fin);
  const estadoReal = fin ? (fin >= consultaDate ? 'vigente' : 'vencido') : 
                      (principal.estado === 'vigente' ? 'vigente' : 'vencido');
  
  const estadoColor = estadoReal === 'vigente' ? '#065f46' : '#dc2626';
  const estadoTexto = estadoReal === 'vigente' ? 'VIGENTE' : 'VENCIDO';
  const estadoIconClass = estadoReal === 'vigente' ? 'fa-check-circle' : 'fa-times-circle';
  
  // Generar cuadros de información destacada con Font Awesome
  const infoBoxes = [];
  if (principal.certificado) {
    infoBoxes.push(`
      <div style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); padding: 16px; border-radius: 10px; color: white; display: flex; align-items: center; gap: 14px; box-shadow: 0 4px 8px rgba(6, 95, 70, 0.2);">
        <i class="fas fa-certificate" style="font-size: 32px; opacity: 0.9;"></i>
        <div>
          <div style="font-size: 10px; opacity: 0.9; text-transform: uppercase; margin-bottom: 6px;">Número de Certificado</div>
          <div style="font-size: 18px; font-weight: 700;">${cleanText(principal.certificado)}</div>
        </div>
      </div>
    `);
  }
  
  if (principal.empresa) {
    infoBoxes.push(`
      <div style="background: white; padding: 16px; border-radius: 10px; border: 2px solid #e2e8f0; display: flex; align-items: center; gap: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <i class="fas fa-building" style="font-size: 28px; color: #1e3a5f;"></i>
        <div>
          <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Empresa</div>
          <div style="font-size: 15px; font-weight: 600; color: #1a1a1a;">${cleanText(principal.empresa)}</div>
        </div>
      </div>
    `);
  }
  
  if (principal.direccion) {
    infoBoxes.push(`
      <div style="background: white; padding: 16px; border-radius: 10px; border: 2px solid #e2e8f0; display: flex; align-items: center; gap: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <i class="fas fa-map-marker-alt" style="font-size: 28px; color: #dc2626;"></i>
        <div>
          <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Dirección</div>
          <div style="font-size: 13px; font-weight: 600; color: #1a1a1a;">${cleanText(principal.direccion)}</div>
        </div>
      </div>
    `);
  }
  
  if (principal.ambito) {
    infoBoxes.push(`
      <div style="background: white; padding: 16px; border-radius: 10px; border: 2px solid #e2e8f0; display: flex; align-items: center; gap: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <i class="fas fa-globe-americas" style="font-size: 28px; color: #1e3a5f;"></i>
        <div>
          <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Ámbito</div>
          <div style="font-size: 13px; font-weight: 600; color: #1a1a1a;">${cleanText(principal.ambito)}</div>
        </div>
      </div>
    `);
  }
  
  // REGLA DURA: Si hay registros, mostrar tabla con Font Awesome
  const rows = citv.map((cert, index) => {
    const certEstadoColor = cert.estado === 'vigente' ? '#065f46' : '#dc2626';
    const certEstadoIcon = cert.estado === 'vigente' ? 'fa-check-circle' : 'fa-times-circle';
    const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    
    return `
      <tr style="border-bottom: 1px solid #e2e8f0; background: ${rowBg};">
        <td style="padding: 8px; font-size: 10px; color: #1a1a1a; word-wrap: break-word; overflow-wrap: anywhere;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <i class="fas fa-calendar-check" style="color: #64748b; font-size: 11px; flex-shrink: 0;"></i>
            <span>${formatDate(cert.inicio)}</span>
          </div>
        </td>
        <td style="padding: 8px; font-size: 10px; color: #1a1a1a; word-wrap: break-word; overflow-wrap: anywhere;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <i class="fas fa-calendar-times" style="color: #64748b; font-size: 11px; flex-shrink: 0;"></i>
            <span>${formatDate(cert.fin)}</span>
          </div>
        </td>
        <td style="padding: 8px; word-wrap: break-word; overflow-wrap: anywhere;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <i class="fas ${certEstadoIcon}" style="color: ${certEstadoColor}; font-size: 12px; flex-shrink: 0;"></i>
            <span style="font-weight: 700; color: ${certEstadoColor}; font-size: 10px; text-transform: uppercase;">${cert.estado === 'vigente' ? 'Vigente' : 'Vencido'}</span>
          </div>
        </td>
        <td style="padding: 8px; font-size: 10px; word-wrap: break-word; overflow-wrap: anywhere;">
          <div style="display: flex; align-items: center; gap: 6px;">
            ${cert.resultado && cert.resultado.toLowerCase().includes('aprobado') 
              ? '<i class="fas fa-check" style="color: #065f46; font-size: 11px; flex-shrink: 0;"></i>' 
              : '<i class="fas fa-times" style="color: #dc2626; font-size: 11px; flex-shrink: 0;"></i>'}
            <span style="font-weight: 600; color: #1a1a1a;">${cleanText(cert.resultado || 'N/A')}</span>
          </div>
        </td>
        <td style="padding: 8px; font-size: 9px; color: #64748b; word-wrap: break-word; overflow-wrap: anywhere;">
          ${cert.observaciones ? `
            <div style="display: flex; align-items: start; gap: 6px;">
              <i class="fas fa-comment-alt" style="color: #92400e; font-size: 11px; margin-top: 2px; flex-shrink: 0;"></i>
              <span>${cleanText(cert.observaciones)}</span>
            </div>
          ` : '<span style="color: #94a3b8;">-</span>'}
        </td>
        <td style="padding: 8px; font-size: 10px; word-wrap: break-word; overflow-wrap: anywhere;">
          ${cert.empresa ? `
            <div style="display: flex; align-items: center; gap: 6px;">
              <i class="fas fa-building" style="color: #64748b; font-size: 11px; flex-shrink: 0;"></i>
              <span>${cleanText(cert.empresa)}</span>
            </div>
          ` : '<span style="color: #94a3b8;">-</span>'}
        </td>
      </tr>
    `;
  }).join('');
  
  return `
    <div class="card citv-card" style="border-left: 5px solid ${estadoColor}; box-shadow: 0 4px 6px rgba(0,0,0,0.1); page-break-inside: avoid; break-inside: avoid; overflow: visible !important; height: auto !important;">
      <div class="card-header" style="display: flex; align-items: center; gap: 16px; padding: 20px; background: linear-gradient(135deg, ${estadoColor}15 0%, ${estadoColor}08 100%); border-radius: 8px 8px 0 0;">
        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, ${estadoColor} 0%, ${estadoColor}dd 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 28px; box-shadow: 0 4px 8px rgba(0,0,0,0.15);">
          <i class="fas fa-clipboard-check"></i>
        </div>
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a;">Certificación de Inspección Técnica Vehicular</h3>
          <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; background: white; padding: 8px 14px; border-radius: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <i class="fas ${estadoIconClass}" style="color: ${estadoColor}; font-size: 18px;"></i>
              <span style="font-weight: 700; color: ${estadoColor}; font-size: 14px; text-transform: uppercase;">${estadoTexto}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; color: #64748b; font-size: 13px;">
              <i class="fas fa-calendar-alt"></i>
              <span>Válido hasta ${formatDate(principal.fin)}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="card-body" style="padding: 20px;">
        ${infoBoxes.length > 0 ? `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px; margin-bottom: 20px;">
            ${infoBoxes.join('')}
          </div>
        ` : ''}
        <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 14px; border-bottom: 2px solid #e2e8f0;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <i class="fas fa-list-alt" style="color: #1e3a5f; font-size: 18px;"></i>
              <span style="font-weight: 700; color: #1a1a1a; font-size: 14px; text-transform: uppercase;">Historial de Inspecciones (${citv.length})</span>
            </div>
          </div>
          <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <th style="padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                  <i class="fas fa-calendar-check" style="margin-right: 4px; font-size: 10px;"></i>Inicio
                </th>
                <th style="padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                  <i class="fas fa-calendar-times" style="margin-right: 4px; font-size: 10px;"></i>Fin
                </th>
                <th style="padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                  <i class="fas fa-info-circle" style="margin-right: 4px; font-size: 10px;"></i>Estado
                </th>
                <th style="padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                  <i class="fas fa-clipboard-check" style="margin-right: 4px; font-size: 10px;"></i>Resultado
                </th>
                <th style="padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                  <i class="fas fa-comment-alt" style="margin-right: 4px; font-size: 10px;"></i>Observaciones
                </th>
                <th style="padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                  <i class="fas fa-building" style="margin-right: 4px; font-size: 10px;"></i>Empresa
                </th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/**
 * Genera HTML de SAT Lima - Capturas de Vehículos
 * Muestra tabla detallada con número, fecha, tipo, estado, observaciones
 */
function renderSATLima(report) {
  const satLima = report.infracciones.sat_lima;
  const capturas = satLima?.registros || [];
  const status = satLima?.status || 'empty';
  if (status !== 'ok' || capturas.length === 0) {
    return `<p style="margin:0; color:#64748b;">Sin registros de orden de captura.</p>`;
  }

  const colorCard = '#dc2626';
  
  // Generar filas de la tabla
  const tableRowsHtml = capturas.map(cap => {
    const placa = cleanText(cap.placa || 'N/A');
    const documento = cleanText(cap.documento || 'N/A');
    const anio = cleanText(cap.anio || 'N/A');
    const concepto = cleanText(cap.concepto || 'N/A');
    const placaOriginal = cleanText(cap.placaOriginal || 'N/A');
    const referencia = cleanText(cap.referencia || '');
    const monto = cleanText(cap.montoCaptura || 'N/A');
    
    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 12px; font-size: 12px; font-weight: 600; color: #1a1a1a;">${placa}</td>
        <td style="padding: 12px; font-size: 12px; color: #475569;">${documento}</td>
        <td style="padding: 12px; font-size: 12px; color: #475569;">${anio}</td>
        <td style="padding: 12px; font-size: 12px; color: #475569;">${concepto}</td>
        <td style="padding: 12px; font-size: 12px; color: #475569;">${placaOriginal}</td>
        <td style="padding: 12px; font-size: 11px; color: #64748b; word-break: break-word;">${referencia || '-'}</td>
        <td style="padding: 12px; font-size: 12px; color: #475569;">${monto}</td>
      </tr>
    `;
  }).join('');
  
  return `
    <div class="card" style="border-left: 4px solid ${colorCard}; page-break-inside: avoid; break-inside: avoid; margin-bottom: 16px;">
      <div class="card-header" style="display: flex; align-items: center; gap: 12px; padding: 16px; background: ${colorCard}15; border-radius: 8px 8px 0 0;">
        <div style="width: 50px; height: 50px; background: ${colorCard}; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">
          <i class="fas fa-gavel"></i>
        </div>
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #1a1a1a;">SAT Lima - Orden de Captura</h3>
          <div style="margin-top: 6px; font-size: 12px; color: #64748b;">
            ${capturas.length} captura(s) registrada(s)
          </div>
        </div>
      </div>
      <div class="card-body" style="padding: 16px; page-break-inside: avoid; break-inside: avoid;">
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <th style="padding: 12px; text-align: left; font-weight: 700; color: #1a1a1a; font-size: 11px; text-transform: uppercase;">Placa</th>
                <th style="padding: 12px; text-align: left; font-weight: 700; color: #1a1a1a; font-size: 11px; text-transform: uppercase;">Documento</th>
                <th style="padding: 12px; text-align: left; font-weight: 700; color: #1a1a1a; font-size: 11px; text-transform: uppercase;">Año</th>
                <th style="padding: 12px; text-align: left; font-weight: 700; color: #1a1a1a; font-size: 11px; text-transform: uppercase;">Concepto</th>
                <th style="padding: 12px; text-align: left; font-weight: 700; color: #1a1a1a; font-size: 11px; text-transform: uppercase;">Placa Original</th>
                <th style="padding: 12px; text-align: left; font-weight: 700; color: #1a1a1a; font-size: 11px; text-transform: uppercase;">Referencia</th>
                <th style="padding: 12px; text-align: left; font-weight: 700; color: #1a1a1a; font-size: 11px; text-transform: uppercase;">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renderiza el detalle por ciudad (todas las secciones del frontend en el PDF)
 * Excluye fuentes que ya tienen tarjeta propia (SAT Lima Capturas, SUTRAN, Callao, Piura, Puno).
 */
function renderDetalleCiudades(report) {
  const omit = new Set(['sutran', 'callao', 'sat_lima', 'piura', 'puno']);
  const entries = Object.entries(report.infracciones || {}).filter(([k]) => !omit.has(k));

  if (!entries.length) return '';

  const titleByKey = {
    sat_arequipa: 'SAT Arequipa',
    sat_cajamarca: 'SAT Cajamarca',
    sat_chachapoyas: 'SAT Chachapoyas',
    sat_cusco: 'SAT Cusco',
    sat_huancayo: 'SAT Huancayo',
    sat_huanuco: 'SAT Huánuco',
    sat_ica: 'SAT Ica',
    sat_tacna: 'SAT Tacna',
    sat_andahuaylas: 'SAT Andahuaylas',
    sat_trujillo: 'SAT Trujillo',
    sat_tarapoto: 'SAT Tarapoto',
    arequipa: 'Arequipa',
    tarapoto: 'Tarapoto',
    chiclayo: 'Chiclayo'
  };

  const makeCard = (name, fuente) => {
    const rows = fuente?.registros || [];
    const status = fuente?.status || 'empty';

    const header = `
      <div class="card-header">
        <i class="fas fa-city"></i>
        <h3>${cleanText(name)}</h3>
      </div>
    `;

    let body = '';
    if (status === 'ok' && rows.length) {
      const cols = Object.keys(rows[0] || {}).slice(0, 8);
      body = `
        <p style="margin:0 0 10px; color:#64748b; font-size:11px;"><strong>Registros:</strong> ${rows.length}</p>
        <table>
          <thead><tr>${cols.map(c => `<th>${cleanText(c)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.slice(0, 20).map(r => `<tr>${cols.map(c => `<td>${cleanText(r?.[c])}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      `;
    } else if (status === 'empty') {
      body = `<p style="margin:0; color:#64748b;">Sin resultados.</p>`;
    } else {
      body = `<p style="margin:0; color:#64748b;">Sin resultados.</p>`;
    }

    return `<div class="card">${header}<div class="card-body">${body}</div></div>`;
  };

  const cardsHTML = entries
    .map(([key, fuente]) => makeCard(titleByKey[key] || fuente?.fuente || key, fuente))
    .join('\n');

  return cardsHTML;
}

/**
 * Genera HTML de SUTRAN Record de Papeletas
 */
function renderSUTRAN(report) {
  const sutran = report.infracciones.sutran;
  if (!sutran || sutran.status !== 'ok' || !sutran.registros || sutran.registros.length === 0) {
    return '';
  }
  
  const colorCard = '#dc2626';
  const rows = sutran.registros.map((inf, index) => {
    const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    return `
      <tr style="border-bottom: 1px solid #e2e8f0; background: ${rowBg};">
        <td style="padding: 10px; font-size: 11px; color: #1a1a1a;">${cleanText(inf.numero || inf.Numero || inf.numero_infraccion || 'N/A')}</td>
        <td style="padding: 10px; font-size: 11px; color: #475569;">${inf.fecha ? formatDate(inf.fecha) : (inf.Fecha ? formatDate(inf.Fecha) : 'N/A')}</td>
        <td style="padding: 10px; font-size: 11px; color: #475569;">${cleanText(inf.tipo || inf.Tipo || inf.descripcion || inf.Descripcion || 'N/A')}</td>
        <td style="padding: 10px; font-size: 11px; color: #475569;">${cleanText(inf.estado || inf.Estado || 'N/A')}</td>
        <td style="padding: 10px; font-size: 11px; color: #64748b; word-break: break-word;">${cleanText(inf.observaciones || inf.Observaciones || inf.monto || inf.Monto || '-')}</td>
      </tr>
    `;
  }).join('');
  
  return `
    <div class="card" style="border-left: 5px solid ${colorCard}; box-shadow: 0 4px 6px rgba(0,0,0,0.1); page-break-inside: avoid; margin-bottom: 20px;">
      <div class="card-header" style="display: flex; align-items: center; gap: 16px; padding: 20px; background: linear-gradient(135deg, ${colorCard}15 0%, ${colorCard}08 100%); border-radius: 8px 8px 0 0;">
        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, ${colorCard} 0%, ${colorCard}dd 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 28px; box-shadow: 0 4px 8px rgba(0,0,0,0.15);">
          <i class="fas fa-truck"></i>
        </div>
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a;">SUTRAN - Record de Papeletas</h3>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
            <i class="fas fa-exclamation-triangle" style="color: ${colorCard}; font-size: 16px;"></i>
            <span style="font-weight: 700; color: ${colorCard}; font-size: 14px; text-transform: uppercase;">${sutran.registros.length} Infracción(es)</span>
          </div>
        </div>
      </div>
      <div class="card-body" style="padding: 20px;">
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <th style="padding: 10px; text-align: left; font-weight: 700; color: #64748b; font-size: 10px; text-transform: uppercase;">Número</th>
                <th style="padding: 10px; text-align: left; font-weight: 700; color: #64748b; font-size: 10px; text-transform: uppercase;">Fecha</th>
                <th style="padding: 10px; text-align: left; font-weight: 700; color: #64748b; font-size: 10px; text-transform: uppercase;">Tipo</th>
                <th style="padding: 10px; text-align: left; font-weight: 700; color: #64748b; font-size: 10px; text-transform: uppercase;">Estado</th>
                <th style="padding: 10px; text-align: left; font-weight: 700; color: #64748b; font-size: 10px; text-transform: uppercase;">Detalles</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/**
 * Genera HTML de Callao Papeletas
 */
function renderCallao(report) {
  const callao = report.infracciones.callao;
  if (!callao || !callao.registros || callao.registros.length === 0) {
    return `
      <div class="card">
        <div class="card-header">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Papeletas del Callao</h3>
        </div>
        <div class="card-body">
          <p style="margin: 0; color: #64748b;">Sin registros.</p>
        </div>
      </div>
    `;
  }
  
  const colorCard = '#f59e0b';
  const rows = callao.registros.map((papeleta, index) => {
    const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    const total = parseFloat(papeleta.total || papeleta.Total || 0);
    return `
      <tr style="border-bottom: 1px solid #e2e8f0; background: ${rowBg};">
        <td style="padding: 10px; font-size: 11px; color: #1a1a1a;">${cleanText(papeleta.placa || papeleta.Placa || 'N/A')}</td>
        <td style="padding: 10px; font-size: 11px; color: #475569;">${cleanText(papeleta.codigo || papeleta.Codigo || papeleta.codigoInfraccion || 'N/A')}</td>
        <td style="padding: 10px; font-size: 11px; color: #475569;">${cleanText(papeleta.numeroPapeleta || papeleta.NumeroPapeleta || papeleta.numero_papeleta || 'N/A')}</td>
        <td style="padding: 10px; font-size: 11px; color: #475569;">${papeleta.fechaInfraccion ? formatDate(papeleta.fechaInfraccion) : (papeleta.FechaInfraccion ? formatDate(papeleta.FechaInfraccion) : 'N/A')}</td>
        <td style="padding: 10px; font-size: 11px; color: #dc2626; font-weight: 600;">S/ ${total.toFixed(2)}</td>
        <td style="padding: 10px; font-size: 11px; color: #475569;">${cleanText(papeleta.numeroCuota || papeleta.NumeroCuota || papeleta.numero_cuota || '0')}</td>
      </tr>
    `;
  }).join('');
  
  const totalGeneral = callao.registros.reduce((sum, p) => sum + (parseFloat(p.total || p.Total || 0)), 0);
  
  return `
    <div class="card" style="border-left: 5px solid ${colorCard};">
      <div class="card-header" style="display: flex; align-items: center; gap: 16px; padding: 20px; background: linear-gradient(135deg, ${colorCard}15 0%, ${colorCard}08 100%); border-radius: 8px 8px 0 0;">
        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, ${colorCard} 0%, ${colorCard}dd 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 28px; box-shadow: 0 4px 8px rgba(0,0,0,0.15);">
          <i class="fas fa-file-invoice-dollar"></i>
        </div>
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a;">Callao - Papeletas de Infracción</h3>
          <div style="display: flex; align-items: center; gap: 16px; margin-top: 8px;">
            <span style="font-weight: 700; color: ${colorCard}; font-size: 14px; text-transform: uppercase;">${callao.registros.length} Papeleta(s)</span>
            <span style="font-weight: 700; color: #dc2626; font-size: 14px;">Total: S/ ${totalGeneral.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div class="card-body" style="padding: 20px;">
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <th style="padding: 10px; text-align: left; font-weight: 700; color: #64748b; font-size: 10px; text-transform: uppercase;">Placa</th>
                <th style="padding: 10px; text-align: left; font-weight: 700; color: #64748b; font-size: 10px; text-transform: uppercase;">Código</th>
                <th style="padding: 10px; text-align: left; font-weight: 700; color: #64748b; font-size: 10px; text-transform: uppercase;">N° Papeleta</th>
                <th style="padding: 10px; text-align: left; font-weight: 700; color: #64748b; font-size: 10px; text-transform: uppercase;">Fecha Infracción</th>
                <th style="padding: 10px; text-align: left; font-weight: 700; color: #64748b; font-size: 10px; text-transform: uppercase;">Total</th>
                <th style="padding: 10px; text-align: left; font-weight: 700; color: #64748b; font-size: 10px; text-transform: uppercase;">N° Cuota</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/**
 * Puno - Papeletas (siempre visible)
 */
function renderPuno(report) {
  const puno = report.infracciones.puno;
  const rows = puno?.registros || [];
  const status = puno?.status || 'empty';

  const subtitle = status === 'ok' ? `${rows.length} registro(s)` : (status === 'error' ? 'No verificado' : 'Sin registros');
  const message = status === 'error' ? (puno?.error || 'No verificado') : (rows.length === 0 ? 'No existe esta placa en el sistema' : null);

  const table = rows.length
    ? `
      <table>
        <thead>
          <tr>
            ${Object.keys(rows[0] || {}).slice(0, 8).map(k => `<th>${cleanText(k)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.slice(0, 25).map(r => `
            <tr>
              ${Object.keys(rows[0] || {}).slice(0, 8).map(k => `<td>${cleanText(r?.[k])}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : `<p style="margin: 0; color: #64748b;">${cleanText(message || 'Sin registros.')}</p>`;

  return `
    <div class="card">
      <div class="card-header">
        <i class="fas fa-receipt"></i>
        <h3>Papeletas - Puno</h3>
      </div>
      <div class="card-body">
        <p style="margin: 0 0 10px; color: #64748b; font-size: 11px;"><strong>Estado:</strong> ${cleanText(subtitle)}</p>
        ${table}
      </div>
    </div>
  `;
}

/**
 * Piura - Multas (siempre visible)
 */
function renderPiura(report) {
  const piura = report.infracciones.piura;
  const rows = piura?.registros || [];
  const status = piura?.status || 'empty';

  const subtitle = status === 'ok' ? `${rows.length} multa(s)` : (status === 'error' ? 'No verificado' : 'Sin registros');
  const message = status === 'error' ? (piura?.error || 'No verificado') : (rows.length === 0 ? 'Sin multas registradas' : null);

  const table = rows.length
    ? `
      <table>
        <thead>
          <tr>
            ${Object.keys(rows[0] || {}).slice(0, 8).map(k => `<th>${cleanText(k)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.slice(0, 25).map(r => `
            <tr>
              ${Object.keys(rows[0] || {}).slice(0, 8).map(k => `<td>${cleanText(r?.[k])}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : `<p style="margin: 0; color: #64748b;">${cleanText(message || 'Sin registros.')}</p>`;

  return `
    <div class="card">
      <div class="card-header">
        <i class="fas fa-traffic-light"></i>
        <h3>Multas - Piura</h3>
      </div>
      <div class="card-body">
        <p style="margin: 0 0 10px; color: #64748b; font-size: 11px;"><strong>Estado:</strong> ${cleanText(subtitle)}</p>
        ${table}
      </div>
    </div>
  `;
}

/**
 * PIT - Foto Papeletas (siempre visible)
 */
function renderPitFoto(report) {
  const pit = report.pitFoto;
  const papeletas = pit?.papeletas || [];

  if (!Array.isArray(papeletas) || papeletas.length === 0) {
    return `
      <div class="card">
        <div class="card-header">
          <i class="fas fa-camera"></i>
          <h3>PIT - Foto Papeletas (Velocidad)</h3>
        </div>
        <div class="card-body">
          <p style="margin: 0; color: #64748b;">Sin registros.</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header">
        <i class="fas fa-camera"></i>
        <h3>PIT - Foto Papeletas (Velocidad)</h3>
      </div>
      <div class="card-body">
        <table>
          <thead>
            <tr>
              <th>Placa</th>
              <th>Documento</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Falta</th>
              <th>Evidencia</th>
            </tr>
          </thead>
          <tbody>
            ${papeletas.map(p => `
              <tr>
                <td>${cleanText(p.placa || '')}</td>
                <td>${cleanText(p.documento || '')}</td>
                <td>${cleanText(p.fecha || p.fec || '')}</td>
                <td>${cleanText(p.totalPagar || p.total || '')}</td>
                <td>${cleanText(p.estado || '')}</td>
                <td>${cleanText(p.falta || '')}</td>
                <td>${p.evidenciaUrl ? `<span style="font-size:10px;">${cleanText(p.evidenciaUrl)}</span>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Impuesto Vehicular (SAT Lima) - resumen + detalle (siempre visible)
 */
function renderImpuestoVehicular(report) {
  const data = report.impuestoVehicular;
  const datos = data?.datos || [];
  const detalle = data?.detalle || [];

  const kv = Array.isArray(datos) && datos.length
    ? `
      <div style="margin-bottom: 10px; font-size: 11px; color: #374151;">
        ${datos.map(d => `<div><strong>${cleanText(d.campo || d.label || 'Dato')}:</strong> ${cleanText(d.valor || d.value || '')}</div>`).join('')}
      </div>
    `
    : `<p style="margin: 0 0 10px; color: #64748b;">Sin información.</p>`;

  const table = Array.isArray(detalle) && detalle.length
    ? `
      <table>
        <thead>
          <tr>
            ${Object.keys(detalle[0] || {}).slice(0, 10).map(k => `<th>${cleanText(k)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${detalle.map(r => `
            <tr>
              ${Object.keys(detalle[0] || {}).slice(0, 10).map(k => `<td>${cleanText(r?.[k])}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : `<p style="margin: 0; color: #64748b;">Sin detalle de deuda.</p>`;

  return `
    <div class="card">
      <div class="card-header">
        <i class="fas fa-landmark"></i>
        <h3>SAT Lima - Impuesto Vehicular</h3>
      </div>
      <div class="card-body">
        ${kv}
        ${table}
      </div>
    </div>
  `;
}

/**
 * INFOGAS (siempre visible)
 */
function renderInfogas(report) {
  const info = report.infogas;
  const msg = info?.mensaje || info?.message || null;
  const encontrado = info?.encontrado;

  return `
    <div class="card">
      <div class="card-header">
        <i class="fas fa-gas-pump"></i>
        <h3>INFOGAS</h3>
      </div>
      <div class="card-body">
        <p style="margin: 0; color: #64748b;">
          ${msg ? cleanText(msg) : (encontrado === false ? 'Sin registros.' : 'Información no disponible.')}
        </p>
      </div>
    </div>
  `;
}

/**
 * Genera HTML de Certificado de Lunas Polarizadas
 */
function renderLunasPolarizadas(report) {
  const permisos = report.permisos;
  const datosCertificado = permisos?.datosCertificado || null;
  
  // SIEMPRE mostrar la sección, incluso si no hay datos
  const tieneDatos = datosCertificado || (permisos?.lunasPolarizadas !== null && permisos?.lunasPolarizadas !== undefined);
  
  // Determinar estado
  let tieneCertificado = false;
  let colorCard = '#64748b';
  let estadoTexto = 'NO VERIFICADO';
  let estadoIcon = 'fa-question-circle';
  let estadoMensaje = 'No se pudo verificar el estado del certificado de lunas polarizadas en las fuentes consultadas.';
  
  if (tieneDatos) {
    tieneCertificado = permisos?.lunasPolarizadas === true || datosCertificado !== null;
    colorCard = tieneCertificado ? '#065f46' : '#dc2626';
    estadoTexto = tieneCertificado ? 'VIGENTE' : 'NO AUTORIZADO';
    estadoIcon = tieneCertificado ? 'fa-check-circle' : 'fa-times-circle';
    estadoMensaje = tieneCertificado 
      ? 'El vehículo cuenta con certificado de lunas polarizadas vigente.'
      : 'El vehículo no cuenta con certificado de lunas polarizadas vigente.';
  }
  
  // Construir tabla de datos del certificado si hay información
  let datosHTML = '';
  if (datosCertificado && tieneCertificado && tieneDatos) {
    const datos = [];
    if (datosCertificado.nro_certificado || datosCertificado.numero_certificado) {
      datos.push(`<div class="kv-row"><span class="kv-key">Número de Certificado:</span><span class="kv-value">${cleanText(datosCertificado.nro_certificado || datosCertificado.numero_certificado)}</span></div>`);
    }
    if (datosCertificado.fecha_emision) {
      datos.push(`<div class="kv-row"><span class="kv-key">Fecha de Emisión:</span><span class="kv-value">${cleanText(datosCertificado.fecha_emision)}</span></div>`);
    }
    if (datosCertificado.marca) {
      datos.push(`<div class="kv-row"><span class="kv-key">Marca:</span><span class="kv-value">${cleanText(datosCertificado.marca)}</span></div>`);
    }
    if (datosCertificado.modelo) {
      datos.push(`<div class="kv-row"><span class="kv-key">Modelo:</span><span class="kv-value">${cleanText(datosCertificado.modelo)}</span></div>`);
    }
    if (datosCertificado.anio) {
      datos.push(`<div class="kv-row"><span class="kv-key">Año:</span><span class="kv-value">${cleanText(datosCertificado.anio)}</span></div>`);
    }
    if (datosCertificado.color) {
      datos.push(`<div class="kv-row"><span class="kv-key">Color:</span><span class="kv-value">${cleanText(datosCertificado.color)}</span></div>`);
    }
    if (datosCertificado.serie) {
      datos.push(`<div class="kv-row"><span class="kv-key">Serie:</span><span class="kv-value">${cleanText(datosCertificado.serie)}</span></div>`);
    }
    if (datosCertificado.motor) {
      datos.push(`<div class="kv-row"><span class="kv-key">Motor:</span><span class="kv-value">${cleanText(datosCertificado.motor)}</span></div>`);
    }
    if (datosCertificado.categoria) {
      datos.push(`<div class="kv-row"><span class="kv-key">Categoría:</span><span class="kv-value">${cleanText(datosCertificado.categoria)}</span></div>`);
    }
    
    if (datos.length > 0) {
      datosHTML = `
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #374151;">Datos del Certificado</h4>
          ${datos.join('')}
        </div>
      `;
    }
  }
  
  return `
    <div class="card" style="border-left: 5px solid ${colorCard}; box-shadow: 0 4px 6px rgba(0,0,0,0.1); page-break-inside: avoid; margin-bottom: 20px;">
      <div class="card-header" style="display: flex; align-items: center; gap: 16px; padding: 20px; background: linear-gradient(135deg, ${colorCard}15 0%, ${colorCard}08 100%); border-radius: 8px 8px 0 0;">
        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, ${colorCard} 0%, ${colorCard}dd 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 28px; box-shadow: 0 4px 8px rgba(0,0,0,0.15);">
          <i class="fas fa-certificate"></i>
        </div>
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a;">Certificado de Lunas Polarizadas</h3>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
            <i class="fas ${estadoIcon}" style="color: ${colorCard}; font-size: 16px;"></i>
            <span style="font-weight: 700; color: ${colorCard}; font-size: 14px; text-transform: uppercase;">${estadoTexto}</span>
          </div>
        </div>
      </div>
      <div class="card-body" style="padding: 20px;">
        <div style="background: ${colorCard === '#065f46' ? '#f0fdf4' : '#fee2e2'}; padding: 14px; border-radius: 8px; color: ${colorCard}; border-left: 4px solid ${colorCard};">
          <div style="display: flex; align-items: start; gap: 10px;">
            <i class="fas ${estadoIcon}" style="font-size: 18px; margin-top: 2px;"></i>
            <div style="flex: 1;">
              <div style="font-weight: 600; margin-bottom: 4px;">${estadoMensaje}</div>
            </div>
          </div>
        </div>
        ${datosHTML}
      </div>
    </div>
  `;
}

/**
 * Formatea fecha en formato DD/MM/YYYY para SBS
 */
function formatDateSBS(dateStr) {
  if (!dateStr) return '-';
  
  // Si ya viene en formato DD/MM/YYYY, retornarlo directamente
  if (typeof dateStr === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateStr.trim())) {
    return dateStr.trim();
  }
  
  const d = parseDateSafe(dateStr);
  if (!d) {
    // Intentar parsear como string DD/MM/YYYY directamente
    const match = String(dateStr).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) return dateStr.trim();
    return '-';
  }
  
  try {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '-';
  }
}

/**
 * Genera HTML de SBS con todas las pólizas y sus campos completos
 */
function renderSBS(report) {
  const sbs = report.sbsSiniestralidad;
  
  // Log para depuración
  console.log('[PDF SBS] Verificando datos de SBS:', {
    tieneSBS: !!sbs,
    tienePolizas: !!(sbs && sbs.polizas),
    cantidadPolizas: sbs?.polizas?.length || 0,
    polizas: sbs?.polizas ? JSON.stringify(sbs.polizas.slice(0, 2), null, 2) : 'N/A'
  });
  
  // SIEMPRE mostrar la sección, incluso si no hay datos
  const tieneDatos = sbs && sbs.polizas && sbs.polizas.length > 0;
  const colorCard = '#1e3a5f';
  
  // Construir tabla de pólizas
  let filasHTML = '';
  if (tieneDatos) {
    filasHTML = sbs.polizas.map((poliza, index) => {
      return `
        <tr style="background: ${index % 2 === 0 ? '#ffffff' : '#f9fafb'};">
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">${cleanText(poliza.aseguradora || '-')}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">${cleanText(poliza.clase_vehiculo || '-')}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">${cleanText(poliza.uso_vehiculo || '-')}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px; text-align: center;">${poliza.n_accidentes !== undefined && poliza.n_accidentes !== null ? poliza.n_accidentes : 0}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">${cleanText(poliza.n_poliza || '-')}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">${cleanText(poliza.n_certificado || '-')}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">${formatDateSBS(poliza.inicio_vigencia)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">${formatDateSBS(poliza.fin_vigencia)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">${cleanText(poliza.comentario || '-')}</td>
        </tr>
      `;
    }).join('');
  } else {
    // Mostrar mensaje cuando no hay datos
    filasHTML = `
      <tr>
        <td colspan="9" style="padding: 20px; text-align: center; color: #64748b; font-style: italic;">
          No se encontraron registros de pólizas SOAT en SBS para esta placa.
        </td>
      </tr>
    `;
  }

  // Información adicional
  let infoAdicional = '';
  if (sbs && sbs.fechaConsulta) {
    infoAdicional += `<div style="margin-top: 12px; padding: 10px; background: #f0f9ff; border-radius: 6px; font-size: 11px; color: #1e3a5f;">
      <strong>Fecha de consulta:</strong> ${formatDate(sbs.fechaConsulta)}
    </div>`;
  }
  if (sbs && sbs.fechaActualizacion) {
    infoAdicional += `<div style="margin-top: 8px; padding: 10px; background: #f0f9ff; border-radius: 6px; font-size: 11px; color: #1e3a5f;">
      <strong>Última actualización:</strong> ${cleanText(sbs.fechaActualizacion)}
    </div>`;
  }
  if (sbs && sbs.totalSiniestros !== undefined) {
    infoAdicional += `<div style="margin-top: 8px; padding: 10px; background: ${sbs.totalSiniestros > 0 ? '#fee2e2' : '#f0fdf4'}; border-radius: 6px; font-size: 11px; color: ${sbs.totalSiniestros > 0 ? '#dc2626' : '#065f46'};">
      <strong>Total de accidentes (último año):</strong> ${sbs.totalSiniestros}
    </div>`;
  }

  return `
    <div class="card" style="border-left: 5px solid ${colorCard}; box-shadow: 0 4px 6px rgba(0,0,0,0.1); page-break-inside: avoid; margin-bottom: 20px;">
      <div class="card-header" style="display: flex; align-items: center; gap: 16px; padding: 20px; background: linear-gradient(135deg, ${colorCard}15 0%, ${colorCard}08 100%); border-radius: 8px 8px 0 0;">
        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, ${colorCard} 0%, ${colorCard}dd 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 28px; box-shadow: 0 4px 8px rgba(0,0,0,0.15);">
          <i class="fas fa-shield-alt"></i>
        </div>
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a;">SBS - Historial de Pólizas SOAT</h3>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
            <i class="fas fa-file-contract" style="color: ${colorCard}; font-size: 16px;"></i>
            <span style="font-weight: 700; color: ${colorCard}; font-size: 14px; text-transform: uppercase;">
              ${tieneDatos ? `${sbs.polizas.length} Póliza(s) Registrada(s)` : 'Sin Registros'}
            </span>
          </div>
        </div>
      </div>
      <div class="card-body" style="padding: 20px;">
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 11px; text-transform: uppercase;">Aseguradora</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 11px; text-transform: uppercase;">Clase del Vehículo</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 11px; text-transform: uppercase;">Uso de Vehículo</th>
              <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 11px; text-transform: uppercase;">N.° de Accidentes</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 11px; text-transform: uppercase;">N.° de Póliza</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 11px; text-transform: uppercase;">N.° de Certificado</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 11px; text-transform: uppercase;">Inicio de Vigencia</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 11px; text-transform: uppercase;">Fin de Vigencia</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151; font-size: 11px; text-transform: uppercase;">Comentario</th>
            </tr>
          </thead>
          <tbody>
            ${filasHTML}
          </tbody>
        </table>
        ${infoAdicional}
      </div>
    </div>
  `;
}

/**
 * Genera HTML de infracciones por fuente
 * Formato simple: Tabla CIUDAD | ESTADO con badges "Libre" o cantidad
 */
function renderInfracciones(report) {
  const fuentes = Object.values(report.infracciones);
  
  // Mapeo de nombres de fuentes a nombres de ciudad
  const ciudadMap = {
    'SUTRAN': 'SUTRAN',
    'Arequipa': 'Arequipa',
    'Piura': 'Piura',
    'Tarapoto': 'Tarapoto',
    'Chiclayo': 'Chiclayo',
    'SAT Lima': 'SAT Lima',
    'SAT Trujillo': 'Trujillo',
    'SAT Huancayo': 'SAT Huancayo',
    'SAT Huánuco': 'SAT Huánuco',
    'SAT Ica': 'SAT Ica',
    'SAT Cusco': 'SAT Cusco',
    'SAT Chachapoyas': 'SAT Chachapoyas',
    'SAT Cajamarca': 'SAT Cajamarca',
    'SAT Andahuaylas': 'SAT Andahuaylas',
    'SAT Tacna': 'SAT Tacna'
  };
  
  // Preparar filas de la tabla
  const filas = fuentes.map(fuente => {
    const ciudad = ciudadMap[fuente.fuente] || fuente.fuente;
    const tieneDatos = fuente.status === 'ok' && fuente.registros && fuente.registros.length > 0;
    const cantidad = tieneDatos ? fuente.registros.length : 0;
    
    // Determinar icono según estado
    let icono = '';
    let estadoTexto = '';
    let estadoColor = '';
    
    if (tieneDatos) {
      icono = '<i class="fas fa-exclamation-triangle" style="color: #dc2626; font-size: 14px;"></i>';
      estadoTexto = `${cantidad} papeleta(s)`;
      estadoColor = '#dc2626';
    } else if (fuente.status === 'empty') {
      icono = '<i class="fas fa-check-circle" style="color: #065f46; font-size: 14px;"></i>';
      estadoTexto = 'Libre';
      estadoColor = '#065f46';
    } else if (fuente.status === 'error' || fuente.status === 'not_verified') {
      icono = '<i class="fas fa-question-circle" style="color: #64748b; font-size: 14px;"></i>';
      estadoTexto = 'No verificado';
      estadoColor = '#64748b';
    } else {
      icono = '<i class="fas fa-info-circle" style="color: #64748b; font-size: 14px;"></i>';
      estadoTexto = 'Sin datos';
      estadoColor = '#64748b';
    }
    
    return { ciudad, icono, estadoTexto, estadoColor, tieneDatos, cantidad };
  });
  
  // Ordenar: primero las que tienen datos, luego las libres, luego no verificadas
  filas.sort((a, b) => {
    if (a.tieneDatos && !b.tieneDatos) return -1;
    if (!a.tieneDatos && b.tieneDatos) return 1;
    if (a.estadoTexto === 'Libre' && b.estadoTexto !== 'Libre') return -1;
    if (a.estadoTexto !== 'Libre' && b.estadoTexto === 'Libre') return 1;
    return a.ciudad.localeCompare(b.ciudad);
  });
  
  return `
    <div class="card">
      <div class="card-header" style="display: flex; align-items: center; gap: 12px; padding: 16px; background: linear-gradient(135deg, #1e3a5f15 0%, #1e3a5f08 100%); border-radius: 8px 8px 0 0;">
        <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #1e3a5f 0%, #2d4a7a 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">
          <i class="fas fa-map-marked-alt"></i>
        </div>
        <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #1a1a1a;">Multas y Papeletas por Ciudad</h3>
      </div>
      <div class="card-body" style="padding: 20px;">
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <thead>
            <tr style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-bottom: 2px solid #e2e8f0;">
              <th style="padding: 14px 16px; text-align: left; font-size: 12px; font-weight: 700; color: #1a1a1a; text-transform: uppercase;">
                <i class="fas fa-city" style="margin-right: 8px; color: #1e3a5f;"></i>Ciudad
              </th>
              <th style="padding: 14px 16px; text-align: left; font-size: 12px; font-weight: 700; color: #1a1a1a; text-transform: uppercase;">
                <i class="fas fa-info-circle" style="margin-right: 8px; color: #1e3a5f;"></i>Estado
              </th>
            </tr>
          </thead>
          <tbody>
            ${filas.map(fila => `
              <tr style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;">
                <td style="padding: 14px 16px; font-size: 13px; font-weight: 600; color: #1a1a1a;">
                  ${fila.ciudad}
                </td>
                <td style="padding: 14px 16px;">
                  <span style="display: inline-flex; align-items: center; gap: 8px; background: ${fila.estadoColor === '#065f46' ? '#f0fdf4' : fila.estadoColor === '#dc2626' ? '#fee2e2' : '#f1f5f9'}; color: ${fila.estadoColor}; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid ${fila.estadoColor}40;">
                    ${fila.icono}
                    ${fila.estadoTexto}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Genera HTML de score de riesgo con explicación
 */
function renderRiskScore(riskData) {
  const checksHTML = (riskData.checks || []).map(check => {
    const icon = check.estado === 'ok' ? ICONS.check : 
                 check.estado === 'alerta' ? ICONS.warning : 
                 ICONS.info;
    const color = check.estado === 'ok' ? '#065f46' : 
                  check.estado === 'alerta' ? '#92400e' : 
                  '#64748b';
    return `
      <div class="check-item">
        ${icon.replace('currentColor', color)}
        <span>${cleanText(check.item)}</span>
      </div>
    `;
  }).join('');
  
  return `
    <div class="card">
      <div class="card-header">
        ${ICONS.shield}
        <h3>Resumen / Score / Alertas</h3>
      </div>
      <div class="card-body">
        <div class="score-display">
          <div class="score-value">${cleanText(riskData.categoria || 'Nivel de riesgo')}</div>
          <div class="score-label">${riskData.porcentajeCumplimiento ? `Cumplimiento: ${riskData.porcentajeCumplimiento.toFixed(1)}%` : 'Nivel de riesgo'}</div>
          <div class="score-bar">
            <div class="score-fill" style="width: ${Number(riskData.porcentajeRiesgo ?? riskData.score ?? 0)}%; background: ${(Number(riskData.porcentajeRiesgo ?? riskData.score ?? 0)) <= 30 ? '#065f46' : (Number(riskData.porcentajeRiesgo ?? riskData.score ?? 0)) <= 60 ? '#92400e' : '#dc2626'};"></div>
          </div>
        </div>
        <div class="score-explicacion">
          <h4>Cómo se calculó el score:</h4>
          ${checksHTML}
        </div>
        <div class="score-texto">
          ${cleanText(riskData.explicacion)}
        </div>
      </div>
    </div>
  `;
}

// renderAntiguedad eliminado según solicitud del usuario

/**
 * Verifica si el vehículo tiene menos de 3 años desde su registro
 * Retorna: { tieneMenosDe3Anios: boolean, primeraInspeccion: Date | null }
 */
function verificarVehiculoMenor3Anios(report) {
  const consultaDate = parseDateSafe(report?.meta?.fechaConsulta) || new Date();
  const placasPe = report.placasPe;
  let fechaRegistro = null;
  
  // Obtener fecha de registro desde placas-pe (insertDate o startDate)
  if (placasPe) {
    if (placasPe.insertDate) {
      fechaRegistro = parseDateSafe(placasPe.insertDate);
    }
    if (!fechaRegistro && placasPe.startDate) {
      fechaRegistro = parseDateSafe(placasPe.startDate);
    }
  }
  
  if (fechaRegistro) {
    const diffTime = consultaDate.getTime() - fechaRegistro.getTime();
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    
    if (diffYears < 3) {
      const primeraInspeccion = new Date(fechaRegistro);
      primeraInspeccion.setFullYear(primeraInspeccion.getFullYear() + 3);
      return { tieneMenosDe3Anios: true, primeraInspeccion };
    }
  }
  
  return { tieneMenosDe3Anios: false, primeraInspeccion: null };
}

/**
 * Genera Resumen Ejecutivo Profesional (reemplaza "Análisis Inteligente")
 * DISEÑO: Cuadros, tarjetas, colores, estructura dinámica no lineal y limpia
 */
function generateResumenEjecutivo(report, riskData) {
  const consultaDate = parseDateSafe(report?.meta?.fechaConsulta) || new Date();
  
  // Verificar si el vehículo tiene menos de 3 años (prioridad sobre registros CITV)
  const verificacion3Anios = verificarVehiculoMenor3Anios(report);
  
  // Helper para crear tarjeta profesional
  const crearTarjeta = (icono, titulo, contenido, color, bgColor, detalles = '') => {
    return `
      <div style="background: ${bgColor}; border-radius: 12px; padding: 16px; border: 2px solid ${color}; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 12px;">
        <div style="display: flex; align-items: start; gap: 14px;">
          <div style="width: 48px; height: 48px; background: ${color}; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
            ${icono}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 800; font-size: 14px; color: #1a1a1a; margin-bottom: 6px; line-height: 1.3;">${titulo}</div>
            <div style="font-size: 12px; color: #475569; line-height: 1.5; margin-bottom: ${detalles ? '8px' : '0'};">${contenido}</div>
            ${detalles ? `<div style="font-size: 11px; color: #64748b; padding-top: 6px; border-top: 1px solid rgba(0,0,0,0.08);">${detalles}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  };
  
  const tarjetas = [];
  
  // 1. SOAT - Tarjeta destacada
  const soatIcon = report.soat.estado === 'vigente' ? 
    '<i class="fas fa-shield-alt" style="color: white; font-size: 22px;"></i>' :
    report.soat.estado === 'vencido' ?
    '<i class="fas fa-exclamation-triangle" style="color: white; font-size: 22px;"></i>' :
    '<i class="fas fa-question-circle" style="color: white; font-size: 22px;"></i>';
  
  const soatTitulo = report.soat.estado === 'vigente' ? 
    `SOAT Vigente${report.soat.fin ? ` hasta ${formatDate(report.soat.fin)}` : ''}` :
    report.soat.estado === 'vencido' ?
    `SOAT Vencido${report.soat.fin ? ` desde ${formatDate(report.soat.fin)}` : ''}` :
    'SOAT No verificado';
  
  const soatContenido = report.soat.estado === 'vigente' ? 
    'Cobertura obligatoria activa. El vehículo puede circular legalmente.' :
    report.soat.estado === 'vencido' ?
    'Cobertura vencida. Riesgo legal y financiero. Renovar inmediatamente.' :
    'No se pudo verificar el estado del SOAT en las fuentes consultadas.';
  
  const soatColor = report.soat.estado === 'vigente' ? '#065f46' : 
                    report.soat.estado === 'vencido' ? '#dc2626' : '#64748b';
  const soatBg = report.soat.estado === 'vigente' ? '#f0fdf4' : 
                 report.soat.estado === 'vencido' ? '#fee2e2' : '#f1f5f9';
  const soatDetalles = report.soat.aseguradora && report.soat.aseguradora !== 'No disponible' ? 
    `<i class="fas fa-building" style="margin-right: 4px;"></i>Aseguradora: ${cleanText(report.soat.aseguradora)}${report.soat.poliza ? ` | Póliza: ${cleanText(report.soat.poliza)}` : ''}` : '';
  
  tarjetas.push(crearTarjeta(soatIcon, soatTitulo, soatContenido, soatColor, soatBg, soatDetalles));
  
  // 2. CITV - Tarjeta destacada
  let citvIcon = '';
  let citvTitulo = '';
  let citvContenido = '';
  let citvColor = '#64748b';
  let citvBg = '#f1f5f9';
  let citvDetalles = '';
  
  // PRIORIDAD: Si el vehículo tiene menos de 3 años, mostrar mensaje verde
  if (verificacion3Anios && verificacion3Anios.tieneMenosDe3Anios) {
    citvIcon = '<i class="fas fa-clipboard-check" style="color: white; font-size: 22px;"></i>';
    citvTitulo = 'CITV Sin Riesgo';
    citvContenido = verificacion3Anios.primeraInspeccion 
      ? `Vehículo aún no necesita de revisión técnica. Primera revisión técnica en: ${formatDate(verificacion3Anios.primeraInspeccion.toISOString())}.`
      : 'Vehículo aún no necesita de revisión técnica.';
    citvColor = '#065f46';
    citvBg = '#f0fdf4';
    citvDetalles = `<i class="fas fa-info-circle" style="margin-right: 4px;"></i>Vehículo menor a 3 años desde su registro`;
  } else if (report.citv.length > 0) {
    const principalCITV = pickCITVPrincipal(report.citv, consultaDate) || report.citv[report.citv.length - 1];
    const finCITV = parseDateSafe(principalCITV.fin);
    const estadoRealCITV = finCITV ? (finCITV >= consultaDate ? 'vigente' : 'vencido') : 
                          (principalCITV.estado === 'vigente' ? 'vigente' : 'vencido');
    
    citvIcon = estadoRealCITV === 'vigente' ?
      '<i class="fas fa-clipboard-check" style="color: white; font-size: 22px;"></i>' :
      '<i class="fas fa-exclamation-triangle" style="color: white; font-size: 22px;"></i>';
    
    citvTitulo = estadoRealCITV === 'vigente' ?
      `CITV Vigente${principalCITV.fin ? ` hasta ${formatDate(principalCITV.fin)}` : ''}` :
      `CITV Vencido${principalCITV.fin ? ` desde ${formatDate(principalCITV.fin)}` : ''}`;
    
    citvContenido = estadoRealCITV === 'vigente' ?
      'Inspección técnica aprobada y activa. El vehículo cumple con los requisitos técnicos.' :
      'Inspección técnica vencida. Podría generar multa y observaciones pendientes. Renovar urgentemente.';
    
    citvColor = estadoRealCITV === 'vigente' ? '#065f46' : '#dc2626';
    citvBg = estadoRealCITV === 'vigente' ? '#f0fdf4' : '#fee2e2';
    
    if (principalCITV.observaciones && principalCITV.observaciones !== 'Sin observaciones' && principalCITV.observaciones !== '-') {
      citvDetalles += `<i class="fas fa-exclamation-circle" style="margin-right: 4px;"></i>Observaciones: ${cleanText(principalCITV.observaciones)}`;
    }
    if (principalCITV.certificado) {
      citvDetalles += citvDetalles ? ' | ' : '';
      citvDetalles += `<i class="fas fa-certificate" style="margin-right: 4px;"></i>Certificado: ${cleanText(principalCITV.certificado)}`;
    }
    citvDetalles += citvDetalles ? ' | ' : '';
    citvDetalles += `<i class="fas fa-history" style="margin-right: 4px;"></i>${report.citv.length} certificado(s) en historial`;
  } else {
    citvIcon = '<i class="fas fa-question-circle" style="color: white; font-size: 22px;"></i>';
    citvTitulo = 'CITV No verificado';
    citvContenido = 'No se pudo verificar el estado del CITV en las fuentes consultadas.';
  }
  
  tarjetas.push(crearTarjeta(citvIcon, citvTitulo, citvContenido, citvColor, citvBg, citvDetalles));
  
  // 3. Infracciones - Tarjeta con detalles completos
  const totalInfracciones = Object.values(report.infracciones)
    .reduce((sum, f) => sum + (f.status === 'ok' ? f.registros.length : 0), 0);
  
  const fuentesConInfracciones = Object.values(report.infracciones)
    .filter(f => f.status === 'ok' && f.registros && f.registros.length > 0)
    .map(f => `${f.fuente}: ${f.registros.length}`);
  
  const infraIcon = totalInfracciones === 0 ?
    '<i class="fas fa-check-circle" style="color: white; font-size: 22px;"></i>' :
    '<i class="fas fa-gavel" style="color: white; font-size: 22px;"></i>';
  
  const infraTitulo = totalInfracciones === 0 ?
    'Sin infracciones registradas' :
    `${totalInfracciones} infracción(es) / papeleta(s) detectada(s)`;
  
  const infraContenido = totalInfracciones === 0 ?
    'El vehículo no presenta registros de infracciones o papeletas en las fuentes consultadas.' :
    `Se encontraron registros de infracciones en ${fuentesConInfracciones.length} fuente(s). Revisar detalle completo en la sección de infracciones.`;
  
  const infraColor = totalInfracciones === 0 ? '#065f46' : '#dc2626';
  const infraBg = totalInfracciones === 0 ? '#f0fdf4' : '#fee2e2';
  const infraDetalles = fuentesConInfracciones.length > 0 ? 
    `<i class="fas fa-map-marker-alt" style="margin-right: 4px;"></i>Fuentes: ${fuentesConInfracciones.join(' • ')}` : '';
  
  tarjetas.push(crearTarjeta(infraIcon, infraTitulo, infraContenido, infraColor, infraBg, infraDetalles));
  
  // 4. SBS Siniestralidad - Tarjeta
  if (report.sbsSiniestralidad) {
    const nAcc = report.sbsSiniestralidad.totalSiniestros || 0;
    const sbsIcon = nAcc === 0 ?
      '<i class="fas fa-shield-alt" style="color: white; font-size: 22px;"></i>' :
      '<i class="fas fa-car-crash" style="color: white; font-size: 22px;"></i>';
    
    const sbsTitulo = nAcc === 0 ?
      'Sin accidentes registrados en SBS' :
      `${nAcc} accidente(s) registrado(s) en SBS`;
    
    const sbsContenido = nAcc === 0 ?
      'No se registran accidentes en el historial de SBS. Buen indicador de seguridad.' :
      `Se registran ${nAcc} accidente(s) en el historial de SBS. Validar reparaciones y estructura del vehículo.`;
    
    const sbsColor = nAcc === 0 ? '#065f46' : '#dc2626';
    const sbsBg = nAcc === 0 ? '#f0fdf4' : '#fee2e2';
    const sbsDetalles = report.sbsSiniestralidad.fechaActualizacion ? 
      `<i class="fas fa-calendar" style="margin-right: 4px;"></i>Última actualización: ${formatDate(report.sbsSiniestralidad.fechaActualizacion)}` : '';
    
    tarjetas.push(crearTarjeta(sbsIcon, sbsTitulo, sbsContenido, sbsColor, sbsBg, sbsDetalles));
  }
  
  // 5. PLACAS.PE - Tarjeta
  if (report.placasPe) {
    const pp = report.placasPe;
    const placasIcon = '<i class="fas fa-id-card" style="color: white; font-size: 22px;"></i>';
    const placasTitulo = `Estado de Placa: ${cleanText(pp.statusDescription || pp.status || 'Información disponible')}`;
    const placasContenido = pp.statusDescription && pp.statusDescription.toLowerCase().includes('entregado') ?
      'Placa entregada a cliente. Vehículo matriculado correctamente según PLACAS.PE.' :
      'Información de estado de placa disponible. Revisar detalle completo en sección PLACAS.PE.';
    const placasColor = '#1e3a5f';
    const placasBg = '#e0f2fe';
    const placasDetalles = pp.ownerCompleteName ? 
      `<i class="fas fa-user" style="margin-right: 4px;"></i>Propietario: ${cleanText(pp.ownerCompleteName)}` : '';
    
    tarjetas.push(crearTarjeta(placasIcon, placasTitulo, placasContenido, placasColor, placasBg, placasDetalles));
  }
  
  // 6. Resumen de Riesgo - Tarjeta destacada
  const riesgoIcon = riskData.score <= 30 ?
    '<i class="fas fa-shield-alt" style="color: white; font-size: 22px;"></i>' :
    riskData.score <= 60 ?
    '<i class="fas fa-exclamation-triangle" style="color: white; font-size: 22px;"></i>' :
    '<i class="fas fa-times-circle" style="color: white; font-size: 22px;"></i>';
  
  const riesgoPct = Number(riskData.porcentajeRiesgo ?? riskData.score ?? 0);
  const riesgoTitulo = `${cleanText(riskData.categoria || 'Nivel de riesgo')} (${riesgoPct}% de riesgo)`;
  const riesgoContenido = riskData.explicacion || 'Evaluación basada en documentos y registros verificados de todas las fuentes consultadas.';
  const riesgoColor = riesgoPct <= 30 ? '#065f46' : riesgoPct <= 60 ? '#92400e' : '#dc2626';
  const riesgoBg = riesgoPct <= 30 ? '#f0fdf4' : riesgoPct <= 60 ? '#fef3c7' : '#fee2e2';
  
  tarjetas.push(crearTarjeta(riesgoIcon, riesgoTitulo, riesgoContenido, riesgoColor, riesgoBg));
  
  // Retornar todas las tarjetas en un grid dinámico
  return `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
      ${tarjetas.join('')}
    </div>
  `;
}

/**
 * Genera quick checks
 */
function generateQuickChecks(report, riskData) {
  const checks = [];
  
  checks.push(`
    <div class="checkItem">
      ${report.soat.estado === 'vigente' ? ICONS.check.replace('currentColor', '#065f46') : ICONS.x.replace('currentColor', '#dc2626')}
      <span>SOAT ${report.soat.estado === 'vigente' ? 'Vigente' : report.soat.estado === 'vencido' ? 'Vencido' : 'No disponible'}</span>
    </div>
  `);
  
  if (report.citv.length > 0) {
    const consultaDate = parseDateSafe(report?.meta?.fechaConsulta) || new Date();
    const principal = pickCITVPrincipal(report.citv, consultaDate) || report.citv[report.citv.length - 1];
    const fin = parseDateSafe(principal.fin);
    const estadoReal = fin ? (fin >= consultaDate ? 'vigente' : 'vencido') : 
                        (principal.estado === 'vigente' ? 'vigente' : 'vencido');
    
    checks.push(`
      <div class="checkItem">
        ${estadoReal === 'vigente' ? ICONS.check.replace('currentColor', '#065f46') : ICONS.x.replace('currentColor', '#dc2626')}
        <span>CITV ${estadoReal === 'vigente' ? 'Vigente' : 'Vencido'}</span>
      </div>
    `);
  } else {
    checks.push(`
      <div class="checkItem">
        ${ICONS.info.replace('currentColor', '#64748b')}
        <span>CITV No verificado</span>
      </div>
    `);
  }
  
  const totalInfracciones = Object.values(report.infracciones)
    .reduce((sum, f) => sum + (f.status === 'ok' ? f.registros.length : 0), 0);
  
  checks.push(`
    <div class="checkItem">
      ${totalInfracciones === 0 ? ICONS.check.replace('currentColor', '#065f46') : ICONS.warning.replace('currentColor', '#92400e')}
      <span>Infracciones: ${totalInfracciones}</span>
    </div>
  `);
  
  return checks.join('');
}

// generateInsightsFromReport ahora se importa desde generateInsights.js

/**
 * Genera recomendaciones
 */
function generateRecommendations(report, riskData) {
  const recs = [];
  
  if (report.soat.estado === 'vencido') {
    recs.push('Renovar SOAT inmediatamente.');
  }
  
  if (report.citv.length > 0) {
    const ultima = report.citv[report.citv.length - 1];
    if (ultima.estado === 'vencido') {
      recs.push('Renovar CITV inmediatamente.');
    }
    if (ultima.observaciones) {
      recs.push(`Revisar: ${cleanText(ultima.observaciones)}`);
    }
  }
  
  const fuentesNoVerificadas = Object.values(report.infracciones)
    .filter(f => f.status === 'error' || f.status === 'not_verified').length;
  
  if (fuentesNoVerificadas > 0) {
    recs.push(`${fuentesNoVerificadas} fuente(s) no verificada(s). Consultar manualmente si es necesario.`);
  }
  
  if (recs.length === 0) {
    recs.push('Todos los documentos verificados están en orden.');
  }
  
  return `
    <div class="card grid-full">
      <h3>Recomendaciones</h3>
      <ul>
        ${recs.map(r => `<li>${cleanText(r)}</li>`).join('')}
      </ul>
    </div>
  `;
}

/**
 * Genera información destacada
 */
function generateInformacionDestacada(report) {
  const fuentesHTML = renderFuentes(report);
  
  return `
    <div class="card grid-full">
      <h3>Información destacada</h3>
      ${fuentesHTML}
    </div>
  `;
}

/**
 * Genera informe analítico (basado en datos, no texto libre)
 */
function generateInformeAnalitico(report, riskData) {
  const hallazgos = [];
  const riesgos = [];
  
  // Hallazgos
  if (report.soat.estado === 'vigente') {
    hallazgos.push(`SOAT vigente hasta ${formatDate(report.soat.fin)}.`);
  }
  
  if (report.citv.length > 0) {
    const ultima = report.citv[report.citv.length - 1];
    hallazgos.push(`CITV ${ultima.estado === 'vigente' ? 'vigente' : 'vencido'} hasta ${formatDate(ultima.fin)}.`);
    if (ultima.observaciones) {
      hallazgos.push(`Observaciones: ${cleanText(ultima.observaciones)}`);
    }
  }
  
  // Riesgos
  if (report.soat.estado === 'vencido') {
    riesgos.push('SOAT vencido - riesgo legal y financiero.');
  }
  
  if (report.citv.length > 0 && report.citv[report.citv.length - 1].estado === 'vencido') {
    riesgos.push('CITV vencido - no puede circular legalmente.');
  }
  
  const totalInfracciones = Object.values(report.infracciones)
    .reduce((sum, f) => sum + (f.status === 'ok' ? f.registros.length : 0), 0);
  
  if (totalInfracciones > 0) {
    riesgos.push(`${totalInfracciones} infracción(es) registrada(s) - puede afectar el valor del vehículo.`);
  }
  
  // Sección eliminada según solicitud del usuario
  return '';
}

/**
 * Genera HTML de nivel de confianza
 */
function renderNivelConfianza(report, riskData) {
  const nivel = riskData.nivelConfianza;
  const porcentaje = riskData.porcentajeConfianza;
  
  const color = nivel === 'Alta' ? '#065f46' : nivel === 'Media' ? '#92400e' : '#dc2626';
  const bgColor = nivel === 'Alta' ? '#f0fdf4' : nivel === 'Media' ? '#fef3c7' : '#fee2e2';
  const icon = nivel === 'Alta' ? 'fa-check-circle' : nivel === 'Media' ? 'fa-exclamation-circle' : 'fa-times-circle';
  
  return `
    <div style="background: ${bgColor}; padding: 12px; border-radius: 8px; border-left: 4px solid ${color}; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <i class="fas ${icon}" style="color: ${color}; font-size: 18px;"></i>
        <div style="flex: 1;">
          <div style="font-size: 12px; font-weight: 700; color: #1a1a1a; margin-bottom: 2px;">Nivel de confianza: ${nivel}</div>
          <div style="font-size: 10px; color: #64748b;">${porcentaje}% de fuentes verificadas (${report.meta.fuentesDisponibles.length} fuentes consultadas)</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Genera HTML de fuentes y limitaciones
 */
function renderFuentes(report) {
  const erroresHTML = report.meta.errores.map(err => {
    let motivo = '';
    if (err.requiere_captcha) {
      motivo = 'CAPTCHA no resuelto';
    } else if (err.requiere_datos) {
      motivo = 'Requiere datos adicionales';
    } else {
      motivo = err.error || 'Error desconocido';
    }
    return `<li>${cleanText(err.fuente)}: ${cleanText(motivo)}</li>`;
  }).join('');
  
  return `
    <div class="card">
      <div class="card-header">
        ${ICONS.info}
        <h3>Fuentes y limitaciones</h3>
      </div>
      <div class="card-body">
        <div class="kv-row"><span class="kv-key">Fuentes consultadas:</span><span class="kv-value">${report.meta.fuentesDisponibles.join(', ')}</span></div>
        <div class="kv-row"><span class="kv-key">Fecha de consulta:</span><span class="kv-value">${formatDate(report.meta.fechaConsulta)}</span></div>
        <div class="kv-row"><span class="kv-key">Hash del reporte:</span><span class="kv-value">${report.meta.hash}</span></div>
        ${erroresHTML ? `<div><strong>Limitaciones:</strong><ul>${erroresHTML}</ul></div>` : ''}
      </div>
    </div>
  `;
}

/**
 * Obtiene imagen como base64
 */
function getImagePath() {
  const imgPath = path.join(__dirname, 'public', 'portada2.png');
  if (fs.existsSync(imgPath)) {
    try {
      const imageBuffer = fs.readFileSync(imgPath);
      const base64Image = imageBuffer.toString('base64');
      return `data:image/png;base64,${base64Image}`;
    } catch (e) {
      console.error('[PDF] Error leyendo imagen:', e);
      return '';
    }
  }
  return '';
}

function getLogoPath() {
  const logoPath = path.join(__dirname, 'public', 'principal.png');
  if (fs.existsSync(logoPath)) {
    try {
      const imageBuffer = fs.readFileSync(logoPath);
      const base64Image = imageBuffer.toString('base64');
      return `data:image/png;base64,${base64Image}`;
    } catch (e) {
      console.error('[PDF] Error leyendo logo:', e);
      return '';
    }
  }
  return '';
}

/**
 * Genera template HTML completo para PDF
 */
function getPDFTemplate() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Vehicular - {{PLACA}}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    /* Marca de agua centrada (se repite por página al imprimir en Chromium) */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 62%;
      max-width: 520px;
      opacity: 0.08;
      z-index: 0;
      pointer-events: none;
    }
    .watermark img {
      width: 100%;
      height: auto;
      display: block;
      /* Opcional: suaviza el watermark */
      filter: grayscale(100%);
    }
    .doc-content { position: relative; z-index: 1; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #1a1a1a;
      background: #f9fafb;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%);
      color: white;
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .logo { max-width: 150px; height: auto; }
    .header-info {
      text-align: right;
      font-size: 14px;
    }
    .header-title {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .header-subtitle {
      font-size: 14px;
      opacity: 0.9;
    }
    .summary-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 20px;
    }
    .badge {
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .b-ok { background: #d1fae5; color: #065f46; }
    .b-warn { background: #fef3c7; color: #92400e; }
    .b-bad { background: #fee2e2; color: #dc2626; }
    .card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      page-break-inside: avoid;
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid #e5e7eb;
    }
    .card-header h3 {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a1a;
      margin: 0;
    }
    .card-body {
      color: #374151;
    }
    .kv-row {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .kv-key {
      font-weight: 600;
      color: #6b7280;
      font-size: 11px;
      text-transform: uppercase;
    }
    .kv-value {
      color: #1a1a1a;
      font-size: 12px;
    }
    .risk-score {
      text-align: center;
      padding: 30px;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-radius: 12px;
      margin: 20px 0;
    }
    .risk-score-value {
      font-size: 48px;
      font-weight: 700;
      color: #1e3a5f;
      margin: 10px 0;
    }
    .risk-score-category {
      font-size: 20px;
      font-weight: 600;
      color: #64748b;
    }
    .checkItem {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 0;
      font-size: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    table th, table td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
      font-size: 11px;
    }
    table th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
      text-transform: uppercase;
    }
    .grid-full { grid-column: 1 / -1; }
    @media print {
      body { padding: 0; }
      .card { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="watermark">
    <img src="{{WATERMARK_IMG}}" alt="" aria-hidden="true" onerror="this.style.display='none'">
  </div>
  <div class="doc-content">
  <div class="header">
    <div class="header-top">
      <img src="{{LOGO_IMG}}" alt="Logo" class="logo" onerror="this.style.display='none'">
      <div class="header-info">
        <div>Placa: <strong>{{PLACA}}</strong></div>
        <div>Fecha: {{FECHA}}</div>
      </div>
    </div>
    {{PORTADA_IMG}}
    <div class="header-title">Reporte Vehicular Completo</div>
    <div class="header-subtitle">Información verificada de múltiples fuentes oficiales</div>
    <div class="summary-badges">{{SUMMARY_BADGES}}</div>
  </div>


  <div class="card">
    <div class="card-header">
      <i class="fas fa-check-circle"></i>
      <h3>Verificaciones Rápidas</h3>
    </div>
    <div class="card-body">
      {{QUICK_CHECKS}}
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <i class="fas fa-file-alt"></i>
      <h3>Resumen Ejecutivo</h3>
    </div>
    <div class="card-body">
      {{RESUMEN_EJECUTIVO}}
    </div>
  </div>

  {{PLACAS_PE}}

  <div class="card">
    <div class="card-header">
      <i class="fas fa-shield-alt"></i>
      <h3>SOAT - Seguro Obligatorio</h3>
    </div>
    <div class="card-body">
      {{SOAT}}
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <i class="fas fa-clipboard-check"></i>
      <h3>Certificación de Inspección Técnica Vehicular</h3>
    </div>
    <div class="card-body">
      {{INSPECTIONS_TABLE}}
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Orden de Captura - SAT Lima</h3>
    </div>
    <div class="card-body">
      {{SAT_LIMA}}
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <i class="fas fa-list"></i>
      <h3>Infracciones y Multas</h3>
    </div>
    <div class="card-body">
      {{MULTAS_TABLE}}
    </div>
  </div>

  {{DETALLE_CIUDADES}}

  {{SUTRAN_TABLE}}

  {{CALLAO_TABLE}}

  {{PUNO_TABLE}}

  {{PIURA_TABLE}}

  {{PIT_FOTO_TABLE}}

  {{IMPUESTO_VEHICULAR}}

  {{INFOGAS}}

  {{LUNAS_POLARIZADAS}}

  {{SBS_TABLE}}

  {{INFORMACION_DESTACADA}}

  <div style="margin-top: 40px; padding: 20px; background: #f9fafb; border-radius: 8px; text-align: center; font-size: 10px; color: #6b7280;">
    <p>Reporte generado el {{FECHA}} | Hash: {{HASH}}</p>
    <p>Este informe contiene información verificada de fuentes oficiales peruanas.</p>
  </div>
  </div>
</body>
</html>`;
}

/**
 * Función principal: renderiza PDF desde modelo normalizado
 */
async function renderPdf(reportData, placa, fechaConsulta, rawResults = null) {
  // 1. Combinar reportData con rawResults para asegurar que tengamos todos los datos
  // rawResults tiene los datos originales completos de la API
  const datosCombinados = { ...reportData };
  
  if (rawResults) {
    // Si rawResults tiene datos de placas-pe, usarlos directamente
    if (rawResults['placas-pe']) {
      datosCombinados['placas-pe'] = rawResults['placas-pe'];
      console.log('[PDF] Usando rawResults para placas-pe:', JSON.stringify(rawResults['placas-pe'], null, 2));
    }
    // Si rawResults tiene datos de certificado-vehiculo, usarlos directamente
    if (rawResults['certificado-vehiculo']) {
      datosCombinados['certificado-vehiculo'] = rawResults['certificado-vehiculo'];
      console.log('[PDF] Usando rawResults para certificado-vehiculo:', JSON.stringify(rawResults['certificado-vehiculo'], null, 2));
    }
    // Si rawResults tiene datos de siniestro/SBS, usarlos directamente
    if (rawResults['siniestro'] || rawResults['sbs']) {
      const sbsData = rawResults['siniestro'] || rawResults['sbs'];
      datosCombinados['siniestro'] = sbsData;
      console.log('[PDF] Usando rawResults para SBS/siniestro:', JSON.stringify(sbsData, null, 2));
      if (sbsData?.data?.polizas) {
        console.log(`[PDF] SBS tiene ${sbsData.data.polizas.length} pólizas`);
      }
    }

    // Usar rawResults para el resto de secciones (para que TODO lo del frontend pase al PDF)
    const passThroughKeys = [
      'callao',
      'sutran',
      'sat',
      'arequipa',
      'piura',
      'tarapoto',
      'chiclayo',
      'infogas',
      'puno',
      'pit-foto',
      'impuesto-vehicular',
      'sat-andahuaylas',
      'sat-tacna',
      'sat-cajamarca',
      'sat-chachapoyas',
      'sat-cusco',
      'sat-huancayo',
      'sat-huanuco',
      'sat-ica',
      'sat-trujillo'
    ];
    passThroughKeys.forEach((k) => {
      if (rawResults[k]) datosCombinados[k] = rawResults[k];
    });
  }
  
  // 2. Normalizar datos
  const report = buildVehicleReport(datosCombinados, placa);
  
  // 2. Calcular score de riesgo
  const riskData = calculateRiskScore(report);
  
  // 3. Generar Resumen Ejecutivo profesional (reemplaza "Análisis Inteligente")
  const resumenEjecutivoHTML = generateResumenEjecutivo(report, riskData);
  
  // 4. Crear template HTML inline (ya no lee principal.html)
  let html = getPDFTemplate();
  
  // 4. Generar secciones
  const placasPeHTML = renderPlacasPe(report);
  const soatHTML = renderSOAT(report);
  const citvHTML = renderCITV(report);
  const satLimaHTML = renderSATLima(report);
  const infraccionesHTML = renderInfracciones(report);
  const sutranHTML = renderSUTRAN(report);
  const callaoHTML = renderCallao(report);
  const punoHTML = renderPuno(report);
  const piuraHTML = renderPiura(report);
  const pitFotoHTML = renderPitFoto(report);
  const impuestoVehicularHTML = renderImpuestoVehicular(report);
  const infogasHTML = renderInfogas(report);
  const detalleCiudadesHTML = renderDetalleCiudades(report);
  const lunasHTML = renderLunasPolarizadas(report);
  const sbsHTML = renderSBS(report);
  // Nivel de riesgo eliminado - renderRiskScore no se usa
  const fuentesHTML = renderFuentes(report);
  
  // 4.1. Nivel de confianza basado en meta.fuentes
  // Nivel de confianza eliminado según solicitud
  const nivelConfianzaHTML = '';
  
  // 5. Generar contenido combinado para el template actual
  const summaryBadges = [];
  if (report.soat.estado === 'vigente') {
    summaryBadges.push(`<span class="badge b-ok">${ICONS.check} SOAT Vigente</span>`);
  } else if (report.soat.estado === 'vencido') {
    summaryBadges.push(`<span class="badge b-bad">${ICONS.x} SOAT Vencido</span>`);
  }
  
  // Verificar si el vehículo tiene menos de 3 años (prioridad sobre registros CITV)
  const verificacion3Anios = verificarVehiculoMenor3Anios(report);
  
  if (verificacion3Anios && verificacion3Anios.tieneMenosDe3Anios) {
    summaryBadges.push(`<span class="badge b-ok">${ICONS.check} CITV Sin Riesgo</span>`);
  } else if (report.citv.length > 0) {
    const consultaDate = parseDateSafe(report?.meta?.fechaConsulta) || new Date();
    const principalCITV = pickCITVPrincipal(report.citv, consultaDate) || report.citv[report.citv.length - 1];
    const finCITV = parseDateSafe(principalCITV.fin);
    const estadoRealCITV = finCITV ? (finCITV >= consultaDate ? 'vigente' : 'vencido') : 
                            (principalCITV.estado === 'vigente' ? 'vigente' : 'vencido');
    
    if (estadoRealCITV === 'vigente') {
      summaryBadges.push(`<span class="badge b-ok">${ICONS.check} CITV Vigente</span>`);
    } else {
      summaryBadges.push(`<span class="badge b-bad">${ICONS.x} CITV Vencido</span>`);
    }
  }
  
  const totalInfracciones = Object.values(report.infracciones)
    .reduce((sum, f) => sum + (f.status === 'ok' ? f.registros.length : 0), 0);
  
  if (totalInfracciones === 0) {
    summaryBadges.push(`<span class="badge b-ok">${ICONS.check} Sin Papeletas</span>`);
  } else {
    summaryBadges.push(`<span class="badge b-warn">${ICONS.warning} ${totalInfracciones} Papeleta(s)</span>`);
  }
  
  // 6. Reemplazar placeholders del template actual
  html = html
    .replace(/{{PLACA}}/g, cleanText(placa || report.meta.placa))
    .replace(/{{FECHA}}/g, cleanText(fechaConsulta || formatDate(report.meta.fechaConsulta)))
    .replace(/{{VEHICULO}}/g, '')
    .replace(/{{VEHICULO_KV}}/g, '')
    .replace(/{{RIESGO_SCORE}}/g, riskData.score)
    .replace(/{{RIESGO_CATEGORIA}}/g, riskData.categoria || (riskData.score <= 30 ? 'Bajo' : riskData.score <= 60 ? 'Moderado' : 'Alto'))
    .replace(/{{RIESGO_COLOR}}/g, riskData.score <= 30 ? 'b-ok' : riskData.score <= 60 ? 'b-warn' : 'b-bad')
    .replace(/{{RIESGO_PERCENT}}/g, riskData.score)
    .replace(/{{SUMMARY_BADGES}}/g, summaryBadges.join(''))
    .replace(/{{LOGO_IMG}}/g, getLogoPath())
    .replace(/{{WATERMARK_IMG}}/g, getLogoPath())
    .replace(/{{PRINCIPAL_IMG}}/g, getImagePath())
    .replace(/{{PORTADA_IMG}}/g, `<img src="${getImagePath()}" alt="Portada" style="max-width: 100%; height: auto; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />`)
    .replace(/{{QUICK_CHECKS}}/g, generateQuickChecks(report, riskData))
    .replace(/{{INSIGHTS}}/g, resumenEjecutivoHTML)
    .replace(/{{RESUMEN_EJECUTIVO}}/g, resumenEjecutivoHTML)
    .replace(/{{PLACAS_PE}}/g, placasPeHTML)
    .replace(/{{SOAT}}/g, soatHTML)
    .replace(/{{NIVEL_CONFIANZA}}/g, nivelConfianzaHTML)
    .replace(/{{INSPECTIONS_TABLE}}/g, citvHTML)
    .replace(/{{SAT_LIMA}}/g, satLimaHTML)
    .replace(/{{MULTAS_TABLE}}/g, infraccionesHTML)
    .replace(/{{DETALLE_CIUDADES}}/g, detalleCiudadesHTML)
    .replace(/{{SUTRAN_TABLE}}/g, sutranHTML)
    .replace(/{{CALLAO_TABLE}}/g, callaoHTML)
    .replace(/{{PUNO_TABLE}}/g, punoHTML)
    .replace(/{{PIURA_TABLE}}/g, piuraHTML)
    .replace(/{{PIT_FOTO_TABLE}}/g, pitFotoHTML)
    .replace(/{{IMPUESTO_VEHICULAR}}/g, impuestoVehicularHTML)
    .replace(/{{INFOGAS}}/g, infogasHTML)
    .replace(/{{LUNAS_POLARIZADAS}}/g, lunasHTML)
    .replace(/{{SBS_TABLE}}/g, sbsHTML)
    .replace(/{{RECOMMENDATIONS}}/g, '') // Sección eliminada
    .replace(/{{INFORMACION_DESTACADA}}/g, generateInformacionDestacada(report))
    .replace(/{{INFORME_ANALITICO}}/g, generateInformeAnalitico(report, riskData))
    .replace(/{{HASH}}/g, report.meta.hash);
  
  // 6. Agregar Font Awesome CDN al HTML
  html = html.replace('</head>', `${FONT_AWESOME_CDN}</head>`);
  if (!html.includes('</head>')) {
    // Si no hay head, agregarlo al inicio
    html = `<head>${FONT_AWESOME_CDN}</head>${html}`;
  }
  
  // 7. Generar PDF con Playwright
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '12mm',
      right: '12mm',
      bottom: '12mm',
      left: '12mm'
    }
  });
  
  await browser.close();
  
  return pdfBuffer;
}

module.exports = { renderPdf };
