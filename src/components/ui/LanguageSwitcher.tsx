import './language-switcher.css';
import { Languages } from 'lucide-react';
import { useI18n, type Lang } from '../../i18n';

const OPTIONS: { value: Lang; short: string; name: string }[] = [
  { value: 'vi', short: 'VI', name: 'Tiếng Việt' },
  { value: 'en', short: 'EN', name: 'English' },
];

/** VI | EN toggle. Each option names its own language so it reads correctly whatever is selected. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return <div className={`lang-switch ${className}`} role="group" aria-label={t('Ngôn ngữ')}>
    <Languages size={15} className="lang-switch-icon" aria-hidden="true" />
    {OPTIONS.map(option => <button key={option.value} type="button" lang={option.value} title={option.name}
      aria-label={option.name} aria-pressed={lang === option.value} className={lang === option.value ? 'is-active' : ''}
      onClick={() => setLang(option.value)}>{option.short}</button>)}
  </div>;
}
