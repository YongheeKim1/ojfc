import { Check, Trophy } from 'lucide-react';

/**
 * 투표를 마친 사람에게 보여주는 "투표 완료 + 현재 투표 상황".
 * 1위 판정은 실제 POM 확정 규칙과 같습니다 (최다 득표 동률이면 공동 POM, 단 1표씩 동률이면 POM 없음).
 */
export default function VoteStatus({
  votes, candidates, myVoteId,
}: {
  votes: Record<string, string>;          // 투표자 ID → 뽑은 선수 ID
  candidates: { id: string; name: string }[];
  myVoteId: string | null;
}) {
  const counts: Record<string, number> = {};
  for (const pick of Object.values(votes || {})) counts[pick] = (counts[pick] || 0) + 1;
  const voters = Object.keys(votes || {}).length;
  const maxV = Math.max(0, ...Object.values(counts));

  let leaders = Object.entries(counts).filter(([, c]) => c === maxV && c > 0).map(([id]) => id);
  const noPom = maxV < 2 && leaders.length > 1;
  if (noPom) leaders = [];

  const nameOf = (id: string) => candidates.find(c => c.id === id)?.name ?? '?';
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      {/* 투표 완료 */}
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0">
          <Check size={14} className="text-white" strokeWidth={3} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-green-800">투표 완료</p>
          {myVoteId && (
            <p className="text-[11px] text-green-700 truncate">
              내 선택: <b>{nameOf(myVoteId)}</b>
            </p>
          )}
        </div>
      </div>

      {/* 현재 투표 상황 */}
      <p className="text-[11px] font-bold text-gray-500 mt-3 mb-1.5">현재 투표 상황</p>

      {leaders.length > 0 ? (
        <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 mb-2">
          <Trophy size={13} className="text-yellow-500 fill-yellow-500 shrink-0" />
          <span className="text-[11px] text-yellow-800">
            {leaders.length > 1 ? '공동 1위' : '현재 1위'}: <b>{leaders.map(nameOf).join(' · ')}</b>
            <span className="text-yellow-600"> ({Math.round((maxV / voters) * 100)}%)</span>
          </span>
        </div>
      ) : noPom ? (
        <p className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-2 text-center">
          모두 동률 — 이대로면 POM 없음
        </p>
      ) : null}

      <div className="space-y-1.5">
        {ranked.map(([id, c]) => {
          const pct = voters > 0 ? (c / voters) * 100 : 0;
          const mine = id === myVoteId;
          return (
            <div key={id} className="flex items-center gap-2">
              <span className={`text-[11px] w-16 truncate ${mine ? 'font-bold text-green-700' : 'font-semibold text-gray-700'}`}>
                {nameOf(id)}
              </span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${leaders.includes(id) ? 'bg-yellow-400' : 'bg-[#16a34a]'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500 w-9 text-right">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
