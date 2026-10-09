# Selecciona la imagen base de Node.js
FROM node:18

# Define el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de dependencias
COPY package*.json ./

# Instala las dependencias
RUN npm install

# Copia todo el resto de tu código (incluyendo tu carpeta public)
COPY . .

# Abre el puerto que usa tu server.js
EXPOSE 3000

# Ejecuta la aplicación
CMD ["npm", "start"]