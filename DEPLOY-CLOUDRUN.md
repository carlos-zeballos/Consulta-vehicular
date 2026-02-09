# Deploy barato "pago por consulta" (Cloud Run) + Dominio

Tu proyecto es **Node/Express + Playwright/Chromium** (scrapers + PDF). Para cobrar “por consulta”, lo ideal es un servicio que **escale a cero** y cobre por **requests/CPU/tiempo**: **Google Cloud Run**.

## 1) Requisitos

- Proyecto ya está en GitHub: `carlos-zeballos/Consulta-vehicular`
- Tener cuenta Google Cloud y habilitar facturación (Cloud Run usa “pay as you go”, pero suele tener free tier).
- Tener el dominio (en Cloudflare / Namecheap / etc.)

## 2) Variables de entorno (secretos)

Configura en Cloud Run (no en el código):

- `FACTILIZA_TOKEN`
- `CAPTCHA_API_KEY`
- `ACCESS_TOKEN`
- `PUBLIC_KEY`
- `COUPON_ADMIN_CODE` (opcional)
- `COUPONS_PUBLIC_CODES` (ej: `PROMO-AAA:5,PROMO-BBB:5`)
- `COUPON_HASH_SALT` (pon uno fuerte y no lo cambies si quieres conservar el estado de usos)

## 3) Deploy en Cloud Run (lo más simple: desde un contenedor)

Este repo ya incluye `Dockerfile` basado en Playwright.

Pasos sugeridos (vía consola/GUI):

1. Build y push de imagen (Cloud Build / Artifact Registry).
2. Crear servicio Cloud Run desde esa imagen.
3. Configurar:
   - **Port**: `8080` (Cloud Run inyecta `PORT`; el contenedor lo expone)
   - **Min instances**: `0` (para pagar por uso)
   - **Memory**: 1–2GB (Playwright puede necesitarlo)
   - **Timeout**: sube si tus consultas demoran (PDF/scrapers)
4. Agregar variables de entorno.
5. Deploy.

## 4) Dominio propio

Opciones:

- **Domain mapping** en Cloud Run, o
- Poner **Cloudflare** como proxy y apuntar CNAME al dominio de Cloud Run.

## 5) Nota importante (estado de cupones)

El estado de usos se guarda en `data/coupon-state.json` (ignorado por git).
En Cloud Run el filesystem es **efímero**, así que el estado puede reiniciarse en redeploy.
Si quieres persistencia, lo correcto es mover ese estado a una BD/Redis, o usar un storage externo.

