import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BrandLogo } from '../ui/BrandLogo';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useI18n } from '../../i18n';

const MIN_LENGTH = 8;

/** Current + new + confirm, with the same checks as the API so mistakes show before submitting. */
function ChangePasswordForm({ id, onDone, onBusyChange }: { id: string; onDone?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const { changePassword } = useApp();
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = next && next.length < MIN_LENGTH ? t('Mật khẩu mới cần ít nhất {count} ký tự.', { count: MIN_LENGTH })
    : next && next === current ? t('Mật khẩu mới phải khác mật khẩu hiện tại.')
    : confirm && confirm !== next ? t('Nhập lại mật khẩu mới chưa khớp.')
    : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (problem || !current || !next || next !== confirm) return;
    setError(null);
    onBusyChange?.(true);
    try { await changePassword(current, next); onDone?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { onBusyChange?.(false); }
  };

  const type = show ? 'text' : 'password';
  return <form id={id} onSubmit={submit} className="form-stack">
    {(error || problem) && <p role="alert" className="form-error">{error || problem}</p>}
    <label className="form-field">{t('Mật khẩu hiện tại')}
      <input type={type} required autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} />
    </label>
    <label className="form-field">{t('Mật khẩu mới (ít nhất {count} ký tự)', { count: MIN_LENGTH })}
      <input type={type} required minLength={MIN_LENGTH} autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} />
    </label>
    <label className="form-field">{t('Nhập lại mật khẩu mới')}
      <input type={type} required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
    </label>
    <button type="button" onClick={() => setShow(v => !v)} className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline">
      {show ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}{show ? t('Ẩn mật khẩu') : t('Hiện mật khẩu')}
    </button>
  </form>;
}

/** Shown instead of the app until a given password (import, admin reset) has been replaced. */
export function ForcedPasswordChange() {
  const { currentUser, logout } = useApp();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return <div className="app-focus grid min-h-dvh place-items-center p-4">
    <div className="panel w-full max-w-md p-6 sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-11 w-11 overflow-hidden rounded-xl border border-slate-200"><BrandLogo size={44} /></span>
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t('Đổi mật khẩu để tiếp tục')}</h1>
          <p className="text-sm text-slate-600">{t('Xin chào {name}.', { name: currentUser?.name ?? '' })}</p>
        </div>
      </div>
      <p className="mb-5 flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
        <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        {t('Mật khẩu hiện tại do nhà trường cấp (thường là mã học sinh). Hãy đặt mật khẩu mới chỉ mình em biết.')}
      </p>
      <ChangePasswordForm id="forced-password" onBusyChange={setBusy} />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={logout} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"><LogOut size={16} aria-hidden="true" />{t('Đăng xuất')}</button>
        <Button type="submit" form="forced-password" disabled={busy}><KeyRound size={16} aria-hidden="true" />{busy ? t('Đang lưu...') : t('Đổi mật khẩu')}</Button>
      </div>
    </div>
  </div>;
}

/** The same form from the account menu, for a voluntary change. */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { t } = useI18n();
  return <Modal title={t('Đổi mật khẩu')} onClose={onClose} dismissible={!busy}
    footer={done ? <Button onClick={onClose}>{t('Đóng')}</Button> : <>
      <Button variant="ghost" disabled={busy} onClick={onClose}>{t('Huỷ')}</Button>
      <Button type="submit" form="own-password" disabled={busy}>{busy ? t('Đang lưu...') : t('Đổi mật khẩu')}</Button>
    </>}>
    {done ? <p role="status" className="form-notice">{t('Đã đổi mật khẩu. Lần đăng nhập sau hãy dùng mật khẩu mới.')}</p>
      : <ChangePasswordForm id="own-password" onBusyChange={setBusy} onDone={() => setDone(true)} />}
  </Modal>;
}
