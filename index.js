import consoleStamp from 'console-stamp';
import express from 'express';
import dotenv from 'dotenv';
import create_mssql_connection from './src/config/mssql_config.js';
import create_wwebjs_client from './src/config/whatsapp_config.js';
import create_signal_r_connection from './src/config/signal_r_config.js';
import create_api_routes from './src/routes/api_routes.js';
import create_message_routes from './src/routes/message_routes.js';
import cors from 'cors';

consoleStamp(console, { format: ':date(yyyy-mm-dd HH:MM:ss) :label' });

const cors_options = {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
};

const app = express();
app.use(cors(cors_options));
app.use(express.json());
dotenv.config();


if (!process.env.PORT) {
    console.error('No se proporciono un puerto valido para el aplicativo');
    process.exit(1);
}

const PORT = process.env.PORT;

const mssql_config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        trustServerCertificate: true
    }
};

// config:
const mssql_connection = await create_mssql_connection(mssql_config)
let info_canal = await mssql_connection.request().input('ID_CANAL_WA', process.env.ID_CANAL_WA).query(`EXEC GET_CANAL_WA_INFO_BY_ID @ID_CANAL_WA`);
const signal_r_connection = await create_signal_r_connection(`http://${info_canal.recordset[0].IP_APP}/MainHub`, mssql_connection)
const wwebjs_client = await create_wwebjs_client(mssql_connection, signal_r_connection)
if (!wwebjs_client) {
    console.error('El cliente de whatsapp no se inicio correctamente')
    await mssql_connection.request()
    .input('ID_CANAL_WA', process.env.ID_CANAL_WA)
    .input('ESTADO_CONEXION', 0)
    .query('EXEC UPDATE_STATUS_CANAL @ID_CANAL_WA, @ESTADO_CONEXION')

    process.exit(1);
}

// rutas:
const api_routes = await create_api_routes(mssql_connection, signal_r_connection, wwebjs_client);
app.use(api_routes);
const message_routes = await create_message_routes(mssql_connection, signal_r_connection, wwebjs_client);
app.use(message_routes);


app.listen(PORT, () => {
    console.log('Server Listening on PORT:', PORT);
});

