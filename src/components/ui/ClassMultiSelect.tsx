import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Users } from 'lucide-react';
import type { ClassRoom } from '../../types';
import { useI18n } from '../../i18n';
import './class-multi-select.css';

interface ClassChecklistProps {
  classes: ClassRoom[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Classes that cannot be unticked (e.g. students already submitted), with the reason shown. */
  locked?: Record<string, string>;
  emptyText?: string;
}

/** Checkbox list of classes; used inline in dialogs and inside ClassMultiSelect. */
export function ClassChecklist({ classes, value, onChange, locked = {}, emptyText }: ClassChecklistProps) {
  const { t } = useI18n();
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  const selectable = classes.filter(c => !locked[c.id]).map(c => c.id);
  const allOn = selectable.length > 0 && selectable.every(id => value.includes(id));

  if (!classes.length) return <p className="class-check-empty">{emptyText ?? t('Bạn chưa phụ trách lớp nào.')}</p>;
  return <div className="class-check">
    {classes.length > 1 && <button type="button" className="class-check-all"
      onClick={() => onChange(allOn ? value.filter(id => locked[id]) : [...new Set([...value, ...selectable])])}>
      {allOn ? t('Bỏ chọn tất cả') : t('Chọn tất cả')}
    </button>}
    <ul className="class-check-list">
      {classes.map(c => {
        const on = value.includes(c.id);
        const lock = locked[c.id];
        return <li key={c.id}>
          <label className={`class-check-row ${on ? 'is-on' : ''} ${lock ? 'is-locked' : ''}`} title={lock}>
            <input type="checkbox" checked={on} disabled={!!lock} onChange={() => toggle(c.id)} />
            <span className="class-check-box" aria-hidden="true">{on && <Check size={13} strokeWidth={3} />}</span>
            <span className="class-check-text">
              <strong>{c.name}</strong>
              <small>{c.grade}{lock ? ` · ${lock}` : ''}</small>
            </span>
            <span className="class-check-count"><Users size={13} aria-hidden="true" />{c.studentCount}</span>
          </label>
        </li>;
      })}
    </ul>
  </div>;
}

interface ClassMultiSelectProps extends ClassChecklistProps {
  ariaLabel: string;
  placeholder?: string;
  compact?: boolean;
  className?: string;
}

/** Dropdown that picks one or more classes; looks like SelectField. */
export function ClassMultiSelect({ ariaLabel, placeholder, compact, className = '', ...list }: ClassMultiSelectProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const names = list.classes.filter(c => list.value.includes(c.id)).map(c => c.name);
  const label = !names.length ? placeholder ?? t('Chọn lớp') : names.length <= 2 ? names.join(', ') : t('{count} lớp: {names}', { count: names.length, names: names.join(', ') });

  return <div ref={root} className={`class-multi ${className}`}>
    <button type="button" className={`app-select-trigger w-full ${compact ? 'is-compact' : ''}`} aria-label={ariaLabel}
      aria-expanded={open} aria-controls={panelId} data-state={open ? 'open' : 'closed'} data-placeholder={names.length ? undefined : ''}
      onClick={() => setOpen(v => !v)}>
      <span>{label}</span>
      <span className="app-select-icon"><ChevronDown size={16} aria-hidden="true" /></span>
    </button>
    {open && <div id={panelId} className="class-multi-panel" role="group" aria-label={ariaLabel}>
      <ClassChecklist {...list} />
    </div>}
  </div>;
}
