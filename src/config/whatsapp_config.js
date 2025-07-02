import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import path from 'path';
import sharp from 'sharp';
import fs from 'fs';
const { Client, LocalAuth } = pkg;
import { fileURLToPath } from 'url';


// Define __dirname manualmente
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const create_wwebjs_client = async (mssql_connection, signal_r_connection) => {

    let canal_info = await mssql_connection.request().input('ID_CANAL_WA', process.env.ID_CANAL_WA).query('EXEC GET_CANAL_WA_INFO_BY_ID @ID_CANAL_WA');
    canal_info = canal_info.recordset[0];

    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            executablePath: process.env.CHROME_PATH,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    })
    
    client.on('qr', async (qr) => {
        qrcode.generate(qr, { small: true }, (qrcode) =>{
            console.log('\n' + qrcode)
            console.log('\n' + qr + '\n')
        });

        signal_r_connection.invoke("SendQrCode", canal_info.PHONE_W_CODE, qr, process.env.USER_REQUEST)
        .catch(err => console.error('Error sending QR code via SignalR:', err));

        await mssql_connection.request()
        .input('ID_CANAL_WA',process.env.ID_CANAL_WA)
        .input('ESTADO_CONEXION', 2)
        .input('PUERTO_NEXUS', process.env.PORT)
        .input('QR_CODE',qr)
        .input('ENTORNO', process.env.ENTORNO ? process.env.ENTORNO : null)
        .query('EXEC UPDATE_STATUS_CANAL @ID_CANAL_WA, @ESTADO_CONEXION, @PUERTO_NEXUS, @QR_CODE, @ENTORNO')

    });
    
    client.on('ready', async () => {
        console.log('El cliente esta listo', canal_info.CANAL_NAME)

        signal_r_connection.invoke("LoginReady", canal_info.PHONE_W_CODE, process.env.USER_REQUEST)
        .catch(err => console.error('Error sending ready message via SignalR:', err));

        await mssql_connection.request()
        .input('ID_CANAL_WA',process.env.ID_CANAL_WA)
        .input('ESTADO_CONEXION', 1)
        .query('EXEC UPDATE_STATUS_CANAL @ID_CANAL_WA, @ESTADO_CONEXION')
    })
    
    client.on('message', async (msg) => {
        console.log('\n', msg)
        await process_message(msg)
    });

    client.on('auth_failure', async (message) => {
        console.error('Error autentificando el dispositivo.');
        console.error(message);

        await mssql_connection.request()
        .input('ID_CANAL_WA', process.env.ID_CANAL_WA)
        .input('ESTADO_CONEXION', 0)
        .query('EXEC UPDATE_STATUS_CANAL @ID_CANAL_WA, @ESTADO_CONEXION')
        
        // Reintentar inicialización
        setTimeout(() => {
            client.initialize();
        }, 5000);

    });

    client.on('disconnected', async (reason) => {
        console.log(`Dispositivo Desconectado. Razón: ${reason}`);

        // Actualizar el estado en la base de datos
        await mssql_connection.request()
            .input('ID_CANAL_WA', process.env.ID_CANAL_WA)
            .input('ESTADO_CONEXION', 0)
            .query('EXEC UPDATE_STATUS_CANAL @ID_CANAL_WA, @ESTADO_CONEXION');

        // Cerrar el cliente para liberar recursos
        try {
            await client.destroy();
            console.log('Cliente destruido correctamente.');
        } catch (err) {
            console.error('Error al destruir el cliente:', err);
        }

        // Ruta de la carpeta de autenticación
        const authDir = path.join(__dirname, '..', '..', '.wwebjs_auth');

        try {
            // Verificar si la carpeta existe y eliminarla
            if (fs.existsSync(authDir)) {
                fs.rmSync(authDir, { recursive: true, force: true });
                console.log('Carpeta de autenticación eliminada correctamente.');
            } else {
                console.log('La carpeta de autenticación no existe.');
            }
        } catch (err) {
            console.error('Error al eliminar la carpeta de autenticación:', err);
        }

        // Reintentar inicialización después de un breve retraso
        console.log('Reiniciando cliente...');
        setTimeout(() => {
            client.initialize();
        }, 8000);
    });
    
    client.on('error', (err) => {
        console.error('Error en el cliente de WhatsApp:', err);
    });

    const process_message = async (msg) => {
        
        // validar si es un status
        if (msg.isStatus){
            console.log('Mensaje omitido, motivo: estado de whatsapp')
            return;
        }

        const contact = await msg.getContact()
        const chat = await msg.getChat()

        const { country_code, phone_number } = await get_phone_parts(contact)
        const profile_picture = await contact.getProfilePicUrl()
        const chat_name = chat.name
        const media = await msg.downloadMedia();
        const vcards = msg.vCards

        switch (msg.type) {
            case 'chat':

                let message_body = msg.body
                
                if (msg._data.ctwaContext && msg._data.ctwaContext.sourceUrl) {
                    message_body = `Enlace anuncio: ${msg._data.ctwaContext.sourceUrl} \n${msg.body}`;
                }
                
                if (msg._data.ctwaContext && msg._data.ctwaContext.thumbnailUrl && msg._data.ctwaContext.thumbnailUrl.length > 0) {
                    save_message(country_code, phone_number, message_body, 'image', chat_name, profile_picture, contact.isGroup, true, msg._data.ctwaContext.thumbnailUrl, 'webp');
                    console.log(`Mensaje publicitario recibido de +${country_code} ${phone_number} : ${message_body}`);

                } else {
                    save_message(country_code, phone_number, message_body, 'chat', chat_name, profile_picture, contact.isGroup);
                    console.log(msg._data.ctwaContext && msg._data.ctwaContext.sourceUrl ? `Mensaje publicitario recibido de +${country_code} ${phone_number} : ${message_body}` : `Mensaje recibido de +${country_code} ${phone_number} : ${message_body}`);
                }

                break;
            case 'image':
                
                if (media) {
                    const filename = `image_${phone_number}_${Date.now()}.webp`;

                    const upload_dir = path.join(__dirname, '..', '..', 'uploads');
                    const file_path = path.join(upload_dir, filename);

                    if (!fs.existsSync(upload_dir)) {
                        fs.mkdirSync(upload_dir, { recursive: true });
                    }

                    const buffer = Buffer.from(media.data, 'base64');
                    await sharp(buffer).toFormat('webp').webp({ quality: 80 }).toFile(file_path);

                    const file_url = `http://172.25.120.75:41312/${filename}`

                    console.log(`Imagen recibida ${file_url} de +${country_code} ${phone_number} : ${msg.body}`);
                    
                    save_message(country_code, phone_number, msg.body, msg.type, chat_name, profile_picture, contact.isGroup, true, file_url, 'webp');
                } else {
                    console.log(`Imagen no recibida de +${country_code} ${phone_number} : ${msg.body}`);
                    save_message(country_code, phone_number, `Imagen no recibido, mensaje: ${msg.body}` , 'chat', chat_name, profile_picture, contact.isGroup);
                }

                break;
            case 'video':
                
                if (media) {
                    const extension = media.mimetype.split('/')[1];
                    const filename = `video_${phone_number}_${Date.now()}.${extension}`;

                    const upload_dir = path.join(__dirname, '..', '..', 'uploads');
                    const file_path = path.join(upload_dir, filename);

                    if (!fs.existsSync(upload_dir)) {
                        fs.mkdirSync(upload_dir, { recursive: true });
                    }

                    const buffer = Buffer.from(media.data, 'base64');
                    fs.writeFileSync(file_path, buffer);

                    const file_url = `http://172.25.120.75:41312/${filename}`;

                    console.log(`Video recibido ${file_url} de +${country_code} ${phone_number} : ${msg.body}`);

                    save_message(country_code, phone_number, msg.body, msg.type, chat_name, profile_picture, contact.isGroup, true, file_url, extension);
                } else {
                    console.log(`Video no recibido de +${country_code} ${phone_number} : ${msg.body}`);
                    save_message(country_code, phone_number, `Video no recibido, mensaje: ${msg.body}` , 'chat', chat_name, profile_picture, contact.isGroup);
                }

                break;
            case 'audio':

                if (media) {
                    const extension = media.mimetype.split('/')[1];
                    const filename = `audio_${phone_number}_${Date.now()}.${extension}`;

                    const upload_dir = path.join(__dirname, '..', '..', 'uploads');
                    const file_path = path.join(upload_dir, filename);

                    if (!fs.existsSync(upload_dir)) {
                        fs.mkdirSync(upload_dir, { recursive: true });
                    }

                    const buffer = Buffer.from(media.data, 'base64');
                    fs.writeFileSync(file_path, buffer);

                    const file_url = `http://172.25.120.75:41312/${filename}`;

                    console.log(`Audio recibido ${file_url} de +${country_code} ${phone_number} : ${msg.body}`);

                    save_message(country_code, phone_number, msg.body, msg.type, chat_name, profile_picture, contact.isGroup, true, file_url, extension);
                } else {
                    console.log(`Audio no recibido de +${country_code} ${phone_number} : ${msg.body}`);
                    save_message(country_code, phone_number, `Audio no recibido, mensaje: ${msg.body}` , 'chat', chat_name, profile_picture, contact.isGroup);
                }

                break;
            case 'ptt':
                
                if (media) {
                    const extension = media.mimetype.split(';')[0].split('/')[1];
                    const filename = `voice_note_${phone_number}_${Date.now()}.${extension}`;

                    const upload_dir = path.join(__dirname, '..', '..', 'uploads');
                    const file_path = path.join(upload_dir, filename);

                    if (!fs.existsSync(upload_dir)) {
                        fs.mkdirSync(upload_dir, { recursive: true });
                    }

                    const buffer = Buffer.from(media.data, 'base64');
                    fs.writeFileSync(file_path, buffer);

                    const file_url = `http://172.25.120.75:41312/${filename}`;

                    console.log(`Nota de voz recibida ${file_url} de +${country_code} ${phone_number} : ${msg.body}`);

                    save_message(country_code, phone_number, msg.body, msg.type, chat_name, profile_picture, contact.isGroup, true, file_url, extension);
                } else {
                    console.log(`Nota de voz no recibida de +${country_code} ${phone_number} : ${msg.body}`);
                    save_message(country_code, phone_number, `Nota de voz no recibida, mensaje: ${msg.body}` , 'chat', chat_name, profile_picture, contact.isGroup);
                }

                break;
            case 'document':
                if (media) {
                    const extension = media.mimetype.split('/')[1] == 'plain' ? 'txt' : media.mimetype.split('/')[1];
                    const filename = `doc_${phone_number}_${Date.now()}.${extension}`;

                    const upload_dir = path.join(__dirname, '..', '..', 'uploads');
                    const file_path = path.join(upload_dir, filename);

                    if (!fs.existsSync(upload_dir)) {
                        fs.mkdirSync(upload_dir, { recursive: true });
                    }

                    const buffer = Buffer.from(media.data, 'base64');
                    fs.writeFileSync(file_path, buffer);

                    const file_url = `http://172.25.120.75:41312/${filename}`;
                    
                    const stats = fs.statSync(file_path);
                    const file_weight = stats.size > 1024 * 1024 
                        ? `${(stats.size / (1024 * 1024)).toFixed(2)} MB` 
                        : `${(stats.size / 1024).toFixed(2)} KB`;

                    let message_body = `["${msg.body == msg._data.filename ? '' : msg.body}","${msg._data.filename}","${file_weight}"]`

                    console.log(`Documento recibido ${file_url} de +${country_code} ${phone_number} : ${msg.body}`);

                    save_message(country_code, phone_number, message_body, msg.type, chat_name, profile_picture, contact.isGroup, true, file_url, extension);
                } else {
                    console.log(`Documento no recibido de +${country_code} ${phone_number} : ${msg.body}`);
                    save_message(country_code, phone_number, `Documento no recibido, mensaje: ${msg.body}` , 'chat', chat_name, profile_picture, contact.isGroup);
                }
                break;
            case 'sticker': 

                if (media) {
                    const extension = media.mimetype.split('/')[1];
                    const filename = `sticker_${phone_number}_${Date.now()}.${extension}`;

                    const upload_dir = path.join(__dirname, '..', '..', 'uploads');
                    const file_path = path.join(upload_dir, filename);

                    if (!fs.existsSync(upload_dir)) {
                        fs.mkdirSync(upload_dir, { recursive: true });
                    }

                    const buffer = Buffer.from(media.data, 'base64');
                    fs.writeFileSync(file_path, buffer);

                    const file_url = `http://172.25.120.75:41312/${filename}`;

                    console.log(`Sticker recibido ${file_url} de +${country_code} ${phone_number} : ${msg.body}`);

                    save_message(country_code, phone_number, msg.body, msg.type, chat_name, profile_picture, contact.isGroup, true, file_url, extension);
                } else {
                    console.log(`Sticker no recibido de +${country_code} ${phone_number} : ${msg.body}`);
                }

                break;
            case 'location':

                if (msg.location){
                    const { latitude, longitude } = msg.location;
                    const comment = msg._data.comment ? msg._data.comment : '';
                    const message_body = `["${comment}",${latitude},${longitude}]`;

                    console.log(`Ubicacion recibida ${latitude}, ${longitude} de +${country_code} ${phone_number} : ${comment}`);

                    await save_message(country_code, phone_number, message_body, msg.type, chat_name, profile_picture, chat.isGroup);

                } else {
                    console.log(`Ubicacion no recibida de +${country_code} ${phone_number} : ${msg.body}`);
                }
                
                break;
            case 'vcard':

                if (vcards.length > 0) {
                    let vcard = vcards[0]
                    let { numero_telefono, nombre_contacto} = normalizar_vcard(vcard);
                    console.log(`Vcard: ${vcard}`);
                    console.log(`Numero: ${numero_telefono}`);
                    console.log(`Nombre: ${nombre_contacto}`);
                    if (numero_telefono && nombre_contacto) {
                        try {
                            const shared_contact = await client.getContactById(numero_telefono + '@c.us');
                            console.log('Shared contact:', shared_contact);
                            const telefono = await get_phone_parts(shared_contact);
                            const profile_picture_shared_contact = await shared_contact.getProfilePicUrl();
                            const message_body = `["${shared_contact.pushname ? shared_contact.pushname : nombre_contacto}","${telefono.country_code}","${telefono.phone_number}","${profile_picture_shared_contact ? profile_picture_shared_contact : ''}"]`;
                            console.log(`Contacto recibido ${shared_contact.pushname ? shared_contact.pushname : nombre_contacto} de +${country_code} ${phone_number} : +${telefono.country_code} ${telefono.phone_number}`);
                            await save_message(country_code, phone_number, message_body, msg.type, chat_name, profile_picture, contact.isGroup);

                        } catch (error) {
                            console.error('Error al obtener el contacto compartido:', error);
                        }
                    } else {
                        console.log(`Vcard no recibida de +${country_code} ${phone_number} : ${msg.body}`);
                    }
                } else {
                    console.log(`Vcard no recibida de +${country_code} ${phone_number} : ${msg.body}`);
                }

                break;
            case 'multi_vcard':

                if (vcards.length > 0) {
                    for (let vcard of vcards) {
                        let { numero_telefono, nombre_contacto} = normalizar_vcard(vcard);
                        if (numero_telefono && nombre_contacto) {
                            try {
                                const shared_contact = await client.getContactById(numero_telefono + '@c.us');
                                const telefono = await get_phone_parts(shared_contact);
                                const profile_picture_shared_contact = await shared_contact.getProfilePicUrl();
                                const message_body = `["${shared_contact.pushname ? shared_contact.pushname : nombre_contacto}","${telefono.country_code}","${telefono.phone_number}","${profile_picture_shared_contact ? profile_picture_shared_contact : ''}"]`;
                                console.log(`Contacto recibido ${shared_contact.pushname ? shared_contact.pushname : nombre_contacto} de +${country_code} ${phone_number} : +${telefono.country_code} ${telefono.phone_number}`);
                                await save_message(country_code, phone_number, message_body, msg.type, chat_name, profile_picture, contact.isGroup);
                            } catch (error) {
                                console.error('Error al obtener el contacto compartido:', error);
                            }
                        } else {
                            console.log(`Vcard no recibida de +${country_code} ${phone_number} : ${msg.body}`);
                        }
                    }
                } else {
                    console.log(`Vcard no recibida de +${country_code} ${phone_number} : ${msg.body}`);
                }

                break;
            default:
                console.log(`Mensaje omitido, motivo: tipo de mensaje no soportado "${msg.type}"`);
        }

    }

    const save_message = async (
        country_code,
        phone_number,
        message_content,
        message_type,
        customer_name,
        profile_photo,
        is_group = false,
        has_media = false,
        media_path = null,
        media_type = null) => 
    {
        let result = await mssql_connection.request()
        .input('ID_CANAL_WA', process.env.ID_CANAL_WA)
        .input('PHONE_CODE', country_code)
        .input('CUSTOMER_PHONE_NUMBER', phone_number)
        .input('MESSAGE_CONTENT', message_content)
        .input('CUSTOMER_NAME', customer_name)
        .input('PROFILE_PHOTO', profile_photo)
        .input('IS_GROUP',is_group ? 1 : 0)
        .input('GROUP_NAME', customer_name)
        .input('MESSAGE_TYPE', message_type)
        .input('HAS_MEDIA', has_media ? 1 : 0)
        .input('MEDIA_PATH', media_path)
        .input('MEDIA_TYPE', media_type)
        .query('EXEC SAVE_MESSAGE_IN_WA @ID_CANAL_WA, @PHONE_CODE, @CUSTOMER_PHONE_NUMBER, @MESSAGE_CONTENT, @CUSTOMER_NAME, @PROFILE_PHOTO, @IS_GROUP, @GROUP_NAME, @MESSAGE_TYPE, @HAS_MEDIA, @MEDIA_PATH, @MEDIA_TYPE');
    
            
        if (result && result.recordset && result.recordset.length > 0) {
            result = result.recordset[0];
            
            signal_r_connection.invoke("UpdateCase", result.ID_CASO_WA, result.ID_DET_CASO_WA, result.IS_NEW_CASE, result.ASSIGNED_USER)
            .catch(err => {
                console.error('Error al enviar actualización de caso:', err);
            });

        } else {
            console.error('No se pudo guardar el mensaje en la base de datos');
            console.error(result);
        }

    }

    const get_phone_parts = async (contact) => {
        const formatted_number = await contact.getFormattedNumber()
        const country_code = formatted_number.split(' ')[0].replace('+', '')
        const phone_number = contact.number.substring(country_code.length)
        
        return {
            country_code: country_code,
            phone_number: phone_number
        }
    }

    const normalizar_vcard = (vcard) => {
        // Expresión regular para extraer el número de teléfono
        const telefono_regex = /TEL(;.*)?:([+\d\s]+)/i;
        const telefono_match = vcard.match(telefono_regex);
      
        // Expresión regular para extraer el nombre del contacto (campo FN)
        const nombre_regex = /FN:([^\n]+)/i;
        const nombre_match = vcard.match(nombre_regex);
      
        // Extraer y normalizar el número de teléfono
        const numero_telefono = telefono_match && telefono_match[2] ? telefono_match[2].replace(/\D/g, '') : null;
      
        // Extraer el nombre del contacto
        const nombre_contacto = nombre_match && nombre_match[1] ? nombre_match[1].trim() : null;
      
        // Retornar [numero, nombre] o null si no se encuentra alguno de los dos
        if (numero_telefono && nombre_contacto) {
            return {
            numero_telefono: numero_telefono,
            nombre_contacto: nombre_contacto
            }
        } else {
            return {
            numero_telefono: null,
            nombre_contacto: null
            }
        }
    }

    client.initialize();

    return client;

}

export default create_wwebjs_client;
