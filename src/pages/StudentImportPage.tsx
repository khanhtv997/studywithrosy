import { useNavigate, useSearchParams } from 'react-router';
import { StudentImport } from '../components/teacher/StudentImport';

export function StudentImportPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return <StudentImport initialClassId={params.get('class') || undefined}
    onDone={classId => navigate(`/classes/${encodeURIComponent(classId)}`)} />;
}
