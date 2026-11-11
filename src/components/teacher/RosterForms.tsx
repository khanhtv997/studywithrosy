import { TeacherChecklist } from './ClassTeachers';
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { SelectField } from '../ui/SelectField';

// Values are stored data and stay Vietnamese; labels are translated where rendered.
const GRADE_OPTIONS = [
  { value: 'Lớp 6 (THCS)', label: 'Lớp 6 (THCS)' }, { value: 'Lớp 7 (THCS)', label: 'Lớp 7 (THCS)' },
  { value: 'Lớp 8 (THCS)', label: 'Lớp 8 (THCS)' }, { value: 'Lớp 9 (THCS)', label: 'Lớp 9 (THCS - Ôn thi vào 10)' },
  { value: 'Lớp 10 (THPT)', label: 'Lớp 10 (THPT)' }, { value: 'Lớp 11 (THPT)', label: 'Lớp 11 (THPT)' },
  { value: 'Lớp 12 (THPT)', label: 'Lớp 12 (THPT - Ôn thi Tốt nghiệp)' }, { value: 'Luyện thi IELTS', label: 'Luyện thi IELTS' },
];

function currentAcademicYear() {
  const now = new Date();
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start} - ${start + 1}`;
}

/** Keeps a dialog open with the API error, closes it on success. */
function useFormSubmit(onDone: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try { await action(); onDone(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setSaving(false); }
  };
  return { saving, error, submit };
}

const FormError = ({ message }: { message: string | null }) =>
  message ? <p role="alert" className="form-error">{message}</p> : null;

export function ClassFormModal({ onClose }: { onClose: () => void }) {
  const { addClass, currentUser } = useApp();
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', grade: 'Lớp 9 (THCS)', code: '', academicYear: currentAcademicYear(), description: '' });
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const isAdmin = currentUser?.role === 'admin';
  const { saving, error, submit } = useFormSubmit(onClose);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value });
  const gradeOptions = GRADE_OPTIONS.map(o => ({ value: o.value, label: t(o.label) }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(() => addClass({ name: form.name.trim(), grade: form.grade, code: form.code.trim(), academicYear: form.academicYear.trim(), description: form.description.trim(), color: 'indigo', ...(isAdmin ? { teacherIds } : {}) }));
  };

  return <Modal title={t('Tạo lớp học mới')} onClose={onClose} dismissible={!saving}
    footer={<>
      <Button variant="ghost" disabled={saving} onClick={onClose}>{t('Hủy')}</Button>
      <Button type="submit" form="class-form" disabled={saving}>{saving ? t('Đang tạo...') : t('Tạo lớp')}</Button>
    </>}>
    <form id="class-form" onSubmit={onSubmit} className="form-stack">
      <FormError message={error} />
      <label className="form-field">{t('Tên lớp học *')}
        <input required placeholder={t('Ví dụ: Lớp 9A2 - Tiếng Anh tăng cường')} value={form.name} onChange={set('name')} />
      </label>
      <div className="form-row">
        <label className="form-field">{t('Mã lớp *')}
          <input required placeholder="ENG-9A2" value={form.code} onChange={set('code')} />
        </label>
        <label className="form-field">{t('Năm học *')}
          <input required value={form.academicYear} onChange={set('academicYear')} />
        </label>
      </div>
      <div className="form-field">{t('Cấp lớp / Khối')}
        <SelectField ariaLabel={t('Cấp lớp / Khối')} value={form.grade} onValueChange={grade => setForm({ ...form, grade })} options={gradeOptions} className="w-full" />
      </div>
      <label className="form-field">{t('Mô tả hoặc mục tiêu lớp')}
        <textarea rows={3} placeholder={t('Chương trình học, sách giáo khoa hoặc mục tiêu đầu ra...')} value={form.description} onChange={set('description')} />
      </label>
      {isAdmin ? <div className="form-field">{t('Giáo viên phụ trách')}
        <TeacherChecklist value={teacherIds} onChange={setTeacherIds} />
      </div> : <p className="text-xs text-slate-500">{t('Bạn sẽ là giáo viên phụ trách lớp này.')}</p>}
    </form>
  </Modal>;
}

export function StudentFormModal({ onClose, defaultClassId }: { onClose: () => void; defaultClassId?: string }) {
  const { addStudent, classes } = useApp();
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', code: '', email: '', classId: defaultClassId || classes[0]?.id || '' });
  const { saving, error, submit } = useFormSubmit(onClose);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.classId) return;
    void submit(() => addStudent({ name: form.name.trim(), code: form.code.trim(), email: form.email.trim(), classId: form.classId }));
  };

  return <Modal title={t('Thêm học sinh')} onClose={onClose} dismissible={!saving}
    footer={<>
      <Button variant="ghost" disabled={saving} onClick={onClose}>{t('Hủy')}</Button>
      <Button type="submit" form="student-form" disabled={saving || !form.classId}>{saving ? t('Đang thêm...') : t('Thêm học sinh')}</Button>
    </>}>
    <form id="student-form" onSubmit={onSubmit} className="form-stack">
      <FormError message={error} />
      <label className="form-field">{t('Họ và tên *')}
        <input required placeholder={t('Ví dụ: Hoàng Tuấn Kiệt')} value={form.name} onChange={set('name')} />
      </label>
      <div className="form-row">
        <label className="form-field">{t('Mã học sinh *')}
          <input required placeholder="HS-0912" value={form.code} onChange={set('code')} />
        </label>
        <div className="form-field">{t('Lớp *')}
          <SelectField ariaLabel={t('Lớp')} value={form.classId} onValueChange={classId => setForm({ ...form, classId })} placeholder={t('Chọn lớp')}
            options={classes.map(c => ({ value: c.id, label: c.name }))} className="w-full" />
        </div>
      </div>
      <label className="form-field">{t('Email học sinh / phụ huynh (không bắt buộc)')}
        <input type="email" placeholder="tuankiet.hoang@school.edu.vn" value={form.email} onChange={set('email')} />
      </label>
      <p className="form-hint">{t('Để học sinh đăng nhập, quản trị viên tạo tài khoản và liên kết ở màn Tài khoản.')}</p>
    </form>
  </Modal>;
}
