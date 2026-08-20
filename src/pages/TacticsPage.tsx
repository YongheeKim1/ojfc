import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Clapperboard, Plus, Play, Square, Share2, Trash2, ChevronLeft,
  MousePointer2, MoveUpRight, Undo2, Copy, X,
} from 'lucide-react';
import { getTactics, saveTactic, updateTactic, deleteTactic, getCurrentUser, subscribe, isCoach } from '../lib/store';
import type { Tactic, TacticCut, TacticMarker, TacticArrow } from '../lib/types';

// 기본 컷: 4-2-3-1 배치 + 공
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

// ─── 전술 피치 (마커 드래그 + 화살표 그리기) ───
function TacticsPitch({
  cut, editable, mode, playing,
  onMarkerMove, onArrowAdd,
}: {
  cut: TacticCut;
  editable: boolean;
  mode: 'move' | 'arrow';
  playing: boolean;
  onMarkerMove?: (markerId: string, x: number, y: number) => void;
  onArrowAdd?: (a: TacticArrow) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragM, setDragM] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dragA, setDragA] = useState<TacticArrow | null>(null);
  const info = useRef<{ kind: 'marker' | 'arrow'; id?: string; moved: boolean; sx: number; sy: number; start?: { x: number; y: number }; last?: { x: number; y: number } } | null>(null);

  const toCoord = (cx: number, cy: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      x: Math.max(3, Math.min(97, ((cx - r.left) / r.width) * 100)),
      y: Math.max(3, Math.min(97, ((cy - r.top) / r.height) * 100)),
    };
  };

  const downMarker = (e: React.PointerEvent, id: string) => {
    if (!editable || mode !== 'move') return;
    e.stopPropagation();
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    info.current = { kind: 'marker', id, moved: false, sx: e.clientX, sy: e.clientY };
  };

  const downPitch = (e: React.PointerEvent) => {
    if (!editable || mode !== 'arrow') return;
    const c = toCoord(e.clientX, e.clientY);
    if (!c) return;
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    info.current = { kind: 'arrow', moved: false, sx: e.clientX, sy: e.clientY, start: c };
    setDragA({ x1: c.x, y1: c.y, x2: c.x, y2: c.y });
  };

  const move = (e: React.PointerEvent) => {
    const i = info.current;
    if (!i) return;
    if (!i.moved && Math.hypot(e.clientX - i.sx, e.clientY - i.sy) < 6) return;
    i.moved = true;
    const c = toCoord(e.clientX, e.clientY);
    if (!c) return;
    i.last = c; // state는 비동기라 up()에서는 ref 좌표를 사용
    if (i.kind === 'marker' && i.id) setDragM({ id: i.id, ...c });
    else if (i.kind === 'arrow') setDragA(a => (a ? { ...a, x2: c.x, y2: c.y } : a));
  };

  const up = () => {
    const i = info.current;
    info.current = null;
    if (i?.moved && i.last) {
      if (i.kind === 'marker' && i.id && onMarkerMove) onMarkerMove(i.id, i.last.x, i.last.y);
      if (i.kind === 'arrow' && i.start && onArrowAdd) {
        const a: TacticArrow = { x1: i.start.x, y1: i.start.y, x2: i.last.x, y2: i.last.y };
        if (Math.hypot(a.x2 - a.x1, a.y2 - a.y1) >= 6) onArrowAdd(a);
      }
    }
    setDragM(null);
    setDragA(null);
  };

  const posOf = (m: TacticMarker) => (dragM && dragM.id === m.id ? { x: dragM.x, y: dragM.y } : { x: m.x, y: m.y });
  const arrows = dragA ? [...cut.arrows, dragA] : cut.arrows;

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-xl select-none"
      style={{
        aspectRatio: '3 / 4',
        background: 'linear-gradient(180deg, #2f4f3a 0%, #263f30 100%)',
        touchAction: editable ? 'none' : undefined,
      }}
      onPointerDown={downPitch}
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

      {/* 화살표 (SVG 오버레이) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <marker id="tarrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#7dd3fc" />
          </marker>
        </defs>
        {arrows.map((a, i) => (
          <line
            key={i}
            x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
            stroke="#7dd3fc" strokeWidth="1.1" strokeDasharray="2.4 1.6"
            markerEnd="url(#tarrow)" vectorEffect="non-scaling-stroke" strokeLinecap="round"
            style={{ strokeWidth: 2.5 }}
          />
        ))}
      </svg>

      {/* 마커 */}
      {cut.markers.map(m => {
        const p = posOf(m);
        const isBall = m.kind === 'ball';
        return (
          <div
            key={m.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{
              left: `${p.x}%`, top: `${p.y}%`,
              zIndex: dragM?.id === m.id ? 30 : isBall ? 20 : 10,
              transition: dragM?.id === m.id ? 'none' : playing ? 'left 1.1s ease-in-out, top 1.1s ease-in-out' : 'left .15s, top .15s',
              cursor: editable && mode === 'move' ? 'grab' : undefined,
            }}
            onPointerDown={e => downMarker(e, m.id)}
          >
            {isBall ? (
              <div className="w-5 h-5 rounded-full bg-white border-2 border-gray-800 shadow-md flex items-center justify-center">
                <div className="w-2 h-2 bg-gray-800" style={{ clipPath: 'polygon(50% 0%, 100% 38%, 81% 100%, 19% 100%, 0% 38%)' }} />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/95 border-2 border-white shadow-lg flex items-center justify-center">
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

  // 로컬 편집 상태 (변경 즉시 저장)
  const [cuts, setCuts] = useState<TacticCut[]>([]);
  const [title, setTitle] = useState('');
  const [cutIdx, setCutIdx] = useState(0);
  const [mode, setMode] = useState<'move' | 'arrow'>('move');
  const [playing, setPlaying] = useState(false);
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (tactic && loadedId.current !== tactic.id) {
      loadedId.current = tactic.id;
      setCuts(tactic.cuts.map(c => ({ markers: [...c.markers], arrows: [...c.arrows], note: c.note })));
      setTitle(tactic.title);
      setCutIdx(0);
      setPlaying(false);
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

  // 재생: 컷을 순서대로 넘김
  useEffect(() => {
    if (!playing) return;
    if (cutIdx >= cuts.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setCutIdx(i => i + 1), 1600);
    return () => clearTimeout(t);
  }, [playing, cutIdx, cuts.length]);

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

  // ── 목록 화면 ──
  if (!id || !tactic) {
    return (
      <div className="min-h-screen bg-gray-50 pb-8">
        <div className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] text-white px-5 pt-10 pb-6 rounded-b-3xl shadow-lg">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Clapperboard size={20} /> 전술 보드
          </h1>
          <p className="text-blue-200 text-sm mt-1">감독의 전술을 장면으로 보고, 재생으로 움직임을 확인하세요</p>
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
                  컷 {t.cuts.length}개 · 감독 {t.authorName}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // ── 상세/편집 화면 ──
  const cut = cuts[cutIdx] ?? defaultCut();

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* 헤더 */}
      <div className="bg-[#1e3a5f] text-white px-4 py-3 flex items-center gap-2">
        <button onClick={() => navigate('/tactics')} className="p-1 -ml-1 rounded-lg hover:bg-white/10">
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
        {/* 컷 탭 + 재생 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {cuts.map((_, i) => (
            <button
              key={i}
              onClick={() => { setPlaying(false); setCutIdx(i); }}
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
                // 현재 컷 복제 (화살표는 비움) → 다음 장면 만들기
                const dup: TacticCut = { markers: cut.markers.map(m => ({ ...m })), arrows: [], note: '' };
                const next = [...cuts.slice(0, cutIdx + 1), dup, ...cuts.slice(cutIdx + 1)];
                setCuts(next); persist(next); setCutIdx(cutIdx + 1);
              }}
              className="shrink-0 w-9 h-9 rounded-xl bg-green-50 text-green-600 border border-green-200 flex items-center justify-center"
              title="현재 컷 복제해서 다음 장면 추가"
            >
              <Copy size={14} />
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={() => {
              if (playing) { setPlaying(false); return; }
              setCutIdx(0);
              // 첫 컷에서 잠깐 멈췄다가 시작
              setTimeout(() => setPlaying(true), 150);
            }}
            disabled={cuts.length < 2}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-bold transition-colors ${
              playing ? 'bg-red-500 text-white' : 'bg-[#16a34a] text-white disabled:bg-gray-200 disabled:text-gray-400'
            }`}
          >
            {playing ? <><Square size={12} className="fill-current" /> 정지</> : <><Play size={12} className="fill-current" /> 재생</>}
          </button>
        </div>

        {/* 편집 도구 (감독) */}
        {coach && !playing && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMode('move')}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-bold ${
                mode === 'move' ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              <MousePointer2 size={13} /> 이동
            </button>
            <button
              onClick={() => setMode('arrow')}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-bold ${
                mode === 'arrow' ? 'bg-sky-600 text-white' : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              <MoveUpRight size={13} /> 화살표
            </button>
            <button
              onClick={() => patchCut(cutIdx, { arrows: cut.arrows.slice(0, -1) })}
              disabled={cut.arrows.length === 0}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-bold bg-white text-gray-500 border border-gray-200 disabled:opacity-40"
            >
              <Undo2 size={13} /> 화살표 취소
            </button>
            <div className="flex-1" />
            {cuts.length > 1 && (
              <button
                onClick={() => {
                  if (!confirm(`${cutIdx + 1}번 컷을 삭제할까요?`)) return;
                  const next = cuts.filter((_, i) => i !== cutIdx);
                  setCuts(next); persist(next);
                  setCutIdx(Math.max(0, cutIdx - 1));
                }}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-bold text-red-500 bg-white border border-gray-200"
              >
                <X size={13} /> 컷 삭제
              </button>
            )}
          </div>
        )}

        {/* 피치 */}
        <TacticsPitch
          cut={cut}
          editable={coach && !playing}
          mode={mode}
          playing={playing}
          onMarkerMove={(mid, x, y) =>
            patchCut(cutIdx, { markers: cut.markers.map(m => (m.id === mid ? { ...m, x, y } : m)) })
          }
          onArrowAdd={a => patchCut(cutIdx, { arrows: [...cut.arrows, a] })}
        />

        {/* 컷 설명 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-[11px] font-bold text-gray-500 mb-1.5">컷 설명 ({cutIdx + 1}/{cuts.length})</p>
          {coach && !playing ? (
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

        {coach && !playing && (
          <p className="text-center text-[10px] text-gray-400 leading-relaxed">
            이동 모드: 선수·공을 끌어서 배치 · 화살표 모드: 피치를 끌어서 화살표<br />
            컷을 복제해 다음 장면을 만들고, 재생으로 움직임을 확인하세요. 변경은 자동 저장됩니다.
          </p>
        )}
      </div>
    </div>
  );
}
