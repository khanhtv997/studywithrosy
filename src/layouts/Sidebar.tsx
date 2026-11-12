import { ChevronRight, GraduationCap, PanelLeftClose, PanelLeftOpen, Sparkles, X } from 'lucide-react';
import { NavLink } from 'react-router';
import { BrandLogo } from '../components/ui/BrandLogo';
import { DonateButton } from '../components/ui/DonateButton';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { navigationFor } from './navigation';

interface SidebarProps {
  mobileOpen: boolean;
  isDesktop: boolean;
  /** Desktop only: icons-only rail. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, isDesktop, collapsed, onToggleCollapsed, onClose }: SidebarProps) {
  const { currentUser, userRole, pendingReviewsCount, classes, activeStudent } = useApp();
  const { t } = useI18n();
  if (!currentUser || !userRole) return null;
  const items = navigationFor(userRole);
  const rail = isDesktop && collapsed;
  const studentClass = classes.find(item => item.id === activeStudent?.classId)?.name;

  return <aside id="app-sidebar" className={`app-sidebar ${mobileOpen ? 'is-open' : ''} ${rail ? 'is-collapsed' : ''}`}
    inert={!isDesktop && !mobileOpen} aria-label={t('Điều hướng chính')}>
    <div className="app-sidebar-brand">
      <span className="app-sidebar-logo"><BrandLogo size={40} /></span>
      <span className="app-sidebar-wordmark"><strong>EduPath</strong><small>{t('Không gian học tập')}</small></span>
      <button type="button" className="app-sidebar-close" aria-label={t('Đóng menu')} onClick={onClose}><X size={20}/></button>
    </div>
    <div className="app-sidebar-scroll">
      <p className="app-sidebar-label">{t('MENU')}</p>
      <nav className="app-sidebar-nav" aria-label={t('Các trang')}>
        {items.map(item => {
          const label = t(item.label);
          const pending = item.path === '/grading' && pendingReviewsCount > 0;
          return <NavLink key={item.path} to={item.path} onClick={onClose} data-tooltip={rail ? label : undefined}
            aria-label={rail ? (pending ? t('{label}, {count} bài chờ duyệt', { label, count: pendingReviewsCount }) : label) : undefined}
            className={({ isActive }) => `app-nav-link ${isActive ? 'is-active' : ''}`}>
            <span className="app-nav-icon">
              <item.icon size={19} strokeWidth={1.9} aria-hidden="true" />
              {pending && rail && <i className="app-nav-dot" aria-hidden="true" />}
            </span>
            <span className="app-nav-label">{label}</span>
            {pending && <span className="app-nav-count" aria-label={t('{count} bài chờ duyệt', { count: pendingReviewsCount })}>{pendingReviewsCount}</span>}
            <ChevronRight className="app-nav-chevron" size={16} aria-hidden="true" />
          </NavLink>;
        })}
      </nav>
      <div className="app-sidebar-card">
        <span className="app-sidebar-card-icon">{userRole === 'student' ? <GraduationCap size={20} aria-hidden="true"/> : <Sparkles size={19} aria-hidden="true"/>}</span>
        <strong>{userRole === 'student' ? t('Cùng học mỗi ngày') : t('Một nơi cho lớp học')}</strong>
        <p>{userRole === 'student'
          ? t('{className} đang chờ em khám phá.', { className: studentClass || t('Lớp của em') })
          : t('Tổ chức bài học, theo dõi tiến độ và đưa ra phản hồi kịp thời.')}</p>
      </div>
      <DonateButton rail={rail} onOpen={onClose} />
    </div>
    <div className="app-sidebar-bottom">
      {isDesktop ? (
        <button type="button" className="app-sidebar-toggle" onClick={onToggleCollapsed} aria-expanded={!collapsed} aria-controls="app-sidebar"
          data-tooltip={rail ? t('Mở rộng menu') : undefined} aria-label={collapsed ? t('Mở rộng menu') : t('Thu gọn menu')}>
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          <span className="app-nav-label">{t('Thu gọn')}</span>
        </button>
      ) : <span className="app-sidebar-tagline"><span className="app-sidebar-bottom-dot" />{t('Học tập rõ ràng hơn, mỗi ngày.')}</span>}
    </div>
  </aside>;
}
