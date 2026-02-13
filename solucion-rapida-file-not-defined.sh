#!/bin/bash
# Solución rápida: Actualizar cheerio a versión compatible
# Ejecutar en el servidor: bash solucion-rapida-file-not-defined.sh

echo "═══════════════════════════════════════════════════"
echo "  SOLUCIÓN RÁPIDA: Actualizar cheerio"
echo "═══════════════════════════════════════════════════"
echo ""

cd /opt/Consulta-vehicular

# Detener procesos
pkill -f "node.*server.js" || true
sleep 2

# Actualizar cheerio a versión más reciente compatible
echo "📦 Actualizando cheerio..."
npm install cheerio@latest --save

# Reinstalar dependencias
echo "📦 Reinstalando dependencias..."
npm install --production

echo ""
echo "✅ Cheerio actualizado"
echo ""
echo "Iniciar aplicación:"
echo "  nohup node server.js > server.log 2>&1 &"
