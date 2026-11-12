import { TeacherAnalytics } from '../components/teacher/TeacherAnalytics';

/** ?view=class&class=… or ?assessment=…&class=… choose what is shown (links from the test list use ?assessment=). */
export function AnalyticsPage() {
  return <TeacherAnalytics />;
}
