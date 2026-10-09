const mysql = require('mysql2');
require('dotenv').config();

// Local (XAMPP): usa los valores por defecto de abajo.
// En línea (Render + Aiven): usa las variables de entorno.
const config = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ahorro_app',
    waitForConnections: true,
    connectionLimit: 5
};

// Aiven exige SSL. Solo se activa si DB_SSL=true, para no romper tu entorno local.
if (process.env.DB_SSL === 'true') {
    config.ssl = { rejectUnauthorized: false };
}

const connection = mysql.createPool(config);

connection.getConnection((err, conn) => {
    if (err) {
        console.error("Error de conexión:", err);
    } else {
        console.log("Conectado a MySQL");
        conn.release();
    }
});

module.exports = connection;