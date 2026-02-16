FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# Instalar deps primero para aprovechar cache
COPY package.json package-lock.json ./
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
RUN npm ci --omit=dev

# Copiar el resto del proyecto
COPY . .

# La app escucha en PORT=3000 internamente, Docker mapea 8080:3000
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]

