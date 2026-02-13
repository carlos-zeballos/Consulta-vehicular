# 🔧 Solución: Error wc.js - updateToken

## 🎯 Problema
Error en el navegador:
```
Uncaught TypeError: Cannot read properties of null (reading 'updateToken')
at wc.js:2:706278
```

Este error proviene del SDK de Mercado Pago que quedó en caché del navegador.

---

## ✅ SOLUCIÓN

### Opción 1: Limpiar caché del navegador (Recomendado)

1. **En Chrome/Edge:**
   - Presiona `Ctrl + Shift + Delete` (Windows) o `Cmd + Shift + Delete` (Mac)
   - Selecciona "Caché" y "Imágenes y archivos en caché"
   - Período: "Última hora" o "Todo el tiempo"
   - Clic en "Borrar datos"

2. **O usar modo incógnito:**
   - Presiona `Ctrl + Shift + N` (Windows) o `Cmd + Shift + N` (Mac)
   - Abre `https://consultavehicular.services` en modo incógnito

3. **O forzar recarga sin caché:**
   - Presiona `Ctrl + Shift + R` (Windows) o `Cmd + Shift + R` (Mac)
   - Esto fuerza la recarga de todos los recursos

### Opción 2: Verificar que no hay referencias residuales

El código ya no tiene referencias a Mercado Pago, pero si el error persiste:

1. **Abrir consola del navegador (F12)**
2. **Ir a la pestaña "Network" (Red)**
3. **Recargar la página**
4. **Buscar si se está cargando `wc.js` o `mercadopago`**
5. **Si aparece, es caché del navegador**

### Opción 3: Verificar Service Workers

Si hay un Service Worker activo, puede estar sirviendo versiones antiguas:

1. **Abrir consola (F12)**
2. **Ir a "Application" > "Service Workers"**
3. **Si hay alguno registrado, hacer clic en "Unregister"**
4. **Recargar la página**

---

## 🔍 VERIFICAR QUE NO HAY REFERENCIAS

En el servidor, verificar que no hay referencias a Mercado Pago:

```bash
cd /opt/Consulta-vehicular
grep -r "mercadopago\|MERCADOPAGO\|sdk.mercadopago" public/ || echo "✅ No se encontraron referencias"
```

---

## ✅ SOLUCIÓN DEFINITIVA

Si el problema persiste después de limpiar caché:

1. **El error es del navegador, no del servidor**
2. **El código del servidor ya no tiene Mercado Pago**
3. **Es caché del navegador del usuario**

**Solución:** Pedirle al usuario que limpie la caché o use modo incógnito.

---

## 📋 CHECKLIST

- [ ] ✅ Código del servidor no tiene referencias a Mercado Pago
- [ ] ✅ Usuario limpió caché del navegador
- [ ] ✅ Usuario probó en modo incógnito
- [ ] ✅ Usuario forzó recarga sin caché (Ctrl+Shift+R)
- [ ] ✅ Service Workers desregistrados (si aplica)

---

**✅ El error es del navegador (caché), no del servidor. El código ya está limpio.**
