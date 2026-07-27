import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initFirestore } from './lib/store'

// Firestore 실시간 구독 시작
initFirestore();

// PWA + FCM 서비스워커 등록 (firebase-messaging-sw.js 하나로 통합)
if ('serviceWorker' in navigator) {
  // 옛 sw.js 정리 후 FCM 서비스워커 등록
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => {
      const url = reg.active?.scriptURL || '';
      if (url.endsWith('/sw.js')) reg.unregister();
    });
  }).catch(() => {});
  navigator.serviceWorker.register('/ojfc/firebase-messaging-sw.js').catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
