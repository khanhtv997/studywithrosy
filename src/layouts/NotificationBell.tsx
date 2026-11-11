import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Bell, CheckCheck, ClipboardCheck, FileText, GraduationCap, Share2 } from 'lucide-react';
import { eduApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { currentLocale, translate, useI18n } from '../i18n';
import type { AppNotification, NotificationType } from '../types';

const POLL_MS = 30_000;

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  assessment_published: FileText,
  submission_received: ClipboardCheck,
  submission_reviewed: GraduationCap,
  assessment_shared: Share2,
};

/** "vừa xong", "5 phút trước", "3 ngày trước", then a date. */
function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return translate('vừa xong');
  if (seconds < 3600) return translate('{count} phút trước', { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return translate('{count} giờ trước', { count: Math.floor(seconds / 3600) });
  if (seconds < 7 * 86400) return translate('{count} ngày trước', { count: Math.floor(seconds / 86400) });
  return new Date(iso).toLocaleDateString(currentLocale());
}

/** Header bell: unread badge, dropdown list, polling every 30 seconds and on navigation. */
export function NotificationBell() {
  const { syncData } = useApp();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const unreadRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await eduApi.notifications();
      // New notifications usually mean new assessments or submissions: refresh the page data too.
      if (unreadRef.current !== null && data.unreadCount > unreadRef.current) void syncData();
      unreadRef.current = data.unreadCount;
      setItems(data.items);
      setUnread(data.unreadCount);
      setError(false);
    } catch { setError(true); }
  }, [syncData]);

  // The interval always calls the latest load (which closes over the latest syncData).
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadRef.current(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);
  // Loads on mount and again after each navigation.
  useEffect(() => { void loadRef.current(); }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  const markLocallyRead = (ids: Set<string> | 'all') => {
    setItems(list => list.map(item => ids === 'all' || ids.has(item.id) ? { ...item, read: true } : item));
  };

  const openItem = async (item: AppNotification) => {
    setOpen(false);
    if (!item.read) {
      markLocallyRead(new Set([item.id]));
      setUnread(count => Math.max(0, count - 1));
      unreadRef.current = Math.max(0, (unreadRef.current ?? 1) - 1);
      eduApi.markNotificationRead(item.id).catch(() => void load());
    }
    if (item.link) navigate(item.link);
  };

  const readAll = async () => {
    markLocallyRead('all');
    setUnread(0);
    unreadRef.current = 0;
    try { await eduApi.markAllNotificationsRead(); } catch { void load(); }
  };

  const label = unread ? t('Thông báo, {count} chưa đọc', { count: unread }) : t('Thông báo');
  return <div className="app-notify" ref={rootRef}>
    <button ref={buttonRef} type="button" className="app-notify-button" aria-label={label} title={label}
      aria-haspopup="true" aria-expanded={open} aria-controls="app-notify-panel"
      onClick={() => { setOpen(value => !value); if (!open) void load(); }}>
      <Bell size={18} aria-hidden="true" />
      {unread > 0 && <span className="app-notify-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>

    {open && <div id="app-notify-panel" className="app-notify-panel" role="region" aria-label={t('Thông báo')}>
      <div className="app-notify-head">
        <strong>{t('Thông báo')}</strong>
        {unread > 0 && <button type="button" className="app-notify-readall" onClick={() => void readAll()}><CheckCheck size={15} aria-hidden="true" />{t('Đánh dấu đã đọc hết')}</button>}
      </div>
      {error && !items.length ? <p className="app-notify-empty">{t('Không tải được thông báo.')}</p>
        : !items.length ? <div className="app-notify-empty"><Bell size={26} aria-hidden="true" /><span>{t('Chưa có thông báo nào.')}</span></div>
        : <ul className="app-notify-list">
          {items.map(item => {
            const Icon = TYPE_ICON[item.type] ?? Bell;
            return <li key={item.id}>
              <button type="button" className={`app-notify-item ${item.read ? '' : 'is-unread'}`} onClick={() => void openItem(item)}>
                <span className={`app-notify-icon type-${item.type}`}><Icon size={16} aria-hidden="true" /></span>
                <span className="app-notify-text">
                  <strong>{item.title}</strong>
                  {item.body && <span>{item.body}</span>}
                  <small>{timeAgo(item.createdAt)}</small>
                </span>
                {!item.read && <span className="app-notify-dot" aria-label={t('Chưa đọc')} />}
              </button>
            </li>;
          })}
        </ul>}
    </div>}
  </div>;
}
