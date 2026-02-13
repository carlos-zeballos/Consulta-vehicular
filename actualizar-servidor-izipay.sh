#!/bin/bash
# Script para actualizar el servidor y eliminar referencias de Mercado Pago
# Ejecutar en el servidor: bash actualizar-servidor-izipay.sh

echo "═══════════════════════════════════════════════════"
echo "  ACTUALIZAR SERVIDOR - ELIMINAR MERCADO PAGO"
echo "═══════════════════════════════════════════════════"
echo ""

cd /opt/Consulta-vehicular

# 1. Verificar estado actual
echo "📋 Estado actual del repositorio:"
git status

# 2. Actualizar desde GitHub
echo ""
echo "🔄 Actualizando código desde GitHub..."
git fetch origin
git pull origin main

# 3. Verificar que se actualizó
echo ""
echo "📋 Último commit:"
git log --oneline -1

# 4. Verificar que no hay referencias a Mercado Pago
echo ""
echo "🔍 Verificando referencias a Mercado Pago..."
if grep -r "mercadopago\|MERCADOPAGO" server.js 2>/dev/null; then
    echo "⚠️  ADVERTENCIA: Aún hay referencias a Mercado Pago en server.js"
else
    echo "✅ No se encontraron referencias a Mercado Pago"
fi

# 5. Verificar que comprar.html existe
if [ -f "public/comprar.html" ]; then
    echo "✅ public/comprar.html existe"
else
    echo "❌ ERROR: public/comprar.html NO existe"
fi

# 6. Verificar que comprar-mercadopago.html NO existe
if [ -f "public/comprar-mercadopago.html" ]; then
    echo "⚠️  ADVERTENCIA: public/comprar-mercadopago.html aún existe (debe eliminarse)"
    rm -f public/comprar-mercadopago.html
    echo "✅ Eliminado"
else
    echo "✅ public/comprar-mercadopago.html no existe (correcto)"
fi

# 7. Reiniciar aplicación
echo ""
echo "🔄 Reiniciando aplicación..."
pm2 restart consulta-vehicular
pm2 save

# 8. Verificar logs
echo ""
echo "═══════════════════════════════════════════════════"
echo "  ÚLTIMOS LOGS"
echo "═══════════════════════════════════════════════════"
pm2 logs consulta-vehicular --lines 20 --nostream

echo ""
echo "✅ Actualización completada"
echo ""
echo "🔍 Verificar que funciona:"
echo "   curl http://localhost:3000/comprar"
echo "   (Debe devolver HTML de comprar.html, NO mercadopago)"
