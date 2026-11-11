import { useParams } from 'react-router';
import { ClassDetail } from '../components/teacher/ClassDetail';

export function ClassDetailPage() {
  const { classId = '' } = useParams();
  return <ClassDetail classId={classId} />;
}
