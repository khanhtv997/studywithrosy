import { useSearchParams } from 'react-router';
import { TeacherAnalytics } from '../components/teacher/TeacherAnalytics';

export function AnalyticsPage() {
  const [params] = useSearchParams();
  return <TeacherAnalytics initialAssessmentId={params.get('assessment') || undefined} />;
}
