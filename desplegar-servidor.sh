#!/bin/bash
# Script de despliegue para servidor de producción
# Uso: ./desplegar-servidor.sh

set -e  # Salir si hay errores

echo "═══════════════════════════════════════════════════"
echo "  DESPLIEGUE EN SERVIDOR DE PRODUCCIÓN"
echo "═══════════════════════════════════════════════════"
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar que estamos en el directorio correcto
if [ ! -f "server.js" ]; then
    echo -e "${RED}❌ Error: No se encontró server.js${NC}"
    echo "   Ejecuta este script desde el directorio raíz del proyecto"
    exit 1
fi

# Directorio del proyecto (ajustar según tu configuración)
PROJECT_DIR="/var/www/app"
# O si está en otro lugar:
# PROJECT_DIR="/opt/Consulta-vehicular"

echo -e "${YELLOW}📂 Directorio del proyecto: ${PROJECT_DIR}${NC}"
echo ""

# 1. Hacer backup del .env actual
echo -e "${YELLOW}📦 Haciendo backup del .env actual...${NC}"
if [ -f "${PROJECT_DIR}/.env" ]; then
    cp "${PROJECT_DIR}/.env" "${PROJECT_DIR}/.env.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${GREEN}✅ Backup creado${NC}"
else
    echo -e "${YELLOW}⚠️  No se encontró .env existente${NC}"
fi
echo ""

# 2. Actualizar código desde GitHub
echo -e "${YELLOW}🔄 Actualizando código desde GitHub...${NC}"
cd "${PROJECT_DIR}"
git fetch origin
git pull origin main
echo -e "${GREEN}✅ Código actualizado${NC}"
echo ""

# 3. Instalar/actualizar dependencias
echo -e "${YELLOW}📦 Instalando dependencias...${NC}"
npm install --production
echo -e "${GREEN}✅ Dependencias instaladas${NC}"
echo ""

# 4. Verificar que .env existe
if [ ! -f "${PROJECT_DIR}/.env" ]; then
    echo -e "${RED}❌ Error: No se encontró .env${NC}"
    echo "   Crea el archivo .env antes de continuar"
    exit 1
fi

echo -e "${GREEN}✅ Archivo .env encontrado${NC}"
echo ""

# 5. Reiniciar aplicación con PM2
echo -e "${YELLOW}🔄 Reiniciando aplicación con PM2...${NC}"
pm2 restart consulta-vehicular || pm2 start server.js --name "consulta-vehicular" --cwd "${PROJECT_DIR}"
pm2 save
echo -e "${GREEN}✅ Aplicación reiniciada${NC}"
echo ""

# 6. Verificar estado
echo -e "${YELLOW}📊 Verificando estado...${NC}"
sleep 3
pm2 status
echo ""

# 7. Ver logs recientes
echo -e "${YELLOW}📋 Últimos logs:${NC}"
pm2 logs consulta-vehicular --lines 20 --nostream
echo ""

echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ DESPLIEGUE COMPLETADO${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "🔍 Verifica que todo funciona:"
echo "   - pm2 logs consulta-vehicular"
echo "   - curl http://localhost:3000/api/health"
echo ""
