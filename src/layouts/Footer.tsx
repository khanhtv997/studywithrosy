import { useI18n } from '../i18n';
import { DonateButton } from '../components/ui/DonateButton';

export function Footer() {
  const { t } = useI18n();
  return <footer className="app-footer">
    <span>© {new Date().getFullYear()} EduPath</span>
    <DonateButton variant="footer" />
    <span>{t('Học tập · Tiến bộ · Kết nối')}</span>
  </footer>;
}
