# Flujo de Pago Mercado Pago - Mejorado

## ✅ Cambios Implementados

### 1. **Redirección Automática a Pasarela**
- Al hacer clic en "Pagar con Mercado Pago", se redirige automáticamente a la pasarela de Mercado Pago
- El usuario puede elegir método de pago (Yape, tarjeta, etc.) directamente en Mercado Pago

### 2. **Manejo de orderId Mejorado**
- Se genera `orderId` desde `preference_id` automáticamente
- Se guarda en `localStorage` como respaldo
- Se pasa en la URL cuando Mercado Pago redirige de vuelta

### 3. **Redirección Automática a result.html**
- Después del pago, Mercado Pago redirige a `/pago-ok`
- `pago-ok.html` verifica el estado del pago cada 2 segundos
- Cuando el pago está confirmado, redirige automáticamente a `result.html?token=...`

---

## 🔄 Flujo Completo

1. **Usuario hace clic en "Pagar"** en `index.html`
   - Redirige a `/comprar`

2. **Usuario ingresa email** en `comprar-mercadopago.html`
   - Hace clic en "Pagar con Mercado Pago"
   - Se crea preferencia de pago
   - **Redirige automáticamente a pasarela de Mercado Pago**

3. **Usuario elige método de pago** en Mercado Pago
   - Puede elegir: Yape, tarjeta, efectivo, etc.
   - Completa el pago

4. **Mercado Pago redirige a `/pago-ok`**
   - Con parámetros: `?preference_id=...&orderId=...`
   - `pago-ok.html` muestra "Procesando confirmación..."

5. **Verificación automática del pago**
   - Hace polling cada 2 segundos a `/api/mercadopago/status`
   - Espera confirmación del webhook

6. **Redirección automática a result.html**
   - Cuando el pago está confirmado (`status: 'paid'`)
   - Redirige a `/result.html?token=...`
   - El usuario puede hacer consultas inmediatamente

---

## 📋 Archivos Modificados

1. **`public/comprar-mercadopago.html`**
   - Eliminado Wallet Brick
   - Agregado botón "Pagar con Mercado Pago"
   - Redirección automática a `initPoint`

2. **`public/pago-ok.html`**
   - Mejorado manejo de `preference_id` y `orderId`
   - Redirección automática a `result.html` cuando pago confirmado

3. **`mercadopago-handler.js`**
   - Agregado `orderId` en respuesta de `createPreference`
   - URLs de retorno incluyen `preference_id`

4. **`server.js`**
   - Mejorado manejo de `preference_id` en rutas de retorno

---

## 🚀 Despliegue

```bash
ssh root@217.216.87.255 "cd /opt/Consulta-vehicular && git pull origin main && docker build -t consulta-vehicular:latest . && docker rm -f consulta-vehicular && docker run -d --name consulta-vehicular --env-file .env -p 127.0.0.1:8080:3000 consulta-vehicular:latest"
```

---

## ✅ Resultado Esperado

1. Usuario hace clic en "Pagar" → Redirige a pasarela de Mercado Pago
2. Usuario elige método de pago (Yape, tarjeta, etc.) → Completa pago
3. Mercado Pago redirige a `/pago-ok` → Verifica estado
4. Pago confirmado → Redirige automáticamente a `result.html` con token
5. Usuario puede hacer consultas inmediatamente

---

**Última actualización**: Febrero 2026
