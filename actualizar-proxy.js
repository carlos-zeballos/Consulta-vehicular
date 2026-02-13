/**
 * Script para actualizar FORZADAMENTE las variables de proxy en .env
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

// Nueva configuración de proxy (North America + Perú + Sesión específica)
// IMPORTANTE: Usar puerto 2334 para HTTP proxy (2333 es para SOCKS5)
const nuevaConfig = {
  MTC_PROXY_HOST: 'na.proxy.2captcha.com',
  MTC_PROXY_PORT: '2334', // Puerto 2334 para HTTP proxy (confirmado que funciona con axios)
  MTC_PROXY_USER: 'uae12c98557ca05dd-zone-custom-region-pe-session-dDCuqxdzZ-sessTime-3',
  MTC_PROXY_PASS: 'uae12c98557ca05dd',
  MTC_PROXY_URL: 'http://uae12c98557ca05dd-zone-custom-region-pe-session-dDCuqxdzZ-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334'
};

// Leer .env existente
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

const lines = envContent.split('\n');
const newLines = [];
const keysToUpdate = new Set(Object.keys(nuevaConfig));

// Procesar líneas existentes
for (const line of lines) {
  const trimmed = line.trim();
  
  // Mantener comentarios y líneas vacías
  if (!trimmed || trimmed.startsWith('#')) {
    newLines.push(line);
    continue;
  }
  
  const match = trimmed.match(/^([^=]+)=/);
  if (match) {
    const key = match[1].trim();
    
    // Si es una clave que queremos actualizar, reemplazarla
    if (keysToUpdate.has(key)) {
      newLines.push(`${key}=${nuevaConfig[key]}`);
      keysToUpdate.delete(key); // Marcar como procesada
    } else {
      // Mantener otras variables
      newLines.push(line);
    }
  } else {
    newLines.push(line);
  }
}

// Agregar nuevas variables que no existían
if (keysToUpdate.size > 0) {
  newLines.push('');
  newLines.push('# 2CAPTCHA PROXY - Configuración actualizada');
  for (const key of keysToUpdate) {
    newLines.push(`${key}=${nuevaConfig[key]}`);
  }
}

// Escribir .env actualizado
fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');

console.log('✅ Proxy actualizado FORZADAMENTE en .env:');
console.log('');
console.log(`  MTC_PROXY_HOST=${nuevaConfig.MTC_PROXY_HOST}`);
console.log(`  MTC_PROXY_PORT=${nuevaConfig.MTC_PROXY_PORT}`);
console.log(`  MTC_PROXY_USER=${nuevaConfig.MTC_PROXY_USER}`);
console.log(`  MTC_PROXY_PASS=***`);
console.log(`  MTC_PROXY_URL=${nuevaConfig.MTC_PROXY_URL.replace(/:[^:@]+@/, ':***@')}`);
console.log('');
console.log('⚠️  Reinicia el servidor o recarga las variables de entorno');
