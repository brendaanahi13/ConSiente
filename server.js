const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const webpush = require('web-push');

require("dotenv").config();

const db = require("./db");
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Configurar las llaves VAPID de seguridad
webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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
        
        // Si el correo coincide con el equipo, se registra automáticamente como admin
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

                // Asegurar que la cuenta oficial siempre tenga rol admin en el token
                const esAdmin = (correoLimpio === "equipoconsiente@gmail.com" || user.rol === "admin");
                const rolFinal = esAdmin ? "admin" : "usuario";

                // Si entró el admin con contraseña correcta pero en la BD decía usuario, lo actualizamos
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
// OBTENER PERFIL (CON CONTROL DE RACHAS INTEGRADO)
// ==========================================
app.get("/api/perfil", verificarToken, (req, res) => {
    const usuarioId = req.user.id; 
    const hoy = new Date().toISOString().split('T')[0]; 

    // 1. Primero procesamos la racha de este usuario de forma interna
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
                        db.query('INSERT INTO historial_notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)', [usuarioId, titulo, mensaje]);
                    }
                });
            }
        }

        // 2. Al terminar la racha, mandamos los datos al frente de inmediato
        db.query(
            "SELECT nombre, saldo, rol, racha_dias FROM usuarios WHERE id = ?",
            [usuarioId],
            (errPerfil, perfilResults) => {
                if (errPerfil) return res.status(500).json({ message: "Error al obtener datos" });
                if (perfilResults.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
                res.json(perfilResults[0]);
            }
        );
    });
});

// ==========================================
// GUARDAR MOVIMIENTO (CORREGIDO)
// ==========================================
app.post("/api/gastos", verificarToken, (req, res) => {
    const { categoria, monto, fecha } = req.body;
    const usuarioId = req.user.id;
    const montoNum = Number(monto);
    
    // Forzamos "Gasto" por defecto si no viene en la petición para evitar error 400
    const tipo = req.body.tipo || "Gasto"; 

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
// ACTUALIZAR PERFIL
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
                                <a href="/restablecer.html?token=${token}">
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
// SEMÁFORO FINANCIERO
// ==========================================
app.get("/api/semaforo-economico", verificarToken, async (req, res) => {
    try {
        const API_KEY = process.env.FASTFOREX_API_KEY;

        if (!API_KEY) {
            throw new Error("Falta FASTFOREX_API_KEY en .env");
        }

        const url =
            `https://api.fastforex.io/fetch-one?from=USD&to=MXN&api_key=${API_KEY}`;

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
        console.error("Error del semáforo:", error);

        res.status(500).json({
            success: false,
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

// Obtener metas
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

// Crear meta
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

// Editar meta
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

// ==========================================
// ELIMINAR META Y MOVIMIENTOS ASOCIADOS
// ==========================================
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

// ==========================================
// ABONAR A UNA META
// ==========================================
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
// RUTAS DE ADMINISTRACIÓN (Panel Admin)
// ==========================================
app.get("/api/admin/usuarios", verificarToken, (req, res) => {
    // Verificamos si el usuario actual es administrador
    db.query("SELECT rol FROM usuarios WHERE id = ?", [req.user.id], (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado. Se requieren privilegios de administrador." });
        }

                const sql = `
            SELECT u.id, u.nombre, u.correo, u.saldo, u.rol, u.racha_dias,
                   (SELECT COUNT(*) FROM metas m WHERE m.usuario_id = u.id) AS total_metas
            FROM usuarios u
        `;


        db.query(sql, (errUsers, usuarios) => {
            if (errUsers) return res.status(500).json({ error: "Error al obtener lista de usuarios" });
            res.json(usuarios);
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

                db.query("DELETE FROM usuarios WHERE id = ?", [usuarioEliminarId], (errUsr) => {
                    if (errUsr) return res.status(500).json({ error: "Error al eliminar usuario" });

                    res.json({ mensaje: "Usuario eliminado correctamente por el administrador" });
                });
            });
        });
    });
});
// ==========================================
// CREAR SUB-ADMINISTRADOR
// ==========================================
app.post("/api/admin/crear-subadmin", verificarToken, (req, res) => {
    const adminId = req.user.id;
    const { nombre, correo, password } = req.body;

    // 1. Verificar que el usuario que ejecuta la acción realmente es administrador
    db.query("SELECT rol FROM usuarios WHERE id = ?", [adminId], async (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado. Se requieren privilegios de administrador." });
        }

        // 2. Validar que vengan todos los datos
        if (!nombre || !correo || !password) {
            return res.status(400).json({ error: "Todos los campos son obligatorios." });
        }

        const correoLimpio = correo.trim().toLowerCase();

        // 3. Verificar si el correo ya existe en la base de datos
        db.query("SELECT id FROM usuarios WHERE correo = ?", [correoLimpio], async (errValidacion, resValidacion) => {
            if (errValidacion) {
                console.error(errValidacion);
                return res.status(500).json({ error: "Error en el servidor al verificar el correo." });
            }

            if (resValidacion.length > 0) {
                return res.status(400).json({ error: "El correo ya está registrado en el sistema." });
            }

            try {
                // 4. Encriptar la contraseña
                const hashedPassword = await bcrypt.hash(password, 10);

                // 5. Insertar al nuevo usuario forzando el rol a 'admin'
                const sqlInsert = `
                    INSERT INTO usuarios (nombre, correo, password, saldo, rol)
                    VALUES (?, ?, ?, 0, 'admin')
                `;

                db.query(sqlInsert, [nombre, correoLimpio, hashedPassword], (errInsert) => {
                    if (errInsert) {
                        console.error(errInsert);
                        return res.status(500).json({ error: "Error al guardar el administrador en la base de datos." });
                    }

                    res.status(201).json({ message: "✅ Sub-administrador creado correctamente." });
                });
            } catch (hashError) {
                console.error(hashError);
                res.status(500).json({ error: "Error al procesar la seguridad de la contraseña." });
            }
        });
    });
});
// =========================================================================
// MÓDULO DE ALERTAS AUTOMÁTICAS Y NOTIFICACIONES - CONSIENTE
// =========================================================================

// ENDPOINT A: Guardar la suscripción del navegador para las alertas Push flotantes
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

// ENDPOINT B: Obtener las alertas del historial para pintarlas dentro de la página (CORREGIDO)
app.get('/api/notificaciones/:userId', (req, res) => {
  const { userId } = req.params;
  
  // Consulta simplificada para evitar errores de columnas faltantes
  const query = `
    SELECT id, titulo, mensaje 
    FROM historial_notificaciones 
    WHERE usuario_id = ? 
    ORDER BY id DESC 
    LIMIT 20
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
        console.error('Error al consultar historial SQL:', err);
        return res.status(500).json({ error: 'Error al consultar historial' });
    }
    
    // Le agregamos valores por defecto a los campos que la página podría estar esperando
    const resultadosSeguros = results.map(notif => ({
        ...notif,
        leido: notif.leido || 0,
        fecha: notif.fecha || "Reciente"
    }));

    res.json(resultadosSeguros);
  });
});

// ENDPOINT C: Marcar todas las notificaciones de un usuario como leídas
app.post('/api/notificaciones/marcar-leidas', (req, res) => {
  const { userId } = req.body;
  const query = `UPDATE historial_notificaciones SET leido = 1 WHERE usuario_id = ?`;

  db.query(query, [userId], (err) => {
    if (err) return res.status(500).json({ error: 'Error al actualizar' });
    res.json({ success: true, message: 'Notificaciones marcadas como leídas.' });
  });
});

// FUNCIÓN DE REVISIÓN AUTOMÁTICA DE METAS (Se ejecuta de fondo)
function verificarYEnviarAbonosHoy() {
  console.log('⏰ [Filtro Automático] Buscando abonos programados para el día de hoy...');

  const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const hoyEnEspañol = diasSemana[new Date().getDay()]; 

  const query = `
    SELECT m.usuario_id, m.nombre AS nombre_meta, s.subscription_data 
    FROM metas m
    INNER JOIN suscripciones_push s ON m.usuario_id = s.user_id
    WHERE m.dia_pago = ? AND m.frecuencia = 'Semanal'
  `;

  db.query(query, [hoyEnEspañol], (err, results) => {
    if (err) return console.error('Error en consulta de metas:', err);

    console.log(`[MySQL] Se encontraron ${results.length} metas para hoy (${hoyEnEspañol}).`);

    results.forEach(row => {
      const subscription = JSON.parse(row.subscription_data);
      const tituloAlerta = '⏰ Día de Abono - ConSiente';
      const mensajeAlerta = `¡Hola! Hoy es tu día preferido para aportar a tu meta: "${row.nombre_meta}". ¡Sigue así!`;

      // 1. Clonar y guardar la alerta en la tabla del apartado visual
      const sqlHistorial = `INSERT INTO historial_notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)`;
      db.query(sqlHistorial, [row.usuario_id, tituloAlerta, mensajeAlerta], (errHistorial) => {
        if (errHistorial) console.error('Error al guardar historial:', errHistorial);
      });

      // 2. Disparar el globo flotante Push al escritorio
      const payload = JSON.stringify({ title: tituloAlerta, body: mensajeAlerta, url: '/mis-metas' });
      webpush.sendNotification(subscription, payload).catch(() => {});
    });
  });
}

// Configurar relojes de ejecución
setInterval(verificarYEnviarAbonosHoy, 1000 * 60 * 60 * 24); // Cada 24 horas
setTimeout(verificarYEnviarAbonosHoy, 5000); // 5 segundos después de encender el servidor



// ENDPOINT CORREGIDO PARA EL PANEL ADMIN: Ver rachas generales de todos
app.get('/api/admin/rachas-generales', (req, res) => {
  const query = `
    SELECT id, nombre, racha_dias, DATE_FORMAT(ultimo_acceso, '%d/%m/%Y') as ultimo_ingreso 
    FROM usuarios 
    ORDER BY racha_dias DESC
  `;
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Error al consultar rachas generales' });
    res.json(results);
  });
});

// ==========================================
// ESTADÍSTICAS AVANZADAS PARA EL PANEL ADMIN
// ==========================================
app.get("/api/admin/estadisticas", verificarToken, (req, res) => {
    db.query("SELECT rol FROM usuarios WHERE id = ?", [req.user.id], (err, results) => {
        if (err || results.length === 0 || results[0].rol !== 'admin') {
            return res.status(403).json({ error: "Acceso denegado." });
        }

        // Consultamos la distribución de rachas de los usuarios
        db.query("SELECT racha_dias, COUNT(*) as cantidad FROM usuarios GROUP BY racha_dias", (errRachas, rachasData) => {
            if (errRachas) return res.status(500).json({ error: "Error al calcular rachas" });

            // Consultamos el uso por categorías en los movimientos
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
