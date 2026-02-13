# 🔧 Solución: Error "Transacción ya realizada" en Izipay

## 🎯 Problema
Al hacer clic en "Comprar", aparece el error:
- "Transacción ya realizada"
- "Recuerde que su tarjeta activa para compras en línea"
- No se muestra la pasarela de pago con las tarjetas

---

## ✅ CAUSAS POSIBLES

### 1. TransId Duplicado
Izipay no permite usar el mismo `transId` dos veces en el mismo día. Si el servidor se reinició o hay pagos anteriores, puede haber conflictos.

### 2. OrderId Duplicado
Aunque es menos común, un `orderId` duplicado también puede causar problemas.

### 3. Firma Inválida
Si la firma (signature) no es correcta, Izipay rechazará la transacción.

### 4. Configuración Incorrecta
- Site ID incorrecto
- Llave de TEST incorrecta
- Modo (TEST/PRODUCTION) no coincide con la llave

---

## ✅ SOLUCIONES

### Solución 1: Limpiar Pagos Antiguos

En el servidor:

```bash
cd /opt/Consulta-vehicular

# Ver pagos almacenados
cat data/payments.json | grep -A 5 "izipay"

# Si hay muchos pagos antiguos, puedes limpiarlos
# (Hacer backup primero)
cp data/payments.json data/payments.json.backup

# Editar y limpiar pagos antiguos (opcional)
nano data/payments.json
```

### Solución 2: Verificar Logs del Servidor

```bash
# Ver logs en tiempo real
tail -f server.log | grep IZIPAY

# O con PM2
pm2 logs consulta-vehicular | grep IZIPAY
```

**Busca estos mensajes:**
- `[IZIPAY] init -> orderId=... transId=...`
- `[IZIPAY] transId duplicado detectado`
- `[IZIPAY] orderId duplicado detectado`

### Solución 3: Verificar Configuración

```bash
# Verificar variables de entorno
grep IZIPAY .env

# Debe mostrar:
# IZIPAY_SITE_ID=tu_site_id
# IZIPAY_CTX_MODE=TEST
# IZIPAY_TEST_KEY=tu_test_key
```

### Solución 4: Reiniciar Contador de TransId

Si el problema persiste, puedes forzar un nuevo contador:

```bash
# Editar server.js temporalmente para resetear contador
# O simplemente reiniciar el servidor a medianoche (cuando cambia el día)
```

---

## 🔍 DEBUGGING

### Ver qué está devolviendo el endpoint

En el navegador (F12 > Console):

```javascript
// Probar el endpoint directamente
fetch('/api/izipay/init', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@test.com' })
})
.then(r => r.json())
.then(data => console.log('Respuesta:', data));
```

**Debe devolver:**
```json
{
  "formAction": "https://secure.micuentaweb.pe/vads-payment/",
  "fields": {
    "vads_action_mode": "INTERACTIVE",
    "vads_amount": "1500",
    "vads_ctx_mode": "TEST",
    "vads_currency": "604",
    "vads_order_id": "IZI-...",
    "vads_trans_id": "000001",
    "signature": "...",
    ...
  }
}
```

### Verificar que el formulario se envía

En el navegador (F12 > Network):
1. Hacer clic en "Comprar"
2. Ver la petición a `/api/izipay/init`
3. Verificar la respuesta
4. Ver si hay una redirección a `secure.micuentaweb.pe`

---

## 🐛 Si el problema persiste

### Opción A: Verificar en el Back Office de Izipay

1. Entra a tu Back Office de Izipay
2. Ve a **Transacciones**
3. Busca transacciones recientes con el mismo `transId`
4. Si hay duplicados, el problema está en la generación de `transId`

### Opción B: Usar transId basado en timestamp

Si el contador sigue dando problemas, podemos cambiar a usar timestamp directamente:

```javascript
// En lugar de contador, usar timestamp
const transId = String(Date.now() % 1000000).padStart(6, "0");
```

### Opción C: Verificar Firma

La firma debe calcularse correctamente. Verifica en los logs:

```bash
tail -f server.log | grep signature
```

---

## ✅ CHECKLIST

- [ ] ✅ Variables de entorno configuradas correctamente
- [ ] ✅ `IZIPAY_CTX_MODE=TEST` (si estás en modo test)
- [ ] ✅ `IZIPAY_TEST_KEY` tiene el valor correcto
- [ ] ✅ No hay transIds duplicados en el mismo día
- [ ] ✅ El servidor está usando el código actualizado
- [ ] ✅ Los logs muestran orderId y transId únicos
- [ ] ✅ La firma se calcula correctamente

---

**✅ Después de aplicar estas soluciones, el error "Transacción ya realizada" debería desaparecer.**
