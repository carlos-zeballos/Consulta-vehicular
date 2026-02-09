/**
 * emisionesLookup.js
 * Lookup determinístico de impacto ambiental por marca/modelo/año/combustible
 * NO inventa datos - solo retorna si hay match en la tabla
 */

/**
 * Tabla de emisiones estimadas por marca/modelo común
 * Basado en datos públicos de clasificación vehicular
 */
const EMISIONES_TABLE = {
  // Toyota
  'toyota': {
    'corolla': { bajo: 2010, medio: 2000, alto: 1990 },
    'hilux': { bajo: 2015, medio: 2010, alto: 2005 },
    'yaris': { bajo: 2012, medio: 2008, alto: 2005 },
    'default': { bajo: 2010, medio: 2005, alto: 2000 }
  },
  // Nissan
  'nissan': {
    'sentra': { bajo: 2010, medio: 2005, alto: 2000 },
    'versa': { bajo: 2012, medio: 2008, alto: 2005 },
    'frontier': { bajo: 2015, medio: 2010, alto: 2005 },
    'default': { bajo: 2010, medio: 2005, alto: 2000 }
  },
  // Hyundai
  'hyundai': {
    'accent': { bajo: 2012, medio: 2008, alto: 2005 },
    'tucson': { bajo: 2015, medio: 2010, alto: 2005 },
    'default': { bajo: 2012, medio: 2008, alto: 2005 }
  },
  // Chevrolet
  'chevrolet': {
    'spark': { bajo: 2012, medio: 2008, alto: 2005 },
    'aveo': { bajo: 2010, medio: 2005, alto: 2000 },
    'default': { bajo: 2010, medio: 2005, alto: 2000 }
  },
  // Kia
  'kia': {
    'rio': { bajo: 2012, medio: 2008, alto: 2005 },
    'sportage': { bajo: 2015, medio: 2010, alto: 2005 },
    'default': { bajo: 2012, medio: 2008, alto: 2005 }
  }
};

/**
 * Determina impacto ambiental estimado por combustible
 */
function getEmisionesPorCombustible(combustible, anio) {
  if (!combustible || !anio) return null;
  
  const comb = String(combustible).toLowerCase();
  const year = Number(anio);
  
  if (isNaN(year) || year < 1990 || year > 2030) return null;
  
  // GNV/GLP: generalmente más limpio
  if (comb.includes('gnv') || comb.includes('glp') || comb.includes('gas natural')) {
    if (year >= 2010) return { nivel: 'Bajo', nota: 'Combustible alternativo con menor emisión de CO2' };
    if (year >= 2005) return { nivel: 'Medio', nota: 'Combustible alternativo, tecnología anterior' };
    return { nivel: 'Medio-Alto', nota: 'Combustible alternativo pero vehículo antiguo' };
  }
  
  // Gasolina
  if (comb.includes('gasolina') || comb.includes('petrol')) {
    if (year >= 2015) return { nivel: 'Medio', nota: 'Gasolina, tecnología Euro 5/6' };
    if (year >= 2010) return { nivel: 'Medio-Alto', nota: 'Gasolina, tecnología Euro 4' };
    if (year >= 2005) return { nivel: 'Alto', nota: 'Gasolina, tecnología anterior a Euro 4' };
    return { nivel: 'Alto', nota: 'Gasolina, vehículo antiguo sin control de emisiones' };
  }
  
  // Diesel
  if (comb.includes('diesel') || comb.includes('diésel')) {
    if (year >= 2015) return { nivel: 'Medio', nota: 'Diesel, tecnología Euro 5/6' };
    if (year >= 2010) return { nivel: 'Medio-Alto', nota: 'Diesel, tecnología Euro 4' };
    return { nivel: 'Alto', nota: 'Diesel, tecnología anterior (mayor emisión de partículas)' };
  }
  
  return null;
}

/**
 * Obtiene emisiones estimadas por marca/modelo/año
 */
function getEmisionesPorMarcaModelo(marca, modelo, anio) {
  if (!marca || !anio) return null;
  
  const marcaKey = String(marca).toLowerCase().trim();
  const modeloKey = modelo ? String(modelo).toLowerCase().trim() : 'default';
  const year = Number(anio);
  
  if (isNaN(year) || year < 1990 || year > 2030) return null;
  
  const marcaData = EMISIONES_TABLE[marcaKey];
  if (!marcaData) return null;
  
  const modeloData = marcaData[modeloKey] || marcaData['default'];
  if (!modeloData) return null;
  
  let nivel = 'Alto';
  if (year >= modeloData.bajo) {
    nivel = 'Bajo';
  } else if (year >= modeloData.medio) {
    nivel = 'Medio';
  } else if (year >= modeloData.alto) {
    nivel = 'Medio-Alto';
  }
  
  return {
    nivel,
    nota: `Estimado según año de fabricación (${year}) y modelo ${marca} ${modelo || ''}`.trim()
  };
}

/**
 * Función principal: obtiene impacto ambiental estimado
 * Prioriza: combustible > marca/modelo > null
 */
function getEmisionesEstimadas(vehicle, infogas) {
  // 1. Intentar por combustible (INFOGAS o vehículo)
  const combustible = infogas?.tipoCombustible || vehicle?.combustible || vehicle?.tipoCombustible;
  if (combustible) {
    const porCombustible = getEmisionesPorCombustible(combustible, vehicle?.anio);
    if (porCombustible) return porCombustible;
  }
  
  // 2. Intentar por marca/modelo/año
  if (vehicle?.marca && vehicle?.anio) {
    const porMarca = getEmisionesPorMarcaModelo(vehicle.marca, vehicle.modelo, vehicle.anio);
    if (porMarca) return porMarca;
  }
  
  // 3. Si no hay match, retornar null (no disponible)
  return null;
}

module.exports = {
  getEmisionesEstimadas,
  getEmisionesPorCombustible,
  getEmisionesPorMarcaModelo
};
