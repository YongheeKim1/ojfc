import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Clapperboard, Plus, Play, Square, Share2, Trash2, ChevronLeft,
  Hand, MoveUpRight, Eraser, ArrowRightToLine, Link2,
} from 'lucide-react';
import {
  getTactics, saveTactic, updateTactic, deleteTactic, getCurrentUser, subscribe, isCoach,
  FORMATIONS, FORMATIONS_BY_SIZE, TEAM_SIZES, getMatches, updateMatch, getPlayerInfo,
} from '../lib/store';
import { labelFromCoord } from '../lib/stats';
import type { Tactic, TacticCut, TacticMarker, Match } from '../lib/types';

// 기본 장면: 4-2-3-1 배치 + 공
function defaultCut(): TacticCut {
  const P = (id: string, label: string, x: number, y: number): TacticMarker => ({ id, label, x, y, kind: 'player' });
  return {
    markers: [
      P('gk', 'GK', 50, 90), P('lb', 'LB', 14, 74), P('lcb', 'LCB', 36, 78), P('rcb', 'RCB', 64, 78), P('rb', 'RB', 86, 74),
      P('ldm', 'LDM', 38, 60), P('rdm', 'RDM', 62, 60),
      P('lam', 'LAM', 16, 38), P('cam', 'CAM', 50, 42), P('ram', 'RAM', 84, 38),
      P('st', 'ST', 50, 22),
      { id: 'ball', label: '', x: 50, y: 84, kind: 'ball' },
    ],
    arrows: [],
    note: '',
  };
}

// 포메이션 좌표(공격수 y≈22 ~ 골키퍼 y≈92)를 킥오프 때처럼 자기 진영(y 54~92)에 모읍니다.
// 그대로 쓰면 우리 공격수와 상대 수비수가 같은 자리에 겹쳐 이름이 가려집니다.
function toOwnHalf(y: number): number {
  return Math.round((54 + ((y - 22) * (92 - 54)) / (92 - 22)) * 10) / 10;
}

// 포메이션 → 마커. 상대팀은 위쪽 골대를 지키도록 위아래·좌우를 뒤집습니다.
function buildTeam(formation: string, side: 'us' | 'opp'): TacticMarker[] {
  const slots = FORMATIONS[formation] || [];
  return slots.map(sl => {
    const y = toOwnHalf(sl.y);
    return side === 'us'
      ? { id: `p-${sl.id}`, label: sl.label, x: sl.x, y, kind: 'player' as const }
      : { id: `o-${sl.id}`, label: sl.label, x: 100 - sl.x, y: 100 - y, kind: 'opponent' as const };
  });
}

/**
 * 매치와 연결된 장면: 우리 팀을 그 매치의 포메이션·라인업(선택한 쿼터)으로 맞춥니다.
 * 라인업에서 옮긴 자리와 선수 이름까지 따라오고, 전술에서 지정한 이동(to)은 같은 자리면 유지합니다.
 * 저장된 값이 아니라 볼 때마다 계산하므로, 라인업이 바뀌면 전술도 바로 바뀝니다.
 */
function syncFromMatch(stored: TacticCut, match: Match, quarterIdx: number): TacticCut {
  const formation = match.formation || '4-2-3-1';
  const slots = FORMATIONS[formation] || FORMATIONS['4-2-3-1'];
  const q = match.quarters?.[quarterIdx];
  const prev = new Map(stored.markers.map(m => [m.id, m]));
  const ours: TacticMarker[] = slots.map(sl => {
    const moved = q?.slotPos?.[sl.id];
    const x = moved ? moved.x : sl.x;
    const marker: TacticMarker = {
      id: `p-${sl.id}`,
      label: moved ? labelFromCoord(moved.x, moved.y) : sl.label,
      x,
      y: toOwnHalf(moved ? moved.y : sl.y),
      kind: 'player',
    };
    const pid = q?.playing?.[sl.id];
    const name = pid ? getPlayerInfo(pid)?.name?.replace(/\s*\(용병\)$/, '') : undefined;
    if (name) marker.name = name;
    const to = prev.get(marker.id)?.to;
    if (to) marker.to = to;
    return marker;
  });
  return { ...stored, formation, markers: [...ours, ...stored.markers.filter(m => m.kind !== 'player')] };
}

// 옮긴 자리에 맞춰 자리 이름을 다시 붙입니다 (라인업과 같은 규칙)
function relabel(m: TacticMarker, x: number, y: number): string {
  if (m.kind === 'player') return labelFromCoord(x, y);
  if (m.kind === 'opponent') return labelFromCoord(100 - x, 100 - y);
  return m.label;
}

function FormationOptions() {
  return (
    <>
      {TEAM_SIZES.map(n => (
        <optgroup key={n} label={`${n}명`}>
          {(FORMATIONS_BY_SIZE[n] || []).map(f => <option key={f} value={f}>{f}</option>)}
        </optgroup>
      ))}
    </>
  );
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const MOVE_MS = 1300; // 한 장면의 이동 애니메이션 시간

// ─── 전술 피치 ───
// mode 'place': 마커를 끌어 시작 위치 배치
// mode 'move' : 마커에서 끌어 이동 목표 지정 (짧게 탭하면 그 마커의 이동 삭제)
function TacticsPitch({
  cut, editable, mode, animating, lockedIds,
  onPlace, onSetMove, onClearMove,
}: {
  cut: TacticCut;
  editable: boolean;
  lockedIds?: Set<string>; // 배치(위치 옮기기)를 막을 마커 — 매치 라인업을 따르는 선수
  mode: 'place' | 'move';
  animating: boolean; // true면 마커가 to 위치로 이동 중
  onPlace?: (markerId: string, x: number, y: number) => void;
  onSetMove?: (markerId: string, x: number, y: number) => void;
  onClearMove?: (markerId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragM, setDragM] = useState<{ id: string; x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<{ id: string; x: number; y: number } | null>(null); // 이동 지정 미리보기
  const info = useRef<{
    kind: 'place' | 'move'; id: string; moved: boolean;
    sx: number; sy: number; last?: { x: number; y: number };
  } | null>(null);

  const toCoord = (cx: number, cy: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      x: Math.max(3, Math.min(97, ((cx - r.left) / r.width) * 100)),
      y: Math.max(3, Math.min(97, ((cy - r.top) / r.height) * 100)),
    };
  };

  const down = (e: React.PointerEvent, id: string) => {
    if (!editable) return;
    if (mode === 'place' && lockedIds?.has(id)) return;
    e.stopPropagation();
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* 합성 이벤트 */ }
    info.current = { kind: mode, id, moved: false, sx: e.clientX, sy: e.clientY };
  };

  const move = (e: React.PointerEvent) => {
    const i = info.current;
    if (!i) return;
    if (!i.moved && Math.hypot(e.clientX - i.sx, e.clientY - i.sy) < 6) return;
    i.moved = true;
    const c = toCoord(e.clientX, e.clientY);
    if (!c) return;
    i.last = c;
    if (i.kind === 'place') setDragM({ id: i.id, ...c });
    else setPreview({ id: i.id, ...c });
  };

  const up = () => {
    const i = info.current;
    info.current = null;
    if (i) {
      if (i.moved && i.last) {
        if (i.kind === 'place' && onPlace) onPlace(i.id, i.last.x, i.last.y);
        if (i.kind === 'move' && onSetMove) onSetMove(i.id, i.last.x, i.last.y);
      } else if (!i.moved && i.kind === 'move' && onClearMove) {
        onClearMove(i.id); // 이동 모드에서 짧게 탭 → 그 마커의 이동 삭제
      }
    }
    setDragM(null);
    setPreview(null);
  };

  // 현재 표시 위치: 애니메이션 중이면 to, 아니면 시작 위치 (드래그 중이면 드래그 좌표)
  const posOf = (m: TacticMarker) => {
    if (dragM && dragM.id === m.id) return { x: dragM.x, y: dragM.y };
    if (animating && m.to) return { x: m.to.x, y: m.to.y };
    return { x: m.x, y: m.y };
  };

  // 이동 화살표: 마커 시작 → 목표 (미리보기 중이면 커서 위치)
  const moveArrows = cut.markers
    .map(m => {
      const pv = preview && preview.id === m.id ? preview : null;
      const to = pv ?? m.to;
      if (!to) return null;
      return { id: m.id, isBall: m.kind === 'ball', isOpp: m.kind === 'opponent', x1: m.x, y1: m.y, x2: to.x, y2: to.y };
    })
    .filter((a): a is NonNullable<typeof a> => !!a);

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-xl select-none"
      style={{
        aspectRatio: '3 / 4',
        background: 'linear-gradient(180deg, #2f4f3a 0%, #263f30 100%)',
        touchAction: editable ? 'none' : undefined,
      }}
      onPointerMove={move}
      onPointerUp={up}
    >
      {/* 필드 라인 */}
      <div className="absolute border-2 border-emerald-200/50 rounded-sm" style={{ inset: '3.5%' }} />
      <div className="absolute left-[3.5%] right-[3.5%] top-1/2 border-t-2 border-emerald-200/50" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-200/50" style={{ width: '22%', aspectRatio: '1' }} />
      <div className="absolute left-1/2 -translate-x-1/2 border-2 border-emerald-200/50" style={{ top: '3.5%', width: '54%', height: '15%' }} />
      <div className="absolute left-1/2 -translate-x-1/2 border-2 border-emerald-200/50" style={{ top: '3.5%', width: '28%', height: '6.5%' }} />
      <div className="absolute left-1/2 -translate-x-1/2 border-2 border-emerald-200/50" style={{ bottom: '3.5%', width: '54%', height: '15%' }} />
      <div className="absolute left-1/2 -translate-x-1/2 border-2 border-emerald-200/50" style={{ bottom: '3.5%', width: '28%', height: '6.5%' }} />

      {/* 이동 경로 화살표 (선수=하늘색, 공=노란색 점선) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <marker id="mv-p" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#7dd3fc" />
          </marker>
          <marker id="mv-b" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#fcd34d" />
          </marker>
          <marker id="mv-o" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#fca5a5" />
          </marker>
        </defs>
        {!animating && moveArrows.map(a => (
          <line
            key={a.id}
            x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
            stroke={a.isBall ? '#fcd34d' : a.isOpp ? '#fca5a5' : '#7dd3fc'}
            strokeDasharray={a.isBall ? '1.2 1.6' : '2.4 1.6'}
            markerEnd={a.isBall ? 'url(#mv-b)' : a.isOpp ? 'url(#mv-o)' : 'url(#mv-p)'}
            vectorEffect="non-scaling-stroke" strokeLinecap="round"
            style={{ strokeWidth: 2.5 }}
          />
        ))}
      </svg>

      {/* 마커 */}
      {cut.markers.map(m => {
        const p = posOf(m);
        const isBall = m.kind === 'ball';
        const hasMove = !!m.to;
        return (
          <div
            key={m.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{
              left: `${p.x}%`, top: `${p.y}%`,
              zIndex: dragM?.id === m.id ? 30 : isBall ? 20 : 10,
              transition: dragM?.id === m.id
                ? 'none'
                : animating
                  ? `left ${MOVE_MS}ms ease-in-out, top ${MOVE_MS}ms ease-in-out`
                  : 'left .15s, top .15s',
              cursor: editable ? (mode === 'place' ? 'grab' : 'crosshair') : undefined,
            }}
            onPointerDown={e => down(e, m.id)}
          >
            {isBall ? (
              <div className="w-4 h-4 rounded-full bg-white border-2 border-gray-800 shadow-md flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-gray-800" style={{ clipPath: 'polygon(50% 0%, 100% 38%, 81% 100%, 19% 100%, 0% 38%)' }} />
              </div>
            ) : m.kind === 'opponent' ? (
              <div className={`w-7 h-7 rounded-full bg-red-500 border-2 shadow-md flex items-center justify-center ${
                hasMove && !animating ? 'border-red-200' : 'border-red-700'
              }`}>
                <span className="text-[8px] font-extrabold text-white leading-none">{m.label}</span>
              </div>
            ) : (
              <div className="relative flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full bg-white/95 border-2 shadow-md flex items-center justify-center ${
                  hasMove && !animating ? 'border-sky-300' : 'border-white'
                }`}>
                  <span className="text-[8px] font-extrabold text-gray-800 leading-none">{m.label}</span>
                </div>
                {m.name && (
                  <span className="absolute top-full mt-0.5 px-1 rounded bg-black/45 text-[8px] font-bold text-white whitespace-nowrap leading-tight">
                    {m.name}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 페이지 ───
export default function TacticsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const id = params.get('id');
  const coach = isCoach();
  const me = getCurrentUser();

  const [tactics, setTactics] = useState<Tactic[]>(getTactics());
  useEffect(() => subscribe(() => setTactics(getTactics())), []);

  const tactic = tactics.find(t => t.id === id) || null;

  // 연결된 매치 (라인업이 바뀌면 바로 반영되도록 구독)
  const [matches, setMatches] = useState<Match[]>(getMatches());
  useEffect(() => subscribe(() => setMatches(getMatches())), []);
  const linkedMatch = tactic?.matchId ? matches.find(m => m.id === tactic.matchId) ?? null : null;
  const hasLineup = (linkedMatch?.quarters?.length ?? 0) > 0;
  const [viewQuarter, setViewQuarter] = useState(0);
  useEffect(() => { setViewQuarter(tactic?.quarter ?? 0); }, [tactic?.id, tactic?.quarter]);

  const [cuts, setCuts] = useState<TacticCut[]>([]);
  const [title, setTitle] = useState('');
  const [cutIdx, setCutIdx] = useState(0);
  const [mode, setMode] = useState<'place' | 'move'>('move');
  const [animating, setAnimating] = useState(false); // 현재 장면 이동 재생 중
  const [playingAll, setPlayingAll] = useState(false);
  const playToken = useRef(0);
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (tactic && loadedId.current !== tactic.id) {
      loadedId.current = tactic.id;
      setCuts(tactic.cuts.map(c => ({
        markers: c.markers.map(m => ({ ...m })),
        arrows: c.arrows || [],
        note: c.note,
        ...(c.formation ? { formation: c.formation } : {}),
        ...(c.oppFormation ? { oppFormation: c.oppFormation } : {}),
      })));
      setTitle(tactic.title);
      setCutIdx(0);
      setAnimating(false);
      setPlayingAll(false);
    }
  }, [tactic]);

  const persist = useCallback((nextCuts: TacticCut[], nextTitle?: string) => {
    if (!tactic || !coach) return;
    // Firestore 는 undefined 값이 하나라도 있으면 저장 전체를 거부합니다.
    // 장면 데이터는 숫자·글자·배열뿐이라 JSON 왕복으로 undefined 항목만 안전하게 빠집니다.
    const clean = JSON.parse(JSON.stringify(nextCuts)) as TacticCut[];
    updateTactic(tactic.id, { cuts: clean, ...(nextTitle !== undefined ? { title: nextTitle } : {}) });
  }, [tactic, coach]);

  const patchCut = (idx: number, patch: Partial<TacticCut>, save = true) => {
    setCuts(prev => {
      const next = prev.map((c, i) => (i === idx ? { ...c, ...patch } : c));
      if (save) persist(next);
      return next;
    });
  };

  // 매치 연결. 해제할 때는 지금 보이는 배치를 그대로 1번 장면에 남겨 화면이 튀지 않게 합니다.
  const linkMatch = (matchId: string | null) => {
    if (!tactic || !coach) return;
    if (!matchId && linkedMatch && cuts[0]) {
      const frozen = syncFromMatch(cuts[0], linkedMatch, viewQuarter);
      const next = [frozen, ...cuts.slice(1)];
      setCuts(next);
      persist(next);
    }
    updateTactic(tactic.id, { matchId, quarter: 0 });
    setCutIdx(0);
  };

  const pickQuarter = (qi: number) => {
    setViewQuarter(qi);
    if (tactic && coach) updateTactic(tactic.id, { quarter: qi });
  };

  // 우리 팀 포메이션 변경. 연결된 매치는 라인업을 짜기 전일 때만 매치 포메이션도 같이 바꿉니다.
  const changeOurFormation = (f: string | null) => {
    if (linkedMatch && cutIdx === 0) {
      if (f && !hasLineup) updateMatch(linkedMatch.id, { formation: f });
      return;
    }
    applyTeams(f, cut.oppFormation ?? null);
  };

  /**
   * 포메이션 적용. ours 가 null 이면 우리 팀은 그대로 두고, opp 는 그 값으로 맞춥니다.
   * 바꾸는 팀의 위치와 이동은 초기화되고, 공과 다른 팀은 그대로 둡니다.
   */
  const applyTeams = (ours: string | null, opp: string | null) => {
    const current = cuts[cutIdx];
    if (!current) return;
    const changingOpp = (current.oppFormation ?? null) !== opp;
    const touched = current.markers.filter(m =>
      (ours && m.kind === 'player') || (changingOpp && m.kind === 'opponent'));
    if (touched.some(m => m.to) && !confirm('바꾸는 팀의 위치와 이동 표시가 초기화됩니다. 계속할까요?')) return;

    const keep = current.markers.filter(m =>
      !(ours && m.kind === 'player') && !(changingOpp && m.kind === 'opponent'));
    const markers = [
      ...(ours ? buildTeam(ours, 'us') : []),
      ...keep,
      ...(changingOpp && opp ? buildTeam(opp, 'opp') : []),
    ];
    patchCut(cutIdx, {
      markers,
      ...(ours ? { formation: ours } : {}),
      oppFormation: opp,
    });
  };

  const stopPlay = () => {
    playToken.current++;
    setAnimating(false);
    setPlayingAll(false);
  };

  // 이 장면 재생: 시작 → (이동 있는 마커들) 목표로 → 끝나면 원위치
  const playScene = async () => {
    const token = ++playToken.current;
    setAnimating(true);
    await new Promise(r => setTimeout(r, MOVE_MS + 250));
    if (playToken.current !== token) return;
    setAnimating(false);
  };

  // 전체 재생: 현재 장면부터 이동 → 다음 장면으로 이어서
  const playAll = async () => {
    const token = ++playToken.current;
    setPlayingAll(true);
    for (let i = cutIdx; i < cuts.length; i++) {
      if (playToken.current !== token) return;
      setCutIdx(i);
      setAnimating(false);
      await new Promise(r => setTimeout(r, 350)); // 장면 시작 위치 잠깐 보여줌
      if (playToken.current !== token) return;
      setAnimating(true);
      await new Promise(r => setTimeout(r, MOVE_MS + 300));
    }
    if (playToken.current !== token) return;
    setAnimating(false);
    setPlayingAll(false);
  };

  const handleCreate = async () => {
    const t = await saveTactic({
      title: '새 전술',
      cuts: [defaultCut()],
      authorName: me?.name ?? '감독',
    });
    if (t) navigate(`/tactics?id=${t.id}`);
  };

  const handleShare = async () => {
    if (!tactic) return;
    const url = window.location.origin + import.meta.env.BASE_URL + `#/tactics?id=${tactic.id}`;
    const text = `${tactic.title} — 오지FC 전술 보드\n재생 버튼을 눌러 움직임을 확인하세요`;
    if (navigator.share) {
      try { await navigator.share({ text, url }); return; } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      alert('링크가 복사되었습니다. 카톡에 붙여넣기 하세요!');
    } catch { prompt('아래 링크를 복사하세요:', url); }
  };

  // ── 목록 ──
  if (!id || !tactic) {
    return (
      <div className="min-h-screen bg-gray-50 pb-8">
        <div className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] text-white px-5 pt-10 pb-6 rounded-b-3xl shadow-lg">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Clapperboard size={20} /> 전술 보드
          </h1>
          <p className="text-blue-200 text-sm mt-1">선수와 공의 움직임을 지정하고, 재생으로 확인하세요</p>
        </div>

        <div className="px-4 -mt-4 space-y-3">
          {coach && (
            <button
              onClick={handleCreate}
              className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center justify-center gap-2 text-[#16a34a] font-semibold text-sm active:bg-green-50 transition-colors"
            >
              <Plus size={18} /> 새 전술 만들기
            </button>
          )}

          {tactics.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
              <Clapperboard size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">등록된 전술이 없습니다</p>
            </div>
          ) : (
            tactics.map(t => (
              <button
                key={t.id}
                onClick={() => navigate(`/tactics?id=${t.id}`)}
                className="w-full bg-white rounded-2xl shadow-sm p-4 text-left active:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-800">{t.title}</p>
                  <span className="text-[10px] text-gray-400">{fmtDate(t.updatedAt)}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  장면 {t.cuts.length}개 · 감독 {t.authorName}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // ── 상세/편집 ──
  const storedCut = cuts[cutIdx] ?? defaultCut();
  const synced = !!linkedMatch && cutIdx === 0;
  const cut = synced ? syncFromMatch(storedCut, linkedMatch!, viewQuarter) : storedCut;
  const lockedIds = synced ? new Set(cut.markers.filter(m => m.kind === 'player').map(m => m.id)) : undefined;
  const editable = coach && !animating && !playingAll;
  const moveCount = cut.markers.filter(m => m.to).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* 헤더 */}
      <div className="bg-[#1e3a5f] text-white px-4 py-3 flex items-center gap-2">
        <button onClick={() => { stopPlay(); navigate('/tactics'); }} className="p-1 -ml-1 rounded-lg hover:bg-white/10">
          <ChevronLeft size={20} />
        </button>
        {coach ? (
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={() => persist(cuts, title.trim() || '무제 전술')}
            className="flex-1 bg-transparent text-base font-bold outline-none border-b border-transparent focus:border-white/40"
          />
        ) : (
          <h1 className="flex-1 text-base font-bold truncate">{tactic.title}</h1>
        )}
        <button onClick={handleShare} className="p-1.5 rounded-lg hover:bg-white/10"><Share2 size={17} /></button>
        {coach && (
          <button
            onClick={async () => {
              if (!confirm('이 전술을 삭제할까요?')) return;
              stopPlay();
              await deleteTactic(tactic.id);
              navigate('/tactics');
            }}
            className="p-1.5 rounded-lg hover:bg-white/10 text-red-300"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="p-3 space-y-3 max-w-[520px] mx-auto">
        {/* 매치 연결 — 1번 장면의 우리 팀이 매치 포메이션·라인업을 따라갑니다 */}
        {(coach || linkedMatch) && (
          <div className="bg-white rounded-2xl shadow-sm p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Link2 size={13} className="text-[#1e3a5f]" />
              <span className="text-[11px] font-bold text-gray-700">매치 연결</span>
              {linkedMatch && (
                <span className="ml-auto text-[10px] font-bold text-green-600">
                  ● {linkedMatch.formation || '4-2-3-1'} 동기화 중
                </span>
              )}
            </div>
            {coach ? (
              <select
                value={tactic.matchId ?? ''}
                onChange={e => linkMatch(e.target.value || null)}
                className="w-full px-2 py-2 border border-gray-200 rounded-xl text-xs font-semibold bg-white"
              >
                <option value="">연결 안 함</option>
                {matches.slice(0, 20).map(m => (
                  <option key={m.id} value={m.id}>
                    {m.title} ({fmtDate(m.date)}) · {m.formation || '4-2-3-1'}
                  </option>
                ))}
                {tactic.matchId && !linkedMatch && <option value={tactic.matchId}>삭제된 매치</option>}
              </select>
            ) : linkedMatch && (
              <p className="text-xs font-semibold text-gray-700">{linkedMatch.title} ({fmtDate(linkedMatch.date)})</p>
            )}
            {linkedMatch && hasLineup && (
              <div className="flex gap-1 mt-2">
                {[0, 1, 2, 3].map(qi => (
                  <button
                    key={qi}
                    onClick={() => pickQuarter(qi)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold ${
                      viewQuarter === qi ? 'bg-[#1e3a5f] text-white' : 'bg-gray-50 text-gray-500 border border-gray-200'
                    }`}
                  >
                    {qi + 1}Q
                  </button>
                ))}
              </div>
            )}
            {linkedMatch && (
              <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                1번 장면의 우리 팀은 이 매치 {hasLineup ? '라인업(선수 이름 포함)' : '포메이션'}을 따라갑니다.
                {hasLineup
                  ? ' 위치를 바꾸려면 라인업 화면에서 옮겨주세요.'
                  : ' 아래에서 포메이션을 바꾸면 매치 포메이션도 같이 바뀝니다.'}
              </p>
            )}
          </div>
        )}

        {/* 장면 탭 + 재생 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {cuts.map((_, i) => (
            <button
              key={i}
              onClick={() => { stopPlay(); setCutIdx(i); }}
              className={`shrink-0 w-9 h-9 rounded-xl text-xs font-bold transition-colors ${
                i === cutIdx ? 'bg-[#1e3a5f] text-white shadow' : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              {i + 1}
            </button>
          ))}
          {coach && (
            <button
              onClick={() => {
                // 이동 결과를 시작 위치로 갖는 다음 장면 생성
                stopPlay();
                const nextMarkers = cut.markers.map(m => {
                  const { to, ...rest } = m;
                  return { ...rest, x: to?.x ?? m.x, y: to?.y ?? m.y };
                });
                const dup: TacticCut = {
                  markers: nextMarkers, arrows: [], note: '',
                  ...(cut.formation ? { formation: cut.formation } : {}),
                  ...(cut.oppFormation ? { oppFormation: cut.oppFormation } : {}),
                };
                const next = [...cuts.slice(0, cutIdx + 1), dup, ...cuts.slice(cutIdx + 1)];
                setCuts(next); persist(next); setCutIdx(cutIdx + 1);
              }}
              className="shrink-0 flex items-center gap-1 px-2.5 h-9 rounded-xl bg-green-50 text-green-600 border border-green-200 text-[10px] font-bold"
              title="이동이 끝난 위치를 시작점으로 다음 장면 추가"
            >
              <ArrowRightToLine size={13} /> 다음 장면
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={() => {
              if (animating || playingAll) { stopPlay(); return; }
              if (cuts.length > 1) playAll(); else playScene();
            }}
            disabled={moveCount === 0 && cuts.length < 2}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-bold transition-colors ${
              animating || playingAll
                ? 'bg-red-500 text-white'
                : 'bg-[#16a34a] text-white disabled:bg-gray-200 disabled:text-gray-400'
            }`}
          >
            {animating || playingAll
              ? <><Square size={12} className="fill-current" /> 정지</>
              : <><Play size={12} className="fill-current" /> 재생</>}
          </button>
        </div>

        {/* 편집 도구 (감독) */}
        {coach && !animating && !playingAll && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMode('move')}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap ${
                mode === 'move' ? 'bg-sky-600 text-white' : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              <MoveUpRight size={13} /> 이동 지정
            </button>
            <button
              onClick={() => setMode('place')}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap ${
                mode === 'place' ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              <Hand size={13} /> 배치
            </button>
            <button
              onClick={() => patchCut(cutIdx, {
                markers: cut.markers.map(m => { const { to, ...rest } = m; void to; return rest; }),
              })}
              disabled={moveCount === 0}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap bg-white text-gray-500 border border-gray-200 disabled:opacity-40"
            >
              <Eraser size={13} /> 이동 지우기
            </button>
            <div className="flex-1" />
            {cuts.length > 1 && (
              <button
                onClick={() => {
                  if (!confirm(`${cutIdx + 1}번 장면을 삭제할까요?`)) return;
                  const next = cuts.filter((_, i) => i !== cutIdx);
                  setCuts(next); persist(next);
                  setCutIdx(Math.max(0, cutIdx - 1));
                }}
                className="px-2.5 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap text-red-500 bg-white border border-gray-200"
              >
                장면 삭제
              </button>
            )}
          </div>
        )}

        {/* 팀 구성 (감독) — 포메이션을 고르면 이 장면의 배치를 그 모양으로 바꿉니다 */}
        {coach && !animating && !playingAll && (
          <div className="bg-white rounded-2xl shadow-sm p-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-white border-2 border-gray-300" /> 우리 팀
              </span>
              <select
                value={cut.formation ?? ''}
                onChange={e => changeOurFormation(e.target.value || null)}
                disabled={synced && hasLineup}
                title={synced && hasLineup ? '라인업을 짠 매치는 라인업 화면에서 포메이션을 바꿔주세요' : undefined}
                className="mt-1 w-full px-2 py-2 border border-gray-200 rounded-xl text-xs font-semibold bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="" disabled>포메이션 선택</option>
                <FormationOptions />
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> 상대팀
              </span>
              <select
                value={cut.oppFormation ?? ''}
                onChange={e => applyTeams(null, e.target.value || null)}
                className="mt-1 w-full px-2 py-2 border border-gray-200 rounded-xl text-xs font-semibold bg-white"
              >
                <option value="">없음</option>
                <FormationOptions />
              </select>
            </label>
          </div>
        )}

        {/* 피치 */}
        <TacticsPitch
          cut={cut}
          editable={editable}
          lockedIds={lockedIds}
          mode={mode}
          animating={animating}
          onPlace={(mid, x, y) =>
            patchCut(cutIdx, {
              markers: cut.markers.map(m => (m.id === mid ? { ...m, x, y, label: relabel(m, x, y) } : m)),
            })
          }
          onSetMove={(mid, x, y) =>
            patchCut(cutIdx, { markers: cut.markers.map(m => (m.id === mid ? { ...m, to: { x, y } } : m)) })
          }
          onClearMove={(mid) =>
            patchCut(cutIdx, {
              markers: cut.markers.map(m => {
                if (m.id !== mid) return m;
                const { to, ...rest } = m; void to; return rest;
              }),
            })
          }
        />

        {/* 장면 설명 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-bold text-gray-500">장면 설명 ({cutIdx + 1}/{cuts.length})</p>
            {moveCount > 0 && (
              <span className="text-[10px] text-sky-600 font-bold">이동 {moveCount}개</span>
            )}
          </div>
          {coach && !animating && !playingAll ? (
            <textarea
              value={cut.note}
              onChange={e => patchCut(cutIdx, { note: e.target.value }, false)}
              onBlur={() => persist(cuts)}
              placeholder="이 장면에서 무엇을 해야 하는지 적어주세요"
              rows={3}
              className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:bg-white transition resize-none"
            />
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed min-h-[1.5rem]">
              {cut.note || <span className="text-gray-300">설명이 없습니다</span>}
            </p>
          )}
        </div>

        {coach && !animating && !playingAll && (
          <p className="text-center text-[10px] text-gray-400 leading-relaxed">
            <b>이동 지정</b>: 선수·공에서 끌면 화살표가 생기고, 재생하면 그 방향으로 움직입니다 (탭하면 삭제)<br />
            <b>배치</b>: 시작 위치를 옮깁니다 (자리 이름도 바뀝니다) · <b>다음 장면</b>: 이동이 끝난 자리에서 이어지는 장면을 만듭니다
          </p>
        )}
      </div>
    </div>
  );
}
