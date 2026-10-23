// ==========================================
// CONTROLADOR DINÁMICO DEL PANEL DE ADMIN
// ==========================================

async function inicializarPanelAdministrador() {
    // 1. Obtener el Token JWT que guardó el admin al loguearse
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Sesión expirada o no válida. Por favor inicia sesión.");
        window.location.href = "/login.html";
        return;
    }

    try {
        const headersSeguridad = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        // -------------------------------------------------------------
        // RECUPERAR USUARIOS Y CONTEOS RÁPIDOS
        // -------------------------------------------------------------
        const resUsuarios = await fetch('/api/admin/usuarios', { headers: headersSeguridad });
        if (!resUsuarios.ok) throw new Error("Error al consultar usuarios");
        
        const usuarios = await resUsuarios.json();
        
        // Variables para calcular las tarjetas superiores
        let totalUsuarios = usuarios.length;
        let totalAdmins = 0;
        let sumaRachas = 0;
        let totalMetasActivas = 0;

        // CORRECCIÓN: Buscamos tu ID exacto del HTML
        const tablaCuerpo = document.getElementById("tablaUsuariosBody");
        if (tablaCuerpo) tablaCuerpo.innerHTML = ""; // Limpiar el "Cargando usuarios..."

        usuarios.forEach(user => {
            // Contabilizar datos para los contadores rápidos del Hero Banner
            if (user.rol === "admin") totalAdmins++;
            sumaRachas += (user.racha_dias || 0);
            totalMetasActivas += (user.total_metas || 0);

            // Inyectar la fila real con tus estilos de badges correspondientes
            if (tablaCuerpo) {
                const fila = document.createElement("tr");
                fila.innerHTML = `
                    <td>${user.id}</td>
                    <td><b>${user.nombre}</b></td>
                    <td>${user.correo}</td>
                    <td><span class="${user.rol === 'admin' ? 'badge-admin' : 'badge-corriente'}">${user.rol.toUpperCase()}</span></td>
                    <td>🔥 ${user.racha_dias || 0} días</td>
                    <td>$${Number(user.saldo).toFixed(2)}</td>
                    <td>
                        <button class="btn-accion" onclick="eliminarUsuarioDelSistema(${user.id})">Eliminar</button>
                    </td>
                `;
                tablaCuerpo.appendChild(fila);
            }
        });

        // Calcular el promedio matemático de la racha de tu comunidad
        const rachaPromedio = totalUsuarios > 0 ? Math.round(sumaRachas / totalUsuarios) : 0;
        
        // Buscar e inyectar los valores reales en tus tarjetas superiores (.stat-value)
        const tarjetasValores = document.querySelectorAll(".stats-grid .stat-card .stat-value");
        if (tarjetasValores.length >= 4) {
            tarjetasValores[0].innerText = totalUsuarios;          // Tarjeta 1: Total Usuarios
            tarjetasValores[1].innerText = totalAdmins;            // Tarjeta 2: Administradores
            tarjetasValores[2].innerText = `${rachaPromedio} días`; // Tarjeta 3: Racha Promedio
            tarjetasValores[3].innerText = totalMetasActivas;      // Tarjeta 4: Metas Activas
        }

    } catch (error) {
        console.error("Fallo al recuperar la información del administrador:", error);
    }
}

// Función asignada al botón "Eliminar" de tu tabla
async function eliminarUsuarioDelSistema(idUsuario) {
    if (!confirm("¿Estás completamente seguro de eliminar este usuario? Se borrarán todos sus movimientos, metas e historial permanentemente.")) return;

    const token = localStorage.getItem("token");
    try {
        const response = await fetch(`/api/admin/usuarios/${idUsuario}`, {
            method: 'DELETE',
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (response.ok) {
            alert("Usuario eliminado correctamente de la plataforma.");
            inicializarPanelAdministrador(); // Recargar la lista automáticamente sin refrescar la página
        } else {
            alert("No se pudo completar la eliminación.");
        }
    } catch (e) {
        console.error(e);
    }
}

// Inicializar de fondo en cuanto cargue el DOM de la vista admin
document.addEventListener("DOMContentLoaded", inicializarPanelAdministrador);
