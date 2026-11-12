import React, { createContext, useContext, useEffect, useState } from 'react';
import type {
  AppUser, Assessment, ClassRoom, CreateAssessmentInput, CreateClassInput, CreateStudentInput,
  Role, Student, Submission, UpdateAssessmentInput,
} from '../types';
import { authToken, eduApi, SESSION_EXPIRED_EVENT, TOKEN_KEY } from '../api/client';

interface AppContextType {
  currentUser: AppUser | null; userRole: Role | null;
  login: (email: string, password: string) => Promise<void>; logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  currentStudentId: string; selectedClassId: string; setSelectedClassId: (id: string) => void;
  classes: ClassRoom[]; students: Student[]; assessments: Assessment[]; submissions: Submission[];
  loading: boolean; error: string | null; clearError: () => void; reloadData: () => Promise<void>; syncData: () => Promise<void>;
  addClass: (data: CreateClassInput) => Promise<void>;
  addStudent: (data: CreateStudentInput) => Promise<void>;
  createAssessment: (data: CreateAssessmentInput) => Promise<Assessment>;
  updateAssessment: (id: string, data: UpdateAssessmentInput) => Promise<void>;
  deleteAssessment: (id: string) => Promise<void>;
  submitAssessment: (assessmentId: string, answers: Record<string, string>, timeSpentSeconds: number) => Promise<Submission>;
  reviewSubmission: (submissionId: string, finalScore: number, teacherFeedback: string) => Promise<void>;
  activeStudent: Student | undefined; activeClass: ClassRoom | undefined; pendingReviewsCount: number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearData = () => { setClasses([]); setStudents([]); setAssessments([]); setSubmissions([]); setSelectedClassId(''); };
  const refresh = async () => {
    const data = await eduApi.bootstrap();
    setClasses(data.classes); setStudents(data.students); setAssessments(data.assessments); setSubmissions(data.submissions);
    setSelectedClassId(id => data.classes.some(item => item.id === id) ? id : data.classes[0]?.id || '');
  };

  /** Full reload with the loading strip, used by the "retry" button. */
  const reloadData = async () => {
    if (!authToken.get() || !currentUser) return;
    setLoading(true); setError(null);
    try { await refresh(); } catch (e) { setError(messageOf(e)); }
    finally { setLoading(false); }
  };
  /** Quiet background refresh, used on navigation. */
  const syncData = async () => {
    if (!currentUser) return;
    try { await refresh(); setError(null); } catch (e) { setError(messageOf(e)); }
  };

  useEffect(() => {
    const restore = async () => {
      if (!authToken.get()) { setLoading(false); return; }
      try {
        const user = await eduApi.me();
        setCurrentUser(user);
        // A user who must change a given password can reach nothing else yet (the API answers 403).
        if (!user.mustChangePassword) {
          try { await refresh(); } catch (e) { setError(messageOf(e)); }
        }
      } catch { authToken.clear(); setCurrentUser(null); clearData(); }
      finally { setLoading(false); }
    };
    void restore();
  }, []);

  // Keep tabs in step: signing out (or in as someone else) in one tab applies to all of them,
  // and a sign-in the server rejects sends this tab back to the login page.
  useEffect(() => {
    const signedOut = () => { setCurrentUser(null); clearData(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== TOKEN_KEY && event.key !== null) return;
      if (!authToken.get()) signedOut();
      else if (event.newValue && event.newValue !== event.oldValue) window.location.reload();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, signedOut);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(SESSION_EXPIRED_EVENT, signedOut); window.removeEventListener('storage', onStorage); };
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);
    const result = await eduApi.login(email, password);
    authToken.set(result.accessToken);
    if (result.user.mustChangePassword) { setCurrentUser(result.user); return; }
    try { await refresh(); setCurrentUser(result.user); }
    catch (e) { authToken.clear(); throw e; }
  };
  const changePassword = async (currentPassword: string, newPassword: string) => {
    const wasPending = currentUser?.mustChangePassword;
    const user = await eduApi.changeOwnPassword(currentPassword, newPassword);
    if (wasPending) {
      setLoading(true);
      try { await refresh(); } catch (e) { setError(messageOf(e)); } finally { setLoading(false); }
    }
    setCurrentUser(user);
  };
  const logout = () => { authToken.clear(); setCurrentUser(null); clearData(); setError(null); };

  /** Runs a mutation, then reloads data; errors go to the shared banner and are re-thrown for the caller. */
  const run = async <T,>(action: () => Promise<T>): Promise<T> => {
    try { setError(null); const result = await action(); await refresh(); return result; }
    catch (e) { setError(messageOf(e)); throw e; }
  };

  const currentStudentId = currentUser?.studentId || '';
  const value: AppContextType = {
    currentUser, userRole: currentUser?.role || null, login, logout, changePassword, currentStudentId, selectedClassId, setSelectedClassId,
    classes, students, assessments, submissions, loading, error, clearError: () => setError(null), reloadData, syncData,
    addClass: async data => { const item = await run(() => eduApi.createClass(data)); setSelectedClassId(item.id); },
    addStudent: async data => { await run(() => eduApi.createStudent(data)); },
    createAssessment: data => run(() => eduApi.createAssessment(data)),
    updateAssessment: async (id, data) => { await run(() => eduApi.updateAssessment(id, data)); },
    deleteAssessment: async id => { await run(() => eduApi.deleteAssessment(id)); },
    submitAssessment: (assessmentId, answers, timeSpentSeconds) => run(() => eduApi.submit(assessmentId, answers, timeSpentSeconds)),
    reviewSubmission: async (id, finalScore, teacherFeedback) => { await run(() => eduApi.review(id, finalScore, teacherFeedback)); },
    activeStudent: students.find(s => s.id === currentStudentId),
    activeClass: classes.find(c => c.id === selectedClassId) || classes[0],
    pendingReviewsCount: submissions.filter(s => s.status === 'pending_review').length,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => { const context = useContext(AppContext); if (!context) throw new Error('useApp must be used within an AppProvider'); return context; };
