/* 오지FC FCM 서비스워커 (백그라운드 푸시 + 클릭 이동)
   이 파일이 앱의 유일한 서비스워커 역할을 합니다. */
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

const APP_BASE = '/ojfc/';

firebase.initializeApp({
  apiKey: 'AIzaSyB4D5SF3is411Wirbf67tLFVEc3AQmUINo',
  authDomain: 'azfc-a460e.firebaseapp.com',
  projectId: 'azfc-a460e',
  storageBucket: 'azfc-a460e.firebasestorage.app',
  messagingSenderId: '827240308945',
  appId: '1:827240308945:web:de2d82cfc53f7626c0e5f0',
});

const messaging = firebase.messaging();

// 서버(GitHub Actions)는 data-only 페이로드를 보냅니다 → 여기서 직접 표시
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  const title = d.title || '오지FC';
  self.registration.showNotification(title, {
    body: d.body || '',
    icon: APP_BASE + 'logo.png',
    badge: APP_BASE + 'logo.png',
    tag: d.tag || undefined,
    data: { url: d.url || (self.location.origin + APP_BASE) },
    vibrate: [100, 50, 100],
  });
});

// 알림 클릭 → 앱 열기 / 해당 화면으로 이동 (FCM 푸시 + 앱 내부 로컬 알림 공통)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || (self.location.origin + APP_BASE);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(APP_BASE)) {
          client.focus();
          if ('navigate' in client) {
            try { client.navigate(targetUrl); } catch (e) {}
          }
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
