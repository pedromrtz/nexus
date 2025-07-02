# NexusConnect

NexusConnect es una aplicación desarrollada con **Express.js** que sirve como un punto central para conectar diferentes servicios y funcionalidades. Este proyecto está diseñado para ser modular, escalable y fácil de mantener.

## Características principales

- **API RESTful**: Proporciona una interfaz para interactuar con los datos y servicios.
- **Modularidad**: Cada funcionalidad está separada en módulos para facilitar el desarrollo y mantenimiento.
- **Escalabilidad**: Diseñado para crecer con nuevas características y servicios.
- **Integración con WhatsApp**: Utiliza la librería `whatsapp-web.js` para enviar y recibir mensajes.
- **Conexión SignalR**: Soporte para comunicación en tiempo real con SignalR.
- **Base de datos MSSQL**: Conexión y manejo de datos utilizando Microsoft SQL Server.

## Estructura del proyecto

```plaintext
src/
├── config/          # Configuración de la aplicación (base de datos, SignalR, WhatsApp)
├── routes/          # Rutas de la API
├── uploads/         # Archivos multimedia temporales
├── index.js         # Punto de entrada principal
```

### `/routes`
Contiene las rutas de la aplicación. Cada archivo en esta carpeta define un conjunto de endpoints relacionados con una funcionalidad específica:
- `api_routes.js`: Rutas generales para verificar el estado de la API, la base de datos y SignalR.
- `message_routes.js`: Rutas para enviar mensajes a través de WhatsApp.

### `/config`
Archivos de configuración para la aplicación:
- `mssql_config.js`: Configuración y conexión a la base de datos MSSQL.
- `signal_r_config.js`: Configuración de la conexión SignalR.
- `whatsapp_config.js`: Configuración del cliente de WhatsApp.

## Requisitos previos

Antes de ejecutar el proyecto, asegúrate de tener lo siguiente instalado:

- **Node.js** (versión 20 o superior)
- **npm** (administrador de paquetes de Node.js)
- **Microsoft SQL Server**
- **Google Chrome** (para `whatsapp-web.js`)

## Instalación y configuración

1. **Clona el repositorio:**
    ```bash
    git clone https://github.com/usuario/NexusConnect.git
    cd NexusConnect
    ```

2. **Instala las dependencias:**
    ```bash
    npm install
    ```

3. **Configura las variables de entorno:**
   Crea un archivo `.env` basado en `.env.example` y completa los valores necesarios:
   ```plaintext
   DB_USER=user
   DB_PASSWORD=password
   DB_SERVER=localhost
   DB_DATABASE=Nexus
   ID_CANAL_WA=1
   PORT=5001
   CHROME_PATH=/usr/bin/google-chrome-stable
   ```

4. **Inicia el servidor:**
    ```bash
    npm start
    ```

## Uso

### Endpoints principales

- **Estado de la API:**  
  `GET /api/status`  
  Verifica si la API está funcionando correctamente.

- **Estado de la base de datos:**  
  `GET /api/mssql_status`  
  Verifica la conexión con la base de datos MSSQL.

- **Estado de SignalR:**  
  `GET /api/signalr_status`  
  Verifica la conexión con SignalR.

- **Enviar mensaje por WhatsApp:**  
  `POST /message/send_message_by_id_caso_wa`  
  Envía mensajes de texto, imágenes, videos, documentos o notas de voz a través de WhatsApp.

### Ejemplo de solicitud para enviar un mensaje de texto:
```json
POST /message/send_message_by_id_caso_wa
Content-Type: application/json

{
  "id_caso_wa": 123,
  "id_canal_wa": 1,
  "message_type": "chat",
  "message_content": "Hola, este es un mensaje de prueba"
}
```

## Docker

Este proyecto incluye un archivo `Dockerfile` para facilitar la implementación en contenedores.

1. **Construir la imagen:**
    ```bash
    docker build -t nexus_connect .
    ```

2. **Ejecutar el contenedor:**
    ```bash
    docker run -p 5001:5001 --env-file .env nexus_connect
    ```

## Contribuciones

Las contribuciones son bienvenidas. Si tienes ideas para mejorar el proyecto, abre un **issue** o envía un **pull request**.

## Licencia

Este proyecto está bajo la licencia **MIT**. Consulta el archivo `LICENSE` para más detalles.