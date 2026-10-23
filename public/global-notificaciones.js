// ID del usuario logueado actualmente (Cámbialo después por tu variable real)
const USUARIO_ACTUAL_ID = 1; 

async function cargarNotificacionesSistema() {
  try {
    // 1. Ir al servidor a buscar los mensajes de la base de datos
    const response = await fetch(`/api/notificaciones/${USUARIO_ACTUAL_ID}`);
    const notificaciones = await response.json();

    // 2. Buscar los elementos visuales en la página actual
    const contador = document.getElementById('notif-contador');
    const contenedorLista = document.getElementById('lista-notificaciones-box');

    if (!contenedorLista) return;
    contenedorLista.innerHTML = ''; // Borrar lo viejo/ficticio

    // 3. Contar cuántas están sin leer y actualizar la burbuja flotante
    const sinLeer = notificaciones.filter(n => n.leido === 0).length;
    if (contador) contador.innerText = sinLeer;
    
    if (notificaciones.length === 0) {
      contenedorLista.innerHTML = '<p style="padding:15px; color:#aaa; font-size:13px; text-align:center;">No tienes notificaciones pendientes.</p>';
      return;
    }

    // 4. Dibujar cada alerta real adentro del menú desplegable de la página actual
    notificaciones.forEach(notif => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 12px 15px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        background: ${notif.leido === 0 ? 'rgba(129, 199, 132, 0.04)' : 'transparent'};
      `;

      item.innerHTML = `
        <div style="font-weight:600; font-size:13px; color:#81c784; margin-bottom:2px;">${notif.titulo}</div>
        <div style="font-size:12.5px; color:#ccc; line-height:1.3;">${notif.mensaje}</div>
        <div style="font-size:10px; color:#666; margin-top:4px; text-align:right;">${notif.fecha}</div>
      `;
      contenedorLista.appendChild(item);
    });
  } catch (error) {
    console.error('Error al mapear alertas del historial:', error);
  }
}

// Acción para el botón "Marcar leídas"
async function marcarTodasComoLeidas() {
  try {
    await fetch('/api/notificaciones/marcar-leidas', {
      method: 'POST',
      body: JSON.stringify({ userId: USUARIO_ACTUAL_ID }),
      headers: { 'Content-Type': 'application/json' }
    });
    cargarNotificacionesSistema(); // Recargar el menú
  } catch (err) {
    console.error(err);
  }
}

// Hacer que esta función corra sola en cuanto cargue CUALQUIER página que tenga este script
document.addEventListener('DOMContentLoaded', cargarNotificacionesSistema);
