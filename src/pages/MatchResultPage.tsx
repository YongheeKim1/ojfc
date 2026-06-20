import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy,
  Check,
  Calendar,
  MapPin,
  ChevronDown,
  ChevronUp,
  Plus,
  Eye,
  LayoutGrid,
  Play,
  Clock,
  Trash2,
  Goal,
  X,
  Share2,
} from 'lucide-react';
import { Match, Member, Guest, Position, GoalRecord, getPositionColor } from '../lib/types';
import {
  getMatches,
  updateMatch,
  updateMember,
  deleteMatch,
  getMembers,
  getCurrentUser,
  saveMatch,
  getGuestsByMatch,
  subscribe,
  toggleAttendance,
  isAdmin,
} from '../lib/store';

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateInput(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMemberById(members: Member[], id: string): Member | undefined {
  return members.find((m) => m.id === id);
}

function getVoteCounts(votes: Record<string, string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const votedFor of Object.values(votes)) {
    counts[votedFor] = (counts[votedFor] || 0) + 1;
  }
  return counts;
}

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

function getPlayerInfo(
  members: Member[],
  guests: Guest[],
  pid: string
): { name: string; positions: Position[] } | null {
  const member = members.find((m) => m.id === pid);
  if (member) return { name: member.name, positions: member.positions };
  const guest = guests.find((g) => g.id === pid);
  if (guest) return { name: guest.name + ' (용병)', positions: guest.positions };
  return null;
}

type StatusKey = Match['status'];

const STATUS_CONFIG: Record<StatusKey, { label: string; color: string }> = {
  scheduled: { label: '예정', color: 'bg-gray-100 text-gray-600' },
  lineup: { label: '라인업', color: 'bg-blue-100 text-blue-700' },
  playing: { label: '경기중', color: 'bg-green-100 text-green-700' },
  voting: { label: '투표중', color: 'bg-yellow-100 text-yellow-700' },
  done: { label: '종료', color: 'bg-gray-100 text-gray-500' },
};

export default function MatchResultPage() {
  const navigate = useNavigate();
  const admin = isAdmin();
  const [matches, setMatches] = useState<Match[]>(getMatches());
  const [members, setMembers] = useState<Member[]>(getMembers());
  const currentUser = getCurrentUser();

  useEffect(() => {
    return subscribe(() => {
      setMatches(getMatches());
      setMembers(getMembers());
    });
  }, []);

  // 24시간 후 자동 확정
  useEffect(() => {
    const autoFinalize = async () => {
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      for (const match of matches) {
        if (match.status !== 'voting') continue;
        // match.date 기준 24시간 경과 확인
        const elapsed = now - (match.votingStartedAt || match.date);
        if (elapsed < ONE_DAY) continue;

        // POM 계산
        const voteCounts = getVoteCounts(match.votes);
        let pomId: string | null = null;
        let maxVotes = 0;
        for (const [id, count] of Object.entries(voteCounts)) {
          if (count > maxVotes) { maxVotes = count; pomId = id; }
        }
        if (pomId) {
          const member = members.find(m => m.id === pomId);
          if (member) {
            await updateMember(pomId, { pomCount: (member.pomCount || 0) + 1 });
          }
        }
        await updateMatch(match.id, { pomId, status: 'done' });
      }
    };
    autoFinalize();
  }, [matches.length]);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(formatDateInput(Date.now()));
  const [newLocation, setNewLocation] = useState('');
  const [newOpponent, setNewOpponent] = useState('');

  // Voting/score state
  const [activeVotingId, setActiveVotingId] = useState<string | null>(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [opponentName, setOpponentName] = useState('');
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [voteSaved, setVoteSaved] = useState(false);
  const [goals, setGoals] = useState<GoalRecord[]>([]);

  // Expanded history card
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Categorize matches
  const activeMatches = matches.filter(
    (m) => m.status === 'scheduled' || m.status === 'lineup' || m.status === 'playing' || m.status === 'voting'
  );
  const doneMatches = matches.filter((m) => m.status === 'done');

  const handleCreateMatch = async () => {
    if (!admin || !newTitle.trim() || !newLocation.trim()) return;
    await saveMatch({
      title: newTitle.trim(),
      date: new Date(newDate).getTime(),
      location: newLocation.trim(),
      formation: '4-3-3',
      quarters: [],
      scoreA: 0,
      scoreB: 0,
      opponentName: newOpponent.trim(),
      goals: [],
      pomId: null,
      voters: [],
      votes: {},
      attendees: [],
      status: 'scheduled',
    });
    setNewTitle('');
    setNewDate(formatDateInput(Date.now()));
    setNewLocation('');
    setNewOpponent('');
    setShowCreateForm(false);
  };

  const handleShareAttend = async (m: Match) => {
    const url = window.location.origin + import.meta.env.BASE_URL + `#/attend?matchId=${m.id}`;
    const dateStr = new Date(m.date).toLocaleDateString('ko-KR');
    const headline = `${m.title} 참석 투표`;
    const text = `${headline}\n\n${dateStr}\n${m.location || '-'}\n\n링크 누르고 본인 이름 옆에 참/불/미정 선택하세요`;

    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      alert('참석 투표 링크가 복사되었습니다. 카톡에 붙여넣기 하세요!');
    } catch {
      prompt('아래 내용을 복사해서 카톡에 붙여넣기 하세요:', `${text}\n\n${url}`);
    }
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!admin) return;
    if (!confirm('정말 이 매치를 삭제하시겠습니까?')) return;
    await deleteMatch(matchId);
    if (activeVotingId === matchId) setActiveVotingId(null);
  };

  // Voting helpers
  const openVoting = (match: Match) => {
    setActiveVotingId(match.id);
    setScoreA(match.scoreA);
    setScoreB(match.scoreB);
    setOpponentName(match.opponentName || '');
    setGoals(match.goals || []);
    setSelectedVote(null);
    setVoteSaved(false);
    if (currentUser && match.votes[currentUser.id]) {
      setSelectedVote(match.votes[currentUser.id]);
      setVoteSaved(true);
    }
  };

  const handleEndGame = async (matchId: string) => {
    if (!admin) return;
    await updateMatch(matchId, { status: 'voting', votingStartedAt: Date.now() });
    const m = getMatches().find((x) => x.id === matchId);
    if (m) openVoting(m);
  };

  const handleVote = async () => {
    if (!activeVotingId || !currentUser || !selectedVote) return;
    if (selectedVote === currentUser.id) {
      alert('자기 자신한테는 투표할 수 없습니다');
      return;
    }
    const match = matches.find((m) => m.id === activeVotingId);
    if (!match) return;
    const newVotes = { ...match.votes, [currentUser.id]: selectedVote };
    const newVoters = match.voters.includes(currentUser.id)
      ? match.voters
      : [...match.voters, currentUser.id];
    await updateMatch(activeVotingId, { votes: newVotes, voters: newVoters });
    setVoteSaved(true);
  };

  const handleSaveScore = async () => {
    if (!admin || !activeVotingId) return;
    await updateMatch(activeVotingId, { scoreA, scoreB, opponentName, goals });
  };

  const [goalQuarter, setGoalQuarter] = useState(1);

  const handleAddGoal = (playerId: string) => {
    if (!admin) return;
    setGoals(prev => [...prev, { playerId, quarter: goalQuarter }]);
  };

  const handleRemoveGoal = (index: number) => {
    if (!admin) return;
    setGoals(prev => prev.filter((_, i) => i !== index));
  };

  const getVotablePlayers = (match: Match): { id: string; name: string; positions: Position[] }[] => {
    const playerIds = getMatchPlayerIds(match);
    const guests = getGuestsByMatch(match.id);
    const result: { id: string; name: string; positions: Position[] }[] = [];
    for (const pid of playerIds) {
      const info = getPlayerInfo(members, guests, pid);
      if (info) result.push({ id: pid, name: info.name, positions: info.positions });
    }
    return result;
  };

  const getTeamName = (match: Match, team: 'A' | 'B') => {
    if (team === 'A') return '오지FC';
    return (match.opponentName || '').trim() || '상대팀';
  };

  const votingMatch = activeVotingId ? matches.find((m) => m.id === activeVotingId) : null;
  const voteCounts = votingMatch ? getVoteCounts(votingMatch.votes) : {};
  const totalVotesForVoting = Object.values(voteCounts).reduce((a, b) => a + b, 0);
  const votablePlayers = votingMatch ? getVotablePlayers(votingMatch) : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#1e3a5f] to-[#15304f] text-white px-5 py-6">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy size={22} />
          매치
        </h1>
        <p className="text-sm text-blue-200 mt-1">매치 일정을 만들고 관리하세요</p>
      </div>

      <div className="p-4 space-y-5">
        {/* Create New Match (admin only) */}
        {admin && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="w-full flex items-center justify-between px-5 py-4"
          >
            <div className="flex items-center gap-2">
              <Plus size={18} className="text-[#16a34a]" />
              <span className="text-sm font-bold text-gray-800">새 매치 만들기</span>
            </div>
            {showCreateForm ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </button>

          {showCreateForm && (
            <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">제목</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="예: 3월 4주차 정기전"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">날짜</label>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">장소</label>
                <input type="text" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="예: 양재천 축구장"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">상대팀 이름 (선택)</label>
                <input type="text" value={newOpponent} onChange={(e) => setNewOpponent(e.target.value)} placeholder="미입력 시 '상대팀'"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" />
              </div>
              <button onClick={handleCreateMatch} disabled={!newTitle.trim() || !newLocation.trim()}
                className="w-full py-3 bg-[#16a34a] text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                <Plus size={16} /> 매치 생성
              </button>
            </div>
          )}
        </div>
        )}

        {/* Active Matches */}
        {activeMatches.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <Clock size={15} className="text-[#1e3a5f]" /> 진행 중인 매치
            </h2>
            <div className="space-y-3">
              {activeMatches.map((match) => {
                const statusCfg = STATUS_CONFIG[match.status];
                const isVotingOpen = activeVotingId === match.id && match.status === 'voting';

                return (
                  <div key={match.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 truncate">{match.title}</h3>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                            <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(match.date)}</span>
                            <span className="flex items-center gap-1"><MapPin size={12} />{match.location}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusCfg.color}`}>{statusCfg.label}</span>
                          {admin && (
                            <button onClick={() => handleDeleteMatch(match.id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 참석 확인 (예정 매치) */}
                      {match.status === 'scheduled' && (
                        <div className="mt-3 bg-gray-50 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-gray-700">
                              참석 확인 ({(match.attendees || []).length}명)
                            </span>
                            {currentUser && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleAttendance(match.id, currentUser.id);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                  (match.attendees || []).includes(currentUser.id)
                                    ? 'bg-red-50 text-red-600 border border-red-200'
                                    : 'bg-green-50 text-green-600 border border-green-200'
                                }`}
                              >
                                {(match.attendees || []).includes(currentUser.id) ? '참석 취소' : '참석'}
                              </button>
                            )}
                          </div>
                          {(match.attendees || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {(match.attendees || []).map(id => {
                                const m = members.find(mem => mem.id === id);
                                return m ? (
                                  <span key={id} className="text-[11px] bg-white px-2 py-1 rounded-lg border border-gray-200 font-medium text-gray-700">
                                    {m.name}
                                  </span>
                                ) : null;
                              })}
                            </div>
                          )}
                          {/* 참석 투표 공유 (admin only) */}
                          {admin && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleShareAttend(match); }}
                              className="w-full flex items-center justify-center gap-1.5 py-2 mt-1 bg-yellow-300 hover:bg-yellow-400 text-yellow-900 rounded-lg text-xs font-bold transition-colors"
                            >
                              <Share2 size={12} />
                              참석 투표 카톡 공유
                            </button>
                          )}
                        </div>
                      )}

                      <div className="mt-3">
                        {admin && match.status === 'scheduled' && (
                          <button onClick={() => navigate(`/lineup?matchId=${match.id}`)}
                            className="w-full py-2.5 bg-[#1e3a5f] text-white rounded-xl text-xs font-bold hover:bg-[#16304a] transition-colors flex items-center justify-center gap-2">
                            <LayoutGrid size={14} /> 라인업 편성
                          </button>
                        )}
                        {(match.status === 'lineup' || match.status === 'playing') && (
                          <div className="space-y-2">
                            <button onClick={() => navigate(`/lineup?matchId=${match.id}`)}
                              className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                              <Eye size={14} /> 라인업 보기
                            </button>
                            {admin && (
                              <button onClick={() => handleEndGame(match.id)}
                                className="w-full py-2.5 bg-[#16a34a] text-white rounded-xl text-xs font-bold hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
                                <Play size={14} /> 경기 종료
                              </button>
                            )}
                          </div>
                        )}
                        {match.status === 'voting' && !isVotingOpen && (
                          <button onClick={() => openVoting(match)}
                            className="w-full py-2.5 bg-yellow-500 text-white rounded-xl text-xs font-bold hover:bg-yellow-600 transition-colors flex items-center justify-center gap-2">
                            <Trophy size={14} /> 투표 / 결과 입력
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Voting panel */}
                    {isVotingOpen && votingMatch && (
                      <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50">
                        <div className="flex justify-end">
                          <button onClick={() => setActiveVotingId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 font-medium flex items-center gap-1">
                            <X size={14} /> 닫기
                          </button>
                        </div>
                        {/* Score Input (admin only) */}
                        {admin && (
                        <div className="bg-white rounded-xl p-4">
                          <h4 className="text-xs font-bold text-gray-700 mb-3 text-center">경기 점수</h4>

                          {/* Opponent name input */}
                          <div className="mb-3">
                            <input type="text" value={opponentName} onChange={(e) => setOpponentName(e.target.value)} placeholder="상대팀 이름 (미입력 시 '상대팀')"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" />
                          </div>

                          <div className="flex items-center justify-center gap-4">
                            <div className="text-center">
                              <p className="text-[10px] text-blue-600 font-bold mb-1.5">오지FC</p>
                              <input type="number" min={0} max={99} value={scoreA} onChange={(e) => setScoreA(Number(e.target.value))}
                                className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" />
                            </div>
                            <span className="text-xl font-bold text-gray-400 mt-5">vs</span>
                            <div className="text-center">
                              <p className="text-[10px] text-red-600 font-bold mb-1.5">{opponentName.trim() || '상대팀'}</p>
                              <input type="number" min={0} max={99} value={scoreB} onChange={(e) => setScoreB(Number(e.target.value))}
                                className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" />
                            </div>
                          </div>

                          {/* Goal records */}
                          <div className="mt-4">
                            <h5 className="text-[11px] font-bold text-gray-600 mb-2 flex items-center gap-1">
                              <Goal size={12} /> 골 기록
                            </h5>
                            <div className="flex gap-1 mb-2">
                              {[1, 2, 3, 4].map(q => (
                                <button key={q} onClick={() => setGoalQuarter(q)}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                                    goalQuarter === q ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                                  }`}>
                                  {q}Q
                                </button>
                              ))}
                            </div>
                            {goals.length > 0 && (
                              <div className="space-y-1 mb-2">
                                {goals.map((goal, idx) => {
                                  const guests = getGuestsByMatch(votingMatch.id);
                                  const info = getPlayerInfo(members, guests, goal.playerId);
                                  return (
                                    <div key={idx} className="flex items-center justify-between bg-green-50 rounded-lg px-2.5 py-1.5">
                                      <span className="text-xs font-medium text-gray-700">
                                        <span className="text-[10px] text-green-600 mr-1">{goal.quarter}Q</span>
                                        {info?.name || '알 수 없음'}
                                      </span>
                                      <button onClick={() => handleRemoveGoal(idx)} className="text-gray-400 hover:text-red-500">
                                        <X size={12} />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              {votablePlayers.map((player) => (
                                <button key={player.id} onClick={() => handleAddGoal(player.id)}
                                  className="text-[10px] px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700 transition-colors font-medium">
                                  + {player.name}
                                </button>
                              ))}
                            </div>
                          </div>

                          <button onClick={handleSaveScore}
                            className="mt-3 w-full py-2 bg-[#1e3a5f] text-white rounded-lg text-xs font-bold hover:bg-[#16304a] transition-colors flex items-center justify-center gap-1.5">
                            <Check size={14} /> 점수 저장
                          </button>
                        </div>
                        )}

                        {/* POM Voting */}
                        <div className="bg-white rounded-xl p-4">
                          <h4 className="text-xs font-bold text-gray-700 mb-1 text-center">POM 투표</h4>
                          <p className="text-[10px] text-gray-400 text-center mb-3">이번 경기의 MVP를 선택하세요!</p>

                          {votablePlayers.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-4">라인업에 배치된 선수가 없습니다.</p>
                          ) : (
                            <div className="grid grid-cols-3 gap-2">
                              {votablePlayers.map((player) => {
                                const isSelected = selectedVote === player.id;
                                const isSelf = player.id === currentUser?.id;
                                const voteCount = voteCounts[player.id] || 0;
                                const pct = totalVotesForVoting > 0 ? (voteCount / totalVotesForVoting) * 100 : 0;
                                return (
                                  <button key={player.id}
                                    onClick={() => {
                                      if (voteSaved) return;
                                      if (isSelf) {
                                        alert('자기 자신한테는 투표할 수 없습니다');
                                        return;
                                      }
                                      setSelectedVote(player.id);
                                    }}
                                    disabled={voteSaved}
                                    className={`relative flex flex-col items-center p-2.5 rounded-xl border-2 transition-all ${
                                      isSelf
                                        ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                                        : isSelected
                                          ? 'border-[#16a34a] bg-green-50 shadow-md'
                                          : 'border-gray-100 bg-gray-50 hover:border-gray-300'
                                    } ${voteSaved && !isSelected ? 'opacity-60' : ''}`}>
                                    <div className="w-9 h-9 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-xs font-bold mb-1">
                                      {player.name.charAt(0)}
                                    </div>
                                    <span className="text-[11px] font-semibold text-gray-900 truncate w-full text-center">{player.name}{isSelf && ' (나)'}</span>
                                    <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                                      {player.positions.map((pos) => (
                                        <span key={pos} className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${getPositionColor(pos)}`}>{pos}</span>
                                      ))}
                                    </div>
                                    {voteCount > 0 && (
                                      <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 bg-[#16a34a] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                        {pct.toFixed(0)}%
                                      </span>
                                    )}
                                    {isSelected && (
                                      <div className="absolute top-1 right-1"><Check size={12} className="text-[#16a34a]" /></div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Vote percentage bars */}
                          {totalVotesForVoting > 0 && (
                            <div className="mt-3 space-y-1.5">
                              {votablePlayers
                                .filter((p) => (voteCounts[p.id] || 0) > 0)
                                .sort((a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0))
                                .map((player) => {
                                  const voteCount = voteCounts[player.id] || 0;
                                  const pct = (voteCount / totalVotesForVoting) * 100;
                                  return (
                                    <div key={player.id} className="flex items-center gap-2">
                                      <span className="text-[11px] font-semibold text-gray-700 w-16 truncate">{player.name}</span>
                                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-[#16a34a] rounded-full transition-all" style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className="text-[10px] text-gray-500 w-12 text-right">{pct.toFixed(1)}%</span>
                                    </div>
                                  );
                                })}
                            </div>
                          )}

                          {!voteSaved && (
                            <button onClick={handleVote} disabled={!selectedVote}
                              className="mt-3 w-full py-2 bg-[#16a34a] text-white rounded-lg text-xs font-bold hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                              투표하기
                            </button>
                          )}
                          {voteSaved && (
                            <p className="mt-2 text-center text-[11px] text-green-600 font-medium">투표가 완료되었습니다!</p>
                          )}
                        </div>

                        {/* 투표 종료는 24시간 후 자동 확정 */}
                        <p className="text-center text-[10px] text-gray-400">
                          ⏰ 경기 종료 24시간 후 자동 확정됩니다
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {activeMatches.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Calendar size={36} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium">예정된 매치가 없습니다</p>
            <p className="text-xs mt-1">위에서 새 매치를 만들어보세요!</p>
          </div>
        )}

        {/* Match History */}
        {doneMatches.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <Trophy size={15} className="text-yellow-500" /> 지난 매치
            </h2>
            <div className="space-y-2">
              {doneMatches.map((match) => {
                const pomMember = match.pomId ? getMemberById(members, match.pomId) : null;
                const pomGuest = !pomMember && match.pomId ? getGuestsByMatch(match.id).find((g) => g.id === match.pomId) : null;
                const pomName = pomMember ? pomMember.name : pomGuest ? pomGuest.name + ' (용병)' : null;
                const isExpanded = expandedHistoryId === match.id;
                const matchVoteCounts = getVoteCounts(match.votes);
                const matchTotalVotes = Object.values(matchVoteCounts).reduce((a, b) => a + b, 0);
                const matchGoals = match.goals || [];

                return (
                  <div key={match.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div onClick={() => setExpandedHistoryId(isExpanded ? null : match.id)} className="w-full p-4 text-left cursor-pointer">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">{formatDate(match.date)}</span>
                        <div className="flex items-center gap-2">
                          {pomName && (
                            <span className="flex items-center gap-1 text-xs text-yellow-600 font-medium">
                              <Trophy size={12} className="fill-yellow-500 text-yellow-500" />{pomName}
                            </span>
                          )}
                          {admin && (
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteMatch(match.id); }}
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 transition-colors">
                              <Trash2 size={12} />
                            </button>
                          )}
                          {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                        </div>
                      </div>
                      <p className="text-sm font-bold text-gray-800 mb-0.5">{match.title}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mb-2"><MapPin size={11} />{match.location}</p>
                      <div className="flex items-center justify-center gap-3">
                        <span className="text-xs font-bold text-blue-600">오지FC</span>
                        <span className="text-2xl font-extrabold text-gray-900">{match.scoreA} : {match.scoreB}</span>
                        <span className="text-xs font-bold text-red-600">{getTeamName(match, 'B')}</span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                        {/* Goal records */}
                        {matchGoals.length > 0 && (
                          <div>
                            <h4 className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1"><Goal size={12} /> 골 기록</h4>
                            <div className="space-y-1">
                              {matchGoals.map((goal, idx) => {
                                const guests = getGuestsByMatch(match.id);
                                const info = getPlayerInfo(members, guests, goal.playerId);
                                return (
                                  <div key={idx} className="flex items-center gap-2 text-xs text-gray-700">
                                    <span className="text-green-600">⚽</span>
                                    <span className="font-medium">{info?.name || '알 수 없음'}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Vote breakdown */}
                        {Object.keys(matchVoteCounts).length > 0 && (
                          <div>
                            <h4 className="text-xs font-bold text-gray-600 mb-2">투표 결과</h4>
                            <div className="space-y-2">
                              {Object.entries(matchVoteCounts)
                                .sort(([, a], [, b]) => b - a)
                                .map(([id, count]) => {
                                  const guests = getGuestsByMatch(match.id);
                                  const info = getPlayerInfo(members, guests, id);
                                  const name = info ? info.name : '알 수 없음';
                                  const pct = matchTotalVotes > 0 ? (count / matchTotalVotes) * 100 : 0;
                                  return (
                                    <div key={id} className="flex items-center gap-2.5">
                                      <div className="w-7 h-7 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                        {name.charAt(0)}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-0.5">
                                          <span className="text-xs font-semibold text-gray-900 truncate">{name}</span>
                                          <span className="text-[10px] text-gray-500 ml-2">{pct.toFixed(1)}%</span>
                                        </div>
                                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                          <div className="h-full bg-[#16a34a] rounded-full transition-all" style={{ width: `${pct}%` }} />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
