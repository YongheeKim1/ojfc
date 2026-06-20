import { useState, useEffect } from 'react';
import { Trophy, Users, Calendar, Star, Plus, Swords, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getMembers, getMatches, getCurrentUser, subscribe, getGuestsByMatch, updateMatch } from '../lib/store';
import { getPositionColor } from '../lib/types';
import type { Member, Match } from '../lib/types';

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

  useEffect(() => {
    setMembers(getMembers());
    setMatches(getMatches());
    setCurrentUser(getCurrentUser());
    return subscribe(() => {
      setMembers(getMembers());
      setMatches(getMatches());
      setCurrentUser(getCurrentUser());
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

  const latestMatch = matches.length > 0 ? matches[0] : null;

  const pomRanking = [...members]
    .filter(m => m.pomCount > 0)
    .sort((a, b) => b.pomCount - a.pomCount)
    .slice(0, 5);

  const getMemberName = (id: string) =>
    members.find(m => m.id === id)?.name ?? '알 수 없음';

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const now = new Date();
  const thisMonthMatches = matches.filter(m => {
    const d = new Date(m.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

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

        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
            <div className="w-9 h-9 mx-auto mb-2 bg-blue-50 rounded-xl flex items-center justify-center">
              <Users className="w-4.5 h-4.5 text-[#1e3a5f]" />
            </div>
            <p className="text-xl font-bold text-gray-800">{members.length}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">총 멤버</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
            <div className="w-9 h-9 mx-auto mb-2 bg-green-50 rounded-xl flex items-center justify-center">
              <Swords className="w-4.5 h-4.5 text-[#16a34a]" />
            </div>
            <p className="text-xl font-bold text-gray-800">{matches.length}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">총 매치</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
            <div className="w-9 h-9 mx-auto mb-2 bg-yellow-50 rounded-xl flex items-center justify-center">
              <Calendar className="w-4.5 h-4.5 text-yellow-600" />
            </div>
            <p className="text-xl font-bold text-gray-800">{thisMonthMatches.length}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">이번 달 매치</p>
          </div>
        </div>

        {/* Latest match */}
        {latestMatch ? (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-[#1e3a5f]" />
              <h2 className="text-sm font-bold text-gray-700">최근 매치</h2>
              <span className="ml-auto text-xs text-gray-400">{formatDate(latestMatch.date)}</span>
            </div>
            <div className="flex items-center justify-center bg-gradient-to-r from-blue-50 to-green-50 rounded-xl p-4 gap-4">
              <div className="text-center flex-1">
                <p className="text-xs text-[#1e3a5f] font-bold mb-1">A팀</p>
                <p className="text-3xl font-extrabold text-[#1e3a5f]">{latestMatch.scoreA}</p>
              </div>
              <div className="px-3">
                <span className="text-sm font-bold text-gray-400">VS</span>
              </div>
              <div className="text-center flex-1">
                <p className="text-xs text-[#16a34a] font-bold mb-1">B팀</p>
                <p className="text-3xl font-extrabold text-[#16a34a]">{latestMatch.scoreB}</p>
              </div>
            </div>
            {latestMatch.pomId && (
              <div className="mt-3 flex items-center gap-2 text-sm bg-yellow-50 rounded-lg px-3 py-2">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <span className="text-gray-500">POM:</span>
                <span className="font-bold text-gray-700">{getMemberName(latestMatch.pomId)}</span>
              </div>
            )}
            <div className="mt-2">
              <span
                className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
                  latestMatch.status === 'done'
                    ? 'bg-gray-100 text-gray-500'
                    : latestMatch.status === 'playing'
                      ? 'bg-green-100 text-green-700'
                      : latestMatch.status === 'voting'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-blue-100 text-blue-700'
                }`}
              >
                {latestMatch.status === 'done'
                  ? '종료'
                  : latestMatch.status === 'playing'
                    ? '경기 중'
                    : latestMatch.status === 'voting'
                      ? '투표 중'
                      : '라인업'}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-3 bg-gray-50 rounded-full flex items-center justify-center">
              <Swords className="w-7 h-7 text-gray-300" />
            </div>
            <h2 className="text-base font-bold text-gray-700 mb-1">아직 매치가 없습니다</h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              첫 번째 매치를 만들어보세요!
            </p>
          </div>
        )}

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

        {/* Latest match link */}
        {latestMatch && latestMatch.status !== 'done' && (
          <Link
            to={`/match`}
            className="block w-full bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-800 rounded-2xl shadow-sm p-4 text-center transition-colors border border-gray-200"
          >
            <div className="flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4 text-[#1e3a5f]" />
              <span className="text-sm font-semibold">진행 중인 매치 보기</span>
            </div>
          </Link>
        )}

        {/* Quick action */}
        <Link
          to="/match"
          className="block w-full bg-[#16a34a] hover:bg-green-600 active:bg-green-700 text-white rounded-2xl shadow-sm p-4 text-center transition-colors"
        >
          <div className="flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" />
            <span className="text-sm font-bold">새 매치 만들기</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
