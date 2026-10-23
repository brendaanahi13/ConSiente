// ==========================================
// CARTERO DE FONDO CORRECTO (public/sw.js)
// ==========================================

// 1. Escuchar la notificación que manda el servidor Node.js
self.addEventListener('push', function(event) {
  let data = { title: 'ConSiente', body: 'Tienes una nueva actualización.' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/images/icon.png', 
    data: {
      url: data.url || '/' 
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 2. Escuchar el clic en la notificación
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); 
  const targetUrl = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
