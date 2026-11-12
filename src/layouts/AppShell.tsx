import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { UserRoundPen, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ProfileModal } from '../components/auth/ProfileModal';
import { useI18n } from '../i18n';
import { Footer } from './Footer';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { navItemFor } from './navigation';
import './app-shell.css';
import './product-design.css';

const COLLAPSE_KEY = 'eduassess_sidebar_collapsed';
const REMINDER_KEY = 'eduassess_profile_reminder_hidden';

/** Teachers without a phone number or school (e.g. signed up with Google) are asked to add them; "Để sau" hides it for this session. */
function ProfileReminder() {
  const { currentUser } = useApp();
  const { t } = useI18n();
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(REMINDER_KEY) === '1'; } catch { return false; } });
  const [editing, setEditing] = useState(false);
  if (!currentUser || currentUser.role !== 'teacher' || (currentUser.phone && currentUser.school)) return null;
  const hide = () => { setHidden(true); try { sessionStorage.setItem(REMINDER_KEY, '1'); } catch { /* storage may be blocked */ } };
  return <>
    {!hidden && <div role="status" className="app-profile-reminder">
      <UserRoundPen size={18} aria-hidden="true" />
      <span>{t('Hãy bổ sung số điện thoại và trường đang dạy để quản trị viên tiện liên hệ.')}</span>
      <button type="button" className="app-profile-reminder-primary" onClick={() => setEditing(true)}>{t('Cập nhật ngay')}</button>
      <button type="button" className="app-profile-reminder-later" onClick={hide}>{t('Để sau')}</button>
    </div>}
    {editing && <ProfileModal onClose={() => setEditing(false)} />}
  </>;
}
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };

export function AppShell() {
  const { currentUser, error, clearError, loading, classes, reloadData, syncData } = useApp();
  const { t } = useI18n();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const lastPath = useRef(location.pathname);
  const page = navItemFor(currentUser?.role || 'teacher', location.pathname);

  const toggleCollapsed = () => setCollapsed(value => {
    try { localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1'); } catch { /* storage may be blocked */ }
    return !value;
  });

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (lastPath.current !== location.pathname) {
      lastPath.current = location.pathname;
      void syncData();
    }
  }, [location.pathname]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => { setIsDesktop(media.matches); if (media.matches) setMobileOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!mobileOpen || isDesktop) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = oldOverflow; };
  }, [mobileOpen, isDesktop]);

  if (error && classes.length === 0) return <div className="app-unavailable">
    <strong>{t('Không kết nối được dữ liệu')}</strong><p>{error}</p>
    <button type="button" onClick={() => void reloadData()}>{t('Thử lại')}</button>
  </div>;
  return <div className={`app-shell ${isDesktop && collapsed ? 'is-sidebar-collapsed' : ''}`}>
    <a href="#main-content" className="app-skip-link">{t('Bỏ qua điều hướng')}</a>
    <div className={`app-sidebar-scrim ${mobileOpen ? 'is-visible' : ''}`} onClick={() => setMobileOpen(false)} aria-hidden="true" />
    <Sidebar mobileOpen={mobileOpen} isDesktop={isDesktop} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} onClose={() => setMobileOpen(false)} />
    <div className="app-content-column" inert={!isDesktop && mobileOpen}>
      <Header page={page} onMenuClick={() => setMobileOpen(value => !value)} menuOpen={mobileOpen} />
      {error && <div role="alert" className="app-error-banner"><span>{error}</span><button type="button" onClick={clearError} aria-label={t('Đóng thông báo lỗi')}><X size={17}/></button></div>}
      {loading && <div role="status" className="app-loading-strip">{t('Đang cập nhật dữ liệu...')}</div>}
      <ProfileReminder />
      <main id="main-content" tabIndex={-1} className="app-main">
        <div className="app-main-inner">
          <div className="app-route-content" key={location.pathname}><Outlet /></div>
        </div>
      </main>
      <Footer />
    </div>
  </div>;
}
