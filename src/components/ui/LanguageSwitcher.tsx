import './language-switcher.css';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useI18n, type Lang } from '../../i18n';

/** Flags are drawn as SVG: emoji flags do not show on Windows. */
function VietnamFlag() {
  return <svg viewBox="0 0 30 20" aria-hidden="true" className="lang-flag">
    <rect width="30" height="20" fill="#da251d" />
    <polygon fill="#ffff00" points="15,4 16.18,7.63 20,7.63 16.91,9.87 18.09,13.5 15,11.26 11.91,13.5 13.09,9.87 10,7.63 13.82,7.63" />
  </svg>;
}

function UkFlag() {
  return <svg viewBox="0 0 60 30" aria-hidden="true" className="lang-flag" preserveAspectRatio="none">
    <clipPath id="lang-uk-clip"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
    <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
    <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#lang-uk-clip)" stroke="#c8102e" strokeWidth="4" />
    <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
    <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
  </svg>;
}

const OPTIONS: { value: Lang; short: string; name: string; Flag: () => React.JSX.Element }[] = [
  { value: 'vi', short: 'VI', name: 'Tiếng Việt', Flag: VietnamFlag },
  { value: 'en', short: 'EN', name: 'English', Flag: UkFlag },
];

/** Language dropdown with flags. Each option names its own language so it reads correctly whatever is selected. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const current = OPTIONS.find(o => o.value === lang) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const onDown = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const choose = (value: Lang) => { setLang(value); setOpen(false); button.current?.focus(); };

  const onMenuKey = (event: React.KeyboardEvent) => {
    const items = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); button.current?.focus(); }
    else if (event.key === 'Tab') setOpen(false);
    else if (event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1) % items.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
  };

  const CurrentFlag = current.Flag;
  return <div ref={wrap} className={`lang-switch ${className}`}>
    <button ref={button} type="button" className={`lang-switch-button ${open ? 'is-open' : ''}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-label={`${t('Ngôn ngữ')}: ${current.name}`} title={t('Ngôn ngữ')}
      onClick={() => setOpen(v => !v)}
      onKeyDown={event => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true); } }}>
      <CurrentFlag />
      <span className="lang-switch-code">{current.short}</span>
      <ChevronDown size={14} className="lang-switch-chevron" aria-hidden="true" />
    </button>
    {open && <div id={id} role="menu" aria-label={t('Ngôn ngữ')} className="lang-menu" onKeyDown={onMenuKey}>
      {OPTIONS.map(option => {
        const Flag = option.Flag;
        const active = option.value === lang;
        return <button key={option.value} type="button" role="menuitemradio" aria-checked={active} lang={option.value}
          className={`lang-menu-item ${active ? 'is-active' : ''}`} onClick={() => choose(option.value)}>
          <Flag /><span>{option.name}</span>
          {active && <Check size={15} className="lang-menu-check" aria-hidden="true" />}
        </button>;
      })}
    </div>}
  </div>;
}
