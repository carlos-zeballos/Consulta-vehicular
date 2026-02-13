#!/bin/bash
# Script para actualizar variables de entorno en el servidor
# Uso: ./actualizar-env-servidor.sh

set -e

echo "═══════════════════════════════════════════════════"
echo "  ACTUALIZACIÓN DE VARIABLES DE ENTORNO"
echo "═══════════════════════════════════════════════════"
echo ""

# Directorio del proyecto
PROJECT_DIR="/var/www/app"
# O si está en otro lugar:
# PROJECT_DIR="/opt/Consulta-vehicular"

ENV_FILE="${PROJECT_DIR}/.env"

# Verificar que el archivo existe
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: No se encontró .env en ${PROJECT_DIR}"
    echo "   Creando archivo .env desde ejemplo..."
    if [ -f "${PROJECT_DIR}/env.example.txt" ]; then
        cp "${PROJECT_DIR}/env.example.txt" "$ENV_FILE"
    else
        touch "$ENV_FILE"
    fi
fi

# Hacer backup
cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
echo "✅ Backup creado"
echo ""

# Leer las líneas 1-27 del .env (si el usuario las proporcionó)
# Por ahora, vamos a crear un script interactivo

echo "📝 IMPORTANTE: Debes editar manualmente el archivo .env"
echo "   Ubicación: ${ENV_FILE}"
echo ""
echo "🔧 Abriendo editor..."
echo ""

# Intentar abrir con nano (más amigable)
if command -v nano &> /dev/null; then
    nano "$ENV_FILE"
elif command -v vi &> /dev/null; then
    vi "$ENV_FILE"
else
    echo "❌ No se encontró editor. Edita manualmente: ${ENV_FILE}"
    exit 1
fi

echo ""
echo "✅ Archivo .env actualizado"
echo ""
echo "⚠️  IMPORTANTE: Reinicia la aplicación para aplicar los cambios:"
echo "   pm2 restart consulta-vehicular"
echo ""
