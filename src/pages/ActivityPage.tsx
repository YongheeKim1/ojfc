import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity as ActivityIcon, Smartphone, Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getMatches, getCurrentUser, subscribe } from '../lib/store';
import {
  matchWindow, shortcutRunUrl, parseHealthNumber, fetchActivity, saveActivity, formatClock,
  SHORTCUT_NAME, HEALTH_RECEIVER_URL, type ActivityValues,
} from '../lib/activity';
import { getPlatform } from '../lib/pwa';
import type { Match } from '../lib/types';

type Field = keyof ActivityValues;

const FIELDS: { key: Field; label: string; unit: string; step: string }[] = [
  { key: 'distanceKm', label: '이동 거리', unit: 'km', step: '0.01' },
  { key: 'activeKcal', label: '활동 칼로리', unit: 'kcal', step: '1' },
  { key: 'avgHr', label: '평균 심박', unit: 'bpm', step: '1' },
  { key: 'maxHr', label: '최대 심박', unit: 'bpm', step: '1' },
  { key: 'steps', label: '걸음 수', unit: '걸음', step: '1' },
];

// 단축어가 보내는 주소의 이름 → 저장 항목
const PARAM_OF: Record<Field, string> = {
  distanceKm: 'dist', activeKcal: 'kcal', avgHr: 'hr', maxHr: 'max', steps: 'steps',
};

function round(key: Field, n: number): number {
  return key === 'distanceKm' ? Math.round(n * 100) / 100 : Math.round(n);
}

export default function ActivityPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const matchId = params.get('m');
  const me = getCurrentUser();
  const [matches, setMatches] = useState<Match[]>(getMatches());
  useEffect(() => subscribe(() => setMatches(getMatches())), []);

  const match = matches.find(m => m.id === matchId) ?? null;
  const fromShortcut = params.get('src') === 'ios';
  const isIOS = getPlatform() === 'ios';
  const isAndroid = getPlatform() === 'android';

  const [form, setForm] = useState<Record<Field, string>>({ distanceKm: '', activeKcal: '', avgHr: '', maxHr: '', steps: '' });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // 기존 기록 → 단축어가 넘긴 값 순서로 채웁니다 (단축어 값이 우선)
  useEffect(() => {
    if (!matchId || !me || loaded) return;
    let alive = true;
    fetchActivity(matchId, me.id).then(existing => {
      if (!alive) return;
      const next = { ...form };
      for (const f of FIELDS) {
        const fromUrl = parseHealthNumber(params.get(PARAM_OF[f.key]));
        const value = fromUrl ?? existing?.[f.key] ?? null;
        next[f.key] = value == null ? '' : String(round(f.key, value));
      }
      setForm(next);
      setLoaded(true);
    }).catch(() => setLoaded(true));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, me?.id]);

  if (!me) return null;

  if (!match) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-sm text-gray-500">경기를 찾는 중입니다...</p>
          <button onClick={() => navigate('/me')} className="mt-3 text-xs text-[#1e3a5f] underline">내 페이지로</button>
        </div>
      </div>
    );
  }

  const w = matchWindow(match);
  const runUrl = shortcutRunUrl(match);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values: ActivityValues = {};
      for (const f of FIELDS) {
        const n = parseHealthNumber(form[f.key]);
        if (n != null) values[f.key] = round(f.key, n);
      }
      await saveActivity(match, me.id, me.name, values, fromShortcut ? 'ios' : 'manual');
      setSaved(true);
      setTimeout(() => navigate('/me'), 700);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] text-white px-5 pt-10 pb-6 rounded-b-3xl shadow-lg">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <ActivityIcon size={20} /> 내 활동 기록
        </h1>
        <p className="text-blue-200 text-sm mt-1">{match.title}</p>
        {w ? (
          <p className="text-[11px] text-blue-200/80 mt-0.5">
            {formatClock(w.start)} ~ {w.ongoing ? '진행 중' : formatClock(w.end)}
            {w.estimatedStart && ' · 킥오프 미기록, 종료 2시간 전부터로 계산'}
          </p>
        ) : (
          <p className="text-[11px] text-amber-200 mt-0.5">경기 시작·종료 시각이 아직 없습니다</p>
        )}
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {fromShortcut && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-[12px] text-blue-800">
            아이폰 건강 데이터에서 가져온 값입니다. 확인 후 저장해주세요.
          </div>
        )}

        {/* 아이폰: 단축어로 가져오기 */}
        {isIOS && !fromShortcut && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <a
              href={runUrl ?? undefined}
              aria-disabled={!runUrl}
              className={`w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${
                runUrl ? 'bg-[#1e3a5f] text-white' : 'bg-gray-200 text-gray-400 pointer-events-none'
              }`}
            >
              <Smartphone size={15} /> 아이폰 건강 데이터 가져오기
            </a>
            <p className="text-[11px] text-gray-400 mt-2">
              '{SHORTCUT_NAME}' 단축어가 경기 시간대 기록을 모아 이 화면으로 돌아옵니다.
            </p>
            <button
              onClick={() => setShowGuide(v => !v)}
              className="mt-2 text-[11px] font-bold text-[#1e3a5f] flex items-center gap-0.5"
            >
              단축어 만드는 방법 {showGuide ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showGuide && <ShortcutGuide />}
          </div>
        )}

        {/* 갤럭시: Health Connect Webhook 자동 연동 (수신기 배포 전에는 안내만) */}
        {isAndroid && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <h2 className="text-sm font-bold text-gray-700 mb-1">갤럭시 자동 연동</h2>
            {HEALTH_RECEIVER_URL ? (
              <>
                <p className="text-[11px] text-gray-500 mb-2">
                  Health Connect Webhook 앱에 아래 주소를 등록하면 경기 기록이 자동으로 들어옵니다.
                </p>
                <p className="text-[10px] font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2 break-all select-all">
                  {`${HEALTH_RECEIVER_URL}?m=${me.id}`}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-gray-500">시범 준비 중입니다. 지금은 삼성헬스 기록을 보고 아래에 직접 입력해주세요.</p>
            )}
          </div>
        )}

        {/* 확인·직접 입력 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">
            {fromShortcut ? '가져온 기록 확인' : '기록 입력'}
          </h2>
          {!loaded ? (
            <div className="py-6 text-center"><Loader2 size={20} className="animate-spin text-gray-300 mx-auto" /></div>
          ) : (
            <div className="space-y-2.5">
              {FIELDS.map(f => (
                <label key={f.key} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-600 w-20 shrink-0">{f.label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={f.step}
                    min="0"
                    value={form[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="-"
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                  />
                  <span className="text-xs text-gray-400 w-9 shrink-0">{f.unit}</span>
                </label>
              ))}
              <button
                onClick={handleSave}
                disabled={saving || saved}
                className="w-full mt-2 py-2.5 bg-[#16a34a] text-white rounded-xl text-sm font-bold disabled:opacity-70 flex items-center justify-center gap-1.5"
              >
                {saved ? <><Check size={15} /> 저장됨</> : saving ? '저장 중...' : '저장'}
              </button>
              <p className="text-[10px] text-gray-400">모르는 항목은 비워두셔도 됩니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 아이폰 단축어 만드는 순서 (한 명이 만들어 iCloud 링크로 공유하면 나머지는 받기만 하면 됩니다) */
function ShortcutGuide() {
  const appUrl = 'https://yongheekim1.github.io/ojfc/#/activity?m=[매치]&dist=[거리]&kcal=[칼로리]&hr=[평균심박]&max=[최대심박]&steps=[걸음]&src=ios';
  const steps: string[] = [
    `단축어 앱 → + → 이름을 정확히 '${SHORTCUT_NAME}' 로 저장`,
    `'텍스트 분할' 추가 → 입력: 단축어 입력, 구분자: 사용자 지정 ',' (쉼표)`,
    `'목록에서 항목 가져오기' 3번 → 1번째·2번째·3번째 항목을 각각 변수 '매치', '몇분전', '경기시간' 으로 설정`,
    `'날짜 조정' → 현재 날짜에서 [몇분전] 분 빼기 → 변수 '시작'`,
    `'날짜 조정' → [시작]에 [경기시간] 분 더하기 → 변수 '종료'`,
    `'건강 샘플 찾기' → 유형: 걷기 + 달리기 거리, 시작일이 [시작]과 [종료] 사이 → '통계 계산' 합계 → 변수 '거리'`,
    `같은 방법으로 활동 에너지 합계 → '칼로리', 걸음 합계 → '걸음'`,
    `심박수 샘플 → '통계 계산' 평균 → '평균심박', 다시 최댓값 → '최대심박'`,
    `'URL 열기' 추가 → 아래 주소를 넣고 [ ] 부분을 각 변수로 바꾸기`,
  ];
  return (
    <div className="mt-2 bg-gray-50 rounded-xl p-3">
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-[11px] text-gray-700 leading-relaxed">
            <span className="w-4 h-4 rounded-full bg-[#1e3a5f] text-white text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[10px] font-mono text-gray-600 bg-white border border-gray-200 rounded-lg p-2 break-all select-all">{appUrl}</p>
      <ul className="mt-2 space-y-1 text-[10px] text-gray-400 leading-relaxed">
        <li>· 처음 실행할 때 건강 데이터 읽기 권한을 허용해주세요.</li>
        <li>· 단축어는 Safari로 이 앱을 엽니다. 처음 한 번은 Safari에서 로그인이 필요할 수 있습니다.</li>
        <li>· 동작 이름은 iOS 버전에 따라 조금 다를 수 있습니다.</li>
      </ul>
    </div>
  );
}
