# Recomendaciones para Configurar el Proxy de 2Captcha para MTC

## Problema Actual
El proxy está configurado correctamente pero MTC está cerrando la conexión (`ERR_CONNECTION_RESET`).

## Configuración Actual
- **Servidor:** North America (`na.proxy.2captcha.com:2333`)
- **Región:** Chile - Antofagasta
- **Login:** `uae12c98557ca05dd-zone-custom-region-cl-st-antofagasta`
- **Password:** `uae12c98557ca05dd`

## Recomendaciones

### Opción 1: Cambiar Geolocalización a Perú (RECOMENDADO)
En el panel de 2Captcha, cambiar la geolocalización:
1. **Select geoposition:**
   - País: **PE (Perú)**
   - Región/Provincia: **Lima** o **Callao**
   - Ciudad: Cualquier ciudad de Perú

Esto dará un login como: `uae12c98557ca05dd-zone-custom-region-pe-...`

**Ventaja:** IPs de Perú pueden tener mejor acceso a sitios gubernamentales peruanos como MTC.

### Opción 2: Probar con Servidor de Europa
Si el servidor de North America sigue dando problemas:
- **Servidor:** `eu.proxy.2captcha.com:2333`
- Mantener la misma geolocalización o cambiarla a Europa

### Opción 3: Usar Proxy Residencial
Si tienes acceso a proxies residenciales en 2Captcha:
- Seleccionar tipo: **Residential** en lugar de **Datacenter**
- Esto puede ser más costoso pero tiene mejor tasa de éxito

## Cómo Actualizar la Configuración

Una vez que cambies la geolocalización en el panel de 2Captcha:

1. Obtén el nuevo **Login** del panel
2. Ejecuta: `node configurar-produccion.js`
3. Edita `configurar-produccion.js` y actualiza:
   ```javascript
   MTC_PROXY_USER: 'NUEVO_LOGIN_AQUI',
   MTC_PROXY_URL: 'http://NUEVO_LOGIN_AQUI:uae12c98557ca05dd@na.proxy.2captcha.com:2333',
   ```
4. Ejecuta: `node configurar-produccion.js` de nuevo
5. Prueba: `node test-mtc-proxy.js`

## Notas Importantes

- El login cambia cuando cambias la geolocalización
- El password generalmente se mantiene igual
- El servidor puede ser `na.proxy.2captcha.com` (North America) o `eu.proxy.2captcha.com` (Europa)
- El puerto es siempre `2333` para HTTP proxy
