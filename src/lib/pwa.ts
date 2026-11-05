// PWA 설치 관련 공통 로직.
//
// beforeinstallprompt 는 페이지가 뜨고 얼마 지나지 않아 한 번만 발생합니다.
// 로그인 후에 설치 안내를 띄우려면 그때까지 이벤트를 들고 있어야 해서,
// 이 모듈을 불러오는 즉시 받아서 보관합니다.

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const waiters = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    waiters.forEach(fn => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    waiters.forEach(fn => fn());
  });
}

/** 설치 프롬프트가 준비됐는지 (주로 안드로이드 크롬) */
export function hasInstallPrompt(): boolean {
  return deferredPrompt !== null;
}

/** 프롬프트 준비 상태가 바뀌면 알려줍니다 */
export function onInstallPromptChange(fn: () => void): () => void {
  waiters.add(fn);
  return () => { waiters.delete(fn); };
}

/** 브라우저 기본 설치창을 띄웁니다. 설치를 수락하면 true */
export async function showInstallPrompt(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  deferredPrompt = null;
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === 'accepted';
}

/** 이미 홈 화면 앱으로 실행 중인지 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window.navigator as { standalone?: boolean }).standalone) return true;  // iOS
  return window.matchMedia('(display-mode: standalone)').matches;              // Android/데스크톱
}

export type Platform = 'ios' | 'android' | 'desktop';

export function getPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  // iPadOS 13+ 는 맥으로 위장하므로 터치 지원 여부로 함께 판단합니다.
  const isIpad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || isIpad) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** iOS 에서 홈 화면 추가가 가능한 브라우저는 사파리뿐입니다 */
export function isIOSSafari(): boolean {
  if (getPlatform() !== 'ios') return false;
  const ua = navigator.userAgent;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Whale/.test(ua);
}
