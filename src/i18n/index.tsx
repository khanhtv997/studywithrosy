import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import enAssessments from './en/assessments';
import enComposer from './en/composer';
import enCore from './en/core';
import enRoster from './en/roster';
import enSharing from './en/sharing';
import enStudentAdmin from './en/student-admin';
import viServer from './vi-server';

/**
 * Two languages. Vietnamese is the source: components call t('Vietnamese text'), and English comes
 * from the en/* tables keyed by that same text. A missing English entry falls back to Vietnamese.
 * Placeholders look like {name}: t('Đã lưu {count} học sinh', { count: 3 }).
 */
export type Lang = 'vi' | 'en';
export type Vars = Record<string, string | number>;

const en: Record<string, string> = { ...enCore, ...enComposer, ...enAssessments, ...enRoster, ...enStudentAdmin, ...enSharing };
// Server messages are mostly English; in Vietnamese mode they are mapped to Vietnamese.
const vi: Record<string, string> = viServer;

const STORAGE_KEY = 'eduassess_lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'vi' || saved === 'en') return saved;
  } catch { /* storage may be blocked */ }
  return 'vi';
}

let currentLang: Lang = initialLang();

/** Translate outside React (API errors, helpers). Inside components prefer useI18n().t so the view re-renders. */
export function translate(text: string, vars?: Vars): string {
  const table = currentLang === 'en' ? en : vi;
  const raw = table[text] ?? text;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export const localeFor = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'vi-VN');
/** For number and date formatting outside React. */
export const currentLocale = () => localeFor(currentLang);

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (text: string, vars?: Vars) => string;
  /** 'vi-VN' or 'en-GB', for toLocaleString / toLocaleDateString. */
  locale: string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);
  const setLang = useCallback((next: Lang) => {
    currentLang = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    document.documentElement.lang = next;
    setLangState(next);
  }, []);
  // A new t per language makes every component that uses it re-render on a switch.
  const value = useMemo<I18nValue>(() => ({ lang, setLang, t: (text, vars) => translate(text, vars), locale: localeFor(lang) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside LanguageProvider');
  return value;
}
