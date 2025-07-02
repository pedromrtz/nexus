FROM node:20-slim

# Establecer la zona horaria por defecto
ENV TZ=America/El_Salvador

# Instalar wget, ffmpeg y dependencias para Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    curl \
    ca-certificates \
    ffmpeg

# Agregar la clave de Google y el repositorio
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable

# Crear y usar el directorio de trabajo
WORKDIR /app

# Copiar e instalar dependencias de Node
COPY package*.json ./
RUN npm install

# Copiar el resto de la app
COPY . .

# Comando de inicio
CMD ["node", "index.js"]
