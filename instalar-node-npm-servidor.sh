#!/bin/bash
# Script para instalar Node.js y npm en el servidor
# Ejecutar como root: bash instalar-node-npm-servidor.sh

echo "═══════════════════════════════════════════════════"
echo "  INSTALACIÓN DE NODE.JS Y NPM"
echo "═══════════════════════════════════════════════════"
echo ""

# Verificar si Node.js ya está instalado
if command -v node &> /dev/null; then
    echo "✅ Node.js ya está instalado:"
    node --version
else
    echo "⚠️  Node.js no está instalado. Instalando..."
    
    # Actualizar sistema
    apt update
    
    # Instalar Node.js y npm
    apt install -y nodejs npm
    
    echo "✅ Node.js y npm instalados"
fi

# Verificar versiones
echo ""
echo "═══════════════════════════════════════════════════"
echo "  VERSIONES INSTALADAS"
echo "═══════════════════════════════════════════════════"
node --version
npm --version

echo ""
echo "═══════════════════════════════════════════════════"
echo "  INSTALAR DEPENDENCIAS DEL PROYECTO"
echo "═══════════════════════════════════════════════════"
cd /opt/Consulta-vehicular

# Verificar si existe package.json
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json no encontrado en /opt/Consulta-vehicular"
    exit 1
fi

# Instalar dependencias
echo "Instalando dependencias (esto puede tardar varios minutos)..."
npm install --production

echo ""
echo "✅ Dependencias instaladas correctamente"
echo ""
echo "═══════════════════════════════════════════════════"
echo "  VERIFICAR INSTALACIÓN DE MERCADOPAGO"
echo "═══════════════════════════════════════════════════"
if npm list mercadopago &> /dev/null; then
    echo "✅ mercadopago está instalado"
    npm list mercadopago
else
    echo "⚠️  mercadopago no está en node_modules, instalando..."
    npm install mercadopago --save
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  LISTO PARA REINICIAR"
echo "═══════════════════════════════════════════════════"
echo "Ahora puedes reiniciar la aplicación:"
echo "  pm2 restart consulta-vehicular"
echo "  pm2 save"
