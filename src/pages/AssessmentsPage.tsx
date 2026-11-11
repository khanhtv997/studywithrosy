import { useNavigate } from 'react-router';
import { AssessmentList } from '../components/teacher/AssessmentList';

export function AssessmentsPage() {
  const navigate = useNavigate();
  return <AssessmentList
    onOpenOcr={() => navigate('/assessments/new')}
    onSelectAssessmentForGrading={id => navigate(`/grading?assessment=${encodeURIComponent(id)}`)}
    onSelectAssessmentForAnalytics={id => navigate(`/analytics?assessment=${encodeURIComponent(id)}`)}
    onPreview={id => navigate(`/assessments/${encodeURIComponent(id)}/preview`)}
  />;
}
