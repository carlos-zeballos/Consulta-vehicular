# Solución: Error 33 - vads_url_check

## ❌ El Problema

Izipay está rechazando el formulario de pago con el error:
```
Error 33 - vads_url_check
Missing or invalid parameter value
```

## 🔍 Causa

El campo `vads_url_check` está configurado con `http://localhost:8080/api/izipay/ipn`, que **no es una URL válida** para Izipay porque:

1. **Izipay no puede acceder a localhost** desde sus servidores
2. **localhost no es un dominio público** válido
3. **El formato de URL no cumple** con los requisitos de Izipay

## ✅ Solución Implementada

He modificado el código para que:

1. **NO incluya `vads_url_check` en localhost** - Ya que Izipay no puede acceder de todas formas
2. **Solo incluya `vads_url_check` en producción** - Cuando `BASE_URL` sea una URL pública válida
3. **Use el botón de simulación** - En localhost, puedes usar el botón "Simular Confirmación IPN"

## 🚀 Cómo Funciona Ahora

### En Localhost (Desarrollo):
- ❌ **NO se envía `vads_url_check`** (evita el error 33)
- ✅ **Puedes usar el botón de simulación** para confirmar el pago manualmente
- ✅ **El pago funciona normalmente** sin el IPN automático

### En Producción:
- ✅ **Se envía `vads_url_check`** con la URL pública válida
- ✅ **Izipay puede enviar el IPN** automáticamente
- ✅ **El pago se confirma automáticamente**

## 📝 Configuración para Producción

Cuando despliegues en producción, asegúrate de:

1. **Configurar `BASE_URL`** con tu dominio público:
   ```env
   BASE_URL=https://tu-dominio.com
   ```

2. **Configurar el IPN en el Back Office de Izipay**:
   - Ve a Configuración → Reglas de notificación
   - Agrega la URL: `https://tu-dominio.com/api/izipay/ipn`
   - Método: POST

3. **Verificar que la URL sea accesible públicamente**

## 🔧 Alternativa: Usar ngrok para Desarrollo

Si quieres probar el IPN real en localhost, puedes usar **ngrok**:

1. **Instalar ngrok**:
   ```bash
   npm install -g ngrok
   # O descargar desde https://ngrok.com/
   ```

2. **Crear túnel**:
   ```bash
   ngrok http 8080
   ```

3. **Usar la URL de ngrok**:
   ```env
   BASE_URL=https://tu-url-ngrok.ngrok.io
   ```

4. **Configurar en Izipay** (Back Office):
   - URL de notificación: `https://tu-url-ngrok.ngrok.io/api/izipay/ipn`

## ✅ Verificación

Después de los cambios:

1. **Reinicia el servidor**
2. **Intenta realizar un pago**
3. **No deberías ver el error 33**
4. **El pago debería procesarse correctamente**

En localhost, usa el botón "Simular Confirmación IPN" para confirmar el pago manualmente.
