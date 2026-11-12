import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Phone, School, UserRound } from 'lucide-react';
import type { GoogleProfileInput, RegisterInput } from '../../types';
import { useI18n } from '../../i18n';

/** Same rules as the server: 0xxxxxxxxx or +84xxxxxxxxx; spaces, dots and dashes are ignored. */
export const normalizePhone = (value: string) => value.trim().replace(/[\s.\-()]/g, '');
export const isPhone = (value: string) => /^(\+84|0)\d{9,10}$/.test(normalizePhone(value));
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

type FieldErrors = Partial<Record<'name' | 'email' | 'phone' | 'school' | 'password' | 'confirm', string>>;

function Field({ label, icon: Icon, error, children }: { label: string; icon: typeof Mail; error?: string; children: React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>> }) {
  const id = React.useId();
  const input = React.cloneElement(children, { id, 'aria-invalid': !!error || undefined, 'aria-describedby': error ? `${id}-error` : undefined });
  return <div className="login-field">
    <label htmlFor={id}>{label}</label>
    <span className={`login-input-wrap ${error ? 'is-invalid' : ''}`}><Icon size={19} aria-hidden="true" />{input}</span>
    {error && <span id={`${id}-error`} className="login-field-error">{error}</span>}
  </div>;
}

/** Name, phone and school: asked from every teacher who signs up. */
function ProfileFields({ value, onChange, errors, disabled, nameReadOnly = false }: {
  value: GoogleProfileInput; onChange: (next: GoogleProfileInput) => void; errors: FieldErrors; disabled: boolean; nameReadOnly?: boolean;
}) {
  const { t } = useI18n();
  return <>
    <Field label={t('Họ và tên')} icon={UserRound} error={errors.name}>
      <input type="text" required autoComplete="name" maxLength={100} placeholder={t('VD: Nguyễn Thị Lan')} value={value.name} readOnly={nameReadOnly}
        onChange={e => onChange({ ...value, name: e.target.value })} disabled={disabled} />
    </Field>
    <Field label={t('Số điện thoại')} icon={Phone} error={errors.phone}>
      <input type="tel" required autoComplete="tel" inputMode="tel" maxLength={20} placeholder={t('VD: 0912 345 678')} value={value.phone}
        onChange={e => onChange({ ...value, phone: e.target.value })} disabled={disabled} />
    </Field>
    <Field label={t('Trường đang dạy')} icon={School} error={errors.school}>
      <input type="text" required autoComplete="organization" maxLength={200} placeholder={t('VD: THCS Gia Thụy, Long Biên, Hà Nội')} value={value.school}
        onChange={e => onChange({ ...value, school: e.target.value })} disabled={disabled} />
    </Field>
  </>;
}

function checkProfile(value: GoogleProfileInput, t: (key: string) => string): FieldErrors {
  const errors: FieldErrors = {};
  if (value.name.trim().length < 2) errors.name = t('Hãy nhập họ và tên.');
  if (!isPhone(value.phone)) errors.phone = t('Số điện thoại chưa đúng (VD: 0912345678 hoặc +84912345678).');
  if (value.school.trim().length < 2) errors.school = t('Hãy nhập tên trường bạn đang dạy.');
  return errors;
}

const trimmed = (value: GoogleProfileInput): GoogleProfileInput => ({ name: value.name.trim(), phone: normalizePhone(value.phone), school: value.school.trim() });

/** Sign-up with email and password. The account is a teacher account that waits for an admin. */
export function RegisterForm({ onSubmit, busy, error }: { onSubmit: (data: RegisterInput) => void; busy: boolean; error: string }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<GoogleProfileInput>({ name: '', phone: '', school: '' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const next = checkProfile(profile, t);
    if (!isEmail(email)) next.email = t('Email chưa đúng.');
    if (password.length < 8) next.password = t('Mật khẩu cần ít nhất 8 ký tự.');
    if (confirm !== password) next.confirm = t('Mật khẩu nhập lại không khớp.');
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({ ...trimmed(profile), email: email.trim().toLowerCase(), password });
  };

  return <form onSubmit={submit} className="login-form login-form-compact" noValidate>
    {error && <div role="alert" className="login-error">{error}</div>}
    <ProfileFields value={profile} onChange={setProfile} errors={errors} disabled={busy} />
    <Field label={t('Email')} icon={Mail} error={errors.email}>
      <input type="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="tenban@gmail.com" value={email}
        onChange={e => setEmail(e.target.value)} disabled={busy} />
    </Field>
    <Field label={t('Mật khẩu')} icon={LockKeyhole} error={errors.password}>
      <input type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password" placeholder={t('Ít nhất 8 ký tự')} value={password}
        onChange={e => setPassword(e.target.value)} disabled={busy} />
    </Field>
    <Field label={t('Nhập lại mật khẩu')} icon={LockKeyhole} error={errors.confirm}>
      <input type={show ? 'text' : 'password'} required autoComplete="new-password" placeholder={t('Nhập lại mật khẩu')} value={confirm}
        onChange={e => setConfirm(e.target.value)} disabled={busy} />
    </Field>
    <button type="button" className="login-show-passwords" onClick={() => setShow(v => !v)} aria-pressed={show}>
      {show ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}{show ? t('Ẩn mật khẩu') : t('Hiện mật khẩu')}
    </button>
    <button className="login-submit" type="submit" disabled={busy}>
      <span>{busy ? t('Đang gửi...') : t('Đăng ký')}</span>{busy ? <span className="login-spinner" aria-hidden="true" /> : <ArrowRight size={19} aria-hidden="true" />}
    </button>
  </form>;
}

/** After "Continue with Google" for someone new: their phone and school before the account is created. */
export function GoogleProfileForm({ name, email, onSubmit, onCancel, busy, error }: {
  name: string; email: string; onSubmit: (profile: GoogleProfileInput) => void; onCancel: () => void; busy: boolean; error: string;
}) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<GoogleProfileInput>({ name, phone: '', school: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const next = checkProfile(profile, t);
    setErrors(next);
    if (!Object.keys(next).length) onSubmit(trimmed(profile));
  };
  return <form onSubmit={submit} className="login-form login-form-compact" noValidate>
    <div className="login-google-account"><Mail size={16} aria-hidden="true" /><span>{t('Đăng ký bằng Google:')} <strong>{email}</strong></span></div>
    {error && <div role="alert" className="login-error">{error}</div>}
    <ProfileFields value={profile} onChange={setProfile} errors={errors} disabled={busy} />
    <button className="login-submit" type="submit" disabled={busy}>
      <span>{busy ? t('Đang gửi...') : t('Gửi đăng ký')}</span>{busy ? <span className="login-spinner" aria-hidden="true" /> : <ArrowRight size={19} aria-hidden="true" />}
    </button>
    <button type="button" className="login-back login-back-center" onClick={onCancel} disabled={busy}><ArrowLeft size={16} aria-hidden="true" />{t('Quay lại')}</button>
  </form>;
}
