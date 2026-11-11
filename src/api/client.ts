import { translate } from '../i18n';
import type {
  AppUser, Assessment, ClassRoom, CreateAssessmentInput, CreateClassInput, CreateStudentInput,
  AiApiKey, AiKeyTestResult, NotificationList, OcrExamResult, Role, StudentImportInput, StudentImportPreview, StudentImportResult, Student, Submission, UpdateAssessmentInput,
  AssessmentShareInfo, CopyAssessmentInput, SharedAssessmentSummary, SharedAssessmentView, StaffMember, UpdateClassInput,
} from '../types';

export interface BootstrapData {
  classes: ClassRoom[];
  students: Student[];
  assessments: Assessment[];
  submissions: Submission[];
}

const TOKEN_KEY = 'eduassess_token';

export const authToken = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export async function apiRequest<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const token = authToken.get();
  const response = await fetch(`/api/${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message || payload?.error || `HTTP ${response.status}`;
    // Server messages are shown in the user's language (see src/i18n/vi-server.ts and en/core.ts).
    throw new Error(Array.isArray(message) ? message.map(m => translate(String(m))).join(', ') : translate(String(message)));
  }
  return payload as T;
}

/** Downloads a file from the API (with the session token) and hands it to the browser as a save. */
export async function downloadFile(path: string, fallbackName: string) {
  const token = authToken.get();
  const response = await fetch(`/api/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error(`Không tải được tệp (HTTP ${response.status})`);
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const eduApi = {
  login: (email: string, password: string) => apiRequest<{ accessToken: string; user: AppUser }>('auth/login', 'POST', { email, password }),
  me: () => apiRequest<AppUser>('auth/me'),
  changeOwnPassword: (currentPassword: string, newPassword: string) => apiRequest<AppUser>('auth/password', 'PATCH', { currentPassword, newPassword }),

  users: () => apiRequest<AppUser[]>('admin/users'),
  createUser: (data: { email: string; name: string; role: Role; password: string; studentId?: string | null }) => apiRequest<AppUser>('admin/users', 'POST', data),
  updateUser: (id: string, data: Partial<Pick<AppUser, 'email' | 'name' | 'role' | 'studentId' | 'active'>>) => apiRequest<AppUser>(`admin/users/${id}`, 'PATCH', data),
  resetPassword: (id: string, password: string) => apiRequest<{ success: boolean }>(`admin/users/${id}/password`, 'PATCH', { password }),

  /** One request for every role; the server scopes the data to the signed-in user. */
  bootstrap: () => apiRequest<BootstrapData>('bootstrap'),

  createClass: (data: CreateClassInput) => apiRequest<ClassRoom>('classes', 'POST', data),
  updateClass: (id: string, data: UpdateClassInput) => apiRequest<ClassRoom>(`classes/${encodeURIComponent(id)}`, 'PATCH', data),
  staff: () => apiRequest<StaffMember[]>('staff'),
  createStudent: (data: CreateStudentInput) => apiRequest<Student>('students', 'POST', data),
  downloadStudentTemplate: () => downloadFile('students/import/template', 'mau-danh-sach-hoc-sinh.xlsx'),
  previewStudentImport: (classId: string, fileBase64: string, createAccounts: boolean) =>
    apiRequest<StudentImportPreview>('students/import/preview', 'POST', { classId, fileBase64, createAccounts }),
  importStudents: (classId: string, rows: (StudentImportInput & { row?: number })[], createAccounts: boolean) =>
    apiRequest<StudentImportResult>('students/import', 'POST', { classId, rows, createAccounts }),
  createAssessment: (data: CreateAssessmentInput) => apiRequest<Assessment>('assessments', 'POST', data),
  updateAssessment: (id: string, data: UpdateAssessmentInput) => apiRequest<Assessment>(`assessments/${id}`, 'PATCH', data),
  deleteAssessment: (id: string) => apiRequest<{ id: string }>(`assessments/${id}`, 'DELETE'),
  // Sharing between teachers
  assessmentShares: (id: string) => apiRequest<AssessmentShareInfo>(`assessments/${encodeURIComponent(id)}/shares`),
  shareAssessment: (id: string, userIds: string[]) => apiRequest<AssessmentShareInfo>(`assessments/${encodeURIComponent(id)}/shares`, 'POST', { userIds }),
  unshareAssessment: (id: string, userId: string) => apiRequest<AssessmentShareInfo>(`assessments/${encodeURIComponent(id)}/shares/${encodeURIComponent(userId)}`, 'DELETE'),
  createShareLink: (id: string) => apiRequest<AssessmentShareInfo>(`assessments/${encodeURIComponent(id)}/share-link`, 'POST'),
  revokeShareLink: (id: string) => apiRequest<AssessmentShareInfo>(`assessments/${encodeURIComponent(id)}/share-link`, 'DELETE'),
  sharedWithMe: () => apiRequest<SharedAssessmentSummary[]>('assessments/shared-with-me'),
  openShared: (key: string) => apiRequest<SharedAssessmentView>(`assessments/shared/${encodeURIComponent(key)}`),
  copyShared: (key: string, data: CopyAssessmentInput) => apiRequest<Assessment>(`assessments/shared/${encodeURIComponent(key)}/copy`, 'POST', data),

  submit: (assessmentId: string, answers: Record<string, string>, timeSpentSeconds: number) =>
    apiRequest<Submission>('submissions', 'POST', { assessmentId, answers, timeSpentSeconds }),
  review: (id: string, finalScore: number, teacherFeedback: string) =>
    apiRequest<Submission>(`submissions/${id}/review`, 'PATCH', { finalScore, teacherFeedback }),

  aiKeys: () => apiRequest<{ keys: AiApiKey[]; models: string[] }>('admin/ai-keys'),
  createAiKey: (label: string, key: string) => apiRequest<AiApiKey>('admin/ai-keys', 'POST', { label, key }),
  updateAiKey: (id: string, data: { label?: string; key?: string; active?: boolean }) => apiRequest<AiApiKey>(`admin/ai-keys/${encodeURIComponent(id)}`, 'PATCH', data),
  deleteAiKey: (id: string) => apiRequest<{ id: string }>(`admin/ai-keys/${encodeURIComponent(id)}`, 'DELETE'),
  reorderAiKeys: (ids: string[]) => apiRequest<AiApiKey[]>('admin/ai-keys/order', 'PUT', { ids }),
  testAiKey: async (id: string): Promise<AiKeyTestResult> => {
    const result = await apiRequest<AiKeyTestResult>(`admin/ai-keys/${encodeURIComponent(id)}/test`, 'POST');
    // The server sends a fixed sentence; show it in the user's language with the variable parts appended.
    const extra = result.model ? ` (model ${result.model})` : result.detail ? ` ${result.detail}` : '';
    return { ...result, message: translate(result.message) + extra };
  },

  notifications: () => apiRequest<NotificationList>('notifications'),
  markNotificationRead: (id: string) => apiRequest<{ id: string }>(`notifications/${encodeURIComponent(id)}/read`, 'PATCH'),
  markAllNotificationsRead: () => apiRequest<{ success: boolean }>('notifications/read-all', 'PATCH'),

  ocr: (body: { rawText?: string; imageBase64?: string; mimeType?: string; examTitle?: string; gradeLevel?: string; level?: 'THCS' | 'THPT' }, signal?: AbortSignal) =>
    apiRequest<OcrExamResult>('ocr-exam', 'POST', body, signal),
  feedback: (body: unknown) => apiRequest<{ success: boolean; feedback: string }>('generate-feedback', 'POST', body),
  analysis: (body: unknown) => apiRequest<{ success: boolean; analysis: string }>('analyze-exam-gap', 'POST', body),
};
