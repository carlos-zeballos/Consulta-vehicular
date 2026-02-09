/**
 * APP.JS - Sistema de Reporte Vehicular
 * PRODUCCIÓN - Solo rutas /api/*, sin tokens en frontend
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURACIÓN DE SECCIONES
  // ============================================
  const SECTIONS = {
    'soat': { title: 'SOAT', icon: '📄' },
    'vehiculo': { title: 'Información del Vehículo', icon: '🚗' },
    'siniestro': { title: 'SBS - Siniestralidad SOAT', icon: '⚠️' },
    'revision': { title: 'Certificados de Inspección Técnica Vehicular', icon: '🔧' },
    'certificado-vehiculo': { title: 'Certificado de lunas polarizadas', icon: '📜' },
    'sutran': { title: 'SUTRAN - Record de Infracciones', icon: '🚨' },
    'sat': { title: 'SAT Lima - Capturas de Vehículos', icon: '🚓' },
    'impuesto-vehicular': { title: 'SAT Lima - Impuesto Vehicular', icon: '🏛️' },
    'arequipa': { title: 'Arequipa - Papeletas', icon: '📋' },
    'piura': { title: 'Piura - Multas de Tránsito', icon: '🚦' },
    'tarapoto': { title: 'Tarapoto - Multas de Tránsito', icon: '🏛️' },
    'chiclayo': { title: 'Chiclayo - Record de Infracciones', icon: '📑' },
    'sat-huancayo': { title: 'SAT Huancayo - Papeletas', icon: '🏔️' },
    'sat-huanuco': { title: 'SAT Huánuco - Papeletas', icon: '⛰️' },
    'sat-ica': { title: 'SAT Ica - Papeletas', icon: '🏖️' },
    'sat-cusco': { title: 'SAT Cusco - Papeletas', icon: '🏛️' },
    'sat-chachapoyas': { title: 'SAT Chachapoyas - Papeletas', icon: '🌲' },
    'sat-cajamarca': { title: 'SAT Cajamarca - Papeletas', icon: '⛪' },
    'sat-trujillo': { title: 'SAT Trujillo - Infracciones', icon: '🏙️' },
    'sat-andahuaylas': { title: 'SAT Andahuaylas - Papeletas', icon: '🏔️' },
    'sat-tacna': { title: 'SAT Tacna - Papeletas', icon: '🌵' },
    'infogas': { title: 'INFOGAS - Información Vehicular', icon: '⛽' },
    'placas-pe': { title: 'Estado de Placa - PLACAS.PE', icon: '🔖' },
    'callao': { title: 'Callao - Papeletas de Infracción', icon: '🚨' },
    'puno': { title: 'Puno - Papeletas (Municipalidad)', icon: '🏔️' },
    'pit-foto': { title: 'PIT - Foto Papeletas (Velocidad)', icon: '📸' }
  };

  // ============================================
  // ENDPOINTS - SOLO RUTAS RELATIVAS /api/*
  // ============================================
  const ENDPOINTS = {
    'soat': '/api/soat',
    'vehiculo': '/api/vehiculo',
    'siniestro': '/api/siniestro',
    'revision': '/api/revision',
    'certificado-vehiculo': '/api/certificado-vehiculo',
    'sutran': '/api/sutran',
    'sat': '/api/sat',
    'impuesto-vehicular': '/api/impuesto-vehicular',
    'arequipa': '/api/arequipa',
    'piura': '/api/piura',
    'tarapoto': '/api/tarapoto',
    'chiclayo': '/api/chiclayo',
    'sat-huancayo': '/api/sat-huancayo',
    'sat-huanuco': '/api/sat-huanuco',
    'sat-ica': '/api/sat-ica',
    'sat-cusco': '/api/sat-cusco',
    'sat-chachapoyas': '/api/sat-chachapoyas',
    'sat-cajamarca': '/api/sat-cajamarca',
    'sat-trujillo': '/api/sat-trujillo',
    'sat-andahuaylas': '/api/sat-andahuaylas',
    'sat-tacna': '/api/sat-tacna',
    'infogas': '/api/infogas',
    'placas-pe': '/api/placas-pe',
    'callao': '/api/callao',
    'puno': '/api/puno',
    'pit-foto': '/api/pit-foto'
  };

  // ============================================
  // UTILIDADES
  // ============================================
  function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate() {
    return new Date().toLocaleString('es-PE', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // ============================================
  // CREAR ESTRUCTURA DEL REPORTE
  // ============================================
  function createReportShell() {
    const grid = document.getElementById('reportGrid');
    if (!grid) return;

    grid.innerHTML = Object.entries(SECTIONS).map(([key, cfg]) => `
      <div id="resultado-${key}" class="section-card" data-key="${key}">
        <div class="section-header" onclick="App.toggle('${key}')">
          <div class="section-title">
            <span class="section-icon">${cfg.icon}</span>
            <span>${escapeHTML(cfg.title)}</span>
          </div>
          <div class="section-meta">
            <span class="section-badge loading">Consultando...</span>
            <span class="toggle-icon">▼</span>
          </div>
        </div>
        <div class="section-body">
          <div class="loading-indicator"></div>
        </div>
      </div>
    `).join('');

    // SAT TRUJILLO: requiere datos (DNI, celular, correo) antes de consultar
    const trujillo = document.getElementById('resultado-sat-trujillo');
    if (trujillo) {
      const badge = trujillo.querySelector('.section-badge');
      const body = trujillo.querySelector('.section-body');

      if (badge) {
        badge.className = 'section-badge empty';
        badge.textContent = 'Requiere datos';
      }

      if (body) {
        body.innerHTML = `
          <div class="message" style="margin-bottom: 12px;">
            <span class="message-icon">📝</span>
            <div>
              <strong>Consulta SAT Trujillo</strong>
              <p>Ingresa DNI, celular y correo. Luego presiona “Buscar”.</p>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:10px;align-items:end;">
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:#64748B;margin-bottom:6px;">DNI</label>
              <input id="sat-trujillo-dni" type="text" inputmode="numeric" maxlength="8" placeholder="Ej: 12345678"
                     style="width:100%;padding:10px 12px;border:1px solid var(--border,#E2E8F0);border-radius:10px;font-weight:600;">
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:#64748B;margin-bottom:6px;">Celular</label>
              <input id="sat-trujillo-celular" type="text" inputmode="numeric" maxlength="9" placeholder="Ej: 999888777"
                     style="width:100%;padding:10px 12px;border:1px solid var(--border,#E2E8F0);border-radius:10px;font-weight:600;">
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:#64748B;margin-bottom:6px;">Correo</label>
              <input id="sat-trujillo-correo" type="email" placeholder="Ej: correo@dominio.com"
                     style="width:100%;padding:10px 12px;border:1px solid var(--border,#E2E8F0);border-radius:10px;font-weight:600;">
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;">
            <button onclick="App.submitSatTrujillo()" class="btn-action" style="background:var(--primary);color:white;border:1px solid transparent;">
              🔍 Buscar (Trujillo)
            </button>
          </div>
          <div id="sat-trujillo-result" style="margin-top:12px;"></div>
        `;
      }
    }
  }

  // ============================================
  // FETCH SEGURO - CONTRATO JSON ÚNICO
  // ============================================
  async function safeFetch(url, placa, captcha = null, options = {}) {
    try {
      const controller = new AbortController();
      
      // Timeout adaptativo: más largo para endpoints con captcha o scraping complejo
      // MTC (revision), SBS (siniestro), Certificado Vehículo, SUTRAN, SAT requieren más tiempo
      // Los nuevos SAT provinciales, INFOGAS y CALLAO también son complejos (requieren CAPTCHA)
      const isComplexEndpoint = url.includes('/api/revision') || 
                                url.includes('/api/siniestro') ||
                                url.includes('/api/certificado-vehiculo') ||
                                url.includes('/api/impuesto-vehicular') ||
                                url.includes('/api/callao') ||
                                url.includes('/api/pit-foto') ||
                                url.includes('/api/sutran') ||
                                url.includes('/api/sat') ||
                                url.includes('/api/arequipa') ||
                                url.includes('/api/piura') ||
                                url.includes('/api/tarapoto') ||
                                url.includes('/api/chiclayo') ||
                                url.includes('/api/infogas') ||
                                url.includes('/api/placas-pe');
      // Complejos 300s, manual 300s, normal 120s
      const timeoutMs = options.useManual ? 300000 : (isComplexEndpoint ? 300000 : 120000); 
      
      const timeout = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      
      const body = { placa };
      if (captcha) body.captcha = captcha;
      if (options.useManual) body.useManual = true;
      
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      clearTimeout(timeout);
      
      // Intentar parsear JSON
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        return { ok: false, status: 'error', message: 'Respuesta no JSON', data: null, _raw: text };
      }
      
      const json = await res.json();
      return json;
      
    } catch (e) {
      if (e.name === 'AbortError') {
        const timeoutMsg = url.includes('/api/sunarp') 
          ? `Tiempo de espera agotado después de 5 minutos. El servicio SUNARP puede estar muy lento. Por favor, intente nuevamente.`
          : 'Tiempo de espera agotado. El servicio puede estar lento o requerir captcha.';
        if (url.includes('/api/sunarp')) {
          console.error(`[FRONTEND-SUNARP] ❌ TIMEOUT: ${timeoutMsg}`);
        }
        return { ok: false, status: 'error', message: timeoutMsg, data: null };
      }
      if (url.includes('/api/sunarp')) {
        console.error(`[FRONTEND-SUNARP] ❌ Error de conexión:`, e.message);
      }
      return { ok: false, status: 'error', message: e.message || 'Error de conexión', data: null };
    }
  }

  // ============================================
  // ANALIZAR RESPUESTA DEL SERVIDOR
  // ============================================
  function analyzeResponse(key, payload) {
    const config = SECTIONS[key] || { title: key };
    
    // 0. MANEJO ESPECIAL PARA PLACAS-PE - DEBE IR PRIMERO, ANTES DE CUALQUIER OTRA VALIDACIÓN
    if (key === 'placas-pe') {
      console.log(`[FRONTEND-PLACAS-PE] Procesando datos`);
      
      // Si hay error
      if (payload?.ok === false || payload?.status === 'error') {
        const errorMsg = payload?.message || 'Error al consultar Estado de Placa';
        return {
          status: 'error',
          content: `
            <div class="message error">
              <span class="message-icon">⚠️</span>
              <div>
                <strong>Error al consultar Estado de Placa</strong>
                <p>${escapeHTML(errorMsg)}</p>
              </div>
            </div>`
        };
      }
      
      // Si hay datos exitosos
      if (payload?.status === 'success' && payload?.data && payload.data.encontrado) {
        const data = payload.data;
        // Verificar si realmente hay datos
        const tieneDatos = data.statusDescription || 
                         data.serialNumber || 
                         data.brand || 
                         data.model || 
                         data.ownerCompleteName || 
                         data.plateNew ||
                         data.deliveryPoint ||
                         data.description ||
                         data.insertDate ||
                         data.startDate;
        
        if (tieneDatos) {
          // IMPORTANTE: Guardar datos originales completos en el DOM para el PDF
          const container = document.getElementById(`resultado-${key}`);
          if (container) {
            container.dataset.originalData = JSON.stringify(payload);
            console.log('[PLACAS-PE] Datos originales guardados en DOM:', payload);
          }
          
          return {
            status: 'success',
            content: createInfoGrid(data, key)
          };
        }
      }
      
      // Si está vacío o no encontrado
      if (payload?.status === 'empty' || !payload?.data || (payload.data && !payload.data.encontrado)) {
        const mensaje = payload?.data?.mensaje || payload?.message || "No se encontró información para esta placa";
        return {
          status: 'empty',
          content: `
            <div class="message empty">
              <span class="message-icon">📭</span>
              <div>
                <strong>Sin resultados</strong>
                <p>${escapeHTML(mensaje)}</p>
              </div>
            </div>`
        };
      }
    }
    
    // 1. MANEJO ESPECIAL PARA SUNARP - DEBE IR DESPUÉS DE PLACAS-PE
    // Esto asegura que siempre se muestre el botón, incluso si hay errores o datos vacíos
    if (key === 'sunarp') {
      console.log(`[FRONTEND-SUNARP] ========== PROCESANDO SUNARP (PRIORIDAD MÁXIMA) ==========`);
      console.log(`[FRONTEND-SUNARP] 🔍 Payload completo:`, JSON.stringify(payload, null, 2));
      console.log(`[FRONTEND-SUNARP] payload existe: ${!!payload}`);
      console.log(`[FRONTEND-SUNARP] payload.ok: ${payload?.ok}`);
      console.log(`[FRONTEND-SUNARP] payload.status: ${payload?.status}`);
      
      const data = payload?.data;
      console.log(`[FRONTEND-SUNARP] data existe: ${!!data}`);
      if (data) {
        console.log(`[FRONTEND-SUNARP] data keys:`, Object.keys(data));
        console.log(`[FRONTEND-SUNARP] data.imagen existe: ${!!data.imagen}`);
        console.log(`[FRONTEND-SUNARP] data.imagen tipo: ${typeof data?.imagen}`);
        console.log(`[FRONTEND-SUNARP] data.imagen longitud: ${data.imagen ? data.imagen.length : 0}`);
        console.log(`[FRONTEND-SUNARP] data.datos existe: ${!!data.datos}`);
        console.log(`[FRONTEND-SUNARP] data.datos:`, data.datos);
        console.log(`[FRONTEND-SUNARP] data.mensaje: ${data.mensaje}`);
      }
      
      // SIEMPRE mostrar el botón, incluso si no hay imagen (para debug)
      const imageId = `sunarp-image-${Date.now()}`;
      const tieneImagen = data && data.imagen && data.imagen.length > 0;
      
      console.log(`[FRONTEND-SUNARP] tieneImagen: ${tieneImagen}`);
      console.log(`[FRONTEND-SUNARP] ✅ SIEMPRE mostrando botón`);
      
      // SIEMPRE mostrar botón - si hay imagen, la muestra; si no, muestra mensaje
      let content = `
        <div class="sunarp-result-container" style="text-align: center; padding: 20px;">
          <div class="sunarp-button-wrapper" style="margin-bottom: 20px;">
            <button onclick="App.mostrarReporteSUNARP('${imageId}')" 
                    class="btn-ver-reporte"
                    style="padding: 15px 30px; background: linear-gradient(135deg, #265977 0%, #1e4a5f 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 16px; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
              📄 Ver Reporte SUNARP
            </button>
            <p style="margin-top: 10px; color: #6C757D; font-size: 12px;">
              ${tieneImagen ? 'Haz clic para ver la captura de pantalla de la consulta vehicular' : '⚠️ No hay imagen disponible - Ver consola para detalles'}
            </p>
          </div>`;
      
      if (tieneImagen) {
        console.log(`[FRONTEND-SUNARP] ✅ Imagen disponible - Tamaño: ${(data.imagen.length / 1024).toFixed(2)} KB`);
        content += `
          <div id="${imageId}" class="sunarp-image-wrapper" style="display: none; margin: 0 auto; max-width: 100%;">
            <img src="${data.imagen}" 
                 alt="Resultado SUNARP - Consulta Vehicular" 
                 class="sunarp-screenshot" 
                 style="max-width: 100%; height: auto; border: 2px solid #265977; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: block; margin: 0 auto;" />
            <button onclick="App.ocultarReporteSUNARP('${imageId}')" 
                    style="margin-top: 15px; padding: 10px 20px; background: #6C757D; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
              Ocultar Reporte
            </button>
          </div>`;
      } else {
        console.log(`[FRONTEND-SUNARP] ⚠️ NO hay imagen disponible`);
        content += `
          <div id="${imageId}" class="sunarp-image-wrapper" style="display: none; margin: 0 auto; max-width: 100%;">
            <div class="message error" style="padding: 20px;">
              <span class="message-icon">⚠️</span>
              <div>
                <strong>Imagen no disponible</strong>
                <p>No se pudo capturar la imagen del reporte SUNARP.</p>
                <p style="font-size: 12px; margin-top: 10px;">Revisa la consola del navegador (F12) para más detalles.</p>
                <p style="font-size: 12px;">Payload recibido: ${payload ? 'Sí' : 'No'}</p>
                <p style="font-size: 12px;">Data recibida: ${data ? 'Sí' : 'No'}</p>
                <p style="font-size: 12px;">Imagen en data: ${data && data.imagen ? 'Sí' : 'No'}</p>
                <p style="font-size: 12px;">Status: ${payload?.status || 'N/A'}</p>
                <p style="font-size: 12px;">OK: ${payload?.ok || 'N/A'}</p>
              </div>
            </div>
          </div>`;
      }
      
      content += `</div>`;
      
      console.log(`[FRONTEND-SUNARP] ✅ Retornando contenido con botón`);
      return {
        status: payload?.status === 'error' ? 'error' : (tieneImagen ? 'success' : 'empty'),
        content: content
      };
    }
    
    // Manejo especial para CALLAO - DEBE IR ANTES DE LAS VERIFICACIONES GENERALES
    if (key === 'callao') {
      console.log(`[FRONTEND-CALLAO] Procesando datos`);
      console.log(`[FRONTEND-CALLAO] payload:`, payload);
      console.log(`[FRONTEND-CALLAO] payload.ok:`, payload?.ok);
      console.log(`[FRONTEND-CALLAO] payload.status:`, payload?.status);
      const data = payload?.data;
      console.log(`[FRONTEND-CALLAO] data:`, data);
      
      // Si hay error, mostrar mensaje específico
      if (payload?.ok === false || payload?.status === 'error') {
        const errorMsg = payload?.message || 'Error al consultar papeletas de Callao';
        return {
          status: 'error',
          content: `
            <div class="message error">
              <span class="message-icon">⚠️</span>
              <div>
                <strong>Error al consultar papeletas de Callao</strong>
                <p>${escapeHTML(errorMsg)}</p>
              </div>
            </div>`
        };
      }
      
      // Si hay datos exitosos
      if (payload?.status === 'success' && data && data.papeletas && Array.isArray(data.papeletas) && data.papeletas.length > 0) {
        console.log(`[FRONTEND-CALLAO] ✅ Papeletas encontradas: ${data.papeletas.length}`);
        // Guardar datos originales para PDF
        const container = document.getElementById(`resultado-${key}`);
        if (container) {
          container.dataset.originalData = JSON.stringify(payload);
          console.log('[CALLAO] Datos originales guardados en DOM:', payload);
        }
        return {
          status: 'warn', // warn porque son papeletas pendientes
          content: createInfoGrid(data, key)
        };
      }
      
      // Si está vacío o no encontrado
      if (payload?.status === 'empty' || !data || (data && !data.encontrado)) {
        const mensaje = data?.mensaje || payload?.message || "Este vehículo no cuenta con papeletas registradas en la Municipalidad del Callao";
        return {
          status: 'success', // success porque no hay papeletas pendientes
          content: `
            <div class="message empty">
              <span class="message-icon">✅</span>
              <div>
                <strong>Sin papeletas pendientes</strong>
                <p>${escapeHTML(mensaje)}</p>
              </div>
            </div>`
        };
      }
    }
    
    // 1. Error del servidor (ok=false, status="error")
    if (!payload || payload.ok === false || payload.status === 'error') {
      const msg = payload?.message || 'Servicio no disponible';
      return {
        status: 'error',
        content: `
          <div class="message error">
            <span class="message-icon">🔌</span>
            <div>
              <strong>Servicio temporalmente no disponible</strong>
              <p>${escapeHTML(msg)}</p>
            </div>
          </div>`
      };
    }

    // 2. Sin datos (ok=true, status="empty")
    // IMPORTANTE: Verificar si data es un array vacío (esto puede pasar con algunos endpoints)
    if (payload.status === 'empty' || !payload.data || (Array.isArray(payload.data) && payload.data.length === 0)) {
      // Si es Callao y tiene mensaje, mostrarlo
      if (key === 'callao' && payload.message) {
        return {
          status: 'success', // success porque no hay papeletas pendientes
          content: `
            <div class="message empty">
              <span class="message-icon">✅</span>
              <div>
                <strong>Sin papeletas pendientes</strong>
                <p>${escapeHTML(payload.message)}</p>
              </div>
            </div>`
        };
      }
      return {
        status: 'empty',
        content: `
          <div class="message empty">
            <span class="message-icon">📭</span>
            <div>
              <strong>Sin información registrada</strong>
              <p>Este vehículo no tiene registros en ${escapeHTML(config.title)}.</p>
            </div>
          </div>`
      };
    }

    const data = payload.data;

    // NOTA: El manejo de SUNARP ya está al PRINCIPIO de la función (línea ~184)
    // para asegurar que siempre se ejecute, incluso si hay errores o datos vacíos

    // 3. Datos encontrados - arrays/tablas
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return {
          status: 'empty',
          content: `
            <div class="message empty">
              <span class="message-icon">✅</span>
              <div>
                <strong>Sin registros pendientes</strong>
                <p>No se encontraron registros en ${escapeHTML(config.title)}.</p>
              </div>
            </div>`
        };
      }
      return {
        status: payload.status === 'warn' ? 'warn' : 'success',
        content: createTable(data, key)
      };
    }

    // 4. Datos encontrados - objeto con campos
    if (typeof data === 'object' && Object.keys(data).length > 0) {
      // Si requiere captcha, manejar de forma especial
      if (payload.status === 'captcha_required') {
        return {
          status: 'loading',
          content: `
            <div class="message">
              <span class="message-icon">🔐</span>
              <div>
                <strong>Captcha requerido</strong>
                <p>Se necesita resolver el captcha para continuar.</p>
              </div>
            </div>`
        };
      }
      
      // Manejo especial para SUTRAN: si tiene infracciones como array, mostrarlas
      if (key === 'sutran') {
        console.log(`[FRONTEND-SUTRAN] Procesando datos de SUTRAN`);
        console.log(`[FRONTEND-SUTRAN] payload.status: ${payload.status}`);
        console.log(`[FRONTEND-SUTRAN] data.infracciones existe: ${!!data.infracciones}`);
        console.log(`[FRONTEND-SUTRAN] data.infracciones es array: ${Array.isArray(data.infracciones)}`);
        console.log(`[FRONTEND-SUTRAN] data.infracciones.length: ${data.infracciones?.length || 0}`);
        
        // Si el payload tiene status "success" y hay infracciones, mostrarlas
        if (payload.status === 'success' && Array.isArray(data.infracciones) && data.infracciones.length > 0) {
          console.log(`[FRONTEND-SUTRAN] ✅ Infracciones encontradas: ${data.infracciones.length}`);
          console.log(`[FRONTEND-SUTRAN] ✅ Mostrando infracciones en tabla`);
          return {
            status: 'success',
            content: createInfoGrid(data, key)
          };
        }
        
        // Si el payload tiene status "empty", mostrar mensaje
        if (payload.status === 'empty') {
          console.log(`[FRONTEND-SUTRAN] ⚠️ Status empty, mostrando mensaje`);
          return {
            status: 'empty',
            content: `
              <div class="message empty">
                <span class="message-icon">📭</span>
                <div>
                  <strong>Sin información registrada</strong>
                  <p>No se encontraron infracciones registradas para esta placa.</p>
                </div>
              </div>`
          };
        }
      }
      
      // Manejo especial para Arequipa: si tiene papeletas como array, mostrarlas
      if (key === 'arequipa') {
        console.log(`[FRONTEND-AREQUIPA] Procesando datos de Arequipa`);
        console.log(`[FRONTEND-AREQUIPA] payload.status: ${payload.status}`);
        console.log(`[FRONTEND-AREQUIPA] data.papeletas existe: ${!!data.papeletas}`);
        console.log(`[FRONTEND-AREQUIPA] data.papeletas es array: ${Array.isArray(data.papeletas)}`);
        console.log(`[FRONTEND-AREQUIPA] data.papeletas.length: ${data.papeletas?.length || 0}`);
        
        // Si el payload tiene status "success" y hay papeletas, mostrarlas
        if (payload.status === 'success' && Array.isArray(data.papeletas) && data.papeletas.length > 0) {
          console.log(`[FRONTEND-AREQUIPA] ✅ Papeletas encontradas: ${data.papeletas.length}`);
          console.log(`[FRONTEND-AREQUIPA] ✅ Mostrando papeletas en tabla`);
          return {
            status: 'warn', // warn porque son papeletas pendientes
            content: createInfoGrid(data, key)
          };
        }
        
        // Si el payload tiene status "empty", mostrar mensaje
        if (payload.status === 'empty') {
          console.log(`[FRONTEND-AREQUIPA] ⚠️ Status empty, mostrando mensaje`);
          return {
            status: 'success', // success porque no hay papeletas pendientes
            content: `
              <div class="message empty">
                <span class="message-icon">✅</span>
                <div>
                  <strong>Sin papeletas pendientes</strong>
                  <p>${data.mensaje || "Este vehículo no cuenta con papeletas registradas en la Municipalidad de Arequipa"}</p>
                </div>
              </div>`
          };
        }
      }
      
      // Manejo especial para Piura: si tiene multas como array, mostrarlas
      if (key === 'piura') {
        console.log(`[FRONTEND-PIURA] Procesando datos de Piura`);
        console.log(`[FRONTEND-PIURA] payload.status: ${payload.status}`);
        console.log(`[FRONTEND-PIURA] data.multas existe: ${!!data.multas}`);
        console.log(`[FRONTEND-PIURA] data.multas es array: ${Array.isArray(data.multas)}`);
        console.log(`[FRONTEND-PIURA] data.multas.length: ${data.multas?.length || 0}`);
        
        // Si el payload tiene status "success" y hay multas, mostrarlas
        if (payload.status === 'success' && Array.isArray(data.multas) && data.multas.length > 0) {
          console.log(`[FRONTEND-PIURA] ✅ Multas encontradas: ${data.multas.length}`);
          console.log(`[FRONTEND-PIURA] ✅ Mostrando multas en tabla`);
          return {
            status: 'warn', // warn porque son multas pendientes
            content: createInfoGrid(data, key)
          };
        }
        
        // Si el payload tiene status "empty", mostrar mensaje
        if (payload.status === 'empty') {
          console.log(`[FRONTEND-PIURA] ⚠️ Status empty, mostrando mensaje`);
          return {
            status: 'success', // success porque no hay multas pendientes
            content: `
              <div class="message empty">
                <span class="message-icon">✅</span>
                <div>
                  <strong>Sin multas pendientes</strong>
                  <p>${data.mensaje || "Este vehículo no cuenta con multas registradas en la Municipalidad de Piura"}</p>
                </div>
              </div>`
          };
        }
      }
      
      // Manejo especial para Tarapoto: si tiene multas como array, mostrarlas
      if (key === 'tarapoto') {
        console.log(`[FRONTEND-TARAPOTO] Procesando datos de Tarapoto`);
        console.log(`[FRONTEND-TARAPOTO] payload.status: ${payload.status}`);
        console.log(`[FRONTEND-TARAPOTO] data.multas existe: ${!!data.multas}`);
        console.log(`[FRONTEND-TARAPOTO] data.multas es array: ${Array.isArray(data.multas)}`);
        console.log(`[FRONTEND-TARAPOTO] data.multas.length: ${data.multas?.length || 0}`);
        
        // Si el payload tiene status "success" y hay multas, mostrarlas
        if (payload.status === 'success' && Array.isArray(data.multas) && data.multas.length > 0) {
          console.log(`[FRONTEND-TARAPOTO] ✅ Multas encontradas: ${data.multas.length}`);
          console.log(`[FRONTEND-TARAPOTO] ✅ Mostrando multas en tabla`);
          return {
            status: 'warn', // warn porque son multas pendientes
            content: createInfoGrid(data, key)
          };
        }
        
        // Si el payload tiene status "empty", mostrar mensaje
        if (payload.status === 'empty') {
          console.log(`[FRONTEND-TARAPOTO] ⚠️ Status empty, mostrando mensaje`);
          return {
            status: 'success', // success porque no hay multas pendientes
            content: `
              <div class="message empty">
                <span class="message-icon">✅</span>
                <div>
                  <strong>Sin multas pendientes</strong>
                  <p>${data.mensaje || "Este vehículo no cuenta con multas registradas en la Municipalidad de Tarapoto"}</p>
                </div>
              </div>`
          };
        }
      }
      
      // Manejo especial para Chiclayo: si tiene infracciones como array, mostrarlas
      if (key === 'chiclayo') {
        console.log(`[FRONTEND-CHICLAYO] Procesando datos de Chiclayo`);
        console.log(`[FRONTEND-CHICLAYO] payload.status: ${payload.status}`);
        console.log(`[FRONTEND-CHICLAYO] data.infracciones existe: ${!!data.infracciones}`);
        console.log(`[FRONTEND-CHICLAYO] data.infracciones es array: ${Array.isArray(data.infracciones)}`);
        console.log(`[FRONTEND-CHICLAYO] data.infracciones.length: ${data.infracciones?.length || 0}`);
        
        // Si el payload tiene status "success" y hay infracciones, mostrarlas
        if (payload.status === 'success' && Array.isArray(data.infracciones) && data.infracciones.length > 0) {
          console.log(`[FRONTEND-CHICLAYO] ✅ Infracciones encontradas: ${data.infracciones.length}`);
          console.log(`[FRONTEND-CHICLAYO] ✅ Mostrando infracciones en tabla`);
          return {
            status: 'warn', // warn porque son infracciones pendientes
            content: createInfoGrid(data, key)
          };
        }
        
        // Si el payload tiene status "empty", mostrar mensaje
        if (payload.status === 'empty') {
          console.log(`[FRONTEND-CHICLAYO] ⚠️ Status empty, mostrando mensaje`);
          return {
            status: 'success', // success porque no hay infracciones pendientes
            content: `
              <div class="message empty">
                <span class="message-icon">✅</span>
                <div>
                  <strong>Sin infracciones pendientes</strong>
                  <p>${data.mensaje || "Este vehículo no cuenta con infracciones registradas en la Municipalidad de Chiclayo"}</p>
                </div>
              </div>`
          };
        }
      }
      
      // Manejo especial para nuevos SAT provinciales con papeletas
      const satPapeletasKeys = ['sat-huancayo', 'sat-huanuco', 'sat-ica', 'sat-cusco', 'sat-chachapoyas', 'sat-andahuaylas', 'sat-tacna'];
      if (satPapeletasKeys.includes(key)) {
        const provinciaName = key.replace('sat-', '').charAt(0).toUpperCase() + key.replace('sat-', '').slice(1);
        console.log(`[FRONTEND-${key.toUpperCase()}] Procesando datos de ${provinciaName}`);
        
        if (payload.status === 'success' && Array.isArray(data.papeletas) && data.papeletas.length > 0) {
          console.log(`[FRONTEND-${key.toUpperCase()}] ✅ Papeletas encontradas: ${data.papeletas.length}`);
          return {
            status: 'warn', // warn porque son papeletas pendientes
            content: createInfoGrid(data, key)
          };
        }
        
        if (payload.status === 'empty') {
          return {
            status: 'success', // success porque no hay papeletas pendientes
            content: `
              <div class="message empty">
                <span class="message-icon">✅</span>
                <div>
                  <strong>Sin papeletas pendientes</strong>
                  <p>${data.mensaje || `Este vehículo no cuenta con papeletas registradas en SAT ${provinciaName}`}</p>
                </div>
              </div>`
          };
        }
      }
      
      // Manejo especial para SAT Cajamarca (puede tener papeletas o multas)
      if (key === 'sat-cajamarca') {
        console.log(`[FRONTEND-SAT-CAJAMARCA] Procesando datos`);
        
        if (payload.status === 'success') {
          const hasData = (Array.isArray(data.papeletas) && data.papeletas.length > 0) ||
                          (Array.isArray(data.multas) && data.multas.length > 0);
          
          if (hasData) {
            return {
              status: 'warn',
              content: createInfoGrid(data, key)
            };
          }
        }
        
        if (payload.status === 'empty') {
          return {
            status: 'success',
            content: `
              <div class="message empty">
                <span class="message-icon">✅</span>
                <div>
                  <strong>Sin registros pendientes</strong>
                  <p>${data.mensaje || "Este vehículo no cuenta con registros en SAT Cajamarca"}</p>
                </div>
              </div>`
          };
        }
      }
      
      // Manejo especial para SAT Trujillo (infracciones)
      if (key === 'sat-trujillo') {
        console.log(`[FRONTEND-SAT-TRUJILLO] Procesando datos`);
        
        if (payload.status === 'success' && Array.isArray(data.infracciones) && data.infracciones.length > 0) {
          console.log(`[FRONTEND-SAT-TRUJILLO] ✅ Infracciones encontradas: ${data.infracciones.length}`);
          return {
            status: 'warn', // warn porque son infracciones pendientes
            content: createInfoGrid(data, key)
          };
        }
        
        if (payload.status === 'empty') {
          return {
            status: 'success',
            content: `
              <div class="message empty">
                <span class="message-icon">✅</span>
                <div>
                  <strong>Sin infracciones pendientes</strong>
                  <p>${data.mensaje || "Este vehículo no cuenta con infracciones registradas en SAT Trujillo"}</p>
                </div>
              </div>`
          };
        }
      }
      
      // Manejo especial para CALLAO
      if (key === 'callao') {
        console.log(`[FRONTEND-CALLAO] Procesando datos`);
        console.log(`[FRONTEND-CALLAO] payload:`, payload);
        console.log(`[FRONTEND-CALLAO] payload.ok:`, payload?.ok);
        console.log(`[FRONTEND-CALLAO] payload.status:`, payload?.status);
        console.log(`[FRONTEND-CALLAO] data:`, data);
        
        // Si hay error, mostrar mensaje específico
        if (payload?.ok === false || payload?.status === 'error') {
          const errorMsg = payload?.message || 'Error al consultar papeletas de Callao';
          return {
            status: 'error',
            content: `
              <div class="message error">
                <span class="message-icon">⚠️</span>
                <div>
                  <strong>Error al consultar papeletas de Callao</strong>
                  <p>${escapeHTML(errorMsg)}</p>
                </div>
              </div>`
          };
        }
        
        // Si hay datos exitosos
        if (payload?.status === 'success' && data && data.papeletas && Array.isArray(data.papeletas) && data.papeletas.length > 0) {
          console.log(`[FRONTEND-CALLAO] ✅ Papeletas encontradas: ${data.papeletas.length}`);
          // Guardar datos originales para PDF
          const container = document.getElementById(`resultado-${key}`);
          if (container) {
            container.dataset.originalData = JSON.stringify(payload);
            console.log('[CALLAO] Datos originales guardados en DOM:', payload);
          }
          return {
            status: 'warn', // warn porque son papeletas pendientes
            content: createInfoGrid(data, key)
          };
        }
        
        // Si está vacío o no encontrado
        if (payload?.status === 'empty' || !data || (data && !data.encontrado)) {
          const mensaje = data?.mensaje || payload?.message || "Este vehículo no cuenta con papeletas registradas en la Municipalidad del Callao";
          return {
            status: 'success', // success porque no hay papeletas pendientes
            content: `
              <div class="message empty">
                <span class="message-icon">✅</span>
                <div>
                  <strong>Sin papeletas pendientes</strong>
                  <p>${escapeHTML(mensaje)}</p>
                </div>
              </div>`
          };
        }
      }
      
      // Manejo especial para INFOGAS
      if (key === 'infogas') {
        console.log(`[FRONTEND-INFOGAS] Procesando datos`);
        console.log(`[FRONTEND-INFOGAS] payload:`, payload);
        console.log(`[FRONTEND-INFOGAS] payload.ok:`, payload?.ok);
        console.log(`[FRONTEND-INFOGAS] payload.status:`, payload?.status);
        console.log(`[FRONTEND-INFOGAS] data:`, data);
        
        // Si hay error, mostrar mensaje específico
        if (payload?.ok === false || payload?.status === 'error') {
          const errorMsg = payload?.message || 'Error al consultar INFOGAS';
          return {
            status: 'error',
            content: `
              <div class="message error">
                <span class="message-icon">⚠️</span>
                <div>
                  <strong>Error al consultar INFOGAS</strong>
                  <p>${escapeHTML(errorMsg)}</p>
                  <p style="font-size: 12px; margin-top: 8px; color: #64748B;">
                    Por favor, intente nuevamente más tarde o verifique que la placa sea correcta.
                  </p>
                </div>
              </div>`
          };
        }
        
        // Si hay datos exitosos
        if (payload?.status === 'success' && data) {
          // Verificar si realmente hay datos
          const tieneDatos = data.vencimientoRevisionAnual || 
                           data.vencimientoCilindro || 
                           data.tieneCredito || 
                           data.habilitadoParaConsumir || 
                           data.tipoCombustible;
          
          if (tieneDatos) {
            return {
              status: 'success',
              content: createInfoGrid(data, key)
            };
          }
        }
        
        // Si está vacío o no encontrado
        if (payload?.status === 'empty' || !data || (data && !data.encontrado && data.mensaje)) {
          const mensaje = data?.mensaje || "Este vehículo no se encuentra registrado en INFOGAS";
          return {
            status: 'empty',
            content: `
              <div class="message empty">
                <span class="message-icon">📭</span>
                <div>
                  <strong>Sin resultados</strong>
                  <p>${escapeHTML(mensaje)}</p>
                </div>
              </div>`
          };
        }
      }

      // Manejo especial para PIT - FOTO PAPELETAS
      if (key === 'pit-foto') {
        console.log(`[FRONTEND-PIT] Procesando datos`);

        if (payload?.ok === false || payload?.status === 'error') {
          const errorMsg = payload?.message || 'Error al consultar PIT';
          return {
            status: 'error',
            content: `
              <div class="message error">
                <span class="message-icon">⚠️</span>
                <div>
                  <strong>Error al consultar PIT - Foto Papeletas</strong>
                  <p>${escapeHTML(errorMsg)}</p>
                </div>
              </div>`
          };
        }

        if (payload?.status === 'success' && data && Array.isArray(data.papeletas) && data.papeletas.length > 0) {
          const container = document.getElementById(`resultado-${key}`);
          if (container) container.dataset.originalData = JSON.stringify(payload);
          return {
            status: 'success',
            content: createInfoGrid(data, key)
          };
        }

        if (payload?.status === 'empty') {
          const mensaje = data?.mensaje || payload?.message || 'Sin registros';
          return {
            status: 'success',
            content: `
              <div class="message empty">
                <span class="message-icon">✅</span>
                <div>
                  <strong>Sin papeletas con evidencia</strong>
                  <p>${escapeHTML(mensaje)}</p>
                </div>
              </div>`
          };
        }
      }
      
      // Fallback: intentar mostrar datos si existen
      if (data && Object.keys(data).length > 0) {
        return {
          status: 'success',
          content: createInfoGrid(data, key)
        };
      }
      
      // NOTA: El manejo de SUNARP ahora está al principio de analyzeResponse (línea ~213)
      // para asegurar que siempre se priorice la imagen sobre los datos
      
      const status = payload.status || determineStatus(key, data);
      return {
        status,
        content: createInfoGrid(data, key)
      };
    }

    // 5. Fallback
    return {
      status: 'empty',
      content: `
        <div class="message empty">
          <span class="message-icon">📭</span>
          <div>
            <strong>Sin información</strong>
            <p>No hay datos disponibles.</p>
          </div>
        </div>`
    };
  }

  // Determinar estado para objetos con datos
  function determineStatus(key, data) {
    if (key === 'soat') {
      return data.estado === 'VIGENTE' ? 'success' : 'warn';
    }
    if (key === 'revision') {
      const resultado = (data.resultado || '').toLowerCase();
      return resultado.includes('aprobado') ? 'success' : 'warn';
    }
    if (key === 'siniestro') {
      return parseInt(data.cantidadAccidentes || 0) > 0 ? 'warn' : 'success';
    }
    if (key === 'sutran') {
      // Si hay infracciones, mostrar como warn (revisar)
      if (data.infracciones && Array.isArray(data.infracciones) && data.infracciones.length > 0) {
        return 'warn';
      }
      return 'success';
    }
    if (key === 'estado-placa') {
      // Verificar si hay datos estructurados
      if (data.estado || data.estado_normalizado) {
        const estado = (data.estado_normalizado || data.estado || '').toUpperCase();
        if (estado.includes('VIGENTE') || estado.includes('ACTIVO')) {
          return 'success';
        } else if (estado.includes('VENCIDO') || estado.includes('INACTIVO')) {
          return 'warn';
        }
      }
      // Si hay datos estructurados, es success
      if (data.placa_delantera || data.placa_posterior || data.estado || data.marca || data.modelo) {
        return 'success';
      }
    }
    return 'success';
  }

  function getStatusText(status, key, data) {
    // Para revisión, mostrar estado específico si está disponible
    if (key === 'revision' && data) {
      const estado = Array.isArray(data) 
        ? (data.find(r => r.tipo_documento === 'ÚLTIMO') || data[0])?.estado
        : data.estado;
      
      if (estado) {
        const estadoUpper = estado.toUpperCase();
        if (estadoUpper === 'VIGENTE') {
          return '✅ VIGENTE';
        } else if (estadoUpper === 'VENCIDO') {
          return '⚠️ VENCIDO';
        }
        return `Estado: ${estado}`;
      }
    }
    
    const texts = {
      'loading': 'Consultando...',
      'success': 'Sin incidencias',
      'warn': 'Revisar',
      'error': 'No disponible',
      'empty': 'Sin registros'
    };
    return texts[status] || status;
  }

  // ============================================
  // RENDERIZAR SECCIÓN
  // ============================================
  function renderSection(key, payload) {
    const container = document.getElementById(`resultado-${key}`);
    if (!container) return;

    const badge = container.querySelector('.section-badge');
    const body = container.querySelector('.section-body');
    
    const result = analyzeResponse(key, payload);

    if (badge) {
      badge.className = `section-badge ${result.status}`;
      badge.textContent = getStatusText(result.status);
    }
    if (body) {
      body.innerHTML = result.content;
    }

    // Guardar SIEMPRE el payload original para PDF (todas las secciones del frontend deben ir al PDF)
    // Esto permite que el backend use rawResults aunque el HTML renderizado sea simplificado.
    try {
      if (payload !== undefined) {
        container.dataset.originalData = JSON.stringify(payload);
      }
    } catch (e) {
      console.warn(`[FRONTEND] No se pudo guardar originalData para ${key}:`, e);
    }
    
    // Logs útiles para secciones complejas
    if (key === 'revision' && payload && payload.data) {
      console.log('[FRONTEND] Datos originales de revision guardados:', payload.data?.length || 'N/A', 'certificados');
    }
    if (key === 'siniestro' && payload) {
      console.log('[FRONTEND] Datos originales de siniestro (SBS) guardados:', {
        tienePolizas: !!(payload.data && payload.data.polizas),
        cantidadPolizas: payload.data?.polizas?.length || 0
      });
    }
    
    // Guardar en localStorage después de renderizar
    setTimeout(() => saveResultsToStorage(), 100);
  }

  // ============================================
  // GENERADORES DE CONTENIDO
  // ============================================
  function createInfoGrid(data, sectionKey) {
    // Separar campos simples de arrays (como polizas)
    const simpleFields = [];
    const arrayFields = [];
    
    // Mapeo de nombres de campos para mejor presentación
    const fieldLabels = {
      'placa_delantera': 'Placa Delantera',
      'placa_posterior': 'Placa Posterior',
      'tercera_placa': 'Tercera Placa',
      'estado': 'Estado',
      'estado_normalizado': 'Estado',
      'punto_entrega': 'Punto de Entrega',
      'fecha_inicio': 'Fecha de Inicio',
      'fecha_entrega': 'Fecha de Entrega',
      'numero_serie': 'N° de Serie',
      'marca': 'Marca',
      'modelo': 'Modelo',
      'propietario': 'Propietario',
      'tipo_uso': 'Tipo de Uso',
      'tipo_solicitud': 'Tipo de Solicitud',
      'placa': 'Placa',
      'tipo_placa': 'Tipo de Placa',
      'fuente': 'Fuente',
      'infracciones': 'Infracciones',
      'numeroDocumento': 'Número de Documento',
      'tipoDocumento': 'Tipo de Documento',
      'fechaDocumento': 'Fecha de Documento',
      'codigoInfraccion': 'Código de Infracción',
      'clasificacion': 'Clasificación',
      'montoTotal': 'Monto Total',
      'numero': 'Número',
      'fecha': 'Fecha',
      'tipo': 'Tipo',
      'estado': 'Estado',
      'observaciones': 'Observaciones',
      'capturas': 'Capturas',
      'multas': 'Multas',
      'papeletas': 'Papeletas',
      'numeroPapeleta': 'N° Papeleta',
      'codigo': 'Código',
      'fechaInfraccion': 'Fecha Infracción',
      'total': 'Total',
      'numeroCuota': 'N° Cuota',
      'infraccion': 'Infracción',
      'infracciones': 'Infracciones',
      'papeletas': 'Papeletas',
      'año': 'Año',
      'anio': 'Año',
      'añoFabricacion': 'Año de Fabricación',
      'añoModelo': 'Año Modelo',
      'color': 'Color',
      'serie': 'Serie',
      'motor': 'Motor',
      'vin': 'VIN',
      'tive': 'TIVE',
      'numeroTive': 'Número de TIVE',
      'propietario': 'Propietario',
      'titular': 'Titular',
      'foto': 'Foto',
      'imagen': 'Imagen',
      'placaAnterior': 'Placa Anterior',
      'categoria': 'Categoría',
      'carroceria': 'Carrocería',
      'combustible': 'Combustible',
      'vencimientoRevisionAnual': 'Vencimiento de Revisión Anual',
      'vencimientoCilindro': 'Vencimiento de Cilindro',
      'tieneCredito': '¿Tiene Crédito?',
      'habilitadoParaConsumir': 'Habilitado para Consumir',
      'tipoCombustible': 'Tipo de Combustible',
      // PIT Foto
      'papeletas': 'Papeletas',
      'documento': 'Documento',
      'totalPagar': 'Total a pagar',
      'falta': 'Falta',
      'licencia': 'Licencia',
      'evidenciaUrl': 'Evidencia (URL)',
      // SAT Capturas
      'capturas': 'Capturas',
      'anio': 'Año',
      'concepto': 'Concepto',
      'placaOriginal': 'Placa Original',
      'referencia': 'Referencia',
      'montoCaptura': 'Monto en Captura',
      'tieneOrden': '¿Tiene orden de captura?',
      'fechaActualizacion': 'Informe actualizado'
    };
    
    Object.entries(data).forEach(([k, v]) => {
      if (k.startsWith('_')) return;
      if (['success', 'error', 'mensaje', 'message', 'ok', 'status'].includes(k)) return;
      
      if (Array.isArray(v) && v.length > 0) {
        arrayFields.push([k, v]);
      } else if (typeof v === 'object' && v !== null) {
        // Objetos anidados se ignoran por ahora
        return;
      } else {
        simpleFields.push([k, v]);
      }
    });
    
    let html = '';
    
    // Ordenar campos para mejor presentación (estado-placa primero)
    simpleFields.sort(([a], [b]) => {
      const priority = ['estado', 'estado_normalizado', 'placa_delantera', 'placa_posterior', 'marca', 'modelo'];
      const aIdx = priority.indexOf(a);
      const bIdx = priority.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });
    
    // Campos simples en tabla compacta Campo/Valor
    if (simpleFields.length > 0) {
      html += `
        <div class="kv-table">
          ${simpleFields.map(([k, v]) => {
        let label = fieldLabels[k];
        if (!label) {
          label = k.replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim();
        }
        
            const valueText = String(v ?? '-');
        
        return `
              <div class="kv-row">
                <div class="kv-key">${escapeHTML(label)}</div>
                <div class="kv-value">${escapeHTML(valueText)}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
    
    // Arrays (como polizas) en tablas
    arrayFields.forEach(([key, arr]) => {
      const label = fieldLabels[key] || key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/\s+/g, ' ').trim();
      html += `<div class="array-section">
        <h4 class="array-title">${escapeHTML(label)}</h4>
        ${createTable(arr)}
      </div>`;
    });
    
    if (!html) {
      return `<div class="message empty"><span class="message-icon">📭</span><div><strong>Sin información detallada</strong></div></div>`;
    }
    
    return html;
  }

  function createTable(rows) {
    if (!rows || !rows.length) return '';
    
    const headers = Object.keys(rows[0]).filter(k => !k.startsWith('_') && k !== 'id');
    if (!headers.length) return '';

    // Mejorar nombres de columnas para mejor legibilidad
    const headerLabels = headers.map(h => {
      const label = h.replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim();
      return label;
    });

    return `
      <div class="table-wrapper">
        <table class="reporte-table">
          <thead>
            <tr>${headerLabels.map(h => `<th>${escapeHTML(h)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>${headers.map(h => {
                const value = row[h];
                // Formatear fechas ISO a formato legible
                let displayValue = String(value || '-');
                if (value && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
                  const date = new Date(value);
                  if (!isNaN(date.getTime())) {
                    displayValue = date.toLocaleDateString('es-PE', { 
                      year: 'numeric', 
                      month: '2-digit', 
                      day: '2-digit' 
                    });
                  }
                }
                return `<td>${escapeHTML(displayValue)}</td>`;
              }).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ============================================
  // EJECUTAR TODAS LAS CONSULTAS
  // ============================================
  async function runAllRequests(placa) {
    const keys = Object.keys(SECTIONS);

    // IMPORTANTE (COSTOS + ESTABILIDAD EN PRODUCCIÓN):
    // Este frontend lanza muchas consultas /api/*.
    // En plataformas tipo Cloud Run eso puede crear muchas instancias en paralelo (más costo).
    // Limitar concurrencia mantiene el costo por "consulta" estable y reduce bloqueos en portales externos.
    const MAX_PARALLEL_REQUESTS = 4;

    async function runPool(items, worker, limit) {
      const executing = new Set();
      const results = [];
      for (const item of items) {
        const p = Promise.resolve().then(() => worker(item));
        results.push(p);
        executing.add(p);
        const clean = () => executing.delete(p);
        p.then(clean).catch(clean);
        if (executing.size >= limit) {
          await Promise.race(executing);
        }
      }
      return Promise.allSettled(results);
    }
    
    // Crear worker para cada endpoint
    const worker = async (key) => {
      const url = ENDPOINTS[key];
      if (!url) {
        renderSection(key, { ok: false, status: 'error', message: 'Endpoint no configurado' });
        return;
      }

      // SAT Trujillo requiere DNI/CELULAR/CORREO: no consultar automáticamente con placa
      if (key === 'sat-trujillo') {
        return;
      }
      
      // MTC requiere captcha, manejar de forma especial
      if (key === 'revision') {
        await handleRevisionWithCaptcha(key, url, placa);
        return;
      }
      
      // SBS: usar directamente safeFetch (el endpoint ya maneja el fallback internamente)
      if (key === 'siniestro') {
        try {
          console.log(`[FRONTEND-SBS] Consultando para placa: ${placa}`);
          const result = await safeFetch(url, placa);
          console.log(`[FRONTEND-SBS] Respuesta recibida:`, {
            ok: result?.ok,
            status: result?.status,
            hasData: !!result?.data,
            message: result?.message
          });
          renderSection(key, result);
        } catch (error) {
          console.error(`[FRONTEND-SBS] Error:`, error);
          renderSection(key, {
            ok: false,
            status: 'error',
            message: error.message || 'Error al consultar SBS'
          });
        }
        return;
      }
      
      // Para SUNARP, mostrar mensaje de progreso
      if (key === 'sunarp') {
        console.log(`[FRONTEND-SUNARP] 🚀 Iniciando consulta SUNARP...`);
        const container = document.getElementById(`resultado-${key}`);
        if (container) {
          const body = container.querySelector('.section-body');
          if (body) {
            body.innerHTML = `
              <div class="message info" style="text-align: center; padding: 20px;">
                <span class="message-icon">⏳</span>
                <div>
                  <strong>Consultando SUNARP...</strong>
                  <p>Esta consulta puede tardar hasta 5 minutos. Por favor, espere...</p>
                  <p style="font-size: 12px; color: #6C757D; margin-top: 10px;">El servicio está procesando su solicitud.</p>
                </div>
              </div>
            `;
          }
        }
      }
      
      const result = await safeFetch(url, placa);
      
      // Log detallado para SUNARP - SIEMPRE mostrar respuesta completa
      if (key === 'sunarp') {
        console.log(`[FRONTEND-SUNARP] ========== RESPUESTA DEL SERVIDOR ==========`);
        console.log(`[FRONTEND-SUNARP] Resultado completo (JSON):`, JSON.stringify(result, null, 2));
        console.log(`[FRONTEND-SUNARP] result.ok: ${result?.ok}`);
        console.log(`[FRONTEND-SUNARP] result.status: ${result?.status}`);
        console.log(`[FRONTEND-SUNARP] result.message: ${result?.message}`);
        console.log(`[FRONTEND-SUNARP] result.data existe: ${!!result?.data}`);
        if (result?.data) {
          console.log(`[FRONTEND-SUNARP] result.data keys:`, Object.keys(result.data));
          console.log(`[FRONTEND-SUNARP] result.data.placa: ${result.data.placa}`);
          console.log(`[FRONTEND-SUNARP] result.data.imagen existe: ${!!result.data.imagen}`);
          console.log(`[FRONTEND-SUNARP] result.data.imagen tipo: ${typeof result.data.imagen}`);
          console.log(`[FRONTEND-SUNARP] result.data.imagen longitud: ${result.data.imagen ? result.data.imagen.length : 0}`);
          if (result.data.imagen) {
            console.log(`[FRONTEND-SUNARP] result.data.imagen primeros 100 chars: ${result.data.imagen.substring(0, 100)}...`);
          }
          console.log(`[FRONTEND-SUNARP] result.data.datos:`, result.data.datos);
          console.log(`[FRONTEND-SUNARP] result.data.mensaje: ${result.data.mensaje}`);
        }
        console.log(`[FRONTEND-SUNARP] ===========================================`);
      }
      
      renderSection(key, result);
    };
    
    // Ejecutar con concurrencia limitada
    await runPool(keys, worker, MAX_PARALLEL_REQUESTS);
  }

  // ============================================
  // MANEJAR SBS (simplificado - el endpoint ya maneja fallback)
  // ============================================
  async function handleSbsWithFallback(key, url, placa) {
    console.log(`[FRONTEND-SBS] Iniciando consulta para: ${placa}`);
    const result = await safeFetch(url, placa);
    console.log(`[FRONTEND-SBS] Respuesta recibida:`, result);
    renderSection(key, result);
  }

  // ============================================
  // MANEJAR REVISIÓN CON CAPTCHA
  // ============================================
  async function handleRevisionWithCaptcha(key, url, placa) {
    const container = document.getElementById(`resultado-${key}`);
    if (!container) return;

    // Primera llamada sin captcha para obtener la imagen
    const firstResult = await safeFetch(url, placa);
    
    // Si requiere captcha, mostrar la imagen
    if (firstResult.status === 'captcha_required' && firstResult.data?.captchaImage) {
      const body = container.querySelector('.section-body');
      const badge = container.querySelector('.section-badge');
      
      if (badge) {
        badge.className = 'section-badge loading';
        badge.textContent = 'Esperando captcha...';
      }
      
      if (body) {
        body.innerHTML = `
          <div class="captcha-container">
            <p>
              <strong>Se requiere resolver el captcha para consultar:</strong>
            </p>
            <div style="margin: 16px 0; text-align: center;">
              <img src="${firstResult.data.captchaImage}" alt="Captcha" 
                   style="border: 2px solid #E0E0E0; border-radius: 8px; padding: 8px; background: white; max-width: 100%; display: block; margin: 0 auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            </div>
            <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
              <input type="text" id="captcha-input-${key}" 
                     placeholder="Ingrese el captcha aquí" 
                     maxlength="10"
                     style="flex: 1; min-width: 200px; padding: 12px; border: 2px solid #E0E0E0; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase;"
                     onkeypress="if(event.key === 'Enter') App.submitCaptcha('${key}', '${placa}')">
              <button onclick="App.submitCaptcha('${key}', '${placa}')" 
                      style="padding: 12px 24px; background: linear-gradient(135deg, #265977 0%, #1e4a5f 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 16px; transition: all 0.3s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                🔍 Consultar
              </button>
            </div>
            <p style="margin-top: 12px; font-size: 12px; color: #6C757D;">
              💡 Ingrese el texto que aparece en la imagen y presione "Consultar"
            </p>
          </div>
        `;
      }
      return;
    }
    
    // Si ya tiene resultado, renderizarlo
    renderSection(key, firstResult);
  }

  // ============================================
  // ENVIAR CAPTCHA RESUELTO
  // ============================================
  async function submitCaptcha(key, placa) {
    const container = document.getElementById(`resultado-${key}`);
    if (!container) return;

    const input = document.getElementById(`captcha-input-${key}`);
    const captcha = input?.value.trim();
    
    if (!captcha) {
      alert('Por favor ingrese el captcha');
      return;
    }

    // Actualizar UI a "Consultando..."
    const body = container.querySelector('.section-body');
    const badge = container.querySelector('.section-badge');
    if (badge) {
      badge.className = 'section-badge loading';
      badge.textContent = 'Consultando...';
    }
    if (body) {
      body.innerHTML = '<div class="loading-indicator"></div>';
    }

    // Consultar con captcha
    try {
      const result = await safeFetch(ENDPOINTS[key], placa, captcha);
      renderSection(key, result);
    } catch (e) {
      renderSection(key, { ok: false, status: 'error', message: e.message || 'Error al consultar' });
    }
  }

  // ============================================
  // FUNCIÓN PRINCIPAL: CONSULTAR
  // ============================================
  async function consultar() {
    const modoPrueba = new URLSearchParams(window.location.search).get('modo') === 'prueba';
    
    if (!modoPrueba && sessionStorage.getItem("yaConsultado")) {
      alert("Solo se permite una consulta por sesión.");
      window.location.href = "index.html";
      return;
    }
    
    if (!modoPrueba) sessionStorage.setItem("yaConsultado", "true");

    const placaInput = document.getElementById("placa");
    const placa = placaInput?.value.trim().toUpperCase();
    if (!placa) {
      alert("Por favor ingrese una placa");
      return;
    }
    
    // Limpiar localStorage anterior
    localStorage.removeItem('consultaVehicular');
    
    // Limpiar localStorage anterior
    localStorage.removeItem('consultaVehicular');

    // Mostrar UI
    const overlay = document.getElementById("overlayCarga");
    const ventana = document.getElementById("ventanaCarga");
    const container = document.getElementById('reportContainer');
    const header = document.getElementById('reportHeader');

    if (overlay) overlay.style.display = "block";
    if (ventana) ventana.style.display = "block";
    if (container) container.style.display = 'block';
    if (header) header.style.display = 'block';

    initializeHeader(placa);
    createReportShell();

    try {
      await runAllRequests(placa);
    } catch (e) {
      console.error('Error general:', e);
    } finally {
      setTimeout(() => {
        if (overlay) overlay.style.display = "none";
        if (ventana) ventana.style.display = "none";
      }, 500);
    }
  }

  // ============================================
  // INICIALIZAR HEADER
  // ============================================
  function initializeHeader(placa) {
    const headerEl = document.getElementById('reportHeader');
    if (!headerEl) return;

    headerEl.innerHTML = `
      <div class="report-header-content">
        <div class="header-main">
          <h1>🚗 Historial del Vehículo</h1>
          <div class="header-info">
            <span class="plate-display">Placa: ${escapeHTML(placa)}</span>
            <span class="date-display">Fecha: ${formatDate()}</span>
          </div>
        </div>
        <div class="header-actions">
          <button id="btn-download-pdf" class="btn-action">📥 Descargar PDF</button>
          <button onclick="App.share()" class="btn-action">📤 Compartir</button>
        </div>
      </div>
    `;
    headerEl.style.display = 'block';
    
    // Asegurar que el botón tenga el evento correcto después de crear el HTML
    setTimeout(() => {
      const btn = document.getElementById('btn-download-pdf');
      if (btn && !btn.hasAttribute('data-listener')) {
        btn.setAttribute('data-listener', 'true');
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (window.App && window.App.downloadPDF) {
            window.App.downloadPDF();
          } else {
            console.error('[PDF] App.downloadPDF no está disponible');
            alert('Error: La función de descarga no está disponible. Por favor, recargue la página.');
          }
        }, { once: false });
      }
    }, 100);
  }

  // ============================================
  // ACCIONES
  // ============================================
  function toggle(key) {
    const container = document.getElementById(`resultado-${key}`);
    if (!container) return;
    
    const body = container.querySelector('.section-body');
    const icon = container.querySelector('.toggle-icon');
    
    if (body) {
      body.classList.toggle('collapsed');
      if (icon) icon.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
    }
  }

  async function downloadPDF() {
    // Prevenir múltiples llamadas simultáneas
    if (window._generatingPDF) {
      console.log('[PDF] Ya se está generando un PDF, ignorando llamada duplicada');
      return;
    }
    window._generatingPDF = true;
    
    // Buscar el botón de descargar PDF
    let pdfButton = document.getElementById('btn-download-pdf') ||
                    document.querySelector('button[onclick*="downloadPDF"]') || 
                    document.querySelector('button[onclick*="App.downloadPDF"]') ||
                    Array.from(document.querySelectorAll('.btn-action')).find(btn => 
                      btn.textContent.includes('Descargar PDF') || btn.textContent.includes('PDF')
                    );
    
    const originalButtonText = pdfButton ? pdfButton.innerHTML : '📥 Descargar PDF';
    
    try {
      // ============================================
      // VALIDACIÓN: Verificar si Trujillo tiene datos
      // ============================================
      const trujilloContainer = document.getElementById('resultado-sat-trujillo');
      let trujilloTieneDatos = false;
      
      if (trujilloContainer) {
        const trujilloBody = trujilloContainer.querySelector('.section-body');
        const trujilloSlot = document.getElementById('sat-trujillo-result');
        
        // Verificar si hay datos consultados (no solo el formulario)
        if (trujilloSlot && trujilloSlot.innerHTML.trim() && 
            !trujilloSlot.innerHTML.includes('sat-trujillo-dni') &&
            !trujilloSlot.innerHTML.includes('Debes ingresar DNI')) {
          // Hay resultados mostrados
          const tieneInfracciones = trujilloSlot.querySelector('table') || 
                                   trujilloSlot.textContent.includes('infracción') ||
                                   trujilloSlot.textContent.includes('No se encontraron');
          trujilloTieneDatos = tieneInfracciones;
        }
        
        // También verificar si hay datos extraídos
        if (trujilloBody) {
          const data = extractDataFromSection(trujilloBody, 'sat-trujillo');
          if (data && (data.infracciones || data.tabla_1)) {
            trujilloTieneDatos = true;
          }
        }
      }
      
      // Si Trujillo no tiene datos, preguntar al usuario
      if (!trujilloTieneDatos) {
        const respuesta = confirm(
          '⚠️ Usted ha llenado todo el formulario?\n\n' +
          'De ser así de aceptar, caso contrario llénelo y vuelva a solicitar PDF.'
        );
        
        if (!respuesta) {
          // Usuario dijo "No" - cerrar y dejar que llene los datos
          console.log('[PDF] Usuario canceló - debe llenar datos de Trujillo primero');
          return;
        }
        // Usuario dijo "Sí" - continuar con la generación (aunque no tenga datos)
      }
      
      // Mostrar indicador de carga
      if (pdfButton) {
        pdfButton.disabled = true;
        pdfButton.innerHTML = '⏳ Generando PDF...';
        pdfButton.style.opacity = '0.7';
        pdfButton.style.cursor = 'wait';
      } else {
        // Si no se encuentra el botón, mostrar alerta
        console.warn('[PDF] Botón no encontrado, continuando con la generación...');
      }
      
      // Recopilar todos los resultados de las secciones
      const resultados = {};
      const placa = document.querySelector('.plate-display')?.textContent.replace('Placa: ', '').trim() || 
                   document.getElementById('placa')?.value.trim().toUpperCase() || '';
      const fechaConsulta = document.querySelector('.date-display')?.textContent.replace('Fecha: ', '').trim() || 
                           new Date().toLocaleString('es-PE');
      
      if (!placa) {
        throw new Error('No se encontró la placa para generar el PDF');
      }
      
      // Recopilar datos de cada sección
      Object.keys(SECTIONS).forEach(key => {
        const container = document.getElementById(`resultado-${key}`);
        if (container) {
          const badge = container.querySelector('.section-badge');
          const body = container.querySelector('.section-body');
          
          if (badge && body) {
            const status = badge.className.includes('success') ? 'success' :
                          badge.className.includes('warn') ? 'warn' :
                          badge.className.includes('error') ? 'error' : 'empty';
            
            // ESPECIAL: Para revision y placas-pe, usar datos originales directamente del DOM
            if ((key === 'revision' || key === 'placas-pe') && container.dataset.originalData) {
              try {
                const originalData = JSON.parse(container.dataset.originalData);
                console.log(`[PDF] Usando datos originales de ${key} del DOM`);
                resultados[key] = originalData; // Usar la estructura completa { ok, source, status, data }
                return; // Salir temprano para revision/placas-pe
              } catch (e) {
                console.warn(`[PDF] Error parseando datos originales de ${key}:`, e);
                // Continuar con extracción normal si falla
              }
            }
            
            // Extraer datos del HTML renderizado para otras secciones
            const data = extractDataFromSection(body, key);
            
            resultados[key] = {
              status: status,
              data: data
            };
          } else if (key === 'sat-trujillo' && !trujilloTieneDatos) {
            // Si Trujillo no tiene datos, marcarlo como empty
            resultados[key] = {
              status: 'empty',
              data: null
            };
          }
        }
      });
      
      console.log('[PDF] Enviando solicitud al servidor...', { placa, secciones: Object.keys(resultados).length });
      
      // Recopilar rawResults (datos originales completos) para insights determinísticos
      const rawResults = {};
      Object.keys(SECTIONS).forEach(key => {
        const container = document.getElementById(`resultado-${key}`);
        if (container && container.dataset.originalData) {
          try {
            rawResults[key] = JSON.parse(container.dataset.originalData);
          } catch (e) {
            console.warn(`[PDF] Error parseando originalData para ${key}:`, e);
          }
        }
      });
      
      // Llamar al endpoint de PDF
      const response = await fetch('/api/generar-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa, fechaConsulta, resultados, rawResults })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PDF] Error del servidor:', response.status, errorText);
        throw new Error(`Error generando PDF: ${response.status} ${errorText.substring(0, 100)}`);
      }
      
      // Descargar el PDF
      const blob = await response.blob();
      
      if (!blob || blob.size === 0) {
        throw new Error('El PDF generado está vacío');
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-vehicular-${placa}.pdf`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // Limpiar después de un breve delay
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      console.log('[PDF] ✅ PDF descargado correctamente');
      
      // Mostrar mensaje de éxito
      if (pdfButton) {
        pdfButton.innerHTML = '✅ PDF Descargado';
        setTimeout(() => {
          pdfButton.innerHTML = originalButtonText;
          pdfButton.disabled = false;
          pdfButton.style.opacity = '1';
          pdfButton.style.cursor = 'pointer';
        }, 2000);
    } else {
        alert('✅ PDF descargado correctamente');
      }
      
    } catch (error) {
      console.error('[PDF] Error generando PDF:', error);
      
      // Restaurar botón
      if (pdfButton) {
        pdfButton.innerHTML = originalButtonText;
        pdfButton.disabled = false;
        pdfButton.style.opacity = '1';
        pdfButton.style.cursor = 'pointer';
      }
      
      alert(`Error al generar el PDF: ${error.message}\n\nPor favor, intente nuevamente.`);
    } finally {
      // Liberar el flag de generación
      window._generatingPDF = false;
    }
  }
  
  // Función auxiliar para extraer datos de una sección
  function extractDataFromSection(bodyElement, key) {
    const data = {};
    
    // Extraer datos de kv-table (campos simples)
    const kvRows = bodyElement.querySelectorAll('.kv-row');
    if (kvRows.length > 0) {
      kvRows.forEach(row => {
        const keyEl = row.querySelector('.kv-key');
        const valueEl = row.querySelector('.kv-value');
        if (keyEl && valueEl) {
          const fieldName = keyEl.textContent.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
          const value = valueEl.textContent.trim();
          if (value && value !== '-' && value !== 'N/A') {
            data[fieldName] = value;
          }
        }
      });
    }
    
    // Extraer datos de tablas (arrays de datos)
    const tables = bodyElement.querySelectorAll('.table-wrapper table, table');
    tables.forEach((table, idx) => {
      const tableData = [];
      const thead = table.querySelector('thead');
      const tbody = table.querySelector('tbody') || table;
      
      // Obtener headers
      const headers = [];
      if (thead) {
        thead.querySelectorAll('th').forEach(th => {
          headers.push(th.textContent.trim());
        });
      } else {
        // Si no hay thead, usar la primera fila como headers
        const firstRow = tbody.querySelector('tr');
        if (firstRow) {
          firstRow.querySelectorAll('td, th').forEach(cell => {
            headers.push(cell.textContent.trim());
          });
        }
      }
      
      // Obtener filas de datos
      const rows = tbody.querySelectorAll('tr');
      rows.forEach((row, rowIdx) => {
        // Si no hay thead y es la primera fila, saltarla (ya la usamos como header)
        if (!thead && rowIdx === 0) return;
        
        const rowData = {};
        const cells = row.querySelectorAll('td, th');
        cells.forEach((cell, cellIdx) => {
          if (headers[cellIdx]) {
            const headerName = headers[cellIdx].toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            const cellValue = cell.textContent.trim();
            if (cellValue && cellValue !== '-' && cellValue !== 'N/A') {
              rowData[headerName] = cellValue;
            }
          }
        });
        if (Object.keys(rowData).length > 0) {
          tableData.push(rowData);
        }
      });
      
      if (tableData.length > 0) {
        // Usar nombre descriptivo según el tipo de tabla
        const tableName = headers[0]?.toLowerCase().includes('numero') || headers[0]?.toLowerCase().includes('papeleta') 
          ? 'papeletas' 
          : headers[0]?.toLowerCase().includes('infraccion') || headers[0]?.toLowerCase().includes('multa')
          ? 'infracciones'
          : headers[0]?.toLowerCase().includes('revision') || headers[0]?.toLowerCase().includes('certificado')
          ? 'certificados'
          : `tabla_${idx + 1}`;
        data[tableName] = tableData;
      }
    });
    
    return Object.keys(data).length > 0 ? data : null;
  }

  function share() {
    const placa = document.querySelector('.plate-display')?.textContent || '';
    const text = `🚗 Consulta Vehicular - Placa: ${placa}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  // ============================================
  // FUNCIONES PARA MOSTRAR/OCULTAR REPORTE SUNARP
  // ============================================
  function mostrarReporteSUNARP(imageId) {
    console.log(`[FRONTEND-SUNARP] 📸 Mostrando reporte SUNARP`);
    const imageWrapper = document.getElementById(imageId);
    if (imageWrapper) {
      const img = imageWrapper.querySelector('img');
      
      // Verificar si hay imagen o solo mensaje de error
      if (img) {
        // Verificar que la imagen tenga src
        if (img.src) {
          console.log(`[FRONTEND-SUNARP] ✅ Imagen encontrada, src: ${img.src.substring(0, 50)}...`);
        } else {
          console.warn(`[FRONTEND-SUNARP] ⚠️ La imagen no tiene src`);
        }
      } else {
        console.log(`[FRONTEND-SUNARP] ℹ️ No hay imagen, mostrando mensaje de error`);
      }
      
      // SIEMPRE mostrar el contenedor, incluso si no hay imagen (mostrará el mensaje de error)
      imageWrapper.style.display = 'block';
      
      // Scroll suave hasta el contenedor
      setTimeout(() => {
        imageWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else {
      console.error(`[FRONTEND-SUNARP] ❌ No se encontró el contenedor con ID: ${imageId}`);
      console.error(`[FRONTEND-SUNARP] 🔍 Buscando contenedores SUNARP en el DOM...`);
      const allSunarpContainers = document.querySelectorAll('[id^="sunarp-image-"]');
      console.log(`[FRONTEND-SUNARP] Contenedores encontrados: ${allSunarpContainers.length}`);
      allSunarpContainers.forEach((container, index) => {
        console.log(`[FRONTEND-SUNARP] Contenedor ${index}: ${container.id}`);
      });
    }
  }

  function ocultarReporteSUNARP(imageId) {
    console.log(`[FRONTEND-SUNARP] 👁️ Ocultando reporte SUNARP`);
    const imageWrapper = document.getElementById(imageId);
    if (imageWrapper) {
      imageWrapper.style.display = 'none';
    }
  }

  // ============================================
  // API PÚBLICA
  // ============================================
  // ============================================
  // PERSISTENCIA CON LOCALSTORAGE
  // ============================================
  function saveResultsToStorage() {
    try {
      const placa = document.querySelector('.plate-display')?.textContent.replace('Placa: ', '').trim() || 
                   document.getElementById('placa')?.value.trim().toUpperCase() || '';
      
      if (!placa) return;
      
      const resultados = {};
      const fechaConsulta = document.querySelector('.date-display')?.textContent.replace('Fecha: ', '').trim() || 
                           new Date().toLocaleString('es-PE');
      
      // Recopilar todos los resultados
      Object.keys(SECTIONS).forEach(key => {
        const container = document.getElementById(`resultado-${key}`);
        if (container) {
          const badge = container.querySelector('.section-badge');
          const body = container.querySelector('.section-body');
          
          if (badge && body) {
            const status = badge.className.includes('success') ? 'success' :
                          badge.className.includes('warn') ? 'warn' :
                          badge.className.includes('error') ? 'error' : 'empty';
            
            resultados[key] = {
              status: status,
              content: body.innerHTML,
              badgeText: badge.textContent
            };
          }
        }
      });
      
      const dataToSave = {
        placa: placa,
        fechaConsulta: fechaConsulta,
        resultados: resultados,
        timestamp: new Date().toISOString()
      };
      
      localStorage.setItem('consultaVehicular', JSON.stringify(dataToSave));
      console.log('[PERSISTENCIA] Datos guardados en localStorage');
    } catch (error) {
      console.error('[PERSISTENCIA] Error guardando:', error);
    }
  }
  
  function restoreResultsFromStorage() {
    try {
      const saved = localStorage.getItem('consultaVehicular');
      if (!saved) return false;
      
      const data = JSON.parse(saved);
      const placa = data.placa;
      
      if (!placa) return false;
      
      // Restaurar placa en el input
      const placaInput = document.getElementById('placa');
      if (placaInput) {
        placaInput.value = placa;
      }
      
      // Mostrar header
      initializeHeader(placa);
      
      // Crear estructura de reporte
      createReportShell();
      
      // Restaurar cada sección
      Object.entries(data.resultados || {}).forEach(([key, resultado]) => {
        const container = document.getElementById(`resultado-${key}`);
        if (container) {
          const badge = container.querySelector('.section-badge');
          const body = container.querySelector('.section-body');
          
          if (badge) {
            badge.className = `section-badge ${resultado.status}`;
            badge.textContent = resultado.badgeText || getStatusText(resultado.status);
          }
          if (body) {
            body.innerHTML = resultado.content || '';
          }
        }
      });
      
      // Mostrar contenedor
      const reportContainer = document.getElementById('reportContainer');
      if (reportContainer) {
        reportContainer.style.display = 'block';
      }
      
      console.log('[PERSISTENCIA] Datos restaurados desde localStorage');
      return true;
    } catch (error) {
      console.error('[PERSISTENCIA] Error restaurando:', error);
      return false;
    }
  }
  
  function cerrarConsulta() {
    const mensaje = 'Una vez se salga perderá su consulta. ¿Está seguro de cerrar?';
    if (confirm(mensaje)) {
      localStorage.removeItem('consultaVehicular');
      window.location.href = 'result.html';
    }
  }

  window.App = {
    consultar,
    toggle,
    downloadPDF,
    share,
    createShell: createReportShell,
    render: renderSection,
    submitCaptcha,
    mostrarReporteSUNARP,
    ocultarReporteSUNARP,
    cerrarConsulta,
    restoreResults: restoreResultsFromStorage,
    submitSatTrujillo: async function submitSatTrujillo() {
      const dni = document.getElementById('sat-trujillo-dni')?.value?.trim();
      const celular = document.getElementById('sat-trujillo-celular')?.value?.trim();
      const correo = document.getElementById('sat-trujillo-correo')?.value?.trim();

      const container = document.getElementById('resultado-sat-trujillo');
      const badge = container?.querySelector('.section-badge');
      const slot = document.getElementById('sat-trujillo-result');

      if (!dni || !celular || !correo) {
        if (slot) {
          slot.innerHTML = `
            <div class="message error">
              <span class="message-icon">⚠️</span>
              <div>
                <strong>Datos incompletos</strong>
                <p>Debes ingresar DNI, celular y correo para consultar Trujillo.</p>
              </div>
            </div>
          `;
        }
        return;
      }

      if (badge) {
        badge.className = 'section-badge loading';
        badge.textContent = 'Consultando...';
      }
      if (slot) slot.innerHTML = '<div class="loading-indicator"></div>';

      try {
        const res = await fetch(ENDPOINTS['sat-trujillo'], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dni, celular, correo })
        });

        const contentType = res.headers.get('content-type') || '';
        const payload = contentType.includes('application/json') ? await res.json() : { ok: false, status: 'error', message: await res.text(), data: null };

        // Renderizar SIN destruir el formulario: usar analyzeResponse y pintar solo el slot
        const result = analyzeResponse('sat-trujillo', payload);
        if (badge) {
          badge.className = `section-badge ${result.status}`;
          badge.textContent = getStatusText(result.status, 'sat-trujillo', payload?.data);
        }
        if (slot) slot.innerHTML = result.content;
      } catch (e) {
        if (badge) {
          badge.className = 'section-badge error';
          badge.textContent = 'No disponible';
        }
        if (slot) {
          slot.innerHTML = `
            <div class="message error">
              <span class="message-icon">🔌</span>
              <div>
                <strong>Error consultando Trujillo</strong>
                <p>${escapeHTML(e.message || 'Error de conexión')}</p>
              </div>
            </div>
          `;
        }
      }
    }
  };

  window.consultar = consultar;
  window.setupReportShell = createReportShell;
  window.renderSectionFromJSON = renderSection;
  window.initializeReportHeader = initializeHeader;

})();
