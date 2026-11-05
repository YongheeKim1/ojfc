import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { getPermission, hasAskedPermission, requestNotificationPermission } from '../lib/notifications';

// 설치 안내는 로그인 직후 뜨는 InstallPrompt 모달이 맡습니다.
// 여기서는 알림 권한만 물어봅니다.
export default function InstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!hasAskedPermission() && getPermission() === 'default') setShow(true);
  }, []);

  const handleEnable = async () => {
    const granted = await requestNotificationPermission();
    setShow(false);
    if (granted) {
      // FCM 토큰 등록 (앱이 꺼져 있어도 푸시 받기)
      const { registerPush } = await import('../lib/push');
      registerPush();
      const { showNotification } = await import('../lib/notifications');
      showNotification('알림이 설정되었습니다', '새 매치와 라인업 소식을 알려드릴게요!', {});
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('ojifc_notifPermAsked', '1');
  };

  if (!show) return null;

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
      <button
        onClick={handleEnable}
        className="px-3 py-1.5 bg-white text-blue-600 text-xs font-bold rounded-lg whitespace-nowrap"
      >
        허용
      </button>
      <button
        onClick={handleDismiss}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10"
      >
        <X size={16} />
      </button>
    </div>
  );
}
