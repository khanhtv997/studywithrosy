import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import './row-menu.css';

export interface RowMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Draws a line above this item, to set apart e.g. a delete action. */
  separated?: boolean;
  /** Shown as the item's tooltip, e.g. why it is disabled. */
  hint?: string;
}

const MENU_WIDTH = 220;

/**
 * A "⋯" button that opens a list of row actions. The list is drawn in a portal with fixed
 * position, so a table's scroll box never cuts it off; it opens upward when there is no room below.
 */
export function RowMenu({ items, label }: { items: (RowMenuItem | false | null | undefined)[]; label: string }) {
  const list = items.filter((item): item is RowMenuItem => !!item);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = (focusButton = false) => {
    setOpen(false);
    if (focusButton) button.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const rect = button.current.getBoundingClientRect();
    const height = menu.current?.offsetHeight ?? list.length * 38 + 16;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const roomBelow = window.innerHeight - rect.bottom;
    setPosition(roomBelow < height + 12 && rect.top > roomBelow
      ? { left, bottom: window.innerHeight - rect.top + 6 }
      : { left, top: rect.bottom + 6 });
  }, [open, list.length]);

  // Focus the first item once the menu is placed (it is hidden until then, and hidden items cannot take focus).
  const placed = !!position;
  useEffect(() => {
    if (open && placed) menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [open, placed]);

  useEffect(() => {
    if (!open) { setPosition(null); return; }
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close();
    };
    const onScroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) close(); };
    const onResize = () => close();
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const onMenuKey = (event: React.KeyboardEvent) => {
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close();
    else if (event.key === 'ArrowDown') { event.preventDefault(); buttons[(index + 1) % buttons.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); buttons[(index - 1 + buttons.length) % buttons.length]?.focus(); }
    else if (event.key === 'Home') { event.preventDefault(); buttons[0]?.focus(); }
    else if (event.key === 'End') { event.preventDefault(); buttons[buttons.length - 1]?.focus(); }
  };

  if (!list.length) return null;
  return <>
    <button ref={button} type="button" className={`icon-btn ${open ? 'is-active' : ''}`} aria-label={label} title={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(v => !v)}
      onKeyDown={event => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true); } }}>
      <MoreHorizontal size={17} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menu} id={id} role="menu" aria-label={label} className="row-menu" onKeyDown={onMenuKey}
      style={{ width: MENU_WIDTH, left: position?.left ?? -9999, top: position?.top, bottom: position?.bottom, visibility: position ? 'visible' : 'hidden' }}>
      {list.map((item, i) => <div key={i} role="none">
        {item.separated && i > 0 && <div className="row-menu-sep" role="separator" />}
        <button type="button" role="menuitem" disabled={item.disabled} title={item.hint}
          className={`row-menu-item ${item.danger ? 'is-danger' : ''}`}
          onClick={() => { close(true); item.onSelect(); }}>
          {item.icon}<span>{item.label}</span>
        </button>
      </div>)}
    </div>, document.body)}
  </>;
}
