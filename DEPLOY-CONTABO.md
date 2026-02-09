# Deploy en Contabo (VPS) — 24/7 barato

Esta guía asume **Ubuntu 22.04/24.04** en Contabo y despliegue con **Docker + Nginx + SSL**.

> Nota: en VPS pagas **mensual fijo**, no “por consulta”. La ventaja es que es más barato que Railway y corre 24/7.

## 1) Crear VPS en Contabo

- Elige un VPS con **mínimo 2 vCPU y 4GB RAM** (Playwright/Chromium consume RAM).
- En “Image” elige **Ubuntu 22.04** o **Ubuntu 24.04**.
- Activa acceso por **SSH** (ideal: agrega tu SSH key).

## 2) Entrar por SSH

Desde Windows (PowerShell):

```powershell
ssh root@IP_DE_TU_VPS
```

## 3) Preparar el servidor (Docker + firewall)

En el VPS:

```bash
apt update -y && apt upgrade -y

# Firewall básico
apt install -y ufw
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

# Docker
apt install -y docker.io docker-compose-plugin git
systemctl enable --now docker
```

## 4) Clonar tu repo

```bash
cd /opt
git clone https://github.com/carlos-zeballos/Consulta-vehicular.git
cd Consulta-vehicular
```

## 5) Crear `.env` en el VPS (NO se sube a GitHub)

```bash
nano .env
```

Ejemplo (rellena con valores reales):

```env
NODE_ENV=production
BASE_PATH=

FACTILIZA_TOKEN=Bearer xxxx
CAPTCHA_API_KEY=xxxx
ACCESS_TOKEN=APP_USR-xxxx
PUBLIC_KEY=APP_USR-xxxx

# Cupones (secretos)
COUPON_ADMIN_CODE=ADMIN-XXXX-ROOT
COUPONS_PUBLIC_CODES=PROMO-AAA:5,PROMO-BBB:5
COUPON_HASH_SALT=pon_un_valor_largo_y_unico
```

## 6) Levantar la app con Docker Compose

```bash
docker compose up -d --build
docker compose logs -f --tail=200
```

Verifica health:

```bash
curl -s http://127.0.0.1:8080/api/health
```

## 7) Instalar Nginx y publicar dominio

```bash
apt install -y nginx
```

Copiar config (edita el dominio):

```bash
cp nginx/consulta-vehicular.conf /etc/nginx/sites-available/consulta-vehicular.conf
nano /etc/nginx/sites-available/consulta-vehicular.conf
```

Reemplaza `TU_DOMINIO.com` por tu dominio real (ej: `consultavehicular.pe`).

Habilitar sitio:

```bash
ln -s /etc/nginx/sites-available/consulta-vehicular.conf /etc/nginx/sites-enabled/consulta-vehicular.conf
nginx -t
systemctl reload nginx
```

## 8) DNS del dominio

En tu proveedor DNS (Cloudflare/Namecheap/etc.):

- Crea un **A record**:
  - `@` → `IP_DE_TU_VPS`
- (Opcional) `www` → `IP_DE_TU_VPS`

Espera propagación.

## 9) SSL gratis con Let’s Encrypt (Certbot)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d TU_DOMINIO.com -d www.TU_DOMINIO.com
```

Certbot configura HTTPS y renueva automático.

## 10) Operación

- Ver logs:

```bash
docker compose logs -f --tail=200
```

- Reiniciar:

```bash
docker compose restart
```

- Actualizar a última versión:

```bash
git pull
docker compose up -d --build
```

## Recomendación de recursos

- Si se cae Chromium/Playwright por memoria, sube a **8GB RAM** o reduce concurrencia (ya está limitada en frontend).

