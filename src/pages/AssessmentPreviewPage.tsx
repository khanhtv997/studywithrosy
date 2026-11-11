import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, CheckCircle2, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ExamTaker } from '../components/student/ExamTaker';
import { useI18n } from '../i18n';

/** Teacher view of an assessment exactly as students take it. ?created=1 is set right after saving. */
export function AssessmentPreviewPage() {
  const { assessmentId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { assessments, classes, loading } = useApp();
  const assessment = assessments.find(a => a.id === assessmentId);
  const backToList = () => navigate('/assessments');

  if (!assessment) return <div className="grid min-h-dvh place-items-center p-4"><div className="empty-state panel max-w-md">
    <FileText size={32} aria-hidden="true" />
    <strong>{loading ? t('Đang tải bài...') : t('Không tìm thấy bài này')}</strong>
    <Link to="/assessments" className="btn btn-secondary btn-md"><ArrowLeft size={16} aria-hidden="true" />{t('Về danh sách')}</Link>
  </div></div>;

  const className = assessment.classIds.map(id => classes.find(c => c.id === id)?.name).filter(Boolean).join(', ') || t('lớp');
  return <div>
    {params.get('created') && <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-3 sm:px-8">
      <div className="flex items-center gap-3 text-sm text-emerald-900">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <span>
          <strong>{t('Đã lưu “{title}”.', { title: assessment.title })}</strong>{' '}
          {assessment.status === 'published' ? t('Bài đã được giao cho {className}.', { className }) : t('Bài đang ở trạng thái nháp, học sinh chưa thấy.')}{' '}
          {t('Dưới đây là màn học sinh sẽ thấy.')}
        </span>
      </div>
      <button type="button" onClick={backToList} className="btn btn-secondary btn-md">{t('Về danh sách đề')}</button>
    </div>}
    <ExamTaker assessment={assessment} preview onExit={backToList} onCompleted={backToList} />
  </div>;
}
