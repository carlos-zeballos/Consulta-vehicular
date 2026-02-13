#!/bin/bash
# Script para actualizar .gitignore en el servidor
# Ejecutar en el servidor: bash actualizar-gitignore-servidor.sh

cd /opt/Consulta-vehicular

echo "📝 Actualizando .gitignore..."

# Agregar reglas para archivos de prueba y proxies
cat >> .gitignore << 'EOF'

# ============================================
# Archivos de prueba y temporales
# ============================================
smoke-*.js
smoke.out.txt
*.out.txt

# ============================================
# Scripts de proxy y pruebas MTC
# ============================================
mtc-*.txt
*_proxies.py
mtc_proxy_probe.py
probe_mtc_proxies.py
probed_mtc_proxies.py

# ============================================
# Archivos temporales de desarrollo
# ============================================
*.tmp
*.log
*.bak
EOF

echo "✅ .gitignore actualizado"
echo ""
echo "📋 Verificando archivos ignorados:"
git status --ignored | grep -E "smoke|mtc|probe" || echo "   (ninguno visible, están ignorados)"
echo ""
echo "✅ Listo. Los archivos de prueba ahora están ignorados."
