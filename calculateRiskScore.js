/**
 * calculateRiskScore.js
 * Calcula nivel y % de riesgo usando 3 pilares:
 * - SOAT
 * - CITV
 * - Infracciones
 *
 * Regla solicitada:
 * - Si tiene SOAT + CITV + sin infracciones => 100% “en orden” => Sin riesgo (riesgo bajo)
 * - Si falta 1 => 66% “en orden” => Riesgo moderado (60% de riesgo)
 * - Si falta 2 o más => 33% o menos “en orden” => Riesgoso (>90% de riesgo)
 */

/**
 * Calcula el score de riesgo y nivel de confianza
 * @param {Object} report - VehicleReport normalizado
 * @returns {Object} { score, porcentajeRiesgo, porcentajeCumplimiento, categoria, explicacion, checks }
 */
function calculateRiskScore(report) {
  const checks = [];

  // =========================
  // Pilar 1: SOAT
  // =========================
  const soatEstado = report?.soat?.estado || 'no_disponible';
  const soatOk = soatEstado === 'vigente';
  if (soatOk) {
    checks.push({ item: 'SOAT vigente', estado: 'ok', detalle: null });
  } else if (soatEstado === 'vencido') {
    checks.push({ item: 'SOAT vencido', estado: 'alerta', detalle: null });
  } else {
    checks.push({ item: 'SOAT no verificado', estado: 'incertidumbre', detalle: null });
  }

  // =========================
  // Pilar 2: CITV
  // =========================
  const consultaDate = parseDateSafe(report?.meta?.fechaConsulta) || new Date();
  const placasPe = report.placasPe;
  let fechaRegistro = null;
  let tieneMenosDe3Anios = false;
  
  // Obtener fecha de registro desde placas-pe (insertDate o startDate)
  if (placasPe) {
    if (placasPe.insertDate) {
      fechaRegistro = parseDateSafe(placasPe.insertDate);
    }
    if (!fechaRegistro && placasPe.startDate) {
      fechaRegistro = parseDateSafe(placasPe.startDate);
    }
  }
  
  // Verificar si tiene menos de 3 años
  if (fechaRegistro) {
    const diffTime = consultaDate.getTime() - fechaRegistro.getTime();
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    tieneMenosDe3Anios = diffYears < 3;
  }

  let citvOk = false;
  if (tieneMenosDe3Anios) {
    citvOk = true;
    checks.push({ item: 'CITV sin riesgo (vehículo < 3 años)', estado: 'ok', detalle: null });
  } else if (Array.isArray(report.citv) && report.citv.length > 0) {
    const principal = pickCITVPrincipal(report.citv, consultaDate) || report.citv[report.citv.length - 1];
    const fin = parseDateSafe(principal.fin);
    const estadoReal = fin ? (fin >= consultaDate ? 'vigente' : 'vencido') :
      (principal.estado === 'vigente' ? 'vigente' : 'vencido');
    if (estadoReal === 'vigente') {
      citvOk = true;
      checks.push({ item: 'CITV vigente', estado: 'ok', detalle: null });
    } else {
      checks.push({ item: 'CITV vencido', estado: 'alerta', detalle: null });
    }
  } else {
    checks.push({ item: 'CITV no verificado', estado: 'incertidumbre', detalle: null });
  }

  // =========================
  // Pilar 3: Infracciones
  // =========================
  let totalInfracciones = 0;
  let fuentesNoVerificadas = 0;
  const fuentes = Object.values(report?.infracciones || {});
  fuentes.forEach(fuente => {
    if ((fuente.status === 'ok') && Array.isArray(fuente.registros) && fuente.registros.length > 0) {
      totalInfracciones += fuente.registros.length;
    }
    if (fuente.status === 'error' || fuente.status === 'not_verified') {
      fuentesNoVerificadas++;
    }
  });

  let infraccionesOk = false;
  if (totalInfracciones > 0) {
    checks.push({ item: `Infracciones registradas (${totalInfracciones})`, estado: 'alerta', detalle: null });
  } else if (fuentesNoVerificadas > 0) {
    checks.push({ item: `Infracciones no verificadas (${fuentesNoVerificadas} fuente(s))`, estado: 'incertidumbre', detalle: null });
  } else {
    infraccionesOk = true;
    checks.push({ item: 'Sin infracciones registradas', estado: 'ok', detalle: null });
  }

  // =========================
  // Cumplimiento (en orden) y % de riesgo
  // =========================
  const okCount = (soatOk ? 1 : 0) + (citvOk ? 1 : 0) + (infraccionesOk ? 1 : 0);
  const porcentajeCumplimiento = okCount === 3 ? 100 : okCount === 2 ? 66 : okCount === 1 ? 33 : 0;

  let categoria = 'Riesgoso';
  let porcentajeRiesgo = 95;
  if (okCount === 3) {
    categoria = 'Sin riesgo';
    porcentajeRiesgo = 0;
  } else if (okCount === 2) {
    categoria = 'Riesgo moderado';
    porcentajeRiesgo = 60;
  } else if (okCount === 1) {
    categoria = 'Riesgoso';
    porcentajeRiesgo = 95; // >90% solicitado
  } else {
    categoria = 'Riesgoso';
    porcentajeRiesgo = 99;
  }

  const explicacion = generarExplicacionPilares({
    categoria,
    porcentajeRiesgo,
    porcentajeCumplimiento,
    soatOk,
    citvOk,
    infraccionesOk
  });

  // score se reutiliza como % de riesgo para el PDF (sin mostrar "/100")
  const score = porcentajeRiesgo;

  return { score, porcentajeRiesgo, porcentajeCumplimiento, categoria, explicacion, checks };
}

/**
 * Helper: Parsea fecha de forma segura (reutiliza lógica de renderPdf)
 */
function parseDateSafe(dateStr) {
  if (!dateStr) return null;
  
  const s = String(dateStr).trim();
  if (!s || s === 'N/A' || s === '-' || s === 'null' || s === 'undefined') return null;
  
  // 1) Intentar Date normal
  let d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
    return d;
  }
  
  // 2) DD/MM/YYYY o DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
    if (dd >= 1 && dd <= 31 && mm >= 0 && mm <= 11 && yyyy >= 1900 && yyyy <= 2100) {
      const d2 = new Date(yyyy, mm, dd);
      if (!isNaN(d2.getTime())) return d2;
    }
  }
  
  // 3) YYYY-MM-DD
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
 * Helper: Selecciona certificado CITV principal (reutiliza lógica de renderPdf)
 */
function pickCITVPrincipal(citv, consultaDate) {
  if (!citv || citv.length === 0) return null;
  
  const items = citv
    .map(c => {
      const fin = parseDateSafe(c.fin);
      const inicio = parseDateSafe(c.inicio);
      return { ...c, _fin: fin, _inicio: inicio };
    })
    .filter(c => c._fin || c._inicio);
  
  if (items.length === 0) return citv[citv.length - 1];
  
  // Priorizar: certificado vigente (fin >= consultaDate) más cercano
  const vigentes = items
    .filter(c => c._fin && c._fin >= consultaDate)
    .sort((a, b) => a._fin - b._fin);
  
  if (vigentes.length > 0) {
    return vigentes[0];
  }
  
  // Si no hay vigente, el más recientemente vencido
  const vencidos = items
    .filter(c => c._fin)
    .sort((a, b) => b._fin - a._fin);
  
  return vencidos[0] || citv[citv.length - 1];
}

/**
 * Genera explicación del score
 */
function generarExplicacion(checks, score, categoria) {
  const alertas = checks.filter(c => c.estado === 'alerta');
  const incertidumbres = checks.filter(c => c.estado === 'incertidumbre');
  const warnings = checks.filter(c => c.estado === 'warn');
  const ok = checks.filter(c => c.estado === 'ok');
  
  let texto = '';
  
  if (score === 0) {
    texto = 'Riesgo mínimo. Todos los documentos verificados están en orden.';
  } else if (score <= 30) {
    texto = 'Riesgo bajo. ';
    if (alertas.length > 0) {
      texto += `Se encontraron ${alertas.length} alerta(s) menores.`;
    }
    if (warnings.length > 0) {
      texto += ` ${warnings.length} advertencia(s) por antigüedad o factores menores.`;
    }
    if (incertidumbres.length > 0) {
      texto += ` ${incertidumbres.length} fuente(s) no verificada(s).`;
    }
  } else if (score <= 60) {
    texto = 'Riesgo moderado. ';
    if (alertas.length > 0) {
      texto += `Se encontraron ${alertas.length} alerta(s) que requieren atención.`;
    }
    if (warnings.length > 0) {
      texto += ` ${warnings.length} advertencia(s) adicionales.`;
    }
    if (incertidumbres.length > 0) {
      texto += ` ${incertidumbres.length} fuente(s) no verificada(s) aumentan la incertidumbre.`;
    }
  } else {
    texto = 'Riesgo alto. ';
    if (alertas.length > 0) {
      texto += `Se encontraron ${alertas.length} alerta(s) críticas.`;
    }
    texto += ' Se recomienda revisar todos los documentos y registros antes de proceder.';
  }
  
  return texto;
}

function generarExplicacionPilares(ctx) {
  const faltantes = [];
  if (!ctx.soatOk) faltantes.push('SOAT');
  if (!ctx.citvOk) faltantes.push('CITV');
  if (!ctx.infraccionesOk) faltantes.push('Infracciones');

  if (ctx.categoria === 'Sin riesgo') {
    return 'Sin riesgo. SOAT, CITV y verificación de infracciones se encuentran en orden.';
  }
  if (ctx.categoria === 'Riesgo moderado') {
    return `Riesgo moderado. Falta(n) verificación/condición en: ${faltantes.join(', ')}.`;
  }
  return `Riesgoso. Falta(n) verificación/condición en: ${faltantes.join(', ')}.`;
}

module.exports = {
  calculateRiskScore
};
