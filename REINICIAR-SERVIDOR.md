# ⚠️ IMPORTANTE: Reiniciar el Servidor

## El problema del 404

El endpoint `/api/izipay/simulate-ipn` está definido en el código, pero el servidor necesita **reiniciarse** para que esté disponible.

## ✅ Solución

### Paso 1: Detener el servidor actual
- Presiona `Ctrl + C` en la terminal donde está corriendo el servidor
- O cierra la terminal

### Paso 2: Reiniciar el servidor
```bash
# Si usas el puerto 8080
PORT=8080 node server.js

# O si tienes un script de inicio
npm start
```

### Paso 3: Verificar que el endpoint esté disponible
Después de reiniciar, deberías ver en los logs algo como:
```
✅ Servidor activo en http://localhost:8080
```

### Paso 4: Probar el endpoint
1. Ve a `http://localhost:8080/pago-ok?orderId=IZI-...`
2. Deberías ver el botón "🔧 Simular Confirmación IPN"
3. Haz clic en el botón
4. Debería funcionar correctamente

## 🔍 Verificación

Si después de reiniciar sigue dando 404, verifica en los logs del servidor cuando hagas clic en el botón. Deberías ver:

```
[IZIPAY] simulate-ipn -> Endpoint llamado, hostname: localhost, url: /api/izipay/simulate-ipn
```

Si no ves este log, el endpoint no se está registrando correctamente.

## 📝 Nota

Cada vez que agregues un nuevo endpoint o modifiques el código del servidor, **debes reiniciar el servidor** para que los cambios surtan efecto.
