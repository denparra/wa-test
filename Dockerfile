FROM node:20-alpine

# Configurar Zona Horaria (Solución Permanente)
ENV TZ=America/Santiago
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/America/Santiago /etc/localtime && \
    echo "America/Santiago" > /etc/timezone

WORKDIR /app

COPY package*.json ./
RUN apk add --no-cache python3 make g++
RUN npm install --omit=dev
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
