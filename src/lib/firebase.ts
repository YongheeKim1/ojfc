import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB4D5SF3is411Wirbf67tLFVEc3AQmUINo",
  authDomain: "azfc-a460e.firebaseapp.com",
  projectId: "azfc-a460e",
  storageBucket: "azfc-a460e.firebasestorage.app",
  messagingSenderId: "827240308945",
  appId: "1:827240308945:web:de2d82cfc53f7626c0e5f0"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// 웹 푸시 VAPID 공개키 (Firebase Console → 프로젝트 설정 → Cloud Messaging → 웹 푸시 인증서 → 키 쌍 생성)
// 발급 후 아래 'PASTE_VAPID_KEY_HERE'를 그 키로 교체하세요. 교체 전엔 푸시 토큰 등록이 자동 skip됩니다.
export const VAPID_KEY = 'BOd7-pIupN5ePDVaSnsY1LMlp87SxdxP8fP3u_ixOXE_v37XN0-npS52wpxb4faEx2xan54mQINDFK3MYga_Wd8';
