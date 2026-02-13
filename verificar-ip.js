/**
 * Script para verificar la IP actual y compararla con la whitelist
 */

const axios = require('axios');

const WHITELIST_IP = '45.177.197.197';

console.log('═══════════════════════════════════════════════════');
console.log('  VERIFICACIÓN DE IP Y WHITELIST');
console.log('═══════════════════════════════════════════════════');
console.log(`IP en whitelist de 2Captcha: ${WHITELIST_IP}`);
console.log('');

// Verificar IP actual (sin proxy)
axios.get('https://api.ipify.org?format=json')
  .then(res => {
    const currentIP = res.data.ip;
    console.log(`✅ IP actual del servidor: ${currentIP}`);
    
    if (currentIP === WHITELIST_IP) {
      console.log('✅ ✅ ✅ IP COINCIDE CON LA WHITELIST ✅ ✅ ✅');
      console.log('   El proxy debería funcionar correctamente');
    } else {
      console.log('⚠️  ⚠️  ⚠️  IP NO COINCIDE CON LA WHITELIST ⚠️  ⚠️  ⚠️');
      console.log(`   IP actual: ${currentIP}`);
      console.log(`   IP whitelist: ${WHITELIST_IP}`);
      console.log('');
      console.log('🔧 SOLUCIÓN:');
      console.log('   1. Agrega tu IP actual a la whitelist en el panel de 2Captcha');
      console.log(`   2. O configura el servidor para usar la IP ${WHITELIST_IP}`);
    }
    
    console.log('');
    
    // Probar con proxy
    console.log('🔄 Probando IP a través del proxy...');
    const { getProxyConfig } = require('./playwrightConfig');
    const proxy = getProxyConfig();
    
    if (proxy) {
      return axios.get('https://api.ipify.org?format=json', {
        proxy: {
          protocol: 'http',
          host: process.env.MTC_PROXY_HOST || 'na.proxy.2captcha.com',
          port: parseInt(process.env.MTC_PROXY_PORT || '2333'),
          auth: {
            username: process.env.MTC_PROXY_USER || '',
            password: process.env.MTC_PROXY_PASS || ''
          }
        },
        timeout: 10000
      });
    }
  })
  .then(res => {
    if (res && res.data) {
      const proxyIP = res.data.ip;
      console.log(`✅ IP a través del proxy: ${proxyIP}`);
      console.log('');
      console.log('📝 NOTA: El proxy de 2Captcha usa su propia IP,');
      console.log('   pero la IP de tu servidor debe estar en la whitelist');
      console.log('   para que el proxy funcione correctamente.');
    }
  })
  .catch(err => {
    console.log('⚠️  No se pudo verificar IP a través del proxy:', err.message);
  })
  .finally(() => {
    console.log('');
    console.log('═══════════════════════════════════════════════════');
  });
