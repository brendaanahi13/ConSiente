const mysql = require('mysql2');
require('dotenv').config();

// Se modificó el 'host' para que acepte variables de entorno en Docker, 
// pero seguirá usando 'localhost' si lo corres de manera tradicional en XAMPP.
const connection = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ahorro_app'
});

connection.connect((err) => {
    if (err) {
        console.error("Error de conexión:", err);
    } else {
        console.log("Conectado a MySQL");
    }
});

module.exports = connection;