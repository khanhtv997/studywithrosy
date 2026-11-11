import { useMemo, useState } from 'react';
import { Bell, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Assessment } from '../../types';
import { Button } from '../ui/Button';
import { ClassChecklist } from '../ui/ClassMultiSelect';
import { Modal } from '../ui/Modal';
import { useI18n } from '../../i18n';

/** Chooses which classes an assessment is assigned to; a class with submissions stays ticked. */
export function AssignClassesModal({ assessment, onClose }: { assessment: Assessment; onClose: () => void }) {
  const { classes, students, submissions, updateAssessment } = useApp();
  const { t } = useI18n();
  const [classIds, setClassIds] = useState<string[]>(assessment.classIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Classes whose students already submitted cannot be removed: their work would lose its class.
  const locked = useMemo(() => {
    const classOf = new Map(students.map(s => [s.id, s.classId]));
    const counts = new Map<string, number>();
    for (const sub of submissions) {
      if (sub.assessmentId !== assessment.id) continue;
      const classId = classOf.get(sub.studentId);
      if (classId) counts.set(classId, (counts.get(classId) ?? 0) + 1);
    }
    return Object.fromEntries([...counts].map(([id, count]) => [id, t('{count} bài đã nộp', { count })]));
  }, [students, submissions, assessment.id, t]);

  const myClassIds = new Set(classes.map(c => c.id));
  const otherTeachersClasses = assessment.classIds.filter(id => !myClassIds.has(id)).length;
  const added = classIds.filter(id => !assessment.classIds.includes(id));
  const changed = added.length > 0 || assessment.classIds.some(id => myClassIds.has(id) && !classIds.includes(id));
  const publishing = assessment.status === 'published';

  const save = async () => {
    if (publishing && !classIds.length && !otherTeachersClasses) { setError(t('Bài đang giao phải có ít nhất một lớp.')); return; }
    setSaving(true);
    setError(null);
    try { await updateAssessment(assessment.id, { classIds }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setSaving(false); }
  };

  return <Modal title={t('Giao cho lớp')} subtitle={assessment.title} onClose={onClose} dismissible={!saving}
    footer={<>
      <Button variant="ghost" disabled={saving} onClick={onClose}>{t('Huỷ')}</Button>
      <Button disabled={saving || !changed} onClick={save}>{saving ? t('Đang lưu...') : t('Lưu')}</Button>
    </>}>
    <div className="form-stack">
      {error && <p role="alert" className="form-error">{error}</p>}
      <p className="text-sm text-slate-600">{t('Chọn một hoặc nhiều lớp. Mỗi lớp làm cùng một đề và cùng hạn nộp.')}</p>
      <ClassChecklist classes={classes} value={classIds} onChange={setClassIds} locked={locked} />
      {otherTeachersClasses > 0 && <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        {t('Bài còn được giao cho {count} lớp của giáo viên khác; các lớp đó giữ nguyên.', { count: otherTeachersClasses })}
      </p>}
      {Object.keys(locked).length > 0 && <p className="text-xs text-slate-500">{t('Lớp đã có bài nộp không bỏ ra được.')}</p>}
      {publishing && added.length > 0 && <p className="flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
        <Bell size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        {t('Bài đang được giao: học sinh của {count} lớp mới sẽ nhận thông báo và thấy bài ngay.', { count: added.length })}
      </p>}
    </div>
  </Modal>;
}
