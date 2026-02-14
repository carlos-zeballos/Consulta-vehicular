/**
 * Actualizar proxy con las nuevas credenciales proporcionadas
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

// Nuevas credenciales
const newProxyConfig = {
  MTC_PROXY_HOST: 'na.proxy.2captcha.com',
  MTC_PROXY_PORT: '2334', // HTTP (como indicó 2Captcha)
  MTC_PROXY_USER: 'uae12c98557ca05dd-zone-custom-region-pe-asn-AS27843-session-X2RCP1LgE-sessTime-3',
  MTC_PROXY_PASS: 'uae12c98557ca05dd',
  MTC_PROXY_URL: 'http://uae12c98557ca05dd-zone-custom-region-pe-asn-AS27843-session-X2RCP1LgE-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334'
};

console.log('🔧 Actualizando configuración de proxy MTC...');
console.log('');
console.log('Nueva configuración:');
console.log(`  Host: ${newProxyConfig.MTC_PROXY_HOST}`);
console.log(`  Port: ${newProxyConfig.MTC_PROXY_PORT} (HTTP)`);
console.log(`  User: ${newProxyConfig.MTC_PROXY_USER.substring(0, 30)}...`);
console.log(`  Pass: ${newProxyConfig.MTC_PROXY_PASS}`);
console.log('');

let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  console.log('✅ Archivo .env encontrado');
} else {
  console.log('⚠️  Archivo .env no existe, se creará uno nuevo');
}

const lines = envContent.split('\n');
const newLines = [];
const existingKeys = new Set();

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

if (Object.keys(newProxyConfig).length > 0) {
  newLines.push('');
  newLines.push('# MTC Proxy Configuration (2Captcha - ASN AS27843)');
  for (const [key, value] of Object.entries(newProxyConfig)) {
    newLines.push(`${key}=${value}`);
    console.log(`  ➕ Agregado: ${key}`);
  }
}

const updatedContent = newLines.join('\n');
fs.writeFileSync(envPath, updatedContent, 'utf8');

console.log('');
console.log('✅ Configuración actualizada exitosamente!');
console.log('');
