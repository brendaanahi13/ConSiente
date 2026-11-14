if (typeof window.API_URL === 'undefined') {
    window.API_URL = "";
}

function obtenerTokenNotif() {
    return localStorage.getItem("token");
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
    return `Hace ${anos} ${anos === 1 ? 'año' : 'anos'}`;
}

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
            notifList.innerHTML = `<div class="notif-item"><div class="notif-detalles"><div class="notif-texto" style="padding: 12px; color: #888; text-align: center; font-size: 13px;">No hay notificaciones recientes.</div></div></div>`;
            notifBadge.style.display = "none";
            return;
        }

        // Evitar que salgan repetidas el mismo día con el mismo título
        const unicasMap = new Map();
        notificaciones.forEach(notif => {
            const fechaDia = notif.fecha ? notif.fecha.split('T')[0] : '';
            const claveUnica = (notif.titulo || '').trim().toLowerCase() + '_' + fechaDia;
            if (!unicasMap.has(claveUnica) || (notif.id > unicasMap.get(claveUnica).id)) {
                unicasMap.set(claveUnica, notif);
            }
        });
        let notificacionesFiltradas = Array.from(unicasMap.values());

        notificacionesFiltradas.sort((a, b) => (b.id || 0) - (a.id || 0));

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

            if (textoCompleto.includes("meta") || textoCompleto.includes("abono") || textoCompleto.includes("ahorro")) {
                destinoUrl = "metas.html";
            } else if (textoCompleto.includes("racha") || textoCompleto.includes("avatar") || textoCompleto.includes("puerquito") || textoCompleto.includes("días de racha")) {
                destinoUrl = "racha.html";
            } else if (textoCompleto.includes("gasto") || textoCompleto.includes("movimiento") || textoCompleto.includes("historial")) {
                destinoUrl = "historial.html";
            } else if (textoCompleto.includes("semáforo") || textoCompleto.includes("economico") || textoCompleto.includes("finanzas")) {
                destinoUrl = "semaforo.html";
            }

            const item = document.createElement("div");
            item.className = `notif-item ${esLeida ? '' : 'unread'}`;
            
            item.innerHTML = `
                <div class="notif-icon" style="font-size: 20px; margin-top: 2px; flex-shrink: 0;">🌿</div>
                <a href="${destinoUrl}" onclick="marcarUnaLeida('${idNotif}')" class="notif-detalles" style="flex: 1; text-decoration: none; color: inherit; cursor: pointer; display: block; min-width: 0;">
                    <div class="notif-titulo-item" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${notif.titulo || 'Notificación'}</div>
                    <div class="notif-texto" style="word-break: break-word; overflow-wrap: break-word;">${notif.mensaje || notif.texto || ''}</div>
                    <div class="notif-fecha" style="font-size: 11px; color: #81c784; margin-top: 4px; font-weight: 500;">${tiempoRelativo}</div>
                </a>
                <button class="btn-eliminar-notif" title="Eliminar" style="background: transparent; border: none; color: #ffffff; cursor: pointer; font-size: 18px; padding: 4px 8px; font-weight: bold; opacity: 0.7; transition: 0.2s; flex-shrink: 0;">&times;</button>
            `;

            const btnEliminar = item.querySelector(".btn-eliminar-notif");
            btnEliminar.addEventListener("mouseenter", () => { btnEliminar.style.opacity = "1"; btnEliminar.style.color = "#ef5350"; });
            btnEliminar.addEventListener("mouseleave", () => { btnEliminar.style.opacity = "0.7"; btnEliminar.style.color = "#ffffff"; });

            btnEliminar.addEventListener("click", async (e) => {
                e.preventDefault();
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
    } catch (error) { console.error(error); }
}

async function eliminarNotificacion(idNotificacion) {
    const token = obtenerTokenNotif();
    if (!token) return;
    try {
        const res = await fetch(`${window.API_URL}/api/notificaciones/${idNotificacion}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) cargarNotificacionesSistema();
    } catch (error) { console.error(error); }
}

async function marcarTodasLeidas() {
    const token = obtenerTokenNotif();
    if (!token) return;
    try {
        const res = await fetch(`${window.API_URL}/api/notificaciones/marcar-leidas`, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) cargarNotificacionesSistema();
    } catch (error) { console.error(error); }
}

window.marcarTodasLeidas = marcarTodasLeidas;

// 🌟 NUEVA FUNCIÓN: Notificación flotante de bienvenida y racha del día
async function verificarBienvenidaYRachaHoy() {
    const token = obtenerTokenNotif();
    if (!token) return;

    // Evita que aparezca múltiples veces en la misma pestaña abierta
    if (sessionStorage.getItem("bienvenidaMostradaHoy") === "true") return;

    try {
        // Consulta tu ruta de perfil que ya actualiza y devuelve la racha actual
        const response = await fetch(`${window.API_URL}/api/perfil`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (response.ok) {
            const usuario = await response.json();
            const nombre = usuario.nombre || "Usuario";
            const racha = usuario.racha_dias || 1;

            mostrarToastBienvenidaRacha(nombre, racha);
            sessionStorage.setItem("bienvenidaMostradaHoy", "true");
        }
    } catch (error) {
        console.error("Error al verificar bienvenida de racha:", error);
    }
}

function mostrarToastBienvenidaRacha(nombre, racha) {
    if (document.getElementById('toastBienvenidaRacha')) return;

    const toastHTML = `
        <div id="toastBienvenidaRacha" style="
            position: fixed; 
            bottom: 30px; 
            right: 30px; 
            background: linear-gradient(135deg, #162218 0%, #111412 100%); 
            border: 1px solid rgba(129, 199, 132, 0.4); 
            padding: 18px 22px; 
            border-radius: 16px; 
            color: #ffffff; 
            z-index: 99999; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.8); 
            display: flex; 
            align-items: center; 
            gap: 15px;
            max-width: 380px;
            animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        ">
            <div style="font-size: 28px; background: rgba(129, 199, 132, 0.1); padding: 10px; border-radius: 12px; flex-shrink: 0;">
                🔥
            </div>
            <div style="flex: 1;">
                <h4 style="margin: 0; color: #81c784; font-size: 15px; font-weight: 600;">
                    ¡Qué gusto verte, ${nombre}!
                </h4>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #cccccc; line-height: 1.4;">
                    Hoy mantienes tu racha activa de <strong style="color: #ffb74d;">${racha} días</strong> seguidos en ConSiente.
                </p>
            </div>
            <button onclick="document.getElementById('toastBienvenidaRacha').remove()" style="
                background: none; 
                border: none; 
                color: #888888; 
                font-size: 20px; 
                cursor: pointer; 
                padding: 0 5px;
                transition: color 0.2s;
            " onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#888'">&times;</button>
        </div>
        <style>
            @keyframes slideUpFade {
                from { opacity: 0; transform: translateY(20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
        </style>
    `;

    document.body.insertAdjacentHTML('beforeend', toastHTML);

    // Se desvanece automáticamente después de 6 segundos
    setTimeout(() => {
        const toast = document.getElementById('toastBienvenidaRacha');
        if (toast) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }
    }, 6000);
}

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
        // ✅ Corregido el error de "click5" a "click"
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

    //Se ejecuta al cargar la página para mostrar el saludo y racha de hoy
    verificarBienvenidaYRachaHoy();
});
