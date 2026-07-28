import { useState, useEffect } from 'react';
import { Megaphone, Mail, Send, Trash2, User } from 'lucide-react';
import {
  getAnnouncements, saveAnnouncement, deleteAnnouncement,
  getFeedbacks, getFeedbacksForMember, saveFeedback, deleteFeedback,
  getMembers, getMatches, getCurrentUser, subscribe, isCoach, FORMATIONS,
} from '../lib/store';
import type { Announcement, Feedback, Member, Match } from '../lib/types';

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 특정 매치에 참여한 멤버 ID(플레이 or 휴식 = 그날 로스터)
function getMatchMemberIds(match: Match): string[] {
  const ids = new Set<string>();
  for (const q of (match.quarters || [])) {
    Object.values(q.playing || {}).forEach(id => { if (id) ids.add(id); });
    (q.resting || []).forEach(id => { if (id) ids.add(id); });
  }
  return Array.from(ids);
}

// 멤버의 쿼터별 포지션 (없으면 '-', 휴식이면 '휴식')
function memberQuarterPositions(match: Match, memberId: string): string[] {
  const slots = FORMATIONS[match.formation] || FORMATIONS['4-3-3'];
  const labelById: Record<string, string> = {};
  slots.forEach(s => { labelById[s.id] = s.label; });
  const out: string[] = [];
  for (let qi = 0; qi < 4; qi++) {
    const q = (match.quarters || [])[qi];
    if (!q) { out.push('-'); continue; }
    const slotId = Object.keys(q.playing || {}).find(sid => q.playing[sid] === memberId);
    if (slotId) out.push(labelById[slotId] || slotId);
    else if ((q.resting || []).includes(memberId)) out.push('휴식');
    else out.push('-');
  }
  return out;
}

export default function CoachPage() {
  const coach = isCoach();
  const currentUser = getCurrentUser();

  const [announcements, setAnnouncements] = useState<Announcement[]>(getAnnouncements());
  const [feedbacks, setFeedbacks] = useState<Feedback[]>(getFeedbacks());
  const [members, setMembers] = useState<Member[]>(getMembers());
  const [matches, setMatches] = useState<Match[]>(getMatches());

  useEffect(() => {
    return subscribe(() => {
      setAnnouncements(getAnnouncements());
      setFeedbacks(getFeedbacks());
      setMembers(getMembers());
      setMatches(getMatches());
    });
  }, []);

  // 작성 상태
  const [annText, setAnnText] = useState('');
  const [annSaving, setAnnSaving] = useState(false);
  const [fbMatchId, setFbMatchId] = useState('');       // 선택한 매치
  const [fbOpenMemberId, setFbOpenMemberId] = useState<string | null>(null); // 피드백 작성 중인 멤버
  const [fbText, setFbText] = useState('');
  const [fbSaving, setFbSaving] = useState(false);
  const [historyMemberId, setHistoryMemberId] = useState<string | null>(null);

  const myFeedbacks = currentUser ? getFeedbacksForMember(currentUser.id) : [];

  // 라인업이 있는 매치만 (그날 뛴 사람 확인 가능)
  const lineupMatches = matches.filter(m => (m.quarters || []).length > 0);
  const selectedMatch = matches.find(m => m.id === fbMatchId) || null;
  const participantMembers = selectedMatch
    ? getMatchMemberIds(selectedMatch)
        .map(id => members.find(m => m.id === id))
        .filter((m): m is Member => !!m)
    : [];

  const handlePostAnnouncement = async () => {
    if (!annText.trim() || annSaving) return;
    setAnnSaving(true);
    await saveAnnouncement(annText, currentUser?.name ?? '감독');
    setAnnText('');
    setAnnSaving(false);
  };

  const handleSendFeedback = async (target: Member) => {
    if (!fbText.trim() || fbSaving) return;
    setFbSaving(true);
    await saveFeedback(
      target.id, target.name, fbText, currentUser?.name ?? '감독',
      selectedMatch?.id, selectedMatch?.title
    );
    setFbText('');
    setFbOpenMemberId(null);
    setFbSaving(false);
  };

  const historyList = historyMemberId
    ? feedbacks.filter(f => f.memberId === historyMemberId)
    : [];

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] text-white px-5 pt-10 pb-6 rounded-b-3xl shadow-lg">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Megaphone size={20} /> 감독
        </h1>
        <p className="text-blue-200 text-sm mt-1">
          {coach ? '공지와 개별 피드백을 전달하세요' : '감독의 공지와 나에게 온 편지'}
        </p>
      </div>

      <div className="px-4 -mt-4 space-y-5">
        {/* ── 감독 전용: 작성 ── */}
        {coach && (
          <>
            {/* 전체 공지 작성 */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                <Megaphone size={15} className="text-[#16a34a]" /> 전체 공지 작성
              </h2>
              <textarea
                value={annText}
                onChange={e => setAnnText(e.target.value)}
                placeholder="팀 전체에게 전할 말씀을 적어주세요"
                rows={3}
                className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:bg-white transition resize-none"
              />
              <button
                onClick={handlePostAnnouncement}
                disabled={!annText.trim() || annSaving}
                className="mt-2 w-full py-2.5 bg-[#16a34a] text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
              >
                <Send size={14} /> 공지 등록
              </button>
            </div>

            {/* 매치별 개별 피드백 작성 */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-1.5">
                <Mail size={15} className="text-blue-500" /> 매치 피드백
              </h2>
              <p className="text-[11px] text-gray-400 mb-3">매치를 고르면 그날 뛴 선수와 쿼터별 포지션이 나옵니다</p>

              {/* 매치 선택 */}
              <select
                value={fbMatchId}
                onChange={e => { setFbMatchId(e.target.value); setFbOpenMemberId(null); setFbText(''); }}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">매치 선택</option>
                {lineupMatches.map(m => (
                  <option key={m.id} value={m.id}>{formatDate(m.date)} · {m.title}</option>
                ))}
              </select>

              {selectedMatch && participantMembers.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-3">그날 뛴 멤버 정보가 없습니다</p>
              )}

              {/* 그날 뛴 멤버 + 쿼터별 포지션 */}
              <div className="space-y-2">
                {participantMembers.map(m => {
                  const qpos = memberQuarterPositions(selectedMatch!, m.id);
                  const isOpen = fbOpenMemberId === m.id;
                  const cnt = feedbacks.filter(f => f.memberId === m.id && f.matchId === selectedMatch!.id).length;
                  return (
                    <div key={m.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      <button
                        onClick={() => { setFbOpenMemberId(isOpen ? null : m.id); setFbText(''); }}
                        className={`w-full text-left px-3 py-2.5 ${isOpen ? 'bg-blue-50' : 'bg-white'} transition-colors`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-gray-800">{m.name}</span>
                          <div className="flex items-center gap-1">
                            {cnt > 0 && <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">편지 {cnt}</span>}
                            <span className="text-[10px] text-blue-500 font-semibold">{isOpen ? '닫기' : '피드백'}</span>
                          </div>
                        </div>
                        {/* 쿼터별 포지션 */}
                        <div className="flex gap-1 mt-1.5">
                          {qpos.map((p, i) => (
                            <span key={i} className={`flex-1 text-center text-[10px] py-1 rounded ${
                              p === '휴식' ? 'bg-gray-100 text-gray-400'
                                : p === '-' ? 'bg-gray-50 text-gray-300'
                                : 'bg-green-50 text-green-700 font-semibold'
                            }`}>
                              <span className="block text-[8px] text-gray-400">{i + 1}Q</span>
                              {p}
                            </span>
                          ))}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="p-3 bg-blue-50/50 border-t border-blue-100">
                          {/* 이 매치에서 이 멤버에게 보낸 편지 (삭제 가능) */}
                          {feedbacks.filter(f => f.memberId === m.id && f.matchId === selectedMatch!.id).length > 0 && (
                            <div className="space-y-1.5 mb-2.5">
                              {feedbacks
                                .filter(f => f.memberId === m.id && f.matchId === selectedMatch!.id)
                                .map(f => (
                                  <div key={f.id} className="flex items-start justify-between gap-2 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                                    <p className="text-xs text-gray-700 whitespace-pre-wrap flex-1">{f.content}</p>
                                    <button
                                      onClick={() => { if (confirm('이 편지를 삭제할까요?')) deleteFeedback(f.id); }}
                                      className="text-gray-300 hover:text-red-500 shrink-0 mt-0.5"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                ))}
                            </div>
                          )}
                          <textarea
                            value={fbText}
                            onChange={e => setFbText(e.target.value)}
                            placeholder={`${m.name}에게 전할 피드백`}
                            rows={3}
                            autoFocus
                            className="w-full px-3 py-2 bg-white rounded-lg text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-400/40 transition resize-none"
                          />
                          <button
                            onClick={() => handleSendFeedback(m)}
                            disabled={!fbText.trim() || fbSaving}
                            className="mt-2 w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Send size={13} /> 편지 전달
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 멤버별 편지 히스토리 (감독용) */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                <User size={15} className="text-gray-500" /> 멤버별 편지 히스토리
              </h2>
              <select
                value={historyMemberId ?? ''}
                onChange={e => setHistoryMemberId(e.target.value || null)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <option value="">멤버 선택해서 지난 편지 보기</option>
                {members.map(m => {
                  const cnt = feedbacks.filter(f => f.memberId === m.id).length;
                  return <option key={m.id} value={m.id}>{m.name} ({cnt}통)</option>;
                })}
              </select>
              {historyMemberId && (
                <div className="space-y-2">
                  {historyList.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-3">보낸 편지가 없습니다</p>
                  ) : historyList.map(f => (
                    <div key={f.id} className="bg-gray-50 rounded-xl p-3">
                      {f.matchTitle && (
                        <span className="inline-block text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold mb-1.5">{f.matchTitle}</span>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-800 whitespace-pre-wrap flex-1">{f.content}</p>
                        <button
                          onClick={() => { if (confirm('이 편지를 삭제할까요?')) deleteFeedback(f.id); }}
                          className="text-gray-300 hover:text-red-500 shrink-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1.5">{formatDateTime(f.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── 모두: 감독의 한마디 (전체 공지) ── */}
        <div>
          <h2 className="text-sm font-bold text-gray-700 mb-2.5 flex items-center gap-1.5 px-1">
            <Megaphone size={15} className="text-[#16a34a]" /> 감독의 한마디
          </h2>
          {announcements.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
              <p className="text-sm text-gray-400">등록된 공지가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {announcements.map(a => (
                <div key={a.id} className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-[#16a34a]">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{a.content}</p>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-[11px] text-gray-400">감독 {a.authorName} · {formatDateTime(a.createdAt)}</span>
                    {coach && (
                      <button
                        onClick={() => { if (confirm('이 공지를 삭제할까요?')) deleteAnnouncement(a.id); }}
                        className="text-gray-300 hover:text-red-500"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 모두: 나에게 온 편지 ── */}
        <div>
          <h2 className="text-sm font-bold text-gray-700 mb-2.5 flex items-center gap-1.5 px-1">
            <Mail size={15} className="text-blue-500" /> 나에게 온 편지
            {myFeedbacks.length > 0 && (
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">{myFeedbacks.length}</span>
            )}
          </h2>
          {!currentUser ? null : myFeedbacks.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
              <Mail size={28} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">아직 받은 편지가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {myFeedbacks.map(f => (
                <div key={f.id} className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-blue-400">
                  {f.matchTitle && (
                    <span className="inline-block text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold mb-1.5">{f.matchTitle} 피드백</span>
                  )}
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{f.content}</p>
                  <p className="text-[11px] text-gray-400 mt-2.5">감독 {f.authorName} · {formatDateTime(f.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
