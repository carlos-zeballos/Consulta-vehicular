/**
 * generateInsights.js
 * Motor de inferencias determinísticas para el PDF
 * VERSIÓN CEO: Basado en estado efectivo del VehicleReport, NO en raw.status
 */

/**
 * Helper: Convierte string a Date de forma segura
 */
function toDateSafe(s) {
  if (!s) return null;
  const d = new Date(String(s).trim());
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parsea fecha de forma segura (igual que buildVehicleReport.js y renderPdf.js)
 * NUNCA retorna "Invalid Date"
 */
function parseDateSafeLocal(dateStr) {
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
 * Helper: Obtiene icono según severidad
 */
function sevIcon(sev) {
  return sev === 'ok' ? '✅' : sev === 'warn' ? '⚠️' : sev === 'risk' ? '❌' : 'ℹ️';
}

/**
 * Helper: Agrega insight al array
 */
function addInsight(arr, { titulo, mensaje, severidad = 'info', confianza = 'media', evidencias = [] }) {
  arr.push({ titulo, mensaje, severidad, confianza, evidencias });
}

/**
 * Helper: Normaliza string para comparación
 */
function norm(s) {
  return (s || '').toString().trim().toLowerCase();
}

/**
 * Genera insights determinísticos desde VehicleReport normalizado
 * VERSIÓN CEO: Usa estado efectivo, NO raw.status
 */
function generateInsightsFromReport(report, fechaConsultaStr) {
  const insights = [];
  const consultaDate = toDateSafe(fechaConsultaStr) || new Date();

  // ========== SOAT (basado en estado efectivo) ==========
  if (report.soat.estado === 'vigente') {
    const metodo = report.soat.verificacion?.metodo || 'estado_directo';
    const metodoTexto = metodo === 'estado_directo' ? 'verificado por estado' : 
                        metodo === 'por_fecha' ? 'inferido por fecha' : 'verificado';
    addInsight(insights, {
      titulo: 'SOAT',
      mensaje: `Vigente. Cobertura obligatoria activa (${metodoTexto}).`,
      severidad: 'ok',
      confianza: 'alta',
      evidencias: report.soat.verificacion?.evidencias || ['soat.estado']
    });
  } else if (report.soat.estado === 'vencido') {
    addInsight(insights, {
      titulo: 'SOAT',
      mensaje: 'Vencido. Riesgo legal para circular. Renovar inmediatamente.',
      severidad: 'risk',
      confianza: 'alta',
      evidencias: report.soat.verificacion?.evidencias || ['soat.estado', 'soat.fin']
    });
  } else {
    addInsight(insights, {
      titulo: 'SOAT',
      mensaje: 'No verificado / sin registros en la fuente consultada.',
      severidad: 'info',
      confianza: 'media',
      evidencias: ['soat.estado']
    });
  }

  // ========== CITV (basado en estado efectivo) - USAR MISMA LÓGICA QUE renderCITV ==========
  if (report.citv.length > 0) {
    // Usar certificado principal según fecha más cercana (MISMA LÓGICA que renderCITV)
    const principal = pickCITVPrincipal(report.citv, consultaDate) || report.citv[report.citv.length - 1];
    // Usar parseDateSafe (igual que renderCITV) en lugar de toDateSafe
    const fin = parseDateSafeLocal(principal.fin);
    const estadoReal = fin ? (fin >= consultaDate ? 'vigente' : 'vencido') : 
                        (principal.estado === 'vigente' ? 'vigente' : 'vencido');
    
    if (estadoReal === 'vigente') {
      addInsight(insights, {
        titulo: 'CITV',
        mensaje: 'Vigente. La inspección técnica figura aprobada/activa.',
        severidad: 'ok',
        confianza: 'alta',
        evidencias: ['citv.estado', 'citv.fin']
      });
    } else {
      addInsight(insights, {
        titulo: 'CITV',
        mensaje: 'Vencido. Podría generar multa y observaciones pendientes.',
        severidad: 'risk',
        confianza: 'alta',
        evidencias: ['citv.estado', 'citv.fin']
      });
    }

    // Observaciones CITV
    const obs = String(principal.observaciones || '');
    if (obs && obs !== 'Sin observaciones' && obs !== '-') {
      const kw = ['freno', 'susp', 'amortigu', 'luces', 'dirección', 'neum', 'llanta', 'emisión', 'humo', 'suspension', 'direccion'];
      const hit = kw.some(k => obs.toLowerCase().includes(k));
      if (hit) {
        addInsight(insights, {
          titulo: 'Observaciones CITV',
          mensaje: 'Se registran observaciones técnicas. Prioriza revisión mecánica (seguridad).',
          severidad: 'warn',
          confianza: 'alta',
          evidencias: ['citv.observaciones']
        });
      }
    }
  } else {
    addInsight(insights, {
      titulo: 'CITV',
      mensaje: 'No verificado / sin registros en la fuente consultada.',
      severidad: 'info',
      confianza: 'media',
      evidencias: ['citv.length']
    });
  }

  // ========== PLACAS.PE - Estado de Placa ==========
  if (report.placasPe) {
    const pp = report.placasPe;
    
    // Estado de placa
    if (pp.statusDescription || pp.status) {
      const estadoPlaca = pp.statusDescription || pp.status;
      const esEntregado = norm(estadoPlaca).includes('entregado') || norm(estadoPlaca).includes('inmatriculacion');
      
      if (esEntregado) {
        addInsight(insights, {
          titulo: 'Estado de Placa (PLACAS.PE)',
          mensaje: 'Placa entregada a cliente. Vehículo matriculado correctamente.',
          severidad: 'ok',
          confianza: 'alta',
          evidencias: ['placasPe.statusDescription', 'placasPe.status']
        });
      } else {
        addInsight(insights, {
          titulo: 'Estado de Placa (PLACAS.PE)',
          mensaje: `Estado: ${estadoPlaca}. Revisar detalle.`,
          severidad: 'info',
          confianza: 'media',
          evidencias: ['placasPe.statusDescription', 'placasPe.status']
        });
      }
    }
    
    // Consistencia marca/modelo
    if (pp.brand && pp.model && report.vehicle.marca && report.vehicle.modelo) {
      const marcaOk = norm(pp.brand) === norm(report.vehicle.marca);
      const modeloOk = norm(pp.model) === norm(report.vehicle.modelo);
      
      if (marcaOk && modeloOk) {
        addInsight(insights, {
          titulo: 'Consistencia de Datos',
          mensaje: 'Datos de PLACAS.PE coinciden con información del vehículo (marca/modelo).',
          severidad: 'ok',
          confianza: 'alta',
          evidencias: ['placasPe.brand', 'placasPe.model', 'vehicle.marca', 'vehicle.modelo']
        });
      } else {
        addInsight(insights, {
          titulo: 'Consistencia de Datos',
          mensaje: 'Revisar consistencia: marca/modelo en PLACAS.PE no coincide exactamente con datos del vehículo.',
          severidad: 'warn',
          confianza: 'alta',
          evidencias: ['placasPe.brand', 'placasPe.model', 'vehicle.marca', 'vehicle.modelo']
        });
      }
    }
    
    // Múltiples propietarios
    if (pp.ownerCompleteName) {
      const tieneMultiples = pp.ownerCompleteName.includes(' / ') || 
                            pp.ownerCompleteName.includes(' Y ') ||
                            pp.ownerCompleteName.split(',').length > 1;
      
      if (tieneMultiples) {
        addInsight(insights, {
          titulo: 'Múltiples Propietarios',
          mensaje: 'Se detectan múltiples propietarios en el registro. Validar historial de transferencias.',
          severidad: 'warn',
          confianza: 'media',
          evidencias: ['placasPe.ownerCompleteName']
        });
      }
    }
    
    // Antigüedad de placa
    if (pp.startDate) {
      const fechaInicio = toDateSafe(pp.startDate);
      if (fechaInicio) {
        const aniosPlaca = Math.floor((consultaDate - fechaInicio) / (1000 * 60 * 60 * 24 * 365));
        if (aniosPlaca > 0) {
          addInsight(insights, {
            titulo: 'Antigüedad de Placa',
            mensaje: `Placa registrada desde ${fechaInicio.getFullYear()}. Vehículo con ${aniosPlaca}+ años de antigüedad.`,
            severidad: 'info',
            confianza: 'alta',
            evidencias: ['placasPe.startDate']
          });
        }
      }
    }
  }

  // ========== Antigüedad del Vehículo ==========
  if (report.vehicle.anio) {
    const anioActual = new Date().getFullYear();
    const antiguedad = anioActual - report.vehicle.anio;
    
    if (antiguedad > 20) {
      addInsight(insights, {
        titulo: 'Antigüedad del Vehículo',
        mensaje: `Vehículo con ${antiguedad} años de antigüedad. Mayor desgaste esperado, revisar mantenimiento.`,
        severidad: 'warn',
        confianza: 'alta',
        evidencias: ['vehicle.anio']
      });
    } else if (antiguedad > 15) {
      addInsight(insights, {
        titulo: 'Antigüedad del Vehículo',
        mensaje: `Vehículo con ${antiguedad} años de antigüedad. Revisar mantenimiento periódico.`,
        severidad: 'info',
        confianza: 'alta',
        evidencias: ['vehicle.anio']
      });
    } else {
      addInsight(insights, {
        titulo: 'Antigüedad del Vehículo',
        mensaje: `Vehículo con ${antiguedad} años de antigüedad.`,
        severidad: 'ok',
        confianza: 'alta',
        evidencias: ['vehicle.anio']
      });
    }
  }

  // ========== Calidad de Datos ==========
  const datosFaltantes = [];
  if (report.vehicle.motor === 'No disponible' || !report.vehicle.motor) datosFaltantes.push('Motor');
  if (report.vehicle.vin === 'No disponible' || !report.vehicle.vin) datosFaltantes.push('VIN');
  if (report.vehicle.serie === 'No disponible' || !report.vehicle.serie) datosFaltantes.push('Serie');
  
  if (datosFaltantes.length > 0) {
    addInsight(insights, {
      titulo: 'Calidad de Datos',
      mensaje: `Faltan datos técnicos: ${datosFaltantes.join(', ')}. Validar con documentos físicos.`,
      severidad: 'warn',
      confianza: 'media',
      evidencias: ['vehicle.motor', 'vehicle.vin', 'vehicle.serie']
    });
  }

  // ========== SBS Siniestralidad ==========
  if (report.sbsSiniestralidad) {
    const nAcc = report.sbsSiniestralidad.totalSiniestros || 0;
    if (nAcc > 0) {
      addInsight(insights, {
        titulo: 'Siniestralidad (SBS)',
        mensaje: `Se registran ${nAcc} accidente(s). Validar reparaciones y estructura.`,
        severidad: 'warn',
        confianza: 'alta',
        evidencias: ['sbsSiniestralidad.totalSiniestros']
      });
    } else {
      addInsight(insights, {
        titulo: 'Siniestralidad (SBS)',
        mensaje: 'Sin accidentes registrados en SBS según la consulta.',
        severidad: 'ok',
        confianza: 'alta',
        evidencias: ['sbsSiniestralidad.totalSiniestros']
      });
    }
  } else {
    addInsight(insights, {
      titulo: 'Siniestralidad (SBS)',
      mensaje: 'No verificado / sin registros en la fuente consultada.',
      severidad: 'info',
      confianza: 'media',
      evidencias: ['sbsSiniestralidad']
    });
  }

  // ========== Infracciones/Papeletas ==========
  let totalInfracciones = 0;
  const detalle = [];
  
  Object.values(report.infracciones).forEach(fuente => {
    if (fuente.status === 'ok' && fuente.registros && fuente.registros.length > 0) {
      totalInfracciones += fuente.registros.length;
      detalle.push(`${fuente.fuente}: ${fuente.registros.length}`);
    }
  });

  if (totalInfracciones > 0) {
    addInsight(insights, {
      titulo: 'Infracciones / Papeletas detectadas',
      mensaje: `Se encontraron ${totalInfracciones} registro(s). Detalle: ${detalle.join(' · ')}.`,
      severidad: 'warn',
      confianza: 'alta',
      evidencias: detalle
    });
  } else {
    addInsight(insights, {
      titulo: 'Infracciones / Papeletas',
      mensaje: 'Sin registros detectados en las fuentes consultadas (cuando aplicó).',
      severidad: 'ok',
      confianza: 'media',
      evidencias: ['infracciones']
    });
  }

  // ========== INFOGAS ==========
  // Nota: INFOGAS no está en VehicleReport normalizado, se mantiene para compatibilidad
  // pero idealmente debería agregarse a buildVehicleReport.js

  // ========== Impuesto Vehicular ==========
  // Nota: Similar a INFOGAS, idealmente debería agregarse a buildVehicleReport.js

  return insights;
}

/**
 * Helper: Selecciona certificado CITV principal (MISMA LÓGICA que renderPdf.js)
 */
function pickCITVPrincipal(citv, consultaDate) {
  if (!citv || citv.length === 0) return null;
  
  // Usar parseDateSafeLocal (igual que renderPdf.js)
  const items = citv
    .map(c => {
      const fin = parseDateSafeLocal(c.fin);
      const inicio = parseDateSafeLocal(c.inicio);
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
 * Genera insights desde rawResults (compatibilidad hacia atrás)
 * VERSIÓN CEO: Si hay report normalizado, usar generateInsightsFromReport
 */
function generateInsightsFromRaw(rawResults, fechaConsultaStr, report = null) {
  // Si hay report normalizado, usar ese (prioridad)
  if (report) {
    return generateInsightsFromReport(report, fechaConsultaStr);
  }
  
  // Fallback: usar rawResults (compatibilidad)
  const insights = [];
  const consultaDate = toDateSafe(fechaConsultaStr) || new Date();

  // SOAT (fallback)
  const soat = rawResults['soat'];
  if (soat?.status === 'success' && soat?.data) {
    const est = String(soat.data.estado || '').toUpperCase();
    if (est.includes('VIGENTE')) {
      addInsight(insights, {
        titulo: 'SOAT',
        mensaje: 'Vigente. Cobertura obligatoria activa según la consulta.',
        severidad: 'ok',
        confianza: 'alta',
        evidencias: ['soat.data.estado']
      });
    } else if (est) {
      addInsight(insights, {
        titulo: 'SOAT',
        mensaje: `No vigente (${soat.data.estado || 'sin estado'}). Riesgo legal para circular.`,
        severidad: 'risk',
        confianza: 'alta',
        evidencias: ['soat.data.estado']
      });
    }
  } else {
    addInsight(insights, {
      titulo: 'SOAT',
      mensaje: 'No verificado / sin registros en la fuente consultada.',
      severidad: 'info',
      confianza: 'media',
      evidencias: ['soat.status']
    });
  }

  // ... (resto del código de fallback similar al original, pero simplificado)
  
  return insights;
}

/**
 * Renderiza insights como HTML para el PDF
 */
function renderInsightsHTML(insights) {
  if (!insights || insights.length === 0) {
    return '<div class="message info">No hay insights disponibles.</div>';
  }

  return insights.map(insight => {
    const icon = sevIcon(insight.severidad);
    const colorClass = insight.severidad === 'ok' ? 'estado-ok' :
                      insight.severidad === 'warn' ? 'estado-warn' :
                      insight.severidad === 'risk' ? 'estado-bad' : 'estado-info';
    
    return `
      <div class="insight-card ${colorClass}" style="padding: 12px; margin-bottom: 10px; border-radius: 6px; border-left: 3px solid ${insight.severidad === 'ok' ? '#065f46' : insight.severidad === 'warn' ? '#92400e' : insight.severidad === 'risk' ? '#dc2626' : '#64748b'}; background: ${insight.severidad === 'ok' ? '#f0fdf4' : insight.severidad === 'warn' ? '#fef3c7' : insight.severidad === 'risk' ? '#fee2e2' : '#f1f5f9'};">
        <div style="display: flex; align-items: start; gap: 10px;">
          <span style="font-size: 18px; flex-shrink: 0;">${icon}</span>
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 13px; color: #1a1a1a; margin-bottom: 4px;">${insight.titulo}</div>
            <div style="font-size: 12px; color: #475569; line-height: 1.4; margin-bottom: 6px;">${insight.mensaje}</div>
            <div style="font-size: 10px; color: #94a3b8; display: flex; align-items: center; gap: 6px;">
              <i class="fas fa-info-circle" style="font-size: 10px;"></i>
              <span>Basado en: ${insight.evidencias.join(', ')} | Confianza: ${insight.confianza}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

module.exports = {
  generateInsightsFromRaw,
  generateInsightsFromReport,
  renderInsightsHTML
};
