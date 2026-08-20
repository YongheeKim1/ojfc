import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Clapperboard, Plus, Play, Square, Share2, Trash2, ChevronLeft,
  Hand, MoveUpRight, Eraser, ArrowRightToLine,
} from 'lucide-react';
import { getTactics, saveTactic, updateTactic, deleteTactic, getCurrentUser, subscribe, isCoach } from '../lib/store';
import type { Tactic, TacticCut, TacticMarker } from '../lib/types';

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

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const MOVE_MS = 1300; // 한 장면의 이동 애니메이션 시간

// ─── 전술 피치 ───
// mode 'place': 마커를 끌어 시작 위치 배치
// mode 'move' : 마커에서 끌어 이동 목표 지정 (짧게 탭하면 그 마커의 이동 삭제)
function TacticsPitch({
  cut, editable, mode, animating,
  onPlace, onSetMove, onClearMove,
}: {
  cut: TacticCut;
  editable: boolean;
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
      return { id: m.id, isBall: m.kind === 'ball', x1: m.x, y1: m.y, x2: to.x, y2: to.y };
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
        </defs>
        {!animating && moveArrows.map(a => (
          <line
            key={a.id}
            x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
            stroke={a.isBall ? '#fcd34d' : '#7dd3fc'}
            strokeDasharray={a.isBall ? '1.2 1.6' : '2.4 1.6'}
            markerEnd={a.isBall ? 'url(#mv-b)' : 'url(#mv-p)'}
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
              <div className="w-5 h-5 rounded-full bg-white border-2 border-gray-800 shadow-md flex items-center justify-center">
                <div className="w-2 h-2 bg-gray-800" style={{ clipPath: 'polygon(50% 0%, 100% 38%, 81% 100%, 19% 100%, 0% 38%)' }} />
              </div>
            ) : (
              <div className={`w-10 h-10 rounded-full bg-white/95 border-2 shadow-lg flex items-center justify-center ${
                hasMove && !animating ? 'border-sky-300' : 'border-white'
              }`}>
                <span className="text-[9px] font-extrabold text-gray-800">{m.label}</span>
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
      })));
      setTitle(tactic.title);
      setCutIdx(0);
      setAnimating(false);
      setPlayingAll(false);
    }
  }, [tactic]);

  const persist = useCallback((nextCuts: TacticCut[], nextTitle?: string) => {
    if (!tactic || !coach) return;
    updateTactic(tactic.id, { cuts: nextCuts, ...(nextTitle !== undefined ? { title: nextTitle } : {}) });
  }, [tactic, coach]);

  const patchCut = (idx: number, patch: Partial<TacticCut>, save = true) => {
    setCuts(prev => {
      const next = prev.map((c, i) => (i === idx ? { ...c, ...patch } : c));
      if (save) persist(next);
      return next;
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
  const cut = cuts[cutIdx] ?? defaultCut();
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
                const dup: TacticCut = { markers: nextMarkers, arrows: [], note: '' };
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
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-bold ${
                mode === 'move' ? 'bg-sky-600 text-white' : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              <MoveUpRight size={13} /> 이동 지정
            </button>
            <button
              onClick={() => setMode('place')}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-bold ${
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
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-bold bg-white text-gray-500 border border-gray-200 disabled:opacity-40"
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
                className="px-3 py-2 rounded-xl text-[11px] font-bold text-red-500 bg-white border border-gray-200"
              >
                장면 삭제
              </button>
            )}
          </div>
        )}

        {/* 피치 */}
        <TacticsPitch
          cut={cut}
          editable={editable}
          mode={mode}
          animating={animating}
          onPlace={(mid, x, y) =>
            patchCut(cutIdx, { markers: cut.markers.map(m => (m.id === mid ? { ...m, x, y } : m)) })
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
            <b>배치</b>: 시작 위치를 옮깁니다 · <b>다음 장면</b>: 이동이 끝난 자리에서 이어지는 장면을 만듭니다
          </p>
        )}
      </div>
    </div>
  );
}
