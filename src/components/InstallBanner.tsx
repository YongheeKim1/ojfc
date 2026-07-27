import { useEffect, useState } from 'react';
import { Bell, Download, X, Smartphone } from 'lucide-react';
import { getPermission, hasAskedPermission, requestNotificationPermission } from '../lib/notifications';

// Chrome/Edge/Android용 install prompt 이벤트
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'ojifc_installBannerDismissed';
const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000; // 7일 뒤 다시 표시

function isStandalone(): boolean {
  // iOS
  if ((window.navigator as { standalone?: boolean }).standalone) return true;
  // Android/Chrome
  return window.matchMedia('(display-mode: standalone)').matches;
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream: unknown }).MSStream;
}

function shouldShow(): boolean {
  if (isStandalone()) return false;
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (dismissed) {
    const t = parseInt(dismissed, 10);
    if (!isNaN(t) && Date.now() - t < INSTALL_DISMISS_MS) return false;
  }
  return true;
}

export default function InstallBanner() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);

  useEffect(() => {
    if (!shouldShow()) {
      // 이미 설치된 경우 알림 권한 프롬프트만 노출
      if (isStandalone() && !hasAskedPermission() && getPermission() === 'default') {
        setShowNotifPrompt(true);
      }
      return;
    }
    setShowBanner(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setShowBanner(false);
      }
      setInstallEvent(null);
    } else if (isIOS()) {
      setShowIOSHelp(true);
    } else {
      alert('브라우저 메뉴 > "홈 화면에 추가"를 선택해주세요.');
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShowBanner(false);
  };

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setShowNotifPrompt(false);
    if (granted) {
      // 확인용 알림
      const { showNotification } = await import('../lib/notifications');
      showNotification('알림이 설정되었습니다', '새 매치와 라인업 소식을 알려드릴게요!', {});
    }
  };

  // 알림 권한 프롬프트 (이미 설치된 경우)
  if (showNotifPrompt) {
    return (
      <div
        className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 pb-3 flex items-center gap-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <Bell size={20} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">알림 받기</p>
          <p className="text-[11px] text-blue-100">새 매치·라인업·POM 투표 알림</p>
        </div>
        <button onClick={handleEnableNotifications}
          className="px-3 py-1.5 bg-white text-blue-600 text-xs font-bold rounded-lg whitespace-nowrap">
          허용
        </button>
        <button onClick={() => { setShowNotifPrompt(false); localStorage.setItem('ojifc_notifPermAsked', '1'); }}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10">
          <X size={16} />
        </button>
      </div>
    );
  }

  if (!showBanner) return null;

  return (
    <>
      <div
        className="bg-gradient-to-r from-[#1e3a5f] to-[#16a34a] text-white px-4 pb-3 flex items-center gap-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <Smartphone size={20} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">앱으로 사용하기</p>
          <p className="text-[11px] text-white/80">홈 화면에 추가하면 앱처럼 사용 가능</p>
        </div>
        <button onClick={handleInstall}
          className="flex items-center gap-1 px-3 py-1.5 bg-white text-[#1e3a5f] text-xs font-bold rounded-lg whitespace-nowrap">
          <Download size={12} />
          설치
        </button>
        <button onClick={handleDismiss}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10">
          <X size={16} />
        </button>
      </div>

      {/* iOS 안내 모달 */}
      {showIOSHelp && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={() => setShowIOSHelp(false)}>
          <div className="bg-white w-full max-w-md rounded-t-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-3">iOS 홈 화면 추가 방법</h3>
            <ol className="space-y-3 text-sm text-gray-700">
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-bold text-xs flex items-center justify-center shrink-0">1</span>
                <span>사파리 하단의 <b>공유</b> 버튼 <span className="inline-block px-1 border border-gray-300 rounded">⬆</span> 탭</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-bold text-xs flex items-center justify-center shrink-0">2</span>
                <span><b>홈 화면에 추가</b> 선택</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-bold text-xs flex items-center justify-center shrink-0">3</span>
                <span>우측 상단 <b>추가</b> 탭</span>
              </li>
            </ol>
            <button onClick={() => setShowIOSHelp(false)}
              className="mt-5 w-full py-3 bg-[#1e3a5f] text-white rounded-xl text-sm font-bold">
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}
