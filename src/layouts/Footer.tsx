import { useI18n } from '../i18n';

export function Footer() {
  const { t } = useI18n();
  return <footer className="app-footer">
    <span>© {new Date().getFullYear()} EduAssess</span>
    <span>{t('Học tập · Tiến bộ · Kết nối')}</span>
  </footer>;
}
