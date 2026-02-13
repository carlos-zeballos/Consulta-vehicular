#!/bin/bash
# Script completo para instalar npm y todas las dependencias
# Ejecutar en el servidor: bash instalar-npm-y-dependencias.sh

echo "═══════════════════════════════════════════════════"
echo "  INSTALAR NPM Y DEPENDENCIAS"
echo "═══════════════════════════════════════════════════"
echo ""

cd /opt/Consulta-vehicular

# 1. Detener procesos de Node
echo "🛑 Deteniendo procesos de Node..."
pkill -f "node.*server.js" || true
sleep 2

# 2. Verificar si npm está instalado
if ! command -v npm &> /dev/null; then
    echo "⚠️  npm no está instalado. Instalando..."
    
    # Actualizar sistema
    apt update
    
    # Instalar Node.js y npm
    apt install -y nodejs npm
    
    # Verificar instalación
    if command -v npm &> /dev/null; then
        echo "✅ npm instalado correctamente"
        echo "   Versión npm: $(npm --version)"
        echo "   Versión node: $(node --version)"
    else
        echo "❌ ERROR: No se pudo instalar npm"
        exit 1
    fi
else
    echo "✅ npm ya está instalado"
    echo "   Versión npm: $(npm --version)"
    echo "   Versión node: $(node --version)"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  INSTALAR DEPENDENCIAS"
echo "═══════════════════════════════════════════════════"
echo ""

# 3. Verificar package.json
if [ ! -f "package.json" ]; then
    echo "❌ ERROR: package.json no encontrado"
    exit 1
fi

echo "✅ package.json encontrado"

# 4. Limpiar cache de npm (opcional)
echo "🧹 Limpiando cache de npm..."
npm cache clean --force || true

# 5. Instalar dependencias
echo "📦 Instalando dependencias (esto puede tardar 5-10 minutos)..."
echo "   Por favor, espera a que termine completamente..."
echo ""

npm install --production

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Dependencias instaladas correctamente"
else
    echo ""
    echo "❌ ERROR: Falló la instalación de dependencias"
    echo "   Intentando sin --production..."
    npm install
fi

# 6. Verificar instalación
echo ""
echo "═══════════════════════════════════════════════════"
echo "  VERIFICAR INSTALACIÓN"
echo "═══════════════════════════════════════════════════"
echo ""

if [ -d "node_modules" ] && [ "$(ls -A node_modules)" ]; then
    echo "✅ node_modules creado correctamente"
    echo "   Total de paquetes: $(ls node_modules | wc -l)"
    
    # Verificar dependencias críticas
    echo ""
    echo "🔍 Verificando dependencias críticas..."
    CRITICAL_DEPS=("dotenv" "express" "axios" "playwright" "puppeteer" "cors")
    for dep in "${CRITICAL_DEPS[@]}"; do
        if [ -d "node_modules/$dep" ]; then
            echo "  ✅ $dep instalado"
        else
            echo "  ⚠️  $dep NO encontrado"
        fi
    done
else
    echo "❌ ERROR: node_modules está vacío o no existe"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  LISTO PARA INICIAR"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Ahora puedes iniciar la aplicación:"
echo "  nohup node server.js > server.log 2>&1 &"
echo ""
echo "Y verificar logs:"
echo "  tail -f server.log"
