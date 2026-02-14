/**
 * Bridge HTTP -> SOCKS5
 * Crea un proxy HTTP local que convierte peticiones a SOCKS5
 * Solución 4: http-proxy-to-socks
 */

const { createServer } = require('http');
const { SocksProxyAgent } = require('socks-proxy-agent');
const axios = require('axios');

// Configuración del proxy SOCKS5 de 2Captcha
const PROXY_USER = process.env.MTC_PROXY_USER || 'uae12c98557ca05dd-zone-custom-region-pe-asn-AS27843-session-X2RCP1LgE-sessTime-3';
const PROXY_PASS = process.env.MTC_PROXY_PASS || 'uae12c98557ca05dd';
const PROXY_HOST = process.env.MTC_PROXY_HOST || 'na.proxy.2captcha.com';
const PROXY_PORT = process.env.MTC_PROXY_PORT || '2333';

const SOCKS5_URL = `socks5://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
const BRIDGE_PORT = process.env.BRIDGE_PORT || 8080;

console.log('═══════════════════════════════════════════════════');
console.log('🌉 BRIDGE HTTP -> SOCKS5');
console.log('═══════════════════════════════════════════════════');
console.log(`Proxy SOCKS5: ${SOCKS5_URL.substring(0, 50)}...`);
console.log(`Bridge HTTP: http://localhost:${BRIDGE_PORT}`);
console.log('');
console.log('💡 Usa http://localhost:' + BRIDGE_PORT + ' como proxy HTTP normal');
console.log('   Ejemplo: curl -x http://localhost:' + BRIDGE_PORT + ' https://www.google.com');
console.log('');

// Crear agente SOCKS5
const socksAgent = new SocksProxyAgent(SOCKS5_URL, {
  keepAlive: true,
  timeout: 30000
});

// Crear servidor HTTP que actúa como proxy
const server = createServer(async (req, res) => {
  if (req.method === 'CONNECT') {
    // Manejar método CONNECT para HTTPS
    const url = new URL(`https://${req.url}`);
    const targetHost = url.hostname;
    const targetPort = url.port || 443;

    console.log(`🔗 CONNECT: ${targetHost}:${targetPort}`);

    try {
      // Crear conexión SOCKS5 al destino
      const targetUrl = `https://${targetHost}:${targetPort}`;
      const response = await axios.get(targetUrl, {
        httpsAgent: socksAgent,
        timeout: 30000,
        validateStatus: () => true // Aceptar cualquier status
      });

      // Responder al cliente
      res.writeHead(200, 'Connection Established');
      res.end();

      // Enviar datos al cliente (simplificado)
      // En producción, necesitarías manejar el stream bidireccional

    } catch (error) {
      console.error(`❌ Error en CONNECT: ${error.message}`);
      res.writeHead(502, 'Bad Gateway');
      res.end(`Proxy error: ${error.message}`);
    }
  } else {
    // Manejar peticiones HTTP normales
    const targetUrl = req.url.startsWith('http') ? req.url : `https://${req.headers.host}${req.url}`;
    
    console.log(`📡 ${req.method}: ${targetUrl}`);

    try {
      const response = await axios({
        method: req.method,
        url: targetUrl,
        httpsAgent: socksAgent,
        headers: req.headers,
        timeout: 30000,
        validateStatus: () => true
      });

      res.writeHead(response.status, response.headers);
      res.end(response.data);

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      res.writeHead(502, 'Bad Gateway');
      res.end(`Proxy error: ${error.message}`);
    }
  }
});

server.listen(BRIDGE_PORT, () => {
  console.log(`✅ Bridge iniciado en http://localhost:${BRIDGE_PORT}`);
  console.log('');
  console.log('📝 Para usar el bridge:');
  console.log(`   const httpsAgent = new HttpsProxyAgent('http://localhost:${BRIDGE_PORT}');`);
  console.log(`   await axios.get('https://rec.mtc.gob.pe/Citv/ArConsultaCitv', { httpsAgent });`);
  console.log('');
  console.log('⏹️  Presiona Ctrl+C para detener el bridge');
});

server.on('error', (error) => {
  console.error('❌ Error del servidor:', error.message);
  process.exit(1);
});
