import { useState, useEffect } from 'react';
import { Trophy, Goal, Shield, Star, Mail, Users as UsersIcon, LayoutGrid } from 'lucide-react';
import {
  getCurrentUser, getMembers, getMatches, getGuests, getFeedbacksForMember, subscribe,
} from '../lib/store';
import { computePlayerStats, playerName, isPairReliable } from '../lib/stats';
import type { Member, Match } from '../lib/types';
import { getPositionColor } from '../lib/types';

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// 출전 경기 수 (어느 쿼터든 필드에 있었던 매치)
function countGames(memberId: string, matches: Match[]): number {
  let n = 0;
  for (const m of matches) {
    if (!['done', 'voting', 'playing'].includes(m.status)) continue;
    const played = (m.quarters || []).some(q => Object.values(q.playing || {}).includes(memberId));
    if (played) n++;
  }
  return n;
}

// 골 수
function countGoals(memberId: string, matches: Match[]): number {
  let n = 0;
  for (const m of matches) n += (m.goals || []).filter(g => g.playerId === memberId).length;
  return n;
}

// 무실점 쿼터: 쿼터 결과가 입력돼 있고(them===0) 그 쿼터에 필드에 있었던 경우
function countCleanQuarters(memberId: string, matches: Match[]): number {
  let n = 0;
  for (const m of matches) {
    for (const r of (m.quarterResults || [])) {
      if (typeof r.them !== 'number' || r.them !== 0) continue;
      const q = (m.quarters || [])[r.quarter - 1];
      if (q && Object.values(q.playing || {}).includes(memberId)) n++;
    }
  }
  return n;
}

export default function MyPage() {
  const [me, setMe] = useState<Member | null>(getCurrentUser());
  const [matches, setMatches] = useState<Match[]>(getMatches());
  const [members, setMembers] = useState<Member[]>(getMembers());

  useEffect(() => {
    return subscribe(() => {
      setMatches(getMatches());
      setMembers(getMembers());
      setMe(getCurrentUser());
    });
  }, []);

  if (!me) return null;
  // 최신 멤버 정보 (pomCount 등은 캐시가 최신)
  const latest = members.find(m => m.id === me.id) ?? me;
  const guests = getGuests();

  const stats = computePlayerStats(me.id, matches);
  const games = countGames(me.id, matches);
  const goals = countGoals(me.id, matches);
  const cleanQ = countCleanQuarters(me.id, matches);
  const myFeedbacks = getFeedbacksForMember(me.id);
  const topPairs = stats.pairs.filter(isPairReliable).slice(0, 5);
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  const isApprox = stats.exactQuarters === 0 && stats.totalPlayed > 0;

  const cards = [
    { label: '출전 경기', value: games, icon: LayoutGrid, color: 'text-blue-600 bg-blue-50' },
    { label: '출전 쿼터', value: stats.totalPlayed, icon: LayoutGrid, color: 'text-indigo-600 bg-indigo-50' },
    { label: '골', value: goals, icon: Goal, color: 'text-green-600 bg-green-50' },
    { label: 'POM', value: latest.pomCount || 0, icon: Trophy, color: 'text-yellow-600 bg-yellow-50' },
    { label: '무실점 쿼터', value: cleanQ, icon: Shield, color: 'text-teal-600 bg-teal-50' },
    { label: '승률', value: stats.totalPlayed ? pct(stats.overallRate) : '-', icon: Star, color: 'text-rose-600 bg-rose-50' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] text-white px-5 pt-10 pb-7 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center text-xl font-extrabold">
            {latest.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{latest.name}</h1>
            {latest.createdAt && (
              <p className="text-[11px] text-blue-200 mt-0.5">{formatDateTime(latest.createdAt)} 가입</p>
            )}
            <div className="flex flex-wrap gap-1 mt-1">
              {(latest.positions ?? []).map(pos => (
                <span key={pos} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getPositionColor(pos)}`}>{pos}</span>
              ))}
              {latest.role === 'coach' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">감독</span>
              )}
              {latest.role === 'admin' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">운영진</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-2.5">
          {cards.map(c => (
            <div key={c.label} className="bg-white rounded-2xl shadow-sm p-3 text-center">
              <div className={`w-8 h-8 mx-auto mb-1.5 rounded-xl flex items-center justify-center ${c.color}`}>
                <c.icon size={15} />
              </div>
              <p className="text-lg font-bold text-gray-800 leading-none">{c.value}</p>
              <p className="text-[10px] text-gray-400 mt-1">{c.label}</p>
            </div>
          ))}
        </div>

        {isApprox && (
          <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            쿼터별 결과가 없어 매치 최종 결과 기반 추정치입니다.
          </p>
        )}

        {/* 자리별 승률 */}
        {stats.bySlot.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <h2 className="text-sm font-bold text-gray-700 mb-3">자리별 승률</h2>
            <div className="space-y-1.5">
              {stats.bySlot.map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-700 w-9">{s.label}</span>
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.round(s.rate * 100)}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500 w-8 text-right">{pct(s.rate)}</span>
                  <span className="text-[9px] text-gray-400 w-12 text-right">{s.played}쿼터</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 나와 잘 맞는 동료 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
            <UsersIcon size={15} className="text-blue-500" /> 나와 잘 맞는 동료
          </h2>
          <p className="text-[9px] text-gray-400 mb-2.5">가까운 포지션에서 5쿼터 이상 함께 뛴 동료 기준</p>
          {topPairs.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">아직 표본이 부족합니다. 경기가 쌓이면 나타나요!</p>
          ) : (
            <div className="space-y-1.5">
              {topPairs.map((p, i) => (
                <div key={p.partnerId} className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    i === 0 ? 'bg-yellow-400 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>{i + 1}</span>
                  <span className="text-sm font-semibold text-gray-800 flex-1">{playerName(p.partnerId, members, guests)}</span>
                  <span className="text-xs font-bold text-green-600">{pct(p.rate)}</span>
                  <span className="text-[10px] text-gray-400">({p.played}쿼터)</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 감독의 평가 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-2.5 flex items-center gap-1.5">
            <Mail size={15} className="text-purple-500" /> 감독의 평가
            {myFeedbacks.length > 0 && (
              <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold">{myFeedbacks.length}</span>
            )}
          </h2>
          {myFeedbacks.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">아직 받은 평가가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {myFeedbacks.map(f => (
                <div key={f.id} className="bg-gray-50 rounded-xl p-3 border-l-4 border-purple-300">
                  {f.matchTitle && (
                    <span className="inline-block text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold mb-1">{f.matchTitle}</span>
                  )}
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{f.content}</p>
                  <p className="text-[10px] text-gray-400 mt-1.5">감독 {f.authorName} · {formatDateTime(f.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
