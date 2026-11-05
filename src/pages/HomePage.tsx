import { useState, useEffect } from 'react';
import { Trophy, Star, Check, Megaphone, Images, ChevronRight, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getMembers, getMatches, getCurrentUser, subscribe, getGuestsByMatch, updateMatch, getAnnouncements } from '../lib/store';
import { getPositionColor } from '../lib/types';
import type { Member, Match, Photo } from '../lib/types';
import { fetchRecentPhotos } from '../lib/photos';
import { computePlayerStats } from '../lib/stats';

// 매치 라인업에 출전한 선수 ID 추출 (POM 투표 후보)
function getMatchPlayerIds(match: Match): string[] {
  const ids = new Set<string>();
  for (const q of (match.quarters || [])) {
    for (const pid of Object.values(q.playing || {})) {
      if (pid) ids.add(pid);
    }
    for (const rid of (q.resting || [])) {
      if (rid) ids.add(rid);
    }
  }
  return Array.from(ids);
}

export default function HomePage() {
  const [members, setMembers] = useState<Member[]>(getMembers());
  const [matches, setMatches] = useState<Match[]>(getMatches());
  const [currentUser, setCurrentUser] = useState<Member | null>(null);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [latestAnn, setLatestAnn] = useState(getAnnouncements()[0] ?? null);

  useEffect(() => {
    setMembers(getMembers());
    setMatches(getMatches());
    setCurrentUser(getCurrentUser());
    setLatestAnn(getAnnouncements()[0] ?? null);
    return subscribe(() => {
      setMembers(getMembers());
      setMatches(getMatches());
      setCurrentUser(getCurrentUser());
      setLatestAnn(getAnnouncements()[0] ?? null);
    });
  }, []);

  // 투표 중인 매치 (가장 최근 1건)
  const votingMatch = matches.find(m => m.status === 'voting') || null;
  const hasVoted = !!(votingMatch && currentUser && votingMatch.votes?.[currentUser.id]);
  const myVoteId = votingMatch && currentUser ? votingMatch.votes?.[currentUser.id] : null;

  // 투표 후보 (라인업에 출전한 선수)
  const votablePlayers = (() => {
    if (!votingMatch) return [];
    const ids = getMatchPlayerIds(votingMatch);
    const guests = getGuestsByMatch(votingMatch.id);
    const list: { id: string; name: string }[] = [];
    for (const pid of ids) {
      const member = members.find(m => m.id === pid);
      if (member) { list.push({ id: pid, name: member.name }); continue; }
      const guest = guests.find(g => g.id === pid);
      if (guest) { list.push({ id: pid, name: guest.name + ' (용병)' }); }
    }
    return list;
  })();

  const handleVoteSubmit = async () => {
    if (!votingMatch || !currentUser || !selectedVote || voteSubmitting) return;
    if (selectedVote === currentUser.id) {
      alert('자기 자신한테는 투표할 수 없습니다');
      return;
    }
    setVoteSubmitting(true);
    const newVotes = { ...votingMatch.votes, [currentUser.id]: selectedVote };
    const newVoters = votingMatch.voters.includes(currentUser.id)
      ? votingMatch.voters
      : [...votingMatch.voters, currentUser.id];
    await updateMatch(votingMatch.id, { votes: newVotes, voters: newVoters });
    setSelectedVote(null);
    setVoteSubmitting(false);
  };

  // 사진첩 미리보기 — 최신 몇 장의 썸네일만 받아옵니다 (원본은 사진첩에서)
  const [recentPhotos, setRecentPhotos] = useState<Photo[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRecentPhotos(4)
      .then(list => { if (alive) setRecentPhotos(list); })
      .catch(() => { if (alive) setRecentPhotos([]); });
    return () => { alive = false; };
  }, []);

  // 내 페이지 미리보기 — 출전/골/POM/승률 요약
  const mySummary = (() => {
    if (!currentUser) return null;
    const latest = members.find(m => m.id === currentUser.id) ?? currentUser;
    const stats = computePlayerStats(currentUser.id, matches);
    const games = matches.filter(m =>
      ['done', 'voting', 'playing'].includes(m.status) &&
      (m.quarters || []).some(q => Object.values(q.playing || {}).includes(currentUser.id))
    ).length;
    const goals = matches.reduce(
      (n, m) => n + (m.goals || []).filter(g => g.playerId === currentUser.id).length, 0
    );
    return {
      name: latest.name,
      stats: [
        { label: '출전', value: games },
        { label: '골', value: goals },
        { label: 'POM', value: latest.pomCount || 0 },
        { label: '승률', value: stats.totalPlayed ? `${Math.round(stats.overallRate * 100)}%` : '-' },
      ],
    };
  })();

  const pomRanking = [...members]
    .filter(m => m.pomCount > 0)
    .sort((a, b) => b.pomCount - a.pomCount)
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] text-white px-5 pt-8 pb-7 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <img src={import.meta.env.BASE_URL + 'logo.png'} alt="AUZI F.C." className="w-12 h-12" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">오지FC</h1>
            <p className="text-blue-200 text-xs">AUZI F.C.</p>
          </div>
        </div>
        {currentUser && (
          <p className="text-blue-200 text-sm mt-3">
            안녕하세요, <span className="text-white font-semibold">{currentUser.name}</span>님!
          </p>
        )}
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* 감독의 한마디 (최신 공지) */}
        {latestAnn && (
          <Link to="/coach" className="block bg-white rounded-2xl shadow-sm p-4 border-l-4 border-[#16a34a] active:bg-gray-50 transition-colors">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Megaphone size={14} className="text-[#16a34a]" />
              <span className="text-xs font-bold text-[#16a34a]">감독의 한마디</span>
              <span className="ml-auto text-[10px] text-gray-400">더보기 ›</span>
            </div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed line-clamp-3">{latestAnn.content}</p>
            <p className="text-[11px] text-gray-400 mt-2">감독 {latestAnn.authorName}</p>
          </Link>
        )}

        {/* POM 투표 카드 (voting 상태 매치) */}
        {votingMatch && currentUser && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border-2 border-yellow-200">
            <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white px-4 py-3 flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              <p className="text-sm font-bold flex-1">POM 투표 진행 중</p>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-semibold">{votingMatch.title}</span>
            </div>

            <div className="p-4">
              {votablePlayers.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">라인업에 배치된 선수가 없습니다.</p>
              ) : hasVoted ? (
                <div className="text-center py-3">
                  <div className="w-12 h-12 mx-auto mb-2 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-sm font-bold text-gray-700">투표 완료!</p>
                  <p className="text-xs text-gray-500 mt-1">
                    내가 선택한 MVP:{' '}
                    <span className="font-semibold text-yellow-600">
                      {votablePlayers.find(p => p.id === myVoteId)?.name || '?'}
                    </span>
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-3 text-center">이번 경기의 MVP를 선택하세요!</p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {votablePlayers.map(player => {
                      const isSelected = selectedVote === player.id;
                      const isSelf = player.id === currentUser?.id;
                      return (
                        <button
                          key={player.id}
                          onClick={() => {
                            if (isSelf) {
                              alert('자기 자신한테는 투표할 수 없습니다');
                              return;
                            }
                            setSelectedVote(player.id);
                          }}
                          className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                            isSelf
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                              : isSelected
                                ? 'bg-yellow-500 text-white shadow-md'
                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          {player.name}{isSelf && ' (나)'}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={handleVoteSubmit}
                    disabled={!selectedVote || voteSubmitting}
                    className="w-full py-2.5 bg-yellow-500 text-white rounded-xl text-sm font-bold hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Trophy className="w-4 h-4" />
                    투표하기
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* 내 페이지 미리보기 — 한 줄 요약, 누르면 내 페이지로 */}
        {mySummary && (
          <Link
            to="/me"
            className="block bg-white rounded-2xl shadow-sm p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#1e3a5f] text-white font-bold flex items-center justify-center shrink-0">
                {mySummary.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-800 truncate">{mySummary.name}</p>
                <p className="text-[11px] text-gray-400">내 기록 보기</p>
              </div>
              <div className="flex items-center gap-3.5 shrink-0">
                {mySummary.stats.map(st => (
                  <div key={st.label} className="text-center">
                    <p className="text-base font-extrabold text-gray-800 leading-none">{st.value}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{st.label}</p>
                  </div>
                ))}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            </div>
          </Link>
        )}

        {/* 사진첩 미리보기 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Images className="w-4 h-4 text-[#1e3a5f]" />
            <h2 className="text-sm font-bold text-gray-700">오지FC 사진첩</h2>
            <Link to="/photos" className="ml-auto text-xs text-gray-400 flex items-center gap-0.5 hover:text-gray-600">
              더보기 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {recentPhotos === null ? (
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 1, 2, 3].map(i => <div key={i} className="aspect-square rounded-lg bg-gray-100 animate-pulse" />)}
            </div>
          ) : recentPhotos.length === 0 ? (
            <Link to="/photos" className="block text-center py-6">
              <Images className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">아직 사진이 없습니다 · 첫 사진을 올려보세요</p>
            </Link>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {recentPhotos.slice(0, 4).map(photo => (
                <Link
                  key={photo.id}
                  to="/photos"
                  className="relative aspect-square rounded-lg overflow-hidden bg-gray-100"
                >
                  <img src={photo.thumb} alt={photo.caption || ''} className="w-full h-full object-cover" />
                  {!!photo.commentCount && (
                    <span className="absolute bottom-1 right-1 flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-black/55 text-white text-[9px] font-bold">
                      <MessageCircle className="w-2.5 h-2.5" /> {photo.commentCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* POM Ranking */}
        {pomRanking.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <h2 className="text-sm font-bold text-gray-700">POM 랭킹 TOP 5</h2>
            </div>
            <div className="space-y-3">
              {pomRanking.map((member, idx) => {
                const positions = member.positions ?? [];
                return (
                  <div key={member.id} className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0
                          ? 'bg-yellow-400 text-white'
                          : idx === 1
                            ? 'bg-gray-300 text-white'
                            : idx === 2
                              ? 'bg-amber-600 text-white'
                              : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">{member.name}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {positions.map(pos => (
                          <span
                            key={pos}
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${getPositionColor(pos)}`}
                          >
                            {pos}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                      <span className="text-sm font-bold text-gray-700">{member.pomCount}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
