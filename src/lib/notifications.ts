// 브라우저 알림 유틸
// - 권한 요청
// - 알림 표시 (서비스워커 우선, 실패 시 브라우저 Notification)
// - 이미 알림 보낸 이벤트는 중복 방지

const BASE_URL = import.meta.env.BASE_URL;
const SEEN_KEY = 'ojifc_seenNotifications';
const PERMISSION_ASKED_KEY = 'ojifc_notifPermAsked';

export function isNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export function getPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

// 사용자 상호작용 후에만 호출 (버튼 클릭 등)
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  localStorage.setItem(PERMISSION_ASKED_KEY, '1');
  return result === 'granted';
}

export function hasAskedPermission(): boolean {
  return !!localStorage.getItem(PERMISSION_ASKED_KEY);
}

export async function showNotification(
  title: string,
  body: string,
  opts?: { url?: string; tag?: string; dedupeKey?: string }
): Promise<void> {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  // 중복 방지
  if (opts?.dedupeKey && isAlreadySeen(opts.dedupeKey)) return;
  if (opts?.dedupeKey) markSeen(opts.dedupeKey);

  const options: NotificationOptions = {
    body,
    icon: window.location.origin + BASE_URL + 'logo.png',
    badge: window.location.origin + BASE_URL + 'logo.png',
    tag: opts?.tag,
    data: { url: opts?.url ? window.location.origin + BASE_URL + '#' + opts.url : window.location.origin + BASE_URL },
  };

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {}

  // 서비스워커 없으면 fallback
  new Notification(title, options);
}

function getSeenSet(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch { return new Set(); }
}

function isAlreadySeen(key: string): boolean {
  return getSeenSet().has(key);
}

function markSeen(key: string): void {
  const seen = getSeenSet();
  seen.add(key);
  // 최근 200개만 유지
  const arr = Array.from(seen).slice(-200);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {}
}
