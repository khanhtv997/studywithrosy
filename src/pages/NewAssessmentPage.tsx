import { useNavigate } from 'react-router';
import { AssessmentComposer } from '../components/teacher/AssessmentComposer';

export function NewAssessmentPage() {
  const navigate = useNavigate();
  return <AssessmentComposer onCancel={() => navigate('/assessments')} onCreated={id => navigate(`/assessments/${encodeURIComponent(id)}/preview?created=1`)} />;
}
