# Solución para Localhost:8080

## ✅ Cambios Realizados

### 1. Endpoint para Simular IPN
Se agregó el endpoint `/api/izipay/simulate-ipn` que permite simular el IPN manualmente en desarrollo.

**Características:**
- ✅ Solo funciona en localhost (no en producción)
- ✅ Simula un IPN completo con firma válida
- ✅ Activa el acceso automáticamente
- ✅ Genera el token de acceso

### 2. Botón en pago-ok.html
Se agregó un botón que aparece automáticamente cuando estás en localhost:
- 🔧 **"Simular Confirmación IPN (Solo Desarrollo)"**
- Solo visible en `localhost` o `127.0.0.1`
- Permite confirmar el pago manualmente sin esperar el IPN real

## 🚀 Cómo Usar

### Paso 1: Asegurar que el servidor esté en el puerto 8080

Si tu servidor está corriendo en el puerto 8080, verifica que `BASE_URL` esté configurado:

```bash
# En tu .env o al iniciar el servidor
PORT=8080
BASE_URL=http://localhost:8080
```

O inicia el servidor con:
```bash
PORT=8080 BASE_URL=http://localhost:8080 node server.js
```

### Paso 2: Realizar un pago de prueba

1. Ir a `http://localhost:8080/comprar`
2. Completar el formulario de pago
3. Usar tarjeta de prueba de Izipay
4. Serás redirigido a `/pago-ok?orderId=...`

### Paso 3: Simular el IPN

Cuando estés en la página `/pago-ok`, verás el botón:
**🔧 Simular Confirmación IPN (Solo Desarrollo)**

1. Haz clic en el botón
2. El sistema simulará el IPN
3. El estado cambiará a "PAID"
4. Se redirigirá automáticamente a `/result.html?token=...`

### Paso 4: Verificar el acceso

En `result.html`:
- El token se verifica automáticamente
- Puedes realizar consultas sin restricciones

## 🔍 Verificación de Logs

Cuando simules el IPN, deberías ver en los logs del servidor:

```
[IZIPAY] Simulando IPN para orderId=IZI-...
[IZIPAY] ipn-valid -> orderId=IZI-... status=PAID (anterior: PENDING)
[IZIPAY] Acceso activado (simulado) para orderId=IZI-...
```

## 📝 Notas Importantes

1. **El botón solo aparece en localhost**: Por seguridad, el botón y el endpoint solo funcionan en desarrollo.

2. **En producción**: El IPN real llegará automáticamente desde Izipay cuando el pago se confirme.

3. **BASE_URL**: Asegúrate de que `BASE_URL` en tu `.env` apunte a `http://localhost:8080` cuando trabajes localmente.

4. **Puerto**: Si cambias el puerto, actualiza `BASE_URL` y reinicia el servidor.

## 🐛 Troubleshooting

### El botón no aparece
- Verifica que estés en `localhost:8080` (no en una IP o dominio)
- Verifica la consola del navegador por errores

### El IPN simulado no funciona
- Verifica los logs del servidor
- Asegúrate de que `IZIPAY_TEST_KEY` esté configurada en `.env`
- Verifica que el `orderId` sea válido

### El estado sigue en PENDING
- Verifica que el endpoint `/api/izipay/simulate-ipn` responda correctamente
- Revisa los logs del servidor para ver errores
- Intenta recargar la página después de simular el IPN

## ✅ Flujo Completo

1. Usuario paga → Redirige a `/pago-ok?orderId=...`
2. Página muestra "Procesando confirmación..."
3. Usuario hace clic en "Simular Confirmación IPN"
4. Sistema simula el IPN → Estado cambia a PAID
5. Se genera el token de acceso
6. Redirección automática a `/result.html?token=...`
7. Usuario puede usar el servicio
