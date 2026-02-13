# Guía de Prueba - Flujo de Pago

## ✅ Cambios Implementados

### 1. Protección de Idempotencia en IPN
- ✅ El IPN ignora llamadas duplicadas si el pago ya está en estado `PAID`
- ✅ Solo activa el acceso cuando el estado cambia a `PAID` por primera vez

### 2. Mejoras en pago-ok.html
- ✅ Límite de tiempo: máximo 5 minutos de polling
- ✅ Detiene el polling cuando el pago se confirma
- ✅ Redirección única a result.html con token

### 3. Verificación de Token
- ✅ Verifica el token al cargar result.html
- ✅ Guarda el token en sessionStorage si es válido
- ✅ Permite consultas cuando hay token válido

## 🧪 Cómo Probar

### Prueba 1: Flujo Completo de Pago

1. **Iniciar el servidor:**
   ```bash
   node server.js
   ```

2. **Realizar un pago de prueba:**
   - Ir a `http://localhost:3000/comprar` (o la URL de tu servidor)
   - Completar el formulario de pago
   - Usar tarjeta de prueba de Izipay

3. **Verificar redirección:**
   - Después del pago, deberías ser redirigido a `/pago-ok?orderId=...`
   - La página debe mostrar "Procesando confirmación..."
   - Debe verificar el estado cada 2 segundos

4. **Verificar confirmación:**
   - Cuando el IPN confirme el pago, debe mostrar "Pago confirmado. Acceso activado."
   - Debe redirigir automáticamente a `/result.html?token=...` después de 1 segundo

5. **Verificar acceso:**
   - En `result.html`, debe verificar el token automáticamente
   - Debe permitir realizar consultas sin restricciones

### Prueba 2: Protección contra IPN Duplicado

1. **Simular IPN duplicado:**
   ```bash
   # Primera llamada (debe procesar)
   curl -X POST http://localhost:3000/api/izipay/ipn \
     -H "Content-Type: application/json" \
     -d '{"vads_order_id":"TEST-123","vads_trans_status":"PAID",...}'
   
   # Segunda llamada (debe ignorar)
   curl -X POST http://localhost:3000/api/izipay/ipn \
     -H "Content-Type: application/json" \
     -d '{"vads_order_id":"TEST-123","vads_trans_status":"PAID",...}'
   ```

2. **Verificar logs:**
   - Primera llamada: `[IZIPAY] ipn-valid -> orderId=TEST-123 status=PAID`
   - Segunda llamada: `[IZIPAY] ipn-duplicate -> orderId=TEST-123 ya estaba PAID, ignorando IPN duplicado`

### Prueba 3: Verificación de Token

1. **Obtener un token válido:**
   - Realizar un pago exitoso
   - Copiar el `accessToken` de la URL o de los logs

2. **Verificar token:**
   ```bash
   curl http://localhost:3000/api/servicio/usar?token=TOKEN_AQUI
   ```

3. **Resultado esperado:**
   ```json
   {
     "ok": true,
     "message": "Acceso permitido",
     "orderId": "IZI-..."
   }
   ```

### Prueba 4: Límite de Tiempo en Polling

1. **Simular pago que nunca se confirma:**
   - Crear un orderId que nunca llegue a estado PAID
   - Cargar `/pago-ok?orderId=TEST-NEVER-PAID`

2. **Verificar:**
   - Debe hacer polling por máximo 5 minutos (150 intentos)
   - Después debe mostrar: "Tiempo de espera agotado..."

## 🔍 Verificación de Logs

### Logs Esperados en el Servidor:

```
[IZIPAY] init -> orderId=IZI-... transId=... amount=...
[IZIPAY] return pago-ok GET { query: { orderId: 'IZI-...' } }
[IZIPAY] ipn-valid -> orderId=IZI-... status=PAID (anterior: PENDING)
[IZIPAY] Acceso activado para orderId=IZI-...
[IZIPAY] status -> orderId=IZI-... status=PAID
```

### Si hay IPN duplicado:

```
[IZIPAY] ipn-duplicate -> orderId=IZI-... ya estaba PAID, ignorando IPN duplicado
```

## ⚠️ Problemas Comunes

### Problema: No redirige a result.html
**Solución:** Verificar que:
- El IPN está llegando correctamente
- El status cambia a `PAID`
- El `accessToken` se está generando

### Problema: IPN se procesa múltiples veces
**Solución:** Verificar que la protección de idempotencia está funcionando:
- Revisar logs para ver si aparece `ipn-duplicate`
- Verificar que `wasAlreadyPaid` está funcionando correctamente

### Problema: Token no funciona en result.html
**Solución:** Verificar que:
- El endpoint `/api/servicio/usar` está funcionando
- El token se está guardando en `sessionStorage`
- La verificación se ejecuta al cargar la página

## 📝 Checklist de Prueba

- [ ] El pago redirige correctamente a `/pago-ok`
- [ ] El polling verifica el estado cada 2 segundos
- [ ] Cuando el pago se confirma, se detiene el polling
- [ ] Se redirige automáticamente a `result.html` con el token
- [ ] El token se verifica correctamente en `result.html`
- [ ] Se pueden realizar consultas con el token válido
- [ ] Los IPN duplicados se ignoran correctamente
- [ ] El límite de tiempo funciona (5 minutos máximo)
