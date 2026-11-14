// --- GLOBAL NOTIFICACIONES.JS COMPLETO Y OPTIMIZADO ---

// Declaración segura en el objeto global para evitar conflictos de duplicado
if (typeof window.API_URL === 'undefined') {
    window.API_URL = "";
}

function obtenerTokenNotif() {
    return localStorage.getItem("token");
}

// Función para formatear el tiempo de manera amigable
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

// Cargar las notificaciones y actualizar el badge y la lista
async function cargarNotificacionesSistema() {
    const token = obtenerTokenNotif();
    if (!token) return;

    try {
        const response = await fetch(`${window.API_URL}/api/notificaciones`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (!response.ok) return;
        let notificaciones = await response.json();

        const notifList = document.getElementById("notifList");
        const notifBadge = document.getElementById("notifBadge");
        if (!notifList || !notifBadge) return;

        notifList.innerHTML = "";
        let noLeidasCount = 0;

        if (!notificaciones || notificaciones.length === 0) {
            notifList.innerHTML = `<div class="notif-item"><div class="notif-detalles"><div class="notif-texto" style="padding: 10px; color: #888; text-align: center;">No hay notificaciones recientes.</div></div></div>`;
            notifBadge.style.display = "none";
            return;
        }

        notificaciones.sort((a, b) => {
            const idA = a.id || 0;
            const idB = b.id || 0;
            return idB - idA;
        });

        notificaciones.forEach(notif => {
            const idNotif = notif.id || notif._id;
            let esLeida = notif.leida === true || notif.leida === 1 || notif.leida === "1" || notif.leida === "true";

            if (!esLeida) {
                noLeidasCount++;
            }

            const tiempoRelativo = obtenerTiempoRelativo(notif.fecha);

            const item = document.createElement("div");
            item.className = `notif-item ${esLeida ? '' : 'unread'}`;
            item.innerHTML = `
                <div class="notif-icon" style="font-size: 18px; margin-top: 2px;">🌿</div>
                <div class="notif-detalles" style="cursor: pointer; flex: 1;">
                    <div class="notif-titulo-item">${notif.titulo || 'Notificación'}</div>
                    <div class="notif-texto">${notif.mensaje || notif.texto || ''}</div>
                    <div class="notif-fecha" style="font-size: 11px; color: #81c784; margin-top: 4px; font-weight: 500;">${tiempoRelativo}</div>
                </div>
                <button class="btn-eliminar-notif" title="Eliminar notificación" style="background: transparent; border: none; color: #ffffff; cursor: pointer; font-size: 18px; padding: 4px 8px; font-weight: bold; opacity: 0.7; transition: 0.2s;">&times;</button>
            `;

            const btnEliminar = item.querySelector(".btn-eliminar-notif");
            btnEliminar.addEventListener("mouseenter", () => { btnEliminar.style.opacity = "1"; btnEliminar.style.color = "#ef5350"; });
            btnEliminar.addEventListener("mouseleave", () => { btnEliminar.style.opacity = "0.7"; btnEliminar.style.color = "#ffffff"; });

            // EVENTO AL HACER CLIC EN LA NOTIFICACIÓN
            const detallesDiv = item.querySelector(".notif-detalles");
            detallesDiv.addEventListener("click", async (e) => {
                e.stopPropagation();
                
                if (!esLeida) {
                    await marcarUnaLeida(idNotif);
                    item.classList.remove("unread");
                    esLeida = true;
                    
                    if (notifBadge) {
                        let badgeCount = parseInt(notifBadge.innerText) || 1;
                        badgeCount = Math.max(0, badgeCount - 1);
                        if (badgeCount === 0) {
                            notifBadge.style.display = "none";
                        } else {
                            notifBadge.innerText = badgeCount;
                        }
                    }
                }

                const textoCompleto = ((notif.titulo || "") + " " + (notif.mensaje || "")).toLowerCase();
                
                if (textoCompleto.includes("meta") || textoCompleto.includes("abono") || textoCompleto.includes("ahorro")) {
                    window.location.href = "metas.html";
                } else if (textoCompleto.includes("racha") || textoCompleto.includes("avatar") || textoCompleto.includes("puerquito")) {
                    window.location.href = "racha.html";
                } else if (textoCompleto.includes("gasto") || textoCompleto.includes("movimiento") || textoCompleto.includes("historial")) {
                    window.location.href = "historial.html";
                } else if (textoCompleto.includes("semáforo") || textoCompleto.includes("economico") || textoCompleto.includes("finanzas")) {
                    window.location.href = "semaforo.html";
                } else {
                    cargarNotificacionesSistema();
                }
            });

            // EVENTO: Eliminar notificación individual
            btnEliminar.addEventListener("click", async (e) => {
                e.stopPropagation();
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
    const token = obtenerTokenNotif();
    if (!token) return;

    try {
        await fetch(`${window.API_URL}/api/notificaciones/${idNotificacion}/leida`, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}` }
        });
    } catch (error) {
        console.error("Error al marcar como leída:", error);
    }
}

async function eliminarNotificacion(idNotificacion) {
    const token = obtenerTokenNotif();
    if (!token) return;

    try {
        const res = await fetch(`${window.API_URL}/api/notificaciones/${idNotificacion}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (res.ok) {
            cargarNotificacionesSistema();
        }
    } catch (error) {
        console.error("Error al eliminar:", error);
    }
}

async function marcarTodasLeidas() {
    const token = obtenerTokenNotif();
    if (!token) return;

    try {
        const res = await fetch(`${window.API_URL}/api/notificaciones/marcar-leidas`, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (res.ok) {
            cargarNotificacionesSistema();
        }
    } catch (error) {
        console.error("Error al marcar todas como leídas:", error);
    }
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

    if (notifDropdown) {
        notifDropdown.addEventListener("click", (e) => {
            e.stopPropagation();
        });
    }

    window.addEventListener("click", () => {
        if (notifDropdown) notifDropdown.classList.remove("show");
        if (dropdownMenu) dropdownMenu.classList.remove("show");
    });

    cargarNotificacionesSistema();
});
