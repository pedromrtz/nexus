import express from 'express';
import { HubConnectionState } from '@microsoft/signalr';

const create_api_routes = async (mssql_connection, signal_r_connection, wwebjs_client) => {

    const router = express.Router();

    router.get('/api/status', async (req, res) => {
        res.status(200).send({
            message: 'Api is working!'
        });
    });

    router.get('/api/mssql_status', async (req, res) => {
        try {
            const result = await mssql_connection.request().query('SELECT 1 AS test');

            if (result.recordset[0].test === 1) {
                res.status(200).send({
                    message: 'MSSQL connection is working!'
                });
            } else {
                res.status(500).send({
                    error: 'MSSQL connection failed'
                });
            }

        } catch (error) {
            console.error('Error executing query:', error);
            res.status(500).send({ error: 'Database query failed' });
        }
    });

    router.get('/api/signalr_status', async (req, res) => {
        try {

            if(signal_r_connection.state === HubConnectionState.Disconnected) {
                res.status(500).send({
                    error: 'Conexion SignalR perdida'
                });
            } else if(signal_r_connection.state === HubConnectionState.Connected) {
                res.status(200).send({
                    message: 'Conexion SignalR establecida'
                });
            }
            
        } catch (error) {
            res.status(500).send({
                error: 'Error al verificar la conexion SignalR'
            });
        }
    });

    return router;
}


export default create_api_routes;