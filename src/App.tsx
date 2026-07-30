import { useState, useEffect, useRef } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Home, Users, LayoutGrid, Trophy, UserPlus, LogOut, Megaphone } from 'lucide-react';
import { getCurrentUser, logout, isSessionExpired, refreshActivity, getMatches, subscribe, getAnnouncements, getFeedbacks } from './lib/store';
import { showNotification } from './lib/notifications';
import type { Member, Match } from './lib/types';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import MembersPage from './pages/MembersPage';
import LineupPage from './pages/LineupPage';
import MatchResultPage from './pages/MatchResultPage';
import GuestsPage from './pages/GuestsPage';
import AttendPage from './pages/AttendPage';
import CoachPage from './pages/CoachPage';
import InstallBanner from './components/InstallBanner';

const tabs = [
  { to: '/', icon: Home, label: '홈' },
  { to: '/members', icon: Users, label: '멤버' },
  { to: '/lineup', icon: LayoutGrid, label: '라인업' },
  { to: '/match', icon: Trophy, label: '매치' },
  { to: '/coach', icon: Megaphone, label: '감독' },
  { to: '/guests', icon: UserPlus, label: '용병' },
];

export default function App() {
  const [user, setUser] = useState<Member | null>(getCurrentUser);
  const [showLogoutMenu, setShowLogoutMenu] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isLoggedIn = user !== null;
  const isLoginPage = location.pathname === '/login';

  // Sync user state when navigating
  useEffect(() => {
    setUser(getCurrentUser());
  }, [location.pathname]);

  // 세션 만료 체크 (1시간 무반응 시 자동 로그아웃)
  useEffect(() => {
    if (!isLoggedIn) return;

    // 페이지 로드 시 세션 만료 확인
    if (isSessionExpired()) {
      logout();
      setUser(null);
      navigate('/login');
      return;
    }

    // 유저 활동 감지 → 타임스탬프 갱신
    const handleActivity = () => refreshActivity();
    const events = ['click', 'touchstart', 'keydown', 'scroll'];
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));

    // 1분마다 세션 만료 체크
    const interval = setInterval(() => {
      if (isSessionExpired()) {
        logout();
        setUser(null);
        navigate('/login');
      }
    }, 60 * 1000);

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity));
      clearInterval(interval);
    };
  }, [isLoggedIn, navigate]);

  // 로그인 + 알림 권한 있으면 FCM 토큰 등록/갱신
  useEffect(() => {
    if (!isLoggedIn) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    import('./lib/push').then(({ registerPush }) => registerPush());
  }, [isLoggedIn]);

  // Firestore 변경 감지 → 자동 알림
  const prevMatchesRef = useRef<Map<string, Match> | null>(null);
  useEffect(() => {
    if (!isLoggedIn) return;
    // 첫 스냅샷은 초기 상태로만 저장 (알림 X)
    prevMatchesRef.current = new Map(getMatches().map(m => [m.id, m]));

    return subscribe(() => {
      const current = getMatches();
      const prev = prevMatchesRef.current;
      if (!prev) {
        prevMatchesRef.current = new Map(current.map(m => [m.id, m]));
        return;
      }
      for (const m of current) {
        const before = prev.get(m.id);
        // 신규 매치 생성
        if (!before) {
          const dateStr = new Date(m.date).toLocaleDateString('ko-KR');
          showNotification(
            '새 매치가 등록되었습니다',
            `${m.title} · ${dateStr} · ${m.location}`,
            { url: '/match', tag: 'match-new', dedupeKey: `match-new-${m.id}` }
          );
        } else if (before.status !== m.status) {
          // 상태 전환
          if (m.status === 'lineup' || m.status === 'playing') {
            showNotification(
              '라인업이 나왔습니다',
              `${m.title} · 축구장에서 확인하세요`,
              { url: `/lineup?matchId=${m.id}`, tag: 'lineup', dedupeKey: `lineup-${m.id}` }
            );
          } else if (m.status === 'voting') {
            showNotification(
              'POM 투표가 시작되었습니다',
              `${m.title} · 이번 경기 MVP를 뽑아주세요`,
              { url: '/', tag: 'voting', dedupeKey: `voting-${m.id}` }
            );
          } else if (m.status === 'done') {
            const inCount = (m.attendees || []).length;
            showNotification(
              '매치가 종료되었습니다',
              `${m.title} · 결과: ${m.scoreA} : ${m.scoreB}${inCount ? ` · ${inCount}명 참여` : ''}`,
              { url: '/match', tag: 'done', dedupeKey: `done-${m.id}` }
            );
          }
        }
      }
      prevMatchesRef.current = new Map(current.map(m => [m.id, m]));
    });
  }, [isLoggedIn]);

  // 감독 공지 / 내 편지 변경 감지 → 앱 켜져 있으면 즉시 알림
  const prevAnnIdsRef = useRef<Set<string> | null>(null);
  const prevFbIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!isLoggedIn) return;
    prevAnnIdsRef.current = new Set(getAnnouncements().map(a => a.id));
    const me = getCurrentUser();
    prevFbIdsRef.current = new Set(
      getFeedbacks().filter(f => f.memberId === me?.id).map(f => f.id)
    );

    return subscribe(() => {
      const meNow = getCurrentUser();

      // 새 공지
      const anns = getAnnouncements();
      const prevAnn = prevAnnIdsRef.current;
      if (prevAnn) {
        for (const a of anns) {
          if (!prevAnn.has(a.id)) {
            showNotification('감독의 한마디', a.content, {
              url: '/coach', tag: 'announcement', dedupeKey: `ann-${a.id}`,
            });
          }
        }
      }
      prevAnnIdsRef.current = new Set(anns.map(a => a.id));

      // 나에게 온 새 편지
      const myFbs = getFeedbacks().filter(f => f.memberId === meNow?.id);
      const prevFb = prevFbIdsRef.current;
      if (prevFb) {
        for (const f of myFbs) {
          if (!prevFb.has(f.id)) {
            showNotification('감독에게서 편지가 도착했습니다', f.content, {
              url: '/coach', tag: 'feedback', dedupeKey: `fb-${f.id}`,
            });
          }
        }
      }
      prevFbIdsRef.current = new Set(myFbs.map(f => f.id));
    });
  }, [isLoggedIn]);

  const handleLogin = () => {
    setUser(getCurrentUser());
    const intended = sessionStorage.getItem('ojifc_postLoginPath');
    if (intended) {
      sessionStorage.removeItem('ojifc_postLoginPath');
      navigate(intended);
    } else {
      navigate('/');
    }
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setShowLogoutMenu(false);
    navigate('/login');
  };

  // Redirect to login if not logged in (intended path 보존)
  if (!isLoggedIn && !isLoginPage) {
    // 들어가려던 페이지를 저장 (로그인 후 복귀)
    const intended = location.pathname + location.search;
    if (intended && intended !== '/') {
      sessionStorage.setItem('ojifc_postLoginPath', intended);
    }
    return (
      <div className="w-full min-h-screen bg-gray-50">
        <Routes>
          <Route path="*" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
        </Routes>
      </div>
    );
  }

  // Login page (no nav bar)
  if (isLoginPage) {
    return (
      <div className="w-full min-h-screen bg-gray-50">
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-50 relative">
      {/* PWA 설치 / 알림 권한 배너 */}
      <InstallBanner />

      {/* Top bar with user info */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-100 px-4 py-2.5 flex items-center justify-between">
        <span className="text-sm font-bold text-[#1e3a5f]">오지FC</span>
        <div className="relative">
          <button
            onClick={() => setShowLogoutMenu(!showLogoutMenu)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-xs font-bold">
              {user?.name.charAt(0)}
            </div>
            <span className="text-sm font-medium text-gray-700">{user?.name}</span>
          </button>
          {showLogoutMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowLogoutMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-50 w-36 overflow-hidden">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-600 font-medium hover:bg-red-50 transition-colors"
                >
                  <LogOut size={16} />
                  로그아웃
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <main className="pb-20">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/lineup" element={<LineupPage />} />
          <Route path="/match" element={<MatchResultPage />} />
          <Route path="/guests" element={<GuestsPage />} />
          <Route path="/coach" element={<CoachPage />} />
          <Route path="/attend" element={<AttendPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="w-full flex">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-2 pt-2.5 text-[11px] transition-colors ${
                  isActive ? 'text-[#16a34a] font-bold' : 'text-gray-400 hover:text-gray-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
                  <span className={`mt-1 ${isActive ? 'font-bold' : ''}`}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
