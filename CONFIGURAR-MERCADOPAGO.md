# 💳 Configuración de Mercado Pago

## 📋 Variables de Entorno Necesarias

Agrega estas variables a tu archivo `.env`:

```env
# ============================================
# MERCADO PAGO
# ============================================
MERCADOPAGO_ACCESS_TOKEN=APP_USR-5363845934405232-021315-75ce11ab2c0aeb3f00d8c63c1da02b90-3202899162
MERCADOPAGO_PUBLIC_KEY=APP_USR-3a773006-4d23-4f56-abaa-d0845043596c

# ============================================
# CONFIGURACIÓN BÁSICA
# ============================================
BASE_URL=https://consultavehicular.services
PUBLIC_BASE_URL=https://consultavehicular.services
PORT=3000
PRICE_CENTS=1500
```

---

## 🚀 Instalación

### 1. Instalar dependencia

```bash
npm install mercadopago
```

### 2. Configurar .env

Edita tu archivo `.env` y agrega las credenciales de Mercado Pago.

### 3. Reiniciar servidor

```bash
pm2 restart consulta-vehicular
```

---

## 🧪 Probar el Pago

### 1. Abrir página de compra

```
https://consultavehicular.services/comprar-mercadopago.html
```

### 2. Completar formulario

- Ingresar email (opcional)
- Hacer clic en "Crear pago con Mercado Pago"

### 3. Completar pago en Mercado Pago

**Tarjetas de prueba (modo TEST):**
- Tarjeta aprobada: `5031 7557 3453 0604`
- CVV: `123`
- Fecha: Cualquier fecha futura
- Nombre: Cualquier nombre

### 4. Verificar redirección

Después del pago, debe redirigir a:
```
https://consultavehicular.services/pago-ok?orderId=MP-...&provider=mercadopago
```

### 5. Verificar confirmación

- La página debe mostrar "Procesando confirmación..."
- El sistema verifica cada 2 segundos
- Cuando el webhook confirme, debe mostrar "Pago confirmado. Acceso activado."
- Debe redirigir automáticamente a `result.html?token=...`

---

## 🔍 Ver Logs

```bash
pm2 logs consulta-vehicular --lines 0
```

**Busca estos mensajes:**
- ✅ `[MERCADOPAGO] Creando preferencia para orderId=...`
- ✅ `[MERCADOPAGO] Preferencia creada: ...`
- ✅ `[MERCADOPAGO] Webhook recibido - payment_id=...`
- ✅ `[MERCADOPAGO] webhook-valid -> orderId=... status=PAID`
- ✅ `[MERCADOPAGO] Acceso activado para orderId=...`

---

## ⚙️ Configurar Webhook en Mercado Pago

1. **Ir a tu cuenta de Mercado Pago**
2. **Configuración → Webhooks**
3. **Agregar URL:**
   ```
   https://consultavehicular.services/api/mercadopago/webhook
   ```
4. **Eventos a escuchar:**
   - `payment` (cuando se crea o actualiza un pago)

---

## 📝 Notas Importantes

- **Modo TEST:** Usa las credenciales de prueba proporcionadas
- **Modo PRODUCTION:** Cambia a tus credenciales de producción
- **Webhook:** Mercado Pago enviará notificaciones automáticamente
- **Redirección:** El sistema redirige automáticamente a `result.html` cuando el pago se confirma

---

**✅ ¡Listo para recibir pagos con Mercado Pago!**
