import React, { useEffect, useState } from 'react';
import { GraduationCap, KeyRound, Plus, Search, ShieldCheck, UserRoundCog, UsersRound } from 'lucide-react';
import type { AppUser, Role } from '../../types';
import { eduApi } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PageHeader, StatCard } from '../ui/PageHeader';
import { Pagination, usePagination } from '../ui/Pagination';
import { SelectField } from '../ui/SelectField';
import { useI18n } from '../../i18n';

const roleOptions: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Quản trị' },
  { value: 'teacher', label: 'Giáo viên' },
  { value: 'student', label: 'Học sinh' },
];
const EMPTY_FORM = { name: '', email: '', password: '', role: 'teacher' as Role, studentId: '' };

export const UserManagement: React.FC = () => {
  const { students, currentUser } = useApp();
  const { t } = useI18n();
  const roleOpts = roleOptions.map(option => ({ ...option, label: t(option.label) }));
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [passwordUser, setPasswordUser] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const studentOptions = students.map(student => ({ value: student.id, label: `${student.name} (${student.code})` }));

  const load = async () => {
    setLoading(true);
    try { setUsers(await eduApi.users()); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  /** Runs an action, reloads the list and reports the result; returns false on failure. */
  const act = async (action: () => Promise<unknown>, message: string, onError = setError) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); setNotice(message); return true; }
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

  const q = query.trim().toLowerCase();
  const visible = users.filter(u => (roleFilter === 'all' || u.role === roleFilter) && (!q || [u.name, u.email].some(v => v.toLowerCase().includes(q))));
  const pager = usePagination(visible, `${roleFilter}|${q}`);
  const countOf = (role: Role) => users.filter(u => u.role === role).length;

  return <div className="page-stack">
    <PageHeader icon={UserRoundCog} title={t('Tài khoản & phân quyền')}
      description={t('Tạo tài khoản, liên kết tài khoản học sinh, cấp quyền và khóa truy cập.')}
      actions={<Button onClick={openCreate}><Plus size={17} aria-hidden="true" />{t('Thêm tài khoản')}</Button>} />

    {error && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status" className="form-notice">{notice}</p>}

    <div className="stat-grid">
      <StatCard icon={UsersRound} label={t('Tổng số tài khoản')} value={users.length} />
      <StatCard icon={ShieldCheck} label={t('Quản trị')} value={countOf('admin')} tone="rose" />
      <StatCard icon={UserRoundCog} label={t('Giáo viên')} value={countOf('teacher')} tone="amber" />
      <StatCard icon={GraduationCap} label={t('Học sinh')} value={countOf('student')} tone="emerald" />
    </div>

    <section className="panel">
      <div className="panel-toolbar">
        <h2 className="panel-title">{t('Danh sách tài khoản')}<span className="count-pill">{visible.length}</span></h2>
        <div className="toolbar-controls">
          <SelectField ariaLabel={t('Lọc theo vai trò')} value={roleFilter} onValueChange={v => setRoleFilter(v as typeof roleFilter)} compact className="w-full sm:w-44"
            options={[{ value: 'all', label: t('Tất cả vai trò') }, ...roleOpts]} />
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <input type="search" aria-label={t('Tìm tài khoản')} placeholder={t('Tìm tên hoặc email...')} value={query} onChange={e => setQuery(e.target.value)} />
          </label>
        </div>
      </div>
      <div className="overflow-x-auto">
        {loading ? <p className="empty-state">{t('Đang tải danh sách tài khoản...')}</p> :
          <table className="data-table min-w-[820px]">
            <thead><tr><th>{t('Người dùng')}</th><th>{t('Vai trò')}</th><th>{t('Học sinh liên kết')}</th><th>{t('Trạng thái')}</th><th className="text-right">{t('Mật khẩu')}</th></tr></thead>
            <tbody>{visible.length === 0
              ? <tr><td colSpan={5} className="empty-cell"><UsersRound size={28} aria-hidden="true" /><span>{t('Không có tài khoản nào khớp với bộ lọc.')}</span></td></tr>
              : pager.pageItems.map(user => <tr key={user.id}>
                <td><div className="font-bold text-slate-900">{user.name}</div><div className="text-[12px] text-slate-500">{user.email}</div></td>
                <td><SelectField ariaLabel={t('Vai trò của {name}', { name: user.name })} disabled={busy || user.id === currentUser?.id} value={user.role} onValueChange={value => changeRole(user, value as Role)} options={roleOpts} compact className="w-32" /></td>
                <td><SelectField ariaLabel={t('Học sinh của {name}', { name: user.name })} disabled={busy} value={user.studentId || ''} onValueChange={value => linkStudent(user, value)} options={studentOptions} placeholder={t('Chưa liên kết')} compact className="w-60" /></td>
                <td><button type="button" disabled={busy || user.id === currentUser?.id} title={user.id === currentUser?.id ? t('Không thể khóa tài khoản đang đăng nhập') : user.active ? t('Bấm để khóa') : t('Bấm để mở khóa')}
                  onClick={() => void act(() => eduApi.updateUser(user.id, { active: !user.active }), user.active ? t('Đã khóa {email}.', { email: user.email }) : t('Đã mở khóa {email}.', { email: user.email }))}
                  className={`badge ${user.active ? 'badge-success' : 'badge-muted'} disabled:cursor-default`}>{user.active ? t('Đang hoạt động') : t('Đã khóa')}</button>
                  {user.mustChangePassword && <div className="mt-1"><span className="badge badge-warning" title={t('Đăng nhập lần tới phải đổi mật khẩu')}>{t('Chờ đổi mật khẩu')}</span></div>}</td>
                <td className="text-right"><Button variant="ghost" size="sm" disabled={busy} onClick={() => { setNewPassword(''); setPasswordUser(user); }}><KeyRound size={14} aria-hidden="true" />{t('Đặt lại')}</Button></td>
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
