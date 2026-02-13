/**
 * Rotador de proxies desde listas de 2Captcha
 * Lee los archivos de lista de proxies y rota entre ellos
 */

const fs = require('fs');
const path = require('path');

class ProxyRotator {
  constructor() {
    this.proxies = [];
    this.currentIndex = 0;
    this.loadProxies();
  }

  loadProxies() {
    const proxyLists = [
      'C:\\Users\\CARLOS\\Downloads\\proxylist.txt',      // Europa
      'C:\\Users\\CARLOS\\Downloads\\proxylist (1).txt'    // North America
    ];

    this.proxies = [];
    const naProxies = []; // Proxies de North America (prioridad)
    const euProxies = []; // Proxies de Europa (fallback)

    for (let i = 0; i < proxyLists.length; i++) {
      const listPath = proxyLists[i];
      try {
        if (fs.existsSync(listPath)) {
          const content = fs.readFileSync(listPath, 'utf8');
          const lines = content.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            // Formato: username:password@host:port
            const match = line.match(/^([^:]+):([^@]+)@([^:]+):(\d+)$/);
            if (match) {
              const [, username, password, host, port] = match;
              const proxy = {
                host,
                port: parseInt(port),
                username,
                password,
                server: `http://${host}:${port}`,
                url: line
              };
              
              // Separar por servidor: North America tiene prioridad
              if (host.includes('na.proxy.2captcha.com')) {
                naProxies.push(proxy);
              } else {
                euProxies.push(proxy);
              }
            }
          }
          console.log(`[PROXY-ROTATOR] Cargados ${lines.length} proxies desde ${path.basename(listPath)}`);
        }
      } catch (error) {
        console.error(`[PROXY-ROTATOR] Error cargando ${listPath}:`, error.message);
      }
    }

    // Priorizar proxies de North America (evitan errores SSL)
    this.proxies = [...naProxies, ...euProxies];
    console.log(`[PROXY-ROTATOR] Total de proxies cargados: ${this.proxies.length}`);
    console.log(`[PROXY-ROTATOR] North America: ${naProxies.length}, Europa: ${euProxies.length}`);
  }

  getNextProxy() {
    if (this.proxies.length === 0) {
      return null;
    }

    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    
    return {
      server: proxy.server,
      username: proxy.username,
      password: proxy.password
    };
  }

  getRandomProxy() {
    if (this.proxies.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * this.proxies.length);
    const proxy = this.proxies[randomIndex];
    
    return {
      server: proxy.server,
      username: proxy.username,
      password: proxy.password
    };
  }

  getProxyByLogin(login) {
    const proxy = this.proxies.find(p => p.username === login);
    if (proxy) {
      return {
        server: proxy.server,
        username: proxy.username,
        password: proxy.password
      };
    }
    return null;
  }
}

module.exports = ProxyRotator;
