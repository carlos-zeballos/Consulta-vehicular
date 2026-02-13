# Solución: orderId NOT_FOUND

## ❌ ¿Qué significa este error?

```
[IZIPAY] status -> orderId=IZI-MLL1076R-A4C8D5D1A067 NOT_FOUND
```

Este error significa que el sistema **no puede encontrar el registro del pago** con ese `orderId`. Esto puede pasar por varias razones:

### Causas posibles:

1. **El servidor se reinició** y perdió los datos en memoria
   - Los datos solo se guardan en el archivo `data/payments.json` cuando se completa cierta acción
   - Si el servidor se reinicia antes de que se guarde, se pierde el registro

2. **El pago no se registró correctamente**
   - Puede que haya un error al crear el pago inicial
   - El `orderId` no se guardó en el sistema

3. **El archivo de persistencia no tiene el registro**
   - El archivo `data/payments.json` puede no tener la sección `izipay`
   - O el registro específico no se guardó

## ✅ Soluciones

### Solución 1: Realizar un nuevo pago

La forma más simple es **realizar un nuevo pago**:

1. Ve a `http://localhost:8080/comprar`
2. Completa el formulario de nuevo
3. Realiza el pago
4. El nuevo `orderId` se registrará correctamente

### Solución 2: Verificar el archivo de persistencia

Verifica si el archivo tiene datos:

```bash
# Ver el contenido del archivo
cat data/payments.json

# O en Windows PowerShell
Get-Content data/payments.json
```

Si el archivo está vacío o no tiene la sección `izipay`, significa que los pagos no se están guardando correctamente.

### Solución 3: Verificar los logs al crear el pago

Cuando inicias un pago, deberías ver en los logs:

```
[IZIPAY] init -> orderId=IZI-... transId=... amount=...
```

Si no ves este log, el pago no se está creando correctamente.

## 🔧 Mejoras Implementadas

He mejorado el código para que:

1. **Intente cargar desde el archivo** si no está en memoria
2. **Muestre mensajes más claros** sobre qué está pasando
3. **Cargue automáticamente** los datos al iniciar el servidor

## 📝 Próximos Pasos

1. **Reinicia el servidor** para aplicar las mejoras
2. **Realiza un nuevo pago** para generar un nuevo `orderId`
3. **Verifica los logs** para asegurarte de que el pago se registra correctamente

## ⚠️ Nota Importante

En desarrollo local, es normal que al reiniciar el servidor se pierdan algunos datos si no se guardaron en el archivo. En producción, esto no debería pasar porque el servidor no se reinicia frecuentemente.
