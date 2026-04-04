import { useState, useEffect } from 'react';
import { LogIn, UserPlus, Users, ArrowLeft, Lock } from 'lucide-react';
import { getCurrentUser, setCurrentUser, getMembers, saveMember, subscribe } from '../lib/store';
import { POSITIONS, Position, getPositionColor } from '../lib/types';
import type { Member } from '../lib/types';

const CATEGORY_LABELS: Record<string, string> = {
  GK: 'GK',
  DF: '수비',
  MF: '미드필드',
  FW: '공격',
};

const CATEGORIES = ['GK', 'DF', 'MF', 'FW'];

type Screen = 'welcome' | 'main' | 'register' | 'existing' | 'password';

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [screen, setScreen] = useState<Screen>('main');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([]);
  const [members, setMembers] = useState<Member[]>(getMembers());
  const [currentUser, setCurrentUserState] = useState<Member | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [passwordError, setPasswordError] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUserState(user);
    if (user) setScreen('welcome');
    setMembers(getMembers());
    return subscribe(() => {
      setMembers(getMembers());
    });
  }, []);

  const togglePosition = (pos: Position) => {
    setSelectedPositions(prev =>
      prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]
    );
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedPositions.length === 0 || password.trim().length < 4) return;
    const member = await saveMember({ name: name.trim(), positions: selectedPositions, password: password.trim() });
    setCurrentUser(member);
    onLogin();
  };

  const handleSelectMember = (member: Member) => {
    setSelectedMember(member);
    setPassword('');
    setPasswordError(false);
    setScreen('password');
  };

  const handlePasswordSubmit = () => {
    if (!selectedMember) return;
    const memberInCache = members.find(m => m.id === selectedMember.id);
    const storedPassword = memberInCache?.password || selectedMember.password || '';
    if (password === storedPassword) {
      setCurrentUser(memberInCache || selectedMember);
      onLogin();
    } else {
      setPasswordError(true);
    }
  };

  const handleWelcomeBack = () => {
    onLogin();
  };

  // Welcome back screen (returning user)
  if (screen === 'welcome' && currentUser) {
    const positions = currentUser.positions ?? [];
    return (
      <div className="min-h-screen bg-[#1e3a5f] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm flex flex-col items-center">
          <img src={import.meta.env.BASE_URL + 'logo.png'} alt="AUZI F.C." className="w-32 h-32 mb-6 drop-shadow-lg" />
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-1">오지FC</h1>
          <p className="text-sm text-blue-200 mb-8">AUZI F.C. | SINCE 2026</p>

          <div className="bg-white/10 backdrop-blur rounded-2xl p-6 w-full text-center mb-6">
            <p className="text-blue-200 text-sm mb-1">돌아오신 것을 환영합니다!</p>
            <p className="text-2xl font-bold text-white">{currentUser.name}</p>
            <div className="flex flex-wrap justify-center gap-1.5 mt-2">
              {positions.map(pos => (
                <span key={pos} className={`px-2.5 py-1 rounded-full text-xs font-bold ${getPositionColor(pos)}`}>
                  {pos}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={handleWelcomeBack}
            className="w-full py-3.5 bg-[#16a34a] hover:bg-green-600 active:bg-green-700 text-white rounded-xl text-base font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-900/30"
          >
            <LogIn className="w-5 h-5" />
            입장하기
          </button>

          <button
            onClick={() => {
              setCurrentUserState(null);
              setScreen('main');
            }}
            className="mt-3 text-sm text-blue-300 hover:text-white transition-colors"
          >
            다른 계정으로 로그인
          </button>
        </div>
      </div>
    );
  }

  // Main screen: two buttons
  if (screen === 'main') {
    return (
      <div className="min-h-screen bg-[#1e3a5f] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm flex flex-col items-center">
          <img src={import.meta.env.BASE_URL + 'logo.png'} alt="AUZI F.C." className="w-32 h-32 mb-6 drop-shadow-lg" />
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-1">오지FC</h1>
          <p className="text-sm text-blue-200 mb-10">AUZI F.C. | SINCE 2026</p>

          <button
            onClick={() => setScreen('register')}
            className="w-full py-4 bg-[#16a34a] hover:bg-green-600 active:bg-green-700 text-white rounded-xl text-base font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-900/30 mb-3"
          >
            <UserPlus className="w-5 h-5" />
            새로 등록
          </button>

          <button
            onClick={() => setScreen('existing')}
            className="w-full py-4 bg-white/10 hover:bg-white/20 active:bg-white/25 text-white rounded-xl text-base font-bold transition-colors flex items-center justify-center gap-2 border border-white/20"
          >
            <Users className="w-5 h-5" />
            기존 회원 입장
          </button>
        </div>
      </div>
    );
  }

  // Password input screen
  if (screen === 'password' && selectedMember) {
    const positions = selectedMember.positions ?? [];
    return (
      <div className="min-h-screen bg-[#1e3a5f] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm flex flex-col items-center">
          <img src={import.meta.env.BASE_URL + 'logo.png'} alt="AUZI F.C." className="w-24 h-24 mb-5 drop-shadow-lg" />

          <div className="bg-white/10 backdrop-blur rounded-2xl p-6 w-full text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-[#16a34a]/30 flex items-center justify-center text-lg font-bold text-green-300 mx-auto mb-3">
              {selectedMember.name.charAt(0)}
            </div>
            <p className="text-xl font-bold text-white mb-1">{selectedMember.name}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {positions.map(pos => (
                <span key={pos} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getPositionColor(pos)}`}>
                  {pos}
                </span>
              ))}
            </div>
          </div>

          <div className="w-full space-y-3">
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300/50" />
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setPasswordError(false); }}
                onKeyDown={e => { if (e.key === 'Enter') handlePasswordSubmit(); }}
                placeholder="비밀번호 (4자리 이상)"
                className={`w-full pl-11 pr-4 py-3.5 bg-white/10 border rounded-xl text-sm text-white placeholder-blue-300/50 outline-none focus:ring-2 transition ${
                  passwordError
                    ? 'border-red-400 focus:ring-red-400/50'
                    : 'border-white/20 focus:ring-[#16a34a]/50 focus:border-[#16a34a]'
                }`}
                autoFocus
              />
            </div>
            {passwordError && (
              <p className="text-red-400 text-xs font-medium text-center">비밀번호가 일치하지 않습니다</p>
            )}

            <button
              onClick={handlePasswordSubmit}
              disabled={!password.trim()}
              className="w-full py-3.5 bg-[#16a34a] hover:bg-green-600 active:bg-green-700 text-white rounded-xl text-base font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <LogIn className="w-5 h-5" />
              입장하기
            </button>

            <button
              onClick={() => { setScreen('existing'); setSelectedMember(null); setPassword(''); setPasswordError(false); }}
              className="w-full flex items-center justify-center gap-1 text-sm text-blue-300 hover:text-white transition-colors py-2"
            >
              <ArrowLeft className="w-4 h-4" />
              돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Existing member list
  if (screen === 'existing') {
    return (
      <div className="min-h-screen bg-[#1e3a5f] flex flex-col items-center px-6 py-12">
        <div className="w-full max-w-sm flex flex-col items-center">
          <img src={import.meta.env.BASE_URL + 'logo.png'} alt="AUZI F.C." className="w-20 h-20 mb-4 drop-shadow-lg" />
          <h1 className="text-2xl font-extrabold text-white tracking-tight mb-1">기존 회원 입장</h1>
          <p className="text-sm text-blue-200 mb-6">회원을 선택하세요</p>

          {members.length === 0 ? (
            <div className="w-full bg-white/10 backdrop-blur rounded-2xl p-8 text-center">
              <p className="text-blue-200 text-sm">등록된 회원이 없습니다</p>
              <p className="text-blue-300/50 text-xs mt-1">먼저 새로 등록해주세요</p>
            </div>
          ) : (
            <div className="w-full bg-white/10 backdrop-blur rounded-2xl overflow-hidden divide-y divide-white/10">
              {members.map(member => {
                const positions = member.positions ?? [];
                return (
                  <button
                    key={member.id}
                    onClick={() => handleSelectMember(member)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/10 active:bg-white/15 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-[#16a34a]/30 flex items-center justify-center text-sm font-bold text-green-300">
                      {member.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{member.name}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {positions.map(pos => (
                          <span key={pos} className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${getPositionColor(pos)}`}>
                            {pos}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Lock className="w-4 h-4 text-blue-300/50" />
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setScreen('main')}
            className="mt-4 flex items-center justify-center gap-1 text-sm text-blue-300 hover:text-white transition-colors py-2"
          >
            <ArrowLeft className="w-4 h-4" />
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  // Registration screen
  return (
    <div className="min-h-screen bg-[#1e3a5f] flex flex-col items-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center">
        <img src={import.meta.env.BASE_URL + 'logo.png'} alt="AUZI F.C." className="w-20 h-20 mb-4 drop-shadow-lg" />
        <h1 className="text-2xl font-extrabold text-white tracking-tight mb-1">새 멤버 등록</h1>
        <p className="text-sm text-blue-200 mb-6">오지FC에 오신 것을 환영합니다!</p>

        <form onSubmit={handleRegister} className="w-full bg-white/10 backdrop-blur rounded-2xl p-5 mb-4">
          <div className="space-y-3">
            {/* Name */}
            <div>
              <label className="block text-xs text-blue-200 mb-1.5 font-medium">이름</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="이름을 입력하세요"
                maxLength={10}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-blue-300/50 outline-none focus:ring-2 focus:ring-[#16a34a]/50 focus:border-[#16a34a] transition"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs text-blue-200 mb-1.5 font-medium">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호 (4자리 이상)"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-blue-300/50 outline-none focus:ring-2 focus:ring-[#16a34a]/50 focus:border-[#16a34a] transition"
              />
            </div>

            {/* Position selection */}
            <div>
              <label className="block text-xs text-blue-200 mb-1.5 font-medium">선호 포지션 (복수 선택)</label>
              <div className="space-y-2">
                {CATEGORIES.map(cat => (
                  <div key={cat}>
                    <p className="text-[10px] text-blue-300 font-semibold mb-1">{CATEGORY_LABELS[cat]}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {POSITIONS.filter(p => p.category === cat).map(p => {
                        const isSelected = selectedPositions.includes(p.value);
                        return (
                          <label
                            key={p.value}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#16a34a]/40 border border-[#16a34a] text-white'
                                : 'bg-white/5 border border-white/10 text-blue-200 hover:bg-white/10'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePosition(p.value)}
                              className="sr-only"
                            />
                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'bg-[#16a34a] border-[#16a34a]' : 'border-white/30'
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
              {selectedPositions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {selectedPositions.map(pos => (
                    <span key={pos} className={`px-2.5 py-1 rounded-full text-xs font-bold ${getPositionColor(pos)}`}>
                      {pos}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!name.trim() || selectedPositions.length === 0 || password.trim().length < 4}
              className="w-full py-3.5 bg-[#16a34a] hover:bg-green-600 active:bg-green-700 text-white rounded-xl text-base font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserPlus className="w-5 h-5" />
              등록하기
            </button>
          </div>
        </form>

        <button
          onClick={() => setScreen('main')}
          className="flex items-center justify-center gap-1 text-sm text-blue-300 hover:text-white transition-colors py-2"
        >
          <ArrowLeft className="w-4 h-4" />
          돌아가기
        </button>
      </div>
    </div>
  );
}
