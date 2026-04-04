import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initFirestore } from './lib/store'

// Firestore 실시간 구독 시작
initFirestore();

// PWA 서비스워커 등록
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/ojfc/sw.js').catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
