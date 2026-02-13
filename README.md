# Consulta Vehicular

Sistema de consulta vehicular completo que integra múltiples fuentes de información para generar reportes detallados de vehículos en Perú.

## 🚀 Características

- Consulta de información vehicular desde múltiples fuentes
- Generación de reportes PDF completos
- Integración con MiCuentaWeb/Izipay (Krypton V4) para pagos
- Resolución automática de CAPTCHAs
- Consulta de SOAT, CITV, SBS, SUTRAN y más

## 📋 Requisitos

- Node.js >= 18.x
- npm >= 9.x

## 🔧 Instalación

1. Clonar el repositorio:
```bash
git clone https://github.com/carlos-zeballos/Consulta-vehicular.git
cd consulta-vehicular
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
```bash
cp env.example.txt .env
# Editar .env con tus credenciales
```

4. Iniciar el servidor:
```bash
npm start
```

El servidor estará disponible en `http://localhost:3000`

## 🔐 Variables de Entorno

Configura las siguientes variables en tu archivo `.env`:

- `PORT`: Puerto del servidor (default: 3000)
- `FACTILIZA_TOKEN`: Token de la API Factiliza
- `CAPTCHA_API_KEY`: API Key de 2Captcha
- `MCW_API_USER`: Usuario API MiCuentaWeb
- `MCW_API_PASSWORD`: Password API MiCuentaWeb
- `MCW_PUBLIC_KEY`: Public Key MiCuentaWeb (Krypton)
- `MCW_HMAC_KEY`: HMAC key para validar kr-hash
- `MCW_RETURN_OK`: URL de retorno OK
- `MCW_RETURN_KO`: URL de retorno error
- `MCW_IPN_URL`: URL IPN (webhook)

## 📦 Estructura del Proyecto

```
├── server.js              # Servidor principal Express
├── renderPdf.js           # Generación de reportes PDF
├── buildVehicleReport.js  # Construcción de reportes
├── calculateRiskScore.js  # Cálculo de puntaje de riesgo
├── public/                # Frontend (HTML, CSS, JS)
├── scrapers/              # Scrapers para diferentes fuentes
└── package.json           # Dependencias del proyecto
```

## 🛠️ Tecnologías Utilizadas

- Express.js
- Playwright / Puppeteer
- Krypton JS (MiCuentaWeb/Izipay)
- 2Captcha API
- PDF Generation

## 📄 Licencia

ISC
