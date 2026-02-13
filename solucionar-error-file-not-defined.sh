#!/bin/bash
# Script para solucionar el error "File is not defined" en Node.js
# Ejecutar en el servidor: bash solucionar-error-file-not-defined.sh

echo "═══════════════════════════════════════════════════"
echo "  SOLUCIONAR ERROR: File is not defined"
echo "═══════════════════════════════════════════════════"
echo ""

cd /opt/Consulta-vehicular

# 1. Detener procesos
echo "🛑 Deteniendo procesos de Node..."
pkill -f "node.*server.js" || true
sleep 2

# 2. Verificar versión de Node.js
echo "📋 Versión actual de Node.js:"
node --version
npm --version

# 3. El problema es que Node.js 18.19.1 puede tener problemas con cheerio/undici
# Solución: Actualizar Node.js a versión más reciente o usar nvm

echo ""
echo "🔧 Opción 1: Actualizar Node.js a versión LTS más reciente"
echo ""

# Verificar si nvm está instalado
if [ -d "$HOME/.nvm" ] || [ -f "$HOME/.nvm/nvm.sh" ]; then
    echo "✅ nvm encontrado, usando nvm..."
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install --lts
    nvm use --lts
    nvm alias default node
else
    echo "⚠️  nvm no está instalado. Instalando nvm..."
    
    # Instalar nvm
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    
    # Cargar nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # Instalar Node.js LTS
    nvm install --lts
    nvm use --lts
    nvm alias default node
fi

echo ""
echo "📋 Nueva versión de Node.js:"
node --version
npm --version

# 4. Limpiar e reinstalar dependencias
echo ""
echo "🧹 Limpiando node_modules y reinstalando dependencias..."
rm -rf node_modules package-lock.json
npm cache clean --force

# 5. Instalar dependencias
echo ""
echo "📦 Instalando dependencias..."
npm install --production

# 6. Si el problema persiste, actualizar cheerio específicamente
if [ $? -ne 0 ]; then
    echo ""
    echo "⚠️  Problema con dependencias. Actualizando cheerio..."
    npm install cheerio@latest --save
    npm install --production
fi

echo ""
echo "✅ Proceso completado"
echo ""
echo "Ahora intenta iniciar la aplicación:"
echo "  nohup node server.js > server.log 2>&1 &"
echo "  tail -f server.log"
