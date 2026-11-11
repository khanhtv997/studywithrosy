import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '../../i18n';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Optional line under the title. */
  subtitle?: ReactNode;
  /** Replaces the default title block, e.g. to show an avatar. */
  header?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'lg' | 'xl';
  /** Prevents closing while a request is running. */
  dismissible?: boolean;
}

const SIZES = { sm: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-5xl' };

/**
 * Accessible dialog: labelled, closes on Escape, focuses itself and locks page scroll.
 * Rendered into document.body so a transformed ancestor (e.g. the page-enter animation)
 * cannot shrink the fixed overlay to the content area.
 */
export function Modal({ title, subtitle, header, onClose, children, footer, size = 'sm', dismissible = true }: ModalProps) {
  const titleId = useId();
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Captured during the first render, before any autoFocus inside the dialog moves focus.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);

  useEffect(() => {
    // Respect an autoFocus field inside the dialog; otherwise focus the dialog itself.
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = oldOverflow; opener?.focus?.(); };
  }, [opener]);

  useEffect(() => {
    if (!dismissible) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dismissible]);

  const compact = size === 'sm';
  return createPortal(<div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-2 backdrop-blur-xs sm:p-4"
    onMouseDown={event => { if (dismissible && event.target === event.currentTarget) onClose(); }}>
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
      className={`my-auto flex max-h-[92vh] w-full ${SIZES[size]} flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl outline-hidden`}>
      <div className={`flex items-center justify-between gap-4 border-b border-slate-200 ${compact ? 'px-6 py-4' : 'bg-gradient-to-r from-indigo-50/60 to-white px-6 py-4'}`}>
        <div id={titleId} className="min-w-0">
          {header ?? <>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-700">{subtitle}</p>}
          </>}
        </div>
        <button type="button" onClick={onClose} disabled={!dismissible} aria-label={t('Đóng')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 disabled:opacity-40">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">{footer}</div>}
    </div>
  </div>, document.body);
}
