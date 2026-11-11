import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ExamTaker } from '../components/student/ExamTaker';
import { useI18n } from '../i18n';

/** A student taking one assessment in the full-screen layout. */
export function TakeAssessmentPage() {
  const { assessmentId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { assessments, submissions, currentStudentId, loading } = useApp();
  const assessment = assessments.find(a => a.id === assessmentId);
  const submitted = submissions.some(s => s.assessmentId === assessmentId && s.studentId === currentStudentId);
  const open = assessment && assessment.status === 'published' && new Date(assessment.dueDate).getTime() >= Date.now();
  const back = () => navigate('/student');

  // The API enforces the same rules; this only explains them instead of failing on submit.
  const problem = !assessment ? (loading ? t('Đang tải bài...') : t('Không tìm thấy bài này.'))
    : !open ? t('Bài này đã đóng hoặc đã quá hạn nộp.')
    : submitted && !assessment.allowRetry ? t('Em đã nộp bài này rồi.')
    : null;

  if (problem) return <div className="grid min-h-dvh place-items-center p-4">
    <div className="empty-state panel max-w-md">
      <FileText size={32} aria-hidden="true" />
      <strong>{problem}</strong>
      <Link to="/student" className="btn btn-secondary btn-md"><ArrowLeft size={16} aria-hidden="true" />{t('Về trang của em')}</Link>
    </div>
  </div>;

  return <ExamTaker assessment={assessment!} onExit={back} onCompleted={back} />;
}
