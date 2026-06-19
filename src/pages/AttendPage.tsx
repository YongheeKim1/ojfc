import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, X, HelpCircle, ChevronDown, ChevronUp, MapPin, Calendar } from 'lucide-react';
import { getMembers, getMatches, subscribe, setAttendance } from '../lib/store';
import type { Member, Match } from '../lib/types';

type Status = 'in' | 'out' | 'maybe';

const STATUS_INFO: Record<Status, { label: string; color: string; bar: string; icon: typeof Check }> = {
  in: { label: '참', color: 'text-yellow-700', bar: 'bg-yellow-400', icon: Check },
  out: { label: '불', color: 'text-gray-700', bar: 'bg-gray-400', icon: X },
  maybe: { label: '미정', color: 'text-gray-700', bar: 'bg-gray-300', icon: HelpCircle },
};

function formatDateLong(ts: number): string {
  const d = new Date(ts);
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${day})`;
}

export default function AttendPage() {
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('matchId');
  const [members, setMembers] = useState<Member[]>(getMembers());
  const [matches, setMatches] = useState<Match[]>(getMatches());

  useEffect(() => {
    setMembers(getMembers());
    setMatches(getMatches());
    return subscribe(() => {
      setMembers(getMembers());
      setMatches(getMatches());
    });
  }, []);

  const match = matches.find(m => m.id === matchId);

  // 마지막으로 응답한 멤버 ID (localStorage)
  const [myId, setMyId] = useState<string | null>(
    () => localStorage.getItem('ojifc_attendMemberId')
  );
  const [expanded, setExpanded] = useState<Status | null>('in');
  const [saving, setSaving] = useState<string | null>(null);

  const attendance = match?.attendance || {};

  // 그룹화
  const groups: Record<Status, Member[]> = useMemo(() => {
    const g: Record<Status, Member[]> = { in: [], out: [], maybe: [] };
    for (const m of members) {
      const s = attendance[m.id];
      if (s === 'in') g.in.push(m);
      else if (s === 'out') g.out.push(m);
      else if (s === 'maybe') g.maybe.push(m);
    }
    return g;
  }, [members, attendance]);

  // 응답 안 한 멤버 = 미응답
  const responded = new Set([...groups.in, ...groups.out, ...groups.maybe].map(m => m.id));
  const noResponse = members.filter(m => !responded.has(m.id));

  const totalCount = members.length;
  const inCount = groups.in.length;
  const outCount = groups.out.length;
  const maybeCount = groups.maybe.length;
  const respondedCount = inCount + outCount + maybeCount;

  // 바 너비 (퍼센트, 최소 5%)
  const barWidth = (n: number) => totalCount > 0 ? `${Math.max(5, (n / totalCount) * 100)}%` : '0%';

  const handleVote = async (memberId: string, status: Status) => {
    if (!matchId) return;
    setSaving(memberId);
    const current = attendance[memberId];
    // 같은 버튼 다시 누르면 취소, 다른 버튼이면 변경
    const next = current === status ? null : status;
    await setAttendance(matchId, memberId, next);
    if (next !== null) {
      setMyId(memberId);
      localStorage.setItem('ojifc_attendMemberId', memberId);
    }
    setSaving(null);
  };

  if (!matchId || !match) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-gray-500 text-sm">매치를 찾을 수 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* 상단 로고/타이틀 */}
      <div className="bg-white px-5 pt-6 pb-5 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-3">
          <img src={import.meta.env.BASE_URL + 'logo.png'} alt="오지FC" className="w-7 h-7" />
          <span className="text-xs font-bold text-gray-500">오지FC 참석 투표</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 leading-tight">{match.title}</h1>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Calendar size={12} />{formatDateLong(match.date)}</span>
          <span className="flex items-center gap-1"><MapPin size={12} />{match.location}</span>
        </div>
      </div>

      {/* 3개 바 */}
      <div className="bg-white px-5 py-4 space-y-4">
        {(['in', 'out', 'maybe'] as Status[]).map(status => {
          const info = STATUS_INFO[status];
          const count = status === 'in' ? inCount : status === 'out' ? outCount : maybeCount;
          const list = groups[status];
          const isOpen = expanded === status;
          const Icon = info.icon;

          return (
            <div key={status}>
              <button
                onClick={() => setExpanded(isOpen ? null : status)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Icon size={14} className={info.color} strokeWidth={3} />
                    <span className={`text-sm font-bold ${info.color}`}>{info.label}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="font-semibold">{count}명</span>
                    {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </div>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${info.bar} rounded-full transition-all`} style={{ width: barWidth(count) }} />
                </div>
              </button>

              {isOpen && list.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {list.map(m => (
                    <span key={m.id} className="px-2 py-1 bg-gray-50 rounded-md text-[11px] text-gray-700 font-medium">
                      {m.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <p className="text-[11px] text-gray-400 text-center pt-2 border-t border-gray-100">
          {respondedCount}명 참여 · 총 {totalCount}명
        </p>
      </div>

      {/* 투표하기 (이름 선택) */}
      <div className="px-5 pt-5">
        <p className="text-xs font-bold text-gray-700 mb-2.5">
          내 이름을 선택해서 투표하세요
        </p>

        {/* 내 이름 (저장됐으면 맨 위) */}
        {myId && members.find(m => m.id === myId) && (
          <NameRow
            member={members.find(m => m.id === myId)!}
            status={attendance[myId]}
            onVote={handleVote}
            saving={saving === myId}
            highlight
          />
        )}

        {/* 응답 안 한 사람들 위로 */}
        {noResponse.filter(m => m.id !== myId).map(m => (
          <NameRow key={m.id} member={m} status={undefined} onVote={handleVote} saving={saving === m.id} />
        ))}

        {/* 이미 응답한 사람들 (수정 가능) */}
        {[...groups.in, ...groups.out, ...groups.maybe]
          .filter(m => m.id !== myId)
          .map(m => (
            <NameRow key={m.id} member={m} status={attendance[m.id]} onVote={handleVote} saving={saving === m.id} />
          ))}
      </div>
    </div>
  );
}

function NameRow({
  member,
  status,
  onVote,
  saving,
  highlight,
}: {
  member: Member;
  status: Status | undefined;
  onVote: (memberId: string, status: Status) => void;
  saving: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 py-2 px-3 rounded-xl mb-1.5 ${
      highlight ? 'bg-yellow-50 border border-yellow-200' : 'bg-white border border-gray-100'
    }`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-gray-800 truncate">{member.name}</span>
        {highlight && <span className="text-[10px] text-yellow-700 font-bold">내 이름</span>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {(['in', 'out', 'maybe'] as Status[]).map(s => {
          const info = STATUS_INFO[s];
          const isSelected = status === s;
          return (
            <button
              key={s}
              onClick={() => onVote(member.id, s)}
              disabled={saving}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                isSelected
                  ? `${info.bar} text-white shadow`
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              } disabled:opacity-40`}
            >
              {info.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
