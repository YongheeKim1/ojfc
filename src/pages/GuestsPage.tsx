import { useState, useEffect } from 'react';
import {
  Star,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Calendar,
  MapPin,
  Phone,
} from 'lucide-react';
import { Guest, Match, Position, POSITIONS, getPositionColor } from '../lib/types';
import {
  getGuests,
  saveGuest,
  addGuestRating,
  deleteGuest,
  updateGuest,
  getMatches,
  subscribe,
  isAdmin,
} from '../lib/store';

function StarRating({
  score,
  max = 5,
  size = 16,
  interactive = false,
  onChange,
}: {
  score: number;
  max?: number;
  size?: number;
  interactive?: boolean;
  onChange?: (score: number) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={size}
          className={`${i < score ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} ${interactive ? 'cursor-pointer' : ''}`}
          onClick={() => interactive && onChange?.(i + 1)}
        />
      ))}
    </div>
  );
}

function averageRating(guest: Guest): number {
  if (guest.ratings.length === 0) return 0;
  const sum = guest.ratings.reduce((acc, r) => acc + r.score, 0);
  return sum / guest.ratings.length;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const POSITION_CATEGORIES = [
  { label: 'GK', name: '골키퍼' },
  { label: 'DF', name: '수비' },
  { label: 'MF', name: '미드필드' },
  { label: 'FW', name: '공격' },
];

export default function GuestsPage() {
  const admin = isAdmin();
  const [guests, setGuests] = useState<Guest[]>(getGuests());
  const [matches, setMatches] = useState<Match[]>(getMatches());

  useEffect(() => {
    return subscribe(() => {
      setGuests(getGuests());
      setMatches(getMatches());
    });
  }, []);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([]);
  const [newMatchId, setNewMatchId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Matches available for guest registration (scheduled or lineup)
  const availableMatches = matches.filter(
    (m) => m.status === 'scheduled' || m.status === 'lineup' || m.status === 'playing'
  );

  const togglePosition = (pos: Position) => {
    setSelectedPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const handleAddGuest = async () => {
    if (!admin || !newName.trim() || !newMatchId || selectedPositions.length === 0) return;
    await saveGuest({
      name: newName.trim(),
      phone: newPhone.trim(),
      positions: selectedPositions,
      matchId: newMatchId,
    });
    setNewName('');
    setNewPhone('');
    setSelectedPositions([]);
    setNewMatchId('');
    setShowAddForm(false);
  };

  const handleAddRating = async (guestId: string) => {
    if (ratingScore === 0) return;
    await addGuestRating(guestId, ratingScore, ratingComment.trim());
    setRatingScore(0);
    setRatingComment('');
  };

  const handleDelete = async (id: string) => {
    if (!admin) return;
    await deleteGuest(id);
    setDeleteConfirmId(null);
    if (expandedId === id) setExpandedId(null);
  };

  // Group guests by match
  const guestsByMatch = new Map<string, Guest[]>();
  for (const guest of guests) {
    const list = guestsByMatch.get(guest.matchId) || [];
    list.push(guest);
    guestsByMatch.set(guest.matchId, list);
  }

  const matchMap = new Map(matches.map((m) => [m.id, m]));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navy gradient header */}
      <div className="bg-gradient-to-br from-[#1e3a5f] to-[#15304f] text-white px-5 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <UserPlus size={22} />
            용병 관리
          </h1>
          {admin && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 bg-[#16a34a] text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-600 active:bg-green-700 transition-colors shadow-lg shadow-green-900/20"
            >
              <Plus size={16} />
              용병 추가
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Registration form */}
        {showAddForm && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">새 용병 등록</h2>
            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">이름</label>
                <input
                  type="text"
                  placeholder="이름"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                  전화번호
                </label>
                <input
                  type="tel"
                  placeholder="010-0000-0000"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent"
                />
              </div>

              {/* Position multi-select checkboxes grouped by category */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                  선호 포지션 (복수 선택 가능)
                </label>
                <div className="space-y-2.5">
                  {POSITION_CATEGORIES.map((cat) => {
                    const catPositions = POSITIONS.filter((p) => p.category === cat.label);
                    return (
                      <div key={cat.label}>
                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">
                          {cat.name}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {catPositions.map((p) => {
                            const isChecked = selectedPositions.includes(p.value);
                            const posColor = getPositionColor(p.value);
                            return (
                              <button
                                key={p.value}
                                type="button"
                                onClick={() => togglePosition(p.value)}
                                className={`text-[11px] px-2.5 py-1.5 rounded-lg font-medium border transition-all ${
                                  isChecked
                                    ? `${posColor} border-current ring-1 ring-current/30 shadow-sm`
                                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                {p.value}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Selected positions badges */}
                {selectedPositions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedPositions.map((pos) => (
                      <span
                        key={pos}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getPositionColor(pos)}`}
                      >
                        {pos}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Match select */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                  참여 매치
                </label>
                {availableMatches.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">
                    참여 가능한 매치가 없습니다. 매치를 먼저 생성하세요.
                  </p>
                ) : (
                  <select
                    value={newMatchId}
                    onChange={(e) => setNewMatchId(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent bg-white"
                  >
                    <option value="">매치를 선택하세요</option>
                    {availableMatches.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({formatDate(m.date)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleAddGuest}
                  disabled={!newName.trim() || !newMatchId || selectedPositions.length === 0}
                  className="flex-1 bg-[#16a34a] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  용병 등록
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewName('');
                    setNewPhone('');
                    setSelectedPositions([]);
                    setNewMatchId('');
                  }}
                  className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {guests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <UserPlus size={48} className="mb-3" />
            <p className="text-lg font-medium">등록된 용병이 없습니다</p>
            <p className="text-sm mt-1">위의 버튼을 눌러 용병을 추가하세요</p>
          </div>
        ) : (
          <div className="space-y-5">
            {Array.from(guestsByMatch.entries()).map(([matchId, matchGuests]) => {
              const match = matchMap.get(matchId);
              return (
                <div key={matchId}>
                  {/* Match section header */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Calendar size={13} className="text-[#1e3a5f]" />
                    <span className="text-xs font-bold text-gray-700">
                      {match ? match.title : '알 수 없는 매치'}
                    </span>
                    {match && (
                      <>
                        <span className="text-[10px] text-gray-400">
                          {formatDate(match.date)}
                        </span>
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <MapPin size={10} />
                          {match.location}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    {matchGuests.map((guest) => {
                      const avg = averageRating(guest);
                      const isExpanded = expandedId === guest.id;

                      return (
                        <div
                          key={guest.id}
                          className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
                        >
                          <button
                            onClick={() =>
                              setExpandedId(isExpanded ? null : guest.id)
                            }
                            className="w-full px-4 py-3.5 flex items-center justify-between text-left"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-sm font-bold shrink-0">
                                {guest.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-gray-900">
                                    {guest.name}
                                  </span>
                                  <div className="flex flex-wrap gap-0.5">
                                    {guest.positions.map((pos) => (
                                      <span
                                        key={pos}
                                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getPositionColor(pos)}`}
                                      >
                                        {pos}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {guest.phone && (
                                    <span className="text-xs text-gray-400 flex items-center gap-0.5">
                                      <Phone size={10} />
                                      {guest.phone}
                                    </span>
                                  )}
                                  <StarRating score={Math.round(avg)} size={12} />
                                  {guest.ratings.length > 0 && (
                                    <span className="text-[10px] text-gray-500">
                                      {avg.toFixed(1)} ({guest.ratings.length}회)
                                    </span>
                                  )}
                                  {guest.ratings.length === 0 && (
                                    <span className="text-[10px] text-gray-400">
                                      평가 없음
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {isExpanded ? (
                              <ChevronUp size={18} className="text-gray-400" />
                            ) : (
                              <ChevronDown size={18} className="text-gray-400" />
                            )}
                          </button>

                          {isExpanded && (
                            <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                              {/* Average score display */}
                              {guest.ratings.length > 0 && (
                                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 text-center border border-green-100">
                                  <p className="text-sm text-gray-600 mb-1">평균 평점</p>
                                  <p className="text-3xl font-bold text-[#16a34a]">
                                    {avg.toFixed(1)}
                                  </p>
                                  <StarRating score={Math.round(avg)} size={20} />
                                </div>
                              )}

                              {/* Past ratings */}
                              {guest.ratings.length > 0 && (
                                <div>
                                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                                    평가 기록
                                  </h3>
                                  <div className="space-y-2">
                                    {[...guest.ratings].reverse().map((rating, idx) => (
                                      <div key={idx} className="bg-gray-50 rounded-xl p-3">
                                        <div className="flex items-center justify-between mb-1">
                                          <StarRating score={rating.score} size={14} />
                                          <span className="text-xs text-gray-400">
                                            {formatDate(rating.date)}
                                          </span>
                                        </div>
                                        {rating.comment && (
                                          <p className="text-sm text-gray-600 mt-1">
                                            {rating.comment}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Add rating form */}
                              <div>
                                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                                  평가 추가
                                </h3>
                                <div className="space-y-2">
                                  <div>
                                    <StarRating
                                      score={ratingScore}
                                      size={24}
                                      interactive
                                      onChange={setRatingScore}
                                    />
                                  </div>
                                  <textarea
                                    placeholder="코멘트 (선택)"
                                    value={ratingComment}
                                    onChange={(e) => setRatingComment(e.target.value)}
                                    rows={2}
                                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent resize-none"
                                  />
                                  <button
                                    onClick={() => handleAddRating(guest.id)}
                                    disabled={ratingScore === 0}
                                    className="w-full bg-[#16a34a] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                  >
                                    평가 등록
                                  </button>
                                </div>
                              </div>

                              {/* 매치 변경 (admin only) */}
                              {admin && (
                                <div>
                                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                                    참여 매치 변경
                                  </h3>
                                  <select
                                    value={guest.matchId}
                                    onChange={async (e) => {
                                      await updateGuest(guest.id, { matchId: e.target.value });
                                    }}
                                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent bg-white"
                                  >
                                    {!matches.find(m => m.id === guest.matchId) && (
                                      <option value={guest.matchId}>삭제된 매치</option>
                                    )}
                                    {matches.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.title} ({formatDate(m.date)}) {m.status === 'done' ? '[종료]' : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {/* Delete button (admin only) */}
                              {admin && (
                                <div className="pt-2 border-t border-gray-100">
                                  {deleteConfirmId === guest.id ? (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleDelete(guest.id)}
                                        className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
                                      >
                                        삭제 확인
                                      </button>
                                      <button
                                        onClick={() => setDeleteConfirmId(null)}
                                        className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                                      >
                                        취소
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setDeleteConfirmId(guest.id)}
                                      className="flex items-center justify-center gap-1.5 w-full text-red-500 py-2.5 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors"
                                    >
                                      <Trash2 size={14} />
                                      용병 삭제
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
