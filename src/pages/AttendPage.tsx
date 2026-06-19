import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, X, HelpCircle, MapPin, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { getMembers, getMatches, subscribe, setAttendance, getCurrentUser } from '../lib/store';
import type { Member, Match } from '../lib/types';

type Status = 'in' | 'out' | 'maybe';

const STATUS_INFO: Record<Status, { label: string; color: string; bar: string; icon: typeof Check; bg: string }> = {
  in: { label: '참', color: 'text-yellow-700', bar: 'bg-yellow-400', icon: Check, bg: 'bg-yellow-50' },
  out: { label: '불', color: 'text-gray-700', bar: 'bg-gray-400', icon: X, bg: 'bg-gray-50' },
  maybe: { label: '미정', color: 'text-gray-700', bar: 'bg-gray-300', icon: HelpCircle, bg: 'bg-gray-50' },
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

  // 로그인 필수 → 항상 본인 ID로 고정
  const loggedInUser = getCurrentUser();
  const claimedId = loggedInUser?.id ?? null;
  const [expanded, setExpanded] = useState<Status | null>('in');
  const [saving, setSaving] = useState(false);

  const attendance = match?.attendance || {};
  const claimedMember = claimedId ? members.find(m => m.id === claimedId) : null;

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

  const totalCount = members.length;
  const inCount = groups.in.length;
  const outCount = groups.out.length;
  const maybeCount = groups.maybe.length;
  const respondedCount = inCount + outCount + maybeCount;

  const barWidth = (n: number) => totalCount > 0 ? `${Math.max(5, (n / totalCount) * 100)}%` : '0%';

  const handleVote = async (status: Status) => {
    if (!matchId || !claimedId) return;
    setSaving(true);
    const current = attendance[claimedId];
    const next = current === status ? null : status;
    await setAttendance(matchId, claimedId, next);
    setSaving(false);
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

      {/* 3개 바 (탭하면 투표자 이름 표시) */}
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
                    <span
                      key={m.id}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                        m.id === claimedId
                          ? 'bg-white text-gray-900 ring-1 ring-gray-300 font-bold'
                          : 'bg-gray-50 text-gray-700'
                      }`}
                    >
                      {m.name}{m.id === claimedId && ' (나)'}
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

      {/* 본인 투표 영역 (로그인 필수) */}
      <div className="px-5 pt-5">
        {claimedMember && (
          <>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 font-bold text-sm">
                    {claimedMember.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold">내 투표</p>
                    <p className="text-sm font-bold text-gray-900">{claimedMember.name}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['in', 'out', 'maybe'] as Status[]).map(s => {
                  const info = STATUS_INFO[s];
                  const isSelected = attendance[claimedId!] === s;
                  return (
                    <button
                      key={s}
                      onClick={() => handleVote(s)}
                      disabled={saving}
                      className={`py-3 rounded-xl text-sm font-bold transition-all ${
                        isSelected
                          ? `${info.bar} text-white shadow-md`
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                      } disabled:opacity-40`}
                    >
                      {info.label}
                    </button>
                  );
                })}
              </div>
              {attendance[claimedId!] && (
                <p className="text-[11px] text-center mt-2 text-gray-500 font-medium">
                  투표 완료 (탭하면 변경)
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
