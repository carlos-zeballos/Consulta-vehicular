/**
 * Script para configurar variables de entorno para producción
 * Ejecutar: node configurar-produccion.js
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

// Configuración de producción
const config = {
  BASE_URL: 'https://consultavehicular.services',
  PUBLIC_BASE_URL: 'https://consultavehicular.services',
  PORT: '8080',
  // 2CAPTCHA PROXY (HTTP Proxy with Basic Auth) - Variables separadas para Playwright
  // Configuración con región Perú (Europe server) - RECOMENDADO PARA MTC
  MTC_PROXY_HOST: 'eu.proxy.2captcha.com',
  MTC_PROXY_PORT: '2333',
  MTC_PROXY_USER: 'uae12c98557ca05dd-zone-custom-region-pe',
  MTC_PROXY_PASS: 'uae12c98557ca05dd',
  // Proxy URL completa (útil para axios y requests)
  MTC_PROXY_URL: 'http://uae12c98557ca05dd-zone-custom-region-pe:uae12c98557ca05dd@eu.proxy.2captcha.com:2333',
  CAPTCHA_API_KEY: 'dd23c370d7192bfb0d8cb37188918abe'
};

// Leer .env existente si existe
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

// Actualizar o agregar variables
const lines = envContent.split('\n');
const newLines = [];
const existingKeys = new Set();

// Procesar líneas existentes
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    newLines.push(line);
    continue;
  }
  
  const match = trimmed.match(/^([^=]+)=/);
  if (match) {
    const key = match[1].trim();
    existingKeys.add(key);
    
    // Actualizar si existe en config
    if (config[key] !== undefined) {
      newLines.push(`${key}=${config[key]}`);
      delete config[key];
    } else {
      newLines.push(line);
    }
  } else {
    newLines.push(line);
  }
}

// Agregar nuevas variables
if (Object.keys(config).length > 0) {
  newLines.push('');
  newLines.push('# Configuración de Producción');
  for (const [key, value] of Object.entries(config)) {
    newLines.push(`${key}=${value}`);
  }
}

// Escribir .env actualizado
fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');

console.log('✅ Configuración de producción aplicada:');
console.log('');
console.log('  BASE_URL=https://consultavehicular.services');
console.log('  MTC_PROXY_HOST=na.proxy.2captcha.com');
console.log('  MTC_PROXY_PORT=2333');
console.log('  MTC_PROXY_USER=uae12c98557ca05dd-zone-custom');
console.log('  MTC_PROXY_PASS=***');
console.log('  MTC_PROXY_URL=http://uae12c98557ca05dd-zone-custom:***@na.proxy.2captcha.com:2333');
console.log('  CAPTCHA_API_KEY=dd23c370d7192bfb0d8cb37188918abe');
console.log('');
console.log('⚠️  IMPORTANTE: Reinicia el servidor para aplicar los cambios');
