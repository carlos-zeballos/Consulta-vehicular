/**
 * SISTEMA DE MONITOREO Y AUTO-AJUSTE
 * Detecta bloqueos y ajusta estrategias automáticamente
 */

class AutoAdjustingScraper {
  constructor() {
    this.metrics = {
      successRate: 1.0,
      blockDetectionCount: 0,
      avgLoadTime: 0,
      lastBlockTime: null,
      successfulPatterns: new Set(),
      failedPatterns: new Set(),
      totalRequests: 0,
      successfulRequests: 0
    };
    
    this.config = {
      delayBetweenRequests: 2000,
      maxRetries: 3,
      useProxy: false,
      headlessMode: 'new',
      viewportStrategy: 'random',
      evasionLevel: 'maximum',
      userAgentRotation: true
    };
    
    this.blockPatterns = [
      /403 forbidden/i,
      /429 too many requests/i,
      /access denied/i,
      /your request has been blocked/i,
      /you have been blocked/i,
      /bot detected/i,
      /automated access/i,
      /cloudflare.*block/i
    ];
  }
  
  /**
   * Monitorear página y detectar bloqueos
   */
  async monitorPage(page) {
    const blockDetected = { value: false };
    
    // Monitorear respuestas HTTP
    page.on('response', async (response) => {
      const status = response.status();
      const url = response.url();
      
      if (status === 403 || status === 429) {
        console.warn(`[MONITOR] ⚠️ Bloqueo detectado: HTTP ${status} en ${url}`);
        this.metrics.blockDetectionCount++;
        this.metrics.lastBlockTime = Date.now();
        blockDetected.value = true;
        await this.executeAdaptiveStrategy('blockDetected');
      }
      
      // Verificar contenido de respuesta solo para respuestas HTML/texto
      if (response.headers()['content-type']?.includes('text/html')) {
        try {
          const text = await response.text();
          // Solo verificar si el texto es corto (páginas de error) o contiene patrones específicos
          if (text.length < 5000 && this.blockPatterns.some(pattern => pattern.test(text))) {
            console.warn(`[MONITOR] ⚠️ Patrón de bloqueo detectado en respuesta HTML`);
            blockDetected.value = true;
          }
        } catch (e) {
          // No es texto o error al leer, ignorar
        }
      }
    });
    
    // Monitorear consola para mensajes de bot
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.toLowerCase().includes('bot') || 
          text.toLowerCase().includes('automated') ||
          text.toLowerCase().includes('blocked')) {
        console.warn(`[MONITOR] ⚠️ Posible detección de bot en consola: ${text}`);
        this.executeAdaptiveStrategy('botDetected');
      }
    });
    
    // Monitorear diálogos
    page.on('dialog', async (dialog) => {
      console.warn(`[MONITOR] ⚠️ Diálogo detectado: ${dialog.message()}`);
      await dialog.dismiss();
    });
    
    return blockDetected;
  }
  
  /**
   * Ejecutar estrategia adaptativa según condición
   */
  async executeAdaptiveStrategy(condition) {
    console.log(`[MONITOR] Ejecutando estrategia para: ${condition}`);
    
    switch (condition) {
      case 'blockDetected':
        await this.escalateEvasionMeasures();
        break;
      case 'botDetected':
        this.config.evasionLevel = 'aggressive';
        this.config.delayBetweenRequests = Math.min(10000, this.config.delayBetweenRequests * 2);
        break;
      case 'captchaDetected':
        // Rotar fingerprint
        break;
      case 'slowResponse':
        // Deshabilitar recursos pesados
        break;
      case 'successStreak':
        // Reducir delay gradualmente
        if (this.metrics.successfulRequests > 5) {
          this.config.delayBetweenRequests = Math.max(1000, this.config.delayBetweenRequests * 0.9);
        }
        break;
    }
  }
  
  /**
   * Escalar medidas de evasión
   */
  async escalateEvasionMeasures() {
    console.log('[MONITOR] 🔒 ESCALANDO MEDIDAS DE EVASIÓN...');
    
    // Nivel 1: Aumentar delay
    this.config.delayBetweenRequests = Math.min(15000, this.config.delayBetweenRequests * 1.5);
    
    // Nivel 2: Cambiar estrategia de viewport
    this.config.viewportStrategy = 'random';
    
    // Nivel 3: Rotar User-Agent más frecuentemente
    this.config.userAgentRotation = true;
    
    // Nivel 4: Aumentar retries
    this.config.maxRetries = Math.min(5, this.config.maxRetries + 1);
    
    console.log(`[MONITOR] Nueva configuración: delay=${this.config.delayBetweenRequests}ms, retries=${this.config.maxRetries}`);
  }
  
  /**
   * Registrar éxito de request
   */
  recordSuccess() {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.metrics.successRate = this.metrics.successfulRequests / this.metrics.totalRequests;
    
    if (this.metrics.successfulRequests % 5 === 0) {
      this.executeAdaptiveStrategy('successStreak');
    }
  }
  
  /**
   * Registrar fallo de request
   */
  recordFailure() {
    this.metrics.totalRequests++;
    this.metrics.successRate = this.metrics.successfulRequests / this.metrics.totalRequests;
  }
  
  /**
   * Obtener métricas actuales
   */
  getMetrics() {
    return {
      ...this.metrics,
      config: { ...this.config }
    };
  }
  
  /**
   * Resetear métricas
   */
  resetMetrics() {
    this.metrics = {
      successRate: 1.0,
      blockDetectionCount: 0,
      avgLoadTime: 0,
      lastBlockTime: null,
      successfulPatterns: new Set(),
      failedPatterns: new Set(),
      totalRequests: 0,
      successfulRequests: 0
    };
  }
}

module.exports = { AutoAdjustingScraper };
