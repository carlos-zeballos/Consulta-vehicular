/**
 * MOCK DATA - Datos de prueba para desarrollo
 * Simula respuestas del backend con contrato JSON único
 */

const MOCK_DATA = {
  soat: {
    ok: true,
    source: "soat",
    status: "success",
    data: {
      placa: 'ABC-123',
      nombre_compania: 'Rímac Seguros',
      fecha_inicio: '2024-01-15',
      fecha_fin: '2025-01-15',
      estado: 'VIGENTE',
      numero_poliza: 'POL-2024-789456',
      uso: 'PARTICULAR'
    }
  },
  
  vehiculo: {
    ok: true,
    source: "vehiculo",
    status: "success",
    data: {
      placa: 'ABC-123',
      marca: 'Toyota',
      modelo: 'Corolla',
      color: 'Blanco',
      serie: 'JT2BG12K1V0123456',
      motor: '2ZR-FE',
      vin: 'JT2BG12K1V0123456',
      anio_fabricacion: '2020',
      clase: 'AUTOMOVIL',
      combustible: 'GASOLINA'
    }
  },
  
  revision: {
    ok: true,
    source: "revision",
    status: "success",
    data: {
      placa: 'ABC-123',
      certificado: 'CRT-2024-001234',
      fechaRevision: '2024-06-15',
      fechaVencimiento: '2025-06-15',
      resultado: 'APROBADO',
      planta: 'LIDERCON S.A.C.'
    }
  },
  
  siniestro: {
    ok: true,
    source: "siniestro",
    status: "success",
    data: {
      placa: 'ABC-123',
      fechaConsulta: new Date().toLocaleDateString('es-PE'),
      actualizadoA: '2024-12-01',
      cantidadAccidentes: '0'
    }
  },
  
  sutran: {
    ok: true,
    source: "sutran",
    status: "success",
    data: {
      mensaje: 'No se encontraron infracciones pendientes en SUTRAN.'
    }
  },
  
  'orden-captura': {
    ok: true,
    source: "orden-captura",
    status: "empty",
    data: null,
    message: "Sin órdenes de captura"
  },
  
  impuesto: {
    ok: true,
    source: "impuesto",
    status: "empty",
    data: null
  },
  
  infogas: {
    ok: true,
    source: "infogas",
    status: "empty",
    data: null
  },
  
  atu: {
    ok: true,
    source: "atu",
    status: "empty",
    data: null,
    message: "Placa no registrada en ATU"
  },
  
  lima: {
    ok: true,
    source: "lima",
    status: "warn",
    data: [
      { Placa: 'ABC-123', Documento: 'PAP-2024-001', FechaInfraccion: '2024-03-15', Importe: 'S/ 450.00', Estado: 'Pendiente', Falta: 'Estacionamiento prohibido' },
      { Placa: 'ABC-123', Documento: 'PAP-2024-002', FechaInfraccion: '2024-05-20', Importe: 'S/ 220.00', Estado: 'Pendiente', Falta: 'Luz roja' }
    ]
  },
  
  callao: { ok: true, source: "callao", status: "empty", data: null },
  arequipa: { ok: true, source: "arequipa", status: "empty", data: null },
  huancayo: { ok: true, source: "huancayo", status: "empty", data: null },
  tarapoto: { ok: true, source: "tarapoto", status: "empty", data: null },
  tacna: { ok: true, source: "tacna", status: "empty", data: null },
  chiclayo: { ok: true, source: "chiclayo", status: "empty", data: null },
  huanuco: { ok: true, source: "huanuco", status: "empty", data: null },
  chachapoyas: { ok: true, source: "chachapoyas", status: "empty", data: null },
  cajamarca: { ok: true, source: "cajamarca", status: "empty", data: null },
  cusco: { ok: true, source: "cusco", status: "empty", data: null },
  ica: { ok: true, source: "ica", status: "empty", data: null },
  andahuaylas: { ok: true, source: "andahuaylas", status: "empty", data: null },
  puno: { ok: true, source: "puno", status: "empty", data: null },
  pucallpa: { ok: true, source: "pucallpa", status: "empty", data: null }
};

/**
 * Ejecutar consulta con mock data
 */
function runMockQuery(placa) {
  // Actualizar placa en mock data
  Object.values(MOCK_DATA).forEach(item => {
    if (item && item.data && typeof item.data === 'object' && !Array.isArray(item.data)) {
      if ('placa' in item.data) item.data.placa = placa;
    }
    if (item && Array.isArray(item.data)) {
      item.data.forEach(row => {
        if ('Placa' in row) row.Placa = placa;
        if ('placa' in row) row.placa = placa;
      });
    }
  });

  // Mostrar containers
  const container = document.getElementById('reportContainer');
  const header = document.getElementById('reportHeader');
  if (container) container.style.display = 'block';
  if (header) header.style.display = 'block';

  // Inicializar header
  if (window.initializeReportHeader) {
    window.initializeReportHeader(placa);
  }

  // Crear shell
  if (window.App && window.App.createShell) {
    window.App.createShell();
  }

  // Renderizar cada sección con delay para simular carga
  const keys = Object.keys(MOCK_DATA);
  keys.forEach((key, i) => {
    setTimeout(() => {
      if (window.App && window.App.render) {
        window.App.render(key, MOCK_DATA[key]);
      }
    }, 100 + i * 60);
  });
}

// Exponer globalmente
window.runMockQuery = runMockQuery;
window.MOCK_DATA = MOCK_DATA;
