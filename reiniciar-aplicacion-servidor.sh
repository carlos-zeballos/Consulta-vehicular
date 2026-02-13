#!/bin/bash
# Script para reiniciar la aplicación en el servidor
# Detecta automáticamente cómo está corriendo (PM2, systemd, screen, etc.)

echo "═══════════════════════════════════════════════════"
echo "  REINICIAR APLICACIÓN"
echo "═══════════════════════════════════════════════════"
echo ""

cd /opt/Consulta-vehicular

# 1. Verificar si PM2 está instalado
if command -v pm2 &> /dev/null; then
    echo "✅ PM2 encontrado"
    echo "🔄 Reiniciando con PM2..."
    pm2 restart consulta-vehicular || pm2 restart all
    pm2 save
    echo ""
    echo "📋 Estado de PM2:"
    pm2 status
    echo ""
    echo "📋 Últimos logs:"
    pm2 logs consulta-vehicular --lines 20 --nostream
    exit 0
fi

# 2. Verificar si hay un servicio systemd
if systemctl list-units --type=service | grep -q "consulta-vehicular\|consulta-vehicular"; then
    echo "✅ Servicio systemd encontrado"
    echo "🔄 Reiniciando servicio..."
    systemctl restart consulta-vehicular || systemctl restart consulta-vehicular.service
    systemctl status consulta-vehicular --no-pager -l
    exit 0
fi

# 3. Verificar si hay procesos de Node corriendo
NODE_PIDS=$(pgrep -f "node.*server.js" || pgrep -f "node.*Consulta-vehicular")
if [ ! -z "$NODE_PIDS" ]; then
    echo "⚠️  Procesos de Node encontrados:"
    ps aux | grep -E "node.*server.js|node.*Consulta-vehicular" | grep -v grep
    echo ""
    echo "🔄 Matando procesos antiguos..."
    pkill -f "node.*server.js" || pkill -f "node.*Consulta-vehicular"
    sleep 2
fi

# 4. Verificar si hay un screen session
SCREEN_SESSION=$(screen -ls | grep -i "consulta\|vehicular" | head -1 | awk '{print $1}')
if [ ! -z "$SCREEN_SESSION" ]; then
    echo "✅ Screen session encontrada: $SCREEN_SESSION"
    echo "🔄 Reiniciando en screen..."
    screen -S "${SCREEN_SESSION}" -X stuff "cd /opt/Consulta-vehicular && node server.js$(printf '\r')"
    exit 0
fi

# 5. Si no hay nada, iniciar directamente
echo "⚠️  No se encontró PM2, systemd ni screen"
echo "🔄 Iniciando aplicación directamente..."
echo ""
echo "💡 Para mantener la aplicación corriendo en background, usa:"
echo "   nohup node server.js > server.log 2>&1 &"
echo ""
echo "   O instala PM2:"
echo "   npm install -g pm2"
echo "   pm2 start server.js --name consulta-vehicular"
echo "   pm2 save"
echo ""

# Verificar si el puerto está en uso
PORT=$(grep -E "^PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo "3000")
if lsof -i :${PORT} &>/dev/null; then
    echo "⚠️  El puerto ${PORT} está en uso. Proceso actual:"
    lsof -i :${PORT}
    echo ""
    read -p "¿Deseas matar el proceso y reiniciar? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        lsof -ti :${PORT} | xargs kill -9 2>/dev/null
        sleep 2
    else
        echo "❌ No se reinició. El proceso anterior sigue corriendo."
        exit 1
    fi
fi

# Iniciar con nohup
nohup node server.js > server.log 2>&1 &
NEW_PID=$!
echo "✅ Aplicación iniciada con PID: $NEW_PID"
echo "📋 Logs en: server.log"
echo ""
echo "Para ver logs en tiempo real:"
echo "  tail -f server.log"
