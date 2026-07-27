// FCM 웹 푸시 클라이언트
// - 서비스워커 등록(firebase-messaging-sw.js)을 사용해 토큰 발급
// - 토큰을 Firestore pushTokens에 저장 → GitHub Actions가 이 토큰으로 푸시
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { app, VAPID_KEY } from './firebase';
import { savePushToken, getCurrentUser } from './store';

const BASE_URL = import.meta.env.BASE_URL;
let registered = false;

export async function registerPush(): Promise<'ok' | 'skip' | 'no-vapid' | 'unsupported' | 'denied' | 'error'> {
  if (registered) return 'ok';
  if (!VAPID_KEY || VAPID_KEY === 'PASTE_VAPID_KEY_HERE') return 'no-vapid';
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return 'denied';

  try {
    const supported = await isSupported();
    if (!supported) return 'unsupported';

    // FCM 전용 서비스워커 등록 (main.tsx에서 이미 등록했지만 여기서도 보장)
    const reg = await navigator.serviceWorker.register(BASE_URL + 'firebase-messaging-sw.js');

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: reg,
    });

    if (!token) return 'error';

    const user = getCurrentUser();
    await savePushToken(token, user?.id ?? 'unknown', user?.name ?? '');
    registered = true;

    // 포그라운드 메시지: 앱이 열려 있을 때는 App.tsx 로컬 감시가 이미 즉시 알림을 띄우므로 여기선 무시
    onMessage(messaging, () => {});

    return 'ok';
  } catch (err) {
    console.error('registerPush 실패:', err);
    return 'error';
  }
}
