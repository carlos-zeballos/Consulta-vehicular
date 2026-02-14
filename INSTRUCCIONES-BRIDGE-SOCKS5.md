# Instrucciones: Usar Bridge HTTP -> SOCKS5 para MTC

## Problema

El proxy SOCKS5 de 2Captcha no acepta autenticación estándar con `socks-proxy-agent`. El error es: `Received invalid Socks5 initial handshake (no accepted authentication type)`.

## Solución: Bridge HTTP -> SOCKS5

Creamos un bridge local que convierte peticiones HTTP CONNECT a SOCKS5.

## Pasos para Usar

### Paso 1: Iniciar el Bridge

En una terminal, ejecuta:

```bash
node bridge-proxy-socks5.js
```

Verás:
```
✅ Bridge iniciado en http://localhost:8080
```

**⚠️ IMPORTANTE:** Deja esta terminal abierta mientras usas el scraper.

### Paso 2: Usar el Scraper

En otra terminal, ejecuta:

```bash
node test-mtc-bridge-completo.js
```

El scraper usará `http://localhost:8080` como proxy HTTP normal, y el bridge lo convertirá a SOCKS5 automáticamente.

## Configuración Actual

- **Proxy SOCKS5:** `socks5://uae12c98557ca05dd-zone-custom-region-pe-asn-AS27843-session-X2RCP1LgE-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2333`
- **Bridge HTTP:** `http://localhost:8080`
- **Puerto del bridge:** 8080 (configurable con variable `BRIDGE_PORT`)

## Archivos Creados

1. **`bridge-proxy-socks5.js`** - Servidor bridge que convierte HTTP -> SOCKS5
2. **`mtc-scraper-bridge.js`** - Scraper MTC que usa el bridge
3. **`test-mtc-bridge-completo.js`** - Script de prueba completo

## Ventajas del Bridge

✅ Funciona con cualquier cliente HTTP (Axios, curl, etc.)
✅ No requiere configuración especial en el código
✅ Maneja automáticamente la conversión HTTP -> SOCKS5
✅ Mantiene cookies y sesiones correctamente

## Desventajas

❌ Requiere un proceso adicional corriendo (el bridge)
❌ Añade una capa extra de complejidad
❌ Puede ser más lento que usar SOCKS5 directamente

## Alternativas si el Bridge no Funciona

1. **Contactar a 2Captcha** - El proxy SOCKS5 puede necesitar configuración especial
2. **Usar otro proveedor de proxy** - BrightData, Smartproxy, etc.
3. **Probar desde el servidor VPS** - Puede funcionar diferente en producción
