import { useSearchParams } from 'react-router';
import { GradingReview } from '../components/teacher/GradingReview';

export function GradingPage() {
  const [params] = useSearchParams();
  return <GradingReview initialAssessmentId={params.get('assessment') || undefined} />;
}
