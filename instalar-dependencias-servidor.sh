#!/bin/bash
# Script para instalar dependencias en el servidor
# Ejecutar en el servidor: bash instalar-dependencias-servidor.sh

echo "═══════════════════════════════════════════════════"
echo "  INSTALAR DEPENDENCIAS"
echo "═══════════════════════════════════════════════════"
echo ""

cd /opt/Consulta-vehicular

# 1. Verificar que existe package.json
if [ ! -f "package.json" ]; then
    echo "❌ ERROR: package.json no encontrado"
    exit 1
fi

# 2. Verificar que npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ ERROR: npm no está instalado"
    echo "Instalando npm..."
    apt update
    apt install -y nodejs npm
fi

echo "✅ npm encontrado: $(npm --version)"
echo "✅ node encontrado: $(node --version)"
echo ""

# 3. Detener procesos de Node si están corriendo
echo "🛑 Deteniendo procesos de Node existentes..."
pkill -f "node.*server.js" || true
sleep 2

# 4. Limpiar node_modules si existe (opcional, para instalación limpia)
if [ -d "node_modules" ]; then
    echo "📦 Limpiando node_modules anterior..."
    # No lo eliminamos, solo instalamos encima
fi

# 5. Instalar dependencias
echo "📦 Instalando dependencias (esto puede tardar varios minutos)..."
npm install --production

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Dependencias instaladas correctamente"
else
    echo ""
    echo "❌ ERROR: Falló la instalación de dependencias"
    exit 1
fi

# 6. Verificar que node_modules existe y tiene contenido
if [ -d "node_modules" ] && [ "$(ls -A node_modules)" ]; then
    echo "✅ node_modules creado correctamente"
    echo "   Total de paquetes: $(ls node_modules | wc -l)"
else
    echo "❌ ERROR: node_modules está vacío o no existe"
    exit 1
fi

# 7. Verificar dependencias críticas
echo ""
echo "🔍 Verificando dependencias críticas..."
CRITICAL_DEPS=("express" "axios" "playwright" "puppeteer")
for dep in "${CRITICAL_DEPS[@]}"; do
    if [ -d "node_modules/$dep" ]; then
        echo "  ✅ $dep instalado"
    else
        echo "  ⚠️  $dep NO encontrado"
    fi
done

echo ""
echo "═══════════════════════════════════════════════════"
echo "  LISTO PARA INICIAR"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Ahora puedes iniciar la aplicación:"
echo "  nohup node server.js > server.log 2>&1 &"
echo ""
echo "O con PM2 (si está instalado):"
echo "  pm2 start server.js --name consulta-vehicular"
echo "  pm2 save"
