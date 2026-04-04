import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Users,
  Shuffle,
  AlertTriangle,
  Check,
  ChevronDown,
  Square,
  MapPin,
  Calendar,
  Coffee,
  ClipboardList,
  ChevronRight,
  Edit3,
  X,
} from 'lucide-react';
import {
  getMembers,
  getMatches,
  getGuestsByMatch,
  updateMatch,
  getPlayerInfo,
  FORMATIONS,
  generateQuarterLineups,
  subscribe,
} from '../lib/store';
import type { FormationSlot } from '../lib/store';
import type { Position, QuarterLineup } from '../lib/types';
import { getPositionColor } from '../lib/types';

// ─── Position Badge ───
function PositionBadge({ position }: { position: Position }) {
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getPositionColor(position)}`}
    >
      {position}
    </span>
  );
}

// ─── Football Pitch Component ───
function FootballPitch({
  lineup,
  formation,
  selectedPlayerId,
  onPlayerTap,
}: {
  lineup: Record<string, string>;
  formation: string;
  selectedPlayerId: string | null;
  onPlayerTap?: (slotId: string, playerId: string) => void;
}) {
  const slots: FormationSlot[] = FORMATIONS[formation] || FORMATIONS['4-2-3-1'];

  return (
    <div className="w-full">
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{
          aspectRatio: '3 / 4',
          background: 'linear-gradient(180deg, #2d8a4e 0%, #1e7a3a 100%)',
        }}
      >
        {/* Pitch stripes */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <div
            key={i}
            className="absolute left-0 right-0"
            style={{
              top: `${i * 10}%`,
              height: '10%',
              backgroundColor:
                i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
            }}
          />
        ))}

        {/* Field outline */}
        <div className="absolute border-2 border-white/60 rounded-sm" style={{ inset: '4%' }} />

        {/* Center line */}
        <div className="absolute left-[4%] right-[4%] top-1/2 h-0 border-t-2 border-white/60" />

        {/* Center circle */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/60"
          style={{ width: '20%', aspectRatio: '1' }}
        />

        {/* Center dot */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/70 rounded-full" />

        {/* Top penalty box */}
        <div
          className="absolute left-1/2 -translate-x-1/2 border-2 border-white/60"
          style={{ top: '4%', width: '52%', height: '16%' }}
        />

        {/* Top goal area */}
        <div
          className="absolute left-1/2 -translate-x-1/2 border-2 border-white/60"
          style={{ top: '4%', width: '26%', height: '7%' }}
        />

        {/* Top penalty arc */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full border-2 border-white/60"
          style={{
            top: '14%',
            width: '16%',
            height: '9%',
            clipPath: 'inset(50% 0 0 0)',
          }}
        />

        {/* Top goal */}
        <div
          className="absolute left-1/2 -translate-x-1/2 border-2 border-b-0 border-white/40"
          style={{ top: '0.5%', width: '14%', height: '3.5%' }}
        />

        {/* Bottom penalty box */}
        <div
          className="absolute left-1/2 -translate-x-1/2 border-2 border-white/60"
          style={{ bottom: '4%', width: '52%', height: '16%' }}
        />

        {/* Bottom goal area */}
        <div
          className="absolute left-1/2 -translate-x-1/2 border-2 border-white/60"
          style={{ bottom: '4%', width: '26%', height: '7%' }}
        />

        {/* Bottom penalty arc */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full border-2 border-white/60"
          style={{
            bottom: '14%',
            width: '16%',
            height: '9%',
            clipPath: 'inset(0 0 50% 0)',
          }}
        />

        {/* Bottom goal */}
        <div
          className="absolute left-1/2 -translate-x-1/2 border-2 border-t-0 border-white/40"
          style={{ bottom: '0.5%', width: '14%', height: '3.5%' }}
        />

        {/* Corner arcs */}
        {[
          { top: '4%', left: '4%', borderRadius: '0 0 100% 0' },
          { top: '4%', right: '4%', borderRadius: '0 0 0 100%' },
          { bottom: '4%', left: '4%', borderRadius: '0 100% 0 0' },
          { bottom: '4%', right: '4%', borderRadius: '100% 0 0 0' },
        ].map((style, i) => (
          <div
            key={i}
            className="absolute w-4 h-4 border-2 border-white/50"
            style={style as React.CSSProperties}
          />
        ))}

        {/* Player markers */}
        {slots.map((slot) => {
          const playerId = lineup[slot.id];
          const info = playerId ? getPlayerInfo(playerId) : null;
          const isSelected = playerId != null && playerId === selectedPlayerId;

          return (
            <button
              key={slot.id}
              className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              onClick={() => {
                if (playerId && onPlayerTap) onPlayerTap(slot.id, playerId);
              }}
            >
              {/* Circle */}
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center border-[2.5px] transition-all ${
                  isSelected ? 'border-blue-400 ring-2 ring-blue-400 ring-offset-1' : 'border-white'
                }`}
                style={{
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(219,234,254,0.97), rgba(191,219,254,0.97))'
                    : 'linear-gradient(135deg, rgba(255,255,255,0.97), rgba(235,235,235,0.97))',
                  boxShadow: isSelected
                    ? '0 3px 10px rgba(59,130,246,0.5)'
                    : '0 3px 10px rgba(0,0,0,0.35)',
                }}
              >
                <span className="text-[10px] font-extrabold text-gray-700">{slot.label}</span>
              </div>
              {/* Name pill */}
              <div
                className={`mt-0.5 backdrop-blur-sm rounded-full px-2 py-0.5 shadow-md transition-all ${
                  isSelected ? 'bg-blue-100/95 ring-1 ring-blue-400' : 'bg-white/90'
                }`}
              >
                <span className="text-[10px] font-bold text-gray-900 whitespace-nowrap leading-tight">
                  {info?.name ?? '---'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Past Lineup Card ───
function PastLineupCard({ match }: { match: { id: string; title: string; date: number; formation: string } }) {
  return (
    <Link
      to={`/lineup?matchId=${match.id}`}
      className="flex-shrink-0 w-36 bg-white rounded-xl border border-gray-200 p-3 shadow-sm hover:border-green-400 hover:bg-green-50 transition-colors"
    >
      <p className="text-[11px] text-gray-400 font-medium">
        {new Date(match.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
      </p>
      <p className="text-xs font-bold text-gray-800 mt-0.5 truncate">{match.title}</p>
      <p className="text-[11px] text-green-600 font-semibold mt-1">{match.formation || '4-2-3-1'}</p>
    </Link>
  );
}

// ─── Main Lineup Page ───
export default function LineupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('matchId');

  // Data — synchronous reads from cache, refreshed via subscribe
  const [allMatches, setAllMatches] = useState(getMatches());
  const [members, setMembers] = useState(getMembers());
  const [guests, setGuests] = useState(() => {
    if (!matchId) return [] as ReturnType<typeof getGuestsByMatch>;
    return getGuestsByMatch(matchId);
  });

  useEffect(() => {
    // Immediately refresh guests when matchId changes
    if (matchId) {
      setGuests(getGuestsByMatch(matchId));
    }
    return subscribe(() => {
      setAllMatches(getMatches());
      setMembers(getMembers());
      if (matchId) {
        // Re-fetch guests from the latest cache on every Firestore update
        setGuests(getGuestsByMatch(matchId));
      }
    });
  }, [matchId]);

  const match = useMemo(() => {
    if (!matchId) return null;
    return allMatches.find((m) => m.id === matchId) ?? null;
  }, [matchId, allMatches]);

  // All players = members + guests for this match
  const allPlayers = useMemo(() => {
    const list: { id: string; name: string; positions: Position[]; isGuest: boolean }[] = [];
    members.forEach((m) => list.push({ id: m.id, name: m.name, positions: m.positions ?? [], isGuest: false }));
    guests.forEach((g) => list.push({ id: g.id, name: g.name, positions: g.positions ?? [], isGuest: true }));
    return list;
  }, [members, guests]);

  // Past matches (done/voting with quarters)
  const pastMatches = useMemo(
    () => allMatches.filter((m) => (m.status === 'done' || m.status === 'voting') && m.quarters.length > 0),
    [allMatches]
  );

  // Scheduled matches for "no matchId" view
  const scheduledMatches = useMemo(
    () => allMatches.filter((m) => m.status === 'scheduled' || m.status === 'lineup' || m.status === 'playing'),
    [allMatches]
  );

  // Local state
  const [step, setStep] = useState<'select' | 'lineup'>(
    match && (match.status === 'lineup' || match.status === 'playing' || (match.status === 'done' && match.quarters?.length > 0) || (match.status === 'voting' && match.quarters?.length > 0)) ? 'lineup' : 'select'
  );
  const [formation, setFormation] = useState(match?.formation ?? '4-2-3-1');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    // Derive from existing quarters if available
    if (match?.quarters?.length) {
      const ids = new Set<string>();
      match.quarters.forEach((q) => {
        Object.values(q.playing).forEach((pid) => ids.add(pid));
        q.resting.forEach((pid) => ids.add(pid));
      });
      return ids;
    }
    // 참석 확인한 멤버 + 해당 매치 용병 자동 체크
    const ids = new Set<string>(match?.attendees || []);
    if (matchId) {
      getGuestsByMatch(matchId).forEach(g => ids.add(g.id));
    }
    return ids;
  });
  const [quarters, setQuarters] = useState<{ playing: Record<string, string>; resting: string[] }[]>(
    match?.quarters?.map((q) => ({ playing: q.playing, resting: q.resting })) ?? []
  );
  const [activeQuarter, setActiveQuarter] = useState(0);

  // ★ DB에서 match가 변경되면 로컬 state 자동 동기화
  useEffect(() => {
    if (!match) return;

    // quarters가 DB에 있으면 로컬에 반영
    if (match.quarters?.length > 0) {
      setQuarters(match.quarters.map(q => ({ playing: q.playing, resting: q.resting })));
      setStep('lineup');
      setFormation(match.formation || '4-2-3-1');

      // selectedIds도 quarters에서 추출
      const ids = new Set<string>();
      match.quarters.forEach(q => {
        Object.values(q.playing).forEach(pid => ids.add(pid));
        q.resting.forEach(pid => ids.add(pid));
      });
      setSelectedIds(ids);
    } else if (match.status === 'scheduled') {
      // 라인업이 없는 예정 매치 → select 단계
      setStep('select');
      setQuarters([]);
    }
  }, [match?.quarters?.length, match?.status, match?.formation]);

  // 용병이 늦게 로드되면 자동 체크에 추가
  useEffect(() => {
    if (step !== 'select' || !matchId) return;
    if (match?.quarters?.length) return;
    const guestsForMatch = getGuestsByMatch(matchId);
    if (guestsForMatch.length > 0) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        guestsForMatch.forEach(g => next.add(g.id));
        (match?.attendees || []).forEach(id => next.add(id));
        return next;
      });
    }
  }, [guests, match?.attendees, step, matchId]);

  // Tap-to-swap: track which player is currently selected (by their ID)
  const [swapSelectedId, setSwapSelectedId] = useState<string | null>(null);

  const status = match?.status ?? 'scheduled';

  // Player count info
  const selectedCount = selectedIds.size;
  const playingCount = Math.min(11, selectedCount);
  const restingCount = Math.max(0, selectedCount - 11);

  // Toggle player selection
  const togglePlayer = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => {
    if (selectedIds.size === allPlayers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allPlayers.map((p) => p.id)));
    }
  };

  // Generate lineup
  const handleGenerateLineup = async () => {
    if (!matchId) return;
    const ids = Array.from(selectedIds);
    const result = generateQuarterLineups(ids, formation);
    setQuarters(result);
    setActiveQuarter(0);
    setStep('lineup');

    const quarterLineups: QuarterLineup[] = result.map((q, i) => ({
      quarter: (i + 1) as 1 | 2 | 3 | 4,
      playing: q.playing,
      resting: q.resting,
    }));

    await updateMatch(matchId, {
      formation,
      quarters: quarterLineups,
      status: 'playing',
    });
  };

  // Reshuffle
  const handleReshuffle = async () => {
    if (!matchId) return;
    const ids = Array.from(selectedIds);
    const result = generateQuarterLineups(ids, formation);
    setQuarters(result);
    setSwapSelectedId(null);

    const quarterLineups: QuarterLineup[] = result.map((q, i) => ({
      quarter: (i + 1) as 1 | 2 | 3 | 4,
      playing: q.playing,
      resting: q.resting,
    }));

    await updateMatch(matchId, { quarters: quarterLineups });
  };

  // Perform swap between two players (one or both can be on pitch / resting)
  const performSwap = useCallback(
    async (playerAId: string, playerBId: string) => {
      if (!matchId) return;
      const qi = activeQuarter;
      const q = quarters[qi];
      if (!q) return;

      const newPlaying = { ...q.playing };
      const newResting = [...q.resting];

      // Find slots for A and B (null if resting)
      const slotA = Object.entries(newPlaying).find(([, pid]) => pid === playerAId)?.[0] ?? null;
      const slotB = Object.entries(newPlaying).find(([, pid]) => pid === playerBId)?.[0] ?? null;

      if (slotA && slotB) {
        // Both on pitch: swap their slots
        newPlaying[slotA] = playerBId;
        newPlaying[slotB] = playerAId;
      } else if (slotA && !slotB) {
        // A on pitch, B resting
        newPlaying[slotA] = playerBId;
        const restIdx = newResting.indexOf(playerBId);
        if (restIdx !== -1) newResting[restIdx] = playerAId;
      } else if (!slotA && slotB) {
        // A resting, B on pitch
        newPlaying[slotB] = playerAId;
        const restIdx = newResting.indexOf(playerAId);
        if (restIdx !== -1) newResting[restIdx] = playerBId;
      }
      // Both resting: swap in resting array (order swap, mostly no-op visually)

      const newQuarters = [...quarters];
      newQuarters[qi] = { playing: newPlaying, resting: newResting };
      setQuarters(newQuarters);

      // Persist
      const quarterLineups: QuarterLineup[] = newQuarters.map((qr, i) => ({
        quarter: (i + 1) as 1 | 2 | 3 | 4,
        playing: qr.playing,
        resting: qr.resting,
      }));
      await updateMatch(matchId, { quarters: quarterLineups });
    },
    [matchId, activeQuarter, quarters]
  );

  // Handle tap on any player (pitch or resting)
  const handlePlayerTap = useCallback(
    (playerId: string) => {
      if (swapSelectedId === null) {
        // Nothing selected yet: select this player
        setSwapSelectedId(playerId);
      } else if (swapSelectedId === playerId) {
        // Tapped same player: deselect
        setSwapSelectedId(null);
      } else {
        // Different player: perform swap
        performSwap(swapSelectedId, playerId);
        setSwapSelectedId(null);
      }
    },
    [swapSelectedId, performSwap]
  );

  const handleEndMatch = async () => {
    if (!matchId) return;
    await updateMatch(matchId, { status: 'voting' });
    navigate('/match');
  };

  const handleBackToSelect = async () => {
    if (!matchId) return;
    await updateMatch(matchId, {
      status: 'scheduled',
      quarters: [],
    });
    setStep('select');
    setQuarters([]);
    setSwapSelectedId(null);
  };

  // 현재 진행 중인 매치(lineup/playing)
  const activeLineupMatch = useMemo(
    () => allMatches.find(m => m.status === 'lineup' || m.status === 'playing'),
    [allMatches]
  );

  // ─── No matchId: show past lineups + scheduled matches ───
  if (!matchId || !match) {
    return (
      <div className="max-w-[480px] mx-auto">
        {/* Header */}
        <div className="bg-[#1e3a5f] text-white px-4 py-4">
          <h1 className="text-lg font-bold">라인업</h1>
        </div>

        {/* 진행 중인 매치 배너 */}
        {activeLineupMatch && (
          <div className="px-4 pt-4">
            <Link
              to={`/lineup?matchId=${activeLineupMatch.id}`}
              className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl p-3 hover:bg-green-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                <span className="text-sm font-bold text-green-800">{activeLineupMatch.title}</span>
                <span className="text-xs text-green-600">{activeLineupMatch.status === 'playing' ? 'LIVE' : '라인업'}</span>
              </div>
              <ChevronRight size={16} className="text-green-500" />
            </Link>
          </div>
        )}

        {/* Past lineups */}
        {pastMatches.length > 0 && (
          <div className="px-4 pt-4">
            <h2 className="text-sm font-bold text-gray-700 mb-2">지난 라인업</h2>
            <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-hide">
              {pastMatches.slice(0, 10).map((m) => (
                <PastLineupCard key={m.id} match={m} />
              ))}
            </div>
          </div>
        )}

        {/* Scheduled matches */}
        <div className="px-4 pt-4 pb-6">
          <h2 className="text-sm font-bold text-gray-700 mb-3">예정된 매치</h2>
          {scheduledMatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <ClipboardList size={48} className="text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-600 mb-1">예정된 매치가 없습니다</p>
              <p className="text-xs text-gray-400 mb-5 text-center">
                매치를 먼저 생성해주세요.
              </p>
              <Link
                to="/match"
                className="px-6 py-3 rounded-xl bg-[#1e3a5f] text-white font-bold text-sm hover:bg-[#162d4a] transition-colors"
              >
                매치 페이지로 이동
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {scheduledMatches.map((m) => (
                <div
                  key={m.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-gray-800 truncate">{m.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(m.date).toLocaleDateString('ko-KR')}
                        </span>
                        {m.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} />
                            {m.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      to={`/lineup?matchId=${m.id}`}
                      className="flex items-center gap-1 px-4 py-2 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition-colors shrink-0 ml-3"
                    >
                      {m.status === 'scheduled' ? '라인업 짜기' : '라인업 보기'}
                      <ChevronRight size={14} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Empty players ───
  if (allPlayers.length === 0) {
    return (
      <div className="max-w-[480px] mx-auto">
        <div className="bg-[#1e3a5f] text-white px-4 py-4">
          <h1 className="text-lg font-bold">라인업</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Users size={48} />
          <p className="mt-3 text-sm">등록된 멤버가 없습니다.</p>
          <p className="text-xs">먼저 멤버를 추가해주세요.</p>
        </div>
      </div>
    );
  }

  // ─── Step A: Player Selection + Formation ───
  if (step === 'select' && status === 'scheduled') {
    const minPlayers = 11;

    return (
      <div className="max-w-[480px] mx-auto">
        {/* Header */}
        <div className="bg-[#1e3a5f] text-white px-4 py-4">
          <h1 className="text-lg font-bold">{match.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-blue-200">
            <span className="flex items-center gap-1">
              <Calendar size={13} />
              {new Date(match.date).toLocaleDateString('ko-KR')}
            </span>
            {match.location && (
              <span className="flex items-center gap-1">
                <MapPin size={13} />
                {match.location}
              </span>
            )}
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Formation selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">포메이션</label>
            <div className="relative">
              <select
                value={formation}
                onChange={(e) => setFormation(e.target.value)}
                className="w-full appearance-none bg-white border border-gray-300 rounded-xl px-4 py-3 pr-10 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                {Object.keys(FORMATIONS).map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={18}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </div>

          {/* Selected count */}
          <div
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
              selectedCount >= minPlayers
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-gray-50 text-gray-600 border border-gray-200'
            }`}
          >
            <Users size={16} />
            <span>
              {selectedCount}명 선택
              {selectedCount >= minPlayers
                ? ` (${playingCount}명 출전, ${restingCount}명 휴식)`
                : ` (최소 ${minPlayers}명 필요)`}
            </span>
          </div>

          {/* Select all */}
          <button
            onClick={selectAll}
            className="text-sm text-green-600 font-medium hover:underline"
          >
            {selectedIds.size === allPlayers.length ? '전체 해제' : '전체 선택'}
          </button>

          {/* Player list */}
          <div className="space-y-2">
            {allPlayers.map((p) => {
              const checked = selectedIds.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlayer(p.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    checked ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors shrink-0 ${
                      checked ? 'bg-green-500 border-green-500' : 'border-gray-300'
                    }`}
                  >
                    {checked && <Check size={14} className="text-white" />}
                  </div>
                  <div className="flex items-center gap-1">
                    {p.positions.length > 0 ? (
                      p.positions.map((pos) => <PositionBadge key={pos} position={pos} />)
                    ) : (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">-</span>
                    )}
                  </div>
                  <span className="flex-1 text-left text-sm font-medium text-gray-800 truncate">
                    {p.name}
                    {p.isGuest && (
                      <span className="ml-1 text-[10px] text-orange-500 font-bold">(용병)</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Warning */}
          {selectedCount > 0 && selectedCount < minPlayers && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
              <AlertTriangle size={18} className="shrink-0" />
              <span className="text-sm">
                최소 {minPlayers}명 이상 선택해야 라인업을 편성할 수 있습니다.
              </span>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerateLineup}
            disabled={selectedCount < minPlayers}
            className="w-full py-3.5 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
          >
            라인업 생성 ({selectedCount}명)
          </button>
        </div>
      </div>
    );
  }

  // ─── Step B: Lineup View ───
  const currentQ = quarters[activeQuarter];
  const isPlaying = status === 'playing';

  // Count all players from quarters
  const totalPlayers = currentQ
    ? Object.values(currentQ.playing).length + currentQ.resting.length
    : 0;

  return (
    <div className="max-w-[480px] mx-auto">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{match.title}</h1>
            <p className="text-sm text-blue-200 mt-0.5">
              {formation} &middot; {totalPlayers}명 참가
            </p>
          </div>
          {isPlaying && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-sm font-semibold text-red-300">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Swap hint */}
      {swapSelectedId && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-medium text-blue-700">
            선수를 선택했습니다. 교체할 선수를 탭하세요.
          </span>
          <button
            onClick={() => setSwapSelectedId(null)}
            className="text-xs font-bold text-blue-500 hover:text-blue-700"
          >
            취소
          </button>
        </div>
      )}

      {/* Quarter tabs */}
      <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
        {[0, 1, 2, 3].map((qi) => {
          const restCount = quarters[qi]?.resting?.length ?? 0;
          return (
            <button
              key={qi}
              onClick={() => {
                setActiveQuarter(qi);
                setSwapSelectedId(null);
              }}
              className={`flex-1 py-3 text-sm font-bold transition-colors relative ${
                activeQuarter === qi
                  ? 'text-green-600 border-b-2 border-green-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {qi + 1}Q
              {restCount > 0 && (
                <span className="ml-1 text-[10px] text-gray-400 font-normal">
                  ({restCount}휴식)
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Pitch */}
      <div className="px-3 pt-4 pb-2">
        {currentQ && (
          <FootballPitch
            lineup={currentQ.playing}
            formation={formation}
            selectedPlayerId={swapSelectedId}
            onPlayerTap={(_slotId, playerId) => handlePlayerTap(playerId)}
          />
        )}
      </div>

      {/* Resting players */}
      {currentQ && currentQ.resting.length > 0 && (
        <div className="px-4 pb-3">
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Coffee size={16} className="text-gray-500" />
              <span className="text-sm font-bold text-gray-700">
                휴식 ({currentQ.resting.length}명)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentQ.resting.map((playerId) => {
                const info = getPlayerInfo(playerId);
                if (!info) return null;
                const isSelected = playerId === swapSelectedId;
                return (
                  <button
                    key={playerId}
                    onClick={() => handlePlayerTap(playerId)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border shadow-sm transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400'
                        : 'bg-white border-gray-200 hover:border-green-400 hover:bg-green-50'
                    }`}
                  >
                    {info.positions.length > 0 ? (
                      <PositionBadge position={info.positions[0]} />
                    ) : (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">-</span>
                    )}
                    <span className="text-xs font-medium text-gray-700">
                      {info.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 쿼터별 출전 현황 */}
      {quarters.length === 4 && (
        <div className="px-4 pb-3">
          <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
              <Users size={14} className="text-[#1e3a5f]" />
              출전 현황
            </h3>
            <div className="space-y-1.5">
              {(() => {
                // 선수별 출전 쿼터 계산
                const allIds = new Set<string>();
                quarters.forEach(q => {
                  Object.values(q.playing).forEach(id => allIds.add(id));
                  q.resting.forEach(id => allIds.add(id));
                });
                const counts: { id: string; name: string; count: number; qs: number[] }[] = [];
                allIds.forEach(id => {
                  const info = getPlayerInfo(id);
                  if (!info) return;
                  const qs: number[] = [];
                  quarters.forEach((q, qi) => {
                    if (Object.values(q.playing).includes(id)) qs.push(qi + 1);
                  });
                  counts.push({ id, name: info.name, count: qs.length, qs });
                });
                counts.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
                return counts.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-800 w-16 truncate">{p.name}</span>
                    <div className="flex gap-1 flex-1">
                      {[1, 2, 3, 4].map(q => (
                        <div
                          key={q}
                          className={`w-7 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                            p.qs.includes(q)
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-100 text-gray-300'
                          }`}
                        >
                          {q}Q
                        </div>
                      ))}
                    </div>
                    <span className={`text-[11px] font-bold min-w-[32px] text-right ${
                      p.count >= 3 ? 'text-green-600' : p.count >= 2 ? 'text-blue-600' : 'text-red-500'
                    }`}>
                      {p.count}쿼터
                    </span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 pb-6 space-y-3">
        {!isPlaying && (
          <>
            <button
              onClick={handleReshuffle}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-colors text-sm"
            >
              <Shuffle size={18} />
              다시 섞기
            </button>

            <p className="text-center text-[10px] text-gray-400">
              💡 선수를 탭하고 다른 선수를 탭하면 자유롭게 교체됩니다
            </p>
            <button
              onClick={handleBackToSelect}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <Edit3 size={14} />
              멤버 다시 선택
            </button>
          </>
        )}

        {/* 경기 취소 (라인업 상태에서 → 다시 scheduled로) */}
        {!isPlaying && (
          <button
            onClick={async () => {
              if (!matchId) return;
              if (!confirm('경기를 취소하고 다시 라인업을 짜시겠습니까?')) return;
              await updateMatch(matchId, { status: 'scheduled', quarters: [] });
              setStep('select');
              setQuarters([]);
            }}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-red-400 hover:text-red-600 transition-colors"
          >
            <X size={14} />
            경기 취소
          </button>
        )}

        {isPlaying && (
          <>
            <button
              onClick={handleEndMatch}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors text-sm"
            >
              <Square size={16} className="fill-current" />
              경기 종료
            </button>
            <button
              onClick={async () => {
                if (!matchId) return;
                if (!confirm('경기를 취소하고 다시 라인업을 짜시겠습니까?')) return;
                await updateMatch(matchId, { status: 'scheduled', quarters: [] });
                setStep('select');
                setQuarters([]);
              }}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={14} />
              경기 취소
            </button>
          </>
        )}
      </div>
    </div>
  );
}
