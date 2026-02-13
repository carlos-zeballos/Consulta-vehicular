# Reporte de Integración MiCuentaWeb/Izipay (Krypton V4)

**Fecha:** 2026-02-13  
**Proyecto:** Consulta-vehicular  
**Objetivo:** Integrar pagos TEST con MiCuentaWeb/Niubiz (Krypton V4), eliminando MercadoPago y dejando IPN como única fuente de confirmación.

---

## ✅ Resumen de cambios realizados

### Backend (Node/Express)
- **/api/payments/mcw/create-token**: genera `formToken` y `orderId` usando `Charge/CreatePayment` (REST V4).
- **/api/payments/mcw/ipn**: webhook con validación `kr-hash` mediante HMAC-SHA256.
- **/checkout**: sirve `public/checkout.html` inyectando `MCW_PUBLIC_KEY`, `MCW_RETURN_OK`, `MCW_RETURN_KO`.
- **/pago-ok** y **/pago-error**: páginas simples de respuesta (no confirman pago).
- Persistencia local de pagos en `data/payments.json`.
- Stub `activateAccess(...)` listo para integrar con modelo real.
- Eliminado cualquier rastro de MercadoPago (`ACCESS_TOKEN`).

**Archivo principal modificado:** `server.js`

### Frontend
- **public/checkout.html**: formulario para correo → llama `/api/payments/mcw/create-token` → renderiza Krypton con token dinámico.
- **public/pago-ok.html** y **public/pago-error.html**: mensajes finales.

### Configuración / Infraestructura
- `.env`: variables MCW añadidas (TEST).
- `docker-compose.yml`: expone variables MCW al contenedor.
- `package.json` y `package-lock.json`: eliminada dependencia `mercadopago`.
- Documentación actualizada (`README.md`, `DEPLOY-*`, `env.example.txt`, scripts de cPanel/PowerShell).

---

## ✅ Variables de entorno requeridas (TEST)

```env
MCW_API_USER=88791260
MCW_API_PASSWORD=testpassword_Fb9mGAqph8y06DdCm7PHf3u5wVxwGXWUoC1XLlGT4qvke
MCW_PUBLIC_KEY=88791260:testpublickey_zsKTbwl1J8s3236E3PTH6XgcicBz7bq6E8R8d8jxA82l6
MCW_HMAC_KEY=cc7B7I3rylIIEQBRQamvh9OSAV1hDurF7wTLczshwgd8p
MCW_RETURN_OK=https://consultavehicular.services/pago-ok
MCW_RETURN_KO=https://consultavehicular.services/pago-error
MCW_IPN_URL=https://consultavehicular.services/api/payments/mcw/ipn
```

---

## ✅ Endpoints clave

| Método | Ruta | Función |
|--------|------|---------|
| POST | `/api/payments/mcw/create-token` | Genera formToken y orderId |
| POST | `/api/payments/mcw/ipn` | Webhook IPN con validación HMAC |
| GET | `/checkout` | Página de pago Krypton |
| GET | `/pago-ok` | Página final OK |
| GET | `/pago-error` | Página final error |

---

## ✅ Flujo correcto (Izipay/MiCuentaWeb)

1. Usuario entra a `/checkout`.
2. Ingresa email → `POST /api/payments/mcw/create-token`.
3. Backend llama a `Charge/CreatePayment`, devuelve `formToken`.
4. Frontend renderiza Krypton con `kr-form-token`.
5. **Confirmación real solo se hace por IPN**.
6. IPN firma válida → se registra en `data/payments.json` y se llama `activateAccess(...)`.

---

## ✅ Validación de kr-hash (HMAC)

- Se recalcula HMAC-SHA256 con `MCW_HMAC_KEY` sobre el `kr-answer`.
- Se compara con `kr-hash` con `timingSafeEqual`.
- Si no coincide → responde 401.

---

## ✅ Verificación de configuración Izipay

### 1) Back Office → Reglas de notificación
Debe configurarse una regla **POST** con la URL:
```
https://consultavehicular.services/api/payments/mcw/ipn
```

Si no está configurada, el sistema solo mostrará **pago iniciado**.

### 2) Dominio en variables
Debe coincidir el dominio real (`consultavehicular.services`) con los **return URLs** y el IPN.

### 3) Métodos habilitados
Se envía en la creación de pago:
```
paymentMethods: ["CARDS", "PAGOEFECTIVO"]
```

### 4) HMAC key correcta
Debe ser exactamente la clave proporcionada por MiCuentaWeb. Si no, el IPN se rechazará.

---

## ✅ Pendientes / TODO (para siguiente IA)

1. **Integrar `activateAccess(...)`** con el sistema real (DB/licencias/usuarios).
2. (Opcional) notificación por correo al confirmar pago.
3. Revisar logs en producción para asegurar que el IPN llega.

---

## ✅ Archivos tocados

- `server.js`
- `public/checkout.html`
- `public/pago-ok.html`
- `public/pago-error.html`
- `.env`
- `docker-compose.yml`
- `package.json`
- `package-lock.json`
- `env.example.txt`
- `README.md`
- `configurar-env.ps1`
- `preparar-cpanel.ps1`
- `DEPLOY-CONTABO.md`
- `DEPLOY-VPS-CONTABO.md`
- `DEPLOY-CLOUDRUN.md`
- `SOLUCION-ERRORES-CONTABO.md`

---

## ✅ Comandos de verificación rápida

```bash
curl -i http://127.0.0.1:8080/api/health

curl -X POST http://127.0.0.1:8080/api/payments/mcw/create-token \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@correo.com\"}"
```

---

**Estado:** integración completa en modo TEST lista para desplegar y validar IPN.