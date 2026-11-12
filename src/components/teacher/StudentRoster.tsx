import { useState, type ReactNode } from 'react';
import { AlertTriangle, Award, Mail, Search, UsersRound } from 'lucide-react';
import { eduApi } from '../../api/client';
import { useI18n } from '../../i18n';
import type { Student, StudentPage, StudentRow } from '../../types';
import { Pagination, useDebounced, useServerPage } from '../ui/Pagination';
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
  /** Only this class; leave out (or "all") for every class the user teaches. */
  classId?: string;
  title: string;
  /** Show the class column (the all-students screen); the class page hides it. */
  showClass?: boolean;
  /** Extra filters placed before the search box, e.g. a class picker. */
  filters?: ReactNode;
  /** Already-translated text shown when the list is empty. */
  emptyText?: string;
}

/** Searchable, filterable student table shared by the class detail and student screens; paged on the server. */
export function StudentRoster({ classId, title, showClass = false, filters, emptyText }: StudentRosterProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const q = useDebounced(query.trim());
  const filtered = q !== '' || status !== 'all';
  const pager = useServerPage<StudentRow, StudentPage>(
    (page, pageSize, signal) => eduApi.studentPage({ page, pageSize, classId, status, q }, signal),
    [classId, status, q]);
  const statusOptions = STATUS_OPTIONS.map(o => ({ value: o.value, label: t(o.label) }));

  return <section className="panel">
    <div className="panel-toolbar">
      <h2 className="panel-title">{title}<span className="count-pill">{pager.total}</span></h2>
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
          {pager.error ? (
            <tr><td colSpan={showClass ? 7 : 6} className="empty-cell"><span role="alert">{pager.error}</span></td></tr>
          ) : pager.loading && !pager.data ? (
            <tr><td colSpan={showClass ? 7 : 6} className="empty-cell"><span>{t('Đang tải...')}</span></td></tr>
          ) : pager.total === 0 ? (
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
            {showClass && <td className="max-w-[220px] truncate text-slate-700" title={s.className}>{s.className || '—'}</td>}
            <td><span className={`font-bold ${scoreTone(s)}`}>{hasGrade(s) ? `${s.averageScore} / 10` : '—'}</span></td>
            <td><StudentStatusBadge student={s} /></td>
            <td>
              <div className="flex max-w-xs flex-wrap gap-1">
                {s.weakTopics.length ? s.weakTopics.map(topic => <span key={topic} className="badge badge-danger-soft">{topic}</span>)
                  : <span className="text-[12px] italic text-slate-500">{hasGrade(s) ? t('Nắm vững kiến thức') : '—'}</span>}
              </div>
            </td>
            <td className="text-right font-semibold text-slate-700 whitespace-nowrap">
              {t('{done} / {total} bài', { done: s.submittedCount, total: s.assignedCount })}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <Pagination state={pager} unit={t('học sinh')} />
  </section>;
}
