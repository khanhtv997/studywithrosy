import React, { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Check, GraduationCap, Hourglass, KeyRound, Lock, LockOpen, Phone, Plus, School, Search, ShieldCheck, UserRoundCog, UsersRound, X } from 'lucide-react';
import type { AppUser, Role, UserPage } from '../../types';
import { eduApi } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PageHeader, StatCard } from '../ui/PageHeader';
import { Pagination, useDebounced, useServerPage } from '../ui/Pagination';
import { SelectField } from '../ui/SelectField';
import { RowMenu } from '../ui/RowMenu';
import { useI18n } from '../../i18n';
import './approval.css';

const roleOptions: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Quản trị' },
  { value: 'teacher', label: 'Giáo viên' },
  { value: 'student', label: 'Học sinh' },
];
const EMPTY_FORM = { name: '', email: '', password: '', role: 'teacher' as Role, studentId: '' };

export const UserManagement: React.FC = () => {
  const { students, currentUser } = useApp();
  const { t, locale } = useI18n();
  const roleOpts = roleOptions.map(option => ({ ...option, label: t(option.label) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  // "?status=pending" (from the new-account notification) opens the accounts waiting for approval; "?status=locked" the locked ones.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const statusFilter: 'all' | 'pending' | 'locked' = statusParam === 'pending' || statusParam === 'locked' ? statusParam : 'all';
  const pendingOnly = statusFilter === 'pending';
  const setStatusFilter = (value: 'all' | 'pending' | 'locked') => setSearchParams(prev => { const next = new URLSearchParams(prev); if (value === 'all') next.delete('status'); else next.set('status', value); return next; }, { replace: true });
  const setPendingOnly = (on: boolean) => setStatusFilter(on ? 'pending' : 'all');
  const [lockUser, setLockUser] = useState<AppUser | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [passwordUser, setPasswordUser] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const studentOptions = students.map(student => ({ value: student.id, label: `${student.name} (${student.code})` }));

  const q = useDebounced(query.trim());
  // Search, role filter and paging happen on the server; counts are system-wide totals per role.
  const pager = useServerPage<AppUser, UserPage>(
    (page, pageSize, signal) => eduApi.userPage({ page, pageSize, role: roleFilter, q, status: statusFilter }, signal),
    [roleFilter, q, statusFilter]);
  const counts = pager.data?.counts ?? { all: 0, admin: 0, teacher: 0, student: 0, pending: 0, locked: 0 };
  const openLock = (user: AppUser) => { setLockReason(''); setLockUser(user); };
  const submitLock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lockUser) return;
    if (await act(() => eduApi.setLock(lockUser.id, true, lockReason.trim() || undefined), t('Đã khoá {email}. Người này đã bị đăng xuất.', { email: lockUser.email }))) setLockUser(null);
  };
  const unlock = (user: AppUser) => {
    if (!window.confirm(t('Mở khoá tài khoản {email}?', { email: user.email }))) return;
    void act(() => eduApi.setLock(user.id, false), t('Đã mở khoá {email}.', { email: user.email }));
  };
  const lockedOn = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(locale) : '';
  const approve = (user: AppUser) => act(() => eduApi.setApproval(user.id, 'approved', user.role),
    t('Đã duyệt {email}. Tài khoản đã dùng được.', { email: user.email }));
  const reject = (user: AppUser) => {
    if (!window.confirm(t('Từ chối tài khoản {email}? Người này sẽ không đăng nhập được.', { email: user.email }))) return;
    void act(() => eduApi.setApproval(user.id, 'rejected'), t('Đã từ chối {email}.', { email: user.email }));
  };

  /** Runs an action, reloads the list and reports the result; returns false on failure. */
  const act = async (action: () => Promise<unknown>, message: string, onError = setError) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); pager.reload(); setNotice(message); return true; }
    catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); return false; }
    finally { setBusy(false); }
  };

  const openCreate = () => { setForm(EMPTY_FORM); setFormError(''); setIsCreateOpen(true); };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.role === 'student' && !form.studentId) { setFormError(t('Hãy chọn học sinh để liên kết tài khoản.')); return; }
    setFormError('');
    const ok = await act(() => eduApi.createUser({ ...form, studentId: form.role === 'student' ? form.studentId : null }), t('Đã tạo tài khoản {email}.', { email: form.email }), setFormError);
    if (ok) setIsCreateOpen(false);
  };
  const changeRole = (user: AppUser, role: Role) => {
    if (role === 'student' && !user.studentId) { setError(t('Hãy liên kết học sinh trước khi chuyển sang quyền học sinh.')); return; }
    void act(() => eduApi.updateUser(user.id, { role }), t('Đã cập nhật quyền.'));
  };
  const linkStudent = (user: AppUser, studentId: string) => {
    if (!studentId) return;
    void act(() => eduApi.updateUser(user.id, { role: 'student', studentId }), t('Đã liên kết học sinh và cấp quyền học sinh.'));
  };
  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordUser || newPassword.length < 8) return;
    if (await act(() => eduApi.resetPassword(passwordUser.id, newPassword), t('Đã đổi mật khẩu cho {email}.', { email: passwordUser.email }))) setPasswordUser(null);
  };


  return <div className="page-stack">
    <PageHeader icon={UserRoundCog} title={t('Tài khoản & phân quyền')}
      description={t('Tạo tài khoản, liên kết tài khoản học sinh, cấp quyền và khóa truy cập.')}
      actions={<Button onClick={openCreate}><Plus size={17} aria-hidden="true" />{t('Thêm tài khoản')}</Button>} />

    {error && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status" className="form-notice">{notice}</p>}

    <div className="stat-grid">
      <StatCard icon={UsersRound} label={t('Tổng số tài khoản')} value={counts.all} />
      <StatCard icon={ShieldCheck} label={t('Quản trị')} value={counts.admin} tone="rose" />
      <StatCard icon={UserRoundCog} label={t('Giáo viên')} value={counts.teacher} tone="amber" />
      <StatCard icon={GraduationCap} label={t('Học sinh')} value={counts.student} tone="emerald" />
    </div>

    {counts.pending > 0 && !pendingOnly && <div className="approval-banner" role="status">
      <Hourglass size={18} aria-hidden="true" />
      <span>{t('Có {count} tài khoản giáo viên đăng ký bằng Google đang chờ duyệt.', { count: counts.pending })}</span>
      <Button size="sm" onClick={() => setPendingOnly(true)}>{t('Xem và duyệt')}</Button>
    </div>}

    <section className="panel">
      <div className="panel-toolbar">
        <h2 className="panel-title">{t('Danh sách tài khoản')}<span className="count-pill">{pager.total}</span></h2>
        <div className="toolbar-controls">
          <button type="button" className={`approval-filter ${pendingOnly ? 'is-on' : ''}`} aria-pressed={pendingOnly} onClick={() => setPendingOnly(!pendingOnly)}>
            <Hourglass size={14} aria-hidden="true" />{t('Chờ phê duyệt')}<span>{counts.pending}</span>
          </button>
          <button type="button" className={`approval-filter is-lock ${statusFilter === 'locked' ? 'is-on' : ''}`} aria-pressed={statusFilter === 'locked'} onClick={() => setStatusFilter(statusFilter === 'locked' ? 'all' : 'locked')}>
            <Lock size={14} aria-hidden="true" />{t('Đã khoá')}<span>{counts.locked}</span>
          </button>
          <SelectField ariaLabel={t('Lọc theo vai trò')} value={roleFilter} onValueChange={v => setRoleFilter(v as typeof roleFilter)} compact className="w-full sm:w-44"
            options={[{ value: 'all', label: t('Tất cả vai trò') }, ...roleOpts]} />
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <input type="search" aria-label={t('Tìm tài khoản')} placeholder={t('Tìm tên, email, SĐT, trường...')} value={query} onChange={e => setQuery(e.target.value)} />
          </label>
        </div>
      </div>
      <div className="table-scroll">
        {pager.error ? <p role="alert" className="empty-state">{pager.error}</p> : pager.loading && !pager.data ? <p className="empty-state">{t('Đang tải danh sách tài khoản...')}</p> :
          <table className="data-table min-w-[820px]">
            <thead><tr><th>{t('Người dùng')}</th><th>{t('Vai trò')}</th><th>{t('Học sinh liên kết')}</th><th>{t('Trạng thái')}</th><th className="text-right">{t('Thao tác')}</th></tr></thead>
            <tbody>{pager.total === 0
              ? <tr><td colSpan={5} className="empty-cell"><UsersRound size={28} aria-hidden="true" /><span>{t('Không có tài khoản nào khớp với bộ lọc.')}</span></td></tr>
              : pager.pageItems.map(user => <tr key={user.id}>
                <td><div className="font-bold text-slate-900">{user.name}</div><div className="text-[12px] text-slate-500">{user.email}{user.googleLinked && <span className="google-pill" title={t('Đăng nhập được bằng Google')}>Google</span>}</div>
                  {(user.phone || user.school) && <div className="user-contact">
                    {user.phone && <a href={`tel:${user.phone}`}><Phone size={12} aria-hidden="true" />{user.phone}</a>}
                    {user.school && <span title={user.school}><School size={12} aria-hidden="true" />{user.school}</span>}
                  </div>}</td>
                <td><SelectField ariaLabel={t('Vai trò của {name}', { name: user.name })} disabled={busy || user.id === currentUser?.id} value={user.role} onValueChange={value => changeRole(user, value as Role)} options={roleOpts} compact className="w-32" /></td>
                <td><SelectField ariaLabel={t('Học sinh của {name}', { name: user.name })} disabled={busy} value={user.studentId || ''} onValueChange={value => linkStudent(user, value)} options={studentOptions} placeholder={t('Chưa liên kết')} compact className="w-60" /></td>
                <td>{user.approval !== 'approved' ? <div className="approval-cell">
                  <span className={`badge ${user.approval === 'pending' ? 'badge-warning' : 'badge-muted'}`}>{user.approval === 'pending' ? t('Chờ phê duyệt') : t('Đã từ chối')}</span>
                  <div className="approval-actions">
                    <Button size="sm" disabled={busy} onClick={() => void approve(user)}><Check size={14} aria-hidden="true" />{user.approval === 'pending' ? t('Duyệt') : t('Duyệt lại')}</Button>
                    {user.approval === 'pending' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => reject(user)}><X size={14} aria-hidden="true" />{t('Từ chối')}</Button>}
                  </div>
                </div> : <>{user.active
                  ? <span className="badge badge-success">{t('Đang hoạt động')}</span>
                  : <div className="lock-cell">
                    <span className="badge badge-danger"><Lock size={12} aria-hidden="true" />{t('Đã khoá')}</span>
                    {user.lockedAt && <small>{t('Từ {date}', { date: lockedOn(user.lockedAt) })}</small>}
                    {user.lockedReason && <small className="lock-reason" title={user.lockedReason}>{t('Lý do: {reason}', { reason: user.lockedReason })}</small>}
                  </div>}
                  {user.mustChangePassword && <div className="mt-1"><span className="badge badge-warning" title={t('Đăng nhập lần tới phải đổi mật khẩu')}>{t('Chờ đổi mật khẩu')}</span></div>}</>}</td>
                <td className="text-right"><RowMenu label={t('Thao tác: {name}', { name: user.name })} items={[
                  { label: t('Đặt lại mật khẩu'), icon: <KeyRound size={16} aria-hidden="true" />, disabled: busy, onSelect: () => { setNewPassword(''); setPasswordUser(user); } },
                  user.active
                    ? { label: t('Khoá tài khoản'), icon: <Lock size={16} aria-hidden="true" />, danger: true, separated: true, disabled: busy || user.id === currentUser?.id,
                      hint: user.id === currentUser?.id ? t('Không thể khóa tài khoản đang đăng nhập') : undefined, onSelect: () => openLock(user) }
                    : { label: t('Mở khoá tài khoản'), icon: <LockOpen size={16} aria-hidden="true" />, separated: true, disabled: busy, onSelect: () => unlock(user) },
                ]} /></td>
              </tr>)}</tbody>
          </table>}
      </div>
      <Pagination state={pager} unit={t('tài khoản')} />
    </section>

    {isCreateOpen && <Modal title={t('Thêm tài khoản')} onClose={() => setIsCreateOpen(false)} dismissible={!busy}
      footer={<>
        <Button variant="ghost" disabled={busy} onClick={() => setIsCreateOpen(false)}>{t('Hủy')}</Button>
        <Button type="submit" form="user-form" disabled={busy}>{busy ? t('Đang tạo...') : t('Tạo tài khoản')}</Button>
      </>}>
      <form id="user-form" onSubmit={create} className="form-stack">
        {formError && <p role="alert" className="form-error">{formError}</p>}
        <label className="form-field">{t('Họ tên *')}<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label className="form-field">{t('Email hoặc tên đăng nhập *')}<input type="text" required autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={t('vd: co.lan@truong.edu.vn hoặc colan')} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label className="form-field">{t('Mật khẩu (ít nhất 8 ký tự) *')}<input type="password" minLength={8} required autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
        <div className="form-row">
          <div className="form-field">{t('Vai trò')}
            <SelectField ariaLabel={t('Vai trò tài khoản mới')} value={form.role} onValueChange={value => setForm({ ...form, role: value as Role })} options={roleOpts} className="w-full" />
          </div>
          {form.role === 'student' && <div className="form-field">{t('Học sinh liên kết *')}
            <SelectField ariaLabel={t('Học sinh liên kết')} value={form.studentId} onValueChange={value => setForm({ ...form, studentId: value })} options={studentOptions} placeholder={t('Chọn học sinh')} className="w-full" />
          </div>}
        </div>
      </form>
    </Modal>}

    {lockUser && <Modal title={t('Khoá tài khoản')} subtitle={`${lockUser.name} · ${lockUser.email}`} onClose={() => setLockUser(null)} dismissible={!busy}
      footer={<>
        <Button variant="ghost" disabled={busy} onClick={() => setLockUser(null)}>{t('Hủy')}</Button>
        <Button type="submit" form="lock-form" variant="danger" disabled={busy}><Lock size={15} aria-hidden="true" />{busy ? t('Đang khoá...') : t('Khoá tài khoản')}</Button>
      </>}>
      <form id="lock-form" onSubmit={submitLock} className="form-stack">
        <p className="lock-warning">{t('Người này sẽ bị đăng xuất ngay và không đăng nhập được (cả bằng mật khẩu lẫn Google) cho đến khi được mở khoá. Dữ liệu của họ vẫn được giữ nguyên.')}</p>
        <label className="form-field">{t('Lý do (không bắt buộc, người dùng sẽ thấy khi đăng nhập)')}
          <textarea rows={3} maxLength={500} autoFocus value={lockReason} placeholder={t('VD: Đã nghỉ dạy tại trường, tài khoản dùng sai mục đích...')} onChange={e => setLockReason(e.target.value)} />
        </label>
      </form>
    </Modal>}

    {passwordUser && <Modal title={t('Đặt lại mật khẩu')} subtitle={passwordUser.email} onClose={() => setPasswordUser(null)} dismissible={!busy}
      footer={<>
        <Button variant="ghost" disabled={busy} onClick={() => setPasswordUser(null)}>{t('Hủy')}</Button>
        <Button type="submit" form="password-form" disabled={busy || newPassword.length < 8}>{busy ? t('Đang lưu...') : t('Đổi mật khẩu')}</Button>
      </>}>
      <form id="password-form" onSubmit={submitPassword} className="form-stack">
        <label className="form-field">{t('Mật khẩu mới (ít nhất {count} ký tự)', { count: 8 })}
          <input type="password" autoComplete="new-password" minLength={8} required autoFocus value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </label>
      </form>
    </Modal>}
  </div>;
};
