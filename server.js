const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const webpush = require('web-push');
const multer = require('multer');
const path = require('path');

require("dotenv").config();

const db = require("./db");
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Configuración de almacenamiento inteligente con Multer para avatares duales (gris y color)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public/imagenes/perfiles'));
    },
    filename: (req, file, cb) => {
        let nombreBase = req.body.recompensa || req.body.titulo || "avatar";
        nombreBase = nombreBase
            .toLowerCase()
            .replace(/avatar:/g, '') 
            .trim()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
            .replace(/\s+/g, '-'); 

        const tipoSufijo = file.fieldname === 'archivoGris' ? 'gris' : 'color';
        const uniqueSuffix = Date.now();

        cb(null, `avatar-${nombreBase}_${tipoSufijo}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

// Configurar las llaves VAPID de seguridad
if (process.env.VAPID_EMAIL && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_EMAIL,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

// ==========================================
// VERIFICAR TOKEN
// ==========================================
function verificarToken(req, res, next) {
    const bearerHeader = req.headers["authorization"];

    if (!bearerHeader) {
        return res.status(401).json({
            message: "Acceso denegado"
        });
    }

    const partes = bearerHeader.split(" ");
    const token = partes[1];

    if (!token) {
        return res.status(401).json({
            message: "Token inválido"
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({
                message: "Token inválido"
            });
        }

        req.user = decoded;
        next();
    });
}

// ==========================================
// REGISTRO DE USUARIOS (Con detección de Admin)
// ==========================================
app.post("/registro", async (req, res) => {
    const { nombre, correo, password, saldo } = req.body;

    if (!nombre || !correo || !password) {
        return res.status(400).json({
            message: "Faltan datos"
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const rolAsignado = (correo.trim().toLowerCase() === "equipoconsiente@gmail.com") ? "admin" : "usuario";

        const sql = `
            INSERT INTO usuarios
            (nombre, correo, password, saldo, rol)
            VALUES (?, ?, ?, ?, ?)
        `;

        db.query(
            sql,
            [nombre, correo.trim().toLowerCase(), hashedPassword, saldo ?? 0, rolAsignado],
            (err) => {
                if (err) {
                    console.error("Error al registrar usuario:", err);
                    return res.status(500).json({
                        message: "El correo ya está registrado o hay un error"
                    });
                }

                res.status(200).json({
                    message: "Usuario registrado correctamente"
                });
            }
        );
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Error del servidor"
        });
    }
});

// ==========================================
// INICIO DE SESIÓN
// ==========================================
app.post("/login", (req, res) => {
    const { correo, password } = req.body;

    if (!correo || !password) {
        return res.status(400).json({
            message: "Faltan datos"
        });
    }

    const correoLimpio = correo.trim().toLowerCase();

    db.query(
        "SELECT * FROM usuarios WHERE correo = ?",
        [correoLimpio],
        async (err, results) => {
            if (err) {
                console.error("Error durante login:", err);
                return res.status(500).json({
                    message: "Error del servidor"
                });
            }

            if (results.length === 0) {
                return res.status(401).json({
                    message: "Usuario no encontrado"
                });
            }

            try {
                const user = results[0];
                const validPassword = await bcrypt.compare(
                    password,
                    user.password
                );

                if (!validPassword) {
                    return res.status(401).json({
                        message: "Contraseña incorrecta"
                    });
                }

                const esAdmin = (correoLimpio === "equipoconsiente@gmail.com" || user.rol === "admin");
                const rolFinal = esAdmin ? "admin" : "usuario";

                if (esAdmin && user.rol !== "admin") {
                    db.query("UPDATE usuarios SET rol = 'admin' WHERE id = ?", [user.id]);
                }

                const token = jwt.sign(
                    { id: user.id, rol: rolFinal },
                    process.env.JWT_SECRET,
                    { expiresIn: "24h" }
                );

                res.status(200).json({
                    message: "Login correcto",
                    token,
                    nombre: user.nombre,
                    correo: user.correo,
                    saldo: user.saldo,
                    rol: rolFinal
                });
            } catch (error) {
                console.error(error);
                res.status(500).json({
                    message: "Error al iniciar sesión"
                });
            }
        }
    );
});

// ==========================================
// OBTENER PERFIL (CON CONTROL DE RACHAS Y AVATAR)
// ==========================================
app.get("/api/perfil", verificarToken, (req, res) => {
    const usuarioId = req.user.id; 
    const hoy = new Date().toISOString().split('T')[0]; 

    db.query('SELECT racha_dias, DATE_FORMAT(ultimo_acceso, "%Y-%m-%d") AS ultimo_acceso FROM usuarios WHERE id = ?', [usuarioId], (err, results) => {
        if (!err && results && results.length > 0) {
            const usuario = results[0];
            const racha_dias = usuario.racha_dias || 0;
            const ultimo_acceso = usuario.ultimo_acceso;

            let nuevaRacha = racha_dias;
            let enviarAlertaRacha = false;

            if (!ultimo_acceso) {
                nuevaRacha = 1;
                enviarAlertaRacha = true;
            } else if (ultimo_acceso !== hoy) {
                const fechaUltimaObjeto = new Date(ultimo_acceso);
                const fechaHoyObjeto = new Date(hoy);
                const diferenciaDias = Math.floor((fechaHoyObjeto - fechaUltimaObjeto) / (1000 * 60 * 60 * 24));

                if (diferenciaDias === 1) {
                    nuevaRacha = racha_dias + 1;
                    enviarAlertaRacha = true;
                } else if (diferenciaDias > 1) {
                    nuevaRacha = 1;
                    enviarAlertaRacha = true;
                }
            }

            if (nuevaRacha !== racha_dias || ultimo_acceso !== hoy) {
                db.query('UPDATE usuarios SET racha_dias = ?, ultimo_acceso = ? WHERE id = ?', [nuevaRacha, hoy, usuarioId], (errUpdate) => {
                    if (enviarAlertaRacha && !errUpdate) {
                        const titulo = '🔥 ¡Mantienes tu Racha Activa!';
                        const mensaje = `Felicidades por ingresar hoy a ConSiente. Tu racha actual es de ${nuevaRacha} días seguidos.`;
                        
                        db.query('INSERT INTO notificaciones (usuario_id, titulo, mensaje, leida) VALUES (?, ?, ?, 0)', [usuarioId, titulo, mensaje], (err) => {
                            if (err) console.error("Error silencioso al guardar notificación:", err.message);
                        });
                    }
                });
            }
        }

        db.query(
            "SELECT nombre, saldo, rol, racha_dias, avatar FROM usuarios WHERE id = ?",
            [usuarioId],
            (errPerfil, perfilResults) => {
                if (errPerfil) {
                    console.error("Error al obtener perfil:", errPerfil);
                    return res.status(500).json({ message: "Error al obtener datos" });
                }
                if (perfilResults.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
                res.json(perfilResults[0]);
            }
        );
    });
});

// ==========================================
// ACTUALIZAR FOTO DE PERFIL / AVATAR
// ==========================================
app.put("/api/perfil/avatar", verificarToken, upload.single('avatar'), (req, res) => {
    const usuarioId = req.user.id;
    
    let rutaAvatar = req.body.avatarUrl || req.body.avatar;

    if (req.file) {
        rutaAvatar = `/imagenes/perfiles/${req.file.filename}`;
    }

    if (!rutaAvatar) {
        return res.status(400).json({ message: "No se proporcionó ninguna imagen o avatar válido." });
    }

    db.query(
        "UPDATE usuarios SET avatar = ? WHERE id = ?",
        [rutaAvatar, usuarioId],
        (err, resultado) => {
            if (err) {
                console.error("Error al actualizar avatar en BD:", err);
                return res.status(500).json({ message: "Error al actualizar la foto de perfil en el servidor." });
            }

            res.json({
                message: "Foto de perfil actualizada con éxito",
                avatar: rutaAvatar
            });
        }
    );
});

// ==========================================
// GUARDAR MOVIMIENTO
// ==========================================
app.post("/api/gastos", verificarToken, (req, res) => {
    const { categoria, monto, fecha } = req.body;
    const usuarioId = req.user.id;
    const montoNum = Number(monto);
    const tipo = req.body.tipo || "Gasto"; 

    if (!categoria || !Number.isFinite(montoNum) || montoNum <= 0 || !fecha) {
        return res.status(400).json({
            message: "Datos del movimiento inválidos"
        });
    }

    const sql = `
        INSERT INTO movimientos
        (usuario_id, tipo, categoria, monto, fecha)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [usuarioId, tipo, categoria, montoNum, fecha],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    message: "Error al guardar en la base de datos"
                });
            }

            res.json({
                message: "Movimiento guardado correctamente"
            });
        }
    );
});

// ==========================================
// LISTA DE MOVIMIENTOS
// ==========================================
app.get("/api/lista-gastos", verificarToken, (req, res) => {
    const usuarioId = req.user.id;

    db.query(
        `SELECT id, tipo, categoria, monto, fecha
         FROM movimientos
         WHERE usuario_id = ?
         ORDER BY fecha DESC`,
        [usuarioId],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    message: "Error al obtener el historial"
                });
            }

            results.forEach(item => {
                if (item.categoria) {
                    item.categoria = item.categoria.replace(/\s\[meta_id:\d+\]/, '');
                }
            });

            res.json(results);
        }
    );
});

// ==========================================
// RESUMEN PARA GRÁFICAS
// ==========================================
app.get("/api/resumen-gastos", verificarToken, (req, res) => {
    const usuarioId = req.user.id;

    const sql = `
        SELECT categoria, categoria AS tipo, SUM(monto) AS total
        FROM movimientos
        WHERE usuario_id = ?
        GROUP BY categoria
    `;

    db.query(sql, [usuarioId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                message: "Error al obtener datos"
            });
        }

        results.forEach(row => {
            if (row.categoria) {
                row.categoria = row.categoria.replace(/\s\[meta_id:\d+\]/, '');
                row.tipo = row.categoria;
            }
        });

        res.json(results);
    });
});

// ==========================================
// ACTUALIZAR PERFIL (Usuario regular)
// ==========================================
app.put("/api/perfil", verificarToken, (req, res) => {
    const { nombre, saldo } = req.body;
    const usuarioId = req.user.id;

    if (!nombre || !Number.isFinite(Number(saldo))) {
        return res.status(400).json({
            message: "Datos del perfil inválidos"
        });
    }

    db.query(
        "UPDATE usuarios SET nombre = ?, saldo = ? WHERE id = ?",
        [nombre, Number(saldo), usuarioId],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    message: "Error al actualizar la base de datos"
                });
            }

            res.json({
                message: "Perfil actualizado correctamente"
            });
        }
    );
});

// ==========================================
// SOLICITAR RECUPERACIÓN DE CONTRASEÑA
// ==========================================
app.post("/api/solicitar-recuperacion", (req, res) => {
    const { correo } = req.body;

    if (!correo) {
        return res.status(400).json({
            message: "El correo es obligatorio"
        });
    }

    db.query(
        "SELECT id, nombre FROM usuarios WHERE correo = ?",
        [correo.trim().toLowerCase()],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    message: "Error del servidor"
                });
            }

            if (results.length === 0) {
                return res.status(404).json({
                    message: "El correo no está registrado"
                });
            }

            const usuarioNombre = results[0].nombre;
            const token = crypto.randomBytes(20).toString("hex");
            const expiracion = new Date(Date.now() + 3600000);

            db.query(
                `UPDATE usuarios
                 SET reset_token = ?, reset_expiracion = ?
                 WHERE correo = ?`,
                [token, expiracion, correo.trim().toLowerCase()],
                (errUpdate) => {
                    if (errUpdate) {
                        console.error(errUpdate);
                        return res.status(500).json({
                            message: "Error al guardar el token temporal"
                        });
                    }

                    const transporter = nodemailer.createTransport({
                        service: "gmail",
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
                        subject: "Recuperación de Contraseña - ConSiente",
                        html: `
                            <div style="font-family: Arial; padding: 25px;">
                                <h2>Recuperación de cuenta</h2>
                                <p>Hola <b>${usuarioNombre}</b>,</p>
                                <p>Solicitaste restablecer tu contraseña.</p>
                                <a href="http://localhost:3000/restablecer.html?token=${token}">
                                    Restablecer mi contraseña
                                </a>
                            </div>
                        `
                    };

                    transporter.sendMail(mailOptions, (error) => {
                        if (error) {
                            console.error(error);
                            return res.status(500).json({
                                message: "No se pudo enviar el correo de recuperación"
                            });
                        }

                        res.json({
                            message: "Correo enviado. Revisa tu bandeja de entrada o spam."
                        });
                    });
                }
            );
        }
    );
});

// ==========================================
// RESTABLECER CONTRASEÑA
// ==========================================
app.post("/api/restablecer-password", (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({
            message: "Faltan datos obligatorios"
        });
    }

    db.query(
        `SELECT id FROM usuarios
         WHERE reset_token = ? AND reset_expiracion > NOW()`,
        [token],
        async (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    message: "Error en el servidor"
                });
            }

            if (results.length === 0) {
                return res.status(400).json({
                    message: "El enlace es inválido o ya expiró"
                });
            }

            try {
                const hashedPassword = await bcrypt.hash(password, 10);

                db.query(
                    `UPDATE usuarios
                     SET password = ?, reset_token = NULL,
                         reset_expiracion = NULL
                     WHERE id = ?`,
                    [hashedPassword, results[0].id],
                    (errUpdate) => {
                        if (errUpdate) {
                            console.error(errUpdate);
                            return res.status(500).json({
                                message: "Error al actualizar la contraseña"
                            });
                        }

                        res.json({
                            message: "Contraseña actualizada correctamente"
                        });
                    }
                );
            } catch (error) {
                console.error(error);
                res.status(500).json({
                    message: "Error al procesar el cifrado"
                });
            }
        }
    );
});

// ==========================================
// EDITAR MOVIMIENTO
// ==========================================
app.put("/api/lista-gastos/:id", verificarToken, (req, res) => {
    const movimientoId = req.params.id;
    const usuarioId = req.user.id;
    const { categoria, monto, fecha } = req.body;
    const montoNum = Number(monto);

    if (
        !categoria ||
        !Number.isFinite(montoNum) ||
        montoNum <= 0 ||
        !fecha
    ) {
        return res.status(400).json({
            message: "Datos del movimiento inválidos"
        });
    }

    db.query(
        `UPDATE movimientos
         SET categoria = ?, monto = ?, fecha = ?
         WHERE id = ? AND usuario_id = ?`,
        [categoria, montoNum, fecha, movimientoId, usuarioId],
        (err, resultado) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    message: "Error al actualizar movimiento"
                });
            }

            if (resultado.affectedRows === 0) {
                return res.status(404).json({
                    message: "Movimiento no encontrado"
                });
            }

            res.json({
                message: "Movimiento actualizado con éxito"
            });
        }
    );
});

// ==========================================
// ELIMINAR MOVIMIENTO
// ==========================================
app.delete("/api/lista-gastos/:id", verificarToken, (req, res) => {
    const movimientoId = req.params.id;
    const usuarioId = req.user.id;

    db.query(
        "DELETE FROM movimientos WHERE id = ? AND usuario_id = ?",
        [movimientoId, usuarioId],
        (err, resultado) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    message: "Error al borrar movimiento"
                });
            }

            if (resultado.affectedRows === 0) {
                return res.status(404).json({
                    message: "Movimiento no encontrado"
                });
            }

            res.json({
                message: "Movimiento eliminado con éxito"
            });
        }
    );
});

// ==========================================
// ELIMINAR CUENTA
// ==========================================
app.delete("/api/cuenta", verificarToken, (req, res) => {
    const usuarioId = req.user.id;

    db.query(
        "DELETE FROM movimientos WHERE usuario_id = ?",
        [usuarioId],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    message: "Error al limpiar el historial"
                });
            }

            db.query(
                "DELETE FROM metas WHERE usuario_id = ?",
                [usuarioId],
                (errMetas) => {
                    if (errMetas) {
                        console.error(errMetas);
                        return res.status(500).json({
                            message: "Error al eliminar las metas"
                        });
                    }

                    db.query(
                        "DELETE FROM usuarios WHERE id = ?",
                        [usuarioId],
                        (errUsuario) => {
                            if (errUsuario) {
                                console.error(errUsuario);
                                return res.status(500).json({
                                    message: "Error al eliminar el usuario"
                                });
                            }

                            res.json({
                                message: "Cuenta eliminada correctamente"
                            });
                        }
                    );
                }
            );
        }
    );
});

// ==========================================
// SEMÁFORO FINANCIERO (Blindado contra errores)
// ==========================================
app.get("/api/semaforo-economico", verificarToken, async (req, res) => {
    try {
        const API_KEY = process.env.FASTFOREX_API_KEY;

        if (!API_KEY) {
            return res.json({
                success: true,
                dolar: "18.04",
                gasolina: "23.69",
                inflacion: "3.94",
                salarioMinimo: "315.04"
            });
        }

        const url = `https://api.fastforex.io/fetch-one?from=USD&to=MXN&api_key=${API_KEY}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Error de conexión con el servicio");
        }

        const data = await response.json();

        res.json({
            success: true,
            dolar: Number(data.result.MXN).toFixed(2),
            gasolina: "23.69",
            inflacion: "3.94",
            salarioMinimo: "315.04"
        });
    } catch (error) {
        res.json({
            success: true,
            dolar: "18.04",
            gasolina: "23.69",
            inflacion: "3.94",
            salarioMinimo: "315.04"
        });
    }
});

// ==========================================
// METAS DE AHORRO
// ==========================================
app.get("/api/metas", verificarToken, (req, res) => {
    const usuarioId = req.user.id;

    db.query(
        "SELECT * FROM metas WHERE usuario_id = ? ORDER BY id DESC",
        [usuarioId],
        (err, resultados) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Error al obtener metas"
                });
            }

            res.json(resultados);
        }
    );
});

app.post("/api/metas", verificarToken, (req, res) => {
    const usuarioId = req.user.id;
    const {
        nombre,
        monto_target,
        fecha_limite,
        frecuencia,
        dia_pago,
        cuota
    } = req.body;

    const objetivo = Number(monto_target);
    const cuotaNum = Number(cuota);

    if (
        !nombre ||
        !Number.isFinite(objetivo) ||
        objetivo <= 0 ||
        !fecha_limite ||
        !frecuencia ||
        !Number.isFinite(cuotaNum) ||
        cuotaNum <= 0
    ) {
        return res.status(400).json({
            error: "Completa los datos de la meta correctamente"
        });
    }

    const sql = `
        INSERT INTO metas
        (usuario_id, nombre, monto_target, monto_ahorrado,
         fecha_limite, frecuencia, dia_pago, cuota)
        VALUES (?, ?, ?, 0.00, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            usuarioId,
            nombre.trim(),
            objetivo,
            fecha_limite,
            frecuencia,
            dia_pago || "General",
            cuotaNum
        ],
        (err, resultado) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Error al guardar la meta"
                });
            }

            res.status(201).json({
                mensaje: "Meta creada exitosamente",
                id: resultado.insertId
            });
        }
    );
});

app.put("/api/metas/:id", verificarToken, (req, res) => {
    const usuarioId = req.user.id;
    const metaId = req.params.id;

    const {
        nombre,
        monto_target,
        fecha_limite,
        frecuencia,
        dia_pago,
        cuota
    } = req.body;

    const objetivo = Number(monto_target);
    const cuotaNum = Number(cuota);

    if (
        !nombre ||
        !Number.isFinite(objetivo) ||
        objetivo <= 0 ||
        !fecha_limite ||
        !frecuencia ||
        !Number.isFinite(cuotaNum) ||
        cuotaNum <= 0
    ) {
        return res.status(400).json({
            error: "Completa los datos de la meta correctamente"
        });
    }

    db.query(
        `UPDATE metas
         SET nombre = ?, monto_target = ?, fecha_limite = ?,
             frecuencia = ?, dia_pago = ?, cuota = ?
         WHERE id = ? AND usuario_id = ?`,
        [
            nombre.trim(),
            objetivo,
            fecha_limite,
            frecuencia,
            dia_pago || "General",
            cuotaNum,
            metaId,
            usuarioId
        ],
        (err, resultado) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Error al actualizar la meta"
                });
            }

            if (resultado.affectedRows === 0) {
                return res.status(404).json({
                    error: "No se encontró la meta"
                });
            }

            res.json({
                mensaje: "Meta actualizada exitosamente"
            });
        }
    );
});

app.delete("/api/metas/:id", verificarToken, (req, res) => {
    const usuarioId = req.user.id;
    const metaId = req.params.id;
    const devolverSaldo = req.body && req.body.devolverSaldo === true;

    db.query(
        "SELECT nombre, monto_ahorrado FROM metas WHERE id = ? AND usuario_id = ?",
        [metaId, usuarioId],
        (errSelect, metas) => {
            if (errSelect) return res.status(500).json({ error: "Error al consultar la meta" });
            if (metas.length === 0) return res.status(404).json({ error: "Meta no encontrada." });

            const meta = metas[0];
            const ahorro = Math.max(0, Number(meta.monto_ahorrado) || 0);
            
            const categoriaNueva = `Ahorro / Meta: ${meta.nombre} [meta_id:${metaId}]`;
            const categoriaAnterior = `Ahorro / Meta: ${meta.nombre}`;

            db.query(
                "DELETE FROM metas WHERE id = ? AND usuario_id = ?",
                [metaId, usuarioId],
                (errEliminar, resultado) => {
                    if (errEliminar) return res.status(500).json({ error: "No se pudo eliminar la meta" });
                    if (resultado.affectedRows === 0) return res.status(400).json({ error: "La meta ya fue eliminada" });

                    db.query(
                        "DELETE FROM movimientos WHERE usuario_id = ? AND (categoria = ? OR categoria = ?)",
                        [usuarioId, categoriaNueva, categoriaAnterior],
                        (errMov) => {
                            if (errMov) console.error("Error al limpiar movimientos", errMov);

                            if (devolverSaldo) {
                                res.json({ mensaje: "Meta eliminada y dinero devuelto visualmente", devuelto: ahorro });
                            } else {
                                if (ahorro > 0) {
                                    db.query(
                                        "UPDATE usuarios SET saldo = COALESCE(saldo, 0) - ? WHERE id = ?",
                                        [ahorro, usuarioId],
                                        (errSaldo) => {
                                            if (errSaldo) console.error("Error al ajustar saldo:", errSaldo);
                                            res.json({ mensaje: "Meta eliminada sin devolver saldo", devuelto: 0 });
                                        }
                                    );
                                } else {
                                    res.json({ mensaje: "Meta eliminada sin devolver saldo", devuelto: 0 });
                                }
                            }
                        }
                    );
                }
            );
        }
    );
});

app.post("/api/metas/:id/abonar", verificarToken, abonarMetaLogica);
app.put("/api/metas/:id/abonar", verificarToken, abonarMetaLogica);

function abonarMetaLogica(req, res) {
    const usuarioId = req.user.id;
    const metaId = req.params.id;
    const solicitado = Number(
        req.body.monto ?? req.body.montoAbono
    );

    if (!Number.isFinite(solicitado) || solicitado <= 0) {
        return res.status(400).json({
            error: "Monto de abono inválido"
        });
    }

    db.query(
        `SELECT nombre, monto_target, monto_ahorrado
         FROM metas
         WHERE id = ? AND usuario_id = ?`,
        [metaId, usuarioId],
        (err, resultados) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Error al consultar la meta"
                });
            }

            if (resultados.length === 0) {
                return res.status(404).json({
                    error: "No se encontró la meta"
                });
            }

            const meta = resultados[0];
            const ahorroActual = Number(meta.monto_ahorrado) || 0;
            const objetivo = Number(meta.monto_target) || 0;

            const abono = Math.min(
                solicitado,
                Math.max(0, objetivo - ahorroActual)
            );

            if (abono <= 0) {
                return res.status(400).json({
                    error: "La meta ya alcanzó su objetivo"
                });
            }

            db.query(
                `UPDATE metas
                 SET monto_ahorrado = LEAST(monto_target, monto_ahorrado + ?)
                 WHERE id = ? AND usuario_id = ?`,
                [abono, metaId, usuarioId],
                (errActualizar) => {
                    if (errActualizar) {
                        console.error(errActualizar);
                        return res.status(500).json({
                            error: "Error al abonar a la meta"
                        });
                    }

                    const fechaHoy = new Date().toISOString().slice(0, 10);
                    const categoria = `Ahorro / Meta: ${meta.nombre}`;

                    db.query(
                        `INSERT INTO movimientos
                         (usuario_id, tipo, categoria, monto, fecha)
                         VALUES (?, 'Gasto', ?, ?, ?)`,
                        [usuarioId, categoria, abono, fechaHoy],
                        (errMovimiento) => {
                            if (errMovimiento) {
                                console.error(errMovimiento);
                                return db.query(
                                    `UPDATE metas
                                     SET monto_ahorrado = ?
                                     WHERE id = ? AND usuario_id = ?`,
                                    [ahorroActual, metaId, usuarioId],
                                    () => {
                                        res.status(500).json({
                                            error: "No se pudo registrar el movimiento del abono"
                                        });
                                    }
                                );
                            }

                            res.json({
                                mensaje: "Abono registrado correctamente",
                                montoAbonado: abono
                            });
                        }
                    );
                }
            );
        }
    );
}

// ==========================================
// RUTAS DE ADMINISTRACIÓN (Panel Admin Pro)
// ==========================================
app.get("/api/admin/usuarios", verificarToken, (req, res) => {
    db.query("SELECT rol FROM usuarios WHERE id = ?", [req.user.id], (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado. Se requieren privilegios de administrador." });
        }

        const buscar = req.query.buscar ? `%${req.query.buscar}%` : '%%';

        const sql = `
            SELECT u.id, u.nombre, u.correo, u.saldo, u.rol, u.racha_dias,
                   DATE_FORMAT(u.ultimo_acceso, '%d/%m/%Y') AS ultimo_ingreso,
                   (SELECT COUNT(*) FROM metas m WHERE m.usuario_id = u.id) AS total_metas
            FROM usuarios u
            WHERE u.nombre LIKE ? OR u.correo LIKE ?
        `;

        db.query(sql, [buscar, buscar], (errUsers, usuarios) => {
            if (errUsers) return res.status(500).json({ error: "Error al obtener lista de usuarios" });
            res.json(usuarios);
        });
    });
});

app.get("/api/admin/usuarios/:id/detalle", verificarToken, (req, res) => {
    const adminId = req.user.id;
    const usuarioId = req.params.id;

    db.query("SELECT rol FROM usuarios WHERE id = ?", [adminId], (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado." });
        }

        db.query("SELECT id, nombre, correo, rol, racha_dias, saldo FROM usuarios WHERE id = ?", [usuarioId], (errUser, userRes) => {
            if (errUser || userRes.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });
            const usuario = userRes[0];

            db.query("SELECT COUNT(*) AS totalMetas FROM metas WHERE usuario_id = ?", [usuarioId], (errMeta, metaRes) => {
                db.query("SELECT COUNT(*) AS totalMovimientos, SUM(CASE WHEN tipo = 'Gasto' THEN monto ELSE 0 END) AS sumaGastos FROM movimientos WHERE usuario_id = ?", [usuarioId], (errMov, movRes) => {
                    res.json({
                        usuario: usuario,
                        estadisticas: {
                            totalMetas: metaRes[0]?.totalMetas || 0,
                            totalMovimientos: movRes[0]?.totalMovimientos || 0,
                            sumaGastos: movRes[0]?.sumaGastos || 0
                        }
                    });
                });
            });
        });
    });
});

app.put("/api/admin/usuarios/:id", verificarToken, (req, res) => {
    const adminId = req.user.id;
    const usuarioEditarId = req.params.id;
    const { nombre, correo, saldo, rol } = req.body;

    db.query("SELECT rol FROM usuarios WHERE id = ?", [adminId], (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado. Se requieren privilegios de administrador." });
        }

        if (!nombre || !correo || saldo === undefined || !rol) {
            return res.status(400).json({ error: "Faltan datos obligatorios para la actualización." });
        }

        const query = `
            UPDATE usuarios 
            SET nombre = ?, correo = ?, saldo = ?, rol = ? 
            WHERE id = ? 
        `;

        db.query(query, [nombre, correo, saldo, rol, usuarioEditarId], (updateErr, updateResult) => {
            if (updateErr) {
                console.error("Error al actualizar usuario en BD:", updateErr);
                return res.status(500).json({ error: "Error al actualizar la base de datos." });
            }
            
            if (updateResult.affectedRows === 0) {
                return res.status(404).json({ error: "Usuario no encontrado en la base de datos." });
            }

            res.json({ mensaje: "Perfil actualizado con éxito." });
        });
    });
});

app.post("/api/admin/usuarios/:id/notificar", verificarToken, (req, res) => {
    const adminId = req.user.id;
    const usuarioDestinoId = req.params.id;
    const { titulo, mensaje } = req.body;

    db.query("SELECT rol FROM usuarios WHERE id = ?", [adminId], (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado." });
        }

        if (!titulo || !mensaje) {
            return res.status(400).json({ error: "El título y el mensaje son obligatorios." });
        }

        const sql = `INSERT INTO notificaciones (usuario_id, titulo, mensaje, leida) VALUES (?, ?, ?, 0)`;
        
        db.query(sql, [usuarioDestinoId, titulo, mensaje], (errNotif) => {
            if (errNotif) {
                console.error("Error al registrar notificación desde admin:", errNotif);
                return res.status(500).json({ error: "Error al registrar la notificación en la base de datos." });
            }

            res.json({ mensaje: "Notificación enviada correctamente al usuario." });
        });
    });
});

app.delete("/api/admin/usuarios/:id", verificarToken, (req, res) => {
    const adminId = req.user.id;
    const usuarioEliminarId = req.params.id;

    db.query("SELECT rol FROM usuarios WHERE id = ?", [adminId], (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado." });
        }

        db.query("DELETE FROM movimientos WHERE usuario_id = ?", [usuarioEliminarId], (errMov) => {
            if (errMov) return res.status(500).json({ error: "Error al borrar movimientos" });

            db.query("DELETE FROM metas WHERE usuario_id = ?", [usuarioEliminarId], (errMetas) => {
                if (errMetas) return res.status(500).json({ error: "Error al borrar metas" });

                db.query("DELETE FROM notificaciones WHERE usuario_id = ?", [usuarioEliminarId], () => {
                    db.query("DELETE FROM usuarios WHERE id = ?", [usuarioEliminarId], (errUsr) => {
                        if (errUsr) return res.status(500).json({ error: "Error al eliminar usuario" });

                        res.json({ mensaje: "Usuario eliminado correctamente por el administrador" });
                    });
                });
            });
        });
    });
});

app.post("/api/admin/crear-subadmin", verificarToken, (req, res) => {
    const adminId = req.user.id;
    const { nombre, correo, password } = req.body;

    db.query("SELECT rol FROM usuarios WHERE id = ?", [adminId], async (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado. Se requieren privilegios de administrador." });
        }

        if (!nombre || !correo || !password) {
            return res.status(400).json({ error: "Todos los campos son obligatorios." });
        }

        const correoLimpio = correo.trim().toLowerCase();

        db.query("SELECT id FROM usuarios WHERE correo = ?", [correoLimpio], async (errValidacion, resValidacion) => {
            if (errValidacion) {
                console.error(errValidacion);
                return res.status(500).json({ error: "Error en el servidor al verificar el correo." });
            }

            if (resValidacion.length > 0) {
                return res.status(400).json({ error: "El correo ya está registrado en el sistema." });
            }

            try {
                const hashedPassword = await bcrypt.hash(password, 10);
                const sqlInsert = `
                    INSERT INTO usuarios (nombre, correo, password, saldo, rol)
                    VALUES (?, ?, ?, 0, 'admin')
                `;

                db.query(sqlInsert, [nombre, correoLimpio, hashedPassword], (errInsert) => {
                    if (errInsert) {
                        console.error(errInsert);
                        return res.status(500).json({ error: "Error al guardar el administrador en la base de datos." });
                    }

                    res.status(201).json({ message: "Sub-administrador creado correctamente." });
                });
            } catch (hashError) {
                console.error(hashError);
                res.status(500).json({ error: "Error al procesar la seguridad de la contraseña." });
            }
        });
    });
});

app.get("/api/admin/estadisticas", verificarToken, (req, res) => {
    db.query("SELECT rol FROM usuarios WHERE id = ?", [req.user.id], (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado." });
        }

        db.query("SELECT racha_dias, COUNT(*) as cantidad FROM usuarios GROUP BY racha_dias", (errRachas, rachasData) => {
            if (errRachas) return res.status(500).json({ error: "Error al calcular rachas" });

            db.query("SELECT categoria, COUNT(*) as total FROM movimientos GROUP BY categoria ORDER BY total DESC LIMIT 5", (errMov, movData) => {
                if (errMov) return res.status(500).json({ error: "Error al calcular movimientos" });

                res.json({
                    distribucionRachas: rachasData,
                    usoMovimientos: movData
                });
            });
        });
    });
});

// ==========================================
// MÓDULO DE NOTIFICACIONES
// ==========================================
app.post('/api/save-subscription', (req, res) => {
  const { userId, subscription } = req.body;
  const subscriptionJson = JSON.stringify(subscription);

  const query = `
    INSERT INTO suscripciones_push (user_id, subscription_data) 
    VALUES (?, ?) 
    ON DUPLICATE KEY UPDATE subscription_data = ?
  `;

  db.query(query, [userId, subscriptionJson, subscriptionJson], (err) => {
    if (err) {
      console.error('Error al guardar suscripción:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    res.status(201).json({ message: 'Suscripción guardada con éxito.' });
  });
});

app.get('/api/get-current-user', verificarToken, (req, res) => {
    res.json({ userId: req.user.id });
});

app.get('/api/notificaciones', verificarToken, (req, res) => {
  const usuarioId = req.user.id;
  
  const query = `
    SELECT id, titulo, mensaje, leida, fecha 
    FROM notificaciones 
    WHERE usuario_id = ? 
    ORDER BY id DESC 
    LIMIT 20
  `;

  db.query(query, [usuarioId], (err, results) => {
    if (err) {
        console.error('Error al consultar notificaciones:', err);
        return res.status(500).json({ error: 'Error al consultar historial' });
    }
    
    const resultadosSeguros = results.map(notif => ({
        ...notif,
        leida: notif.leida || 0,
        fecha: notif.fecha || new Date()
    }));

    res.json(resultadosSeguros);
  });
});

app.put('/api/notificaciones/:id/leida', verificarToken, (req, res) => {
  const usuarioId = req.user.id;
  const notifId = req.params.id;

  const query = `UPDATE notificaciones SET leida = 1 WHERE id = ? AND usuario_id = ?`;

  db.query(query, [notifId, usuarioId], (err) => {
    if (err) return res.status(500).json({ error: 'Error al actualizar' });
    res.json({ success: true, message: 'Notificación marcada como leída.' });
  });
});

app.put('/api/notificaciones/marcar-leidas', verificarToken, (req, res) => {
  const usuarioId = req.user.id;
  const query = `UPDATE notificaciones SET leida = 1 WHERE usuario_id = ?`;

  db.query(query, [usuarioId], (err) => {
    if (err) return res.status(500).json({ error: 'Error al actualizar' });
    res.json({ success: true, message: 'Notificaciones marcadas como leídas.' });
  });
});

app.delete('/api/notificaciones/:id', verificarToken, (req, res) => {
  const usuarioId = req.user.id;
  const notifId = req.params.id;

  const query = `DELETE FROM notificaciones WHERE id = ? AND usuario_id = ?`;

  db.query(query, [notifId, usuarioId], (err, resultado) => {
    if (err) return res.status(500).json({ error: 'Error al eliminar' });
    if (resultado.affectedRows === 0) return res.status(404).json({ error: 'Notificación no encontrada' });
    res.json({ success: true, message: 'Notificación eliminada correctamente.' });
  });
});

function verificarYEnviarAbonosHoy() {
  const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const hoyEnEspañol = diasSemana[new Date().getDay()];

  const query = `
    SELECT usuario_id, nombre AS nombre_meta 
    FROM metas 
    WHERE dia_pago = ? AND frecuencia = 'Semanal'
  `;

  db.query(query, [hoyEnEspañol], (err, results) => {
    if (err) return console.error('Error en consulta de metas automáticas:', err);

    results.forEach(row => {
      const tituloAlerta = '⏰ Día de Abono ConSiente';
      const mensajeAlerta = `¡Hola! Hoy es tu día programado para aportar a tu meta: "${row.nombre_meta}". ¡Haz clic para abonar!`;

      const sqlHistorial = `INSERT INTO notificaciones (usuario_id, titulo, mensaje, leida) VALUES (?, ?, ?, 0)`;
      db.query(sqlHistorial, [row.usuario_id, tituloAlerta, mensajeAlerta], (errHistorial) => {
        if (errHistorial) console.error('Error al guardar notificación automática:', errHistorial);
      });
    });
  });
}

setInterval(verificarYEnviarAbonosHoy, 1000 * 60 * 60 * 24); 
setTimeout(verificarYEnviarAbonosHoy, 5000); 

// ==========================================
// OBTENER MISIONES PARA LA VISTA DE RACHA
// ==========================================
app.get("/api/misiones", verificarToken, (req, res) => {
    db.query("SELECT * FROM misiones ORDER BY id ASC", (err, resultados) => {
        if (err) {
            console.error("Error al obtener misiones:", err);
            return res.status(500).json({ error: "Error al obtener las misiones" });
        }
        res.json(resultados);
    });
});

// ==========================================
// MISIONES Y PREMIOS
// ==========================================
app.post("/api/admin/misiones", verificarToken, upload.fields([{ name: 'archivoGris', maxCount: 1 }, { name: 'archivoColor', maxCount: 1 }]), (req, res) => {
    const { titulo, recompensa, descripcion, tipo_condicion, cantidad_objetivo } = req.body;
    
    db.query("SELECT rol FROM usuarios WHERE id = ?", [req.user.id], (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado." });
        }

        if (!titulo || !recompensa) {
            return res.status(400).json({ error: "Título y recompensa son obligatorios." });
        }

        let rutaGris = req.files && req.files['archivoGris'] ? `/imagenes/perfiles/${req.files['archivoGris'][0].filename}` : '';
        let rutaColor = req.files && req.files['archivoColor'] ? `/imagenes/perfiles/${req.files['archivoColor'][0].filename}` : '';

        const sql = `
            INSERT INTO misiones 
            (titulo, recompensa, descripcion, imagen_gris, imagen_color, tipo_condicion, cantidad_objetivo) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.query(sql, [titulo, recompensa, descripcion, rutaGris, rutaColor, tipo_condicion || 'racha', cantidad_objetivo || 1], (errInsert) => {
            if (errInsert) {
                console.error("Error al guardar misión:", errInsert);
                return res.status(500).json({ error: "Error al guardar la misión en la base de datos." });
            }
            res.status(201).json({ mensaje: "Misión, iconos y requisitos guardados con éxito." });
        });
    });
});

app.put("/api/admin/misiones/:id", verificarToken, upload.fields([{ name: 'archivoGris', maxCount: 1 }, { name: 'archivoColor', maxCount: 1 }]), (req, res) => {
    const misionId = req.params.id;
    const { titulo, recompensa, descripcion, tipo_condicion, cantidad_objetivo } = req.body;

    db.query("SELECT rol FROM usuarios WHERE id = ?", [req.user.id], (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado." });
        }

        db.query("SELECT imagen_gris, imagen_color FROM misiones WHERE id = ?", [misionId], (errSelect, misRes) => {
            if (errSelect || misRes.length === 0) {
                return res.status(404).json({ error: "Misión no encontrada." });
            }

            let rutaGris = req.files && req.files['archivoGris'] ? `/imagenes/perfiles/${req.files['archivoGris'][0].filename}` : misRes[0].imagen_gris;
            let rutaColor = req.files && req.files['archivoColor'] ? `/imagenes/perfiles/${req.files['archivoColor'][0].filename}` : misRes[0].imagen_color;

            const sql = `
                UPDATE misiones 
                SET titulo = ?, recompensa = ?, descripcion = ?, imagen_gris = ?, imagen_color = ?, tipo_condicion = ?, cantidad_objetivo = ?
                WHERE id = ?
            `;

            db.query(sql, [titulo, recompensa, descripcion, rutaGris, rutaColor, tipo_condicion || 'racha', cantidad_objetivo || 1, misionId], (errUpdate) => {
                if (errUpdate) {
                    console.error("Error al actualizar misión:", errUpdate);
                    return res.status(500).json({ error: "Error al actualizar la misión en la base de datos." });
                }
                res.json({ mensaje: "Misión actualizada correctamente." });
            });
        });
    });
});

app.delete("/api/admin/misiones/:id", verificarToken, (req, res) => {
    const misionId = req.params.id;

    db.query("SELECT rol FROM usuarios WHERE id = ?", [req.user.id], (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado." });
        }

        db.query("DELETE FROM misiones WHERE id = ?", [misionId], (errDel, resultado) => {
            if (errDel) {
                console.error("Error al eliminar misión:", errDel);
                return res.status(500).json({ error: "Error al eliminar la misión." });
            }

            if (resultado.affectedRows === 0) {
                return res.status(404).json({ error: "Misión no encontrada." });
            }

            res.json({ mensaje: "Misión eliminada correctamente." });
        });
    });
});

app.get("/api/admin/premios-reclamados", verificarToken, (req, res) => {
    db.query("SELECT rol FROM usuarios WHERE id = ?", [req.user.id], (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado." });
        }

        const sql = `
            SELECT p.id, u.nombre, u.correo, p.mision_titulo, p.premio_reclamado, 
                   DATE_FORMAT(p.fecha_reclamado, '%d/%m/%Y %H:%i') AS fecha
            FROM premios_reclamados p
            JOIN usuarios u ON p.usuario_id = u.id
            ORDER BY p.fecha_reclamado DESC
        `;
        db.query(sql, (errSelect, premios) => {
            if (errSelect) return res.status(500).json({ error: "Error al obtener historial." });
            res.json(premios);
        });
    });
});

app.post("/api/premios/reclamar", verificarToken, (req, res) => {
    const usuarioId = req.user.id;
    const { mision_titulo, premio_reclamado, iconoUrl } = req.body;

    if (!mision_titulo || !premio_reclamado) {
        return res.status(400).json({ error: "Faltan datos del premio." });
    }

    const sql = `INSERT INTO premios_reclamados (usuario_id, mision_titulo, premio_reclamado) VALUES (?, ?, ?)`;
    db.query(sql, [usuarioId, mision_titulo, premio_reclamado], (err) => {
        if (err) {
            console.error("Error al registrar el premio:", err);
            return res.status(500).json({ error: "Error al registrar el premio." });
        }

        if (iconoUrl) {
            db.query("UPDATE usuarios SET avatar = ? WHERE id = ?", [iconoUrl, usuarioId], (errAvatar) => {
                if (errAvatar) console.error("Error al actualizar avatar por misión:", errAvatar);
            });
        }

        res.status(201).json({ mensaje: "¡Premio e icono desbloqueados y registrados con éxito!" });
    });
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
