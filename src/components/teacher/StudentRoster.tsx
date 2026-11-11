import { useState, type ReactNode } from 'react';
import { AlertTriangle, Award, Mail, Search, UsersRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import type { Student } from '../../types';
import { Pagination, usePagination } from '../ui/Pagination';
import { SelectField } from '../ui/SelectField';
import { StudentAvatar } from '../ui/StudentAvatar';

/** Students without a reviewed submission have no grade yet, whatever their stored status says. */
export const hasGrade = (student: Student) => student.completedCount > 0;

export function StudentStatusBadge({ student }: { student: Student }) {
  const { t } = useI18n();
  if (!hasGrade(student)) return <span className="badge badge-muted">{t('Chưa có điểm')}</span>;
  if (student.averageScore >= 8.5) return <span className="badge badge-success"><Award size={12} aria-hidden="true" />{t('Xuất sắc')}</span>;
  if (student.averageScore >= 7) return <span className="badge badge-info">{t('Khá')}</span>;
  if (student.averageScore >= 5) return <span className="badge badge-warning">{t('Trung bình')}</span>;
  return <span className="badge badge-danger"><AlertTriangle size={12} aria-hidden="true" />{t('Cần phụ đạo')}</span>;
}

const scoreTone = (s: Student) => !hasGrade(s) ? 'text-slate-500'
  : s.averageScore >= 8.5 ? 'text-emerald-600' : s.averageScore >= 7 ? 'text-indigo-600' : s.averageScore >= 5 ? 'text-amber-600' : 'text-rose-600';

type StatusFilter = 'all' | 'needs_support' | 'excellent' | 'ungraded';
// Labels are Vietnamese source text, translated where rendered.
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả xếp loại' },
  { value: 'excellent', label: 'Xuất sắc (≥ 8.5)' },
  { value: 'needs_support', label: 'Cần bồi dưỡng (< 6.0)' },
  { value: 'ungraded', label: 'Chưa có điểm' },
];

interface StudentRosterProps {
  students: Student[];
  title: string;
  /** Show the class column (the all-students screen); the class page hides it. */
  showClass?: boolean;
  /** Extra filters placed before the search box, e.g. a class picker. */
  filters?: ReactNode;
  /** Already-translated text shown when the list is empty. */
  emptyText?: string;
}

/** Searchable, filterable student table shared by the class detail and student screens. */
export function StudentRoster({ students, title, showClass = false, filters, emptyText }: StudentRosterProps) {
  const { classes, assessments, submissions } = useApp();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const q = query.trim().toLowerCase();
  const visible = students.filter(s => {
    if (q && ![s.name, s.code, s.email].some(value => value.toLowerCase().includes(q))) return false;
    if (status === 'excellent') return hasGrade(s) && s.averageScore >= 8.5;
    if (status === 'needs_support') return hasGrade(s) && s.averageScore < 6;
    if (status === 'ungraded') return !hasGrade(s);
    return true;
  });
  const assignedByClass = (classId: string) => assessments.filter(a => a.classIds.includes(classId) && a.status !== 'draft').length;
  const filtered = q !== '' || status !== 'all';
  // The parent may also change the list (e.g. the class filter), so its size and first id are part of the key.
  const pager = usePagination(visible, [q, status, students.length, students[0]?.id].join('|'));
  const statusOptions = STATUS_OPTIONS.map(o => ({ value: o.value, label: t(o.label) }));

  return <section className="panel">
    <div className="panel-toolbar">
      <h2 className="panel-title">{title}<span className="count-pill">{visible.length}</span></h2>
      <div className="toolbar-controls">
        {filters}
        <SelectField ariaLabel={t('Lọc theo xếp loại')} value={status} onValueChange={v => setStatus(v as StatusFilter)} options={statusOptions} compact className="w-full sm:w-48" />
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label={t('Tìm học sinh')} placeholder={t('Tìm tên, mã số, email...')} value={query} onChange={e => setQuery(e.target.value)} />
        </label>
      </div>
    </div>

    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('Học sinh')}</th>
            <th>{t('Mã số')}</th>
            {showClass && <th>{t('Lớp')}</th>}
            <th>{t('Điểm TB')}</th>
            <th>{t('Xếp loại')}</th>
            <th>{t('Chủ điểm còn yếu')}</th>
            <th className="text-right">{t('Đã nộp')}</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr><td colSpan={showClass ? 7 : 6} className="empty-cell">
              <UsersRound size={28} aria-hidden="true" />
              <span>{filtered ? t('Không có học sinh nào khớp với bộ lọc.') : emptyText ?? t('Chưa có học sinh nào.')}</span>
            </td></tr>
          ) : pager.pageItems.map(s => <tr key={s.id}>
            <td>
              <div className="flex items-center gap-3">
                <StudentAvatar src={s.avatar} name={s.name} className="h-9 w-9 rounded-full text-xs" />
                <div className="min-w-0">
                  <div className="font-bold text-slate-900">{s.name}</div>
                  {s.email && <div className="flex items-center gap-1 text-[12px] text-slate-500"><Mail size={12} aria-hidden="true" />{s.email}</div>}
                </div>
              </div>
            </td>
            <td className="font-mono font-semibold text-slate-700 whitespace-nowrap">{s.code}</td>
            {showClass && <td className="max-w-[220px] truncate text-slate-700" title={classes.find(c => c.id === s.classId)?.name}>{classes.find(c => c.id === s.classId)?.name || '—'}</td>}
            <td><span className={`font-bold ${scoreTone(s)}`}>{hasGrade(s) ? `${s.averageScore} / 10` : '—'}</span></td>
            <td><StudentStatusBadge student={s} /></td>
            <td>
              <div className="flex max-w-xs flex-wrap gap-1">
                {s.weakTopics.length ? s.weakTopics.map(topic => <span key={topic} className="badge badge-danger-soft">{topic}</span>)
                  : <span className="text-[12px] italic text-slate-500">{hasGrade(s) ? t('Nắm vững kiến thức') : '—'}</span>}
              </div>
            </td>
            <td className="text-right font-semibold text-slate-700 whitespace-nowrap">
              {t('{done} / {total} bài', { done: submissions.filter(sub => sub.studentId === s.id).length, total: assignedByClass(s.classId) })}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <Pagination state={pager} unit={t('học sinh')} />
  </section>;
}
