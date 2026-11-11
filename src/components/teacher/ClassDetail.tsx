import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ArrowLeft, BookOpen, CalendarDays, FileSpreadsheet, Hash, Pencil, Plus, School, TrendingUp, UsersRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { computeClassProgress } from '../../utils/assessmentLogic';
import { Button } from '../ui/Button';
import { PageHeader, StatCard } from '../ui/PageHeader';
import { StudentFormModal } from './RosterForms';
import { StudentRoster } from './StudentRoster';
import { ClassTeachersModal, TeacherNames } from './ClassTeachers';

export function ClassDetail({ classId }: { classId: string }) {
  const { classes, students, assessments, submissions, setSelectedClassId, loading, currentUser } = useApp();
  const { t } = useI18n();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTeachers, setEditingTeachers] = useState(false);
  const cls = classes.find(c => c.id === classId);

  // Opening a class also makes it the class picked in the header.
  useEffect(() => { if (cls) setSelectedClassId(cls.id); }, [cls?.id]);

  if (!cls) return <div className="page-stack">
    <div className="empty-state panel">
      <School size={32} aria-hidden="true" />
      <strong>{loading ? t('Đang tải lớp học...') : t('Không tìm thấy lớp học này')}</strong>
      <Link to="/classes" className="btn btn-secondary btn-md"><ArrowLeft size={16} aria-hidden="true" />{t('Về danh sách lớp')}</Link>
    </div>
  </div>;

  const members = students.filter(s => s.classId === cls.id);
  const progress = computeClassProgress(
    members,
    assessments.filter(a => a.classIds.includes(cls.id)),
    submissions.filter(s => members.some(m => m.id === s.studentId)),
  );

  return <div className="page-stack">
    <PageHeader icon={School} title={cls.name} description={cls.description || undefined}
      eyebrow={<Link to="/classes" className="back-link"><ArrowLeft size={14} aria-hidden="true" />{t('Tất cả lớp học')}</Link>}
      actions={<>
        <Link to={`/students/import?class=${encodeURIComponent(cls.id)}`} className="btn btn-secondary btn-md"><FileSpreadsheet size={17} aria-hidden="true" />{t('Nhập từ Excel')}</Link>
        <Button onClick={() => setIsAddOpen(true)}><Plus size={17} aria-hidden="true" />{t('Thêm học sinh')}</Button>
      </>}>
      <div className="info-chips">
        <span><BookOpen size={14} aria-hidden="true" />{cls.grade}</span>
        <span><Hash size={14} aria-hidden="true" />{cls.code}</span>
        <span><CalendarDays size={14} aria-hidden="true" />{cls.academicYear}</span>
        {currentUser?.role === 'admin'
          ? <button type="button" onClick={() => setEditingTeachers(true)} title={t('Đổi giáo viên phụ trách')} className="hover:text-indigo-700">
              <TeacherNames classroom={cls} /><Pencil size={12} aria-hidden="true" />
            </button>
          : <TeacherNames classroom={cls} />}
      </div>
    </PageHeader>

    <div className="stat-grid">
      <StatCard icon={UsersRound} label={t('Sĩ số')} value={members.length} />
      <StatCard icon={TrendingUp} label={t('Điểm TB của lớp')} value={progress.avgClassScore ? `${progress.avgClassScore} / 10` : '—'} tone="emerald" />
      <StatCard icon={BookOpen} label={t('Tỷ lệ nộp bài')} value={`${progress.completionRate}%`} tone="amber" />
      <StatCard icon={AlertTriangle} label={t('Cần bồi dưỡng')} value={progress.studentsNeedingSupport.length} tone="rose" />
    </div>

    <StudentRoster title={t('Học sinh trong lớp')} students={members} emptyText={t('Lớp chưa có học sinh. Bấm “Thêm học sinh” để bắt đầu.')} />

    {isAddOpen && <StudentFormModal defaultClassId={cls.id} onClose={() => setIsAddOpen(false)} />}
    {editingTeachers && <ClassTeachersModal classroom={cls} onClose={() => setEditingTeachers(false)} />}
  </div>;
}
