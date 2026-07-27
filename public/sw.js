// 오지FC PWA 서비스워커
const APP_BASE = '/ojfc/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// 알림 클릭 시 앱 열기 / 지정된 URL로 이동
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || APP_BASE;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 이미 열려 있는 창이 있으면 포커스
      for (const client of clientList) {
        if (client.url.includes(APP_BASE)) {
          client.focus();
          if ('navigate' in client) {
            try { client.navigate(targetUrl); } catch {}
          }
          return;
        }
      }
      // 없으면 새 창
      return self.clients.openWindow(targetUrl);
    })
  );
});

// FCM/웹 푸시 대비 (Phase 2)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: '오지FC', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || '오지FC', {
      body: payload.body || '',
      icon: APP_BASE + 'logo.png',
      badge: APP_BASE + 'logo.png',
      data: { url: payload.url || APP_BASE },
      vibrate: [100, 50, 100],
    })
  );
});
