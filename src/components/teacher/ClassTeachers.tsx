import { useEffect, useState } from 'react';
import { Check, UserRound } from 'lucide-react';
import { eduApi } from '../../api/client';
import { useApp } from '../../context/AppContext';
import type { ClassRoom, StaffMember } from '../../types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useI18n } from '../../i18n';
import '../ui/class-multi-select.css';

/** Teachers and admins on the system; loaded once per component that needs them. */
export function useStaff() {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    eduApi.staff().then(items => { if (!cancelled) setStaff(items); })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, []);
  return { staff, error };
}

/** Ticks the teachers in charge of a class. Admins are not listed: they see every class anyway. */
export function TeacherChecklist({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useI18n();
  const { staff, error } = useStaff();
  if (error) return <p role="alert" className="form-error">{error}</p>;
  if (!staff) return <p className="text-sm text-slate-500">{t('Đang tải...')}</p>;
  const teachers = staff.filter(p => p.role === 'teacher');
  if (!teachers.length) return <p className="text-sm text-slate-500">{t('Chưa có tài khoản giáo viên nào. Tạo ở màn Tài khoản.')}</p>;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  return <ul className="class-check-list max-h-60 overflow-y-auto">
    {teachers.map(person => {
      const on = value.includes(person.id);
      return <li key={person.id}>
        <label className={`class-check-row ${on ? 'is-on' : ''}`}>
          <input type="checkbox" checked={on} onChange={() => toggle(person.id)} />
          <span className="class-check-box" aria-hidden="true">{on && <Check size={13} strokeWidth={3} />}</span>
          <span className="class-check-text"><strong>{person.name}</strong><small>{person.email}</small></span>
        </label>
      </li>;
    })}
  </ul>;
}

/** Names of a class's teachers, e.g. for the class detail header. */
export function TeacherNames({ classroom }: { classroom: ClassRoom }) {
  const { t } = useI18n();
  const { staff } = useStaff();
  const names = (classroom.teacherIds ?? []).map(id => staff?.find(p => p.id === id)?.name).filter(Boolean);
  return <span className="inline-flex items-center gap-1.5">
    <UserRound size={14} aria-hidden="true" />
    {staff === null ? t('Đang tải...') : names.length ? names.join(', ') : t('Chưa có giáo viên phụ trách')}
  </span>;
}

/** Admin: changes who teaches a class. */
export function ClassTeachersModal({ classroom, onClose }: { classroom: ClassRoom; onClose: () => void }) {
  const { syncData } = useApp();
  const { t } = useI18n();
  const [teacherIds, setTeacherIds] = useState<string[]>(classroom.teacherIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try { await eduApi.updateClass(classroom.id, { teacherIds }); await syncData(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setSaving(false); }
  };

  return <Modal title={t('Giáo viên phụ trách')} subtitle={classroom.name} onClose={onClose} dismissible={!saving}
    footer={<>
      <Button variant="ghost" disabled={saving} onClick={onClose}>{t('Huỷ')}</Button>
      <Button disabled={saving} onClick={save}>{saving ? t('Đang lưu...') : t('Lưu')}</Button>
    </>}>
    <div className="form-stack">
      {error && <p role="alert" className="form-error">{error}</p>}
      <p className="text-sm text-slate-600">{t('Giáo viên được chọn sẽ thấy lớp này, học sinh, bài giao và bài nộp của lớp.')}</p>
      <TeacherChecklist value={teacherIds} onChange={setTeacherIds} />
    </div>
  </Modal>;
}
