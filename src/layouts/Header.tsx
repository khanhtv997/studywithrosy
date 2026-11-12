import { useEffect, useRef, useState } from 'react';
import { ChevronDown, KeyRound, LogOut, Menu, UserRoundPen } from 'lucide-react';
import { ChangePasswordModal } from '../components/auth/ChangePassword';
import { ProfileModal } from '../components/auth/ProfileModal';
import { NotificationBell } from './NotificationBell';
import { initialsOf } from '../utils/initials';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import type { AppNavItem } from './navigation';

interface HeaderProps { page: AppNavItem; onMenuClick: () => void; menuOpen: boolean; }

const ROLE_LABEL = { student: 'Học sinh', admin: 'Quản trị viên', teacher: 'Giáo viên' } as const;

/** Avatar button that opens a small menu with the account details and sign-out. */
function UserMenu() {
  const { currentUser, logout } = useApp();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  if (!currentUser) return null;
  const initials = initialsOf(currentUser.name, 'EA');
  const roleLabel = t(ROLE_LABEL[currentUser.role]);

  return <div className="app-user-menu" ref={rootRef}>
    <button ref={buttonRef} type="button" className="app-profile" aria-haspopup="menu" aria-expanded={open} aria-controls="app-user-menu-panel"
      onClick={() => setOpen(value => !value)}>
      <span className="app-avatar">{initials}</span>
      <span className="app-profile-text"><strong>{currentUser.name}</strong><small>{roleLabel}</small></span>
      <ChevronDown size={16} className={`app-profile-chevron ${open ? 'is-open' : ''}`} aria-hidden="true" />
    </button>
    {open && <div id="app-user-menu-panel" role="menu" aria-label={t('Tài khoản')} className="app-user-menu-panel">
      <div className="app-user-menu-info">
        <span className="app-avatar">{initials}</span>
        <span className="min-w-0">
          <strong>{currentUser.name}</strong>
          <small>{currentUser.email}</small>
          <em>{roleLabel}</em>
        </span>
      </div>
      <button type="button" role="menuitem" className="app-user-menu-item" onClick={() => { setOpen(false); setEditingProfile(true); }}>
        <UserRoundPen size={17} aria-hidden="true" />{t('Thông tin cá nhân')}
      </button>
      <button type="button" role="menuitem" className="app-user-menu-item" onClick={() => { setOpen(false); setChangingPassword(true); }}>
        <KeyRound size={17} aria-hidden="true" />{t('Đổi mật khẩu')}
      </button>
      <button type="button" role="menuitem" className="app-user-menu-item is-danger" onClick={() => { setOpen(false); logout(); }}>
        <LogOut size={17} aria-hidden="true" />{t('Đăng xuất')}
      </button>
    </div>}
    {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    {editingProfile && <ProfileModal onClose={() => setEditingProfile(false)} />}
  </div>;
}

export function Header({ page, onMenuClick, menuOpen }: HeaderProps) {
  const { t } = useI18n();
  return <header className="app-header">
    <div className="app-header-leading">
      <button type="button" className="app-header-menu" aria-label={menuOpen ? t('Đóng menu') : t('Mở menu')} aria-controls="app-sidebar" aria-expanded={menuOpen} onClick={onMenuClick}><Menu size={22}/></button>
      <div className="app-header-title"><span className="app-header-eyebrow">EduPath</span><strong>{t(page.title)}</strong></div>
    </div>
    <div className="app-header-actions">
      <LanguageSwitcher className="app-header-lang" />
      <NotificationBell />
      <div className="app-header-divider" />
      <UserMenu />
    </div>
  </header>;
}
