/**
 * SISTEMA DE EXTRACCIÓN MULTI-CAPA
 * Extrae datos de múltiples fuentes para garantizar 100% de éxito
 */

class MultiLayerExtractor {
  constructor(page) {
    this.page = page;
    this.networkData = [];
    this.setupNetworkMonitoring();
  }
  
  /**
   * Configurar monitoreo de red para capturar APIs
   */
  setupNetworkMonitoring() {
    this.page.on('response', async (response) => {
      const url = response.url();
      
      // Capturar respuestas JSON que puedan contener datos
      if (url.includes('/api/') || url.includes('/data/') || 
          url.includes('/consultar') || url.includes('/buscar') ||
          response.headers()['content-type']?.includes('application/json')) {
        try {
          const json = await response.json().catch(() => null);
          if (json) {
            this.networkData.push({
              url: url,
              method: response.request().method(),
              data: json,
              status: response.status(),
              timestamp: Date.now()
            });
          }
        } catch (e) {
          // No es JSON o error al parsear
        }
      }
    });
  }
  
  /**
   * Extraer datos de vehículo usando múltiples métodos
   */
  async extractVehicleData(selectors = {}) {
    const results = {
      domExtraction: null,
      apiExtraction: null,
      metaExtraction: null,
      scriptExtraction: null,
      combinedData: {}
    };
    
    // 1. Extracción vía DOM
    try {
      results.domExtraction = await this.extractViaDOM(selectors);
    } catch (e) {
      console.log(`[EXTRACTOR] Error en extracción DOM: ${e.message}`);
    }
    
    // 2. Extracción vía APIs capturadas
    try {
      results.apiExtraction = await this.extractViaAPIs();
    } catch (e) {
      console.log(`[EXTRACTOR] Error en extracción API: ${e.message}`);
    }
    
    // 3. Extracción vía Meta Tags
    try {
      results.metaExtraction = await this.extractViaMetaTags();
    } catch (e) {
      console.log(`[EXTRACTOR] Error en extracción Meta: ${e.message}`);
    }
    
    // 4. Extracción vía Script Tags
    try {
      results.scriptExtraction = await this.extractViaScriptTags();
    } catch (e) {
      console.log(`[EXTRACTOR] Error en extracción Script: ${e.message}`);
    }
    
    // Combinar todos los datos
    results.combinedData = this.mergeAndDeduplicate([
      results.domExtraction,
      results.apiExtraction,
      results.metaExtraction,
      results.scriptExtraction
    ]);
    
    return results;
  }
  
  /**
   * Extraer datos del DOM
   */
  async extractViaDOM(selectors) {
    return await this.page.evaluate((selectors) => {
      const data = {};
      
      // Función helper para buscar texto
      const findText = (patterns) => {
        for (const pattern of patterns) {
          const element = document.querySelector(pattern);
          if (element) {
            const text = element.textContent?.trim() || 
                        element.getAttribute('value') ||
                        element.getAttribute('content');
            if (text) return text;
          }
        }
        return null;
      };
      
      // Buscar datos usando selectores proporcionados o patrones comunes
      if (selectors) {
        Object.keys(selectors).forEach(key => {
          const value = findText(Array.isArray(selectors[key]) ? selectors[key] : [selectors[key]]);
          if (value) data[key] = value;
        });
      }
      
      // Buscar tablas comunes
      const tables = document.querySelectorAll('table');
      if (tables.length > 0) {
        data.tables = [];
        tables.forEach(table => {
          const rows = [];
          table.querySelectorAll('tbody tr, tr').forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td, th')).map(cell => cell.textContent.trim());
            if (cells.length > 0) rows.push(cells);
          });
          if (rows.length > 0) data.tables.push(rows);
        });
      }
      
      return data;
    }, selectors);
  }
  
  /**
   * Extraer datos de APIs capturadas
   */
  async extractViaAPIs() {
    // Retornar datos capturados de la red
    return {
      apiCalls: this.networkData,
      windowData: await this.page.evaluate(() => {
        const apiData = {};
        
        // Buscar en variables globales comunes
        const globalKeys = Object.keys(window).filter(key => 
          key.includes('data') || 
          key.includes('vehicle') || 
          key.includes('result') ||
          key.includes('response')
        );
        
        globalKeys.forEach(key => {
          try {
            const value = window[key];
            if (typeof value === 'object' && value !== null) {
              apiData[key] = value;
            }
          } catch (e) {}
        });
        
        // Buscar en dataLayer (Google Tag Manager)
        if (window.dataLayer) {
          apiData.dataLayer = window.dataLayer;
        }
        
        // Buscar en __INITIAL_STATE__
        if (window.__INITIAL_STATE__) {
          apiData.initialState = window.__INITIAL_STATE__;
        }
        
        return apiData;
      })
    };
  }
  
  /**
   * Extraer datos de Meta Tags
   */
  async extractViaMetaTags() {
    return await this.page.evaluate(() => {
      const metaData = {};
      const metaTags = document.querySelectorAll('meta[property], meta[name], meta[itemprop]');
      
      metaTags.forEach(meta => {
        const property = meta.getAttribute('property') || 
                        meta.getAttribute('name') || 
                        meta.getAttribute('itemprop');
        const content = meta.getAttribute('content');
        
        if (property && content) {
          metaData[property] = content;
        }
      });
      
      return metaData;
    });
  }
  
  /**
   * Extraer datos de Script Tags (JSON-LD, datos embebidos)
   */
  async extractViaScriptTags() {
    return await this.page.evaluate(() => {
      const scriptData = {};
      
      // Buscar JSON-LD
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      jsonLdScripts.forEach((script, index) => {
        try {
          const json = JSON.parse(script.textContent);
          scriptData[`jsonLd_${index}`] = json;
        } catch (e) {}
      });
      
      // Buscar datos en scripts inline
      const scripts = document.querySelectorAll('script:not([src])');
      scripts.forEach((script, index) => {
        const text = script.textContent;
        
        // Buscar patrones JSON comunes
        const jsonMatches = text.match(/\{[\s\S]*\}/g);
        if (jsonMatches) {
          jsonMatches.forEach((match, matchIndex) => {
            try {
              const json = JSON.parse(match);
              scriptData[`inlineScript_${index}_${matchIndex}`] = json;
            } catch (e) {}
          });
        }
        
        // Buscar variables con datos
        const varMatches = text.match(/(?:var|let|const)\s+(\w+)\s*=\s*(\{[\s\S]*?\});/g);
        if (varMatches) {
          varMatches.forEach(match => {
            try {
              const jsonMatch = match.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const json = JSON.parse(jsonMatch[0]);
                scriptData[`variable_${index}`] = json;
              }
            } catch (e) {}
          });
        }
      });
      
      return scriptData;
    });
  }
  
  /**
   * Combinar y deduplicar datos de múltiples fuentes
   */
  mergeAndDeduplicate(dataSources) {
    const merged = {};
    
    dataSources.forEach(source => {
      if (!source || typeof source !== 'object') return;
      
      Object.keys(source).forEach(key => {
        const value = source[key];
        
        // Si ya existe, priorizar el que tenga más datos
        if (merged[key]) {
          if (typeof value === 'object' && typeof merged[key] === 'object') {
            merged[key] = { ...merged[key], ...value };
          } else if (value && !merged[key]) {
            merged[key] = value;
          }
        } else {
          merged[key] = value;
        }
      });
    });
    
    return merged;
  }
  
  /**
   * Validar que se extrajeron datos mínimos
   */
  hasMinimumData(data, requiredFields = []) {
    if (requiredFields.length === 0) return true;
    
    return requiredFields.every(field => {
      const value = this.getNestedValue(data, field);
      return value !== null && value !== undefined && value !== '';
    });
  }
  
  /**
   * Obtener valor anidado de un objeto
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }
}

module.exports = { MultiLayerExtractor };
