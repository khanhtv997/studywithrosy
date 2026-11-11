import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { AppProvider, useApp } from './context/AppContext';
import { LanguageProvider, useI18n } from './i18n';
import { AppShell } from './layouts/AppShell';
import { ForcedPasswordChange } from './components/auth/ChangePassword';
import { FocusLayout } from './layouts/FocusLayout';
import { TakeAssessmentPage } from './pages/TakeAssessmentPage';
import { homeFor } from './layouts/navigation';
import { LoginPage } from './pages/LoginPage';
import { ClassesPage } from './pages/ClassesPage';
import { ClassDetailPage } from './pages/ClassDetailPage';
import { StudentsPage } from './pages/StudentsPage';
import { StudentImportPage } from './pages/StudentImportPage';
import { AssessmentsPage } from './pages/AssessmentsPage';
import { NewAssessmentPage } from './pages/NewAssessmentPage';
import { AssessmentPreviewPage } from './pages/AssessmentPreviewPage';
import { GradingPage } from './pages/GradingPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { UsersPage } from './pages/UsersPage';
import { AiKeysPage } from './pages/AiKeysPage';
import { StudentPage } from './pages/StudentPage';
import { SharedAssessmentPage } from './pages/SharedAssessmentPage';
import type { AppUser } from './types';

function AppLoading() {
  const { t } = useI18n();
  return <div className="app-loading-screen" role="status">{t('Đang tải EduAssess...')}</div>;
}

function LoginRoute() {
  const { currentUser, loading } = useApp();
  const location = useLocation();
  if (loading) return <AppLoading />;
  if (currentUser) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from || homeFor(currentUser.role)} replace />;
  }
  return <LoginPage />;
}

function RequireAuth() {
  const { currentUser, loading } = useApp();
  const location = useLocation();
  if (loading) return <AppLoading />;
  if (!currentUser) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  // A given password (import, admin reset) must be replaced before anything else opens.
  if (currentUser.mustChangePassword) return <ForcedPasswordChange />;
  return <Outlet />;
}

function RequireRole({ roles }: { roles: AppUser['role'][] }) {
  const { currentUser } = useApp();
  if (!currentUser || !roles.includes(currentUser.role)) return <Navigate to={currentUser ? homeFor(currentUser.role) : '/login'} replace />;
  return <Outlet />;
}

function HomeRedirect() {
  const { currentUser } = useApp();
  return <Navigate to={currentUser ? homeFor(currentUser.role) : '/login'} replace />;
}

function AppRoutes() {
  return <Routes>
    <Route path="/login" element={<LoginRoute />} />
    <Route element={<RequireAuth />}>
      <Route element={<AppShell />}>
        <Route element={<RequireRole roles={['admin', 'teacher']} />}>
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/classes/:classId" element={<ClassDetailPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/import" element={<StudentImportPage />} />
          <Route path="/assessments" element={<AssessmentsPage />} />
          <Route path="/assessments/new" element={<NewAssessmentPage />} />
          <Route path="/grading" element={<GradingPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/shared/:key" element={<SharedAssessmentPage />} />
        </Route>
        <Route element={<RequireRole roles={['admin']} />}>
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/ai-keys" element={<AiKeysPage />} />
        </Route>
        <Route element={<RequireRole roles={['student']} />}>
          <Route path="/student" element={<StudentPage />} />
        </Route>
      </Route>
      {/* Taking (or previewing) a test hides the sidebar, header and footer. */}
      <Route element={<FocusLayout />}>
        <Route element={<RequireRole roles={['student']} />}>
          <Route path="/student/assessments/:assessmentId" element={<TakeAssessmentPage />} />
        </Route>
        <Route element={<RequireRole roles={['admin', 'teacher']} />}>
          <Route path="/assessments/:assessmentId/preview" element={<AssessmentPreviewPage />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<HomeRedirect />} />
  </Routes>;
}

export default function App() {
  return <LanguageProvider><AppProvider><BrowserRouter><AppRoutes /></BrowserRouter></AppProvider></LanguageProvider>;
}
