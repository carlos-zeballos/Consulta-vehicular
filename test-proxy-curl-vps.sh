#!/bin/bash
# Script para probar el proxy desde el VPS con curl
# Ejecutar en el servidor VPS: bash test-proxy-curl-vps.sh

echo "═══════════════════════════════════════════════════"
echo "🧪 PRUEBA PROXY 2CAPTCHA CON CURL (VPS)"
echo "═══════════════════════════════════════════════════"
echo ""

PROXY_URL="http://uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334"

echo "Proxy configurado: http://uae12c98557ca05dd-zone-custom-...:uae12c98557ca05dd@na.proxy.2captcha.com:2334"
echo ""
echo "Probando con Google (HTTPS)..."
echo "Comando: curl -v -x \"$PROXY_URL\" https://www.google.com"
echo ""

curl -v -x "$PROXY_URL" https://www.google.com 2>&1

echo ""
echo ""
echo "═══════════════════════════════════════════════════"
echo "Si ves 'Proxy CONNECT aborted' o similar, el proxy"
echo "no está respondiendo correctamente al método CONNECT."
echo "═══════════════════════════════════════════════════"
