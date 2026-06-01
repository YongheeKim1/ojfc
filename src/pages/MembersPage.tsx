import { useState, useEffect } from 'react';
import { Plus, X, Pencil, Trash2, Check, Trophy } from 'lucide-react';
import {
  getMembers,
  getMatches,
  saveMember,
  updateMember,
  deleteMember,
  subscribe,
  isAdmin,
} from '../lib/store';
import type { Member, Match, Position } from '../lib/types';
import { POSITIONS, getPositionColor } from '../lib/types';

const CATEGORY_ORDER = ['GK', 'DF', 'MF', 'FW'];
const CATEGORY_LABELS: Record<string, string> = {
  GK: 'GK',
  DF: '수비',
  MF: '미드필드',
  FW: '공격',
};

function sortMembers(members: Member[]): Member[] {
  return [...members].sort((a, b) => {
    const firstPosA = (a.positions ?? [])[0];
    const firstPosB = (b.positions ?? [])[0];
    const catA = POSITIONS.find(p => p.value === firstPosA)?.category ?? '';
    const catB = POSITIONS.find(p => p.value === firstPosB)?.category ?? '';
    const idxA = CATEGORY_ORDER.indexOf(catA);
    const idxB = CATEGORY_ORDER.indexOf(catB);
    if (idxA !== idxB) return idxA - idxB;
    return a.name.localeCompare(b.name, 'ko');
  });
}

function getMemberStats(
  memberId: string,
  matches: Match[],
  rangeStart?: number,
  rangeEnd?: number
): { games: number; goals: number } {
  let games = 0;
  let goals = 0;
  for (const match of matches) {
    if (match.status !== 'done' && match.status !== 'voting' && match.status !== 'playing') continue;
    // 기간 필터
    if (rangeStart !== undefined && match.date < rangeStart) continue;
    if (rangeEnd !== undefined && match.date > rangeEnd) continue;
    // Check if member played in any quarter
    let played = false;
    for (const q of match.quarters) {
      if (Object.values(q.playing).includes(memberId)) {
        played = true;
        break;
      }
    }
    if (played) games++;
    // Count goals
    if (match.goals) {
      goals += match.goals.filter(g => g.playerId === memberId).length;
    }
  }
  return { games, goals };
}

// 기간 옵션: 'all' 또는 'YYYY-MM' (예: '2026-05')
type RangeKey = string;

// 매치 데이터 기반으로 옵션 생성 (최근 매치 달 + 현재 달 포함)
function buildRangeOptions(matches: Match[]): { value: RangeKey; label: string }[] {
  const keys = new Set<string>();
  const now = new Date();
  // 현재 달은 항상 포함
  keys.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  // 매치 날짜에서 모은 달
  for (const m of matches) {
    const d = new Date(m.date);
    keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const sorted = Array.from(keys).sort((a, b) => b.localeCompare(a));
  const options: { value: RangeKey; label: string }[] = [{ value: 'all', label: '전체' }];
  for (const key of sorted) {
    const [y, m] = key.split('-');
    options.push({ value: key, label: `${y}년 ${parseInt(m, 10)}월` });
  }
  return options;
}

function getRangeBounds(key: RangeKey): { start?: number; end?: number } {
  if (key === 'all') return {};
  const [yStr, mStr] = key.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1; // 0-indexed
  if (isNaN(y) || isNaN(m)) return {};
  const start = new Date(y, m, 1).getTime();
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999).getTime();
  return { start, end };
}

// 현재 달 기본값
function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function MembersPage() {
  const admin = isAdmin();
  const [members, setMembers] = useState<Member[]>(getMembers());
  const [matches, setMatchesState] = useState<Match[]>(getMatches());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>(getCurrentMonthKey());

  const [name, setName] = useState('');
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([]);

  useEffect(() => {
    setMembers(getMembers());
    setMatchesState(getMatches());
    return subscribe(() => {
      setMembers(getMembers());
      setMatchesState(getMatches());
    });
  }, []);

  const resetForm = () => {
    setName('');
    setSelectedPositions([]);
    setShowForm(false);
    setEditingId(null);
  };

  const togglePosition = (pos: Position) => {
    setSelectedPositions(prev =>
      prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]
    );
  };

  const handleAdd = async () => {
    if (!name.trim() || selectedPositions.length === 0) return;
    await saveMember({ name: name.trim(), positions: selectedPositions, password: '' });
    resetForm();
  };

  const handleEdit = (member: Member) => {
    setEditingId(member.id);
    setName(member.name);
    setSelectedPositions(member.positions ?? []);
    setShowForm(true);
  };

  const handleUpdate = async () => {
    if (!editingId || !name.trim() || selectedPositions.length === 0) return;
    await updateMember(editingId, {
      name: name.trim(),
      positions: selectedPositions,
    });
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await deleteMember(id);
  };

  const rangeOptions = buildRangeOptions(matches);
  const { start: rangeStart, end: rangeEnd } = getRangeBounds(range);
  // 기간별 통계 미리 계산
  const statsByMember = new Map<string, { games: number; goals: number }>();
  members.forEach(m => {
    statsByMember.set(m.id, getMemberStats(m.id, matches, rangeStart, rangeEnd));
  });

  // 기본은 포지션 정렬, 단 기간 필터가 걸린 경우 출전 횟수 내림차순 우선
  const sorted = range === 'all'
    ? sortMembers(members)
    : [...members].sort((a, b) => {
        const ga = statsByMember.get(a.id)?.games ?? 0;
        const gb = statsByMember.get(b.id)?.games ?? 0;
        if (gb !== ga) return gb - ga;
        return a.name.localeCompare(b.name, 'ko');
      });

  // 기간 내 1경기 이상 뛴 인원 카운트
  const activeCount = Array.from(statsByMember.values()).filter(s => s.games > 0).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] text-white px-5 pt-10 pb-6 rounded-b-3xl shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">멤버 관리</h1>
            <p className="text-blue-200 text-sm mt-1">
              총 {members.length}명
              {range !== 'all' && (
                <span className="ml-2 text-[#bef264]">· 출전 {activeCount}명</span>
              )}
            </p>
          </div>
          <select
            value={range}
            onChange={e => setRange(e.target.value)}
            className="bg-white/10 backdrop-blur border border-white/20 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            {rangeOptions.map(opt => (
              <option key={opt.value} value={opt.value} className="text-gray-800">
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* Add button / Form (admin only) */}
        {admin && !showForm ? (
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center justify-center gap-2 text-[#16a34a] font-semibold text-sm active:bg-green-50 transition-colors"
          >
            <Plus className="w-5 h-5" />
            멤버 추가
          </button>
        ) : admin && showForm ? (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-700">
                {editingId ? '멤버 수정' : '새 멤버 추가'}
              </h2>
              <button
                onClick={resetForm}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">이름</label>
                <input
                  type="text"
                  placeholder="이름을 입력하세요"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:bg-white transition"
                  maxLength={10}
                />
              </div>
              {/* Position checkboxes */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">포지션 (복수 선택)</label>
                <div className="space-y-2">
                  {CATEGORY_ORDER.map(cat => (
                    <div key={cat}>
                      <p className="text-[10px] text-gray-400 font-semibold mb-1">{CATEGORY_LABELS[cat]}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {POSITIONS.filter(p => p.category === cat).map(p => {
                          const isSelected = selectedPositions.includes(p.value);
                          return (
                            <label
                              key={p.value}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-[#16a34a]/10 border border-[#16a34a] text-gray-800'
                                  : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => togglePosition(p.value)}
                                className="sr-only"
                              />
                              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                                isSelected ? 'bg-[#16a34a] border-[#16a34a]' : 'border-gray-300'
                              }`}>
                                {isSelected && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </span>
                              {p.value}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Selected position badges */}
                {selectedPositions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {selectedPositions.map(pos => (
                      <span
                        key={pos}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${getPositionColor(pos)}`}
                      >
                        {pos}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {/* Submit */}
              <button
                onClick={editingId ? handleUpdate : handleAdd}
                disabled={!name.trim() || selectedPositions.length === 0}
                className="w-full py-3 bg-[#16a34a] text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed active:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {editingId ? '수정 완료' : '추가하기'}
              </button>
            </div>
          </div>
        ) : null}

        {/* Member list */}
        {sorted.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-3 bg-gray-50 rounded-full flex items-center justify-center">
              <Plus className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-600 mb-1">아직 등록된 멤버가 없습니다</p>
            <p className="text-xs text-gray-400">멤버를 추가해보세요!</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-50">
            {sorted.map(member => {
              const positions = member.positions ?? [];
              const stats = statsByMember.get(member.id) ?? { games: 0, goals: 0 };
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 px-5 py-3.5"
                >
                  {/* Name + Stats */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {member.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400 font-medium">
                        {stats.games}경기
                      </span>
                      {stats.goals > 0 && (
                        <span className="text-[10px] text-green-600 font-medium">
                          ⚽ {stats.goals}골
                        </span>
                      )}
                      {member.pomCount > 0 && (
                        <span className="text-[10px] text-yellow-600 font-medium flex items-center gap-0.5">
                          <Trophy className="w-3 h-3 text-yellow-500" /> {member.pomCount}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Position badges */}
                  <div className="flex flex-wrap gap-1 justify-end">
                    {positions.map(pos => (
                      <span
                        key={pos}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getPositionColor(pos)}`}
                      >
                        {pos}
                      </span>
                    ))}
                  </div>
                  {/* Actions (admin only) */}
                  {admin && (
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        onClick={() => handleEdit(member)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 active:bg-gray-100 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(member.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 active:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
