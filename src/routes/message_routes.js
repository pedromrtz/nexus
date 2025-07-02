import express from 'express';
import pkg from 'whatsapp-web.js';
const { MessageMedia } = pkg;
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import { fileURLToPath } from 'url';

// Define __dirname manualmente
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const create_message_routes = async (mssql_connection, signal_r_connection, wwebjs_client) => {

    const router = express.Router();

    router.post('/message/send_message_by_id_caso_wa', async (req, res) => {
        
        const body = req.body;
        console.log('Peticion send_message_by_id_caso_wa: \n', body);

        let caso = await mssql_connection.request()
        .input('ID_CASO_WA', body.id_caso_wa)
        .query('SELECT * FROM CAT_CASOS_WA WHERE ID_CASO_WA = @ID_CASO_WA');
        
        caso = caso.recordset[0];
        
        let canal = await mssql_connection.request()
        .input('ID_CANAL_WA', body.id_canal_wa)
        .query('SELECT * FROM CAT_CANALES_WA WHERE ID_CANAL_WA = @ID_CANAL_WA');
        
        canal = canal.recordset[0];

        let pais = await mssql_connection.request()
        .input('ID_PAIS',caso.ID_PAIS_PHONE_CODE)
        .query('SELECT * FROM CAT_PAISES WHERE ID_PAIS = @ID_PAIS');
        
        pais = pais.recordset[0];

        const whatsapp_id = `${pais.PHONE_CODE}${caso.CUSTOMER_PHONE_NUMBER}${caso.IS_GROUP == 1 ? '@g.us' : '@c.us'}`;

        const contact = await wwebjs_client.getContactById(whatsapp_id);

        console.log('Contacto: \n', contact);

        if (!contact) {
            console.error('No se encontro el contacto');
            res.status(500).send({
                error: 'No se encontro el contacto'
            });
            return;
        } else {

            switch (body.message_type) {
                case 'chat':

                    try {
                        await wwebjs_client.sendMessage(contact.id._serialized, body.message_content);
                        console.log(`Mensaje enviado a +${pais.PHONE_CODE} ${caso.CUSTOMER_PHONE_NUMBER} : ${body.message_content}`);

                        res.status(200).send({
                            message: 'Mensaje enviado correctamente',
                            whatsapp_id: contact.id,
                            message_content: body.message_content
                        });

                    } catch (error) {
                        console.error('Error al enviar el mensaje: \n', error);

                        res.status(500).send({
                            error: `Error al enviar el mensaje: ${error}`,
                            whatsapp_id: contact.id,
                            message_content: body.message_content
                        });
                    }
                    
                    break;
                case 'image':
                    try {
                        // Validar que media_path esté definido
                        if (!body.media_path || typeof body.media_path !== 'string') {
                            throw new Error('El campo media_path es inválido o no está definido.');
                        }

                        // Obtener el media desde la URL
                        const media = await MessageMedia.fromUrl(body.media_path);

                        // Validar que el media se haya obtenido correctamente
                        if (!media) {
                            throw new Error('No se pudo obtener el archivo multimedia desde la URL proporcionada.');
                        }

                        // Enviar el mensaje con o sin contenido adicional
                        const options = body.message_content && body.message_content.trim() !== '' 
                        ? { caption: body.message_content } 
                        : {};

                        await wwebjs_client.sendMessage(contact.id._serialized, media, options);

                        console.log(`Imagen enviada a +${pais.PHONE_CODE} ${caso.CUSTOMER_PHONE_NUMBER} con el mensaje: ${body.message_content || 'sin mensaje adicional'}`);
                        res.status(200).send({
                            message: 'Imagen enviada correctamente',
                            whatsapp_id: contact.id,
                            message_content: body.message_content
                        });

                    } catch (error) {
                        console.error('Error al enviar la imagen:', error);

                        res.status(500).send({
                            error: `Error al enviar la imagen: ${error}`,
                            whatsapp_id: contact.id,
                            message_content: body.message_content
                        });
                    }
                    break;
                case 'video':
                    try {
                        // Validar que media_path esté definido
                        if (!body.media_path || typeof body.media_path !== 'string') {
                            throw new Error('El campo media_path es inválido o no está definido.');
                        }

                        // Descargar el video desde la URL
                        const response = await axios({
                            url: body.media_path,
                            method: 'GET',
                            responseType: 'stream'
                        });

                        const uploadsDir = path.join(__dirname, '../../uploads');
                        if (!fs.existsSync(uploadsDir)) {
                            fs.mkdirSync(uploadsDir, { recursive: true });
                        }

                        const originalVideoPath = path.join(uploadsDir, 'original_video.mp4');
                        const convertedVideoPath = path.join(uploadsDir, 'sendable_video.mp4');

                        // Guardar el video original temporalmente
                        const writer = fs.createWriteStream(originalVideoPath);
                        response.data.pipe(writer);

                        await new Promise((resolve, reject) => {
                            writer.on('finish', resolve);
                            writer.on('error', reject);
                        });

                        // Convertir el video usando FFmpeg
                        await new Promise((resolve, reject) => {
                            ffmpeg(originalVideoPath)
                                .outputOptions([
                                    '-c:v libx264',
                                    '-profile:v baseline',
                                    '-level 3.0',
                                    '-pix_fmt yuv420p'
                                ])
                                .save(convertedVideoPath)
                                .on('end', resolve)
                                .on('error', reject);
                        });

                        // Leer el video convertido
                        const media = MessageMedia.fromFilePath(convertedVideoPath);

                        // Enviar el mensaje con o sin contenido adicional
                        const options = body.message_content && body.message_content.trim() !== '' 
                            ? { caption: body.message_content } 
                            : {};

                        await wwebjs_client.sendMessage(contact.id._serialized, media, options);

                        console.log(`Video enviado a +${pais.PHONE_CODE} ${caso.CUSTOMER_PHONE_NUMBER} con el mensaje: ${body.message_content || 'sin mensaje adicional'}`);
                        res.status(200).send({
                            message: 'Video enviado correctamente',
                            whatsapp_id: contact.id,
                            message_content: body.message_content
                        });

                        // Eliminar los archivos temporales
                        fs.unlinkSync(originalVideoPath);
                        fs.unlinkSync(convertedVideoPath);

                    } catch (error) {
                        console.error('Error al enviar el video:', error);

                        res.status(500).send({
                            error: `Error al enviar el video: ${error}`,
                            whatsapp_id: contact.id,
                            message_content: body.message_content
                        });
                    }
                    break;
                case 'document':
                    try {
                        // Validar que media_path esté definido
                        if (!body.media_path || typeof body.media_path !== 'string') {
                            throw new Error('El campo media_path es inválido o no está definido.');
                        }

                        // Obtener el media desde la URL
                        const media = await MessageMedia.fromUrl(body.media_path);

                        // Validar que el media se haya obtenido correctamente
                        if (!media) {
                            throw new Error('No se pudo obtener el archivo multimedia desde la URL proporcionada.');
                        }

                        let caption = JSON.parse(body.message_content)[0]
                        let file_name = JSON.parse(body.message_content)[1]

                        // Enviar el mensaje con o sin contenido adicional
                        const options = body.message_content && body.message_content.trim() !== '' 
                            ? { sendMediaAsDocument: true, caption: caption } 
                            : { sendMediaAsDocument: true };
                        
                        media.filename = file_name;
                        await wwebjs_client.sendMessage(contact.id._serialized, media, options);

                        console.log(`Documento enviado a +${pais.PHONE_CODE} ${caso.CUSTOMER_PHONE_NUMBER} con el mensaje: ${body.message_content || 'sin mensaje adicional'}`);
                        res.status(200).send({
                            message: 'Documento enviado correctamente',
                            whatsapp_id: contact.id,
                            message_content: body.message_content
                        });
                    } catch (error) {
                        console.error('Error al enviar el documento:', error);

                        res.status(500).send({
                            error: `Error al enviar el documento: ${error}`,
                            whatsapp_id: contact.id,
                            message_content: body.message_content
                        });
                    }
                    break;
                case 'ptt':
                    try {
                        // Validar que media_path esté definido
                        if (!body.media_path || typeof body.media_path !== 'string') {
                            throw new Error('El campo media_path es inválido o no está definido.');
                        }

                        // Descargar el archivo desde la URL
                        const response = await axios({
                            url: body.media_path,
                            method: 'GET',
                            responseType: 'stream'
                        });

                        const uploadsDir = path.join(__dirname, '../../uploads');
                        if (!fs.existsSync(uploadsDir)) {
                            fs.mkdirSync(uploadsDir, { recursive: true });
                        }

                        const originalAudioPath = path.join(uploadsDir, 'original_audio');
                        const convertedAudioPath = path.join(uploadsDir, 'sendable_audio.ogg');

                        // Guardar el archivo original temporalmente
                        const writer = fs.createWriteStream(originalAudioPath);
                        response.data.pipe(writer);

                        await new Promise((resolve, reject) => {
                            writer.on('finish', resolve);
                            writer.on('error', reject);
                        });

                        // Convertir el archivo a OGG usando FFmpeg
                        await new Promise((resolve, reject) => {
                            ffmpeg(originalAudioPath)
                                .outputOptions([
                                    '-c:a libopus', // Codificación en formato OGG
                                    '-b:a 64k'      // Bitrate de audio
                                ])
                                .save(convertedAudioPath)
                                .on('end', resolve)
                                .on('error', reject);
                        });

                        // Leer el archivo convertido
                        const media = MessageMedia.fromFilePath(convertedAudioPath);

                        // Enviar el mensaje como nota de voz
                        const options = {
                            sendAudioAsVoice: true,
                        };

                        await wwebjs_client.sendMessage(contact.id._serialized, media, options);

                        console.log(`Nota de voz enviada a +${pais.PHONE_CODE} ${caso.CUSTOMER_PHONE_NUMBER} con el mensaje: ${body.message_content || 'sin mensaje adicional'}`);
                        res.status(200).send({
                            message: 'Nota de voz enviada correctamente',
                            whatsapp_id: contact.id,
                            message_content: body.message_content
                        });

                        // Eliminar los archivos temporales
                        fs.unlinkSync(originalAudioPath);
                        fs.unlinkSync(convertedAudioPath);

                    } catch (error) {
                        console.error('Error al enviar la nota de voz:', error);

                        res.status(500).send({
                            error: `Error al enviar la nota de voz: ${error}`,
                            whatsapp_id: contact.id,
                            message_content: body.message_content
                        });
                    }
                    break;
                default:
                    console.log('Tipo de mensaje no soportado: \n', params);
            }

        }
    });

    router.post('/message/request_create_case', async (req, res) => {
        const body = req.body;
        console.log('Peticion request_create_case: \n', body);

        let pais = await mssql_connection.request()
        .input('ID_PAIS', body.id_pais_phone)
        .query('SELECT * FROM CAT_PAISES WHERE ID_PAIS = @ID_PAIS');
        pais = pais.recordset[0];

        const contact = await wwebjs_client.getNumberId(`${pais.PHONE_CODE}${body.customer_phone}`);

        if (contact) {
            let id_whatsaapp = contact._serialized;

            let detalle = await wwebjs_client.getContactById(id_whatsaapp)
            
            let profile_image = await wwebjs_client.getProfilePicUrl(id_whatsaapp)

            let new_case = await mssql_connection.request()
            .input('ID_CANAL_WA', process.env.ID_CANAL_WA)
            .input('ID_PAIS_PHONE_CODE', body.id_pais_phone)
            .input('CUSTOMER_PHONE_NUMBER', body.customer_phone)
            .input('USUARIO', body.usuario)
            .input('CUSTOMER_NAME', detalle.pushname ?? contact.verifiedName ?? `+${pais.PHONE_CODE} ${body.customer_phone}`)
            .input('PROFILE_IMAGE', profile_image )
            .input('IS_MASSIVE', body.is_massive)
            .query('EXEC INSERT_NEW_CASE_BY_USER @ID_CANAL_WA, @ID_PAIS_PHONE_CODE, @CUSTOMER_PHONE_NUMBER, @USUARIO, @CUSTOMER_NAME, @PROFILE_IMAGE, @IS_MASSIVE');

            new_case = new_case.recordset[0];

            console.log('Nuevo caso:', new_case);

            res.status(200).send({
                message: 'Caso creado',
                whatsapp_id: contact._serialized,
                respuesta: 1,
                id_caso_wa: new_case.ID_CASO_WA,
            });

        } else {
            console.log('No se encontro el contacto');
            res.status(200).send({
                message: 'No se encontro el contacto',
                respuesta: 2
            });
        }

    });


    return router;
}


export default create_message_routes;