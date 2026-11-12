import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import type { ProfileInput } from '../../types';
import { checkProfile, trimmed, type FieldErrors } from './SignupForms';

/** The signed-in user's own name, phone and school (from the account menu or the reminder banner). */
export function ProfileModal({ onClose }: { onClose: () => void }) {
  const { currentUser, updateProfile } = useApp();
  const { t } = useI18n();
  const [value, setValue] = useState<ProfileInput>({ name: currentUser?.name ?? '', phone: currentUser?.phone ?? '', school: currentUser?.school ?? '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next = checkProfile(value, t);
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true); setError('');
    try { await updateProfile(trimmed(value)); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  const field = (key: keyof ProfileInput, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) =>
    <label className="form-field">{label}
      <input {...props} value={value[key]} onChange={e => setValue({ ...value, [key]: e.target.value })} disabled={busy}
        aria-invalid={!!errors[key] || undefined} />
      {errors[key] && <span className="form-field-error">{errors[key]}</span>}
    </label>;

  return <Modal title={t('Thông tin cá nhân')} subtitle={currentUser?.email} onClose={onClose} dismissible={!busy}
    footer={<>
      <Button variant="ghost" disabled={busy} onClick={onClose}>{t('Hủy')}</Button>
      <Button type="submit" form="profile-form" disabled={busy}>{busy ? t('Đang lưu...') : t('Lưu thông tin')}</Button>
    </>}>
    <form id="profile-form" onSubmit={submit} className="form-stack" noValidate>
      {error && <p role="alert" className="form-error">{error}</p>}
      {field('name', t('Họ và tên'), { type: 'text', autoComplete: 'name', maxLength: 100, autoFocus: true })}
      {field('phone', t('Số điện thoại'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel', maxLength: 20, placeholder: t('VD: 0912 345 678') })}
      {field('school', t('Trường đang dạy'), { type: 'text', autoComplete: 'organization', maxLength: 200, placeholder: t('VD: THCS Gia Thụy, Long Biên, Hà Nội') })}
    </form>
  </Modal>;
}
