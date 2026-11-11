import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import React, { useState } from 'react';
import { ArrowRight, BookOpenCheck, ChartNoAxesCombined, ClipboardCheck, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BrandLogo } from '../components/ui/BrandLogo';
import { useI18n } from '../i18n';
import './login.css';

export const LoginPage: React.FC = () => {
  const { login } = useApp();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try { await login(email.trim(), password); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('Không thể đăng nhập. Vui lòng thử lại.')); }
    finally { setBusy(false); }
  };

  return <main className="login-page">
    <LanguageSwitcher className="login-lang" />
    <div className="login-ambient login-ambient-one" aria-hidden="true" />
    <div className="login-ambient login-ambient-two" aria-hidden="true" />
    <div className="login-shell">
      <section className="login-story" aria-label={t('Giới thiệu EduAssess')}>
        <div className="login-story-grid" aria-hidden="true" />
        <div className="login-orb login-orb-one" aria-hidden="true" />
        <div className="login-orb login-orb-two" aria-hidden="true" />
        <div className="login-story-content">
          <div className="login-brand login-brand-light"><span className="login-brand-icon"><BrandLogo size={40} /></span><span>EduAssess</span></div>
          <div className="login-story-copy">
            <span className="login-kicker"><Sparkles size={14}/> {t('Không gian học tập thông minh')}</span>
            <h1>{t('Học tốt hơn.')}<br/><span>{t('Tiến xa hơn.')}</span></h1>
            <p>{t('Một nơi để giao bài, theo dõi tiến độ và giúp mỗi học sinh nhìn thấy bước tiến của mình.')}</p>
          </div>
          <div className="login-illustration" aria-hidden="true">
            <div className="login-illustration-glow" />
            <div className="login-illustration-card login-illustration-main">
              <div className="login-illustration-head"><span className="login-mini-logo"><BookOpenCheck size={17}/></span><span className="login-mini-lines"><i/><i/></span><span className="login-mini-dot"/></div>
              <div className="login-illustration-title" />
              <div className="login-illustration-line login-illustration-line-short" />
              <div className="login-illustration-answer"><span>A</span><i/></div>
              <div className="login-illustration-answer login-illustration-answer-active"><span>B</span><i/><ShieldCheck size={17}/></div>
              <div className="login-illustration-answer"><span>C</span><i/></div>
            </div>
            <div className="login-illustration-card login-floating-card login-floating-top"><span className="login-float-icon violet"><ClipboardCheck size={18}/></span><span><strong>{t('Bài tập rõ ràng')}</strong><small>{t('Học đúng trọng tâm')}</small></span></div>
            <div className="login-illustration-card login-floating-card login-floating-bottom"><span className="login-float-icon peach"><ChartNoAxesCombined size={18}/></span><span><strong>{t('Tiến bộ mỗi ngày')}</strong><small>{t('Thấy được hành trình')}</small></span></div>
          </div>
          <div className="login-story-footer"><span className="login-footer-sparkle">✦</span> {t('Khơi mở tiềm năng trong từng bài học')}</div>
        </div>
      </section>

      <section className="login-panel" aria-label={t('Đăng nhập')}>
        <div className="login-mobile-brand login-brand"><span className="login-brand-icon"><BrandLogo size={36} /></span><span>EduAssess</span></div>
        <div className="login-panel-inner">
          <div className="login-welcome-icon"><span><BrandLogo size={56} /></span></div>
          <div className="login-panel-heading"><span className="login-eyebrow">{t('CHÀO MỪNG TRỞ LẠI')}</span><h2>{t('Rất vui được gặp bạn!')}</h2><p>{t('Đăng nhập để tiếp tục hành trình học tập của mình.')}</p></div>
          <form onSubmit={submit} className="login-form">
            {error && <div role="alert" className="login-error">{error}</div>}
            <label className="login-field"><span>{t('Email hoặc tên đăng nhập')}</span><span className="login-input-wrap"><Mail size={19} aria-hidden="true"/><input type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder={t('tenban@example.com hoặc giaovien')} value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></span></label>
            <label className="login-field"><span>{t('Mật khẩu')}</span><span className="login-input-wrap"><LockKeyhole size={19} aria-hidden="true"/><input type={showPassword ? 'text' : 'password'} required autoComplete="current-password" placeholder={t('Nhập mật khẩu của bạn')} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /><button type="button" className="login-password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? t('Ẩn mật khẩu') : t('Hiện mật khẩu')} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
            <button className="login-submit" type="submit" disabled={busy}><span>{busy ? t('Đang đăng nhập...') : t('Đăng nhập')}</span>{busy ? <span className="login-spinner" aria-hidden="true"/> : <ArrowRight size={19} aria-hidden="true"/>}</button>
          </form>
          <p className="login-security"><ShieldCheck size={16} aria-hidden="true"/> {t('Tài khoản của bạn được bảo vệ')}</p>
        </div>
        <p className="login-panel-footer">© {new Date().getFullYear()} EduAssess · {t('Học tập theo cách của bạn')}</p>
      </section>
    </div>
  </main>;
};
