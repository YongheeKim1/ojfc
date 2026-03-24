import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Home, Users, LayoutGrid, Trophy, UserPlus, LogOut } from 'lucide-react';
import { getCurrentUser, logout } from './lib/store';
import type { Member } from './lib/types';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import MembersPage from './pages/MembersPage';
import LineupPage from './pages/LineupPage';
import MatchResultPage from './pages/MatchResultPage';
import GuestsPage from './pages/GuestsPage';

const tabs = [
  { to: '/', icon: Home, label: '홈' },
  { to: '/members', icon: Users, label: '멤버' },
  { to: '/lineup', icon: LayoutGrid, label: '라인업' },
  { to: '/match', icon: Trophy, label: '매치' },
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

  const handleLogin = () => {
    setUser(getCurrentUser());
    navigate('/');
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setShowLogoutMenu(false);
    navigate('/login');
  };

  // Redirect to login if not logged in (and not already on login page)
  if (!isLoggedIn && !isLoginPage) {
    return (
      <div className="max-w-[480px] mx-auto min-h-screen bg-gray-50">
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
      <div className="max-w-[480px] mx-auto min-h-screen bg-gray-50">
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="max-w-[480px] mx-auto min-h-screen bg-gray-50 relative">
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
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="max-w-[480px] mx-auto flex">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-2 pt-2.5 text-xs transition-colors ${
                  isActive ? 'text-[#16a34a] font-bold' : 'text-gray-400 hover:text-gray-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
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
