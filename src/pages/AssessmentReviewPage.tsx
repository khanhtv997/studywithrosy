import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, FileText } from 'lucide-react';
import { AssessmentReview } from '../components/teacher/review/AssessmentReview';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';

/** Full-screen review of one assessment (highlights, notes, answers) for the teacher who owns it. */
export function AssessmentReviewPage() {
  const { assessmentId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { assessments, loading } = useApp();
  const assessment = assessments.find(a => a.id === assessmentId);

  if (!assessment) return <div className="grid min-h-dvh place-items-center p-4"><div className="empty-state panel max-w-md">
    <FileText size={32} aria-hidden="true" />
    <strong>{loading ? t('Đang tải bài...') : t('Không tìm thấy bài này')}</strong>
    <Link to="/assessments" className="btn btn-secondary btn-md"><ArrowLeft size={16} aria-hidden="true" />{t('Về danh sách')}</Link>
  </div></div>;

  return <AssessmentReview assessment={assessment} onExit={() => navigate('/assessments')} />;
}
