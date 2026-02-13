# 🔧 Solución: npm no encontrado en el servidor

## 🎯 Problema
Al intentar ejecutar `npm install mercadopago`, aparece el error:
```
Command 'npm' not found, but can be installed with: apt install npm
```

---

## ✅ SOLUCIÓN RÁPIDA

### Opción 1: Instalar npm directamente (Recomendado)

```bash
# Actualizar sistema
apt update

# Instalar Node.js y npm
apt install -y nodejs npm

# Verificar instalación
node --version
npm --version

# Ir al directorio del proyecto
cd /opt/Consulta-vehicular

# Instalar dependencias
npm install --production

# Instalar específicamente mercadopago
npm install mercadopago --save
```

### Opción 2: Usar el script automático

```bash
cd /opt/Consulta-vehicular
bash instalar-node-npm-servidor.sh
```

---

## 🔍 VERIFICAR INSTALACIÓN

```bash
# Verificar Node.js
node --version
# Debe mostrar algo como: v18.x.x o v20.x.x

# Verificar npm
npm --version
# Debe mostrar algo como: 9.x.x o 10.x.x

# Verificar que mercadopago está instalado
cd /opt/Consulta-vehicular
npm list mercadopago
```

---

## ⚠️ Si Node.js está instalado pero npm no funciona

### Problema: Node.js instalado pero npm no en PATH

```bash
# Buscar dónde está npm
which npm
whereis npm

# Si no está, reinstalar
apt remove nodejs npm
apt update
apt install -y nodejs npm
```

### Problema: Versión muy antigua de Node.js

Si tienes una versión muy antigua, considera usar `nvm` (Node Version Manager):

```bash
# Instalar nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Recargar shell
source ~/.bashrc

# Instalar Node.js LTS
nvm install --lts
nvm use --lts

# Verificar
node --version
npm --version
```

---

## 📋 DESPUÉS DE INSTALAR

1. **Instalar dependencias del proyecto:**
   ```bash
   cd /opt/Consulta-vehicular
   npm install --production
   ```

2. **Verificar que mercadopago está instalado:**
   ```bash
   npm list mercadopago
   ```

3. **Reiniciar la aplicación:**
   ```bash
   pm2 restart consulta-vehicular
   pm2 save
   ```

4. **Verificar logs:**
   ```bash
   pm2 logs consulta-vehicular --lines 40
   ```

---

## ✅ CHECKLIST

- [ ] ✅ Node.js instalado (`node --version`)
- [ ] ✅ npm instalado (`npm --version`)
- [ ] ✅ Dependencias instaladas (`npm install --production`)
- [ ] ✅ mercadopago instalado (`npm list mercadopago`)
- [ ] ✅ Aplicación reiniciada (`pm2 restart`)
- [ ] ✅ Logs sin errores (`pm2 logs`)

---

## 🐛 Si sigue sin funcionar

### Verificar PATH

```bash
echo $PATH
which node
which npm
```

### Reinstalar completamente

```bash
# Remover versiones antiguas
apt remove nodejs npm -y
apt purge nodejs npm -y

# Limpiar cache
apt clean
apt autoclean

# Instalar de nuevo
apt update
apt install -y nodejs npm

# Verificar
node --version
npm --version
```

---

**✅ Después de estos pasos, `npm install mercadopago` debería funcionar correctamente.**
