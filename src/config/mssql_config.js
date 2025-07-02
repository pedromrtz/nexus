import mssql from 'mssql';

const create_mssql_connection = async (config) => {

    try {
        const mssql_connection = await mssql.connect(config);
        console.log('Base de datos conectada en:', config.server)
        
        
        return mssql_connection;
    } catch (err) {
        console.error('Error al conectarse a la base de datos:')
        console.error('Config:\n', config)
        console.error(err)
        process.exit(1)
    }
}

export default create_mssql_connection;