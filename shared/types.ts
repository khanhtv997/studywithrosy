/** How an answer is captured and graded. */
export type QuestionType =
  | 'multiple_choice'
  | 'fill_blank'
  | 'reading_comprehension'
  | 'sentence_transformation'
  | 'true_false'
  | 'essay';

/** The exercise as printed on the paper; see shared/exercise-formats.ts for labels and grading type. */
export type ExerciseFormat =
  | 'pronunciation' | 'stress' | 'grammar_vocab' | 'synonym' | 'antonym' | 'error_identification'
  | 'communication' | 'closest_meaning' | 'sentence_combination' | 'arrangement'
  | 'cloze' | 'reading_mc' | 'reading_true_false'
  | 'gap_fill' | 'word_form' | 'verb_form'
  | 'sentence_transformation' | 'sentence_building' | 'writing';

export type SchoolLevel = 'THCS' | 'THPT';
export type Subject = 'english';

export type Role = 'admin' | 'teacher' | 'student';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  studentId: string | null;
  active: boolean;
  /** True until the user replaces a password given to them (import, admin reset). */
  mustChangePassword: boolean;
  createdAt: string;
}

export interface Question {
  id: string;
  order: number;
  text: string;
  type: QuestionType;
  /** Exercise format; older questions have none. */
  format?: ExerciseFormat;
  options?: string[]; // for multiple_choice e.g. ["A. goes", "B. went", "C. has gone", "D. is going"]
  correctAnswer: string; // "B", "went", "T"/"F" for true_false, or a model answer for essay
  grammarTopic: string; // e.g. "Past Simple", "Conditional Type 1", "Relative Clauses", "Collocations"
  explanation: string;
  points: number; // default 1 or weighted
  readingPassage?: string; // for reading comprehension
}

export interface ClassRoom {
  id: string;
  name: string;
  grade: string; // e.g. "Lớp 9", "Lớp 10", "IELTS Foundation"
  code: string; // e.g. "ENG-9A1"
  academicYear: string;
  studentCount: number;
  description: string;
  color: string;
  /** Teachers in charge (user ids). A teacher sees only their classes; admins see all. */
  teacherIds?: string[];
}

export interface Student {
  id: string;
  name: string;
  code: string; // MSSV / Mã học sinh
  email: string;
  avatar: string;
  classId: string;
  averageScore: number;
  completedCount: number;
  totalAssigned: number;
  status: 'excellent' | 'good' | 'average' | 'needs_support';
  weakTopics: string[];
}

export type AssessmentType = 'exam' | 'homework';

export interface Assessment {
  id: string;
  title: string;
  type: AssessmentType;
  /** Only English is supported for now; older assessments have none. */
  subject?: Subject;
  level?: SchoolLevel;
  /** Classes the assessment is assigned to; may be empty while it is a draft. */
  classIds: string[];
  description: string;
  durationMinutes: number; // 0 = no time limit (for homework)
  dueDate: string;
  questions: Question[];
  totalPoints: number;
  createdAt: string;
  status: 'draft' | 'published' | 'closed';
  allowRetry?: boolean;
  /** The teacher who created it; missing on assessments made before ownership existed. */
  ownerId?: string | null;
  ownerName?: string;
  /** Set on a copy made from an assessment another teacher shared. */
  copiedFrom?: { assessmentId: string; ownerName: string };
}

export interface Submission {
  id: string;
  assessmentId: string;
  studentId: string;
  studentName: string;
  studentAvatar: string;
  submittedAt: string;
  answers: Record<string, string>; // questionId -> answer
  autoScore: number; // thang điểm 10
  finalScore: number | null; // null if not yet reviewed by teacher
  isReviewed: boolean; // MUST be true before student can see score
  teacherFeedback: string;
  status: 'pending_review' | 'published';
  timeSpentSeconds: number;
}

export interface ItemAnalysis {
  questionId: string;
  order: number;
  text: string;
  grammarTopic: string;
  correctAnswer: string;
  correctCount: number;
  incorrectCount: number;
  totalAttempts: number;
  errorRate: number; // 0 - 100%
  distractorCounts: Record<string, number>;
  mostCommonDistractor?: string;
}

export interface TopicMastery {
  topic: string;
  questionCount: number;
  totalAttempts: number;
  errorCount: number;
  accuracyRate: number; // 0 - 100%
  status: 'strong' | 'moderate' | 'weak';
  recommendation: string;
}

/* ---- API inputs: what the client sends; the server computes ids, counts and scores. ---- */

export type CreateClassInput = Pick<ClassRoom, 'name' | 'grade' | 'code' | 'academicYear'> & Partial<Pick<ClassRoom, 'description' | 'color' | 'teacherIds'>>;
export type UpdateClassInput = Partial<CreateClassInput>;

export type CreateStudentInput = Pick<Student, 'name' | 'code' | 'email' | 'classId'> & Partial<Pick<Student, 'avatar'>>;

export type CreateAssessmentInput = Pick<Assessment, 'title' | 'type' | 'classIds' | 'durationMinutes' | 'dueDate' | 'questions'>
  & Partial<Pick<Assessment, 'description' | 'status' | 'allowRetry' | 'subject' | 'level'>>;

export type UpdateAssessmentInput = Partial<CreateAssessmentInput>;

export interface OcrExamResult {
  success: boolean;
  /** Model name, or "text_parser" when the offline fallback was used. */
  source: string;
  /** answerSource tells whether the key came from the document or the AI solved it. */
  data: { title: string; detectedGrade: string; questions: (Question & { answerSource?: 'document' | 'inferred' })[] };
}

/** Choice questions are answered with an option letter; the rest with free text. */
export function isChoiceQuestion(question: Pick<Question, 'type' | 'options'>): boolean {
  // true_false and essay have their own inputs; only lettered options count here.
  return (question.type === 'multiple_choice' || question.type === 'reading_comprehension') && !!question.options?.length;
}

export type NotificationType = 'assessment_published' | 'submission_received' | 'submission_reviewed' | 'assessment_shared';

/** A teacher or admin, as other teachers see them (for sharing and class assignment). */
export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'teacher';
}

/** Who an assessment is shared with, and its share link if one was made. */
export interface AssessmentShareInfo {
  recipients: (StaffMember & { sharedAt: string })[];
  linkToken: string | null;
}

/** An assessment another teacher shared directly with the current user. */
export interface SharedAssessmentSummary {
  id: string;
  title: string;
  type: AssessmentType;
  level?: SchoolLevel;
  questionCount: number;
  totalPoints: number;
  ownerName: string;
  sharedByName: string;
  sharedAt: string;
}

/** A shared assessment opened by id (direct share) or by link token. */
export interface SharedAssessmentView {
  assessment: Assessment;
  ownerName: string;
  /** True when the current user owns it (opening their own link). */
  isOwner: boolean;
  /** Copies the current user already made from it. */
  myCopies: { id: string; title: string; createdAt: string }[];
}

export interface CopyAssessmentInput {
  classIds: string[];
  status: 'draft' | 'published';
  dueDate?: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app path to open when the notification is clicked. */
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationList {
  items: AppNotification[];
  unreadCount: number;
}

/* ---- Importing students from Excel ---- */

export interface StudentImportInput { name: string; code: string; email: string; }

/** What saving a row will do: add a new student, move one from another class, fix name/email, nothing, or skip. */
export type StudentImportAction = 'create' | 'move' | 'update' | 'unchanged' | 'error';

/** Login account for an imported student: login and first password are the student code. */
export type StudentAccountAction = 'create' | 'exists' | 'conflict' | 'none';

export interface StudentImportRow extends StudentImportInput {
  /** Row number in the spreadsheet, for messages such as "Dòng 7". */
  row: number;
  action: StudentImportAction;
  errors: string[];
  /** For "move": the class the student is in now. */
  fromClassName?: string;
  account: StudentAccountAction;
  /** The login name that is or would be used (the code, lower-case). */
  login?: string;
}

export interface StudentImportPreview {
  className: string;
  createAccounts: boolean;
  rows: StudentImportRow[];
  counts: Record<StudentImportAction, number>;
}

export interface StudentImportResult { created: number; moved: number; updated: number; unchanged: number; skipped: number; accountsCreated: number; }

/* ---- AI provider keys (admin) ---- */

/** A stored key as the admin screen sees it: never the key itself, only its last 4 characters. */
export interface AiApiKey {
  id: string;
  label: string;
  provider: 'gemini';
  keyLast4: string;
  priority: number;
  active: boolean;
  /** Skipped until this time after running out of quota or being rate limited. */
  cooldownUntil: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
}

/** message is a fixed sentence (translated in the UI); model and detail carry the variable parts. */
export interface AiKeyTestResult { ok: boolean; message: string; model?: string; detail?: string; }

/* ---- Server-side paging ---- */

/** One page of a list; `total` counts every row matching the filters. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** A submission row in the grading list, with the names the table shows. */
export type SubmissionRow = Submission & { className: string; assessmentTitle: string };
export interface SubmissionPage extends Page<SubmissionRow> {
  /** Rows per status tab under the other filters. */
  counts: { pending: number; published: number; all: number };
}

export type AssessmentRow = Assessment & { submissionCount: number; pendingCount: number };
export interface AssessmentPage extends Page<AssessmentRow> {
  /** Rows per type tab under the other filters. */
  counts: { all: number; exam: number; homework: number };
}

export type StudentRow = Student & { className: string; submittedCount: number; assignedCount: number };
export type StudentPage = Page<StudentRow>;

export interface UserPage extends Page<AppUser> {
  counts: { all: number; admin: number; teacher: number; student: number };
}

/* ---- Analytics ---- */

export interface ClassResult {
  classId: string;
  className: string;
  students: number;
  submitted: number;
  reviewed: number;
  /** Average of final scores, or auto scores where not reviewed yet; null without submissions. */
  avgScore: number | null;
  completionRate: number;
}

/** One assessment, optionally narrowed to one class. */
export interface AssessmentAnalytics {
  assessment: { id: string; title: string; type: AssessmentType; status: Assessment['status']; dueDate: string; questionCount: number; classIds: string[] };
  classId: string | null;
  totals: ClassResult & { highest: number | null; lowest: number | null };
  byClass: ClassResult[];
  items: (ItemAnalysis & { wrongStudents: { name: string; answer: string }[] })[];
  gaps: TopicMastery[];
}

export interface ClassAssessmentRow {
  assessmentId: string;
  title: string;
  type: AssessmentType;
  status: Assessment['status'];
  dueDate: string;
  questionCount: number;
  submitted: number;
  pending: number;
  avgScore: number | null;
  completionRate: number;
}

/** One class: its overall numbers and a page of its assessments. */
export interface ClassAnalytics extends Page<ClassAssessmentRow> {
  classId: string;
  className: string;
  students: number;
  assessments: number;
  avgScore: number | null;
  completionRate: number;
  needSupport: number;
}
