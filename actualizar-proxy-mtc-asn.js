/**
 * Script para actualizar configuración de proxy MTC con ASN específico
 * Ejecutar: node actualizar-proxy-mtc-asn.js
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

// Nueva configuración de proxy MTC con ASN AS6147 (Telefónica del Perú)
const newProxyConfig = {
  MTC_PROXY_HOST: 'na.proxy.2captcha.com',
  MTC_PROXY_PORT: '2333',
  MTC_PROXY_USER: 'uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-JdPGgGF15-sessTime-3',
  MTC_PROXY_PASS: 'uae12c98557ca05dd',
  // Proxy URL completa (útil para axios y requests)
  MTC_PROXY_URL: 'http://uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-JdPGgGF15-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2333'
};

console.log('🔧 Actualizando configuración de proxy MTC...');
console.log('');
console.log('Nueva configuración:');
console.log(`  Host: ${newProxyConfig.MTC_PROXY_HOST}`);
console.log(`  Port: ${newProxyConfig.MTC_PROXY_PORT}`);
console.log(`  User: ${newProxyConfig.MTC_PROXY_USER.substring(0, 30)}...`);
console.log(`  Pass: ${newProxyConfig.MTC_PROXY_PASS}`);
console.log('');

// Leer .env existente si existe
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  console.log('✅ Archivo .env encontrado');
} else {
  console.log('⚠️  Archivo .env no existe, se creará uno nuevo');
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
    if (newProxyConfig[key] !== undefined) {
      newLines.push(`${key}=${newProxyConfig[key]}`);
      console.log(`  ✅ Actualizado: ${key}`);
      delete newProxyConfig[key];
    } else {
      newLines.push(line);
    }
  } else {
    newLines.push(line);
  }
}

// Agregar nuevas variables
if (Object.keys(newProxyConfig).length > 0) {
  newLines.push('');
  newLines.push('# MTC Proxy Configuration (2Captcha - ASN AS6147 Telefónica del Perú)');
  for (const [key, value] of Object.entries(newProxyConfig)) {
    newLines.push(`${key}=${value}`);
    console.log(`  ➕ Agregado: ${key}`);
  }
}

// Escribir archivo actualizado
const updatedContent = newLines.join('\n');
fs.writeFileSync(envPath, updatedContent, 'utf8');

console.log('');
console.log('✅ Configuración actualizada exitosamente!');
console.log('');
console.log('📝 Próximos pasos:');
console.log('  1. Reiniciar el servidor Node.js');
console.log('  2. Probar consulta MTC con placa v2r075');
console.log('');
