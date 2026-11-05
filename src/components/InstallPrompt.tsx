import { useEffect, useState } from 'react';
import { Smartphone, Download, X, Share, Plus, MoreVertical, Check } from 'lucide-react';
import {
  isStandalone, getPlatform, isIOSSafari, hasInstallPrompt, onInstallPromptChange, showInstallPrompt,
} from '../lib/pwa';

// 설치 안내를 닫으면 한동안 다시 띄우지 않습니다.
const SNOOZE_KEY = 'ojifc_installPromptSnoozed';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function snoozed(): boolean {
  try {
    const t = parseInt(localStorage.getItem(SNOOZE_KEY) || '', 10);
    return !isNaN(t) && Date.now() - t < SNOOZE_MS;
  } catch { return false; }
}

/**
 * 로그인 직후 뜨는 설치 안내 창.
 * 브라우저로 들어온 사람에게만 보이고, 홈 화면 앱으로 실행 중이면 뜨지 않습니다.
 */
export default function InstallPrompt({ onClose }: { onClose: () => void }) {
  const platform = getPlatform();
  const [showSteps, setShowSteps] = useState(false);
  const [, forceUpdate] = useState(0);

  // 설치 이벤트가 늦게 도착할 수 있어 변화를 지켜봅니다.
  useEffect(() => onInstallPromptChange(() => forceUpdate(n => n + 1)), []);

  const close = () => {
    try { localStorage.setItem(SNOOZE_KEY, Date.now().toString()); } catch { /* 저장 못 해도 동작엔 문제 없음 */ }
    onClose();
  };

  const handleInstall = async () => {
    // 안드로이드/데스크톱 크롬: 브라우저 기본 설치창
    if (hasInstallPrompt()) {
      const accepted = await showInstallPrompt();
      if (accepted) { onClose(); return; }
      // 거절했으면 수동 안내로 넘어갑니다
    }
    setShowSteps(true);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden">
        {!showSteps ? (
          <>
            <div className="bg-gradient-to-br from-[#1e3a5f] to-[#16a34a] text-white px-6 pt-7 pb-6 text-center relative">
              <button
                onClick={close}
                className="absolute right-3 top-3 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/15"
              >
                <X size={18} />
              </button>
              <div className="w-14 h-14 mx-auto mb-3 bg-white/15 rounded-2xl flex items-center justify-center">
                <Smartphone size={28} />
              </div>
              <h2 className="text-lg font-bold">앱으로 설치하면 더 편해요</h2>
              <p className="text-[13px] text-white/80 mt-1.5 leading-relaxed">
                홈 화면에서 바로 열 수 있고<br />매치·라인업 알림도 받을 수 있습니다
              </p>
            </div>

            <div className="px-6 py-5">
              <ul className="space-y-2.5 mb-5">
                {['홈 화면 아이콘으로 바로 실행', '새 매치·라인업·POM 투표 알림', '주소창 없이 앱처럼 전체 화면'].map(t => (
                  <li key={t} className="flex items-center gap-2.5 text-[13px] text-gray-700">
                    <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <Check size={11} className="text-green-600" strokeWidth={3} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>

              <button
                onClick={handleInstall}
                className="w-full py-3 bg-[#1e3a5f] text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              >
                <Download size={16} />
                홈 화면에 추가
              </button>
              <button
                onClick={close}
                className="w-full py-2.5 mt-1.5 text-gray-400 text-[13px] font-medium"
              >
                나중에 하기
              </button>
            </div>
          </>
        ) : (
          <InstallSteps platform={platform} onDone={close} />
        )}
      </div>
    </div>
  );
}

/** 기종별 홈 화면 추가 방법 */
function InstallSteps({ platform, onDone }: { platform: 'ios' | 'android' | 'desktop'; onDone: () => void }) {
  const iosSafari = isIOSSafari();

  const steps: { icon: React.ReactNode; text: React.ReactNode }[] =
    platform === 'ios'
      ? iosSafari
        ? [
            { icon: <Share size={15} />, text: <>화면 아래 <b>공유</b> 버튼을 누르세요</> },
            { icon: <Plus size={15} />, text: <>목록을 내려 <b>홈 화면에 추가</b>를 누르세요</> },
            { icon: <Check size={15} />, text: <>오른쪽 위 <b>추가</b>를 누르면 끝!</> },
          ]
        : [
            { icon: <Share size={15} />, text: <>이 화면을 <b>Safari</b>에서 열어주세요</> },
            { icon: <Share size={15} />, text: <>화면 아래 <b>공유</b> 버튼을 누르세요</> },
            { icon: <Plus size={15} />, text: <><b>홈 화면에 추가</b>를 누르면 끝!</> },
          ]
      : platform === 'android'
        ? [
            { icon: <MoreVertical size={15} />, text: <>오른쪽 위 <b>⋮</b> 메뉴를 누르세요</> },
            { icon: <Plus size={15} />, text: <><b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 누르세요</> },
            { icon: <Check size={15} />, text: <><b>설치</b>를 누르면 끝!</> },
          ]
        : [
            { icon: <Download size={15} />, text: <>주소창 오른쪽 <b>설치</b> 아이콘을 누르세요</> },
            { icon: <Check size={15} />, text: <><b>설치</b>를 누르면 끝!</> },
          ];

  const title =
    platform === 'ios' ? 'iPhone · iPad 설치 방법'
      : platform === 'android' ? 'Android 설치 방법'
        : 'PC 설치 방법';

  return (
    <div className="px-6 pt-6 pb-5">
      <h3 className="text-base font-bold text-gray-900 mb-4">{title}</h3>
      <ol className="space-y-3.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 items-start">
            <span className="w-7 h-7 rounded-full bg-[#1e3a5f] text-white font-bold text-xs flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <div className="flex items-center gap-2 text-sm text-gray-700 pt-1">
              <span className="text-gray-400 shrink-0">{s.icon}</span>
              <span>{s.text}</span>
            </div>
          </li>
        ))}
      </ol>
      {platform === 'ios' && (
        <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
          iPhone 은 Safari 에서만 홈 화면에 추가할 수 있습니다.
        </p>
      )}
      <button onClick={onDone} className="mt-5 w-full py-3 bg-[#1e3a5f] text-white rounded-xl text-sm font-bold">
        확인했어요
      </button>
    </div>
  );
}

/** 설치 안내를 지금 띄워야 하는지 */
export function shouldShowInstallPrompt(): boolean {
  return !isStandalone() && !snoozed();
}
