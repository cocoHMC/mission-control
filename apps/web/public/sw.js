self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Mission Control', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Mission Control';
  const options = {
    body: payload.body || '',
    data: {
      url: payload.url || '/',
    },
    icon: '/window.svg',
    badge: '/window.svg',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes(url)) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
