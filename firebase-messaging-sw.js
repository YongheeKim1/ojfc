/* 오지FC FCM 서비스워커
   - firebase.messaging() 호출만으로 백그라운드 notification 페이로드를 FCM이 자동 표시
   - 클릭 이동은 서버가 보낸 webpush.fcmOptions.link 로 FCM이 처리
   - 아래 notificationclick 핸들러는 앱 내부(로컬) 알림(data.local=true)만 처리 */
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

// 이 호출이 백그라운드 푸시(notification 페이로드) 자동 표시를 활성화합니다.
firebase.messaging();

// 앱 내부(로컬) 알림 클릭만 처리. FCM 알림은 FCM 기본 핸들러가 link로 이동.
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  if (!data.local) return; // FCM 푸시 알림은 무시 (중복 처리 방지)
  event.notification.close();
  const targetUrl = data.url || (self.location.origin + APP_BASE);
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
