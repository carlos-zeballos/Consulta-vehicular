FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# Instalar deps primero para aprovechar cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copiar el resto del proyecto
COPY . .

# Cloud Run expone PORT en runtime
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]

