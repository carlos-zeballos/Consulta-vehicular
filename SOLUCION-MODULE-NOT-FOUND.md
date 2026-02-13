# 🔧 Solución: MODULE_NOT_FOUND - Dependencias faltantes

## 🎯 Problema
El servidor muestra errores como:
```
Error: Cannot find module 'dotenv'
Error: Cannot find module 'express'
```

Esto significa que las dependencias de Node.js no están instaladas.

---

## ✅ SOLUCIÓN COMPLETA

### Paso 1: Detener procesos actuales

```bash
# Matar todos los procesos de Node
pkill -f "node.*server.js"
pkill -f "node server.js"
sleep 2
```

### Paso 2: Ir al directorio del proyecto

```bash
cd /opt/Consulta-vehicular
```

### Paso 3: Verificar que existe package.json

```bash
ls -la package.json
```

### Paso 4: Instalar TODAS las dependencias

```bash
# Instalar dependencias (esto puede tardar 5-10 minutos)
npm install --production

# Si falla, intentar sin --production para instalar también devDependencies
npm install
```

### Paso 5: Verificar que se instalaron

```bash
# Verificar que node_modules existe y tiene contenido
ls -la node_modules | head -20

# Verificar dependencias críticas
ls node_modules | grep -E "dotenv|express|axios|playwright|puppeteer"
```

### Paso 6: Si npm install falla

```bash
# Limpiar cache de npm
npm cache clean --force

# Eliminar node_modules y package-lock.json (si existe)
rm -rf node_modules package-lock.json

# Reinstalar desde cero
npm install --production
```

### Paso 7: Iniciar la aplicación

```bash
# Iniciar con nohup
nohup node server.js > server.log 2>&1 &

# Verificar que está corriendo
ps aux | grep "node.*server.js" | grep -v grep

# Ver logs
tail -f server.log
```

---

## 🔍 VERIFICAR DEPENDENCIAS CRÍTICAS

Después de instalar, verifica que estas dependencias estén presentes:

```bash
cd /opt/Consulta-vehicular
ls node_modules | grep -E "^dotenv$|^express$|^axios$|^playwright$|^puppeteer$|^cors$|^body-parser$"
```

Deben aparecer todas. Si falta alguna, instálala manualmente:

```bash
npm install nombre-del-paquete --save
```

---

## ⚠️ Si npm install tarda mucho o falla

### Problema: Conexión lenta

```bash
# Usar mirror más rápido (opcional)
npm config set registry https://registry.npmjs.org/

# O usar yarn (más rápido)
npm install -g yarn
yarn install --production
```

### Problema: Permisos

```bash
# Verificar permisos del directorio
ls -la /opt/Consulta-vehicular

# Si hay problemas de permisos, corregir
chown -R root:root /opt/Consulta-vehicular
chmod -R 755 /opt/Consulta-vehicular
```

### Problema: Espacio en disco

```bash
# Verificar espacio disponible
df -h

# Si está lleno, limpiar
apt clean
apt autoclean
```

---

## 📋 CHECKLIST DE VERIFICACIÓN

- [ ] ✅ `package.json` existe
- [ ] ✅ `npm install --production` se ejecutó sin errores
- [ ] ✅ `node_modules` existe y tiene contenido
- [ ] ✅ Dependencias críticas están instaladas (dotenv, express, axios, etc.)
- [ ] ✅ Proceso anterior fue detenido
- [ ] ✅ Aplicación inicia sin errores MODULE_NOT_FOUND
- [ ] ✅ Logs muestran "Servidor activo en http://localhost:3000"
- [ ] ✅ `curl http://localhost:3000/api/health` responde

---

## 🚀 COMANDOS RÁPIDOS (Todo en Uno)

```bash
cd /opt/Consulta-vehicular
pkill -f "node.*server.js"
npm install --production
nohup node server.js > server.log 2>&1 &
tail -f server.log
```

---

**✅ Después de estos pasos, todas las dependencias estarán instaladas y la aplicación debería iniciar correctamente.**
