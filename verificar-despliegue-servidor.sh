#!/bin/bash
# Script para verificar que el servidor tiene el código actualizado
# Ejecutar en el servidor: bash verificar-despliegue-servidor.sh

echo "═══════════════════════════════════════════════════"
echo "  VERIFICACIÓN DE DESPLIEGUE"
echo "═══════════════════════════════════════════════════"
echo ""

cd /opt/Consulta-vehicular

# 1. Verificar último commit local
echo "📋 Último commit LOCAL:"
git log --oneline -1
echo ""

# 2. Verificar último commit en GitHub
echo "📋 Último commit en GITHUB:"
git fetch origin
git log origin/main --oneline -1
echo ""

# 3. Comparar
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main)

if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
    echo "⚠️  ADVERTENCIA: El código local NO está actualizado"
    echo "   Local:  $LOCAL_COMMIT"
    echo "   Remote: $REMOTE_COMMIT"
    echo ""
    echo "🔄 Actualizando código..."
    git pull origin main
    echo ""
    echo "✅ Código actualizado. Reiniciando aplicación..."
    pm2 restart consulta-vehicular
    pm2 save
else
    echo "✅ El código está actualizado"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ESTADO DE LA APLICACIÓN"
echo "═══════════════════════════════════════════════════"
pm2 status
echo ""

echo "═══════════════════════════════════════════════════"
echo "  VERIFICACIÓN DE VARIABLES DE ENTORNO"
echo "═══════════════════════════════════════════════════"
echo "BASE_URL:"
grep BASE_URL .env | head -1
echo ""
echo "IZIPAY_CTX_MODE:"
grep IZIPAY_CTX_MODE .env | head -1
echo ""

echo "═══════════════════════════════════════════════════"
echo "  VERIFICACIÓN DE RESPUESTA DEL SERVIDOR"
echo "═══════════════════════════════════════════════════"
curl -s http://localhost:3000/api/health || echo "❌ El servidor no responde"
echo ""

echo "═══════════════════════════════════════════════════"
echo "  ÚLTIMOS LOGS"
echo "═══════════════════════════════════════════════════"
pm2 logs consulta-vehicular --lines 10 --nostream
echo ""
