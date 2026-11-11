import { useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, CalendarDays, ChevronRight, ClipboardCheck, GraduationCap, Plus, School, Search, TrendingUp, UsersRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import type { ClassRoom } from '../../types';
import { Button } from '../ui/Button';
import { PageHeader, StatCard } from '../ui/PageHeader';
import { Pagination, usePagination } from '../ui/Pagination';
import { ClassFormModal } from './RosterForms';
import { hasGrade } from './StudentRoster';

const average = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : null;

export function ClassList() {
  const { classes, students, assessments, submissions } = useApp();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const visible = classes.filter(c => !q || [c.name, c.code, c.grade].some(v => v.toLowerCase().includes(q)));
  const statsFor = (cls: ClassRoom) => {
    const members = students.filter(s => s.classId === cls.id);
    return {
      size: members.length,
      assigned: assessments.filter(a => a.classIds.includes(cls.id) && a.status !== 'draft').length,
      avg: average(members.filter(hasGrade).map(s => s.averageScore)),
    };
  };
  const pager = usePagination(visible, q, 12);
  const pending = submissions.filter(s => s.status === 'pending_review').length;
  const overallAvg = average(students.filter(hasGrade).map(s => s.averageScore));

  return <div className="page-stack">
    <PageHeader icon={School} title={t('Quản lý lớp học')}
      description={t('Danh sách lớp, sĩ số và kết quả chung. Chọn một lớp để xem học sinh của lớp đó.')}
      actions={<Button onClick={() => setIsCreateOpen(true)}><Plus size={17} aria-hidden="true" />{t('Thêm lớp')}</Button>} />

    <div className="stat-grid">
      <StatCard icon={School} label={t('Lớp đang quản lý')} value={classes.length} />
      <StatCard icon={UsersRound} label={t('Tổng số học sinh')} value={students.length} tone="emerald" />
      <StatCard icon={TrendingUp} label={t('Điểm TB các lớp')} value={overallAvg === null ? '—' : `${overallAvg} / 10`} tone="amber" />
      <StatCard icon={ClipboardCheck} label={t('Bài chờ duyệt')} value={pending} tone="rose" />
    </div>

    <section className="panel">
      <div className="panel-toolbar">
        <h2 className="panel-title">{t('Danh sách lớp')}<span className="count-pill">{visible.length}</span></h2>
        <div className="toolbar-controls">
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <input type="search" aria-label={t('Tìm lớp')} placeholder={t('Tìm tên lớp, mã lớp, khối...')} value={query} onChange={e => setQuery(e.target.value)} />
          </label>
        </div>
      </div>

      {visible.length === 0 ? <div className="empty-state">
        <School size={32} aria-hidden="true" />
        <strong>{classes.length ? t('Không có lớp nào khớp với tìm kiếm') : t('Chưa có lớp học nào')}</strong>
        {!classes.length && <Button onClick={() => setIsCreateOpen(true)}><Plus size={16} aria-hidden="true" />{t('Tạo lớp đầu tiên')}</Button>}
      </div> : <div className="class-grid">
        {pager.pageItems.map(cls => {
          const stats = statsFor(cls);
          return <Link key={cls.id} to={`/classes/${cls.id}`} className="class-card">
            <div className="class-card-top">
              <span className="badge badge-info">{cls.grade}</span>
              <span className="class-card-code">{cls.code}</span>
            </div>
            <h3>{cls.name}</h3>
            <p className="class-card-desc">{cls.description || t('Chưa có mô tả.')}</p>
            <dl className="class-card-stats">
              <div><dt><UsersRound size={14} aria-hidden="true" />{t('Sĩ số')}</dt><dd>{stats.size}</dd></div>
              <div><dt><BookOpen size={14} aria-hidden="true" />{t('Bài đã giao')}</dt><dd>{stats.assigned}</dd></div>
              <div><dt><GraduationCap size={14} aria-hidden="true" />{t('Điểm TB')}</dt><dd>{stats.avg ?? '—'}</dd></div>
            </dl>
            <div className="class-card-footer">
              <span><CalendarDays size={14} aria-hidden="true" />{cls.academicYear}</span>
              <span className="class-card-link">{t('Xem học sinh')}<ChevronRight size={16} aria-hidden="true" /></span>
            </div>
          </Link>;
        })}
      </div>}
      <Pagination state={pager} unit={t('lớp')} sizes={[12, 24, 48]} />
    </section>

    {isCreateOpen && <ClassFormModal onClose={() => setIsCreateOpen(false)} />}
  </div>;
}
