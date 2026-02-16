FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

# Instalar deps primero para aprovechar cache
COPY package.json package-lock.json ./
# Permitir que Puppeteer descargue Chromium si es necesario
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
# Instalar dependencias
RUN npm ci --omit=dev
# Instalar navegadores de Playwright (incluye Chromium)
RUN npx playwright install chromium
# Puppeteer usará el Chromium de Playwright (ya instalado arriba)
# No necesitamos instalar Chromium de Puppeteer porque usamos el de Playwright

# Copiar el resto del proyecto
COPY . .

# La app escucha en PORT=3000 internamente, Docker mapea 8080:3000
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]

