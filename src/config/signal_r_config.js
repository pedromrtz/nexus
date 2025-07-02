import signalR from "@microsoft/signalr";

const create_signal_r_connection = async (signal_hub_url, mssql_connection) => {
    
    let signal_r_connection = new signalR.HubConnectionBuilder().withUrl(signal_hub_url).build();

    let is_connected = false;

    const reconnect_signal = async () => {
        let reconnect_attempts = 0;
        const reconnect_interval = 5000; // 5 seconds

        while (reconnect_attempts <= 60) {
            try {
                console.log(`Intentando reconectar signalR, intento: ${reconnect_attempts + 1}`);
                await signal_r_connection.start();
                is_connected = true;
                return;
            } catch (err) {
                reconnect_attempts++;
                await new Promise(resolve => setTimeout(resolve, reconnect_interval));
            }
        }
        
        console.error('No se pudo reconectar a signalR después de 60 intentos. Saliendo...');
        
        await mssql_connection.request()
        .input('ID_CANAL_WA', process.env.ID_CANAL_WA)
        .input('ESTADO_CONEXION', 0)
        .query('EXEC UPDATE_STATUS_CANAL @ID_CANAL_WA, @ESTADO_CONEXION')
        
        process.exit(1)

    };

    signal_r_connection.onclose(async () => {
        console.log('Conexion signalR perdida');
        is_connected = false;
        await reconnect_signal();
    });

    try {
        await signal_r_connection.start();
        console.log('Conexion signalR establecida en: ', signal_hub_url);
        is_connected = true;
    } catch (err) {
        console.error('Error de signalR al conectarse al hub ', signal_hub_url);
        console.error(err);
        await reconnect_signal();
    }

    // Esperar hasta que la conexión esté establecida
    while (!is_connected) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Esperar brevemente antes de verificar de nuevo
    }

    return signal_r_connection;
};

export default create_signal_r_connection;

