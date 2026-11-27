if (typeof window.API_URL === 'undefined') {
    window.API_URL = "";
}

const LIMITE_NOTIFICACIONES = 4;

function obtenerTokenNotif() {
    return localStorage.getItem("token");
}

// Función auxiliar para extraer la fecha local exacta
function obtenerFechaLocalStr(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function obtenerTiempoRelativo(fechaStr) {
    if (!fechaStr) return "Hace un momento";
    const fecha = new Date(fechaStr);
    const ahora = new Date();
    const segundos = Math.floor((ahora - fecha) / 1000);
    
    if (isNaN(segundos) || segundos < 0) return "Hace un momento";
    if (segundos < 60) return "Hace un momento";
    
    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return `Hace ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
    
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `Hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    
    const dias = Math.floor(horas / 24);
    if (dias < 30) return `Hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
    
    const meses = Math.floor(dias / 30);
    if (meses < 12) return `Hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
    
    const anos = Math.floor(meses / 12);
    return `Hace ${anos} ${anos === 1 ? 'año' : 'años'}`;
}

async function purgarExcedenteNotificaciones(notificacionesExcedentes) {
    const token = obtenerTokenNotif();
    if (!token || !Array.isArray(notificacionesExcedentes) || notificacionesExcedentes.length === 0) return;

    for (const notif of notificacionesExcedentes) {
        const idNotif = notif.id || notif._id;
        if (!idNotif || String(idNotif).startsWith('local_racha_')) continue;

        try {
            await fetch(`${window.API_URL}/api/notificaciones/${idNotif}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` },
                keepalive: true
            });
        } catch (err) {
            console.error("No se pudo limpiar notificación excedente:", err);
        }
    }
}

async function cargarNotificacionesSistema() {
    const token = obtenerTokenNotif();
    if (!token) return;

    try {
        // 1. Obtener las notificaciones del servidor
        const response = await fetch(`${window.API_URL}/api/notificaciones`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        let notificaciones = [];
        if (response.ok) {
            notificaciones = await response.json();
        }

        let userId = 'user';

        // 2. Obtener perfil y gastos de manera simultánea para calcular la racha real y dinámica por usuario
        try {
            const [resPerfil, resGastos] = await Promise.all([
                fetch(`${window.API_URL}/api/perfil`, { headers: { "Authorization": `Bearer ${token}` } }),
                fetch(`${window.API_URL}/api/lista-gastos`, { headers: { "Authorization": `Bearer ${token}` } })
            ]);

            if (resPerfil.ok) {
                const usuario = await resPerfil.json();
                userId = usuario.id || usuario.usuario_id || 'user';
                window.currentNotifUserId = userId; 

                const nombreUsuario = usuario.nombre || "Usuario";
                let gastos = [];
                if (resGastos.ok) {
                    gastos = await resGastos.json();
                }

                // --- CÁLCULO DE RACHA DINÁMICO Y SINCRONIZADO ---
                const fechasGastos = new Set();
                if (Array.isArray(gastos)) {
                    gastos.forEach(g => {
                        if (g.fecha) {
                            const fechaStr = String(g.fecha).split('T')[0].split(' ')[0];
                            fechasGastos.add(fechaStr);
                        }
                    });
                }

                let hoy = new Date();
                hoy.setHours(0, 0, 0, 0);
                let hoyStr = obtenerFechaLocalStr(hoy);

                let ayer = new Date(hoy);
                ayer.setDate(ayer.getDate() - 1);
                let ayerStr = obtenerFechaLocalStr(ayer);

                let fechaCursor = null;
                if (fechasGastos.has(hoyStr)) {
                    fechaCursor = new Date(hoy);
                } else if (fechasGastos.has(ayerStr)) {
                    fechaCursor = new Date(ayer);
                }

                const fechasRachaActiva = new Set();
                if (fechaCursor) {
                    let cursor = new Date(fechaCursor);
                    while (true) {
                        let fStr = obtenerFechaLocalStr(cursor);
                        if (fechasGastos.has(fStr)) {
                            fechasRachaActiva.add(fStr);
                            cursor.setDate(cursor.getDate() - 1);
                        } else {
                            break;
                        }
                    }
                }

                const rachaActual = fechasRachaActiva.size;
                const gastoRegistradoHoy = fechasGastos.has(hoyStr);

                if (!gastoRegistradoHoy) {
                    // ETAPA 1: Aún no registra un movimiento hoy -> Notificación de bienvenida
                    const bienvenidaLeida = localStorage.getItem(`racha_bienvenida_leida_${userId}_${hoyStr}`) === 'true';
                    const bienvenidaEliminada = localStorage.getItem(`racha_bienvenida_eliminada_${userId}_${hoyStr}`) === 'true';

                    if (!bienvenidaEliminada) {
                        notificaciones.unshift({
                            id: 'local_racha_bienvenida',
                            titulo: `👋 ¡Bienvenido, ${nombreUsuario}!`,
                            mensaje: `No olvides activar tu racha del día de hoy. Registra al menos un gasto o movimiento en ConSiente para encender tu fuego diario.`,
                            leida: bienvenidaLeida ? 1 : 0,
                            fecha: new Date().toISOString()
                        });
                    }
                } else {
                    // ETAPA 2: Ya registró al menos un movimiento hoy -> Notificación de racha activada
                    const activadaLeida = localStorage.getItem(`racha_activada_leida_${userId}_${hoyStr}`) === 'true';
                    const activadaEliminada = localStorage.getItem(`racha_activada_eliminada_${userId}_${hoyStr}`) === 'true';

                    if (!activadaEliminada) {
                        notificaciones.unshift({
                            id: 'local_racha_activada',
                            titulo: `🔥 ¡Felicidades, ${nombreUsuario}! Racha activada`,
                            mensaje: `Tu racha actual es de ${rachaActual} ${rachaActual === 1 ? 'día consecutivo' : 'días consecutivos'}. Sigue registrando tus movimientos diariamente para alcanzar nuevas recompensas.`,
                            leida: activadaLeida ? 1 : 0,
                            fecha: new Date().toISOString()
                        });
                    }
                }
            }
        } catch (errPerfil) {
            console.error("No se pudo adjuntar la racha al listado:", errPerfil);
        }

        const notifList = document.getElementById("notifList");
        const notifBadge = document.getElementById("notifBadge");
        if (!notifList || !notifBadge) return;

        notifList.innerHTML = "";
        let noLeidasCount = 0;

        if (!notificaciones || notificaciones.length === 0) {
            notifList.innerHTML = `<div class="notif-item"><div class="notif-detalles"><div class="notif-texto" style="padding: 12px; color: #888; text-align: center; font-size: 13px;">No hay notificaciones recientes.</div></div></div>`;
            notifBadge.style.display = "none";
            return;
        }

        // 🛡️ FILTRO INTELIGENTE: Evitar duplicados el mismo día con el mismo título
        const unicasMap = new Map();
        notificaciones.forEach(notif => {
            const fechaDia = notif.fecha ? notif.fecha.split('T')[0] : '';
            const claveUnica = (notif.titulo || '').trim().toLowerCase() + '_' + fechaDia;
            if (!unicasMap.has(claveUnica) || (notif.id > unicasMap.get(claveUnica).id)) {
                unicasMap.set(claveUnica, notif);
            }
        });

        let notificacionesFiltradas = Array.from(unicasMap.values());

        // Ordenar de más reciente a más antigua (las notificaciones locales de racha van primero)
        notificacionesFiltradas.sort((a, b) => {
            if (String(a.id).startsWith('local_racha_')) return -1;
            if (String(b.id).startsWith('local_racha_')) return 1;
            return (Number(b.id) || 0) - (Number(a.id) || 0);
        });

        // Limitar a máximo 4 notificaciones y eliminar en BD las que sobren
        if (notificacionesFiltradas.length > LIMITE_NOTIFICACIONES) {
            const excedentes = notificacionesFiltradas.slice(LIMITE_NOTIFICACIONES);
            notificacionesFiltradas = notificacionesFiltradas.slice(0, LIMITE_NOTIFICACIONES);
            purgarExcedenteNotificaciones(excedentes);
        }

        notificacionesFiltradas.forEach(notif => {
            const idNotif = notif.id || notif._id;
            let esLeida = notif.leida === true || notif.leida === 1 || notif.leida === "1" || notif.leida === "true";

            if (!esLeida) {
                noLeidasCount++;
            }

            const tiempoRelativo = obtenerTiempoRelativo(notif.fecha);

            // Redirección inteligente según el contenido
            const textoCompleto = ((notif.titulo || "") + " " + (notif.mensaje || "")).toLowerCase();
            let destinoUrl = "agregar.html";

            if (idNotif === 'local_racha_bienvenida') {
                destinoUrl = "agregar.html";
            } else if (idNotif === 'local_racha_activada') {
                destinoUrl = "racha.html";
            } else if (textoCompleto.includes("meta") || textoCompleto.includes("abono") || textoCompleto.includes("ahorro")) {
                destinoUrl = "metas.html";
            } else if (textoCompleto.includes("avatar") || textoCompleto.includes("puerquito") || textoCompleto.includes("días de racha") || textoCompleto.includes("racha")) {
                destinoUrl = "racha.html";
            } else if (textoCompleto.includes("gasto") || textoCompleto.includes("movimiento") || textoCompleto.includes("historial")) {
                destinoUrl = "historial.html";
            } else if (textoCompleto.includes("semáforo") || textoCompleto.includes("economico") || textoCompleto.includes("finanzas")) {
                destinoUrl = "semaforo.html";
            }

            const item = document.createElement("div");
            item.className = `notif-item ${esLeida ? '' : 'unread'}`;
            item.style.cursor = "pointer";
            
            item.innerHTML = `
                <div class="notif-icon" style="font-size: 20px; margin-top: 2px; flex-shrink: 0;">🌿</div>
                <div class="notif-detalles" style="flex: 1; min-width: 0;">
                    <div class="notif-titulo-item" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${notif.titulo || 'Notificación'}</div>
                    <div class="notif-texto" style="word-break: break-word; overflow-wrap: break-word;">${notif.mensaje || notif.texto || ''}</div>
                    <div class="notif-fecha" style="font-size: 11px; color: #81c784; margin-top: 4px; font-weight: 500;">${tiempoRelativo}</div>
                </div>
                <button class="btn-eliminar-notif" title="Eliminar" style="background: transparent; border: none; color: #ffffff; cursor: pointer; font-size: 18px; padding: 4px 8px; font-weight: bold; opacity: 0.7; transition: 0.2s; flex-shrink: 0;">&times;</button>
            `;

            // Evento de clic para marcar como leída y redirigir con retardo seguro
            item.addEventListener("click", async (e) => {
                if (e.target.closest(".btn-eliminar-notif")) return;
                e.preventDefault();

                const hoyStr = obtenerFechaLocalStr(new Date());

                if (idNotif === 'local_racha_bienvenida') {
                    localStorage.setItem(`racha_bienvenida_leida_${userId}_${hoyStr}`, 'true');
                } else if (idNotif === 'local_racha_activada') {
                    localStorage.setItem(`racha_activada_leida_${userId}_${hoyStr}`, 'true');
                } else {
                    await marcarUnaLeida(idNotif);
                }

                setTimeout(() => {
                    window.location.href = destinoUrl;
                }, 150);
            });

            const btnEliminar = item.querySelector(".btn-eliminar-notif");
            btnEliminar.addEventListener("mouseenter", () => { btnEliminar.style.opacity = "1"; btnEliminar.style.color = "#ef5350"; });
            btnEliminar.addEventListener("mouseleave", () => { btnEliminar.style.opacity = "0.7"; btnEliminar.style.color = "#ffffff"; });

            btnEliminar.addEventListener("click", async (e) => {
                e.stopPropagation();
                const hoyStr = obtenerFechaLocalStr(new Date());
                if (idNotif === 'local_racha_bienvenida') {
                    localStorage.setItem(`racha_bienvenida_eliminada_${userId}_${hoyStr}`, 'true');
                    item.remove();
                    cargarNotificacionesSistema();
                    return;
                }
                if (idNotif === 'local_racha_activada') {
                    localStorage.setItem(`racha_activada_eliminada_${userId}_${hoyStr}`, 'true');
                    item.remove();
                    cargarNotificacionesSistema();
                    return;
                }
                await eliminarNotificacion(idNotif);
            });

            notifList.appendChild(item);
        });

        if (noLeidasCount > 0) {
            notifBadge.innerText = noLeidasCount;
            notifBadge.style.display = "flex";
        } else {
            notifBadge.style.display = "none";
        }

    } catch (error) {
        console.error("Error al cargar notificaciones:", error);
    }
}

async function marcarUnaLeida(idNotificacion) {
    if (String(idNotificacion).startsWith('local_racha_')) return;
    const token = obtenerTokenNotif();
    if (!token) return;
    try {
        await fetch(`${window.API_URL}/api/notificaciones/${idNotificacion}/leida`, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}` },
            keepalive: true
        });
    } catch (error) { console.error(error); }
}

async function eliminarNotificacion(idNotificacion) {
    if (String(idNotificacion).startsWith('local_racha_')) return;
    const token = obtenerTokenNotif();
    if (!token) return;
    try {
        const res = await fetch(`${window.API_URL}/api/notificaciones/${idNotificacion}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` },
            keepalive: true
        });
        if (res.ok) cargarNotificacionesSistema();
    } catch (error) { console.error(error); }
}

async function marcarTodasLeidas() {
    const token = obtenerTokenNotif();
    if (!token) return;
    try {
        const hoyStr = obtenerFechaLocalStr(new Date());
        const userId = window.currentNotifUserId || 'user';
        localStorage.setItem(`racha_bienvenida_leida_${userId}_${hoyStr}`, 'true');
        localStorage.setItem(`racha_activada_leida_${userId}_${hoyStr}`, 'true');

        const res = await fetch(`${window.API_URL}/api/notificaciones/marcar-leidas`, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) cargarNotificacionesSistema();
    } catch (error) { console.error(error); }
}

window.marcarTodasLeidas = marcarTodasLeidas;

document.addEventListener("DOMContentLoaded", () => {
    const notifBtn = document.getElementById("notifBtn");
    const notifDropdown = document.getElementById("notifDropdown");
    const userBtn = document.getElementById("userBtn");
    const dropdownMenu = document.getElementById("dropdownMenu");
    const marcarTodasBtn = document.getElementById("marcarTodasLeidasBtn");

    if (notifBtn && notifDropdown) {
        notifBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            notifDropdown.classList.toggle("show");
            if (dropdownMenu) dropdownMenu.classList.remove("show");
            cargarNotificacionesSistema();
        });
    }

    if (userBtn && dropdownMenu) {
        userBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle("show");
            if (notifDropdown) notifDropdown.classList.remove("show");
        });
    }

    if (marcarTodasBtn) {
        marcarTodasBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            marcarTodasLeidas();
        });
    }

    if (notifDropdown) notifDropdown.addEventListener("click", (e) => e.stopPropagation());
    if (dropdownMenu) dropdownMenu.addEventListener("click", (e) => e.stopPropagation());

    window.addEventListener("click", () => {
        if (notifDropdown) notifDropdown.classList.remove("show");
        if (dropdownMenu) dropdownMenu.classList.remove("show");
    });

    cargarNotificacionesSistema();
});
