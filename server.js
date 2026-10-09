const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const crypto = require("crypto"); 
const nodemailer = require("nodemailer"); 
require("dotenv").config();

const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

// Sirve de forma automática los archivos HTML, CSS y JS desde la carpeta 'public'
app.use(express.static("public"));

// ==========================================
// MIDDLEWARE: Verificar autenticación por Token
// ==========================================
function verificarToken(req, res, next) {
  const bearerHeader = req.headers["authorization"];

  if (!bearerHeader) {
    return res.status(401).json({ message: "Acceso denegado" });
  }

  const token = bearerHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Token inválido" });
    }

    req.user = decoded;
    next();
  });
}

// ==========================================
// RUTA: Registro de Usuarios
// ==========================================
app.post("/registro", async (req, res) => {
  const { nombre, correo, password, saldo } = req.body;

  if (!nombre || !correo || !password) {
    return res.status(400).json({ message: "Faltan datos" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO usuarios (nombre, correo, password, saldo) VALUES (?, ?, ?, ?)";
    db.query(sql, [nombre, correo, hashedPassword, saldo], (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Error al registrar usuario" });
      }
      res.status(200).json({ message: "Usuario registrado correctamente" });
    });

  } catch (error) {
    res.status(500).json({ message: "Error del servidor" });
  }
});

// ==========================================
// RUTA: Inicio de Sesión (Login)
// ==========================================
app.post("/login", (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({ message: "Faltan datos" });
  }

  const sql = "SELECT * FROM usuarios WHERE correo = ?";
  db.query(sql, [correo], async (err, results) => {
    if (err) {
      console.error("Error en servidor durante login:", err);
      return res.status(500).json({ message: "Error del servidor" });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }

    const user = results[0];
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Contraseña incorrecta" });
    }

    const token = jwt.sign(
      { id: user.id }, 
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(200).json({ 
        message: "Login correcto", 
        token: token,
        nombre: user.nombre,
        correo: user.correo,
        saldo: user.saldo 
    });
  });
});

// ==========================================
// RUTA: Obtener Perfil desde la Base de Datos
// ==========================================
app.get("/api/perfil", verificarToken, (req, res) => {
  const usuario_id = req.user.id;
  const sql = "SELECT nombre, saldo FROM usuarios WHERE id = ?";

  db.query(sql, [usuario_id], (err, results) => {
    if (err) {
      console.error("Error al obtener perfil:", err);
      return res.status(500).json({ message: "Error al obtener datos del usuario" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json(results[0]);
  });
});

// ==========================================
// RUTA: Guardar nuevo movimiento
// ==========================================
app.post("/api/gastos", verificarToken, (req, res) => {
    const { tipo, categoria, monto, fecha } = req.body;
    const usuario_id = req.user.id; 

    const sql = "INSERT INTO movimientos (usuario_id, tipo, categoria, monto, fecha) VALUES (?, ?, ?, ?, ?)";
    
    db.query(sql, [usuario_id, tipo, categoria, monto, fecha], (err, result) => {
        if (err) {
            console.log("Error al insertar en movimientos:", err);
            return res.status(500).json({ message: "Error al guardar en la base de datos" });
        }
        res.status(200).json({ message: "Movimiento guardado correctamente" });
    });
});

// ==========================================
// RUTA: Lista de movimientos para el historial
// ==========================================
app.get("/api/lista-gastos", verificarToken, (req, res) => {
    const usuario_id = req.user.id;

    const sql = "SELECT id, tipo, categoria, monto, fecha FROM movimientos WHERE usuario_id = ? ORDER BY fecha DESC";

    db.query(sql, [usuario_id], (err, results) => {
        if (err) {
            console.log("Error al obtener lista de movimientos:", err);
            return res.status(500).json({ message: "Error al obtener el historial" });
        }
        res.status(200).json(results);
    });
});

// ==========================================
// RUTA: Resumen para Gráficas Dinámicas
// ==========================================
app.get("/api/resumen-gastos", verificarToken, (req, res) => {
    const usuario_id = req.user.id;
    
    const sql = "SELECT categoria, categoria as tipo, SUM(monto) as total FROM movimientos WHERE usuario_id = ? GROUP BY categoria";
    
    db.query(sql, [usuario_id], (err, results) => {
        if (err) {
            console.log("Error al obtener resumen para gráficas:", err);
            return res.status(500).json({ message: "Error al obtener datos" });
        }
        res.status(200).json(results);
    });
});

// ==========================================
// RUTA: Actualizar información del perfil (Nombre y Saldo)
// ==========================================
app.put("/api/perfil", verificarToken, (req, res) => {
    const { nombre, saldo } = req.body; 
    const usuario_id = req.user.id;
    
    const sql = "UPDATE usuarios SET nombre = ?, saldo = ? WHERE id = ?";
    
    db.query(sql, [nombre, saldo, usuario_id], (err, result) => {
        if (err) {
            console.log("Error al actualizar perfil:", err);
            return res.status(500).json({ message: "Error al actualizar la base de datos" });
        }
        res.status(200).json({ message: "Perfil actualizado correctamente" });
    });
});

// ==========================================
// RUTA: Solicitar Recuperación de Contraseña
// ==========================================
app.post("/api/solicitar-recuperacion", (req, res) => {
  const { correo } = req.body;

  if (!correo) {
    return res.status(400).json({ message: "El correo es obligatorio" });
  }

  const sqlCheck = "SELECT id, nombre FROM usuarios WHERE correo = ?";
  db.query(sqlCheck, [correo], (err, results) => {
    if (err) return res.status(500).json({ message: "Error del servidor" });
    
    if (results.length === 0) {
      return res.status(404).json({ message: "El correo no está registrado" });
    }

    const usuarioNombre = results[0].nombre;
    const token = crypto.randomBytes(20).toString("hex");
    const expiracion = new Date(Date.now() + 3600000); 

    const sqlUpdate = "UPDATE usuarios SET reset_token = ?, reset_expiracion = ? WHERE correo = ?";
    db.query(sqlUpdate, [token, expiracion, correo], (err, result) => {
      if (err) return res.status(500).json({ message: "Error al guardar el token temporal" });

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        tls: {
          rejectUnauthorized: false 
        }
      });

      const mailOptions = {
        from: `"Equipo ConSiente" <${process.env.EMAIL_USER}>`,
        to: correo,
        subject: 'Recuperación de Contraseña - ConSiente',
        html: `
          <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 30px; border-radius: 10px; border: 1px solid #ddd;">
            <h2 style="color: #2e7d32; text-align: center; margin-bottom: 20px;">Recuperación de Cuenta</h2>
            <p style="color: #333; font-size: 16px;">Hola <b>${usuarioNombre}</b>,</p>
            <p style="color: #333; font-size: 16px; margin-bottom: 20px;">Hemos recibido una solicitud para restablecer tu contraseña en ConSiente.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="/restablecer.html?token=${token}" style="background-color: #66BB6A; color: white; padding: 14px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">Restablecer mi Contraseña</a>
            </div>
            
            <p style="color: #666; font-size: 14px; text-align: center;">Este enlace caducará en <b>1 hora</b> por motivos de seguridad.</p>
            <p style="color: #999; font-size: 12px; text-align: center; margin-top: 15px;">Si no solicitaste este cambio, puedes ignorar este correo de forma segura. Tu contraseña actual seguirá activa.</p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            
            <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e0e0e0; font-size: 12px; color: #444; line-height: 1.5; text-align: left;">
                <h4 style="color: #2e7d32; margin-top: 0; margin-bottom: 12px; text-align: center; font-size: 14px;">Extracto Oficial de Términos, Condiciones y Privacidad</h4>
                <p style="margin-bottom: 8px;"><strong>1. Marco de Responsabilidad:</strong> El acceso al entorno interactivo le confiere el estatus de usuario, asumiendo el compromiso de mantener una navegación conforme a los reglamentos lícitos vigentes.</p>
                <p style="margin-bottom: 8px;"><strong>2. Tratamiento Informativo:</strong> Al interactuar con la plataforma, autoriza los mecanismos automatizados de recopilación, almacenamiento e informes internos bajo el principio de minimización de datos.</p>
                <p style="margin-bottom: 8px;"><strong>3. Datos Procesados:</strong> Recolectamos registros indispensables técnicos básicos (dirección IP comprimida, entorno operativo) y registros específicos provistos por la acción voluntaria del perfil (nombre completo, balance mensual y canales de comunicación unificados).</p>
                <p style="margin-bottom: 8px;"><strong>4. Cláusula de Transferencia Exclusiva:</strong> Garantizamos la no comercialización absoluta de la información recopilada con entidades terceras, limitando el acceso operativo únicamente al personal crítico asignado o requerimientos emitidos por mandatos judiciales expresos.</p>
                <p style="margin-bottom: 0;"><strong>5. Derechos ARCO:</strong> Todo titular conserva el control absolut e inalienable sobre sus datos personales, pudiendo ejercer las acciones legales correspondientes de acceso, rectificación, cancelación u oposición correspondientes.</p>
            </div>
            
            <div style="text-align: center; margin-top: 15px;">
                <a href="/privacidad.html" style="color: #2e7d32; font-size: 12px; text-decoration: underline; font-weight: bold;">Ver documento legal completo en el sitio web</a>
                <p style="color: #999; font-size: 10px; margin-top: 15px;">&copy; 2026 ConSiente - Compromiso con el consumo responsable y la educación financiera.</p>
            </div>
          </div>
        `
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.log("Error al enviar el correo: ", error);
          return res.status(500).json({ message: "No se pudo enviar el correo de recuperación." });
        }
        res.status(200).json({ message: "✅ Correo enviado. Revisa tu bandeja de entrada o spam." });
      });
      
    });
  });
});

// ==========================================
// RUTA: Guardar Nueva Contraseña Usando el Token
// ==========================================
app.post("/api/restablecer-password", (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: "Faltan datos obligatorios" });
  }

  const sql = "SELECT id FROM usuarios WHERE reset_token = ? AND reset_expiracion > NOW()";
  db.query(sql, [token], async (err, results) => {
    if (err) return res.status(500).json({ message: "Error en el servidor" });

    if (results.length === 0) {
      return res.status(400).json({ message: "El enlace de recuperación es inválido o ya ha expirado." });
    }

    const userId = results[0].id;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const sqlUpdate = "UPDATE usuarios SET password = ?, reset_token = NULL, reset_expiracion = NULL WHERE id = ?";
      db.query(sqlUpdate, [hashedPassword, userId], (err, result) => {
        if (err) return res.status(500).json({ message: "Error al actualizar la contraseña" });
        res.status(200).json({ message: "✅ Contraseña actualizada correctamente. Ya puedes iniciar sesión." });
      });
    } catch (e) {
      res.status(500).json({ message: "Error al procesar el cifrado" });
    }
  });
});

// ==========================================================
// RUTA: Actualizar (Editar) un movimiento específico
// ==========================================================
app.put("/api/lista-gastos/:id", verificarToken, (req, res) => {
    const movimiento_id = req.params.id;
    const usuario_id = req.user.id;
    const { categoria, monto, fecha } = req.body;

    const sql = "UPDATE movimientos SET categoria = ?, monto = ?, fecha = ? WHERE id = ? AND usuario_id = ?";

    db.query(sql, [categoria, monto, fecha, movimiento_id, usuario_id], (err, result) => {
        if (err) {
            console.log("Error al editar movimiento:", err);
            return res.status(500).json({ message: "Error al actualizar el movimiento en la base de datos" });
        }
        res.status(200).json({ message: "Movimiento actualizado con éxito" });
    });
});

// ==========================================================
// RUTA: Eliminar un movimiento específico
// ==========================================================
app.delete("/api/lista-gastos/:id", verificarToken, (req, res) => {
    const movimiento_id = req.params.id;
    const usuario_id = req.user.id;

    const sql = "DELETE FROM movimientos WHERE id = ? AND usuario_id = ?";

    db.query(sql, [movimiento_id, usuario_id], (err, result) => {
        if (err) {
            console.log("Error al eliminar movimiento:", err);
            return res.status(500).json({ message: "Error al borrar el movimiento de la base de datos" });
        }
        res.status(200).json({ message: "Movimiento eliminado con éxito" });
    });
});

// ==========================================
// RUTA: Eliminar Cuenta (Limpia datos en cascada manual)
// ==========================================
app.delete("/api/cuenta", verificarToken, (req, res) => {
    const usuario_id = req.user.id;

    // Pasó 1: Eliminar primero todos los gastos/movimientos del usuario
    const sqlMovimientos = "DELETE FROM movimientos WHERE usuario_id = ?";

    db.query(sqlMovimientos, [usuario_id], (err, result) => {
        if (err) {
            console.log("Error al eliminar los movimientos del usuario:", err);
            return res.status(500).json({ message: "Error al limpiar el historial de la cuenta" });
        }

        // Paso 2: Con el historial limpio, eliminamos al usuario definitivamente de la tabla
        const sqlUsuario = "DELETE FROM usuarios WHERE id = ?";
        
        db.query(sqlUsuario, [usuario_id], (err, result) => {
            if (err) {
                console.log("Error al eliminar el usuario de la base de datos:", err);
                return res.status(500).json({ message: "Error al eliminar el perfil de la base de datos" });
            }
            
            res.status(200).json({ message: "Cuenta y datos asociados eliminados correctamente de forma permanente" });
        });
    });
});

// ==========================================================
// INTEGRACIÓN: Endpoint Real de Terceros (Semáforo Financiero)
// ==========================================================
app.get('/api/semaforo-economico', verificarToken, async (req, res) => {
    try {
        const API_KEY = '1ecb10b222-9858f0db9b-tgu9bs';
        const url = `https://api.fastforex.io/fetch-one?from=USD&to=MXN&api_key=${API_KEY}`;

        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Error al conectar con FastForex');
        }

        const data = await response.json();
        const precioDolar = data.result.MXN;

        res.json({
            success: true,
            dolar: parseFloat(precioDolar).toFixed(2),
            gasolina: "23.69",
            inflacion: "3.94",
            salarioMinimo: "315.04"
        });

    } catch (error) {
        console.error("Error en la API del Semáforo Financiero:", error);
        // Tolerancia a fallos: Datos históricos en caso de error externo
        res.status(500).json({
            success: false,
            dolar: "18.04", 
            gasolina: "23.69",
            inflacion: "3.94",
            salarioMinimo: "315.04"
        });
    }
});

// Inicialización del Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor corriendo en el puerto " + PORT);
});