import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { FileSpreadsheet, GraduationCap, Plus, TrendingUp, UserRoundCheck, UsersRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { Button } from '../ui/Button';
import { PageHeader, StatCard } from '../ui/PageHeader';
import { SelectField } from '../ui/SelectField';
import { StudentFormModal } from './RosterForms';
import { hasGrade, StudentRoster } from './StudentRoster';

export function StudentManagement() {
  const { classes, students } = useApp();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [isAddOpen, setIsAddOpen] = useState(false);

  // The class filter lives in the URL (?class=...) so the view can be linked and survives a reload.
  const requested = params.get('class') || 'all';
  const classFilter = requested === 'all' || classes.some(c => c.id === requested) ? requested : 'all';
  const setClassFilter = (value: string) => setParams(value === 'all' ? {} : { class: value }, { replace: true });

  const visible = classFilter === 'all' ? students : students.filter(s => s.classId === classFilter);
  const graded = visible.filter(hasGrade);
  const avg = graded.length ? Math.round(graded.reduce((sum, s) => sum + s.averageScore, 0) / graded.length * 10) / 10 : null;

  return <div className="page-stack">
    <PageHeader icon={GraduationCap} title={t('Quản lý học sinh')}
      description={t('Tất cả học sinh của các lớp. Lọc theo lớp, xếp loại hoặc tìm theo tên, mã số, email.')}
      actions={<>
        <Link to={`/students/import${classFilter === 'all' ? '' : `?class=${encodeURIComponent(classFilter)}`}`} className={`btn btn-secondary btn-md ${classes.length ? '' : 'pointer-events-none opacity-50'}`}>
          <FileSpreadsheet size={17} aria-hidden="true" />{t('Nhập từ Excel')}
        </Link>
        <Button onClick={() => setIsAddOpen(true)} disabled={!classes.length}><Plus size={17} aria-hidden="true" />{t('Thêm học sinh')}</Button>
      </>} />

    <div className="stat-grid">
      <StatCard icon={UsersRound} label={classFilter === 'all' ? t('Tổng số học sinh') : t('Học sinh trong lớp')} value={visible.length} />
      <StatCard icon={UserRoundCheck} label={t('Đã có điểm')} value={graded.length} tone="emerald" />
      <StatCard icon={TrendingUp} label={t('Điểm trung bình')} value={avg === null ? '—' : `${avg} / 10`} tone="amber" />
      <StatCard icon={GraduationCap} label={t('Cần bồi dưỡng')} value={graded.filter(s => s.averageScore < 6).length} tone="rose" />
    </div>

    <StudentRoster title={t('Danh sách học sinh')} classId={classFilter} showClass={classFilter === 'all'}
      filters={<SelectField ariaLabel={t('Lọc theo lớp')} value={classFilter} onValueChange={setClassFilter} compact className="w-full sm:w-60"
        options={[{ value: 'all', label: t('Tất cả các lớp') }, ...classes.map(c => ({ value: c.id, label: c.name }))]} />} />

    {isAddOpen && <StudentFormModal defaultClassId={classFilter === 'all' ? undefined : classFilter} onClose={() => setIsAddOpen(false)} />}
  </div>;
}
