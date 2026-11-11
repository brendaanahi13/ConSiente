const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuración flexible para local (XAMPP) o en línea (Render + Aiven)
const config = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ahorro_app',
    waitForConnections: true,
    connectionLimit: 5
};

// Si estamos usando Aiven (con DB_SSL=true o detectando el host de Aiven), cargamos el certificado ca.pem
if (process.env.DB_SSL === 'true' || (process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud.com'))) {
    try {
        config.ssl = {
            ca: fs.readFileSync(path.join(__dirname, 'ca.pem')),
            rejectUnauthorized: true
        };
        console.log("Certificado SSL (ca.pem) cargado correctamente para Aiven.");
    } catch (error) {
        console.error("No se pudo cargar el archivo ca.pem:", error.message);
        // Fallback por si acaso el certificado usa configuración flexible
        config.ssl = { rejectUnauthorized: false };
    }
}

const connection = mysql.createPool(config);

connection.getConnection((err, conn) => {
    if (err) {
        console.error("Error de conexión a la Base de Datos:", err);
    } else {
        console.log("¡Conexión a MySQL establecida con éxito!");
        conn.release();
    }
});

module.exports = connection;
